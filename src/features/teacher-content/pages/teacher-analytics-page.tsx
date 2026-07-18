import { useState } from 'react';
import type { ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';

import { useOwnedClassrooms } from '../../classrooms/hooks/use-classrooms';
import type { ClassroomRepository } from '../../classrooms/types';
import { usePublishedChapters } from '../../learning/api/chapters';
import type {
  AnalyticsFilters,
  DateRangeFilters,
  TeacherContentError,
  TeacherContentRepository,
} from '../api/teacher-content-repository';
import {
  useTeacherAssignmentSummary,
  useTeacherClassroomSummary,
  useTeacherLiveReport,
  useTeacherQuestionAnalysis,
  useTeacherSubtopicMastery,
  useTeacherSubtopics,
} from '../hooks/use-teacher-content';
import { EM_DASH, formatPercent } from './teacher-dashboard-page';

const assignmentStatusLabels: Readonly<Record<string, string>> = {
  archived: '已封存',
  closed: '已截止',
  draft: '草稿',
  published: '進行中',
};

const formatTaipeiDate = (iso: string | null): string =>
  iso === null
    ? EM_DASH
    : new Intl.DateTimeFormat('zh-TW', {
        dateStyle: 'medium',
        timeZone: 'Asia/Taipei',
      }).format(new Date(iso));

function ProjectionSection<Rows>({
  children,
  isEmpty,
  query,
  title,
}: Readonly<{
  children(rows: Rows): ReactNode;
  isEmpty(rows: Rows): boolean;
  query: UseQueryResult<Rows, TeacherContentError>;
  title: string;
}>) {
  return (
    <section aria-label={title} className="teacher-analytics-section">
      <h2>{title}</h2>
      {query.isPending ? (
        <p role="status">分析資料載入中…</p>
      ) : query.isError ? (
        <p role="alert">分析資料暫時無法取得，請稍後重試。</p>
      ) : isEmpty(query.data) ? (
        <p>此範圍尚無資料。</p>
      ) : (
        children(query.data)
      )}
    </section>
  );
}

export function TeacherAnalyticsPage({
  classroomRepository,
  repository,
}: Readonly<{
  classroomRepository?: ClassroomRepository;
  repository?: TeacherContentRepository;
}>) {
  const classrooms = useOwnedClassrooms(classroomRepository);
  const chapters = usePublishedChapters();
  const subtopics = useTeacherSubtopics(repository);
  const [selectedClassroomId, setSelectedClassroomId] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [chapterId, setChapterId] = useState('');
  const [subtopicId, setSubtopicId] = useState('');

  const classroomId =
    selectedClassroomId || (classrooms.data?.[0]?.classroomId ?? '');
  const dateFilters: DateRangeFilters = {
    ...(fromDate ? { from: fromDate } : {}),
    ...(toDate ? { to: toDate } : {}),
  };
  const filters: AnalyticsFilters = {
    ...(chapterId ? { chapterId } : {}),
    ...(subtopicId ? { subtopicId } : {}),
    ...dateFilters,
  };

  const summary = useTeacherClassroomSummary(classroomId, filters, repository);
  const questionAnalysis = useTeacherQuestionAnalysis(
    classroomId,
    filters,
    repository,
  );
  const subtopicMastery = useTeacherSubtopicMastery(
    classroomId,
    filters,
    repository,
  );
  const assignmentSummary = useTeacherAssignmentSummary(
    classroomId,
    dateFilters,
    repository,
  );
  const liveReport = useTeacherLiveReport(classroomId, dateFilters, repository);

  return (
    <section
      aria-labelledby="teacher-analytics-title"
      className="w-full max-w-5xl"
    >
      <header>
        <p className="route-panel__eyebrow">教師功能</p>
        <h1 id="teacher-analytics-title">教學分析</h1>
        <p>
          所有數字由伺服器以台北時區日期範圍計算，空白範圍顯示 {EM_DASH}
          ，不以 0 誤導判讀。
        </p>
      </header>
      {classrooms.isPending ? (
        <p role="status">班級資料載入中…</p>
      ) : classrooms.isError ? (
        <p role="alert">班級資料暫時無法取得，請稍後重試。</p>
      ) : classrooms.data.length === 0 ? (
        <p>尚未建立班級，先到班級管理建立第一個班級。</p>
      ) : (
        <>
          <form aria-label="分析篩選" className="teacher-analytics-filters">
            <div>
              <label htmlFor="analytics-classroom">選擇班級</label>
              <select
                id="analytics-classroom"
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
            </div>
            <div>
              <label htmlFor="analytics-from">開始日期</label>
              <input
                id="analytics-from"
                onChange={(event) => {
                  setFromDate(event.target.value);
                }}
                type="date"
                value={fromDate}
              />
            </div>
            <div>
              <label htmlFor="analytics-to">結束日期</label>
              <input
                id="analytics-to"
                onChange={(event) => {
                  setToDate(event.target.value);
                }}
                type="date"
                value={toDate}
              />
            </div>
            <div>
              <label htmlFor="analytics-chapter">章節</label>
              <select
                id="analytics-chapter"
                onChange={(event) => {
                  setChapterId(event.target.value);
                }}
                value={chapterId}
              >
                <option value="">全部章節</option>
                {(chapters.data ?? []).map((chapter) => (
                  <option key={chapter.id} value={chapter.id}>
                    {chapter.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="analytics-subtopic">子題</label>
              <select
                id="analytics-subtopic"
                onChange={(event) => {
                  setSubtopicId(event.target.value);
                }}
                value={subtopicId}
              >
                <option value="">全部子題</option>
                {(subtopics.data ?? []).map((subtopic) => (
                  <option key={subtopic.subtopicId} value={subtopic.subtopicId}>
                    {subtopic.title}
                  </option>
                ))}
              </select>
            </div>
          </form>

          <section aria-label="班級總覽" className="teacher-analytics-section">
            <h2>班級總覽</h2>
            {summary.isPending ? (
              <p role="status">分析資料載入中…</p>
            ) : summary.isError ? (
              <p role="alert">分析資料暫時無法取得，請稍後重試。</p>
            ) : (
              <dl className="teacher-summary-cards">
                <div>
                  <dt>完成挑戰次數</dt>
                  <dd>
                    {summary.data ? String(summary.data.attempts) : EM_DASH}
                  </dd>
                </div>
                <div>
                  <dt>參與學生</dt>
                  <dd>
                    {summary.data
                      ? String(summary.data.uniqueStudents)
                      : EM_DASH}
                  </dd>
                </div>
                <div>
                  <dt>平均正確率</dt>
                  <dd>
                    {formatPercent(summary.data?.averageAccuracy ?? null)}
                  </dd>
                </div>
                <div>
                  <dt>最弱子題</dt>
                  <dd>{summary.data?.worstSubtopicTitle ?? EM_DASH}</dd>
                </div>
              </dl>
            )}
          </section>

          <ProjectionSection
            isEmpty={(rows) => rows.length === 0}
            query={questionAnalysis}
            title="題目分析"
          >
            {(rows) => (
              <table>
                <thead>
                  <tr>
                    <th scope="col">題號</th>
                    <th scope="col">題目</th>
                    <th scope="col">作答數</th>
                    <th scope="col">正確率</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.stable_code}>
                      <td>{row.stable_code}</td>
                      <td>{row.prompt}</td>
                      <td>{row.attempts}</td>
                      <td>{formatPercent(row.correct_rate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </ProjectionSection>

          <ProjectionSection
            isEmpty={(rows) => rows.length === 0}
            query={subtopicMastery}
            title="子題精熟"
          >
            {(rows) => (
              <table>
                <thead>
                  <tr>
                    <th scope="col">子題代碼</th>
                    <th scope="col">子題</th>
                    <th scope="col">作答數</th>
                    <th scope="col">正確率</th>
                    <th scope="col">學生數</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.subtopic_code}>
                      <td>{row.subtopic_code}</td>
                      <td>{row.subtopic_title}</td>
                      <td>{row.answers}</td>
                      <td>{formatPercent(row.accuracy)}</td>
                      <td>{row.students}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </ProjectionSection>

          <ProjectionSection
            isEmpty={(rows) => rows.length === 0}
            query={assignmentSummary}
            title="作業總覽"
          >
            {(rows) => (
              <table>
                <thead>
                  <tr>
                    <th scope="col">作業</th>
                    <th scope="col">狀態</th>
                    <th scope="col">指派人數</th>
                    <th scope="col">作答數</th>
                    <th scope="col">完成數</th>
                    <th scope="col">通過數</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.assignment_id}>
                      <td>{row.title}</td>
                      <td>
                        {assignmentStatusLabels[row.status] ?? row.status}
                      </td>
                      <td>{row.targets}</td>
                      <td>{row.attempts}</td>
                      <td>{row.completed}</td>
                      <td>{row.passed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </ProjectionSection>

          <ProjectionSection
            isEmpty={(rows) => rows.length === 0}
            query={liveReport}
            title="Live 報表"
          >
            {(rows) => (
              <table>
                <thead>
                  <tr>
                    <th scope="col">活動</th>
                    <th scope="col">狀態</th>
                    <th scope="col">參與人數</th>
                    <th scope="col">作答數</th>
                    <th scope="col">正確率</th>
                    <th scope="col">完成日期</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.session_id}>
                      <td>{row.activity_title}</td>
                      <td>{row.state}</td>
                      <td>{row.participants}</td>
                      <td>{row.answers}</td>
                      <td>{formatPercent(row.correct_rate)}</td>
                      <td>{formatTaipeiDate(row.completed_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </ProjectionSection>
        </>
      )}
    </section>
  );
}
