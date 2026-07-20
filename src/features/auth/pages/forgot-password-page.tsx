import { zodResolver } from '@hookform/resolvers/zod';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';

import { requestPasswordReset } from '../api/account-flows';
import {
  forgotPasswordSchema,
  type ForgotPasswordValues,
} from '../schemas/account-auth-schemas';

export function ForgotPasswordPage() {
  const pendingSubmission = useRef(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
  } = useForm<ForgotPasswordValues>({
    defaultValues: { account: '', email: '' },
    resolver: zodResolver(forgotPasswordSchema),
  });

  return (
    <section className="route-panel auth-portal" data-portal="student">
      <div className="auth-portal-brand">
        <span aria-hidden="true" className="auth-portal-brand__mark">
          🎨
        </span>
        <p className="auth-portal-brand__title">ColorPlay 認證入口</p>
        <p className="auth-portal-brand__subtitle">
          色彩對比形成性與精熟學習系統
        </p>
      </div>
      <p className="route-panel__eyebrow">帳號協助</p>
      <h1>忘記密碼</h1>
      <p className="route-panel__message">
        輸入你的帳號與註冊時使用的 E-mail，我們會寄出重設密碼連結。
      </p>

      {submitted ? (
        <div className="login-form" data-interaction-group="forgot-password">
          <p className="login-form__status" role="status">
            若帳號與 E-mail 相符，重設密碼連結已寄出，請至信箱查收（連結 1
            小時內有效）。
          </p>
          <div className="login-form__links">
            <Link className="login-form__link" to="/login">
              返回登入
            </Link>
          </div>
        </div>
      ) : (
        <form
          className="login-form"
          data-interaction-group="forgot-password"
          noValidate
          onSubmit={(event) => {
            void handleSubmit(async (values) => {
              if (pendingSubmission.current) return;
              pendingSubmission.current = true;
              setSubmitError(null);
              try {
                await requestPasswordReset({
                  account: values.account.trim(),
                  email: values.email.trim(),
                });
                setSubmitted(true);
              } catch {
                setSubmitError('目前無法寄送重設連結，請稍後重試');
              } finally {
                pendingSubmission.current = false;
              }
            })(event);
          }}
        >
          <div className="login-form__field">
            <label htmlFor="forgot-account">帳號</label>
            <input
              {...register('account')}
              aria-describedby={
                errors.account ? 'forgot-account-error' : undefined
              }
              aria-invalid={errors.account ? 'true' : 'false'}
              autoComplete="username"
              id="forgot-account"
              type="text"
            />
            {errors.account ? (
              <p className="login-form__field-error" id="forgot-account-error">
                {errors.account.message}
              </p>
            ) : null}
          </div>

          <div className="login-form__field">
            <label htmlFor="forgot-email">E-mail</label>
            <input
              {...register('email')}
              aria-describedby={errors.email ? 'forgot-email-error' : undefined}
              aria-invalid={errors.email ? 'true' : 'false'}
              autoComplete="email"
              id="forgot-email"
              inputMode="email"
              type="email"
            />
            {errors.email ? (
              <p className="login-form__field-error" id="forgot-email-error">
                {errors.email.message}
              </p>
            ) : null}
          </div>

          {submitError ? (
            <p className="login-form__submit-error" role="alert">
              {submitError}
            </p>
          ) : null}
          <p aria-live="polite" className="login-form__status" role="status">
            {isSubmitting ? '寄送處理中，請稍候' : null}
          </p>
          <div className="login-form__action-row">
            <button
              className="primary-action"
              data-acceptance-interactive="true"
              data-acceptance-target
              data-primary-action="true"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? '寄送中…' : '寄送重設連結'}
            </button>
          </div>
          <div className="login-form__links">
            <Link className="login-form__link" to="/login">
              返回登入
            </Link>
          </div>
        </form>
      )}
    </section>
  );
}
