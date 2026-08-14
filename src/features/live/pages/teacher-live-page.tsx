import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { Icon } from '../../../components/ui/icons';
import { useOwnedClassrooms } from '../../classrooms/hooks/use-classrooms';
import type { ClassroomRepository } from '../../classrooms/types';
import { AuthenticatedTeacherMenu } from '../../teacher-content/components/authenticated-teacher-menu';
import { TeacherWorkSurface } from '../../teacher-content/components/teacher-work-surface';
import '../../teacher-content/teacher-workspace.css';
import '../../teacher-content/teacher-workspace-mobile.css';
import { presenterJoinCodeKey } from '../components/live-presenter';
import {
  useCreateLiveActivity,
  useLaunchLiveSession,
  useLiveActivities,
  useLiveSectionOptions,
} from '../hooks/use-live-commands';
import type { LiveRepository } from '../types';
import './teacher-live-page.css';
import './teacher-live-workspace.css';

const createSchema = z.strictObject({
  classroomId: z.string().min(1, '請選擇班級'),
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

const TIME_LIMIT_OPTIONS = ['5', '10', '15', '20', '30', '45', '60'] as const;

export function TeacherLivePage({
  classroomRepository,
  menu,
  repository,
}: Readonly<{
  classroomRepository?: ClassroomRepository;
  menu?: ReactNode;
  repository?: LiveRepository;
}>) {
  const navigate = useNavigate();
  const activities = useLiveActivities(repository);
  const sections = useLiveSectionOptions(repository);
  const classrooms = useOwnedClassrooms(classroomRepository);
  const createActivity = useCreateLiveActivity(repository);
  const launchSession = useLaunchLiveSession(repository);
  const [actionError, setActionError] = useState<string>();
  const {
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    setValue,
  } = useForm<CreateValues>({
    defaultValues: { classroomId: '', sectionId: '', timeLimit: '20' },
    resolver: zodResolver(createSchema),
  });
  const classroomOptions = useMemo(
    () => classrooms.data ?? [],
    [classrooms.data],
  );
  const sectionOptions = useMemo(
    () => sections.data ?? [],
    [sections.data],
  );
  const selectedClassroomId = useWatch({ control, name: 'classroomId' });
  const selectedSectionId = useWatch({ control, name: 'sectionId' });
  const timeLimit = useWatch({ control, name: 'timeLimit' });
  const selectedClassroom = classroomOptions.find(
    (classroom) => classroom.classroomId === selectedClassroomId,
  );
  const selectedSection = sectionOptions.find(
    (section) => section.sectionId === selectedSectionId,
  );

  useEffect(() => {
    const firstClassroomId = classroomOptions[0]?.classroomId;
    if (!selectedClassroomId && firstClassroomId) {
      setValue('classroomId', firstClassroomId, { shouldValidate: true });
    }
  }, [classroomOptions, selectedClassroomId, setValue]);

  const stepTimeLimit = (direction: -1 | 1) => {
    const currentIndex = TIME_LIMIT_OPTIONS.indexOf(
      timeLimit as (typeof TIME_LIMIT_OPTIONS)[number],
    );
    const nextIndex = Math.min(
      TIME_LIMIT_OPTIONS.length - 1,
      Math.max(0, currentIndex + direction),
    );
    const next = TIME_LIMIT_OPTIONS[nextIndex];
    if (next) setValue('timeLimit', next, { shouldValidate: true });
  };

  const launchFor = async (activityId: string, classroomId: string) => {
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

  const isLoading =
    activities.isPending || classrooms.isPending || sections.isPending;
  const hasLoadError =
    activities.isError || classrooms.isError || sections.isError;
  const surfaceState = isLoading
    ? ({ kind: 'loading', message: 'Live 課堂資料載入中…' } as const)
    : hasLoadError
      ? ({
          kind: 'error',
          message: '無法載入 Live 課堂資料，請稍後重試。',
          retry: () => {
            void activities.refetch();
            void classrooms.refetch();
            void sections.refetch();
          },
        } as const)
      : ({ kind: 'content' } as const);

  return (
    <TeacherWorkSurface
      menu={menu ?? <AuthenticatedTeacherMenu />}
      state={surfaceState}
      title="建立 Live 課堂"
      variant="live"
    >
      <form
        aria-label="建立 Live 課堂"
        className="teacher-live-create"
        data-interaction-group="create-live-activity"
        onSubmit={(event) => {
          void handleSubmit(async (values) => {
            setActionError(undefined);
            const section = sectionOptions.find(
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
              await launchFor(activity.activityId, values.classroomId);
            } catch {
              setActionError('目前無法建立活動，請稍後重試。');
            }
          })(event);
        }}
      >
        <section className="teacher-live-create__step">
          <label className="teacher-live-create__step-title" htmlFor="live-classroom">
            <span aria-hidden="true">1</span>
            選擇班級
          </label>
          <select
            aria-label="1・選擇班級"
            id="live-classroom"
            {...register('classroomId')}
            aria-invalid={errors.classroomId ? true : undefined}
          >
            {classroomOptions.length === 0 ? (
              <option value="">尚未建立班級</option>
            ) : null}
            {classroomOptions.map((classroom) => (
              <option key={classroom.classroomId} value={classroom.classroomId}>
                {classroom.classroomName}
              </option>
            ))}
          </select>
          {errors.classroomId ? (
            <p role="alert">{errors.classroomId.message}</p>
          ) : null}
          {classroomOptions.length === 0 ? (
            <p className="teacher-live-create__hint">
              尚未建立班級，請先到班級管理建立班級。
            </p>
          ) : null}
        </section>

        <fieldset className="teacher-live-create__step">
          <legend className="teacher-live-create__step-title">
            <span aria-hidden="true">2</span>
            選擇小節
          </legend>
          <div className="teacher-live-create__section-list">
            {sectionOptions.map((section) => (
              <label key={section.sectionId}>
                <input
                  {...register('sectionId')}
                  type="radio"
                  value={section.sectionId}
                />
                <span aria-hidden="true" className="teacher-live-create__radio" />
                <span>{section.title}</span>
              </label>
            ))}
          </div>
          {errors.sectionId ? (
            <p role="alert">{errors.sectionId.message}</p>
          ) : null}
        </fieldset>

        <section className="teacher-live-create__step">
          <h2 className="teacher-live-create__step-title">
            <span aria-hidden="true">3</span>
            每題作答時間
          </h2>
          <input {...register('timeLimit')} type="hidden" />
          <div
            aria-label="每題作答時間"
            className="teacher-live-create__time-stepper"
            role="group"
          >
            <button
              aria-label="減少每題作答時間"
              disabled={timeLimit === TIME_LIMIT_OPTIONS[0]}
              onClick={() => {
                stepTimeLimit(-1);
              }}
              type="button"
            >
              −
            </button>
            <output aria-live="polite">{timeLimit} 秒</output>
            <button
              aria-label="增加每題作答時間"
              disabled={timeLimit === TIME_LIMIT_OPTIONS.at(-1)}
              onClick={() => {
                stepTimeLimit(1);
              }}
              type="button"
            >
              ＋
            </button>
          </div>
          <p className="teacher-live-create__hint">預設 20 秒</p>
          {errors.timeLimit ? (
            <p role="alert">{errors.timeLimit.message}</p>
          ) : null}
        </section>

        <section className="teacher-live-create__summary">
          <h2 aria-label="4・建立課堂摘要">
            <span aria-hidden="true" className="teacher-live-create__step-number">
              4
            </span>
            建立課堂摘要
          </h2>
          <dl>
            <div>
              <dt><Icon aria-hidden="true" name="users" size={18} />班級</dt>
              <dd>{selectedClassroom?.classroomName ?? '尚未選擇'}</dd>
            </div>
            <div>
              <dt><Icon aria-hidden="true" name="book" size={18} />小節</dt>
              <dd>{selectedSection?.title ?? '尚未選擇'}</dd>
            </div>
            <div>
              <dt><Icon aria-hidden="true" name="clock" size={18} />每題作答時間</dt>
              <dd>{timeLimit} 秒</dd>
            </div>
          </dl>
          <button
            className="teacher-live-create__submit"
            disabled={
              !selectedClassroom ||
              !selectedSection ||
              isSubmitting ||
              createActivity.isPending ||
              launchSession.isPending
            }
            type="submit"
          >
            {createActivity.isPending || launchSession.isPending
              ? '建立中…'
              : '建立課堂'}
          </button>
        </section>
      </form>

      {actionError ? <p role="alert">{actionError}</p> : null}
    </TeacherWorkSurface>
  );
}
