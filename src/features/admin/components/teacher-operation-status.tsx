import { Link } from 'react-router-dom';
import type { TeacherOperationStatusResult } from '../api/teacher-account-contract';
import { adminStateLabel } from '../lib/admin-labels';
import { AdminTrace } from './admin-trace';
export function TeacherOperationStatus({
  status,
  busy,
  onRetry,
  onCheck,
}: Readonly<{
  status: TeacherOperationStatusResult;
  busy: boolean;
  onRetry: () => void;
  onCheck: () => void;
}>) {
  return (
    <section
      aria-label="教師作業狀態"
      className="admin-teachers__operation-status"
    >
      <AdminTrace value={status.requestId} />
      <AdminTrace label="作業代碼" value={status.operationId} />
      {status.legalFollowUp === 'retry_same_request' ? (
        <>
          <p role="status">伺服器尚未受理這次操作，可使用原操作代碼重試。</p>
          <button
            className="secondary-action"
            type="button"
            disabled={busy}
            onClick={onRetry}
          >
            以相同代碼重試
          </button>
        </>
      ) : null}
      {status.legalFollowUp === 'wait' ? (
        <>
          <p role="status">作業仍在處理中。</p>
          <button
            className="secondary-action"
            type="button"
            disabled={busy}
            onClick={onCheck}
          >
            重新查詢狀態
          </button>
        </>
      ) : null}
      {status.legalFollowUp === 'health_reconciliation' ? (
        <p role="status">
          作業需要受控對帳。<Link to="/admin/health">前往健康狀態</Link>
        </p>
      ) : null}
      {status.legalFollowUp === 'none' ? (
        <p role="status">{adminStateLabel(status.state)}，不會再次重送。</p>
      ) : null}
    </section>
  );
}
