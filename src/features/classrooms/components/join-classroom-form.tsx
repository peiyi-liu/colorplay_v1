import { zodResolver } from '@hookform/resolvers/zod';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { useJoinClassroom } from '../hooks/use-classrooms';
import { type ClassroomRepository, ClassroomRepositoryError } from '../types';

const joinCodeSchema = z.strictObject({
  joinCode: z
    .string()
    .trim()
    .regex(/^[0-9a-f]{4}(?:-?[0-9a-f]{4}){3}$/iu, '請輸入有效的班級加入碼'),
});
type JoinCodeValues = z.infer<typeof joinCodeSchema>;

const messageForError = (error: unknown) => {
  if (
    error instanceof ClassroomRepositoryError &&
    (error.code === 'INVALID_CODE' || error.code === 'NOT_AVAILABLE')
  ) {
    return '加入碼無效或已失效，請向老師確認。';
  }
  if (
    error instanceof ClassroomRepositoryError &&
    error.code === 'AUTH_REQUIRED'
  ) {
    return '登入狀態已失效，請重新登入。';
  }
  return '目前無法加入班級，請稍後重試。';
};

export function JoinClassroomForm({
  initialJoinCode = '',
  onJoined,
  repository,
}: Readonly<{
  initialJoinCode?: string;
  onJoined(classroomId: string): void;
  repository?: ClassroomRepository;
}>) {
  const join = useJoinClassroom(repository);
  const pending = useRef(false);
  const [submitError, setSubmitError] = useState<string>();
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
  } = useForm<JoinCodeValues>({
    defaultValues: { joinCode: initialJoinCode },
    resolver: zodResolver(joinCodeSchema),
  });
  const isPending = isSubmitting || join.isPending;

  return (
    <form
      className="route-panel"
      data-interaction-group="join-classroom"
      noValidate
      onSubmit={(event) => {
        void handleSubmit(async ({ joinCode }) => {
          if (pending.current) return;
          pending.current = true;
          setSubmitError(undefined);
          try {
            const receipt = await join.mutateAsync(joinCode);
            onJoined(receipt.classroomId);
          } catch (error) {
            setSubmitError(messageForError(error));
          } finally {
            pending.current = false;
          }
        })(event);
      }}
    >
      <div className="login-form__field">
        <label htmlFor="classroom-join-code">班級加入碼</label>
        <input
          {...register('joinCode')}
          aria-describedby={
            errors.joinCode ? 'classroom-join-code-error' : undefined
          }
          aria-invalid={errors.joinCode ? 'true' : 'false'}
          autoComplete="off"
          id="classroom-join-code"
          spellCheck={false}
          type="text"
        />
        {errors.joinCode ? (
          <p id="classroom-join-code-error">{errors.joinCode.message}</p>
        ) : null}
      </div>
      {submitError ? <p role="alert">{submitError}</p> : null}
      <button
        className="primary-action"
        data-acceptance-interactive="true"
        data-primary-action="true"
        disabled={isPending}
        type="submit"
      >
        {isPending ? '加入中…' : '加入班級'}
      </button>
    </form>
  );
}
