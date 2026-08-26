import { zodResolver } from '@hookform/resolvers/zod';
import { useRef, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { z } from 'zod';

import { Chip } from '../../../components/ui/chip';
import { GamePager, useStageWide } from '../../../components/ui/game-pager';
import { AuthenticatedTeacherMenu } from '../../teacher-content/components/authenticated-teacher-menu';
import { TeacherWorkSurface } from '../../teacher-content/components/teacher-work-surface';
import '../../teacher-content/teacher-workspace.css';
import '../../teacher-content/teacher-workspace-mobile.css';
import './teacher-classrooms-workspace.css';
import './teacher-classrooms-reimplementation.css';
import {
  useCreateClassroom,
  useOwnedClassrooms,
} from '../hooks/use-classrooms';
import { type ClassroomRepository, ClassroomRepositoryError } from '../types';

/** 複製「哪一班＋加入碼」的貼文格式（owner 2026-07-27：方便貼上傳給學生）。 */
const joinCodeClipboardText = (name: string, code: string) =>
  `「${name}」班級序號：${code}`;

function ClassroomJoinCode({
  classroomName,
  joinCode,
}: Readonly<{ classroomName: string; joinCode: string | null }>) {
  const [copied, setCopied] = useState(false);
  if (!joinCode) return null;
  return (
    <div className="classroom-card__code">
      <span className="classroom-card__code-value">{joinCode}</span>
      <button
        aria-label={`複製 ${classroomName} 的班級序號`}
        className="classroom-card__copy"
        onClick={() => {
          void (async () => {
            try {
              await navigator.clipboard.writeText(
                joinCodeClipboardText(classroomName, joinCode),
              );
              setCopied(true);
              window.setTimeout(() => {
                setCopied(false);
              }, 2000);
            } catch {
              /* clipboard 不可用時靜默；碼仍在畫面上可手動複製 */
            }
          })();
        }}
        type="button"
      >
        {copied ? '已複製' : '複製'}
      </button>
    </div>
  );
}

function ClassroomCard({
  classroom,
  wide,
}: Readonly<{
  classroom: Awaited<ReturnType<ClassroomRepository['listOwned']>>[number];
  wide: boolean;
}>) {
  const [open, setOpen] = useState(wide);
  return (
    <article className="classroom-card">
      <details
        data-testid="classroom-disclosure"
        onToggle={(event) => {
          setOpen(event.currentTarget.open);
        }}
        open={wide || open}
      >
        <summary aria-expanded={wide || open}>
          <span>
            <h2>{classroom.classroomName}</h2>
            <small>{String(classroom.memberCount)} 位有效學生</small>
          </span>
          <Chip tone="success">有效</Chip>
        </summary>
        <div className="classroom-card__detail">
          <ClassroomJoinCode
            classroomName={classroom.classroomName}
            joinCode={classroom.joinCode}
          />
          <dl className="classroom-card__meta">
            <div>
              <dt>建立日期</dt>
              <dd>{new Date(classroom.createdAt).toLocaleDateString('zh-TW')}</dd>
            </div>
          </dl>
          <div className="classroom-card__actions">
            <Link
              className="classroom-card__manage"
              to={`/teacher/classes/${classroom.classroomId}`}
            >
              進入班級
            </Link>
            <Link
              className="classroom-card__analytics"
              to={`/teacher?classroomId=${classroom.classroomId}`}
            >
              教學分析
            </Link>
          </div>
        </div>
      </details>
    </article>
  );
}

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
  menu,
  repository,
}: Readonly<{ menu?: ReactNode; repository?: ClassroomRepository }>) {
  const classrooms = useOwnedClassrooms(repository);
  const create = useCreateClassroom(repository);
  const wide = useStageWide();
  const pending = useRef(false);
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

  const isPending = isSubmitting || create.isPending;
  const totalMembers = (classrooms.data ?? []).reduce(
    (sum, classroom) => sum + classroom.memberCount,
    0,
  );
  const state = classrooms.isPending
    ? ({ kind: 'loading', message: '班級資料載入中…' } as const)
    : classrooms.isError
      ? ({
          kind: 'error',
          message: '班級資料載入失敗，請稍後重試。',
          retry: () => void classrooms.refetch(),
        } as const)
      : ({ kind: 'content' } as const);

  return (
    <TeacherWorkSurface
      menu={menu ?? <AuthenticatedTeacherMenu />}
      state={state}
      subtitle="建立班級、分享加入碼並查看學生學習狀態"
      title="班級管理"
    >
      {(classrooms.data?.length ?? 0) > 0 ? (
        <dl className="teacher-classroom-stats">
          <div>
            <dt>班級數</dt>
            <dd>{String(classrooms.data?.length ?? 0)}</dd>
          </div>
          <div>
            <dt>學生人數</dt>
            <dd>{String(totalMembers)}</dd>
          </div>
        </dl>
      ) : null}
      <section
        className="teacher-classroom-create"
        aria-labelledby="create-classroom-title"
      >
        <div>
          <p>建立班級</p>
          <h2 id="create-classroom-title">新增一個教學班級</h2>
          <span>建立後會由伺服器產生可分享的班級加入碼。</span>
        </div>
        <form
          className="classroom-create-form"
          data-interaction-group="create-classroom"
          noValidate
          onSubmit={(event) => {
            void handleSubmit(async (values) => {
              if (pending.current) return;
              pending.current = true;
              setSubmitError(undefined);
              try {
                await create.mutateAsync(values);
                reset();
              } catch (error) {
                setSubmitError(createErrorMessage(error));
              } finally {
                pending.current = false;
              }
            })(event);
          }}
        >
          <div>
            <label htmlFor="classroom-name">班級名稱</label>
            <input
              {...register('name')}
              aria-label="新班級名稱"
              aria-describedby={
                errors.name ? 'classroom-name-error' : undefined
              }
              aria-invalid={errors.name ? 'true' : 'false'}
              id="classroom-name"
              type="text"
            />
          </div>
          <button
            className="primary-action"
            data-primary-action="true"
            disabled={isPending}
            type="submit"
          >
            {isPending ? '建立中…' : '建立班級'}
          </button>
          {errors.name ? (
            <p
              className="classroom-create-form__error"
              id="classroom-name-error"
            >
              {errors.name.message}
            </p>
          ) : null}
          {submitError ? (
            <p className="classroom-create-form__error" role="alert">
              {submitError}
            </p>
          ) : null}
        </form>
      </section>
      {(classrooms.data?.length ?? 0) === 0 ? (
        <p>尚未建立班級。</p>
      ) : (
        <GamePager
          ariaLabel="班級清單分頁"
          followTail
          items={classrooms.data ?? []}
          pageSize={wide ? 6 : 3}
        >
          {(pageItems) => (
            <ul aria-label="教師班級列表" className="classroom-list">
              {pageItems.map((classroom) => (
                <li key={classroom.classroomId}>
                  <ClassroomCard classroom={classroom} wide={wide} />
                </li>
              ))}
            </ul>
          )}
        </GamePager>
      )}
    </TeacherWorkSurface>
  );
}
