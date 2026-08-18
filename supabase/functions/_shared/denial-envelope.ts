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
