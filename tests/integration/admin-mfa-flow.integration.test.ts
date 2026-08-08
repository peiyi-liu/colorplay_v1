// tests/integration/admin-mfa-flow.integration.test.ts
// 場景:bootstrap(service)→ begin-enrollment(需 5 分鐘內 password amr)
// → confirm-enrollment → challenge 建 session → 直呼 GoTrue verify 不產生 session
// → 錯碼 5 次 → MFA_LOCKED → 鎖定中正確碼也被拒。需要 service key 與
// edge runtime,由 scripts/test-db.sh 的帶 key 區段執行。
import { createClient } from '@supabase/supabase-js';
import * as OTPAuth from 'otpauth';
import { beforeAll, describe, expect, it } from 'vitest';

// 與 admin-mfa-capability 同一 local-only 防護:缺 env 直接 throw,
// 且強制 URL 為本機 stack,避免 service key 誤打 hosted 專案。
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

describe('admin-mfa edge flow', () => {
  const email = `admin.mfa.flow.${String(Date.now())}@colorplay.test`;
  const password = 'LocalOnly-AdminMfa1!';
  let userId = '';
  let accessToken = '';
  let secret = '';
  let factorId = '';
  const service = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
  const client = createClient(url, anonKey, {
    auth: { persistSession: false },
  });

  async function invokeMfa(body: Record<string, unknown>) {
    const response = await fetch(`${url}/functions/v1/admin-mfa`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
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

  beforeAll(async () => {
    const created = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    userId = requireValue(created.data.user, 'created user').id;
    await service.rpc('svc_admin_bootstrap_identity', {
      p_user_id: userId,
      p_runbook_operation_id: crypto.randomUUID(),
    });
    const signIn = await client.auth.signInWithPassword({ email, password });
    accessToken = requireValue(
      signIn.data.session,
      'sign-in session',
    ).access_token;
  });

  it('enrolls, confirms, then creates the single privileged session', async () => {
    const begin = await invokeMfa({ action: 'begin-enrollment' });
    expect(begin.status).toBe(200);
    factorId = asStr(begin.json.factorId);
    secret = asStr(begin.json.totpSecret);
    expect(factorId).not.toBe('');
    expect(secret).not.toBe('');

    const code = () =>
      new OTPAuth.TOTP({ digits: 6, period: 30, secret }).generate();
    const confirm = await invokeMfa({
      action: 'confirm-enrollment',
      factorId,
      code: code(),
    });
    expect(asStr(confirm.json.outcome)).toBe('ok');

    const challenge = await invokeMfa({
      action: 'challenge',
      factorId,
      code: code(),
    });
    expect(asStr(challenge.json.outcome)).toBe('ok');

    const state = await client.rpc('get_admin_session_state');
    expect((state.data as { state: string }).state).toBe('privileged');
  });

  it('direct GoTrue verify alone never yields a privileged session', async () => {
    // spec §5.3:連 service_role 都不能直接寫 admin_sessions(僅 svc
    // functions 可寫)——先把這個邊界變成正向斷言,再走合法 service path
    // (factor incident isolation)撤銷全部 sessions。
    const directWrite = await service
      .from('admin_sessions')
      .update({
        revoked_at: new Date().toISOString(),
        revoke_reason: 'test_reset',
      })
      .eq('admin_user_id', userId)
      .is('revoked_at', null);
    expect(directWrite.error).not.toBeNull();
    const isolate = await service.rpc('svc_admin_isolate_factor_incident', {
      p_admin_user_id: userId,
      p_correlation_id: 'admin-mfa-flow-test-reset',
    });
    expect(isolate.error).toBeNull();
    const code = new OTPAuth.TOTP({ digits: 6, period: 30, secret }).generate();
    const challenge = await client.auth.mfa.challenge({ factorId });
    const verify = await client.auth.mfa.verify({
      factorId,
      challengeId: requireValue(challenge.data, 'gotrue challenge').id,
      code,
    });
    expect(verify.error).toBeNull();
    const state = await client.rpc('get_admin_session_state');
    expect((state.data as { state: string }).state).not.toBe('privileged');
  });

  it('locks after five consecutive failures', async () => {
    for (let index = 0; index < 5; index += 1) {
      await invokeMfa({ action: 'challenge', factorId, code: '000000' });
    }
    const locked = await invokeMfa({
      action: 'challenge',
      factorId,
      code: '000000',
    });
    expect(asStr(locked.json.code)).toBe('MFA_LOCKED');
  });

  it('rejects even a correct code while locked, before touching the provider', async () => {
    // 鎖定中的 pre-action probe 必須在 provider verify 之前就拒絕(429)
    const code = new OTPAuth.TOTP({ digits: 6, period: 30, secret }).generate();
    const locked = await invokeMfa({ action: 'challenge', factorId, code });
    expect(locked.status).toBe(429);
    expect(asStr(locked.json.code)).toBe('MFA_LOCKED');
  });
});
