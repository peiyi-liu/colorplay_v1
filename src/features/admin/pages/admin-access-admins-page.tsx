import { useQuery, useQueryClient } from '@tanstack/react-query';
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

interface AdminIdentityRow {
  admin_user_id: string;
  audit_principal_id: string;
  created_at: string;
  failed_totp_attempts: number;
  lifecycle_version: number;
  locked_until: string | null;
  state: string;
  updated_at: string;
}

interface AdminListAdminsOk {
  outcome: 'ok';
  rows: readonly AdminIdentityRow[];
}

interface AdminOutcomeDenied {
  code?: string;
  outcome: 'denied';
}

type AdminListAdminsResponse = AdminListAdminsOk | AdminOutcomeDenied;

const ADMIN_LIST_QUERY_KEY = ['admin', 'access', 'admins'] as const;

interface PendingCommand {
  args: Record<string, unknown>;
  command: AdminCommandName;
  title: string;
}

/**
 * 身分與存取:管理員清單(spec §3.1、§8.1):列表 admin_list_admins;
 * 命令 deactivate_admin／reactivate_admin／reset_admin_mfa 一律經
 * AdminCommandDialog(reason 由 dialog 收集,這裡只負責固定
 * target_principal_id)。
 */
export function AdminAccessAdminsPage() {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<PendingCommand | null>(null);
  const list = useQuery({
    queryFn: () => adminRpc<AdminListAdminsResponse>('admin_list_admins', {}),
    queryKey: ADMIN_LIST_QUERY_KEY,
  });
  const code = list.data ? extractErrorCode(list.data) : null;
  const staleSession = code === 'STALE_PRIVILEGED_SESSION';
  useAdminStaleSessionRedirect(staleSession);

  if (list.isPending || staleSession) return <RouteLoading withinMain />;

  if (list.isError || list.data.outcome === 'denied') {
    return (
      <section
        aria-labelledby="admin-access-admins-page-heading"
        className="page-wide"
      >
        <h1 id="admin-access-admins-page-heading">管理員帳號</h1>
        {code ? (
          <AdminStatusBanner code={code} />
        ) : (
          <p role="alert">管理員清單載入失敗，請稍後重試。</p>
        )}
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
      aria-labelledby="admin-access-admins-page-heading"
      className="page-wide page-stack"
    >
      <h1 id="admin-access-admins-page-heading">管理員帳號</h1>
      {rows.length === 0 ? (
        <p>目前沒有管理員帳號。</p>
      ) : (
        <div className="ui-table-scroll">
          <table aria-label="管理員帳號" className="ui-table">
            <thead>
              <tr>
                <th scope="col">使用者</th>
                <th scope="col">狀態</th>
                <th scope="col">建立時間</th>
                <th scope="col">動作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.audit_principal_id}>
                  <td>{row.admin_user_id}</td>
                  <td>{row.state}</td>
                  <td>{new Date(row.created_at).toLocaleString('zh-TW')}</td>
                  <td>
                    <div className="admin-access-admins__actions">
                      {row.state === 'active' ? (
                        <>
                          <button
                            className="secondary-action"
                            onClick={() => {
                              setPending({
                                args: {
                                  target_principal_id: row.audit_principal_id,
                                },
                                command: 'deactivate_admin',
                                title: '停用管理員',
                              });
                            }}
                            type="button"
                          >
                            停用
                          </button>
                          <button
                            className="secondary-action"
                            onClick={() => {
                              setPending({
                                args: {
                                  target_principal_id: row.audit_principal_id,
                                },
                                command: 'reset_admin_mfa',
                                title: '重置管理員 MFA',
                              });
                            }}
                            type="button"
                          >
                            重置 MFA
                          </button>
                        </>
                      ) : null}
                      {row.state === 'deactivated' ? (
                        <button
                          className="secondary-action"
                          onClick={() => {
                            setPending({
                              args: {
                                target_principal_id: row.audit_principal_id,
                              },
                              command: 'reactivate_admin',
                              title: '重新啟用管理員',
                            });
                          }}
                          type="button"
                        >
                          重新啟用
                        </button>
                      ) : null}
                    </div>
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
              queryKey: ADMIN_LIST_QUERY_KEY,
            });
          }}
          requiresReason
          title={pending.title}
        />
      ) : null}
    </section>
  );
}

export { AdminAccessAdminsPage as Component };
