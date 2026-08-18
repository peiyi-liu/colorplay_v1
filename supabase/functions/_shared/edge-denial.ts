// supabase/functions/_shared/edge-denial.ts
// Edge 自身判定的預期 denial 統一入帳(Codex 修訂三-1、四-2)。
// 只有在 recorder 回傳完整、碼相符的 §11 envelope 時,才以 typed denial
// 回應;記錄失敗或輸出畸形一律 fail closed 回 503 SECURITY_AUDIT_UNAVAILABLE,
// 不得偽稱「已入帳的預期 denial」。
//
// Task 13A-3:recorder 現在回的是完整 envelope(outcome／code／message／
// request_id／retryable),Edge 必須原樣轉送而非重建成 {outcome, code} ——
// 壓縮欄位會讓前端失去可追蹤的 request_id 與 retryable 判斷依據。
import {
  auditUnavailableEnvelope,
  readDenialEnvelope,
} from './denial-envelope.ts';

type RecorderResult = {
  data: unknown;
  error: { message: string } | null;
};

export type EdgeDenialRecorder = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<RecorderResult>;
};

export function makeRecordAndDeny(
  service: EdgeDenialRecorder,
  resourceKey: string,
  jsonResponse: (status: number, body: unknown) => Response,
) {
  return async function recordAndDeny(
    action: string,
    adminUserId: string | null,
    code: string,
    status = 403,
    // 選填的額外欄位(如 factor incident 的 operationId,spec §3.3 的可追蹤
    // ID),只在 record 確認入帳後才併入回應;fail-closed 的 503 分支絕不
    // 帶出這些欄位。
    extra?: Record<string, unknown>,
  ): Promise<Response> {
    const recorded = await service.rpc('svc_admin_record_edge_denial', {
      p_resource_key: resourceKey,
      p_code: code,
      p_action: action,
      p_admin_user_id: adminUserId,
    });
    if (recorded.error !== null) {
      return jsonResponse(503, auditUnavailableEnvelope());
    }
    const envelope = readDenialEnvelope(recorded.data, code);
    if (envelope === null) {
      return jsonResponse(503, auditUnavailableEnvelope());
    }
    return jsonResponse(status, { ...envelope, ...extra });
  };
}
