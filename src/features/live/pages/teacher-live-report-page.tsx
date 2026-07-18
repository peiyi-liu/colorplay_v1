import { Link, useParams } from 'react-router-dom';

import { RouteLoading } from '../../../app/boundaries/route-loading';
import { useLiveSessionDetail } from '../hooks/use-live-commands';
import type { LiveRepository } from '../types';

const EM_DASH = '—';

export function TeacherLiveReportPage({
  sessionId: suppliedSessionId,
  repository,
}: Readonly<{ sessionId?: string; repository?: LiveRepository }>) {
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

      <table aria-label="逐題分析">
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
