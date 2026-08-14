import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';

import { Chip } from '../../../components/ui/chip';
import { RpgWindow } from '../../../components/ui/rpg-window';
import { useToast } from '../../../components/ui/toast';
import { myProfileQueryKey } from '../../profile/hooks/use-my-profile';
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
  ALREADY_IN_ACTIVE_CLASSROOM: '此帳號已加入其他班級，請聯絡老師辦理轉班',
  ALREADY_REGISTERED: '此 E-mail 已完成註冊，請返回登入',
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
type RegisterStep = 'basic' | 'email' | 'credentials';

const RESEND_COOLDOWN_SECONDS = 60;

const stepItems = [
  { id: 'basic', label: '基本資料', number: 1 },
  { id: 'email', label: 'E-mail 驗證', number: 2 },
  { id: 'credentials', label: '帳號與密碼', number: 3 },
] as const satisfies readonly {
  id: RegisterStep;
  label: string;
  number: number;
}[];

export function RegisterPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const pendingSubmission = useRef(false);
  const [step, setStep] = useState<RegisterStep>('basic');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [verification, setVerification] = useState<EmailVerification>('idle');
  const [verificationError, setVerificationError] = useState<string | null>(
    null,
  );
  const [otpCode, setOtpCode] = useState('');
  const [cooldownRemaining, setCooldownRemaining] = useState(0);

  useEffect(() => {
    if (cooldownRemaining <= 0) return undefined;
    const timer = setTimeout(() => {
      setCooldownRemaining((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => {
      clearTimeout(timer);
    };
  }, [cooldownRemaining]);

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

  const goToEmailStep = async () => {
    const valid = await trigger(['fullName', 'nickname', 'classCode']);
    if (valid) setStep('email');
  };

  const sendOtp = async () => {
    setVerificationError(null);
    const emailValid = await trigger('email');
    if (!emailValid) return;
    setVerification('sending');
    try {
      await sendRegistrationOtp(getValues('email').trim());
      setVerification('sent');
      setCooldownRemaining(RESEND_COOLDOWN_SECONDS);
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
    <section
      className="route-panel auth-portal auth-portal--register scene-night"
      data-portal="student"
      data-register-step={step}
    >
      <header className="auth-register-heading">
        <h1 className="pixel-heading">註冊帳號</h1>
        <Link className="auth-register-heading__back" to="/login">
          返回登入
        </Link>
      </header>

      <RpgWindow className="auth-window auth-window--register">
        <ol aria-label="註冊步驟" className="auth-register-progress">
          {stepItems.map((item) => (
            <li data-active={step === item.id} key={item.id}>
              <span aria-current={step === item.id ? 'step' : undefined}>
                <b aria-hidden="true">{String(item.number)}</b>
                {item.label}
              </span>
            </li>
          ))}
        </ol>

        <form
          className="login-form auth-register-form"
          data-interaction-group="register"
          noValidate
          onSubmit={(event) => {
            if (step !== 'credentials') {
              event.preventDefault();
              return;
            }
            void handleSubmit(async (values) => {
              if (pendingSubmission.current) return;
              if (verification !== 'verified') {
                setStep('email');
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
                await queryClient.invalidateQueries({
                  queryKey: myProfileQueryKey,
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
          {step === 'basic' ? (
            <fieldset className="auth-register-step">
              <legend>填寫基本資料</legend>
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
                <p
                  className="login-form__field-hint"
                  id="register-nickname-hint"
                >
                  2～16 個字，將顯示於遊戲與排行榜。
                </p>
                {errors.nickname ? (
                  <p
                    className="login-form__field-error"
                    id="register-nickname-error"
                  >
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
                <p
                  className="login-form__field-hint"
                  id="register-class-code-hint"
                >
                  輸入老師提供的 16 碼班級序號。
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

              <div className="auth-register-actions">
                <button
                  className="primary-action"
                  onClick={() => {
                    void goToEmailStep();
                  }}
                  type="button"
                >
                  下一步
                </button>
              </div>
            </fieldset>
          ) : null}

          {step === 'email' ? (
            <fieldset className="auth-register-step">
              <legend>完成 E-mail 驗證</legend>
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
                      disabled={
                        verification === 'sending' || cooldownRemaining > 0
                      }
                      onClick={() => {
                        void sendOtp();
                      }}
                      type="button"
                    >
                      {verification === 'sending'
                        ? '寄送中…'
                        : cooldownRemaining > 0
                          ? `${String(cooldownRemaining)} 秒後重送`
                          : verification === 'idle'
                            ? '傳送驗證碼'
                            : '重新傳送'}
                    </button>
                  )}
                </div>
                {errors.email ? (
                  <p
                    className="login-form__field-error"
                    id="register-email-error"
                  >
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
                </div>
              ) : null}

              {verification === 'verified' ? (
                <p className="auth-register-verified" role="status">
                  E-mail 已完成認證，可以繼續設定帳號。
                </p>
              ) : null}
              {verificationError ? (
                <p className="login-form__submit-error" role="alert">
                  {verificationError}
                </p>
              ) : null}

              <div className="auth-register-actions auth-register-actions--split">
                <button
                  className="auth-register-secondary"
                  onClick={() => {
                    setStep('basic');
                  }}
                  type="button"
                >
                  上一步
                </button>
                <button
                  className="primary-action"
                  disabled={!emailLocked}
                  onClick={() => {
                    setStep('credentials');
                  }}
                  type="button"
                >
                  下一步
                </button>
              </div>
            </fieldset>
          ) : null}

          {step === 'credentials' ? (
            <fieldset className="auth-register-step">
              <legend>設定帳號與密碼</legend>
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
                  <p
                    className="login-form__field-error"
                    id="register-account-error"
                  >
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
                <p
                  className="login-form__field-hint"
                  id="register-password-hint"
                >
                  6～12 碼，需包含英文大小寫。
                </p>
                {errors.password ? (
                  <p
                    className="login-form__field-error"
                    id="register-password-error"
                  >
                    {errors.password.message}
                  </p>
                ) : null}
              </div>

              <div className="login-form__field">
                <label htmlFor="register-password-confirm">密碼確認</label>
                <input
                  {...register('passwordConfirm')}
                  aria-describedby={
                    errors.passwordConfirm
                      ? 'register-password-confirm-error'
                      : undefined
                  }
                  aria-invalid={errors.passwordConfirm ? 'true' : 'false'}
                  autoComplete="new-password"
                  id="register-password-confirm"
                  type="password"
                />
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
              <p
                aria-live="polite"
                className="login-form__status"
                role="status"
              >
                {isSubmitting ? '註冊處理中，請稍候' : null}
              </p>
              <div className="auth-register-actions auth-register-actions--split">
                <button
                  className="auth-register-secondary"
                  onClick={() => {
                    setStep('email');
                  }}
                  type="button"
                >
                  上一步
                </button>
                <button
                  className="primary-action"
                  data-acceptance-interactive="true"
                  data-acceptance-target
                  data-primary-action="true"
                  disabled={isSubmitting}
                  type="submit"
                >
                  {isSubmitting ? '註冊中…' : '完成註冊'}
                </button>
              </div>
            </fieldset>
          ) : null}
        </form>
      </RpgWindow>
    </section>
  );
}
