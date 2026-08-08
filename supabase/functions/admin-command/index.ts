// supabase/functions/admin-command/index.ts
// 特權命令 orchestration(spec §6.2、§8):receipt 由 Edge 在 factor binding
// 確認後以 service path 簽發(TTL 60 秒由 DB CHECK 決定);命令本體以
// caller JWT 的 user-scoped client 呼叫 RPC。svc RPC 回傳一律嚴格三態:
// ok → 200、已確認入帳的 denied → 原樣 passthrough、其餘(RPC error/畸形
// 輸出)→ 503 SECURITY_AUDIT_UNAVAILABLE(Task 8 edge-denial 契約)。
import { createClient } from 'npm:@supabase/supabase-js@2';
import { canonicalCommandHashHex } from '../_shared/canonical.ts';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { makeRecordAndDeny } from '../_shared/edge-denial.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// 完整命令政策表(spec §8.1)。args 鍵名即 RPC 參數去 p_ 前綴;
// hashFields 與 Task 7 各 RPC 的 canonical hash 欄位集合完全一致
// (reason/purpose 也綁進 hash;Codex 修訂 8)。reveal 目前僅接 uuid 形態,
// row_key 複合定址的 Edge 接線留待前端 Task 13 需要時擴充。
const COMMAND_POLICIES: Record<
  string,
  { rpc: string; freshTotp: boolean; hashFields: string[] }
> = {
  issue_admin_invitation: {
    rpc: 'issue_admin_invitation',
    freshTotp: true,
    hashFields: ['invited_email', 'reason'],
  },
  revoke_admin_invitation: {
    rpc: 'revoke_admin_invitation',
    freshTotp: true,
    hashFields: ['invitation_id', 'reason'],
  },
  deactivate_admin: {
    rpc: 'deactivate_admin',
    freshTotp: true,
    hashFields: ['target_principal_id', 'reason'],
  },
  reactivate_admin: {
    rpc: 'reactivate_admin',
    freshTotp: true,
    hashFields: ['target_principal_id', 'reason'],
  },
  reset_admin_mfa: {
    rpc: 'reset_admin_mfa',
    freshTotp: true,
    hashFields: ['target_principal_id', 'reason'],
  },
  revoke_admin_session: {
    rpc: 'revoke_admin_session',
    freshTotp: true,
    hashFields: ['session_id', 'reason'],
  },
  admin_reveal_field: {
    rpc: 'admin_reveal_field',
    freshTotp: true,
    hashFields: ['column', 'domain', 'purpose', 'resource', 'row_id'],
  },
  reconcile_admin_security_operation: {
    rpc: 'reconcile_admin_security_operation',
    freshTotp: true,
    hashFields: ['operation_id', 'reason'],
  },
};

// mint/RPC 已入帳的 typed denial 用 denied() 原樣回傳,不重複記錄;
// Edge 自身判定的 denial 用 recordAndDeny(fail-closed)。
const denied = (code: string, status = 403) =>
  jsonResponse(status, { outcome: 'denied', code });

const auditUnavailable = () =>
  jsonResponse(503, { error: 'SECURITY_AUDIT_UNAVAILABLE' });

function decodeJwtPayload(jwt: string): Record<string, unknown> {
  try {
    const [, payload] = jwt.split('.');
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return {};
  }
}

