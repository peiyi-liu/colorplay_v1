import { safeTraceId } from '../api/admin-outcome';
import { zodResolver } from '@hookform/resolvers/zod';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { AdminPageLoading } from '../components/admin-page-loading';
import { AdminQueryStatus } from '../components/admin-query-status';
import {
  adminRpc,
  extractErrorCode,
  type AdminCommandName,
  type AdminCommandResponse,
} from '../api/admin-client';
import { AdminCommandDialog } from '../components/admin-command-dialog';
import { AdminStatusBanner } from '../components/admin-status-banner';
import { useAdminStaleSessionRedirect } from '../hooks/use-admin-stale-session-redirect';

interface AdminInvitationRow {
  accepted_at: string | null;
  accepted_principal_id: string | null;
  created_at: string;
  expires_at: string;
  id: string;
  invited_email: string;
  issuer_principal_id: string;
  revoked_at: string | null;
  status: string;
}

interface AdminListInvitationsOk {
  next_cursor?: string | null;
  outcome: 'ok';
  rows: readonly AdminInvitationRow[];
}

interface AdminOutcomeDenied {
  code?: string;
  outcome: 'denied';
  request_id?: string;
  retryable?: boolean;
}

type AdminListInvitationsResponse = AdminListInvitationsOk | AdminOutcomeDenied;

const INVITATIONS_QUERY_KEY = ['admin', 'access', 'invitations'] as const;

const emailSchema = z.object({
  invited_email: z.email('請輸入有效的 Email'),
});
type EmailFormValues = z.infer<typeof emailSchema>;

interface PendingCommand {
  args: Record<string, unknown>;
  command: AdminCommandName;
  title: string;
}

/**
 * 身分與存取:邀請清單(spec §3.1、§4.3、§8.1):列表 admin_list_invitations;
 * issue_admin_invitation 成功後明文 token 只在頁面本地 state 顯示一次,
 * 關閉即清除、絕不寫入 query cache/storage/log(比照 spec §7 reveal 的
 * 「明文只放 component state」原則)。
 */
