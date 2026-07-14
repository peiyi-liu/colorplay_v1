import { zodResolver } from '@hookform/resolvers/zod';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '../context/auth-context';
import { signInSchema, type SignInValues } from '../schemas/sign-in-schema';
import { AuthRepositoryError, type AuthErrorCode } from '../types';

const safeErrorMessages = {
  AUTH_INVALID_CREDENTIALS: 'Email 或密碼不正確',
  AUTH_NETWORK: '網路連線失敗，請稍後重試',
  AUTH_UNKNOWN: '登入失敗，請使用追蹤代碼回報',
} as const satisfies Readonly<Record<AuthErrorCode, string>>;

const fallbackDestination = { hash: '', pathname: '/app', search: '' };

const hasUnsafePathnameCharacter = (pathname: string) =>
  pathname.includes('\\') ||
  Array.from(pathname).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
  });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readDestination = (state: unknown) => {
  if (!isRecord(state) || !isRecord(state.from)) return fallbackDestination;

  const { hash, pathname, search } = state.from;
  if (
    typeof pathname !== 'string' ||
    !pathname.startsWith('/') ||
    pathname.startsWith('//') ||
    hasUnsafePathnameCharacter(pathname)
  ) {
    return fallbackDestination;
  }

  return {
    hash: typeof hash === 'string' && hash.startsWith('#') ? hash : '',
    pathname,
    search: typeof search === 'string' && search.startsWith('?') ? search : '',
  };
};

const messageForError = (error: unknown) =>
  error instanceof AuthRepositoryError
    ? safeErrorMessages[error.code]
    : safeErrorMessages.AUTH_UNKNOWN;

export function LoginPage() {
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const pendingSubmission = useRef(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
  } = useForm<SignInValues>({
    defaultValues: { email: '', password: '' },
    resolver: zodResolver(signInSchema),
  });

  return (
    <section className="route-panel">
      <p className="route-panel__eyebrow">學生入口</p>
      <h1>登入</h1>
      <p className="route-panel__message">
        使用個人 Email 登入，繼續你的色彩原理學習進度。
      </p>

      <form
        className="login-form"
        data-interaction-group="login"
        noValidate
        onSubmit={(event) => {
          void handleSubmit(async (values) => {
            if (pendingSubmission.current) return;
            pendingSubmission.current = true;
            setSubmitError(null);
            try {
              await auth.signIn(values);
              await navigate(readDestination(location.state), {
                replace: true,
              });
            } catch (error) {
              setSubmitError(messageForError(error));
            } finally {
              pendingSubmission.current = false;
            }
          })(event);
        }}
      >
        <div className="login-form__field">
          <label htmlFor="login-email">Email</label>
          <input
            {...register('email')}
            aria-describedby={errors.email ? 'login-email-error' : undefined}
            aria-invalid={errors.email ? 'true' : 'false'}
            autoComplete="email"
            id="login-email"
            inputMode="email"
            type="email"
          />
          {errors.email ? (
            <p className="login-form__field-error" id="login-email-error">
              {errors.email.message}
            </p>
          ) : null}
        </div>

        <div className="login-form__field">
          <label htmlFor="login-password">密碼</label>
          <input
            {...register('password')}
            aria-describedby={
              errors.password ? 'login-password-error' : undefined
            }
            aria-invalid={errors.password ? 'true' : 'false'}
            autoComplete="current-password"
            id="login-password"
            type="password"
          />
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
            className="primary-action"
            data-primary-action="true"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? '登入中…' : '登入'}
          </button>
        </div>
      </form>
    </section>
  );
}
