import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { RouteLoading } from '../../../app/boundaries/route-loading';
import {
  adminRpc,
  extractErrorCode,
  type AdminCommandName,
} from '../api/admin-client';
import { AdminCommandDialog } from '../components/admin-command-dialog';
import { AdminStatusBanner } from '../components/admin-status-banner';
import { useAdminStaleSessionRedirect } from '../hooks/use-admin-stale-session-redirect';
import { formatAdminTimestamp } from '../lib/admin-time';

interface AdminSessionRow {
  absolute_expires_at: string;
  admin_user_id: string;
  audit_principal_id: string;
  correlation_id: string | null;
  created_at: string;
  device_summary: string | null;
  id: string;
  last_activity_at: string;
  last_totp_verified_at: string;
  revoke_reason: string | null;
  revoked_at: string | null;
}

interface AdminListSessionsOk {
  next_cursor?: string | null;
  outcome: 'ok';
  rows: readonly AdminSessionRow[];
}

interface AdminOutcomeDenied {
  code?: string;
  outcome: 'denied';
  request_id?: string;
  retryable?: boolean;
}

type AdminListSessionsResponse = AdminListSessionsOk | AdminOutcomeDenied;

const SESSIONS_QUERY_KEY = ['admin', 'access', 'sessions'] as const;

interface PendingCommand {
  args: Record<string, unknown>;
  command: AdminCommandName;
  title: string;
}

/**
 * 身分與存取:session 清單(spec §3.1、§5.1、§8.1):列表 admin_list_sessions;
 * revoke_admin_session 只對未撤銷的 session 提供動作,經 AdminCommandDialog
 * 收集 reason。
 */
export function AdminAccessSessionsPage() {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<PendingCommand | null>(null);
  const list = useInfiniteQuery({
    getNextPageParam: (lastPage: AdminListSessionsResponse) =>
      lastPage.outcome === 'ok' ? (lastPage.next_cursor ?? null) : null,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      adminRpc<AdminListSessionsResponse>('admin_list_sessions', {
        p_cursor: pageParam,
      }),
    queryKey: SESSIONS_QUERY_KEY,
  });
  const firstPage = list.data?.pages[0];
  const laterDenied = list.data?.pages
    .slice(1)
    .find((page) => page.outcome === 'denied');
  const code = firstPage
    ? (extractErrorCode(firstPage) ??
      (laterDenied ? extractErrorCode(laterDenied) : null))
    : null;
  const staleSession = code === 'STALE_PRIVILEGED_SESSION';
  useAdminStaleSessionRedirect(staleSession);

  if (list.isPending || staleSession) return <RouteLoading withinMain />;

  if (list.isError || !firstPage || firstPage.outcome === 'denied') {
    const denied = firstPage?.outcome === 'denied' ? firstPage : null;
    const canRetry = !denied || denied.retryable === true;
    return (
      <section
        aria-labelledby="admin-access-sessions-page-heading"
        className="page-wide"
      >
        <h1 id="admin-access-sessions-page-heading">特權連線</h1>
        {code ? (
          <AdminStatusBanner code={code} />
        ) : (
          <p role="alert">Session 清單載入失敗，請稍後重試。</p>
        )}
        {typeof denied?.request_id === 'string' ? (
          <p>追蹤代碼：{denied.request_id}</p>
        ) : null}
        {canRetry ? (
          <button
            className="secondary-action"
            onClick={() => {
              void list.refetch();
            }}
            type="button"
          >
            重試
          </button>
        ) : null}
      </section>
    );
  }

  const rows = list.data.pages.flatMap((page) =>
    page.outcome === 'ok' ? page.rows : [],
  );

  return (
    <section
      aria-labelledby="admin-access-sessions-page-heading"
      className="page-wide page-stack"
    >
      <h1 id="admin-access-sessions-page-heading">特權連線</h1>
      {rows.length === 0 ? (
        <p>目前沒有 admin session。</p>
      ) : (
        <div className="ui-table-scroll">
          <table aria-label="特權連線" className="ui-table">
            <thead>
              <tr>
                <th scope="col">裝置</th>
                <th scope="col">建立時間</th>
                <th scope="col">最後活動</th>
                <th scope="col">撤銷原因</th>
                <th scope="col">動作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.device_summary ?? '—'}</td>
                  <td>{formatAdminTimestamp(row.created_at)}</td>
                  <td>{formatAdminTimestamp(row.last_activity_at)}</td>
                  <td>{row.revoke_reason ?? '—'}</td>
                  <td>
                    {row.revoked_at === null ? (
                      <button
                        className="secondary-action"
                        onClick={() => {
                          setPending({
                            args: { session_id: row.id },
                            command: 'revoke_admin_session',
                            title: '撤銷特權連線',
                          });
                        }}
                        type="button"
                      >
                        撤銷
                      </button>
                    ) : null}
                    <details>
                      <summary>查看詳細資料</summary>
                      <dl>
                        <div>
                          <dt>Audit principal</dt>
                          <dd>{row.audit_principal_id}</dd>
                        </div>
                        <div>
                          <dt>Correlation ID</dt>
                          <dd>{row.correlation_id ?? '—'}</dd>
                        </div>
                        <div>
                          <dt>絕對到期</dt>
                          <dd>
                            {formatAdminTimestamp(row.absolute_expires_at)}
                          </dd>
                        </div>
                        <div>
                          <dt>撤銷時間</dt>
                          <dd>
                            {row.revoked_at
                              ? formatAdminTimestamp(row.revoked_at)
                              : '—'}
                          </dd>
                        </div>
                      </dl>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {list.hasNextPage ? (
        <button
          className="secondary-action"
          disabled={list.isFetchingNextPage}
          onClick={() => {
            void list.fetchNextPage();
          }}
          type="button"
        >
          載入更多 Session
        </button>
      ) : null}

      {laterDenied ? (
        <div className="admin-data-browser__page-error">
          <AdminStatusBanner code={extractErrorCode(laterDenied)} />
          {typeof laterDenied.request_id === 'string' ? (
            <p>追蹤代碼：{laterDenied.request_id}</p>
          ) : null}
          {laterDenied.retryable === true ? (
            <button
              className="secondary-action"
              onClick={() => void list.refetch()}
              type="button"
            >
              重試載入更多
            </button>
          ) : null}
        </div>
      ) : null}

      {pending ? (
        <AdminCommandDialog
          args={pending.args}
          command={pending.command}
          onCancel={() => {
            setPending(null);
          }}
          onSettled={() => {
            setPending(null);
            void queryClient.invalidateQueries({
              queryKey: SESSIONS_QUERY_KEY,
            });
          }}
          requiresReason
          title={pending.title}
        />
      ) : null}
    </section>
  );
}

export { AdminAccessSessionsPage as Component };
