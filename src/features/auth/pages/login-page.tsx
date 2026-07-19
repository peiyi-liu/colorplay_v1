import { zodResolver } from '@hookform/resolvers/zod';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router-dom';

import { useToast } from '../../../components/ui/toast';
import { useAuth } from '../context/auth-context';
import { signInSchema, type SignInValues } from '../schemas/sign-in-schema';
import { AuthRepositoryError, type AuthErrorCode } from '../types';

const safeErrorMessages = {
  AUTH_INVALID_CREDENTIALS: 'Email 或密碼不正確',
  AUTH_NETWORK: '網路連線失敗，請稍後重試',
  AUTH_UNKNOWN: '登入失敗，請使用追蹤代碼回報',
} as const satisfies Readonly<Record<AuthErrorCode, string>>;

const fallbackDestination = { hash: '', pathname: '/app', search: '' };
const teacherDestination = { hash: '', pathname: '/teacher', search: '' };

const hasUnsafePathnameCharacter = (pathname: string) =>
  pathname.includes('\\') ||
  Array.from(pathname).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
  });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readDestination = (
  state: unknown,
  portalFallback: typeof fallbackDestination,
) => {
  if (!isRecord(state) || !isRecord(state.from)) return portalFallback;

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
  const toast = useToast();
  const pendingSubmission = useRef(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [portal, setPortal] = useState<'student' | 'teacher'>('student');
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
      <div className="auth-portal-brand">
        <span aria-hidden="true" className="auth-portal-brand__mark">
          🎨
        </span>
        <p className="auth-portal-brand__title">ColorPlay 認證入口</p>
        <p className="auth-portal-brand__subtitle">
          色彩對比形成性與精熟學習系統
        </p>
      </div>
      <p className="route-panel__eyebrow">
        {portal === 'teacher' ? '教師入口' : '學生入口'}
      </p>
      <h1>登入</h1>
      <p className="route-panel__message">
        {portal === 'teacher'
          ? '使用教師 Email 登入，進入教師工作區管理班級與課程。'
          : '使用個人 Email 登入，繼續你的色彩原理學習進度。'}
      </p>

      <fieldset className="login-form__portal">
        <legend>登入身分</legend>
        <label>
          <input
            checked={portal === 'student'}
            name="login-portal"
            onChange={() => {
              setPortal('student');
            }}
            type="radio"
          />
          學生
        </label>
        <label>
          <input
            checked={portal === 'teacher'}
            name="login-portal"
            onChange={() => {
              setPortal('teacher');
            }}
            type="radio"
          />
          教師
        </label>
      </fieldset>

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
              toast({
                message: '登入成功，歡迎回到 ColorPlay！',
                tone: 'success',
              });
              await navigate(
                readDestination(
                  location.state,
                  portal === 'teacher'
                    ? teacherDestination
                    : fallbackDestination,
                ),
                { replace: true },
              );
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
            data-acceptance-interactive="true"
            data-acceptance-target
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
