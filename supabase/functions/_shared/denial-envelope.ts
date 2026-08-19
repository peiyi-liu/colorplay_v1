// supabase/functions/_shared/denial-envelope.ts
// spec §11(2026-08-09 owner 追加)的 denial response envelope。DB 與 Edge
// 共用同一 allowlist,只有五個欄位:outcome／code／message／request_id／
// retryable。Edge 不得自行編造 message、不得壓縮欄位,也不得放行畸形輸出。

export interface DenialEnvelope {
  outcome: 'denied';
  code: string;
  message: string;
  request_id: string;
  retryable: boolean;
}

// spec §11 全部穩定碼(含 Edge protocol-level 的 SECURITY_AUDIT_UNAVAILABLE)。
// 與 DB 的 admin_internal_denial_message 及前端 admin-client.ts 的
// ADMIN_ERROR_CODES 各自獨立維護同一份清單 —— 三層互不信任是這個系統的
// 設計原則,不是重複。Edge 若不做這道檢查,DB／Edge 版本不同步時(例如
// DB 新增了一個 Edge 尚未認得的碼,或 DB 端 bug)可能讓未知碼夾帶任意
// message／retryable 直接穿透給前端(2026-08-19 review 修正,Medium)。
const KNOWN_DENIAL_CODES = new Set([
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
]);

// 與 DB admin_internal_denial_message('SECURITY_AUDIT_UNAVAILABLE') 逐字
// 相同:同一個碼不得因為來源不同而出現兩種文案。
const AUDIT_UNAVAILABLE_MESSAGE =
  '安全稽核暫時無法使用，操作已中止，請稍後再試。';

/**
 * 嚴格讀取 DB 回傳的 denial envelope。任何欄位缺漏或型別不符都回 null,
 * 由呼叫端 fail closed —— 半截的 envelope 不得被當成「已入帳的 denial」
 * 轉給 client。
 */
export function readDenialEnvelope(
  value: unknown,
  expectedCode?: string,
): DenialEnvelope | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const payload = value as Record<string, unknown>;
  if (payload.outcome !== 'denied') return null;
  if (typeof payload.code !== 'string' || payload.code === '') return null;
  if (!KNOWN_DENIAL_CODES.has(payload.code)) return null;
  if (expectedCode !== undefined && payload.code !== expectedCode) return null;
  if (typeof payload.message !== 'string' || payload.message === '')
    return null;
  if (typeof payload.request_id !== 'string' || payload.request_id === '') {
    return null;
  }
  if (typeof payload.retryable !== 'boolean') return null;
  return {
    outcome: 'denied',
    code: payload.code,
    message: payload.message,
    request_id: payload.request_id,
    retryable: payload.retryable,
  };
}

/**
 * Edge 自身的 protocol-level failure(spec §11:503)。
 *
 * request_id 只是本次請求的 correlation ID —— 這條路徑之所以存在,正是
 * 因為 durable audit 無法確認寫入,所以**不得**被解讀成 denial audit 的
 * 主鍵;client 只能拿它跟 Edge log 對帳。
 */
export function auditUnavailableEnvelope(): DenialEnvelope {
  return {
    outcome: 'denied',
    code: 'SECURITY_AUDIT_UNAVAILABLE',
    message: AUDIT_UNAVAILABLE_MESSAGE,
    request_id: crypto.randomUUID(),
    retryable: true,
  };
}
