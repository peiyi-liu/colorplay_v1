import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';

import { AuthenticatedTeacherMenu } from '../../teacher-content/components/authenticated-teacher-menu';
import { TeacherWorkSurface } from '../../teacher-content/components/teacher-work-surface';
import '../../teacher-content/teacher-workspace.css';
import '../../teacher-content/teacher-workspace-mobile.css';
import { useLiveSessionDetail } from '../hooks/use-live-commands';
import { buildMatrixCsv, matrixCellLabel } from '../lib/report-export';
import { deriveTeacherLiveReportSummary } from '../lib/teacher-live-report-summary';
import type { LiveRepository, LiveSessionDetail } from '../types';
import './teacher-live-report-page.css';
import './teacher-live-workspace.css';

const EM_DASH = '—';

function downloadCsv(fileName: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function TeacherLiveReportPage({
  menu,
  sessionId: suppliedSessionId,
  repository,
}: Readonly<{
  menu?: ReactNode;
  sessionId?: string;
  repository?: LiveRepository;
}>) {
  const params = useParams();
  const sessionId = suppliedSessionId ?? params.sessionId ?? '';
  const detail = useLiveSessionDetail(sessionId, repository);

  const report = detail.data;
  const summary = report ? deriveTeacherLiveReportSummary(report) : null;
  const state = detail.isPending
    ? ({ kind: 'loading', message: 'Live 課程報表載入中…' } as const)
    : detail.isError
      ? ({ kind: 'error', message: '找不到這場報表，或場次尚未結算。' } as const)
      : ({ kind: 'content' } as const);

  return (
    <TeacherWorkSurface
      eyebrow="ColorPlay Live"
      menu={menu ?? <AuthenticatedTeacherMenu />}
      state={state}
      title="Live 課程報表"
      toolbar={<Link className="secondary-action" to="/teacher">返回教學分析</Link>}
      variant="live"
      {...(report?.activity.title ? { subtitle: report.activity.title } : {})}
    >
      {report ? (
        <div className="teacher-live-report">

      {summary && (summary.participantCount > 0 || summary.overallAccuracy !== null || summary.hardestQuestion !== null || summary.topThree.length > 0) ? (
        <section aria-label="場次重點" className="live-report-summary">
          <dl>
            {summary.participantCount > 0 ? (
              <div><dt>參與人數</dt><dd>{summary.participantCount} 人</dd></div>
            ) : null}
            {summary.overallAccuracy === null ? null : (
              <div><dt>整體正確率</dt><dd>{summary.overallAccuracy.toFixed(1)}%</dd></div>
            )}
            {summary.hardestQuestion === null ? null : (
              <div><dt>最難題</dt><dd>第 {summary.hardestQuestion.position} 題</dd><small>{summary.hardestQuestion.prompt}</small></div>
            )}
          </dl>
          {summary.topThree.length === 0 ? null : (
            <ol aria-label="前三名" className="live-report-podium">
              {summary.topThree.map((entry) => (
                <li data-rank={entry.rank} key={entry.rank}>
                  <strong>第 {entry.rank} 名</strong>
                  <span>{entry.displayName}</span>
                  <small>{entry.score} 分</small>
                </li>
              ))}
            </ol>
          )}
        </section>
      ) : null}

      {/* 393 寬度稽核發現：6 欄無包裹容器時 document.documentElement.
          scrollWidth 撐到 398px（Task 14）。比照下方作答矩陣既有的
          .live-matrix-scroll／teacher-classroom-detail-page.tsx 的
          .ui-table-scroll 慣例，讓表格在自己框內橫向捲動。 */}
      <section className="teacher-live-report__panel" aria-labelledby="question-report-title">
        <h2 id="question-report-title">逐題分析</h2>
        <div className="ui-table-scroll">
        <table className="ui-table teacher-live-report__question-table" aria-label="逐題分析">
          <thead>
            <tr>
              <th scope="col">題號</th>
              <th scope="col">題目</th>
              <th scope="col">作答數</th>
              <th scope="col">答對數</th>
              <th scope="col">正確率</th>
              <th scope="col">平均反應</th>
            </tr>
          </thead>
          <tbody>
            {report.questions.map((question) => (
              <tr key={question.position}>
                <td>{question.position}</td>
                <td>{question.prompt}</td>
                <td>{question.answered}</td>
                <td>{question.correct}</td>
                <td>{question.correctRate === null ? EM_DASH : `${question.correctRate.toFixed(1)}%`}</td>
                <td>{question.averageResponseMs === null ? EM_DASH : `${String(question.averageResponseMs)} ms`}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <div className="teacher-live-report__question-disclosures">
          {report.questions.map((question) => (
            <QuestionDisclosure key={question.position} question={question} />
          ))}
        </div>
      </section>

      <section aria-label="作答矩陣" className="teacher-live-report__panel">
        <h2>作答矩陣</h2>
        <div className="live-matrix-scroll">
          <table className="ui-table" aria-label="個人逐題作答">
            <thead>
              <tr>
                <th scope="col">學生</th>
                <th scope="col">名次</th>
                <th scope="col">總分</th>
                {report.questions.map((question) => (
                  <th key={question.position} scope="col">
                    第{question.position}題
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.participants.map((participant) => {
                const byPosition = new Map(
                  participant.answers.map((answer) => [
                    answer.position,
                    answer,
                  ]),
                );
                return (
                  <tr key={participant.displayName}>
                    <th scope="row">{participant.displayName}</th>
                    <td>{participant.rank ?? EM_DASH}</td>
                    <td>{participant.score}</td>
                    {report.questions.map((question) => (
                      <td key={question.position}>
                        {matrixCellLabel(byPosition.get(question.position))}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button
          className="live-report__action"
          onClick={() => {
            downloadCsv(
              `live-report-${report.sessionId.slice(0, 8)}.csv`,
              buildMatrixCsv(report),
            );
          }}
          type="button"
        >
          匯出 CSV
        </button>
      </section>

      <section aria-label="最終排名" className="teacher-live-report__panel">
        <h2>最終排名</h2>
        <ol>
          {report.ranking.map((entry) => (
            <li key={entry.rank}>
              {entry.rank <= 3 ? (
                <span
                  aria-hidden="true"
                  className={`live-report__medal live-report__medal--${
                    ['gold', 'silver', 'bronze'][entry.rank - 1] ?? 'bronze'
                  }`}
                >
                  ★
                </span>
              ) : null}
              第 {entry.rank} 名 {entry.displayName}（{entry.score} 分）
            </li>
          ))}
        </ol>
      </section>

        </div>
      ) : null}
    </TeacherWorkSurface>
  );
}

function QuestionDisclosure({
  question,
}: Readonly<{ question: LiveSessionDetail['questions'][number] }>) {
  const [open, setOpen] = useState(false);
  return (
    <details onToggle={(event) => { setOpen(event.currentTarget.open); }}>
      <summary aria-expanded={open}>第 {question.position} 題．{question.prompt}</summary>
      <dl>
        <div><dt>作答數</dt><dd>{question.answered}</dd></div>
        <div><dt>答對數</dt><dd>{question.correct}</dd></div>
        <div><dt>正確率</dt><dd>{question.correctRate === null ? EM_DASH : `${question.correctRate.toFixed(1)}%`}</dd></div>
        <div><dt>平均反應</dt><dd>{question.averageResponseMs === null ? EM_DASH : `${String(question.averageResponseMs)} ms`}</dd></div>
      </dl>
    </details>
  );
}
