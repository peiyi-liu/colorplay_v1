import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';

import { Chip } from '../../../components/ui/chip';
import { RpgWindow } from '../../../components/ui/rpg-window';
import { useToast } from '../../../components/ui/toast';
import { useAuth } from '../context/auth-context';
import {
  completeStudentRegistration,
  sendRegistrationOtp,
  verifyRegistrationOtp,
} from '../api/account-flows';
import {
  registerSchema,
  type RegisterValues,
} from '../schemas/account-auth-schemas';
import { RegisterBasicStep } from './register-basic-step';
import {
  type EmailVerification,
  messageForRegisterError,
  RegisterProgress,
  type RegisterStep,
} from './register-page-support';

const RESEND_COOLDOWN_SECONDS = 60;

export function RegisterPage() {
  const navigate = useNavigate();
  const auth = useAuth();
  const toast = useToast();
  const pendingSubmission = useRef(false);
  const [step, setStep] = useState<RegisterStep>('basic');
  const [furthestStep, setFurthestStep] = useState<RegisterStep>('basic');
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
    if (valid) {
      setFurthestStep((reached) => (reached === 'basic' ? 'email' : reached));
      setStep('email');
    }
  };

  const selectReachedStep = async (selectedStep: RegisterStep) => {
    if (selectedStep === 'basic' || selectedStep === 'email') {
      setStep(selectedStep);
      return;
    }

    const basicValid = await trigger(['fullName', 'nickname', 'classCode']);
    if (!basicValid) {
      setStep('basic');
      return;
    }
    const emailValid = await trigger('email');
    if (!emailValid || verification !== 'verified') {
      setStep('email');
      return;
    }
    setStep('credentials');
  };

  const editVerifiedEmail = () => {
    setVerification('idle');
    setVerificationError(null);
    setOtpCode('');
    setCooldownRemaining(0);
    setFurthestStep('email');
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
        <RegisterProgress
          currentStep={step}
          furthestStep={furthestStep}
          onSelect={(selectedStep) => {
            void selectReachedStep(selectedStep);
          }}
        />

        <form
          className="login-form auth-register-form"
          data-interaction-group="register"
          noValidate
          onSubmit={(event) => {
            if (step !== 'credentials') {
              event.preventDefault();
              return;
            }
            void handleSubmit(
              async (values) => {
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
                  await auth.signOut();
                  toast({
                    message: '註冊成功，請使用剛設定的帳號與密碼登入。',
                    tone: 'success',
                  });
                  await navigate('/login', { replace: true });
                } catch (error) {
                  setSubmitError(messageForRegisterError(error));
                } finally {
                  pendingSubmission.current = false;
                }
              },
              (invalidFields) => {
                if (
                  invalidFields.fullName ||
                  invalidFields.nickname ||
                  invalidFields.classCode
                ) {
                  setStep('basic');
                } else if (invalidFields.email || verification !== 'verified') {
                  setStep('email');
                } else {
                  setStep('credentials');
                }
              },
            )(event);
          }}
        >
          {step === 'basic' ? (
            <RegisterBasicStep
              errors={errors}
              onNext={() => {
                void goToEmailStep();
              }}
              register={register}
            />
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
                    <div className="auth-register-email-status">
                      <Chip tone="success">✓ 已認證</Chip>
                      <button
                        className="login-form__secondary-action"
                        onClick={editVerifiedEmail}
                        type="button"
                      >
                        更改 E-mail
                      </button>
                    </div>
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
                    setFurthestStep('credentials');
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
