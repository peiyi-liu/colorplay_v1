import {
  ADMIN_ERROR_MESSAGES,
  isAdminErrorCode,
  type AdminCommandName,
  type AdminErrorCode,
} from './admin-client';

export function safeTraceId(value: unknown): string | null {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(
      value,
    )
    ? value
    : null;
}
export function safeRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export interface SafeCommandOutcome {
  kind: 'completed' | 'accepted' | 'denied' | 'unknown';
  message: string;
  retryable: boolean;
  code: AdminErrorCode | null;
  requestId: string | null;
  operationId: string | null;
}
const RESULTS: Partial<Record<AdminCommandName, readonly [string, string]>> = {
  deactivate_admin: ['deactivated', '管理員已停用。'],
  reactivate_admin: [
    'active_pending_mfa',
    '管理員已恢復，仍需完成雙因素驗證。',
  ],
  revoke_admin_session: ['revoked', '特權連線已撤銷。'],
  issue_admin_invitation: ['issued', '邀請已建立。'],
  revoke_admin_invitation: ['revoked', '邀請已撤銷。'],
  admin_reveal_field: ['revealed', '欄位揭露已核准。'],
  create_teacher_account: ['created', '教師帳號已建立。'],
  update_teacher_account: ['updated', '教師資料已更新。'],
  reset_teacher_password: ['password_reset', '教師密碼已重設。'],
};
export function commandOutcome(
  command: AdminCommandName,
  value: unknown,
): SafeCommandOutcome {
  const envelope = safeRecord(value);
  const replayed = envelope.outcome === 'replayed';
  const result = replayed ? safeRecord(envelope.result) : envelope;
  const code = isAdminErrorCode(envelope.code)
    ? envelope.code
    : isAdminErrorCode(envelope.error)
      ? envelope.error
      : null;
  const base: SafeCommandOutcome = {
    kind: 'unknown',
    message: '尚無法確認操作結果。請先查核狀態，系統不會自動重送。',
    retryable: false,
    code,
    requestId:
      safeTraceId(envelope.request_id) ?? safeTraceId(result.request_id),
    operationId:
      safeTraceId(envelope.operationId) ?? safeTraceId(result.operation_id),
  };
  if (envelope.outcome === 'denied' || envelope.error !== undefined) {
    return {
      ...base,
      kind: 'denied',
      message: code
        ? ADMIN_ERROR_MESSAGES[code]
        : '目前無法執行此操作，請聯絡負責人。',
      retryable: code !== null && envelope.retryable === true,
    };
  }
  if (envelope.outcome !== 'ok' && !replayed) return base;
  if (
    (command === 'reset_admin_mfa' && result.result === 'recovery_pending') ||
    (command === 'reconcile_admin_security_operation' &&
      result.result === 'reconcile_requested')
  ) {
    return {
      ...base,
      kind: 'accepted',
      message: '請求已受理，作業仍待處理。請到系統健康查看後續狀態。',
    };
  }
  const expected = RESULTS[command];
  if (expected && result.result === expected[0])
    return {
      ...base,
      kind: 'completed',
      message: replayed ? `此操作先前已完成。${expected[1]}` : expected[1],
    };
  return base;
}
