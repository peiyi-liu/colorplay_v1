import { useState } from 'react';
import { Link } from 'react-router-dom';

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

function SummaryCards({
  summary,
}: Readonly<{ summary: ClassroomSummary | null }>) {
  return (
    <>
      <dl className="teacher-summary-cards">
        <div>
          <dt>完成挑戰次數</dt>
          <dd>{summary ? String(summary.attempts) : EM_DASH}</dd>
        </div>
        <div>
          <dt>參與學生</dt>
          <dd>{summary ? String(summary.uniqueStudents) : EM_DASH}</dd>
        </div>
        <div>
          <dt>平均正確率</dt>
          <dd>{formatPercent(summary?.averageAccuracy ?? null)}</dd>
        </div>
      </dl>
      <p className="teacher-summary-callout">
        最需要加強的子題：
        <strong>{summary?.worstSubtopicTitle ?? EM_DASH}</strong>
      </p>
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

  return (
    <section
      aria-labelledby="teacher-dashboard-title"
      className="w-full max-w-4xl"
    >
      <header>
        <p className="route-panel__eyebrow">教師功能</p>
        <h1 id="teacher-dashboard-title">教師工作區</h1>
        <p>掌握班級表現，管理課程內容、題庫與教學活動。</p>
      </header>
      <nav aria-label="教師功能捷徑" className="teacher-shortcuts">
        <Link to="/teacher/analytics">教學分析</Link>
        <Link to="/teacher/content">內容工作區</Link>
        <Link to="/teacher/import">匯入內容</Link>
        <Link to="/teacher/classes">班級管理</Link>
        <Link to="/teacher/live">Live 課堂主持</Link>
      </nav>
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
              <option key={classroom.classroomId} value={classroom.classroomId}>
                {classroom.classroomName}
              </option>
            ))}
          </select>
          {summary.isPending ? (
            <p role="status">班級總覽載入中…</p>
          ) : summary.isError ? (
            <p role="alert">分析資料暫時無法取得，請稍後重試。</p>
          ) : (
            <SummaryCards summary={summary.data} />
          )}
        </>
      )}
    </section>
  );
}
