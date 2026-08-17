import { Icon } from '../../../components/ui/icons';
import { RpgWindow } from '../../../components/ui/rpg-window';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';

import { useToast } from '../../../components/ui/toast';
import { PasswordVisibilityToggle } from '../components/password-visibility-toggle';
import { useAuth } from '../context/auth-context';
import {
  accountSignInSchema,
  type AccountSignInValues,
} from '../schemas/account-auth-schemas';
import { AuthRepositoryError, type AuthErrorCode } from '../types';

const safeErrorMessages = {
  student: {
    AUTH_INVALID_CREDENTIALS: '帳號或密碼不正確',
    AUTH_NETWORK: '網路連線失敗，請稍後重試',
    AUTH_RATE_LIMITED: '登入嘗試過於頻繁，請稍後再試',
    AUTH_TIMEOUT: '登入服務回應逾時，請再試一次',
    AUTH_UNAVAILABLE: '登入服務暫時無法使用，請稍後再試',
    AUTH_UNKNOWN: '登入失敗，請使用追蹤代碼回報',
  },
  teacher: {
    AUTH_INVALID_CREDENTIALS: '帳號或密碼不正確',
    AUTH_NETWORK: '網路連線失敗，請稍後重試',
    AUTH_RATE_LIMITED: '登入嘗試過於頻繁，請稍後再試',
    AUTH_TIMEOUT: '登入服務回應逾時，請再試一次',
    AUTH_UNAVAILABLE: '登入服務暫時無法使用，請稍後再試',
    AUTH_UNKNOWN: '登入失敗，請使用追蹤代碼回報',
  },
} as const satisfies Readonly<
  Record<'student' | 'teacher', Readonly<Record<AuthErrorCode, string>>>
>;

const fallbackDestination = { hash: '', pathname: '/app', search: '' };
const teacherDestination = { hash: '', pathname: '/teacher', search: '' };

const messageForError = (error: unknown, portal: 'student' | 'teacher') => {
  const messages = safeErrorMessages[portal];
  return error instanceof AuthRepositoryError
    ? messages[error.code]
    : messages.AUTH_UNKNOWN;
};

