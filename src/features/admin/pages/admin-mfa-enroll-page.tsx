import { useAdminWait } from '../hooks/use-admin-wait';
import { zodResolver } from '@hookform/resolvers/zod';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { z } from 'zod';

import '../../../styles/admin-console.css';
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
  qrUri: string;
  totpSecret: string;
}

export function AdminMfaEnrollPage() {
  const navigate = useNavigate();
  const mounted = useRef(true);
  const retryRef = useRef<HTMLButtonElement>(null);
  const codeInputRef = useRef<HTMLInputElement | null>(null);
  const [factor, setFactor] = useState<EnrolledFactor | null>(null);
  const [beginPending, setBeginPending] = useState(true);
  const [beginError, setBeginError] = useState<AdminErrorCode | null>(null);
  const [submitError, setSubmitError] = useState<AdminErrorCode | null>(null);
  const [unexpectedError, setUnexpectedError] = useState<
    'begin' | 'submit' | null
  >(null);
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
  } = useForm<CodeFormValues>({
    defaultValues: { code: '' },
    resolver: zodResolver(codeSchema),
  });
  const codeRegistration = register('code');

  const applyEnrollmentResponse = useCallback(
    (response: Awaited<ReturnType<typeof invokeAdminMfa>>) => {
      if (
        response.outcome === 'ok' &&
        typeof response.factorId === 'string' &&
        typeof response.qrUri === 'string' &&
        typeof response.totpSecret === 'string'
      ) {
        setFactor({
          factorId: response.factorId,
          qrUri: response.qrUri,
          totpSecret: response.totpSecret,
        });
        return;
      }
      const code = extractErrorCode(response);
      if (code) setBeginError(code);
      else setUnexpectedError('begin');
    },
    [],
  );

  const loadEnrollment = useCallback(async () => {
    setBeginPending(true);
    setBeginError(null);
    setUnexpectedError(null);
    try {
      const response = await invokeAdminMfa({ action: 'begin-enrollment' });
      if (!mounted.current) return;
      applyEnrollmentResponse(response);
    } catch {
      if (mounted.current) setUnexpectedError('begin');
    } finally {
      if (mounted.current) setBeginPending(false);
    }
  }, [applyEnrollmentResponse]);

  const longWait = useAdminWait(isSubmitting || beginPending);
  useEffect(() => {
    mounted.current = true;
    void invokeAdminMfa({ action: 'begin-enrollment' })
      .then((response) => {
        if (mounted.current) applyEnrollmentResponse(response);
      })
      .catch(() => {
        if (mounted.current) setUnexpectedError('begin');
      })
      .finally(() => {
        if (mounted.current) setBeginPending(false);
      });
    return () => {
      mounted.current = false;
    };
  }, [applyEnrollmentResponse]);

  const beginFailed = unexpectedError === 'begin' || beginError !== null;
  useEffect(() => {
    if (beginFailed) retryRef.current?.focus();
  }, [beginFailed]);

  const submitFailed = unexpectedError === 'submit' || submitError !== null;
  useEffect(() => {
    if (submitFailed && submitError !== 'MFA_LOCKED') {
      codeInputRef.current?.focus();
    }
  }, [submitError, submitFailed]);

  const onSubmit = handleSubmit(async ({ code }) => {
    if (!factor) return;
    setSubmitError(null);
    setUnexpectedError(null);
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
      if (responseCode) setSubmitError(responseCode);
      else setUnexpectedError('submit');
    } catch {
      setUnexpectedError('submit');
    }
  });

  if (beginError === 'INSUFFICIENT_MFA') {
    return (
      <section className="admin-auth-panel">
        <h1 className="admin-auth-panel__heading">管理員驗證器綁定</h1>
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
      </section>
    );
  }

  return (
    <section className="admin-auth-panel">
      <h1 className="admin-auth-panel__heading">管理員驗證器綁定</h1>
      {beginPending ? <p role="status">正在建立驗證器設定…</p> : null}
      {beginFailed ? (
        <>
          {unexpectedError === 'begin' ? (
            <p role="alert">發生非預期的錯誤，請稍後再試或聯絡負責人。</p>
          ) : (
            <AdminStatusBanner code={beginError} />
          )}
          <button
            className="primary-action"
            data-acceptance-interactive="true"
            data-acceptance-target
            data-primary-action="true"
            onClick={() => void loadEnrollment()}
            ref={retryRef}
            type="button"
          >
            重新載入驗證器設定
          </button>
        </>
      ) : null}
      {factor ? (
        <>
          {longWait ? (
            <p role="status">
              請求處理時間較長，尚未收到最終結果。請勿重複送出；離開頁面不會撤銷已送出的請求。
            </p>
          ) : null}
          <form
            className="admin-mfa-form"
            onSubmit={(event) => void onSubmit(event)}
          >
            <p>請掃描 QR code，再輸入驗證器 App 產生的 6 位數驗證碼。</p>
            <div className="admin-mfa-form__qr">
              <QRCodeSVG
                size={192}
                title="管理員驗證器設定 QR code"
                value={factor.qrUri}
              />
            </div>
            <details>
              <summary>無法掃描？顯示文字密鑰</summary>
              <code data-testid="totp-secret">{factor.totpSecret}</code>
            </details>
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
                {...codeRegistration}
                ref={(element) => {
                  codeRegistration.ref(element);
                  codeInputRef.current = element;
                }}
              />
              {errors.code ? (
                <p id="admin-mfa-enroll-code-error" role="alert">
                  {errors.code.message}
                </p>
              ) : null}
            </div>
            {unexpectedError === 'submit' ? (
              <p role="alert">發生非預期的錯誤，請稍後再試或聯絡負責人。</p>
            ) : null}
            <AdminStatusBanner code={submitError} />
            <button
              className="primary-action"
              data-acceptance-interactive="true"
              data-acceptance-target
              data-primary-action="true"
              disabled={isSubmitting || submitError === 'MFA_LOCKED'}
              type="submit"
            >
              {isSubmitting ? '綁定中…' : '完成綁定'}
            </button>
          </form>
        </>
      ) : null}
    </section>
  );
}

export { AdminMfaEnrollPage as Component };
