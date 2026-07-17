import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useParams } from 'react-router-dom';
import { z } from 'zod';

import { RouteLoading } from '../../../app/boundaries/route-loading';
import {
  useClassroomAssignments,
  useCreateAssignment,
  useUpdateAssignmentStatus,
} from '../hooks/use-assignments';
import {
  type AssignmentRepository,
  AssignmentRepositoryError,
  type AssignmentStatus,
  type ClassroomAssignment,
} from '../types';

const QUIZ_TEMPLATE_ID = '26000000-0000-0000-0000-000000000003';

const createSchema = z.strictObject({
  attemptLimit: z
    .string()
    .trim()
    .regex(/^$|^[1-9][0-9]*$/u, '次數上限需為正整數'),
  availableFrom: z.string(),
  deadlineAt: z.string(),
  passingThreshold: z
    .string()
    .trim()
    .regex(/^[0-9]+$/u, '及格分數需為 0 以上的整數'),
  title: z
    .string()
    .trim()
    .min(1, '作業標題為 1 至 120 個字元')
    .max(120, '作業標題為 1 至 120 個字元'),
});
type CreateValues = z.infer<typeof createSchema>;

const statusLabels: Readonly<Record<AssignmentStatus, string>> = {
  archived: '已封存',
  draft: '草稿',
  paused: '已暫停',
  published: '進行中',
};

const transitionLabels: Readonly<
  Record<'archive' | 'pause' | 'publish', string>
> = {
  archive: '封存',
  pause: '暫停',
  publish: '發佈',
};

const taipeiTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('zh-TW', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Asia/Taipei',
      })
    : '未設定';

// The form promises Taipei semantics, so the wall time the teacher types is
// interpreted as Asia/Taipei (fixed UTC+8, Taiwan has no DST) regardless of
// the browser's own timezone.
const localInputToIso = (value: string) =>
  value.trim().length === 0
    ? null
    : new Date(`${value}:00+08:00`).toISOString();

const mutationErrorMessage = (error: unknown) => {
  if (error instanceof AssignmentRepositoryError) {
    if (error.code === 'STATUS_CONFLICT')
      return '作業狀態已被更新，請重新整理後再試。';
    if (error.code === 'INVALID_TRANSITION') return '這個狀態轉換不被允許。';
    if (error.code === 'NOT_FOUND') return '找不到這份作業，或你沒有管理權限。';
  }
  return '操作暫時無法完成，請稍後重試。';
};

type PendingTransition = Readonly<{
  action: 'archive' | 'pause' | 'publish';
  assignment: ClassroomAssignment;
  status: AssignmentStatus;
}>;