const asString = (value: unknown): string =>
  typeof value === 'string' ? value : '';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS')
    return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST')
    return jsonResponse(405, { error: 'METHOD_NOT_ALLOWED' });

  const authorization = request.headers.get('Authorization') ?? '';
  const jwt = authorization.replace(/^Bearer\s+/i, '');
  const user = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authorization } },
  });
  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
  const recordAndDeny = makeRecordAndDeny(
    service,
    'edge/admin-command',
    jsonResponse,
  );
  if (jwt === '') {
    return recordAndDeny(
      'admin_command',
      null,
      'STALE_PRIVILEGED_SESSION',
      401,
    );
  }

  const { data: userData, error: userError } = await user.auth.getUser(jwt);
  if (userError || !userData.user) {
    return recordAndDeny(
      'admin_command',
      null,
      'STALE_PRIVILEGED_SESSION',
      401,
    );
  }
  const userId = userData.user.id;
  const claims = decodeJwtPayload(jwt);
  const authSessionId = asString(claims.session_id);
  if (authSessionId === '') {
    return recordAndDeny(
      'admin_command',
      userId,
      'STALE_PRIVILEGED_SESSION',
      401,
    );
  }

  const body = (await request.json().catch(() => null)) as {
    command?: unknown;
    idempotencyKey?: unknown;
    args?: unknown;
  } | null;
  const command = asString(body?.command);
  const idempotencyKey = asString(body?.idempotencyKey);
  const policy = command !== '' ? COMMAND_POLICIES[command] : undefined;
  if (!policy || idempotencyKey === '') {
    return jsonResponse(400, { error: 'INVALID_JSON' });
  }
  const args =
    body?.args !== null &&
    typeof body?.args === 'object' &&
    !Array.isArray(body?.args)
      ? (body.args as Record<string, unknown>)
      : {};

  // server-only factor binding 確認(spec §6.2 步驟 2);不符即獨立隔離操作。
  // 隔離只由這個技術檢查觸發,絕不解析 reason/purpose 文字(硬性修正 #2)。
  // service 讀取失敗與 GoTrue listFactors 失敗一律 fail closed:讀不到
  // binding 事實時不得誤觸隔離、也不得放行。
  const identity = await service
    .from('admin_security_identities')
    .select('bound_factor_id')
    .eq('admin_user_id', userId)
    .maybeSingle();
  if (identity.error !== null) return auditUnavailable();
  const factors = await service.auth.admin.mfa.listFactors({ userId });
  if (factors.error !== null) return auditUnavailable();
  const verified = (factors.data?.factors ?? []).filter(
    (f) => f.status === 'verified',
  );
  if (
    !identity.data?.bound_factor_id ||
    verified.length !== 1 ||
    verified[0].id !== identity.data.bound_factor_id
  ) {
    await service.rpc('svc_admin_isolate_factor_incident', {
      p_admin_user_id: userId,
      p_correlation_id: crypto.randomUUID(),
    });
    return recordAndDeny(command, userId, 'FACTOR_BINDING_MISMATCH');
  }

  // Activity 續期(修訂三-2):不做任何 pre-touch。續期只發生在
  // svc_admin_issue_command_receipt 成功簽發的同一交易;被拒的命令
  // 不得延長 idle 窗。

  // canonical request hash(修訂 8):正規化規則與 RPC 端逐字一致 ——
  // reason/purpose → trim;invited_email → trim+lowercase;uuid → String。
  const fields: Record<string, string | null> = {};
  for (const field of policy.hashFields) {
    const raw = args[field];
    if (raw === null || raw === undefined) {
      fields[field] = null;
      continue;
    }
    let value = String(raw);
    if (field === 'reason' || field === 'purpose') value = value.trim();
    if (field === 'invited_email') value = value.trim().toLowerCase();
    fields[field] = value;
  }
  const hashHex = await canonicalCommandHashHex(fields);

  const receipt = await service.rpc('svc_admin_issue_command_receipt', {
    p_actor_user_id: userId,
    p_auth_session_id: authSessionId,
    p_command_name: command,
    p_idempotency_key: idempotencyKey,
    p_request_hash: `\\x${hashHex}`,
    p_verified_factor_id: identity.data.bound_factor_id,
    p_requires_fresh_totp: policy.freshTotp,
  });
  // mint 嚴格三態:issued/replayed 繼續、已入帳 denied 原樣回傳、
  // RPC error/畸形輸出 fail closed
  if (receipt.error !== null || !receipt.data) return auditUnavailable();
  const mint = receipt.data as Record<string, unknown>;
  if (mint.outcome === 'replayed') {
    return jsonResponse(200, { outcome: 'replayed', result: mint.result });
  }
  if (mint.outcome === 'denied' && typeof mint.code === 'string') {
    return denied(mint.code);
  }
  if (mint.outcome !== 'issued' || typeof mint.receipt_id !== 'string') {
    return auditUnavailable();
  }

  // 命令本體:caller JWT 的 user-scoped client(spec §6.2 步驟 4)
  const rpcArgs: Record<string, unknown> = {
    p_receipt_id: mint.receipt_id,
    p_idempotency_key: idempotencyKey,
  };
  for (const [key, value] of Object.entries(args)) rpcArgs[`p_${key}`] = value;
  const result = await user.rpc(policy.rpc, rpcArgs);
  if (result.error !== null || !result.data) return auditUnavailable();
  const outcome = result.data as Record<string, unknown>;
  if (outcome.outcome === 'denied' && typeof outcome.code === 'string') {
    return denied(outcome.code);
  }
  if (outcome.outcome !== 'ok') return auditUnavailable();

  // reset saga step 2/3(spec §4.5):step1 成功後由同請求嘗試完成;
  // 失敗留給 admin-reconcile,PG gate 已撤權。
  if (command === 'reset_admin_mfa') {
    const operationId = asString(outcome.operation_id);
    const targetUserId = asString(outcome.target_user_id);
    if (operationId !== '' && targetUserId !== '') {
      try {
        const targetFactors = await service.auth.admin.mfa.listFactors({
          userId: targetUserId,
        });
        for (const factor of targetFactors.data?.factors ?? []) {
          await service.auth.admin.mfa.deleteFactor({
            userId: targetUserId,
            id: factor.id,
          });
        }
        await service.auth.admin.signOut(targetUserId); // best-effort(spec §4.5 Step 2)
        await service.rpc('svc_admin_complete_reset_step2', {
          p_operation_id: operationId,
        });
        await service.rpc('svc_admin_complete_reset_step3', {
          p_operation_id: operationId,
        });
      } catch {
        // 維持 recovery_pending;admin-reconcile 依 operation ID 重入
      }
    }
  }
  return jsonResponse(200, outcome);
});
