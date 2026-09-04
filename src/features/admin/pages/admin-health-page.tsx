import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { RouteLoading } from '../../../app/boundaries/route-loading';
import { adminRpc, extractErrorCode } from '../api/admin-client';
import { AdminCommandDialog } from '../components/admin-command-dialog';
import { AdminStatusBanner } from '../components/admin-status-banner';
import { useAdminStaleSessionRedirect } from '../hooks/use-admin-stale-session-redirect';
import { formatAdminTimestamp } from '../lib/admin-time';

interface AdminHealthOperation {
  action_kind: 'manual_retry' | 'owner_oob' | 'pending' | 'reconcile';
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
  denials_truncated: boolean;
  incidents: AdminHealthIncidents;
  operations: readonly AdminHealthOperation[];
  operations_truncated: boolean;
  outcome: 'ok';
}

interface AdminOutcomeDenied {
  code?: string;
  outcome: 'denied';
  request_id?: string;
  retryable?: boolean;
}

type AdminHealthSummaryResponse = AdminHealthSummaryOk | AdminOutcomeDenied;

const HEALTH_QUERY_KEY = ['admin', 'health-summary'] as const;

/**
 * Phase 1 控制面健康摘要(spec §3.2、§8.3、§11):operations、denial 聚合、
 * incident 清單與合法 follow-up 操作。所有命令一律經 AdminCommandDialog
 * (理由 ≥10 字、fresh TOTP、receipt),頁面不直接呼叫命令。
 */
export function AdminHealthPage() {
  const queryClient = useQueryClient();
  const [reconcileTarget, setReconcileTarget] = useState<string | null>(null);

  const health = useQuery({
    queryFn: () =>
      adminRpc<AdminHealthSummaryResponse>('admin_health_summary', {}),
    queryKey: HEALTH_QUERY_KEY,
  });

  const code = health.data ? extractErrorCode(health.data) : null;
  const staleSession = code === 'STALE_PRIVILEGED_SESSION';
  useAdminStaleSessionRedirect(staleSession);
  const response = health.data;

  if (health.isPending || staleSession) return <RouteLoading withinMain />;

  if (health.isError || !response || response.outcome === 'denied') {
    const denied: AdminOutcomeDenied | null =
      response?.outcome === 'denied' ? response : null;
    const canRetry = !denied || denied.retryable === true;
    return (
      <section
        aria-labelledby="admin-health-page-heading"
        className="page-wide page-stack"
      >
        <h1 id="admin-health-page-heading">系統健康</h1>
        {code ? (
          <AdminStatusBanner code={code} />
        ) : (
          <p role="alert">系統健康資料載入失敗，請稍後重試。</p>
        )}
        {typeof denied?.request_id === 'string' ? (
          <p>追蹤代碼：{denied.request_id}</p>
        ) : null}
        {canRetry ? (
          <button
            className="secondary-action"
            onClick={() => {
              void health.refetch();
            }}
            type="button"
          >
            重試
          </button>
        ) : null}
      </section>
    );
  }

  const {
    denials,
    denials_truncated: denialsTruncated,
    incidents,
    operations,
    operations_truncated: operationsTruncated,
  } = response;
  const hasIncidents =
    incidents.stuck_operations > 0 ||
    incidents.denial_threshold_breaches > 0 ||
    incidents.locked_identities > 0;

  return (
    <section
      aria-labelledby="admin-health-page-heading"
      className="page-wide page-stack"
    >
      <h1 id="admin-health-page-heading">系統健康</h1>

      {hasIncidents ? (
        <div
          aria-label="安全事故"
          className="admin-overview__incidents"
          role="region"
        >
          <h2>安全事故</h2>
          <ul>
            <li>卡住的作業：{incidents.stuck_operations}</li>
            <li>denial 門檻突破：{incidents.denial_threshold_breaches}</li>
            <li>鎖定中的身分：{incidents.locked_identities}</li>
          </ul>
        </div>
      ) : null}

      <section aria-labelledby="admin-health-operations-heading">
        <h2 id="admin-health-operations-heading">安全作業</h2>
        {operations.length === 0 ? (
          <p>目前沒有進行中的安全作業。</p>
        ) : (
          <div className="ui-table-scroll admin-data-table__scroll">
            <table aria-label="安全作業" className="ui-table">
              <thead>
                <tr>
                  <th scope="col">作業 ID</th>
                  <th scope="col">類型</th>
                  <th scope="col">狀態</th>
                  <th scope="col">目前步驟</th>
                  <th scope="col">嘗試次數</th>
                  <th scope="col">最後安全錯誤碼</th>
                  <th scope="col">後續處理</th>
                </tr>
              </thead>
              <tbody>
                {operations.map((operation) => (
                  <tr key={operation.id}>
                    <td>{operation.id}</td>
                    <td>{operation.operation_type}</td>
                    <td>{operation.state}</td>
                    <td>{operation.current_step ?? '—'}</td>
                    <td>{operation.attempt_count}</td>
                    <td>{operation.last_safe_error_code ?? '—'}</td>
                    <td>
                      {operation.action_kind === 'reconcile' ||
                      operation.action_kind === 'manual_retry' ? (
                        <button
                          className="secondary-action"
                          onClick={() => {
                            setReconcileTarget(operation.id);
                          }}
                          type="button"
                        >
                          {operation.action_kind === 'manual_retry'
                            ? '授權一次人工重試'
                            : '觸發重新對帳'}
                        </button>
                      ) : operation.action_kind === 'pending' ? (
                        <span>已授權，等待服務處理</span>
                      ) : (
                        <span>需負責人依 runbook 處理</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {operationsTruncated ? <p>僅顯示最近 50 筆安全作業。</p> : null}
      </section>

      <section aria-labelledby="admin-health-denials-heading">
        <h2 id="admin-health-denials-heading">Denial 聚合（近 24 小時）</h2>
        {denials.length === 0 ? (
          <p>近 24 小時沒有 denial。</p>
        ) : (
          <div className="ui-table-scroll admin-data-table__scroll">
            <table aria-label="denial 聚合" className="ui-table">
              <thead>
                <tr>
                  <th scope="col">資源</th>
                  <th scope="col">安全原因碼</th>
                  <th scope="col">次數</th>
                  <th scope="col">窗口結束</th>
                </tr>
              </thead>
              <tbody>
                {denials.map((denial) => (
                  <tr key={`${denial.resource_key}:${denial.safe_reason_code}`}>
                    <td>{denial.resource_key}</td>
                    <td>{denial.safe_reason_code}</td>
                    <td>{denial.count}</td>
                    <td>{formatAdminTimestamp(denial.window_ends_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {denialsTruncated ? <p>僅顯示前 50 筆 denial 聚合。</p> : null}
      </section>

      {reconcileTarget !== null ? (
        <AdminCommandDialog
          args={{ operation_id: reconcileTarget }}
          command="reconcile_admin_security_operation"
          onCancel={() => {
            setReconcileTarget(null);
          }}
          onSettled={() => {
            setReconcileTarget(null);
            void queryClient.invalidateQueries({ queryKey: HEALTH_QUERY_KEY });
          }}
          requiresReason
          title="觸發安全作業重新對帳"
        />
      ) : null}
    </section>
  );
}

export { AdminHealthPage as Component };