export function TeacherAssignmentsPage({
  classroomId: suppliedClassroomId,
  repository,
}: Readonly<{
  classroomId?: string;
  repository?: AssignmentRepository;
}>) {
  const params = useParams();
  const classroomId = suppliedClassroomId ?? params.classroomId ?? '';
  const assignments = useClassroomAssignments(classroomId, repository);
  const create = useCreateAssignment(classroomId, repository);
  const updateStatus = useUpdateAssignmentStatus(classroomId, repository);
  const [submitError, setSubmitError] = useState<string>();
  const [transitionError, setTransitionError] = useState<string>();
  const [confirming, setConfirming] = useState<PendingTransition | null>(null);
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
  } = useForm<CreateValues>({
    defaultValues: {
      attemptLimit: '',
      availableFrom: '',
      deadlineAt: '',
      passingThreshold: '600',
      title: '',
    },
    resolver: zodResolver(createSchema),
  });

  if (assignments.isPending) return <RouteLoading withinMain />;
  if (assignments.isError) {
    return (
      <section className="route-panel">
        <h1>作業管理</h1>
        <p role="alert">無法載入作業資料，或你沒有管理權限。</p>
        <button
          className="primary-action"
          onClick={() => void assignments.refetch()}
          type="button"
        >
          重試
        </button>
      </section>
    );
  }

  const confirmTransition = async (transition: PendingTransition) => {
    setTransitionError(undefined);
    try {
      await updateStatus.mutateAsync({
        assignmentId: transition.assignment.assignmentId,
        expectedUpdatedAt: transition.assignment.updatedAt,
        status: transition.status,
      });
      setConfirming(null);
    } catch (error) {
      setConfirming(null);
      setTransitionError(mutationErrorMessage(error));
    }
  };

  const transitionsFor = (
    assignment: ClassroomAssignment,
  ): readonly PendingTransition[] => {
    if (assignment.status === 'draft') {
      return [
        { action: 'publish', assignment, status: 'published' },
        { action: 'archive', assignment, status: 'archived' },
      ];
    }
    if (assignment.status === 'published') {
      return [
        { action: 'pause', assignment, status: 'paused' },
        { action: 'archive', assignment, status: 'archived' },
      ];
    }
    if (assignment.status === 'paused') {
      return [
        { action: 'publish', assignment, status: 'published' },
        { action: 'archive', assignment, status: 'archived' },
      ];
    }
    return [];
  };

  return (
    <section
      aria-labelledby="teacher-assignments-title"
      className="w-full max-w-5xl"
    >
      <header>
        <p className="route-panel__eyebrow">教師作業管理</p>
        <h1 id="teacher-assignments-title">班級作業</h1>
        <p>期限以台北時間顯示；完成與及格由伺服器結算，無法由瀏覽器修改。</p>
      </header>

      <form
        aria-label="建立作業"
        data-interaction-group="create-assignment"
        onSubmit={(event) => {
          void handleSubmit(async (values) => {
            setSubmitError(undefined);
            try {
              await create.mutateAsync({
                attemptLimit:
                  values.attemptLimit.trim().length === 0
                    ? null
                    : Number.parseInt(values.attemptLimit, 10),
                availableFrom: localInputToIso(values.availableFrom),
                classroomId,
                deadlineAt: localInputToIso(values.deadlineAt),
                passingThreshold: Number.parseInt(values.passingThreshold, 10),
                quizTemplateId: QUIZ_TEMPLATE_ID,
                title: values.title,
              });
              reset();
            } catch (error) {
              setSubmitError(
                error instanceof AssignmentRepositoryError &&
                  error.code === 'VALIDATION'
                  ? '作業設定不完整，請確認題庫與及格分數。'
                  : mutationErrorMessage(error),
              );
            }
          })(event);
        }}
      >
        <h2>建立新作業</h2>
        <label htmlFor="assignment-title">作業標題</label>
        <input
          id="assignment-title"
          type="text"
          {...register('title')}
          aria-invalid={errors.title ? true : undefined}
        />
        {errors.title ? <p role="alert">{errors.title.message}</p> : null}
        <label htmlFor="assignment-available-from">
          開放時間（台北時間，可留空）
        </label>
        <input
          id="assignment-available-from"
          type="datetime-local"
          {...register('availableFrom')}
        />
        <label htmlFor="assignment-deadline">
          截止時間（台北時間，可留空）
        </label>
        <input
          id="assignment-deadline"
          type="datetime-local"
          {...register('deadlineAt')}
        />
        <label htmlFor="assignment-attempt-limit">次數上限（可留空）</label>
        <input
          id="assignment-attempt-limit"
          inputMode="numeric"
          type="text"
          {...register('attemptLimit')}
          aria-invalid={errors.attemptLimit ? true : undefined}
        />
        {errors.attemptLimit ? (
          <p role="alert">{errors.attemptLimit.message}</p>
        ) : null}
        <label htmlFor="assignment-passing-threshold">及格分數</label>
        <input
          id="assignment-passing-threshold"
          inputMode="numeric"
          type="text"
          {...register('passingThreshold')}
          aria-invalid={errors.passingThreshold ? true : undefined}
        />
        {errors.passingThreshold ? (
          <p role="alert">{errors.passingThreshold.message}</p>
        ) : null}
        <button
          className="primary-action"
          disabled={isSubmitting || create.isPending}
          type="submit"
        >
          {create.isPending ? '建立中…' : '建立作業'}
        </button>
        {submitError ? <p role="alert">{submitError}</p> : null}
      </form>

      {transitionError ? <p role="alert">{transitionError}</p> : null}
      {assignments.data.length === 0 ? (
        <p>目前沒有作業。</p>
      ) : (
        <table>
          <caption>班級作業清單</caption>
          <thead>
            <tr>
              <th scope="col">標題</th>
              <th scope="col">狀態</th>
              <th scope="col">截止時間</th>
              <th scope="col">次數上限</th>
              <th scope="col">目標人數</th>
              <th scope="col">完成人數</th>
              <th scope="col">操作</th>
            </tr>
          </thead>
          <tbody>
            {assignments.data.map((assignment) => (
              <tr key={assignment.assignmentId}>
                <th scope="row">{assignment.title}</th>
                <td>{statusLabels[assignment.status]}</td>
                <td>{taipeiTime(assignment.deadlineAt)}</td>
                <td>{assignment.attemptLimit ?? '不限'}</td>
                <td>{assignment.targetCount}</td>
                <td>{assignment.completedCount}</td>
                <td>
                  {transitionsFor(assignment).map((transition) => (
                    <button
                      disabled={updateStatus.isPending}
                      key={transition.action}
                      onClick={() => {
                        setTransitionError(undefined);
                        setConfirming(transition);
                      }}
                      type="button"
                    >
                      {transitionLabels[transition.action]}
                    </button>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {confirming ? (
        <div
          aria-labelledby="assignment-transition-title"
          aria-modal="true"
          role="dialog"
        >
          <h2 id="assignment-transition-title">
            {`${transitionLabels[confirming.action]}「${confirming.assignment.title}」？`}
          </h2>
          <p>
            {confirming.status === 'published'
              ? '發佈後，班級內的學生會立即成為作業對象。'
              : confirming.status === 'paused'
                ? '暫停後，學生暫時無法開始新的作答。'
                : '封存後，這份作業將永久停用，無法再發佈。'}
          </p>
          <button
            disabled={updateStatus.isPending}
            onClick={() => {
              setConfirming(null);
            }}
            type="button"
          >
            取消
          </button>
          <button
            className="primary-action"
            disabled={updateStatus.isPending}
            onClick={() => void confirmTransition(confirming)}
            type="button"
          >
            {updateStatus.isPending ? '處理中…' : '確認'}
          </button>
        </div>
      ) : null}
    </section>
  );
}
