import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { extractErrorCode } from '../api/admin-client';
import {
  getAdminPlatformHealth,
  type PlatformMetric,
} from '../api/admin-monitoring';
import { AdminPageLoading } from '../components/admin-page-loading';
import { AdminQueryStatus } from '../components/admin-query-status';
import { AdminStatusBanner } from '../components/admin-status-banner';
import { useAdminStaleSessionRedirect } from '../hooks/use-admin-stale-session-redirect';
import { MONITOR_GROUPS } from '../lib/admin-monitor-labels';
import { formatAdminTimestamp } from '../lib/admin-time';

function Metric({
  metric,
  title,
  description,
}: Readonly<{
  metric: PlatformMetric | undefined;
  title: string;
  description: string;
}>) {
  const status = metric?.status ?? 'unknown';
  const labels = {
    ok: '本項檢查通過',
    attention: '需查核',
    unknown: '尚無資料',
    stale: '資料已過期',
  };
  return (
    <li className="admin-monitor__metric">
      <div className="admin-monitor__metric-heading">
        <h3>{title}</h3>
        <span
          className={'admin-monitor__state admin-monitor__state--' + status}
        >
          {labels[status]}
        </span>
      </div>
      <p>{description}</p>
      {metric?.value != null && metric.sample_count != null ? (
        <strong>
          {metric.value} 筆異常／{metric.sample_count} 筆檢查
        </strong>
      ) : null}
      {metric?.failed_count != null &&
      metric.sample_count != null &&
      metric.sample_count > 0 ? (
        <p>
          HTTP 失敗：{metric.failed_count}／{metric.sample_count}（
          {((metric.failed_count / metric.sample_count) * 100).toFixed(1)}%）
        </p>
      ) : null}
      {title === '供應商備份新鮮度' && metric?.observed_at ? (
        <p>最近備份：{formatAdminTimestamp(metric.observed_at)}</p>
      ) : null}
      {metric?.signal.endsWith('_http') ? (
        <p>
          來源延遲 p95：
          {metric.p95_ms == null
            ? '尚無有效樣本'
            : metric.p95_ms.toFixed(0) + ' ms'}
        </p>
      ) : null}
      {metric?.revision ? (
        <p>
          部署版本：<code>{metric.revision.slice(0, 12)}</code>
        </p>
      ) : null}
      {metric?.evidence_run_id ? (
        <a
          href={
            'https://github.com/peiyi-liu/colorplay_v1/actions/runs/' +
            String(metric.evidence_run_id)
          }
          target="_blank"
          rel="noreferrer"
        >
          查看驗證作業
        </a>
      ) : null}
      <small>
        {metric
          ? (metric.source === 'database' ? '資料庫查核' : '受信任採集') +
            ' · 最近檢查：' +
            formatAdminTimestamp(metric.checked_at)
          : '尚未取得此項目的受信任資料。'}
      </small>
      {metric?.window_started_at && metric.observed_at ? (
        <small>
          觀測時間：{formatAdminTimestamp(metric.window_started_at)} ～{' '}
          {formatAdminTimestamp(metric.observed_at)}
        </small>
      ) : null}
    </li>
  );
}
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
      <header>
        <h1 id="platform-health-heading">平台監控</h1>
        <p>
          教材、課堂、發布、服務與獎勵的查核結果。每項結論以標示的檢查範圍為限。
        </p>
      </header>
      <AdminStatusBanner code={code} />
      <AdminQueryStatus query={health} />
      {health.data?.outcome === 'ok' ? (
        <>
          <p>
            資料庫查核每分鐘更新；外部採集超過 45
            分鐘未更新會標示過期。尚無資料不代表正常。
          </p>
          <div className="admin-monitor__grid">
            {MONITOR_GROUPS.map((group) => (
              <section
                className="admin-monitor__group"
                key={group.title}
                aria-label={group.title}
              >
                <h2>{group.title}</h2>
                <p>{group.description}</p>
                <ul>
                  {group.signals.map(([signal, title, description]) => (
                    <Metric
                      key={signal}
                      title={title}
                      description={description}
                      metric={metrics.find((m) => m.signal === signal)}
                    />
                  ))}
                </ul>
                <p className="admin-monitor__action">{group.action}</p>
                <Link to={group.href}>前往查核 →</Link>
              </section>
            ))}
          </div>
        </>
      ) : (
        <p role="alert">平台監控資料無法取得，請確認權限或重新整理。</p>
      )}
    </section>
  );
}
export { AdminPlatformHealthPage as Component };
