import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { adminRpc, extractErrorCode } from '../api/admin-client';
import { AdminPageLoading } from '../components/admin-page-loading';
import { AdminQueryStatus } from '../components/admin-query-status';
import { AdminStatusBanner } from '../components/admin-status-banner';
import { AdminTrace } from '../components/admin-trace';
import { useAdminStaleSessionRedirect } from '../hooks/use-admin-stale-session-redirect';

interface Summary {
  outcome: 'ok';
  incidents: {
    stuck_operations: number;
    locked_identities: number;
    denial_threshold_breaches: number;
  };
  operations: readonly unknown[];
  operations_truncated?: boolean;
}
interface Denied {
  outcome: 'denied';
  code?: string;
  retryable?: boolean;
  request_id?: string;
}

export function AdminOverviewPage() {
  const health = useQuery({
    queryKey: ['admin', 'health-summary'],
    queryFn: () => adminRpc<Summary | Denied>('admin_health_summary', {}),
  });
  const code = health.data ? extractErrorCode(health.data) : null;
  const stale = code === 'STALE_PRIVILEGED_SESSION';
  useAdminStaleSessionRedirect(stale);
  if (health.isPending || stale)
    return (
      <AdminPageLoading title="安全總覽" onRetry={() => health.refetch()} />
    );
  const response = health.data;
  if (!response || response.outcome === 'denied')
    return (
      <section className="page-wide page-stack">
        <h1>安全總覽</h1>
        {code ? (
          <AdminStatusBanner code={code} />
        ) : (
          <p role="alert">安全總覽資料載入失敗，請稍後重試。</p>
        )}
        <AdminTrace value={response?.request_id} />
        {!response || response.retryable === true ? (
          <button
            className="secondary-action"
            type="button"
            onClick={() => void health.refetch()}
          >
            重試
          </button>
        ) : null}
      </section>
    );
  const { incidents } = response;
  const hasIncidents = Object.values(incidents).some((count) => count > 0);
  return (
    <section
      aria-labelledby="admin-overview-page-heading"
      className="page-wide page-stack"
    >
      <h1 id="admin-overview-page-heading">安全總覽</h1>
      <p>先查看需要注意的安全狀態，再進入對應工作。</p>
      <AdminQueryStatus query={health} />
      {hasIncidents ? (
        <section
          aria-label="安全事故旗標"
          className="admin-overview__incidents"
        >
          <h2>需要注意</h2>
          <ul>
            <li>卡住的作業：{incidents.stuck_operations}</li>
            <li>
              拒絕次數達門檻的觀察窗：{incidents.denial_threshold_breaches}
            </li>
            <li>鎖定中的身分：{incidents.locked_identities}</li>
          </ul>
          <Link to="/admin/health">查看作業與合法處理方式 →</Link>
        </section>
      ) : (
        <section>
          <h2>目前沒有安全事故旗標</h2>
          <p>這是安全控制面的查詢結果，不代表所有服務的健康狀態。</p>
        </section>
      )}
      <section>
        <h2>安全作業</h2>
        <p>
          {response.operations.length === 0
            ? '目前沒有待處理的安全作業。'
            : response.operations_truncated
              ? '有待處理作業；系統健康僅顯示最近 50 筆。'
              : '有待處理作業，請查看目前狀態與下一步。'}
        </p>
        {response.operations.length > 0 ? (
          <Link to="/admin/health">前往系統健康</Link>
        ) : null}
      </section>
      <nav className="admin-overview__links" aria-label="常用管理工作">
        <Link to="/admin/teachers">
          <strong>教師帳號 →</strong>
          <span>查詢、建立與更新教師資料</span>
        </Link>
        <Link to="/admin/access/sessions">
          <strong>特權連線 →</strong>
          <span>檢查装置活動與撤銷狀態</span>
        </Link>
        <Link to="/admin/audit">
          <strong>稽核紀錄 →</strong>
          <span>查核操作時間、對象與結果</span>
        </Link>
      </nav>
    </section>
  );
}
export { AdminOverviewPage as Component };
