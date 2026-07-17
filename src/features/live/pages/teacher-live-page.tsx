import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { z } from 'zod';

import { RouteLoading } from '../../../app/boundaries/route-loading';
import { useOwnedClassrooms } from '../../classrooms/hooks/use-classrooms';
import {
  useCreateLiveActivity,
  useCreateLiveSession,
  useLiveActivities,
} from '../hooks/use-live-commands';
import type { LiveRepository, LiveSessionReceipt } from '../types';

const QUIZ_TEMPLATE_ID = '26000000-0000-0000-0000-000000000003';

const createSchema = z.strictObject({
  timeLimit: z
    .string()
    .trim()
    .regex(/^[0-9]+$/u, '每題秒數需為 5 到 120 的整數')
    .refine((value) => {
      const seconds = Number.parseInt(value, 10);
      return seconds >= 5 && seconds <= 120;
    }, '每題秒數需為 5 到 120 的整數'),
  title: z
    .string()
    .trim()
    .min(1, '活動標題為 1 至 120 個字元')
    .max(120, '活動標題為 1 至 120 個字元'),
});
type CreateValues = z.infer<typeof createSchema>;

export function TeacherLivePage({
  repository,
}: Readonly<{ repository?: LiveRepository }>) {
  const activities = useLiveActivities(repository);
  const classrooms = useOwnedClassrooms();
  const createActivity = useCreateLiveActivity(repository);
  const createSession = useCreateLiveSession(repository);
  const [receipt, setReceipt] = useState<LiveSessionReceipt | null>(null);
  const [actionError, setActionError] = useState<string>();
  const [selectedClassroomId, setSelectedClassroomId] = useState('');
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
  } = useForm<CreateValues>({
    defaultValues: { timeLimit: '20', title: '' },
    resolver: zodResolver(createSchema),
  });

  if (activities.isPending || classrooms.isPending) {
    return <RouteLoading withinMain />;
  }
  if (activities.isError) {
    return (
      <section className="route-panel">
        <h1>Live 課堂主持</h1>
        <p role="alert">無法載入 Live 活動，請稍後重試。</p>
        <button
          className="primary-action"
          onClick={() => void activities.refetch()}
          type="button"
        >
          重試
        </button>
      </section>
    );
  }

  const startSessionFor = async (activityId: string) => {
    setActionError(undefined);
    setReceipt(null);
    if (!selectedClassroomId) {
      setActionError('請先選擇要挑戰的班級。');
      return;
    }
    try {
      const created = await createSession.mutateAsync({
        activityId,
        assignmentId: null,
        classroomId: selectedClassroomId,
      });
      setReceipt(created);
    } catch {
      setActionError('目前無法建立課堂場次，請稍後重試。');
    }
  };

  return (
    <section aria-labelledby="teacher-live-title" className="w-full max-w-4xl">
      <header>
        <p className="route-panel__eyebrow">ColorPlay Live</p>
        <h1 id="teacher-live-title">Live 課堂主持</h1>
        <p>建立活動後開場，把一次性課堂代碼投影給學生輸入。</p>
      </header>

      <form
        aria-label="建立 Live 活動"
        data-interaction-group="create-live-activity"
        onSubmit={(event) => {
          void handleSubmit(async (values) => {
            setActionError(undefined);
            try {
              await createActivity.mutateAsync({
                questionTimeLimitSeconds: Number.parseInt(values.timeLimit, 10),
                quizTemplateId: QUIZ_TEMPLATE_ID,
                title: values.title,
              });
              reset();
            } catch {
              setActionError('目前無法建立活動，請稍後重試。');
            }
          })(event);
        }}
      >
        <h2>建立新活動</h2>
        <label htmlFor="live-activity-title">活動標題</label>
        <input
          id="live-activity-title"
          type="text"
          {...register('title')}
          aria-invalid={errors.title ? true : undefined}
        />
        {errors.title ? <p role="alert">{errors.title.message}</p> : null}
        <label htmlFor="live-activity-time-limit">每題秒數</label>
        <input
          id="live-activity-time-limit"
          inputMode="numeric"
          type="text"
          {...register('timeLimit')}
          aria-invalid={errors.timeLimit ? true : undefined}
        />
        {errors.timeLimit ? (
          <p role="alert">{errors.timeLimit.message}</p>
        ) : null}
        <button
          className="primary-action"
          disabled={isSubmitting || createActivity.isPending}
          type="submit"
        >
          {createActivity.isPending ? '建立中…' : '建立活動'}
        </button>
      </form>

      <div>
        <label htmlFor="live-session-classroom">開場班級</label>
        <select
          id="live-session-classroom"
          onChange={(event) => {
            setSelectedClassroomId(event.target.value);
          }}
          value={selectedClassroomId}
        >
          <option value="">請選擇班級</option>
          {(classrooms.data ?? []).map((classroom) => (
            <option key={classroom.classroomId} value={classroom.classroomId}>
              {classroom.classroomName}
            </option>
          ))}
        </select>
      </div>

      {actionError ? <p role="alert">{actionError}</p> : null}
      {receipt ? (
        <div role="status">
          <h2>課堂代碼（只顯示一次）</h2>
          <p aria-label="課堂代碼">
            <strong>{receipt.joinCode}</strong>
          </p>
          <p>把代碼投影給學生後,前往主持台開始挑戰。</p>
          <Link
            className="primary-action"
            to={`/teacher/live/${receipt.sessionId}`}
          >
            前往主持台
          </Link>
        </div>
      ) : null}

      {activities.data.length === 0 ? (
        <p>目前沒有 Live 活動。</p>
      ) : (
        <table>
          <caption>我的 Live 活動</caption>
          <thead>
            <tr>
              <th scope="col">標題</th>
              <th scope="col">每題秒數</th>
              <th scope="col">狀態</th>
              <th scope="col">操作</th>
            </tr>
          </thead>
          <tbody>
            {activities.data.map((activity) => (
              <tr key={activity.activityId}>
                <th scope="row">{activity.title}</th>
                <td>{activity.questionTimeLimitSeconds} 秒</td>
                <td>{activity.status === 'active' ? '可使用' : '已封存'}</td>
                <td>
                  <button
                    disabled={createSession.isPending}
                    onClick={() => void startSessionFor(activity.activityId)}
                    type="button"
                  >
                    開新場次
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
