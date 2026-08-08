import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { RpgWindow } from '../../../components/ui/rpg-window';
import {
  invokeAdminMfa,
  isAdminErrorCode,
  type AdminErrorCode,
} from '../api/admin-client';
import { AdminStatusBanner } from '../components/admin-status-banner';

const codeSchema = z.object({
  code: z.string().regex(/^\d{6}$/u, '請輸入 6 位數驗證碼'),
});
type CodeFormValues = z.infer<typeof codeSchema>;

interface EnrolledFactor {
  factorId: string;
  qrUri: string;
  totpSecret: string;
}

// admin-mfa 回應是 {outcome:'ok',...} | {outcome:'denied',code} |
// {error}(protocol-level 503/400);兩種都可能帶穩定碼,統一轉譯成
// AdminErrorCode 供頁面與 AdminStatusBanner 使用(spec §11)。
function extractErrorCode(response: {
  code?: string;
  error?: string;
  outcome?: string;
}): AdminErrorCode | null {
  if (response.outcome === 'denied' && isAdminErrorCode(response.code)) {
    return response.code;
  }
  return isAdminErrorCode(response.error) ? response.error : null;
}

function AdminMfaEnrollPage() {
  const navigate = useNavigate();
  const [factor, setFactor] = useState<EnrolledFactor | null>(null);
  const [beginError, setBeginError] = useState<AdminErrorCode | null>(null);
  const [submitError, setSubmitError] = useState<AdminErrorCode | null>(null);
  const [networkError, setNetworkError] = useState(false);
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
          typeof response.totpSecret === 'string' &&
          typeof response.qrUri === 'string'
        ) {
          setFactor({
            factorId: response.factorId,
            qrUri: response.qrUri,
            totpSecret: response.totpSecret,
          });
          return;
        }
        setBeginError(extractErrorCode(response));
      })
      .catch(() => {
        if (!cancelled) setNetworkError(true);
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
      setSubmitError(extractErrorCode(response));
    } catch {
      setNetworkError(true);
    }
  });

  if (networkError) {
    return (
      <RpgWindow>
        <h1 className="pixel-heading">管理員驗證器綁定</h1>
        <p role="alert">無法連線，請檢查網路連線後重新整理頁面再試。</p>
      </RpgWindow>
    );
  }

  if (beginError === 'INSUFFICIENT_MFA') {
    return (
      <RpgWindow>
        <h1 className="pixel-heading">管理員驗證器綁定</h1>
        <p>請重新輸入密碼登入後再繼續</p>
        <Link className="primary-action" to="/login">
          返回登入
        </Link>
      </RpgWindow>
    );
  }

  return (
    <RpgWindow>
      <h1 className="pixel-heading">管理員驗證器綁定</h1>
      {factor ? (
        <form onSubmit={(event) => void onSubmit(event)}>
          <p>
            請以驗證器 App 掃描 QR 或手動輸入密鑰，再輸入產生的 6 位數驗證碼。
          </p>
          <p data-testid="totp-secret">{factor.totpSecret}</p>
          <label>
            驗證碼
            <input
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={6}
              {...register('code')}
            />
          </label>
          {errors.code ? <p role="alert">{errors.code.message}</p> : null}
          <button
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

export { AdminMfaEnrollPage };
export { AdminMfaEnrollPage as Component };
