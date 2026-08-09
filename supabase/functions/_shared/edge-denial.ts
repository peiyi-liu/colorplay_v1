// supabase/functions/_shared/edge-denial.ts
// Edge 自身判定的預期 denial 統一入帳(Codex 修訂三-1、四-2)。
// 只有在 recorder 確認 audit+counter 已提交(error=null 且 outcome='denied'
// 且 code 相符)時,才以 typed denial 回應;記錄失敗或輸出畸形一律 fail
// closed 回 503 SECURITY_AUDIT_UNAVAILABLE,不得偽稱「已入帳的預期 denial」。
type RecorderResult = {
  data: { outcome?: string; code?: string } | null;
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
    // 選填的額外欄位(如 factor incident 的 operationId),只在 record 確認
    // 入帳後才併入回應;fail-closed 的 503 分支絕不帶出這些欄位。
    extra?: Record<string, unknown>,
  ): Promise<Response> {
    const recorded = await service.rpc('svc_admin_record_edge_denial', {
      p_resource_key: resourceKey,
      p_code: code,
      p_action: action,
      p_admin_user_id: adminUserId,
    });
    if (
      recorded.error !== null ||
      recorded.data?.outcome !== 'denied' ||
      recorded.data?.code !== code
    ) {
      return jsonResponse(503, { error: 'SECURITY_AUDIT_UNAVAILABLE' });
    }
    return jsonResponse(status, { outcome: 'denied', code, ...extra });
  };
}
