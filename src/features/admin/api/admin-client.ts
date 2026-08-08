import { parsePublicEnv } from '../../../lib/config/public-env';
import { getBrowserSupabaseClient } from '../../../lib/supabase/browser-client';

// spec §11 全部穩定碼(含 Edge protocol-level 的 SECURITY_AUDIT_UNAVAILABLE)。
// client 只把碼轉譯成文案;授權判斷一律在 PG/Edge,前端不得複製伺服端檢查
// 後信任那份複製(AGENTS.md §5)。
export const ADMIN_ERROR_CODES = [
  'STALE_PRIVILEGED_SESSION',
  'INSUFFICIENT_MFA',
  'INVITATION_INVALID',
  'LAST_ADMIN_PROTECTED',
  'RESOURCE_NOT_ALLOWED',
  'COLUMN_NOT_ALLOWED',
  'MFA_LOCKED',
  'FACTOR_BINDING_MISMATCH',
  'AUTHORIZATION_RECEIPT_INVALID',
  'IDEMPOTENCY_CONFLICT',
  'SECURITY_OPERATION_PENDING',
  'TARGET_STATE_INVALID',
  'SECURITY_AUDIT_UNAVAILABLE',
] as const;

export type AdminErrorCode = (typeof ADMIN_ERROR_CODES)[number];

export function isAdminErrorCode(value: unknown): value is AdminErrorCode {
  return (
    typeof value === 'string' &&
    (ADMIN_ERROR_CODES as readonly string[]).includes(value)
  );
}

// admin-mfa/admin-command 回應是 {outcome:'ok',...} |
// {outcome:'denied',code} | {error}(Edge protocol-level 400/503,無
// outcome)。兩種都可能帶穩定碼,統一轉譯成 AdminErrorCode;不認得的字串
// (INVALID_JSON/METHOD_NOT_ALLOWED 等純協定層錯誤,或伺服端穩定碼未來
// 領先前端常數)一律回 null,由呼叫端落到通用的非預期錯誤處理,不靜默消失。
export function extractErrorCode(response: {
  code?: string;
  error?: string;
  outcome?: string;
}): AdminErrorCode | null {
  if (response.outcome === 'denied' && isAdminErrorCode(response.code)) {
    return response.code;
  }
  return isAdminErrorCode(response.error) ? response.error : null;
}

export const ADMIN_ERROR_MESSAGES: Record<AdminErrorCode, string> = {
  AUTHORIZATION_RECEIPT_INVALID: '授權憑據無效或已使用，請重新確認後再試。',
  COLUMN_NOT_ALLOWED: '此欄位不允許這項操作。',
  FACTOR_BINDING_MISMATCH: '驗證器綁定異常，帳號已進入安全隔離，請聯絡負責人。',
  IDEMPOTENCY_CONFLICT: '相同操作代碼已用於不同內容，請重新發起操作。',
  INSUFFICIENT_MFA: '需要重新完成雙因素驗證。',
  INVITATION_INVALID: '邀請無效或已失效。',
  LAST_ADMIN_PROTECTED: '不能對最後一位有效管理員執行此操作。',
  MFA_LOCKED: '驗證失敗次數過多，帳號已暫時鎖定，請 15 分鐘後再試。',
  RESOURCE_NOT_ALLOWED: '此資源不允許這項操作。',
  SECURITY_AUDIT_UNAVAILABLE: '安全稽核暫時無法使用，操作已中止，請稍後再試。',
  SECURITY_OPERATION_PENDING: '此安全作業目前無法重新觸發。',
  STALE_PRIVILEGED_SESSION: '特權連線已逾時或失效，請重新驗證。',
  TARGET_STATE_INVALID: '目標目前的狀態不允許此操作，請重新確認目標。',
};

export type AdminCommandName =
  | 'issue_admin_invitation'
  | 'revoke_admin_invitation'
  | 'deactivate_admin'
  | 'reactivate_admin'
  | 'reset_admin_mfa'
  | 'revoke_admin_session'
  | 'admin_reveal_field'
  | 'reconcile_admin_security_operation';

export interface AdminMfaRequest {
  action: 'begin-enrollment' | 'confirm-enrollment' | 'challenge';
  challengeId?: string;
  code?: string;
  factorId?: string;
}

export interface AdminMfaResponse {
  code?: string;
  error?: string;
  factorId?: string;
  outcome?: string;
  qrUri?: string;
  refreshed?: boolean;
  sessionId?: string;
  totpSecret?: string;
}

export interface AdminCommandResponse {
  [key: string]: unknown;
  code?: string;
  error?: string;
  outcome?: string;
  result?: unknown;
}

/** Edge 回應無法讀取(網路層失敗)時拋出;不偽造任何 §11 穩定碼。 */
export class AdminClientError extends Error {
  constructor() {
    super('ADMIN_CLIENT_NETWORK');
    this.name = 'AdminClientError';
  }
}

const browserClient = () =>
  getBrowserSupabaseClient(parsePublicEnv(import.meta.env));

// supabase-js functions.invoke 對 4xx/5xx 回 error 並把 Response 掛在
// error.context;typed denial 的 body(outcome/code)就在裡面,原樣回傳
// 給呼叫端判讀,不在 client 層改寫或吞掉。
async function readFunctionResponse(response: {
  data: unknown;
  error: unknown;
}): Promise<Record<string, unknown>> {
  if (response.error === null || response.error === undefined) {
    return (response.data ?? {}) as Record<string, unknown>;
  }
  const context = (response.error as { context?: unknown }).context;
  if (context instanceof Response) {
    try {
      // clone:Response body 單次可讀,保留原件給日後的呼叫端/記錄使用
      return (await context.clone().json()) as Record<string, unknown>;
    } catch {
      throw new AdminClientError();
    }
  }
  throw new AdminClientError();
}

export async function invokeAdminMfa(
  body: AdminMfaRequest,
): Promise<AdminMfaResponse> {
  const response = await browserClient().functions.invoke('admin-mfa', {
    body,
  });
  return await readFunctionResponse(response);
}

export async function invokeAdminCommand(
  command: AdminCommandName,
  idempotencyKey: string,
  args: Record<string, unknown>,
): Promise<AdminCommandResponse> {
  const response = await browserClient().functions.invoke('admin-command', {
    body: { args, command, idempotencyKey },
  });
  return await readFunctionResponse(response);
}

// challenge action 需要 factorId 才能請求(admin-mfa 契約);這是使用者自己
// session 的 GoTrue MFA factor 列表(user-scoped,非 admin 權限),不經
// admin-mfa Edge。server 端仍會獨立比對 bound_factor_id,錯誤 factorId
// 只會導致 fail-closed 的 FACTOR_BINDING_MISMATCH,不構成信任邊界問題。
//
// null 只代表「確實查無已驗證 factor」;GoTrue 呼叫本身失敗時拋出,不能
// 兩者混為一談 —— 否則暫時性網路問題會被呼叫端誤判成「帳號沒有 factor,
// 請聯絡負責人」這種看起來永久的死路。
export async function listOwnVerifiedTotpFactorId(): Promise<string | null> {
  const { data, error } = await browserClient().auth.mfa.listFactors();
  if (error) throw new AdminClientError();
  return data.totp[0]?.id ?? null;
}

export async function adminRpc<T>(
  fn: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await browserClient().rpc(fn as never, args as never);
  if (error) throw new Error(error.message);
  return data;
}
