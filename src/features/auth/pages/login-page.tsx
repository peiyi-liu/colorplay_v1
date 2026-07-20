import { zodResolver } from '@hookform/resolvers/zod';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { useToast } from '../../../components/ui/toast';
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
    AUTH_UNKNOWN: '登入失敗，請使用追蹤代碼回報',
  },
  teacher: {
    AUTH_INVALID_CREDENTIALS: '帳號、密碼或班級序號不正確',
    AUTH_NETWORK: '網路連線失敗，請稍後重試',
    AUTH_UNKNOWN: '登入失敗，請使用追蹤代碼回報',
  },
} as const satisfies Readonly<
  Record<'student' | 'teacher', Readonly<Record<AuthErrorCode, string>>>
>;

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

const messageForError = (error: unknown, portal: 'student' | 'teacher') => {
  const messages = safeErrorMessages[portal];
  return error instanceof AuthRepositoryError
    ? messages[error.code]
    : messages.AUTH_UNKNOWN;
};

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
    setError,
  } = useForm<AccountSignInValues>({
    defaultValues: { account: '', classCode: '', password: '' },
    resolver: zodResolver(accountSignInSchema),
  });

  return (
    <section className="route-panel auth-portal" data-portal={portal}>
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
          ? '使用教師帳號與班級序號登入，進入教師工作區管理班級與課程。'
          : '使用帳號（學號）登入，繼續你的色彩原理學習進度。'}
      </p>

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
          <span aria-hidden="true">🎓 </span>學生註冊登入
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
          <span aria-hidden="true">🧑‍🏫 </span>教師診斷端
        </label>
      </fieldset>

      {portal === 'teacher' ? (
        <div className="auth-portal__teacher-note">
          <span aria-hidden="true">⚠️ </span>
          教師端具備班級管理與學術匯出權限；教師帳號由開發後台建立。
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
            const classCode = values.classCode?.trim() ?? '';
            if (portal === 'teacher' && !usesEmailBridge && !classCode) {
              setError('classCode', { message: '請輸入班級序號' });
              return;
            }

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
                  ...(classCode ? { classCode } : {}),
                });
              }
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

        {portal === 'teacher' ? (
          <div className="login-form__field">
            <label htmlFor="login-class-code">管的班級（班級序號）</label>
            <input
              {...register('classCode')}
              aria-describedby={
                errors.classCode ? 'login-class-code-error' : undefined
              }
              aria-invalid={errors.classCode ? 'true' : 'false'}
              autoComplete="off"
              id="login-class-code"
              type="text"
            />
            {errors.classCode ? (
              <p
                className="login-form__field-error"
                id="login-class-code-error"
              >
                {errors.classCode.message}
              </p>
            ) : null}
          </div>
        ) : null}

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
        <div className="login-form__links">
          {portal === 'student' ? (
            <Link className="login-form__link" to="/register">
              註冊帳號
            </Link>
          ) : null}
          <Link className="login-form__link" to="/forgot-password">
            忘記密碼
          </Link>
        </div>
      </form>
    </section>
  );
}
