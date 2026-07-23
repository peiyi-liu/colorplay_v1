import { zodResolver } from '@hookform/resolvers/zod';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { useJoinLive } from '../hooks/use-live-commands';
import { type LiveRepository, LiveRepositoryError } from '../types';

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
  } = useForm<JoinValues>({
    defaultValues: { joinCode: '' },
    resolver: zodResolver(joinSchema),
  });

  return (
    <section aria-labelledby="live-join-title" className="live-join">
      <header>
        <p className="route-panel__eyebrow">ColorPlay Live</p>
        <h1 id="live-join-title">加入課堂挑戰</h1>
        <p>輸入老師公布的課堂代碼，即可進入等待室。</p>
      </header>
      <form
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
        <label htmlFor="live-join-code">課堂代碼</label>
        <input
          autoComplete="off"
          id="live-join-code"
          inputMode="numeric"
          maxLength={6}
          placeholder="000000"
          type="text"
          {...register('joinCode')}
          aria-invalid={errors.joinCode ? true : undefined}
        />
        {errors.joinCode ? <p role="alert">{errors.joinCode.message}</p> : null}
        <button
          className="primary-action"
          data-primary-action="true"
          disabled={join.isPending}
          type="submit"
        >
          {join.isPending ? '加入中…' : '加入課堂'}
        </button>
        {joinError ? <p role="alert">{joinError}</p> : null}
      </form>
    </section>
  );
}
