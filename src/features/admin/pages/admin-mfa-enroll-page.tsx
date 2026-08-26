import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { RpgWindow } from '../../../components/ui/rpg-window';
import {
  extractErrorCode,
  invokeAdminMfa,
  type AdminErrorCode,
} from '../api/admin-client';
import { AdminStatusBanner } from '../components/admin-status-banner';

const codeSchema = z.object({
  code: z.string().regex(/^\d{6}$/u, '請輸入 6 位數驗證碼'),
});
type CodeFormValues = z.infer<typeof codeSchema>;

interface EnrolledFactor {
  factorId: string;
  totpSecret: string;
}

export function AdminMfaEnrollPage() {
  const navigate = useNavigate();
  const [factor, setFactor] = useState<EnrolledFactor | null>(null);
  const [beginError, setBeginError] = useState<AdminErrorCode | null>(null);
  const [submitError, setSubmitError] = useState<AdminErrorCode | null>(null);
  // 涵蓋兩種都無法對應到具體穩定碼的失敗:invokeAdminMfa 拋出
  // AdminClientError(網路/回應無法解析),或回應不是 ok 但
  // extractErrorCode 也認不出代碼(不得靜默不顯示任何訊息)。
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
    invokeAdminMfa({ action: 'begin-enrollment' })
      .then((response) => {
        if (cancelled) return;
        if (
          response.outcome === 'ok' &&
          typeof response.factorId === 'string' &&
          typeof response.totpSecret === 'string'
        ) {
          setFactor({
            factorId: response.factorId,
            totpSecret: response.totpSecret,
          });
          return;
        }
        const code = extractErrorCode(response);
        if (code) {
          setBeginError(code);
        } else {
          setUnexpectedError(true);
        }
      })
      .catch(() => {
        if (!cancelled) setUnexpectedError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onSubmit = handleSubmit(async ({ code }) => {
    if (!factor) return;
    try {
      const response = await invokeAdminMfa({
        action: 'confirm-enrollment',
        code,
        factorId: factor.factorId,
      });
      if (response.outcome === 'ok') {
        await navigate('/admin/mfa/challenge', { replace: true });
        return;
      }
      const responseCode = extractErrorCode(response);
      if (responseCode) {
        setSubmitError(responseCode);
      } else {
        setUnexpectedError(true);
      }
    } catch {
      setUnexpectedError(true);
    }
  });

  if (unexpectedError) {
    return (
      <RpgWindow>
        <h1 className="pixel-heading">管理員驗證器綁定</h1>
        <p role="alert">發生非預期的錯誤，請稍後再試或聯絡負責人。</p>
      </RpgWindow>
    );
  }

  if (beginError === 'INSUFFICIENT_MFA') {
    return (
      <RpgWindow>
        <h1 className="pixel-heading">管理員驗證器綁定</h1>
        <p aria-live="polite" role="status">
          請重新輸入密碼登入後再繼續
        </p>
        <Link
          className="primary-action"
          data-acceptance-interactive="true"
          data-acceptance-target
          data-primary-action="true"
          to="/login"
        >
          返回登入
        </Link>
      </RpgWindow>
    );
  }

  return (
    <RpgWindow>
      <h1 className="pixel-heading">管理員驗證器綁定</h1>
      {factor ? (
        <form
          className="admin-mfa-form"
          onSubmit={(event) => void onSubmit(event)}
        >
          <p>請在驗證器 App 中手動輸入下方密鑰，再輸入產生的 6 位數驗證碼。</p>
          <p data-testid="totp-secret">{factor.totpSecret}</p>
          <div>
            <label htmlFor="admin-mfa-enroll-code">驗證碼</label>
            <input
              aria-describedby={
                errors.code ? 'admin-mfa-enroll-code-error' : undefined
              }
              aria-invalid={errors.code ? 'true' : 'false'}
              autoComplete="one-time-code"
              id="admin-mfa-enroll-code"
              inputMode="numeric"
              maxLength={6}
              {...register('code')}
            />
            {errors.code ? (
              <p id="admin-mfa-enroll-code-error" role="alert">
                {errors.code.message}
              </p>
            ) : null}
          </div>
          <button
            className="primary-action"
            data-acceptance-interactive="true"
            data-acceptance-target
            data-primary-action="true"
            disabled={isSubmitting || submitError === 'MFA_LOCKED'}
            type="submit"
          >
            完成綁定
          </button>
        </form>
      ) : null}
      <AdminStatusBanner code={beginError ?? submitError} />
    </RpgWindow>
  );
}

export { AdminMfaEnrollPage as Component };
