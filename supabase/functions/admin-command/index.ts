// supabase/functions/admin-command/index.ts
// 特權命令 orchestration(spec §6.2、§8):receipt 由 Edge 在 factor binding
// 確認後以 service path 簽發(TTL 60 秒由 DB CHECK 決定);命令本體以
// caller JWT 的 user-scoped client 呼叫 RPC。svc RPC 回傳一律嚴格三態:
// ok → 200、已確認入帳的 denied → 原樣 passthrough、其餘(RPC error/畸形
// 輸出)→ 503 SECURITY_AUDIT_UNAVAILABLE(Task 8 edge-denial 契約)。
import { createClient } from 'npm:@supabase/supabase-js@2';
import { canonicalCommandHashHex } from '../_shared/canonical.ts';
import {
  buildHashFields,
  buildRpcArgs,
  COMMAND_POLICIES,
  resolveLocator,
} from '../_shared/command-policies.ts';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import {
  auditUnavailableEnvelope,
  readDenialEnvelope,
} from '../_shared/denial-envelope.ts';
import { makeRecordAndDeny } from '../_shared/edge-denial.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const auditUnavailable = () => jsonResponse(503, auditUnavailableEnvelope());

// mint/RPC 已入帳的 typed denial 用 denied() 原樣回傳,不重複記錄;
// Edge 自身判定的 denial 用 recordAndDeny(fail-closed)。
// Task 13A-3:envelope 必須完整轉送 —— 半截或畸形的 denial 不得被當成
// 「已入帳」交給 client,一律 fail closed。
const denied = (payload: unknown, status = 403): Response => {
  const envelope = readDenialEnvelope(payload);
  if (envelope === null) return auditUnavailable();
  return jsonResponse(status, envelope);
};

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

  // exactly one-of 定址(spec §7 修訂):零個或兩個以上都無法決定該綁哪一
  // 種 canonical hash;放行等於讓 client 自選授權語意。與 DB 對畸形 row_key
  // 的處置同碼,且同交易寫入 denial audit + counter。
  const locatorResolution = resolveLocator(policy, args);
  if (!locatorResolution.ok) {
    return recordAndDeny(command, userId, 'COLUMN_NOT_ALLOWED', 403);
  }
  const locator = locatorResolution.locator;

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
    const isolate = await service.rpc('svc_admin_isolate_factor_incident', {
      p_admin_user_id: userId,
      p_correlation_id: crypto.randomUUID(),
    });
    // 隔離是緊急安全動作,結果必須誠實回報:RPC error/畸形輸出不得被
    // 當成「已隔離」直接回 denied——那會讓帳號實際上還留在可攻擊狀態,
    // 卻告訴呼叫端已經安全(spec §4.1)。已確認的 typed denial(如
    // identity 競態消失)原樣 passthrough,不重複記錄。
    if (isolate.error !== null || !isolate.data) return auditUnavailable();
    if (isolate.data.outcome === 'ok') {
      const operationId =
        typeof isolate.data.operation_id === 'string'
          ? isolate.data.operation_id
          : undefined;
      return recordAndDeny(
        command,
        userId,
        'FACTOR_BINDING_MISMATCH',
        403,
        operationId ? { operationId } : undefined,
      );
    }
    if (isolate.data.outcome === 'denied') {
      return denied(isolate.data);
    }
    return auditUnavailable();
  }

  // Activity 續期(修訂三-2):不做任何 pre-touch。續期只發生在
  // svc_admin_issue_command_receipt 成功簽發的同一交易;被拒的命令
  // 不得延長 idle 窗。

  // canonical request hash(修訂 8):正規化規則住在 command-policies.ts,
  // 與 RPC 端逐字一致。opaque row token 刻意不做任何正規化 —— 它的大小寫
  // 有意義,而且 Edge 一旦「整理」它就等於在重建 server 的定址編碼。
  const hashHex = await canonicalCommandHashHex(
    buildHashFields(policy, locator, args),
  );

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
  if (mint.outcome === 'denied') {
    return denied(mint);
  }
  if (mint.outcome !== 'issued' || typeof mint.receipt_id !== 'string') {
    return auditUnavailable();
  }

  // 命令本體:caller JWT 的 user-scoped client(spec §6.2 步驟 4)。
  // buildRpcArgs 只放行進過 hash 的欄位,因此 args 挾帶的任何額外鍵
  // (含 receipt_id/idempotency_key)都到不了 RPC;orchestration 受控參數
  // 仍最後覆寫,雙重確保 receipt 綁定不被覆蓋。
  const rpcArgs = buildRpcArgs(policy, locator, args);
  rpcArgs.p_receipt_id = mint.receipt_id;
  rpcArgs.p_idempotency_key = idempotencyKey;
  const result = await user.rpc(policy.rpc, rpcArgs);
  if (result.error !== null || !result.data) return auditUnavailable();
  const outcome = result.data as Record<string, unknown>;
  if (outcome.outcome === 'denied') {
    return denied(outcome);
  }
  if (outcome.outcome !== 'ok') return auditUnavailable();

  // reset saga step 2/3(spec §4.5):step1 成功後由同請求嘗試完成;
  // 每一步的結果都必須確認 —— GoTrue 讀取/刪除失敗或 step RPC 非 ok
  // 一律中止,不得在因子未刪除時推進 saga(維持 recovery_pending 留給
  // admin-reconcile)。GoTrue 的 per-user admin sign-out 端點在本版
  // 不存在(探針 404):PG gate 已於 step1 撤銷全部特權 session,
  // Auth session 終止列為 §4.5 已知缺口待 owner 裁定。
  if (command === 'reset_admin_mfa') {
    const operationId = asString(outcome.operation_id);
    const targetUserId = asString(outcome.target_user_id);
    if (operationId !== '' && targetUserId !== '') {
      try {
        const targetFactors = await service.auth.admin.mfa.listFactors({
          userId: targetUserId,
        });
        if (targetFactors.error === null) {
          let deletionsOk = true;
          for (const factor of targetFactors.data?.factors ?? []) {
            const removal = await service.auth.admin.mfa.deleteFactor({
              userId: targetUserId,
              id: factor.id,
            });
            if (removal.error !== null) {
              deletionsOk = false;
              break;
            }
          }
          if (deletionsOk) {
            const step2 = await service.rpc('svc_admin_complete_reset_step2', {
              p_operation_id: operationId,
            });
            const step2Data = step2.data as Record<string, unknown> | null;
            if (step2.error === null && step2Data?.outcome === 'ok') {
              // step3 失敗維持 step2_complete,由 admin-reconcile 收尾
              await service.rpc('svc_admin_complete_reset_step3', {
                p_operation_id: operationId,
              });
            }
          }
        }
      } catch {
        // 網路層例外同樣維持 recovery_pending,留給 admin-reconcile
      }
    }
  }
  return jsonResponse(200, outcome);
});
