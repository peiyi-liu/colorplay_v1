// tests/integration/admin-command-saga.integration.test.ts
// 場景:idempotent replay、60 秒 TTL 逾時、reset saga 端到端、
// 並發互踢 last-admin 保護、reconcile secret 保護。需要 service key 與
// edge runtime,由 scripts/test-db.sh 的帶 key 區段執行(含真實 61 秒等待)。
import { createClient } from '@supabase/supabase-js';
import * as OTPAuth from 'otpauth';
import { beforeAll, describe, expect, it } from 'vitest';

const readLocalEnvironment = () => {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey || !serviceKey) throw new Error('LOCAL_ENV_MISSING');

  const parsedUrl = new URL(url);
  if (
    parsedUrl.protocol !== 'http:' ||
    parsedUrl.hostname !== '127.0.0.1' ||
    parsedUrl.port !== '54321'
  ) {
    throw new Error('LOCAL_ENV_INVALID');
  }

  return { anonKey, serviceKey, url } as const;
};

const { anonKey, serviceKey, url } = readLocalEnvironment();

function requireValue<T>(value: T | null | undefined, label: string): T {
  if (value === null || value === undefined) {
    throw new Error(`missing ${label}`);
  }
  return value;
}

const asStr = (value: unknown): string =>
  typeof value === 'string' ? value : '';

const service = createClient(url, serviceKey, {
  auth: { persistSession: false },
});

interface AdminActor {
  userId: string;
  principalId: string;
  accessToken: string;
  authSessionId: string;
}

function jwtClaim(token: string, claim: string): string {
  const payload = token.split('.')[1] ?? '';
  const decoded: unknown = JSON.parse(
    atob(payload.replace(/-/g, '+').replace(/_/g, '/')),
  );
  return asStr((decoded as Record<string, unknown>)[claim]);
}

