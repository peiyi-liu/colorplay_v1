import { zodResolver } from '@hookform/resolvers/zod';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { z } from 'zod';

import { RouteLoading } from '../../../app/boundaries/route-loading';
import { ClassroomCodeReceiptView } from '../components/classroom-code-receipt';
import {
  useCreateClassroom,
  useOwnedClassrooms,
} from '../hooks/use-classrooms';
import {
  type ClassroomCodeReceipt,
  type ClassroomRepository,
  ClassroomRepositoryError,
} from '../types';

const createSchema = z.strictObject({
  name: z
    .string()
    .trim()
    .min(1, '班級名稱為 1 至 80 個字元')
    .max(80, '班級名稱為 1 至 80 個字元'),
});
type CreateValues = z.infer<typeof createSchema>;

const createErrorMessage = (error: unknown) =>
  error instanceof ClassroomRepositoryError && error.code === 'AMBIGUOUS_WRITE'
    ? '建立結果不明，請先檢查班級列表；若沒有班級，再重新建立。'
    : '目前無法建立班級，請稍後重試。';

export function TeacherClassroomsPage({
  repository,
}: Readonly<{ repository?: ClassroomRepository }>) {
  const classrooms = useOwnedClassrooms(repository);
  const create = useCreateClassroom(repository);
  const pending = useRef(false);
  const [receipt, setReceipt] = useState<ClassroomCodeReceipt | null>(null);
  const [submitError, setSubmitError] = useState<string>();
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
  } = useForm<CreateValues>({
    defaultValues: { name: '' },
    resolver: zodResolver(createSchema),
  });

  if (classrooms.isPending) return <RouteLoading withinMain />;
  if (classrooms.isError) {
    return (
      <section className="route-panel">
        <h1>班級管理</h1>
        <p role="alert">班級資料載入失敗，請稍後重試。</p>
        <button
          className="primary-action"
          onClick={() => void classrooms.refetch()}
          type="button"
        >
          重試
        </button>
      </section>
    );
  }

  const isPending = isSubmitting || create.isPending;
  return (
    <section aria-labelledby="teacher-classrooms-title" className="page-wide">
      <header>
        <p className="route-panel__eyebrow">教師工作區</p>
        <h1 id="teacher-classrooms-title">班級管理</h1>
        <p>建立班級後，加入碼只會在伺服器回應時顯示一次。</p>
      </header>
      <form
        className="route-panel"
        data-interaction-group="create-classroom"
        noValidate
        onSubmit={(event) => {
          void handleSubmit(async (values) => {
            if (pending.current) return;
            pending.current = true;
            setReceipt(null);
            setSubmitError(undefined);
            try {
              const nextReceipt = await create.mutateAsync(values);
              setReceipt(nextReceipt);
              reset();
            } catch (error) {
              setSubmitError(createErrorMessage(error));
            } finally {
              pending.current = false;
            }
          })(event);
        }}
      >
        <label htmlFor="classroom-name">班級名稱</label>
        <input
          {...register('name')}
          aria-describedby={errors.name ? 'classroom-name-error' : undefined}
          aria-invalid={errors.name ? 'true' : 'false'}
          id="classroom-name"
          type="text"
        />
        {errors.name ? (
          <p id="classroom-name-error">{errors.name.message}</p>
        ) : null}
        {submitError ? <p role="alert">{submitError}</p> : null}
        <button
          className="primary-action"
          data-primary-action="true"
          disabled={isPending}
          type="submit"
        >
          {isPending ? '建立中…' : '建立班級'}
        </button>
      </form>
      {receipt ? (
        <ClassroomCodeReceiptView
          onDismiss={() => {
            setReceipt(null);
          }}
          receipt={receipt}
        />
      ) : null}
      {classrooms.data.length === 0 ? (
        <p>尚未建立班級。</p>
      ) : (
        <ul aria-label="教師班級列表">
          {classrooms.data.map((classroom) => (
            <li key={classroom.classroomId}>
              <article>
                <h2>{classroom.classroomName}</h2>
                <p>{String(classroom.memberCount)} 位有效學生</p>
                <Link to={`/teacher/classes/${classroom.classroomId}`}>
                  管理班級
                </Link>
              </article>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
