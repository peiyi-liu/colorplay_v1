import { zodResolver } from '@hookform/resolvers/zod';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { useJoinLive } from '../hooks/use-live-commands';
import { type LiveRepository, LiveRepositoryError } from '../types';
import './live-join-page.css';

const joinSchema = z.strictObject({
  joinCode: z
    .string()
    .trim()
    .regex(/^[0-9]{6}$/u, '請輸入六位數字課堂代碼'),
});
type JoinValues = z.infer<typeof joinSchema>;

const joinErrorMessage = (error: unknown) => {
  if (error instanceof LiveRepositoryError) {
    if (error.code === 'JOIN_INVALID_CODE') {
      return '代碼無效或課堂尚未開放，請向老師確認。';
    }
    if (error.code === 'JOIN_RATE_LIMITED') {
      return '嘗試次數過多，請稍候一分鐘再試。';
    }
  }
  return '目前無法加入課堂，請稍後重試。';
};

export function LiveJoinPage({
  repository,
}: Readonly<{ repository?: LiveRepository }>) {
  const join = useJoinLive(repository);
  const navigate = useNavigate();
  const requestIdRef = useRef(crypto.randomUUID());
  const [joinError, setJoinError] = useState<string>();
  const {
    formState: { errors },
    handleSubmit,
    register,
    watch,
  } = useForm<JoinValues>({
    defaultValues: { joinCode: '' },
    resolver: zodResolver(joinSchema),
  });
  // watch() only drives the purely-visual digit cells below; this form
  // re-renders on every keystroke regardless (react-hook-form's own input
  // binding), so skipping compiler memoization here has no user-facing cost.
  // eslint-disable-next-line react-hooks/incompatible-library
  const typedCode = watch('joinCode');
  const visibleDigits = typedCode.trim().slice(0, 6).split('');
  const joinCodeField = register('joinCode');
  const fieldError = errors.joinCode?.message;
  const describedBy = [fieldError ? 'live-join-code-error' : undefined, joinError ? 'live-join-server-error' : undefined]
    .filter(Boolean)
    .join(' ');

  return (
    <section
      aria-labelledby="live-join-title"
      className="live-join live-join--portal scene-night"
    >
      <header className="live-join__header">
        <h1 id="live-join-title">
          加入 <span>Live</span> 課堂
        </h1>
        <p>輸入老師公布的課堂代碼，即可進入等待室。</p>
      </header>
      <form
        className="live-join__form"
        data-interaction-group="live-join"
        onSubmit={(event) => {
          void handleSubmit(async (values) => {
            setJoinError(undefined);
            try {
              const joined = await join.mutateAsync({
                joinCode: values.joinCode.trim(),
                requestId: requestIdRef.current,
              });
              void navigate(`/app/live/${joined.sessionId}`, {
                replace: true,
              });
            } catch (error) {
              setJoinError(joinErrorMessage(error));
            }
          })(event);
        }}
      >
        <label htmlFor="live-join-code">輸入 6 位加入代碼</label>
        <div className="live-join__code-control">
          <span aria-hidden="true" className="live-join__digits">
            {Array.from({ length: 6 }, (_, index) => (
              <span
                className={
                  visibleDigits[index]
                    ? 'live-join__digit live-join__digit--filled'
                    : 'live-join__digit'
                }
                key={index}
              >
                {visibleDigits[index] ?? ''}
              </span>
            ))}
          </span>
          <input
            aria-describedby={describedBy || undefined}
            aria-invalid={fieldError || joinError ? true : undefined}
            autoComplete="one-time-code"
            id="live-join-code"
            inputMode="numeric"
            maxLength={6}
            pattern="[0-9]*"
            type="text"
            {...joinCodeField}
            onChange={(event) => {
              event.target.value = event.target.value
                .replace(/[^0-9]/gu, '')
                .slice(0, 6);
              void joinCodeField.onChange(event);
            }}
          />
        </div>
        {fieldError ? (
          <p id="live-join-code-error" role="alert">
            {fieldError}
          </p>
        ) : null}
        <button
          className="primary-action"
          data-primary-action="true"
          disabled={join.isPending}
          type="submit"
        >
          {join.isPending ? '加入中…' : '加入課堂'}
        </button>
        {joinError ? (
          <p id="live-join-server-error" role="alert">
            {joinError}
          </p>
        ) : null}
      </form>
    </section>
  );
}
