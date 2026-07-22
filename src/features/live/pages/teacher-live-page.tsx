import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { z } from 'zod';

import { RouteLoading } from '../../../app/boundaries/route-loading';
import { useOwnedClassrooms } from '../../classrooms/hooks/use-classrooms';
import { presenterJoinCodeKey } from '../components/live-presenter';
import {
  useCreateLiveActivity,
  useCreateLiveSession,
  useLiveActivities,
  useScheduleLiveActivity,
} from '../hooks/use-live-commands';
import type {
  LiveRepository,
  LiveSessionMode,
  LiveSessionReceipt,
} from '../types';

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
  questionDisplay: z.enum(['screen_only', 'device']),
});
type CreateValues = z.infer<typeof createSchema>;

export function TeacherLivePage({
  repository,
}: Readonly<{ repository?: LiveRepository }>) {
  const activities = useLiveActivities(repository);
  const classrooms = useOwnedClassrooms();
  const createActivity = useCreateLiveActivity(repository);
  const createSession = useCreateLiveSession(repository);
  const scheduleActivity = useScheduleLiveActivity(repository);
  const [receipt, setReceipt] = useState<LiveSessionReceipt | null>(null);
  const [actionError, setActionError] = useState<string>();
  const [selectedClassroomId, setSelectedClassroomId] = useState('');
  const [sessionMode, setSessionMode] = useState<LiveSessionMode>('individual');
  const [teamCount, setTeamCount] = useState('2');
  const [scheduleAt, setScheduleAt] = useState('');
  const [schedulingId, setSchedulingId] = useState('');
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
  } = useForm<CreateValues>({
    defaultValues: {
      questionDisplay: 'screen_only',
      timeLimit: '20',
      title: '',
    },
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
        ...(sessionMode === 'team'
          ? { mode: sessionMode, teamCount: Number.parseInt(teamCount, 10) }
          : {}),
      });
      setReceipt(created);
      try {
        // The server only stores the code hash; keep the plain code for the
        // presenter's big-screen display within this tab.
        window.sessionStorage.setItem(
          presenterJoinCodeKey(created.sessionId),
          created.joinCode,
        );
      } catch {
        // Non-critical: the presenter falls back to a regenerate hint.
      }
    } catch {
      setActionError('目前無法建立課堂場次，請稍後重試。');
    }
  };

  const scheduleFor = (activityId: string) => {
    setActionError(undefined);
    if (!scheduleAt) {
      setActionError('請先選擇排程時間。');
      return;
    }
    setSchedulingId(activityId);
    scheduleActivity.mutate(
      {
        activityId,
        scheduledFor: new Date(scheduleAt).toISOString(),
      },
      {
        onError: () => {
          setActionError('目前無法設定排程，請稍後重試。');
        },
        onSettled: () => {
          setSchedulingId('');
        },
      },
    );
  };

  const upcoming = activities.data
    .filter((activity) => activity.scheduledFor !== null)
    .sort((left, right) =>
      (left.scheduledFor ?? '').localeCompare(right.scheduledFor ?? ''),
    );

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
                questionDisplay: values.questionDisplay,
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
        <label htmlFor="live-activity-question-display">題目顯示位置</label>
        <select
          id="live-activity-question-display"
          {...register('questionDisplay')}
        >
          <option value="screen_only">投影幕（雙螢幕，學生端只有作答鈕）</option>
          <option value="device">學生裝置（遠端/自習）</option>
        </select>
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
        <label htmlFor="live-session-mode">對戰模式</label>
        <select
          id="live-session-mode"
          onChange={(event) => {
            setSessionMode(event.target.value as LiveSessionMode);
          }}
          value={sessionMode}
        >
          <option value="individual">個人</option>
          <option value="team">團隊</option>
        </select>
        {sessionMode === 'team' ? (
          <>
            <label htmlFor="live-session-team-count">隊伍數</label>
            <select
              id="live-session-team-count"
              onChange={(event) => {
                setTeamCount(event.target.value);
              }}
              value={teamCount}
            >
              <option value="2">2 隊</option>
              <option value="3">3 隊</option>
              <option value="4">4 隊</option>
            </select>
          </>
        ) : null}
      </div>

      {upcoming.length > 0 ? (
        <section aria-label="即將進行">
          <h2>即將進行</h2>
          <ul>
            {upcoming.map((activity) => (
              <li key={activity.activityId}>
                {activity.title}：
                {new Intl.DateTimeFormat('zh-TW', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                  timeZone: 'Asia/Taipei',
                }).format(new Date(activity.scheduledFor ?? ''))}
                （排程不會自動開場）
              </li>
            ))}
          </ul>
        </section>
      ) : null}

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
              <th scope="col">題目顯示</th>
              <th scope="col">狀態</th>
              <th scope="col">操作</th>
            </tr>
          </thead>
          <tbody>
            {activities.data.map((activity) => (
              <tr key={activity.activityId}>
                <th scope="row">{activity.title}</th>
                <td>{activity.questionTimeLimitSeconds} 秒</td>
                <td>
                  {activity.questionDisplay === 'screen_only'
                    ? '投影幕'
                    : '學生裝置'}
                </td>
                <td>{activity.status === 'active' ? '可使用' : '已封存'}</td>
                <td>
                  <button
                    disabled={createSession.isPending}
                    onClick={() => void startSessionFor(activity.activityId)}
                    type="button"
                  >
                    開新場次
                  </button>
                  <input
                    aria-label={`排程時間（${activity.title}）`}
                    onChange={(event) => {
                      setScheduleAt(event.target.value);
                    }}
                    type="datetime-local"
                    value={scheduleAt}
                  />
                  <button
                    disabled={
                      scheduleActivity.isPending &&
                      schedulingId === activity.activityId
                    }
                    onClick={() => {
                      scheduleFor(activity.activityId);
                    }}
                    type="button"
                  >
                    設定排程
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
