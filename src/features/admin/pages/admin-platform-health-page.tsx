import { useQuery } from '@tanstack/react-query';
import { extractErrorCode } from '../api/admin-client';
import { getAdminPlatformHealth } from '../api/admin-monitoring';
import { AdminPageLoading } from '../components/admin-page-loading';
import { AdminQueryStatus } from '../components/admin-query-status';
import { AdminStatusBanner } from '../components/admin-status-banner';
import { useAdminStaleSessionRedirect } from '../hooks/use-admin-stale-session-redirect';
import { AdminMonitorResults } from '../components/admin-monitor-results';

export function AdminPlatformHealthPage() {
  const health = useQuery({
    queryKey: ['admin', 'platform-health'],
    queryFn: getAdminPlatformHealth,
    refetchInterval: 60_000,
  });
  const code = health.data ? extractErrorCode(health.data) : null;
  useAdminStaleSessionRedirect(code === 'STALE_PRIVILEGED_SESSION');
  if (health.isPending || code === 'STALE_PRIVILEGED_SESSION')
    return (
      <AdminPageLoading title="平台監控" onRetry={() => health.refetch()} />
    );
  const metrics = health.data?.outcome === 'ok' ? health.data.metrics : [];
  return (
    <section
      className="page-wide page-stack"
      aria-labelledby="platform-health-heading"
    >
      <header className="admin-page-heading">
        <h1 id="platform-health-heading">平台監控</h1>
        <p>
          教材、課堂、發布、服務與獎勵的查核結果。每項結論以標示的檢查範圍為限。
        </p>
      </header>
      <AdminStatusBanner code={code} />
      <AdminQueryStatus query={health} />
      {health.data?.outcome === 'ok' ? (
        <AdminMonitorResults metrics={metrics} />
      ) : (
        <p role="alert">平台監控資料無法取得，請確認權限或重新整理。</p>
      )}
    </section>
  );
}
export { AdminPlatformHealthPage as Component };
