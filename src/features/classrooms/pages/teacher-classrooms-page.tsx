import { zodResolver } from '@hookform/resolvers/zod';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { z } from 'zod';

import { RouteLoading } from '../../../app/boundaries/route-loading';
import { Chip } from '../../../components/ui/chip';
import { GamePager, useStageWide } from '../../../components/ui/game-pager';
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
          try {
            void navigator.clipboard
              .writeText(joinCodeClipboardText(classroomName, joinCode))
              .catch(() => undefined);
          } catch {
            /* clipboard 不可用時靜默；碼仍在畫面上可手動複製 */
          }
          setCopied(true);
          window.setTimeout(() => {
            setCopied(false);
          }, 2000);
        }}
        type="button"
      >
        {copied ? '已複製' : '複製'}
      </button>
    </div>
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
  repository,
}: Readonly<{ repository?: ClassroomRepository }>) {
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
  const totalMembers = classrooms.data.reduce(
    (sum, classroom) => sum + classroom.memberCount,
    0,
  );
  return (
    <section
      aria-labelledby="teacher-classrooms-title"
      className="page-wide page-stack"
    >
      <header className="teacher-dashboard-header">
        <div className="teacher-dashboard-header__intro">
          <p className="route-panel__eyebrow">教師工作區</p>
          <h1 id="teacher-classrooms-title">班級管理</h1>
          <p>每班有固定的班級序號，點「複製」即可連同班名貼給學生註冊。</p>
        </div>
        <dl className="classroom-header-stats">
          <div>
            <dt>班級數</dt>
            <dd>{String(classrooms.data.length)}</dd>
          </div>
          <div>
            <dt>有效學生</dt>
            <dd>{String(totalMembers)}</dd>
          </div>
        </dl>
      </header>
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
              // 建立成功後 owned 清單自動重抓，固定加入碼直接顯示在班級卡上。
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
        <div className="classroom-create-form__field">
          <label htmlFor="classroom-name">班級名稱</label>
          <input
            {...register('name')}
            aria-describedby={errors.name ? 'classroom-name-error' : undefined}
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
          <p className="classroom-create-form__error" id="classroom-name-error">
            {errors.name.message}
          </p>
        ) : null}
        {submitError ? (
          <p className="classroom-create-form__error" role="alert">
            {submitError}
          </p>
        ) : null}
        <p className="classroom-create-form__hint">名稱為 1 至 80 個字元。</p>
      </form>
      {classrooms.data.length === 0 ? (
        <p>尚未建立班級。</p>
      ) : (
        <GamePager
          ariaLabel="班級清單分頁"
          followTail
          items={classrooms.data}
          pageSize={wide ? 6 : 3}
        >
          {(pageItems) => (
            <ul aria-label="教師班級列表" className="classroom-list">
              {pageItems.map((classroom) => (
                <li key={classroom.classroomId}>
                  <article className="classroom-card">
                    <div className="classroom-card__head">
                      <h2>{classroom.classroomName}</h2>
                      <Chip tone="success">
                        <span
                          aria-hidden="true"
                          className="status-dot status-dot--active"
                        />
                        {String(classroom.memberCount)} 位有效學生
                      </Chip>
                    </div>
                    <ClassroomJoinCode
                      classroomName={classroom.classroomName}
                      joinCode={classroom.joinCode}
                    />
                    <dl className="classroom-card__meta">
                      <div>
                        <dt>建立日期</dt>
                        <dd>
                          {new Date(classroom.createdAt).toLocaleDateString(
                            'zh-TW',
                          )}
                        </dd>
                      </div>
                    </dl>
                    <div className="classroom-card__actions">
                      <Link
                        className="classroom-card__manage"
                        to={`/teacher/classes/${classroom.classroomId}`}
                      >
                        管理班級
                      </Link>
                      <Link
                        className="classroom-card__analytics"
                        to="/teacher/analytics"
                      >
                        教學分析
                      </Link>
                    </div>
                  </article>
                </li>
              ))}
            </ul>
          )}
        </GamePager>
      )}
    </section>
  );
}
