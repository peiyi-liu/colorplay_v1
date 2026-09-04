import { useQuery } from '@tanstack/react-query';

import { RouteLoading } from '../../../app/boundaries/route-loading';
import { StatTile } from '../../../components/ui/stat-tile';
import { adminRpc, extractErrorCode } from '../api/admin-client';
import { AdminStatusBanner } from '../components/admin-status-banner';
import { useAdminStaleSessionRedirect } from '../hooks/use-admin-stale-session-redirect';

interface AdminHealthOperation {
  attempt_count: number;
  correlation_id: string | null;
  created_at: string;
  current_step: string | null;
  id: string;
  last_safe_error_code: string | null;
  next_retry_at: string | null;
  operation_type: string;
  state: string;
  target_principal_id: string | null;
  updated_at: string;
}

interface AdminHealthDenial {
  count: number;
  resource_key: string;
  safe_reason_code: string;
  window_ends_at: string;
  window_started_at: string;
}

interface AdminHealthIncidents {
  denial_threshold_breaches: number;
  locked_identities: number;
  stuck_operations: number;
}

interface AdminHealthSummaryOk {
  denials: readonly AdminHealthDenial[];
  incidents: AdminHealthIncidents;
  operations: readonly AdminHealthOperation[];
  outcome: 'ok';
}

interface AdminOutcomeDenied {
  code?: string;
  outcome: 'denied';
}

type AdminHealthSummaryResponse = AdminHealthSummaryOk | AdminOutcomeDenied;

interface AdminSessionRow {
  id: string;
  revoked_at: string | null;
}

interface AdminSessionsOk {
  outcome: 'ok';
  rows: readonly AdminSessionRow[];
}

type AdminSessionsResponse = AdminSessionsOk | AdminOutcomeDenied;

function useAdminHealthSummary() {
  return useQuery({
    queryFn: () =>
      adminRpc<AdminHealthSummaryResponse>('admin_health_summary', {}),
    queryKey: ['admin', 'health-summary'],
  });
}

function useAdminSessionsList() {
  return useQuery({
    queryFn: () => adminRpc<AdminSessionsResponse>('admin_list_sessions', {}),
    queryKey: ['admin', 'sessions'],
  });
}

/**
 * 安全總覽(spec §3.1、§8.3、§11):sessions/pending operations/denial
 * windows/incident 旗標,資料源 admin_health_summary + admin_list_sessions。
 * Stale session 導向 challenge 並保留 return intent(spec §3.3),經共用
 * useAdminStaleSessionRedirect,不在此頁另外發明過期/重試迴圈。
 */
export function AdminOverviewPage() {
  const health = useAdminHealthSummary();
  const sessions = useAdminSessionsList();

  const healthCode = health.data ? extractErrorCode(health.data) : null;
  const sessionsCode = sessions.data ? extractErrorCode(sessions.data) : null;
  const staleSession =
    healthCode === 'STALE_PRIVILEGED_SESSION' ||
    sessionsCode === 'STALE_PRIVILEGED_SESSION';

  useAdminStaleSessionRedirect(staleSession);

  if (health.isPending || sessions.isPending || staleSession) {
    return <RouteLoading withinMain />;
  }

  if (
    health.isError ||
    sessions.isError ||
    health.data.outcome === 'denied' ||
    sessions.data.outcome === 'denied'
  ) {
    const code = healthCode ?? sessionsCode;
    return (
      <section
        aria-labelledby="admin-overview-page-heading"
        className="page-wide"
      >
        <h1 id="admin-overview-page-heading">安全總覽</h1>
        {code ? (
          <AdminStatusBanner code={code} />
        ) : (
          <p role="alert">安全總覽資料載入失敗，請稍後重試。</p>
        )}
        <button
          className="secondary-action"
          onClick={() => {
            void health.refetch();
            void sessions.refetch();
          }}
          type="button"
        >
          重試
        </button>
      </section>
    );
  }

  const healthData = health.data;
  const sessionsData = sessions.data;
  const activeSessionCount = sessionsData.rows.filter(
    (row) => row.revoked_at === null,
  ).length;
  const { incidents } = healthData;
  const hasIncidents =
    incidents.stuck_operations > 0 ||
    incidents.denial_threshold_breaches > 0 ||
    incidents.locked_identities > 0;

  return (
    <section
      aria-labelledby="admin-overview-page-heading"
      className="page-wide page-stack"
    >
      <h1 id="admin-overview-page-heading">安全總覽</h1>
      <div className="admin-overview__stats">
        <StatTile
          label="有效管理員連線"
          value={`${String(activeSessionCount)} 位有效管理員連線`}
        />
        <StatTile
          label="待處理作業"
          value={`${String(healthData.operations.length)} 個待處理作業`}
        />
        <StatTile
          label="denial 觀察窗"
          value={`${String(healthData.denials.length)} 個 denial 觀察窗`}
        />
      </div>

      {hasIncidents ? (
        <div
          aria-label="安全事故旗標"
          className="admin-overview__incidents"
          role="region"
        >
          <h2>安全事故旗標</h2>
          <ul>
            <li>卡住的作業：{incidents.stuck_operations}</li>
            <li>denial 門檻突破：{incidents.denial_threshold_breaches}</li>
            <li>鎖定中的身分：{incidents.locked_identities}</li>
          </ul>
        </div>
      ) : null}

      <section aria-labelledby="admin-overview-operations-heading">
        <h2 id="admin-overview-operations-heading">待處理安全作業</h2>
        {healthData.operations.length === 0 ? (
          <p>目前沒有待處理的安全作業。</p>
        ) : (
          <div className="ui-table-scroll">
            <table aria-label="待處理安全作業" className="ui-table">
              <thead>
                <tr>
                  <th scope="col">類型</th>
                  <th scope="col">狀態</th>
                  <th scope="col">目前步驟</th>
                  <th scope="col">重試次數</th>
                  <th scope="col">更新時間</th>
                </tr>
              </thead>
              <tbody>
                {healthData.operations.map((operation) => (
                  <tr key={operation.id}>
                    <td>{operation.operation_type}</td>
                    <td>{operation.state}</td>
                    <td>{operation.current_step ?? '—'}</td>
                    <td>{operation.attempt_count}</td>
                    <td>
                      {new Date(operation.updated_at).toLocaleString('zh-TW')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}

export { AdminOverviewPage as Component };
