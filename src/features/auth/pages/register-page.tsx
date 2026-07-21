import { zodResolver } from '@hookform/resolvers/zod';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';

import { Chip } from '../../../components/ui/chip';
import { useToast } from '../../../components/ui/toast';
import {
  AccountFlowError,
  completeStudentRegistration,
  sendRegistrationOtp,
  verifyRegistrationOtp,
} from '../api/account-flows';
import {
  registerSchema,
  type RegisterValues,
} from '../schemas/account-auth-schemas';

const registerErrorMessages: Readonly<Record<string, string>> = {
  ACCOUNT_TAKEN: '這個帳號（學號）已被使用',
  EMAIL_NOT_VERIFIED: '請先完成 E-mail 認證',
  INVALID_CLASSROOM_CODE: '班級序號無效，請向老師確認',
  NICKNAME_BANNED: '暱稱包含不適當字詞，請重新命名',
  NICKNAME_EMOJI: '暱稱不能使用表情符號',
  NICKNAME_LENGTH: '暱稱需為 2 至 16 個字',
  WEAK_PASSWORD: '密碼需為 6 至 12 碼並包含大小寫英文字母',
};

const messageForRegisterError = (error: unknown) =>
  error instanceof AccountFlowError
    ? (registerErrorMessages[error.code] ?? '註冊失敗，請稍後重試')
    : '註冊失敗，請稍後重試';

type EmailVerification = 'idle' | 'sending' | 'sent' | 'verifying' | 'verified';

