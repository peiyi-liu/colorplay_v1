import { useAdminWait } from '../hooks/use-admin-wait';
import { safeTraceId } from '../api/admin-outcome';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';

import '../../../styles/admin-console.css';
import { myProfileQueryKey } from '../../profile/hooks/use-my-profile';
import { adminRpc, extractErrorCode } from '../api/admin-client';
import { AdminStatusBanner } from '../components/admin-status-banner';

const invitationSchema = z.object({
  token: z.string().trim().min(1, '請貼上邀請 token'),
});

type InvitationFormValues = z.infer<typeof invitationSchema>;

interface InvitationAccepted {
  outcome: 'ok';
}

interface InvitationDenied {
  code?: string;
  outcome: 'denied';
  request_id?: string;
  retryable?: boolean;
}

type InvitationResponse = InvitationAccepted | InvitationDenied;

/**
 * Authenticated pre-privileged invitation handoff. The pasted token only
 * crosses the authenticated RPC body and is never placed in a URL or cache.
 */
export function AdminInvitationAcceptPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const {
    formState: { errors },
    handleSubmit,
    register,
  } = useForm<InvitationFormValues>({
    defaultValues: { token: '' },
    resolver: zodResolver(invitationSchema),
  });

  const accept = useMutation({
    mutationFn: ({ token }: InvitationFormValues) =>
      adminRpc<InvitationResponse>('accept_admin_invitation', {
        p_token: token,
      }),
    onSuccess: async (response) => {
      if (response.outcome !== 'ok') return;
      await queryClient.refetchQueries({
        exact: true,
        queryKey: myProfileQueryKey,
        type: 'active',
      });
      await navigate('/admin/mfa/enroll', { replace: true });
    },
    retry: false,
  });

  const longWait = useAdminWait(accept.isPending);
  const denied = accept.data?.outcome === 'denied' ? accept.data : null;
  const code = denied ? extractErrorCode(denied) : null;

  return (
    <section className="admin-auth-panel">
      <h1 className="admin-auth-panel__heading">接受管理員邀請</h1>
      <p>請貼上管理員提供的一次性邀請 token。</p>
      {longWait ? (
        <p role="status">
          請求處理時間較長，尚未收到最終結果。請勿重複送出；離開頁面不會撤銷已送出的請求。
        </p>
      ) : null}
      <form
        className="admin-invitation-accept-form"
        onSubmit={(event) =>
          void handleSubmit((values) => {
            accept.mutate(values);
          })(event)
        }
      >
        <div>
          <label htmlFor="admin-invitation-token">邀請 token</label>
          <input
            aria-describedby={
              errors.token ? 'admin-invitation-token-error' : undefined
            }
            aria-invalid={errors.token ? 'true' : 'false'}
            autoComplete="off"
            id="admin-invitation-token"
            spellCheck={false}
            {...register('token')}
          />
          {errors.token ? (
            <p id="admin-invitation-token-error" role="alert">
              {errors.token.message}
            </p>
          ) : null}
        </div>
        <button
          className="primary-action"
          data-acceptance-interactive="true"
          data-acceptance-target
          data-primary-action="true"
          disabled={accept.isPending}
          type="submit"
        >
          接受邀請
        </button>
      </form>

      {accept.isError ? (
        <p role="alert">邀請驗證暫時失敗，請稍後重試。</p>
      ) : null}
      <AdminStatusBanner code={code} />
      {typeof denied?.request_id === 'string' ? (
        <p>追蹤代碼：{safeTraceId(denied.request_id)}</p>
      ) : null}
      {denied && denied.retryable !== true ? (
        <p>請確認 token 是否完整，或請管理員重新發出邀請。</p>
      ) : null}
    </section>
  );
}

export { AdminInvitationAcceptPage as Component };
