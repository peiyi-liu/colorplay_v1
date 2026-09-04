// supabase/functions/admin-mfa/index.ts
// MFA orchestration boundary(spec §4.4、§5.3、§5.4):provider 驗證成功後
// 才呼叫 service-only DB path;直接 GoTrue enroll/verify 永遠拿不到
// privileged session(DB 層由 Task 5 保證)。
import { createClient } from 'npm:@supabase/supabase-js@2';
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

// DB path 已入帳的 denial(totp lock、confirm/create session 的 typed denial)
// 一律用 denied() 原樣回傳,不重複記錄;Edge 自身判定的 denial 用
// recordAndDeny(fail-closed,記錄失敗回 503)。
// Task 13A-3:§11 envelope 必須完整轉送 —— 壓成 {outcome, code} 會讓前端
// 失去可追蹤的 request_id 與 retryable 判斷依據;半截或畸形一律 fail closed。
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
    'edge/admin-mfa',
    jsonResponse,
  );
  if (jwt === '') {
    return recordAndDeny('admin_mfa', null, 'STALE_PRIVILEGED_SESSION', 401);
  }

  const { data: userData, error: userError } = await user.auth.getUser(jwt);
  if (userError || !userData.user) {
    return recordAndDeny('admin_mfa', null, 'STALE_PRIVILEGED_SESSION', 401);
  }
  const userId = userData.user.id;
  const claims = decodeJwtPayload(jwt);
  const authSessionId = asString(claims.session_id);
  if (authSessionId === '') {
    return recordAndDeny('admin_mfa', userId, 'STALE_PRIVILEGED_SESSION', 401);
  }

  const body = (await request.json().catch(() => null)) as {
    action?: unknown;
    factorId?: unknown;
    challengeId?: unknown;
    code?: unknown;
  } | null;
  const action = asString(body?.action);
  if (action === '') return jsonResponse(400, { error: 'INVALID_JSON' });

  // 鎖定檢查(spec §5.4):任何 action 前先問 service path。p_success null =
  // 純 probe(鎖定中回 MFA_LOCKED;未鎖定不累計不歸零 —— p_success=true 會
  // 歸零計數,不可作 probe,否則失敗串流每次都被清零、鎖定永不觸發)。
  const lockState = await service.rpc('svc_admin_record_totp_outcome', {
    p_admin_user_id: userId,
    p_success: null,
  });
  // probe 失敗或輸出畸形一律 fail closed(同 edge-denial 契約):
  // 鎖定狀態不明時不得放行
  if (lockState.error !== null || !lockState.data) {
    return auditUnavailable();
  }
  // MFA_LOCKED 已由 svc_admin_record_totp_outcome 入帳,原樣回傳不重複記錄
  if (lockState.data.code === 'MFA_LOCKED') return denied(lockState.data, 429);

  if (action === 'begin-enrollment') {
    // primary re-auth ≤ 5 分鐘:GoTrue amr password timestamp,不用 JWT iat(spec §4.4-1)
    const amr = Array.isArray(claims.amr)
      ? (claims.amr as Array<{ method?: unknown; timestamp?: unknown }>)
      : [];
    const password = amr.find((entry) => entry.method === 'password');
    if (
      !password ||
      typeof password.timestamp !== 'number' ||
      Date.now() / 1000 - password.timestamp > 300
    ) {
      return recordAndDeny(
        'begin_admin_mfa_enrollment',
        userId,
        'INSUFFICIENT_MFA',
      );
    }
    // verified factor 已存在 → 禁止重 enroll,走 idempotent finalize(spec §4.4-2)
    const factors = await service.auth.admin.mfa.listFactors({ userId });
    const verified = (factors.data?.factors ?? []).filter(
      (f) => f.status === 'verified',
    );
    if (verified.length > 0) {
      return recordAndDeny(
        'begin_admin_mfa_enrollment',
        userId,
        'FACTOR_BINDING_MISMATCH',
      );
    }
    for (const stale of (factors.data?.factors ?? []).filter(
      (f) => f.status !== 'verified',
    )) {
      await service.auth.admin.mfa.deleteFactor({ userId, id: stale.id });
    }
    const enroll = await user.auth.mfa.enroll({ factorType: 'totp' });
    if (enroll.error) {
      return recordAndDeny(
        'begin_admin_mfa_enrollment',
        userId,
        'FACTOR_BINDING_MISMATCH',
      );
    }
    return jsonResponse(200, {
      outcome: 'ok',
      factorId: enroll.data.id,
      totpSecret: enroll.data.totp.secret,
      qrUri: enroll.data.totp.uri,
    });
  }

  if (action === 'confirm-enrollment' || action === 'challenge') {
    const factorId = asString(body?.factorId);
    const code = asString(body?.code);
    const challengeId = asString(body?.challengeId);
    if (factorId === '' || code === '') {
      return jsonResponse(400, { error: 'INVALID_JSON' });
    }
    const challenge =
      challengeId !== ''
        ? { data: { id: challengeId }, error: null }
        : await user.auth.mfa.challenge({ factorId });
    if (challenge.error) {
      return recordAndDeny(action, userId, 'FACTOR_BINDING_MISMATCH');
    }
    const verify = await user.auth.mfa.verify({
      factorId,
      challengeId: challenge.data!.id,
      code,
    });
    if (verify.error) {
      const attempt = await service.rpc('svc_admin_record_totp_outcome', {
        p_admin_user_id: userId,
        p_success: false,
      });
      // 失敗嘗試未能入帳(RPC error/畸形輸出)→ fail closed,
      // 不得偽裝成已入帳的 denial
      if (attempt.error !== null || !attempt.data) {
        return auditUnavailable();
      }
      // 第 5 次失敗:MFA_LOCKED 已由 DB 入帳,原樣回傳;其餘失敗在此入帳
      if (attempt.data.code === 'MFA_LOCKED') return denied(attempt.data, 429);
      return recordAndDeny(action, userId, 'INSUFFICIENT_MFA', 401);
    }
    const cleared = await service.rpc('svc_admin_record_totp_outcome', {
      p_admin_user_id: userId,
      p_success: true,
    });
    if (cleared.error !== null || !cleared.data) {
      return auditUnavailable();
    }
    // probe 之後、verify 期間被並發第 5 敗鎖定(TOCTOU 窗):此回傳是鎖定
    // 的 DB 兜底,MFA_LOCKED 不得丟棄
    if (cleared.data.code === 'MFA_LOCKED') return denied(cleared.data, 429);

    // server-only factor binding 確認:恰一個 verified factor(spec §5.3)
    const factors = await service.auth.admin.mfa.listFactors({ userId });
    const verified = (factors.data?.factors ?? []).filter(
      (f) => f.status === 'verified',
    );
    if (verified.length !== 1 || verified[0].id !== factorId) {
      const isolate = await service.rpc('svc_admin_isolate_factor_incident', {
        p_admin_user_id: userId,
        p_correlation_id: crypto.randomUUID(),
      });
      // 隔離是緊急安全動作,結果必須誠實回報:RPC error/畸形輸出不得被
      // 當成「已隔離」直接回 denied——那會讓帳號實際上還留在可攻擊狀態,
      // 卻告訴呼叫端已經安全(spec §4.1)。已確認的 typed denial(如
      // identity 競態消失)原樣 passthrough,不重複記錄。
      if (isolate.error !== null || !isolate.data) {
        return auditUnavailable();
      }
      if (isolate.data.outcome === 'ok') {
        const operationId =
          typeof isolate.data.operation_id === 'string'
            ? isolate.data.operation_id
            : undefined;
        return recordAndDeny(
          action,
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

    if (action === 'confirm-enrollment') {
      // saga:Auth verify 成功後只補 identity/binding,不建 session(spec §4.4-3)
      const confirm = await service.rpc('svc_admin_confirm_enrollment', {
        p_admin_user_id: userId,
        p_verified_factor_id: factorId,
        p_operation_id: crypto.randomUUID(),
      });
      if (confirm.error === null && confirm.data?.outcome === 'ok') {
        return jsonResponse(200, { outcome: 'ok' });
      }
      // typed denial 已由 svc_admin_confirm_enrollment 入帳,原樣回傳;
      // RPC error/畸形輸出未入帳,不得偽裝成 typed denial → fail closed
      if (confirm.error === null && confirm.data?.outcome === 'denied') {
        return denied(confirm.data);
      }
      return auditUnavailable();
    }

    // challenge:既有 session 相同 auth_session_id → refresh fresh-MFA;否則建新 session
    const refresh = await service.rpc('svc_admin_refresh_session_mfa', {
      p_admin_user_id: userId,
      p_auth_session_id: authSessionId,
      p_verified_factor_id: factorId,
    });
    if (refresh.data?.outcome === 'ok') {
      return jsonResponse(200, { outcome: 'ok', refreshed: true });
    }
    const created = await service.rpc('svc_admin_create_session', {
      p_admin_user_id: userId,
      p_auth_session_id: authSessionId,
      p_verified_factor_id: factorId,
      p_device_summary: (request.headers.get('User-Agent') ?? '').slice(0, 120),
      p_correlation_id: crypto.randomUUID(),
    });
    if (created.error === null && created.data?.outcome === 'ok') {
      return jsonResponse(200, {
        outcome: 'ok',
        sessionId: created.data.session_id,
      });
    }
    // typed denial 已由 svc_admin_create_session 入帳,原樣回傳;
    // RPC error/畸形輸出未入帳,不得偽裝成 typed denial → fail closed
    if (created.error === null && created.data?.outcome === 'denied') {
      return denied(created.data);
    }
    return auditUnavailable();
  }

  return jsonResponse(400, { error: 'INVALID_JSON' });
});