export function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const pendingSubmission = useRef(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [portal, setPortal] = useState<'student' | 'teacher'>('student');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
  } = useForm<AccountSignInValues>({
    defaultValues: { account: '', password: '' },
    resolver: zodResolver(accountSignInSchema),
  });

  return (
    <section
      className="route-panel auth-portal scene-night"
      data-portal={portal}
    >
      <div className="auth-portal-brand">
        <span className="auth-portal-brand__mark">
          <img
            alt="ColorPlay 藍金寶典"
            height="48"
            src="/colorplay-grimoire-pixel.png"
            width="48"
          />
        </span>
        <p className="auth-portal-brand__title">冒險者公會</p>
        <p className="auth-portal-brand__subtitle">色彩王國通行證</p>
      </div>
      <p className="auth-portal__welcome">歡迎回來，冒險者。</p>
      <h1 className="pixel-heading">登入</h1>
      <p className="route-panel__message">
        {portal === 'teacher'
          ? '使用教師帳號登入，進入教師工作區管理班級與課程。'
          : '使用帳號登入，繼續你的色彩原理學習進度。'}
      </p>

      <RpgWindow className="auth-window">
        <fieldset className="login-form__portal">
          <legend className="visually-hidden">登入身分</legend>
          <label data-active={portal === 'student'}>
            <input
              checked={portal === 'student'}
              name="login-portal"
              onChange={() => {
                setPortal('student');
              }}
              type="radio"
            />
            <Icon name="grad-cap" size={15} /> 學生帳號登入
          </label>
          <label data-active={portal === 'teacher'}>
            <input
              checked={portal === 'teacher'}
              name="login-portal"
              onChange={() => {
                setPortal('teacher');
              }}
              type="radio"
            />
            <Icon name="briefcase" size={15} /> 教師端登入
          </label>
        </fieldset>

        {portal === 'teacher' ? (
          <div className="auth-portal__teacher-note">
            <Icon name="alert" size={14} /> 教師帳號由開發後台建立。
          </div>
        ) : null}

        <form
          className="login-form"
          data-interaction-group="login"
          noValidate
          onSubmit={(event) => {
            void handleSubmit(async (values) => {
              if (pendingSubmission.current) return;

              const identifier = values.account.trim();
              const usesEmailBridge = identifier.includes('@');

              pendingSubmission.current = true;
              setSubmitError(null);
              try {
                if (usesEmailBridge) {
                  await auth.signIn({
                    email: identifier,
                    password: values.password,
                  });
                } else {
                  await auth.signInWithAccount({
                    account: identifier,
                    password: values.password,
                    portal,
                  });
                }
                toast({
                  message: '登入成功，歡迎回到 ColorPlay！',
                  tone: 'success',
                });
                // 固定導向（UAT 0727 #5）：學生一律進學習大廳、教師一律進
                // 教師工作區，不再回跳登入前頁面。
                await navigate(
                  portal === 'teacher'
                    ? teacherDestination
                    : fallbackDestination,
                  { replace: true },
                );
              } catch (error) {
                setSubmitError(messageForError(error, portal));
              } finally {
                pendingSubmission.current = false;
              }
            })(event);
          }}
        >
          <div className="login-form__field">
            <label htmlFor="login-account">帳號</label>
            <input
              {...register('account')}
              aria-describedby={
                errors.account ? 'login-account-error' : undefined
              }
              aria-invalid={errors.account ? 'true' : 'false'}
              autoComplete="username"
              id="login-account"
              type="text"
            />
            {errors.account ? (
              <p className="login-form__field-error" id="login-account-error">
                {errors.account.message}
              </p>
            ) : null}
          </div>

          <div className="login-form__field">
            <label htmlFor="login-password">密碼</label>
            <div className="login-form__password-control">
              <input
                {...register('password')}
                aria-describedby={
                  errors.password ? 'login-password-error' : undefined
                }
                aria-invalid={errors.password ? 'true' : 'false'}
                autoComplete="current-password"
                id="login-password"
                type={passwordVisible ? 'text' : 'password'}
              />
              <PasswordVisibilityToggle
                controlId="login-password"
                fieldLabel="密碼"
                onToggle={() => {
                  setPasswordVisible((visible) => !visible);
                }}
                visible={passwordVisible}
              />
            </div>
            {errors.password ? (
              <p className="login-form__field-error" id="login-password-error">
                {errors.password.message}
              </p>
            ) : null}
          </div>

          {submitError ? (
            <p className="login-form__submit-error" role="alert">
              {submitError}
            </p>
          ) : null}
          <p aria-live="polite" className="login-form__status" role="status">
            {isSubmitting ? '登入處理中，請稍候' : null}
          </p>
          <div className="login-form__action-row">
            <button
              className={
                portal === 'teacher'
                  ? 'primary-action login-form__submit--pixel login-form__submit--teacher'
                  : 'primary-action login-form__submit--pixel'
              }
              data-acceptance-interactive="true"
              data-acceptance-target
              data-primary-action="true"
              disabled={isSubmitting}
              aria-label={isSubmitting ? '登入中…' : '登入'}
              type="submit"
            >
              {isSubmitting ? '進入中…' : '進入王國'}
            </button>
          </div>
          <div className="login-form__links">
            {portal === 'student' ? (
              <>
                <Link className="login-form__link" to="/register">
                  註冊帳號
                </Link>
                <span aria-hidden="true" className="login-form__divider">
                  ｜
                </span>
              </>
            ) : null}
            <Link className="login-form__link" to="/forgot-password">
              忘記密碼
            </Link>
          </div>
        </form>
      </RpgWindow>
    </section>
  );
}