async function invokeEdge(fn: string, token: string, body: unknown) {
  const response = await fetch(`${url}/functions/v1/${fn}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    json: (await response.json()) as Record<string, unknown>,
  };
}

// 完整 provision:bootstrap → UI 等效 enroll/confirm/challenge(經 admin-mfa)
async function provisionAdmin(tag: string): Promise<AdminActor> {
  const email = `admin.saga.${tag}.${String(Date.now())}@colorplay.test`;
  const password = 'LocalOnly-AdminSaga1!';
  const created = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  const userId = requireValue(created.data.user, `${tag} user`).id;
  await service.rpc('svc_admin_bootstrap_identity', {
    p_user_id: userId,
    p_runbook_operation_id: crypto.randomUUID(),
  });
  const client = createClient(url, anonKey, {
    auth: { persistSession: false },
  });
  const signIn = await client.auth.signInWithPassword({ email, password });
  const accessToken = requireValue(
    signIn.data.session,
    `${tag} session`,
  ).access_token;
  const begin = await invokeEdge('admin-mfa', accessToken, {
    action: 'begin-enrollment',
  });
  const factorId = asStr(begin.json.factorId);
  const totpSecret = asStr(begin.json.totpSecret);
  if (factorId === '' || totpSecret === '') {
    throw new Error(`${tag} enrollment failed`);
  }
  const code = () =>
    new OTPAuth.TOTP({ digits: 6, period: 30, secret: totpSecret }).generate();
  await invokeEdge('admin-mfa', accessToken, {
    action: 'confirm-enrollment',
    factorId,
    code: code(),
  });
  await invokeEdge('admin-mfa', accessToken, {
    action: 'challenge',
    factorId,
    code: code(),
  });
  const identity = await service
    .from('admin_security_identities')
    .select('audit_principal_id')
    .eq('admin_user_id', userId)
    .single();
  return {
    userId,
    principalId: asStr(
      requireValue(identity.data, `${tag} identity`).audit_principal_id,
    ),
    accessToken,
    authSessionId: jwtClaim(accessToken, 'session_id'),
  };
}

function runCommand(
  actor: AdminActor,
  commandName: string,
  idempotencyKey: string,
  args: Record<string, unknown>,
) {
  return invokeEdge('admin-command', actor.accessToken, {
    command: commandName,
    idempotencyKey,
    args,
  });
}

describe('admin-command saga, replay and concurrency', () => {
  let adminA: AdminActor;
  let adminB: AdminActor;
  let adminC: AdminActor;

  beforeAll(async () => {
    adminA = await provisionAdmin('a');
    adminB = await provisionAdmin('b');
    adminC = await provisionAdmin('c');
  }, 180_000);

  it('idempotent replay returns the original redacted result once', async () => {
    const key = crypto.randomUUID();
    const email = `invitee.${String(Date.now())}@colorplay.test`;
    const args = { invited_email: email, reason: '新任管理員到職需要開通權限' };
    const first = await runCommand(adminA, 'issue_admin_invitation', key, args);
    expect(asStr(first.json.outcome)).toBe('ok');
    const token = asStr(first.json.invitation_token);
    expect(token).not.toBe('');
    const replay = await runCommand(
      adminA,
      'issue_admin_invitation',
      key,
      args,
    );
    expect(asStr(replay.json.outcome)).toBe('replayed');
    expect(JSON.stringify(replay.json)).not.toContain(token);
    const rows = await service
      .from('admin_invitations')
      .select('id')
      .eq('invited_email', email);
    expect(requireValue(rows.data, 'invitation rows')).toHaveLength(1);
  }, 30_000);

  it('expired receipt is rejected after the fixed 60-second ttl', async () => {
    // TTL 不可配置,因此真實等待 61 秒;直呼 mint+RPC 模擬 Edge 逾時。
    const reason = '逾時測試需要足夠長的理由';
    const hash = await service.rpc('svc_admin_canonical_hash_hex', {
      p_fields: { reason, session_id: '00000000-0000-0000-0000-000000000001' },
    });
    const binding = await service
      .from('admin_security_identities')
      .select('bound_factor_id')
      .eq('admin_user_id', adminA.userId)
      .single();
    const boundFactorId = asStr(
      requireValue(binding.data, 'admin a binding').bound_factor_id,
    );
    const receipt = await service.rpc('svc_admin_issue_command_receipt', {
      p_actor_user_id: adminA.userId,
      p_auth_session_id: adminA.authSessionId,
      p_command_name: 'revoke_admin_session',
      p_idempotency_key: crypto.randomUUID(),
      p_request_hash: `\\x${asStr(hash.data)}`,
      p_verified_factor_id: boundFactorId,
      p_requires_fresh_totp: true,
    });
    const receiptData = receipt.data as Record<string, unknown> | null;
    expect(asStr(receiptData?.outcome)).toBe('issued');
    await new Promise((resolve) => setTimeout(resolve, 61_000));
    const userClient = createClient(url, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${adminA.accessToken}` } },
    });
    const result = await userClient.rpc('revoke_admin_session', {
      p_receipt_id: asStr(receiptData?.receipt_id),
      p_idempotency_key: crypto.randomUUID(),
      p_session_id: '00000000-0000-0000-0000-000000000001',
      p_reason: reason,
    });
    expect(asStr((result.data as Record<string, unknown> | null)?.code)).toBe(
      'AUTHORIZATION_RECEIPT_INVALID',
    );
  }, 90_000);

  it('reset_admin_mfa completes the cross-system saga end to end', async () => {
    const result = await runCommand(
      adminA,
      'reset_admin_mfa',
      crypto.randomUUID(),
      {
        target_principal_id: adminC.principalId,
        reason: '例行安全演練重置目標管理員因子',
      },
    );
    expect(asStr(result.json.outcome)).toBe('ok');
    const identity = await service
      .from('admin_security_identities')
      .select('state, bound_factor_id')
      .eq('admin_user_id', adminC.userId)
      .single();
    expect(requireValue(identity.data, 'target identity')).toEqual({
      state: 'active_pending_mfa',
      bound_factor_id: null,
    });
    const factors = await service.auth.admin.mfa.listFactors({
      userId: adminC.userId,
    });
    expect(requireValue(factors.data, 'target factors').factors).toHaveLength(
      0,
    );
    const sessions = await service
      .from('admin_sessions')
      .select('id')
      .eq('admin_user_id', adminC.userId)
      .is('revoked_at', null);
    expect(requireValue(sessions.data, 'target sessions')).toHaveLength(0);
    const operation = await service
      .from('admin_security_operations')
      .select('id, state')
      .eq('operation_type', 'reset_admin_mfa')
      .eq('target_principal_id', adminC.principalId)
      .single();
    const operationRow = requireValue(operation.data, 'reset operation');
    const operationId = asStr(operationRow.id);
    expect(asStr(operationRow.state)).toBe('completed');

    // saga step 重入安全:completed 後重呼 step2/step3 為 no-op,不改狀態
    await service.rpc('svc_admin_complete_reset_step2', {
      p_operation_id: operationId,
    });
    await service.rpc('svc_admin_complete_reset_step3', {
      p_operation_id: operationId,
    });
    const recheck = await service
      .from('admin_security_operations')
      .select('state')
      .eq('id', operationRow.id)
      .single();
    expect(requireValue(recheck.data, 'operation recheck').state).toBe(
      'completed',
    );
  }, 60_000);

  it('concurrent mutual deactivation never reaches zero active admins', async () => {
    const [first, second] = await Promise.all([
      runCommand(adminA, 'deactivate_admin', crypto.randomUUID(), {
        target_principal_id: adminB.principalId,
        reason: '並發互踢測試甲方停用乙方',
      }),
      runCommand(adminB, 'deactivate_admin', crypto.randomUUID(), {
        target_principal_id: adminA.principalId,
        reason: '並發互踢測試乙方停用甲方',
      }),
    ]);
    const outcomes = [first.json, second.json];
    expect(
      outcomes.filter((entry) => asStr(entry.outcome) === 'ok'),
    ).toHaveLength(1);
    expect(
      outcomes.filter(
        (entry) =>
          asStr(entry.code) === 'LAST_ADMIN_PROTECTED' ||
          asStr(entry.code) === 'STALE_PRIVILEGED_SESSION' ||
          asStr(entry.code) === 'AUTHORIZATION_RECEIPT_INVALID',
      ),
    ).toHaveLength(1);
    const active = await service
      .from('admin_security_identities')
      .select('admin_user_id')
      .eq('state', 'active');
    expect(
      requireValue(active.data, 'active admins').length,
    ).toBeGreaterThanOrEqual(1);
  }, 30_000);

  it('admin-reconcile rejects callers without the deploy secret', async () => {
    const response = await fetch(`${url}/functions/v1/admin-reconcile`, {
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(response.status).toBe(401);
  });
});
