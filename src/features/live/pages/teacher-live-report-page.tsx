import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { RouteLoading } from '../../../app/boundaries/route-loading';
import type { AssignmentRepository } from '../../assignments/types';
import { useCreateAssignment } from '../../assignments/hooks/use-assignments';
import { useLiveSessionDetail } from '../hooks/use-live-commands';
import {
  buildMatrixCsv,
  matrixCellLabel,
  RETEACH_THRESHOLD,
  reteachQuestions,
} from '../lib/report-export';
import type { LiveRepository, LiveSessionDetail } from '../types';

const EM_DASH = '—';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function downloadCsv(fileName: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function ReviewAssignmentButton({
  report,
  assignmentRepository,
}: Readonly<{
  report: LiveSessionDetail;
  assignmentRepository?: AssignmentRepository;
}>) {
  const createAssignment = useCreateAssignment(
    report.classroomId,
    assignmentRepository,
  );
  const [message, setMessage] = useState<string>();
  return (
    <div>
      <button
        disabled={createAssignment.isPending || createAssignment.isSuccess}
        onClick={() => {
          setMessage(undefined);
          createAssignment.mutate(
            {
              classroomId: report.classroomId,
              title: `${report.activity.title} 複習`,
              quizTemplateId: report.activity.quizTemplateId,
              availableFrom: new Date().toISOString(),
              deadlineAt: new Date(Date.now() + WEEK_MS).toISOString(),
              attemptLimit: null,
              passingThreshold: 60,
            },
            {
              onError: () => {
                setMessage('目前無法建立複習任務，請稍後重試。');
              },
              onSuccess: () => {
                setMessage('已建立複習任務草稿，請到任務頁確認並發佈。');
              },
            },
          );
        }}
        type="button"
      >
        {createAssignment.isPending ? '建立中…' : '一鍵生成課後複習任務'}
      </button>
      {message ? (
        <p role={createAssignment.isError ? 'alert' : 'status'}>{message}</p>
      ) : null}
    </div>
  );
}

export function TeacherLiveReportPage({
  sessionId: suppliedSessionId,
  repository,
  assignmentRepository,
}: Readonly<{
  sessionId?: string;
  repository?: LiveRepository;
  assignmentRepository?: AssignmentRepository;
}>) {
  const params = useParams();
  const sessionId = suppliedSessionId ?? params.sessionId ?? '';
  const detail = useLiveSessionDetail(sessionId, repository);

  if (detail.isPending) return <RouteLoading withinMain />;
  if (detail.isError) {
    return (
      <section className="route-panel">
        <h1>場次報表</h1>
        <p role="alert">找不到這場報表，或場次尚未結算。</p>
        <Link className="primary-action" to="/teacher/live">
          回 Live 活動
        </Link>
      </section>
    );
  }

  const report = detail.data;
  const reteach = reteachQuestions(report.questions);

  return (
    <section aria-labelledby="live-report-title" className="w-full max-w-4xl">
      <header>
        <p className="route-panel__eyebrow">ColorPlay Live</p>
        <h1 id="live-report-title">場次報表</h1>
        <p>
          {report.mode === 'team' ? '團隊模式' : '個人模式'}・逐題數字由伺服器
          從權威作答紀錄計算。
        </p>
      </header>

      {reteach.length > 0 ? (
        <section aria-label="建議重教" className="live-reteach">
          <h2>建議重教（正確率低於 {RETEACH_THRESHOLD}%）</h2>
          <ul>
            {reteach.map((question) => (
              <li key={question.position}>
                第 {question.position} 題：{question.prompt}（
                {question.correctRate === null
                  ? EM_DASH
                  : `${question.correctRate.toFixed(1)}%`}
                ）
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <table className="ui-table" aria-label="逐題分析">
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
              <td>
                {question.correctRate === null
                  ? EM_DASH
                  : `${question.correctRate.toFixed(1)}%`}
              </td>
              <td>
                {question.averageResponseMs === null
                  ? EM_DASH
                  : `${String(question.averageResponseMs)} ms`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <section aria-label="作答矩陣">
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

      <section aria-label="學習閉環">
        <h2>學習閉環</h2>
        <p>
          場次結算時，答錯與逾時的題目已自動寫入每位學生的錯題本；也可以直接
          指派課後複習任務（同一份題庫，草稿建立後到任務頁發佈）。
        </p>
        <ReviewAssignmentButton
          report={report}
          {...(assignmentRepository ? { assignmentRepository } : {})}
        />
      </section>

      <section aria-label="最終排名">
        <h2>最終排名</h2>
        <ol>
          {report.ranking.map((entry) => (
            <li key={entry.rank}>
              第 {entry.rank} 名 {entry.displayName}（{entry.score} 分
              {entry.teamNumber === null
                ? ''
                : `・第 ${String(entry.teamNumber)} 隊`}
              ）
            </li>
          ))}
        </ol>
      </section>

      <Link className="primary-action" to="/teacher/live">
        回 Live 活動
      </Link>
    </section>
  );
}
