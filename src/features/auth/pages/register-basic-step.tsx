import type { FieldErrors, UseFormRegister } from 'react-hook-form';

import type { RegisterValues } from '../schemas/account-auth-schemas';

export function RegisterBasicStep({
  errors,
  onNext,
  register,
}: Readonly<{
  errors: FieldErrors<RegisterValues>;
  onNext(): void;
  register: UseFormRegister<RegisterValues>;
}>) {
  return (
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
          <p className="login-form__field-error" id="register-full-name-error">
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
          2～16 個字，將顯示於遊戲與排行榜。
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
          輸入老師提供的 8 碼班級序號；既有 16 碼序號仍可使用。
        </p>
        {errors.classCode ? (
          <p className="login-form__field-error" id="register-class-code-error">
            {errors.classCode.message}
          </p>
        ) : null}
      </div>

      <div className="auth-register-actions">
        <button className="primary-action" onClick={onNext} type="button">
          下一步
        </button>
      </div>
    </fieldset>
  );
}
