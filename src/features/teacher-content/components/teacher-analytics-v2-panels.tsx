import { Link } from 'react-router-dom';

import type {
  AssessmentQuestionRow,
  ChapterCompletionRow,
  ClassroomOverview,
  LiveHistoryPage,
} from '../api/teacher-content-repository';
import {
  EM_DASH,
  formatChapterLabel,
  formatPercent,
  formatSubtopicLabel,
} from '../lib/teacher-analytics-format';

const highErrorQuestions = (rows: readonly AssessmentQuestionRow[]) =>
  [...rows]
    .filter(
      (row) =>
        row.attempts > 0 && row.correct_rate !== null && row.correct_rate < 100,
    )
    .sort((left, right) =>
      left.correct_rate === right.correct_rate
        ? left.stable_code.localeCompare(right.stable_code)
        : (left.correct_rate ?? 0) - (right.correct_rate ?? 0),
    )
    .slice(0, 5);

const formatTaipeiDate = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat('zh-TW', {
        dateStyle: 'medium',
        timeZone: 'Asia/Taipei',
      }).format(new Date(iso))
    : EM_DASH;

export function ClassroomOverviewPanel({
  classroomName,
  overview,
}: Readonly<{
  classroomName: string;
  overview: ClassroomOverview | null;
}>) {
  return (
    <section aria-label="班級總覽" className="teacher-analytics-section">
      <header className="teacher-analytics-section__header">
        <h2>班級總覽</h2>
        <span>{classroomName}</span>
      </header>
      <dl className="teacher-analytics-overview teacher-analytics-overview--compact">
        <div>
          <dt>完成人數</dt>
          <dd>
            {overview
              ? `${String(overview.completedStudents)}/${String(overview.totalStudents)}`
              : EM_DASH}
          </dd>
        </div>
        <div>
          <dt>平均正確率</dt>
          <dd>{formatPercent(overview?.averageAccuracy ?? null)}</dd>
        </div>
        <div>
          <dt>待加強的子題</dt>
          <dd className="teacher-analytics-overview__topic">
            {overview?.worstSubtopicCode
              ? formatSubtopicLabel(
                  overview.worstSubtopicCode,
                  overview.worstSubtopicTitle,
                )
              : EM_DASH}
          </dd>
        </div>
      </dl>
    </section>
  );
}

export function QuestionInsightPanel({
  chapterCompletion,
  questionHref,
  questions,
  showCompletion,
}: Readonly<{
  chapterCompletion: readonly ChapterCompletionRow[];
  questionHref: string;
  questions: readonly AssessmentQuestionRow[];
  showCompletion: boolean;
}>) {
  const ranked = highErrorQuestions(questions);
  return (
    <section aria-label="題目分析" className="teacher-analytics-section">
      <header className="teacher-analytics-section__header">
        <h2>
          <Link to={questionHref}>題目分析</Link>
        </h2>
      </header>
      <div className="teacher-question-insight-grid">
        {showCompletion ? (
          <div className="teacher-question-insight-completion">
            <h3>各章節完成人數</h3>
            {chapterCompletion.length === 0 ? (
              <p>目前沒有可顯示的章節完成資料。</p>
            ) : (
              <ul>
                {chapterCompletion.map((row) => (
                  <li key={row.chapter_id}>
                    <span>
                      {formatChapterLabel(
                        row.chapter_sort_order,
                        row.chapter_title,
                      )}
                    </span>
                    <strong>
                      {row.completed_students}/{row.total_students}
                    </strong>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
        <div className="teacher-question-insight-errors">
          <h3>高錯誤題目 Top 5</h3>
          {ranked.length === 0 ? (
            <p>目前篩選範圍尚無作答資料。</p>
          ) : (
            <ol>
              {ranked.map((row) => (
                <li key={row.stable_code}>
                  <span>{row.prompt}</span>
                  <strong>
                    {formatPercent(100 - (row.correct_rate ?? 0))}
                  </strong>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </section>
  );
}

export function LiveHistoryPanel({
  history,
  onPageChange,
  page,
}: Readonly<{
  history: LiveHistoryPage;
  onPageChange: (page: number) => void;
  page: number;
}>) {
  const pageCount = Math.max(1, Math.ceil(history.total / 5));
  return (
    <section aria-label="Live 課程" className="teacher-analytics-section">
      <header className="teacher-analytics-section__header">
        <h2>Live 課程</h2>
      </header>
      {history.rows.length === 0 ? (
        <p className="teacher-analytics-message">目前沒有 Live 課程結果。</p>
      ) : (
        <>
          <div className="teacher-table-frame teacher-table-frame--desktop">
            <table aria-label="Live 課程" className="ui-table">
              <thead>
                <tr>
                  <th scope="col">活動名稱</th>
                  <th scope="col">參與班級</th>
                  <th scope="col">參與人數</th>
                  <th scope="col">正確率</th>
                  <th scope="col">完成日期</th>
                  <th scope="col">報表</th>
                </tr>
              </thead>
              <tbody>
                {history.rows.map((row) => (
                  <tr key={row.session_id}>
                    <th scope="row">{row.activity_title}</th>
                    <td>{row.classroom_name}</td>
                    <td>{row.participants}</td>
                    <td>{formatPercent(row.correct_rate)}</td>
                    <td>{formatTaipeiDate(row.completed_at)}</td>
                    <td>
                      <Link to={`/teacher/live/${row.session_id}/report`}>
                        查看報表
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="teacher-analytics-disclosures">
            {history.rows.map((row) => (
              <details key={row.session_id}>
                <summary>
                  <span>{row.activity_title}</span>
                  <strong>{formatPercent(row.correct_rate)}</strong>
                </summary>
                <dl>
                  <div>
                    <dt>參與班級</dt>
                    <dd>{row.classroom_name}</dd>
                  </div>
                  <div>
                    <dt>參與人數</dt>
                    <dd>{row.participants}</dd>
                  </div>
                  <div>
                    <dt>作答數</dt>
                    <dd>{row.answers}</dd>
                  </div>
                  <div>
                    <dt>完成日期</dt>
                    <dd>{formatTaipeiDate(row.completed_at)}</dd>
                  </div>
                </dl>
                <Link
                  className="teacher-analytics-table-action"
                  to={`/teacher/live/${row.session_id}/report`}
                >
                  查看報表
                </Link>
              </details>
            ))}
          </div>
        </>
      )}
      {history.total > 5 ? (
        <nav aria-label="Live 課程分頁" className="teacher-live-pagination">
          <button
            disabled={page <= 1}
            onClick={() => {
              onPageChange(page - 1);
            }}
            type="button"
          >
            上一頁
          </button>
          <span>
            {page}/{pageCount}
          </span>
          <button
            disabled={page >= pageCount}
            onClick={() => {
              onPageChange(page + 1);
            }}
            type="button"
          >
            下一頁
          </button>
        </nav>
      ) : null}
    </section>
  );
}
