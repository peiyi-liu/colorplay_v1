import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { RouteLoading } from '../../../app/boundaries/route-loading';
import { useOwnedClassrooms } from '../../classrooms/hooks/use-classrooms';
import { presenterJoinCodeKey } from '../components/live-presenter';
import {
  useCreateLiveActivity,
  useLaunchLiveSession,
  useLiveActivities,
  useLiveSectionOptions,
} from '../hooks/use-live-commands';
import type { LiveRepository } from '../types';

const createSchema = z.strictObject({
  sectionId: z.string().min(1, '請選擇要對戰的單元'),
  timeLimit: z
    .string()
    .trim()
    .regex(/^[0-9]+$/u, '每題秒數需為 5 到 120 的整數')
    .refine((value) => {
      const seconds = Number.parseInt(value, 10);
      return seconds >= 5 && seconds <= 120;
    }, '每題秒數需為 5 到 120 的整數'),
});
type CreateValues = z.infer<typeof createSchema>;

export function TeacherLivePage({
  repository,
}: Readonly<{ repository?: LiveRepository }>) {
  const navigate = useNavigate();
  const activities = useLiveActivities(repository);
  const sections = useLiveSectionOptions(repository);
  const classrooms = useOwnedClassrooms();
  const createActivity = useCreateLiveActivity(repository);
  const launchSession = useLaunchLiveSession(repository);
  const [actionError, setActionError] = useState<string>();
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
  } = useForm<CreateValues>({
    defaultValues: { sectionId: '', timeLimit: '20' },
    resolver: zodResolver(createSchema),
  });

  if (activities.isPending || classrooms.isPending || sections.isPending) {
    return <RouteLoading withinMain />;
  }
  if (activities.isError || sections.isError) {
    return (
      <section className="route-panel">
        <h1>Live 課堂主持</h1>
        <p role="alert">無法載入 Live 活動，請稍後重試。</p>
        <button
          className="primary-action"
          onClick={() => {
            void activities.refetch();
            void sections.refetch();
          }}
          type="button"
        >
          重試
        </button>
      </section>
    );
  }

  // 開場班級選單已移除：場次自動掛在教師的第一個班級。
  const classroomId = (classrooms.data ?? [])[0]?.classroomId ?? '';

  const launchFor = async (activityId: string) => {
    if (!classroomId) {
      setActionError('尚未建立班級，請先到班級管理建立班級。');
      return;
    }
    const launched = await launchSession.mutateAsync({
      activityId,
      classroomId,
    });
    try {
      // The server only stores the code hash; keep the plain code for the
      // presenter's big-screen display within this tab.
      window.sessionStorage.setItem(
        presenterJoinCodeKey(launched.sessionId),
        launched.joinCode,
      );
    } catch {
      // Non-critical: the presenter falls back to a regenerate hint.
    }
    await navigate(`/teacher/live/${launched.sessionId}?presenter=1`);
  };

  return (
    <section aria-labelledby="teacher-live-title" className="page-mid">
      <header>
        <p className="route-panel__eyebrow">ColorPlay Live</p>
        <h1 id="teacher-live-title">Live 課堂主持</h1>
        <p>選擇單元建立活動，開場後把六碼投影給學生輸入。</p>
      </header>

      <form
        aria-label="建立 Live 活動"
        data-interaction-group="create-live-activity"
        onSubmit={(event) => {
          void handleSubmit(async (values) => {
            setActionError(undefined);
            const section = sections.data.find(
              (entry) => entry.sectionId === values.sectionId,
            );
            if (!section) {
              setActionError('請選擇要對戰的單元。');
              return;
            }
            try {
              const activity = await createActivity.mutateAsync({
                questionTimeLimitSeconds: Number.parseInt(values.timeLimit, 10),
                quizTemplateId: section.quizTemplateId,
                sectionId: section.sectionId,
                title: section.title,
              });
              await launchFor(activity.activityId);
            } catch {
              setActionError('目前無法建立活動，請稍後重試。');
            }
          })(event);
        }}
      >
        <h2>建立新活動</h2>
        <label htmlFor="live-activity-section">選擇單元</label>
        <select
          id="live-activity-section"
          {...register('sectionId')}
          aria-invalid={errors.sectionId ? true : undefined}
        >
          <option value="">請選擇小節</option>
          {sections.data.map((section) => (
            <option key={section.sectionId} value={section.sectionId}>
              {section.title}
            </option>
          ))}
        </select>
        {errors.sectionId ? (
          <p role="alert">{errors.sectionId.message}</p>
        ) : null}
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
          disabled={
            isSubmitting || createActivity.isPending || launchSession.isPending
          }
          type="submit"
        >
          {createActivity.isPending || launchSession.isPending
            ? '開場中…'
            : '建立活動'}
        </button>
      </form>

      {actionError ? <p role="alert">{actionError}</p> : null}

      {activities.data.length === 0 ? (
        <p>還沒有活動，選擇單元建立第一場吧。</p>
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
                    disabled={launchSession.isPending}
                    onClick={() => {
                      setActionError(undefined);
                      launchFor(activity.activityId).catch(() => {
                        setActionError('目前無法開場，請稍後重試。');
                      });
                    }}
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
