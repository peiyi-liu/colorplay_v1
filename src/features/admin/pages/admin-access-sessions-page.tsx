import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { RouteLoading } from '../../../app/boundaries/route-loading';
import { adminRpc, type AdminCommandName } from '../api/admin-client';
import { AdminCommandDialog } from '../components/admin-command-dialog';

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
  outcome: 'ok';
  rows: readonly AdminSessionRow[];
}

interface AdminOutcomeDenied {
  code?: string;
  outcome: 'denied';
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
  const list = useQuery({
    queryFn: () =>
      adminRpc<AdminListSessionsResponse>('admin_list_sessions', {}),
    queryKey: SESSIONS_QUERY_KEY,
  });

  if (list.isPending) return <RouteLoading />;

  if (list.isError || list.data.outcome === 'denied') {
    return (
      <section
        aria-labelledby="admin-access-sessions-page-heading"
        className="page-wide"
      >
        <h1 id="admin-access-sessions-page-heading">特權連線</h1>
        <p role="alert">Session 清單載入失敗，請稍後重試。</p>
        <button
          className="secondary-action"
          onClick={() => {
            void list.refetch();
          }}
          type="button"
        >
          重試
        </button>
      </section>
    );
  }

  const rows = list.data.rows;

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
                  <td>{new Date(row.created_at).toLocaleString('zh-TW')}</td>
                  <td>
                    {new Date(row.last_activity_at).toLocaleString('zh-TW')}
                  </td>
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
