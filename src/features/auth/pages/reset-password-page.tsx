import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';

import { useToast } from '../../../components/ui/toast';
import { parsePublicEnv } from '../../../lib/config/public-env';
import { getBrowserSupabaseClient } from '../../../lib/supabase/browser-client';
import { applyNewPassword } from '../api/account-flows';
import { useAuth } from '../context/auth-context';
import {
  resetPasswordSchema,
  type ResetPasswordValues,
} from '../schemas/account-auth-schemas';

type LinkState = 'checking' | 'ready' | 'invalid';

export function ResetPasswordPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const pendingSubmission = useRef(false);
  const [linkState, setLinkState] = useState<LinkState>('checking');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
  } = useForm<ResetPasswordValues>({
    defaultValues: { password: '', passwordConfirm: '' },
    resolver: zodResolver(resetPasswordSchema),
  });

  // 重設連結會在網址帶 recovery token，supabase-js 於載入時非同步兌換 session；
  // 這裡同時監聽事件與延遲檢查，兩者任一取得 session 即視為連結有效。
  useEffect(() => {
    const client = getBrowserSupabaseClient(parsePublicEnv(import.meta.env));
    let active = true;

    const { data: subscription } = client.auth.onAuthStateChange(
      (_event, session) => {
        if (active && session) setLinkState('ready');
      },
    );
    const timer = setTimeout(() => {
      void client.auth.getSession().then(({ data }) => {
        if (!active) return;
        setLinkState((current) =>
          current === 'checking'
            ? data.session
              ? 'ready'
              : 'invalid'
            : current,
        );
      });
    }, 600);

    return () => {
      active = false;
      clearTimeout(timer);
      subscription.subscription.unsubscribe();
    };
  }, []);

  return (
    <section className="route-panel auth-portal" data-portal="student">
      <div className="auth-portal-brand">
        <span aria-hidden="true" className="auth-portal-brand__mark">
          <svg fill="none" height="40" viewBox="0 0 32 32" width="40">
            <circle cx="11" cy="12" fill="var(--hue-ch1)" r="7" />
            <circle
              cx="21"
              cy="12"
              fill="var(--hue-ch5)"
              fillOpacity="0.92"
              r="7"
            />
            <circle
              cx="16"
              cy="20"
              fill="var(--hue-ch3)"
              fillOpacity="0.92"
              r="7"
            />
          </svg>
        </span>
        <p className="auth-portal-brand__title">ColorPlay 認證入口</p>
        <p className="auth-portal-brand__subtitle">
          色彩對比形成性與精熟學習系統
        </p>
      </div>
      <p className="route-panel__eyebrow">帳號協助</p>
      <h1>重設密碼</h1>

      {linkState === 'invalid' ? (
        <div className="login-form" data-interaction-group="reset-password">
          <p className="login-form__submit-error" role="alert">
            重設連結無效或已過期，請重新申請。
          </p>
          <div className="login-form__links">
            <Link className="login-form__link" to="/forgot-password">
              重新申請重設密碼
            </Link>
            <Link className="login-form__link" to="/login">
              返回登入
            </Link>
          </div>
        </div>
      ) : (
        <>
          <p className="route-panel__message">
            請設定新密碼（6 至 12 碼，需包含大小寫英文字母）。
          </p>
          <form
            className="login-form"
            data-interaction-group="reset-password"
            noValidate
            onSubmit={(event) => {
              void handleSubmit(async (values) => {
                if (pendingSubmission.current) return;
                pendingSubmission.current = true;
                setSubmitError(null);
                try {
                  await applyNewPassword(values.password);
                  try {
                    await auth.signOut();
                  } catch {
                    // 登出失敗不阻擋導回登入頁；session 仍會隨分頁關閉結束。
                  }
                  toast({
                    message: '密碼已重設，請以新密碼重新登入',
                    tone: 'success',
                  });
                  await navigate('/login', { replace: true });
                } catch {
                  setSubmitError('密碼重設失敗，請重新申請重設連結');
                } finally {
                  pendingSubmission.current = false;
                }
              })(event);
            }}
          >
            <div className="login-form__field">
              <label htmlFor="reset-password">新密碼</label>
              <input
                {...register('password')}
                aria-describedby="reset-password-hint reset-password-error"
                aria-invalid={errors.password ? 'true' : 'false'}
                autoComplete="new-password"
                id="reset-password"
                type="password"
              />
              <p className="login-form__field-hint" id="reset-password-hint">
                需要填寫與之前不一樣的密碼。
              </p>
              {errors.password ? (
                <p
                  className="login-form__field-error"
                  id="reset-password-error"
                >
                  {errors.password.message}
                </p>
              ) : null}
            </div>

            <div className="login-form__field">
              <label htmlFor="reset-password-confirm">確認新密碼</label>
              <input
                {...register('passwordConfirm')}
                aria-describedby={
                  errors.passwordConfirm
                    ? 'reset-password-confirm-error'
                    : undefined
                }
                aria-invalid={errors.passwordConfirm ? 'true' : 'false'}
                autoComplete="new-password"
                id="reset-password-confirm"
                type="password"
              />
              {errors.passwordConfirm ? (
                <p
                  className="login-form__field-error"
                  id="reset-password-confirm-error"
                >
                  {errors.passwordConfirm.message}
                </p>
              ) : null}
            </div>

            {submitError ? (
              <p className="login-form__submit-error" role="alert">
                {submitError}
              </p>
            ) : null}
            <p aria-live="polite" className="login-form__status" role="status">
              {linkState === 'checking'
                ? '正在確認重設連結…'
                : isSubmitting
                  ? '密碼更新中，請稍候'
                  : null}
            </p>
            <div className="login-form__action-row">
              <button
                className="primary-action"
                data-acceptance-interactive="true"
                data-acceptance-target
                data-primary-action="true"
                disabled={isSubmitting || linkState !== 'ready'}
                type="submit"
              >
                {isSubmitting ? '更新中…' : '更新密碼'}
              </button>
            </div>
          </form>
        </>
      )}
    </section>
  );
}
