import type { SafeCommandOutcome } from './admin-outcome';
import type { TeacherOperationStatusResult } from './teacher-account-contract';
import { adminStateLabel } from '../lib/admin-labels';

export function teacherOperationOutcome(
  status: TeacherOperationStatusResult,
): SafeCommandOutcome {
  return {
    code: null,
    requestId: status.requestId,
    operationId: status.operationId,
    retryable: false,
    kind:
      status.state === 'completed'
        ? 'completed'
        : status.state === 'compensated' || status.state === 'not_found'
          ? 'denied'
          : 'accepted',
    message:
      status.state === 'not_found'
        ? '伺服器尚未受理；請在原操作頁以相同識別碼重試。'
        : adminStateLabel(status.state) +
          '。' +
          (status.legalFollowUp === 'health_reconciliation'
            ? '請由負責人受控對帳。'
            : ''),
  };
}