export function AdminAccessInvitationsPage() {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<PendingCommand | null>(null);
  const [issuedToken, setIssuedToken] = useState<string | null>(null);
  const [replayNotice, setReplayNotice] = useState(false);
  const list = useInfiniteQuery({
    getNextPageParam: (lastPage: AdminListInvitationsResponse) =>
      lastPage.outcome === 'ok' ? (lastPage.next_cursor ?? null) : null,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      adminRpc<AdminListInvitationsResponse>('admin_list_invitations', {
        p_cursor: pageParam,
      }),
    queryKey: INVITATIONS_QUERY_KEY,
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
  const {
    formState: { errors },
    handleSubmit,
    register,
    reset,
  } = useForm<EmailFormValues>({
    defaultValues: { invited_email: '' },
    resolver: zodResolver(emailSchema),
  });

  if (list.isPending || staleSession)
    return (
      <AdminPageLoading title="管理員邀請" onRetry={() => list.refetch()} />
    );

  if (!list.data || !firstPage || firstPage.outcome === 'denied') {
    const denied = firstPage?.outcome === 'denied' ? firstPage : null;
    const canRetry = !denied || denied.retryable === true;
    return (
      <section
        aria-labelledby="admin-access-invitations-page-heading"
        className="page-wide"
      >
        <h1 id="admin-access-invitations-page-heading">管理員邀請</h1>
        {code ? (
          <AdminStatusBanner code={code} />
        ) : (
          <p role="alert">邀請清單載入失敗，請稍後重試。</p>
        )}
        {typeof denied?.request_id === 'string' ? (
          <p>追蹤代碼：{safeTraceId(denied.request_id)}</p>
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

  const startIssue = handleSubmit((values) => {
    setPending({
      args: { invited_email: values.invited_email.trim() },
      command: 'issue_admin_invitation',
      title: '發出管理員邀請',
    });
  });

  return (
    <section
      aria-labelledby="admin-access-invitations-page-heading"
      className="page-wide page-stack"
    >
      <h1 id="admin-access-invitations-page-heading">管理員邀請</h1>
      <AdminQueryStatus query={list} />

      <form
        className="admin-access-invitations__issue-form"
        onSubmit={(event) => void startIssue(event)}
      >
        <div>
          <label htmlFor="admin-invite-email">受邀者 Email</label>
          <input
            aria-describedby={
              errors.invited_email ? 'admin-invite-email-error' : undefined
            }
            aria-invalid={errors.invited_email ? 'true' : 'false'}
            id="admin-invite-email"
            type="email"
            {...register('invited_email')}
          />
          {errors.invited_email ? (
            <p id="admin-invite-email-error" role="alert">
              {errors.invited_email.message}
            </p>
          ) : null}
        </div>
        <button
          className="primary-action"
          data-primary-action="true"
          type="submit"
        >
          發出邀請
        </button>
      </form>

      {rows.length === 0 ? (
        <p>目前沒有待處理或近期的邀請。</p>
      ) : (
        <div className="ui-table-scroll">
          <table aria-label="管理員邀請" className="ui-table">
            <thead>
              <tr>
                <th scope="col">Email</th>
                <th scope="col">狀態</th>
                <th scope="col">到期時間</th>
                <th scope="col">動作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.invited_email}</td>
                  <td>{row.status}</td>
                  <td>{new Date(row.expires_at).toLocaleString('zh-TW')}</td>
                  <td>
                    {row.status === 'pending' ? (
                      <button
                        className="secondary-action"
                        onClick={() => {
                          setPending({
                            args: { invitation_id: row.id },
                            command: 'revoke_admin_invitation',
                            title: '撤銷管理員邀請',
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

      {list.hasNextPage ? (
        <button
          className="secondary-action"
          disabled={list.isFetchingNextPage}
          onClick={() => {
            void list.fetchNextPage();
          }}
          type="button"
        >
          載入更多邀請
        </button>
      ) : null}

      {laterDenied ? (
        <div className="admin-data-browser__page-error">
          <AdminStatusBanner code={extractErrorCode(laterDenied)} />
          {typeof laterDenied.request_id === 'string' ? (
            <p>追蹤代碼：{safeTraceId(laterDenied.request_id)}</p>
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

      {issuedToken ? (
        <div
          aria-label="邀請 token"
          className="admin-access-invitations__token-box"
          role="region"
        >
          <h2>邀請已建立</h2>
          <p>請立即複製以下一次性 token 交給受邀者，關閉後將無法再次查看。</p>
          <code>{issuedToken}</code>
          <button
            className="secondary-action"
            onClick={() => {
              setIssuedToken(null);
            }}
            type="button"
          >
            關閉
          </button>
        </div>
      ) : null}

      {replayNotice ? (
        <div className="admin-access-invitations__token-box" role="status">
          <p>
            此邀請先前已成功建立，一次性 token
            僅在當下顯示過，系統不會再次提供。如仍需要，請先撤銷再重新發出。
          </p>
          <button
            className="secondary-action"
            onClick={() => {
              setReplayNotice(false);
            }}
            type="button"
          >
            知道了
          </button>
        </div>
      ) : null}

      {pending ? (
        <AdminCommandDialog
          args={pending.args}
          command={pending.command}
          onCancel={() => {
            setPending(null);
          }}
          onSettled={(result: AdminCommandResponse) => {
            setPending(null);
            reset();
            const token = result.invitation_token;
            if (typeof token === 'string') {
              setIssuedToken(token);
            } else if (
              pending.command === 'issue_admin_invitation' &&
              result.outcome === 'replayed'
            ) {
              // spec §8.2:replay 的 redacted result 依 DB 設計不含明文
              // token(一次性,只在 fresh 'ok' 附加)——不能靜默當成一般成功,
              // 否則管理員以為拿到了 token 但畫面其實什麼都沒顯示
              // (bugs 軸 review 抓到的真實缺口)。
              setReplayNotice(true);
            }
            void queryClient.invalidateQueries({
              queryKey: INVITATIONS_QUERY_KEY,
            });
          }}
          requiresReason
          title={pending.title}
        />
      ) : null}
    </section>
  );
}

export { AdminAccessInvitationsPage as Component };