export function RegisterPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const pendingSubmission = useRef(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [verification, setVerification] = useState<EmailVerification>('idle');
  const [verificationError, setVerificationError] = useState<string | null>(
    null,
  );
  const [otpCode, setOtpCode] = useState('');
  const {
    formState: { errors, isSubmitting },
    getValues,
    handleSubmit,
    register,
    trigger,
  } = useForm<RegisterValues>({
    defaultValues: {
      account: '',
      classCode: '',
      email: '',
      fullName: '',
      nickname: '',
      password: '',
      passwordConfirm: '',
    },
    resolver: zodResolver(registerSchema),
  });

  const emailLocked = verification === 'verified';

  const sendOtp = async () => {
    setVerificationError(null);
    const emailValid = await trigger('email');
    if (!emailValid) return;
    setVerification('sending');
    try {
      await sendRegistrationOtp(getValues('email').trim());
      setVerification('sent');
    } catch {
      setVerification('idle');
      setVerificationError('驗證碼寄送失敗，請稍後重試');
    }
  };

  const verifyOtp = async () => {
    if (otpCode.trim().length === 0) {
      setVerificationError('請輸入收到的 6 碼驗證碼');
      return;
    }
    setVerificationError(null);
    setVerification('verifying');
    try {
      await verifyRegistrationOtp(getValues('email').trim(), otpCode.trim());
      setVerification('verified');
    } catch {
      setVerification('sent');
      setVerificationError('驗證碼不正確或已過期，請重試');
    }
  };

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
      <p className="route-panel__eyebrow">學生入口</p>
      <h1>註冊帳號</h1>
      <p className="route-panel__message">
        填寫資料並完成 E-mail 認證，即可加入班級開始學習。
      </p>

      <form
        className="login-form"
        data-interaction-group="register"
        noValidate
        onSubmit={(event) => {
          void handleSubmit(async (values) => {
            if (pendingSubmission.current) return;
            if (verification !== 'verified') {
              setSubmitError('請先完成 E-mail 認證');
              return;
            }
            pendingSubmission.current = true;
            setSubmitError(null);
            try {
              await completeStudentRegistration({
                account: values.account.trim(),
                classCode: values.classCode.trim(),
                fullName: values.fullName.trim(),
                nickname: values.nickname.trim(),
                password: values.password,
              });
              toast({
                message: '註冊成功，歡迎加入 ColorPlay！',
                tone: 'success',
              });
              await navigate('/app', { replace: true });
            } catch (error) {
              setSubmitError(messageForRegisterError(error));
            } finally {
              pendingSubmission.current = false;
            }
          })(event);
        }}
      >
        <div className="login-form__field">
          <label htmlFor="register-full-name">名字</label>
          <input
            {...register('fullName')}
            aria-describedby={
              errors.fullName ? 'register-full-name-error' : undefined
            }
            aria-invalid={errors.fullName ? 'true' : 'false'}
            autoComplete="name"
            id="register-full-name"
            type="text"
          />
          {errors.fullName ? (
            <p
              className="login-form__field-error"
              id="register-full-name-error"
            >
              {errors.fullName.message}
            </p>
          ) : null}
        </div>

        <div className="login-form__field">
          <label htmlFor="register-nickname">暱稱</label>
          <input
            {...register('nickname')}
            aria-describedby="register-nickname-hint register-nickname-error"
            aria-invalid={errors.nickname ? 'true' : 'false'}
            autoComplete="off"
            id="register-nickname"
            type="text"
          />
          <p className="login-form__field-hint" id="register-nickname-hint">
            將顯示於遊戲與排行榜；不可使用不雅字詞或表情符號。
          </p>
          {errors.nickname ? (
            <p className="login-form__field-error" id="register-nickname-error">
              {errors.nickname.message}
            </p>
          ) : null}
        </div>

        <div className="login-form__field">
          <label htmlFor="register-class-code">班級序號</label>
          <input
            {...register('classCode')}
            aria-describedby="register-class-code-hint register-class-code-error"
            aria-invalid={errors.classCode ? 'true' : 'false'}
            autoComplete="off"
            id="register-class-code"
            type="text"
          />
          <p className="login-form__field-hint" id="register-class-code-hint">
            由老師提供的 16 碼班級序號（可含「-」分隔），註冊後自動加入該班級。
          </p>
          {errors.classCode ? (
            <p
              className="login-form__field-error"
              id="register-class-code-error"
            >
              {errors.classCode.message}
            </p>
          ) : null}
        </div>

        <div className="login-form__field">
          <label htmlFor="register-email">E-mail</label>
          <div className="login-form__inline-row">
            <input
              {...register('email')}
              aria-describedby={
                errors.email ? 'register-email-error' : undefined
              }
              aria-invalid={errors.email ? 'true' : 'false'}
              autoComplete="email"
              disabled={emailLocked}
              id="register-email"
              inputMode="email"
              type="email"
            />
            {emailLocked ? (
              <Chip tone="success">✓ 已認證</Chip>
            ) : (
              <button
                className="login-form__secondary-action"
                disabled={verification === 'sending'}
                onClick={() => {
                  void sendOtp();
                }}
                type="button"
              >
                {verification === 'sending'
                  ? '寄送中…'
                  : verification === 'idle'
                    ? '傳送驗證碼'
                    : '重新傳送'}
              </button>
            )}
          </div>
          {errors.email ? (
            <p className="login-form__field-error" id="register-email-error">
              {errors.email.message}
            </p>
          ) : null}
        </div>

        {verification === 'sent' || verification === 'verifying' ? (
          <div className="login-form__field">
            <label htmlFor="register-otp">E-mail 驗證碼</label>
            <div className="login-form__inline-row">
              <input
                autoComplete="one-time-code"
                id="register-otp"
                inputMode="numeric"
                maxLength={6}
                onChange={(event) => {
                  setOtpCode(event.target.value);
                }}
                type="text"
                value={otpCode}
              />
              <button
                className="login-form__secondary-action"
                disabled={verification === 'verifying'}
                onClick={() => {
                  void verifyOtp();
                }}
                type="button"
              >
                {verification === 'verifying' ? '驗證中…' : '確認驗證'}
              </button>
            </div>
            <p className="login-form__field-hint">
              驗證碼已寄至你的信箱，1 小時內有效。
            </p>
          </div>
        ) : null}

        {verificationError ? (
          <p className="login-form__submit-error" role="alert">
            {verificationError}
          </p>
        ) : null}

        <div className="login-form__field">
          <label htmlFor="register-account">帳號（學號）</label>
          <input
            {...register('account')}
            aria-describedby={
              errors.account ? 'register-account-error' : undefined
            }
            aria-invalid={errors.account ? 'true' : 'false'}
            autoComplete="username"
            id="register-account"
            type="text"
          />
          {errors.account ? (
            <p className="login-form__field-error" id="register-account-error">
              {errors.account.message}
            </p>
          ) : null}
        </div>

        <div className="login-form__field">
          <label htmlFor="register-password">密碼</label>
          <input
            {...register('password')}
            aria-describedby="register-password-hint register-password-error"
            aria-invalid={errors.password ? 'true' : 'false'}
            autoComplete="new-password"
            id="register-password"
            type="password"
          />
          <p className="login-form__field-hint" id="register-password-hint">
            密碼長度 6～12 碼，需要包含英文大小寫。
          </p>
          {errors.password ? (
            <p className="login-form__field-error" id="register-password-error">
              {errors.password.message}
            </p>
          ) : null}
        </div>

        <div className="login-form__field">
          <label htmlFor="register-password-confirm">密碼確認</label>
          <input
            {...register('passwordConfirm')}
            aria-describedby="register-password-confirm-hint register-password-confirm-error"
            aria-invalid={errors.passwordConfirm ? 'true' : 'false'}
            autoComplete="new-password"
            id="register-password-confirm"
            type="password"
          />
          <p
            className="login-form__field-hint"
            id="register-password-confirm-hint"
          >
            再填一次密碼。
          </p>
          {errors.passwordConfirm ? (
            <p
              className="login-form__field-error"
              id="register-password-confirm-error"
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
          {isSubmitting ? '註冊處理中，請稍候' : null}
        </p>
        <div className="login-form__action-row">
          <button
            className="primary-action"
            data-acceptance-interactive="true"
            data-acceptance-target
            data-primary-action="true"
            disabled={isSubmitting || verification !== 'verified'}
            type="submit"
          >
            {isSubmitting ? '註冊中…' : '完成註冊'}
          </button>
        </div>
        <div className="login-form__links">
          <Link className="login-form__link" to="/login">
            已有帳號？返回登入
          </Link>
        </div>
      </form>
    </section>
  );
}
