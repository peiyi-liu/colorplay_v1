import { useState } from 'react';
import { Link } from 'react-router-dom';

import { Chip } from '../../../components/ui/chip';
import { Icon } from '../../../components/ui/icons';
import { ProgressBar } from '../../../components/ui/progress-bar';

import { useOwnedClassrooms } from '../../classrooms/hooks/use-classrooms';
import type { ClassroomRepository } from '../../classrooms/types';
import type {
  ClassroomSummary,
  TeacherContentRepository,
} from '../api/teacher-content-repository';
import { useTeacherClassroomSummary } from '../hooks/use-teacher-content';

export const EM_DASH = '—';

export const formatPercent = (value: number | null | undefined): string =>
  value === null || value === undefined ? EM_DASH : `${value.toFixed(1)}%`;

function SummaryStats({
  summary,
}: Readonly<{ summary: ClassroomSummary | null }>) {
  return (
    <>
      <dl className="teacher-summary-card__stats">
        <div className="teacher-summary-card__stat">
          <dt>完成挑戰次數</dt>
          <dd>{summary ? String(summary.attempts) : EM_DASH}</dd>
        </div>
        <div className="teacher-summary-card__stat">
          <dt>參與學生</dt>
          <dd>{summary ? String(summary.uniqueStudents) : EM_DASH}</dd>
        </div>
        <div className="teacher-summary-card__stat teacher-summary-card__stat--wide">
          <dt>平均正確率</dt>
          <dd>
            {formatPercent(summary?.averageAccuracy ?? null)}
            {typeof summary?.averageAccuracy === 'number' ? (
              <ProgressBar
                label="平均正確率"
                tone="primary"
                value={summary.averageAccuracy}
              />
            ) : null}
          </dd>
        </div>
      </dl>
      <div className="teacher-summary-warning">
        <Icon aria-hidden="true" name="alert" size={16} />
        <p>
          最需要加強的子題：
          <strong>{summary?.worstSubtopicTitle ?? EM_DASH}</strong>
        </p>
      </div>
    </>
  );
}

export function TeacherDashboardPage({
  classroomRepository,
  repository,
}: Readonly<{
  classroomRepository?: ClassroomRepository;
  repository?: TeacherContentRepository;
}>) {
  const classrooms = useOwnedClassrooms(classroomRepository);
  const [selectedClassroomId, setSelectedClassroomId] = useState('');
  const classroomId =
    selectedClassroomId || (classrooms.data?.[0]?.classroomId ?? '');
  const summary = useTeacherClassroomSummary(classroomId, {}, repository);
  const selectedClassroomName =
    classrooms.data?.find((classroom) => classroom.classroomId === classroomId)
      ?.classroomName ?? EM_DASH;

  return (
    <section
      aria-labelledby="teacher-dashboard-title"
      className="page-wide teacher-dashboard-page"
    >
      <header className="teacher-dashboard-header">
        <div className="teacher-dashboard-header__intro">
          <Chip tone="teacher">教師決策工具</Chip>
          <h1 id="teacher-dashboard-title">教師工作區</h1>
          <p>掌握班級表現，管理課程內容、題庫與教學活動。</p>
        </div>
        <div className="teacher-dashboard-header__classroom">
          {classrooms.isPending ? (
            <p role="status">班級資料載入中…</p>
          ) : classrooms.isError ? (
            <p role="alert">班級資料暫時無法取得，請稍後重試。</p>
          ) : classrooms.data.length === 0 ? (
            <p>尚未建立班級，先到班級管理建立第一個班級。</p>
          ) : (
            <>
              <label htmlFor="dashboard-classroom">選擇班級</label>
              <select
                id="dashboard-classroom"
                onChange={(event) => {
                  setSelectedClassroomId(event.target.value);
                }}
                value={classroomId}
              >
                {classrooms.data.map((classroom) => (
                  <option
                    key={classroom.classroomId}
                    value={classroom.classroomId}
                  >
                    {classroom.classroomName}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
      </header>

      <div className="teacher-live-console teacher-live-console--night">
        <div className="teacher-live-console__content">
          <span aria-hidden="true" className="teacher-live-console__badge">
            <Icon name="bolt" size={26} />
          </span>
          <div>
            <h2 className="teacher-live-console__title">
              課堂即時競賽（Live）廣播控制台
            </h2>
            <p className="teacher-live-console__description">
              課堂講解完知識點後，開啟即時競賽；所有登入的學生會收到加入
              引導，作答與計分全程由伺服器裁定。
            </p>
          </div>
        </div>
        <Link className="teacher-live-console__action" to="/teacher/live">
          前往主持 ▶
        </Link>
      </div>

      <div className="teacher-dashboard-grid teacher-dashboard-grid--forge">
        <section aria-label="班級總覽" className="teacher-summary-card">
          <header className="teacher-summary-card__header">
            <h2>班級總覽</h2>
            <span>{selectedClassroomName}</span>
          </header>
          {classroomId ? (
            summary.isPending ? (
              <p role="status">班級總覽載入中…</p>
            ) : summary.isError ? (
              <p role="alert">分析資料暫時無法取得，請稍後重試。</p>
            ) : (
              <SummaryStats summary={summary.data} />
            )
          ) : null}
        </section>

        <nav aria-label="教師功能捷徑" className="teacher-shortcut-card">
          <header className="teacher-shortcut-card__header">
            <h2>功能捷徑</h2>
          </header>
          <div className="teacher-shortcut-card__list">
            <Link className="pixel-command" to="/teacher/analytics">
              教學分析 <span aria-hidden="true">›</span>
            </Link>
            <Link className="pixel-command" to="/teacher/classes">
              班級管理 <span aria-hidden="true">›</span>
            </Link>
            <Link className="pixel-command" to="/teacher/live">
              Live 主持 <span aria-hidden="true">›</span>
            </Link>
          </div>
        </nav>
      </div>
    </section>
  );
}
