import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { RpgWindow } from '../../../components/ui/rpg-window';
import {
  extractErrorCode,
  invokeAdminMfa,
  listOwnVerifiedTotpFactorId,
  type AdminErrorCode,
} from '../api/admin-client';
import { AdminStatusBanner } from '../components/admin-status-banner';
import { useAdminSessionState } from '../hooks/use-admin-session-state';

const codeSchema = z.object({
  code: z.string().regex(/^\d{6}$/u, '請輸入 6 位數驗證碼'),
});
type CodeFormValues = z.infer<typeof codeSchema>;

export function AdminMfaChallengePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const session = useAdminSessionState();
  // undefined:factor 查詢中;null:查無已驗證 factor(spec §4.5 reset 後
  // GoTrue 端無殘留);string:可發起 challenge。
  const [factorId, setFactorId] = useState<string | null | undefined>(
    undefined,
  );
  const [error, setError] = useState<AdminErrorCode | null>(null);
  // FACTOR_BINDING_MISMATCH 是伺服端已入帳的 factor incident(spec §3.3):
  // 終止表單,不提供任何繞過或重試按鈕。
  const [incident, setIncident] = useState(false);
  // 涵蓋:factor 查詢本身失敗(非「查無 factor」)、invokeAdminMfa 拋出、
  // 或回應不是 ok 但 extractErrorCode 也認不出代碼 —— 都不能靜默不顯示。
  const [unexpectedError, setUnexpectedError] = useState(false);
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
  } = useForm<CodeFormValues>({
    defaultValues: { code: '' },
    resolver: zodResolver(codeSchema),
  });

  useEffect(() => {
    let cancelled = false;
    listOwnVerifiedTotpFactorId()
      .then((id) => {
        if (!cancelled) setFactorId(id);
      })
      .catch(() => {
        if (!cancelled) setUnexpectedError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onSubmit = handleSubmit(async ({ code }) => {
    if (!factorId) return;
    try {
      const response = await invokeAdminMfa({
        action: 'challenge',
        code,
        factorId,
      });
      if (response.outcome === 'ok') {
        // 先等 cache 真的更新再導向:否則 RequirePrivilegedSession 會在
        // 目的地讀到 refetch 觸發前的舊 state,又把使用者彈回本頁重驗。
        await session.refetch();
        const state = location.state as { returnTo?: string } | null;
        await navigate(state?.returnTo ?? '/admin', { replace: true });
        return;
      }
      const responseCode = extractErrorCode(response);
      if (responseCode === 'FACTOR_BINDING_MISMATCH') {
        setIncident(true);
        return;
      }
      if (responseCode) {
        setError(responseCode);
      } else {
        setUnexpectedError(true);
      }
    } catch {
      setUnexpectedError(true);
    }
  });

  if (incident) {
    return (
      <RpgWindow>
        <h1 className="pixel-heading">管理員雙因素驗證</h1>
        <AdminStatusBanner code="FACTOR_BINDING_MISMATCH" />
      </RpgWindow>
    );
  }

  if (unexpectedError) {
    return (
      <RpgWindow>
        <h1 className="pixel-heading">管理員雙因素驗證</h1>
        <p role="alert">發生非預期的錯誤，請稍後再試或聯絡負責人。</p>
      </RpgWindow>
    );
  }

  if (factorId === null) {
    return (
      <RpgWindow>
        <h1 className="pixel-heading">管理員雙因素驗證</h1>
        <p role="alert">找不到已綁定的驗證器，請聯絡負責人。</p>
      </RpgWindow>
    );
  }

  return (
    <RpgWindow>
      <h1 className="pixel-heading">管理員雙因素驗證</h1>
      {factorId ? (
        <form
          className="admin-mfa-form"
          onSubmit={(event) => void onSubmit(event)}
        >
          <p>請輸入驗證器 App 產生的 6 位數驗證碼。</p>
          <div>
            <label htmlFor="admin-mfa-challenge-code">驗證碼</label>
            <input
              aria-describedby={
                errors.code ? 'admin-mfa-challenge-code-error' : undefined
              }
              aria-invalid={errors.code ? 'true' : 'false'}
              autoComplete="one-time-code"
              id="admin-mfa-challenge-code"
              inputMode="numeric"
              maxLength={6}
              {...register('code')}
            />
            {errors.code ? (
              <p id="admin-mfa-challenge-code-error" role="alert">
                {errors.code.message}
              </p>
            ) : null}
          </div>
          <button
            className="primary-action"
            data-acceptance-interactive="true"
            data-acceptance-target
            data-primary-action="true"
            disabled={isSubmitting || error === 'MFA_LOCKED'}
            type="submit"
          >
            驗證
          </button>
        </form>
      ) : null}
      <AdminStatusBanner code={error} />
    </RpgWindow>
  );
}

export { AdminMfaChallengePage as Component };
