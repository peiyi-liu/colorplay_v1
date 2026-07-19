import { Link } from 'react-router-dom';

import { RouteLoading } from '../../../app/boundaries/route-loading';
import { useMyAssignments } from '../hooks/use-assignments';
import type { AssignmentRepository, StudentAssignment } from '../types';

export const taipeiDeadline = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('zh-TW', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Asia/Taipei',
      })
    : '未設定';

export const attemptSummary = (assignment: StudentAssignment) => {
  const limit =
    assignment.attemptLimit === null ? '不限' : String(assignment.attemptLimit);
  return `${String(assignment.attemptsUsed)} / ${limit}`;
};

export const latestOutcome = (assignment: StudentAssignment) => {
  if (assignment.latestAttemptStatus === null) return '尚未作答';
  if (assignment.latestAttemptStatus === 'in_progress') return '作答中';
  if (assignment.latestAttemptStatus === 'expired') return '已逾期';
  if (assignment.latestAttemptStatus === 'abandoned') return '已放棄';
  return assignment.latestPassed === true ? '已通過' : '已完成（未通過）';
};

export function StudentAssignmentsPage({
  repository,
}: Readonly<{ repository?: AssignmentRepository }>) {
  const assignments = useMyAssignments(repository);

  if (assignments.isPending) return <RouteLoading withinMain />;
  if (assignments.isError) {
    return (
      <section className="route-panel">
        <h1>我的作業</h1>
        <p role="alert">作業資料載入失敗，請稍後重試。</p>
        <button
          className="primary-action"
          onClick={() => void assignments.refetch()}
          type="button"
        >
          重試
        </button>
      </section>
    );
  }

  return (
    <section aria-labelledby="student-assignments-title" className="w-full">
      <header>
        <p className="route-panel__eyebrow">作業</p>
        <h1 id="student-assignments-title">我的作業</h1>
        <p>期限以台北時間顯示；完成與通過由伺服器判定。</p>
      </header>
      {assignments.data.length === 0 ? (
        <p>目前沒有作業。</p>
      ) : (
        <ul className="assignment-cards">
          {assignments.data.map((assignment) => (
            <li className="assignment-card" key={assignment.assignmentId}>
              <div className="assignment-card__head">
                <Link
                  className="assignment-card__title"
                  to={`/app/assignments/${assignment.assignmentId}`}
                >
                  <span aria-hidden="true">📬 </span>
                  {assignment.title}
                </Link>
                <span
                  className={`assignment-card__status assignment-card__status--${assignment.status}`}
                >
                  {assignment.status === 'paused' ? '已暫停' : '進行中'}
                </span>
              </div>
              <p className="assignment-card__meta">
                {assignment.classroomName}
              </p>
              <p className="assignment-card__meta">
                截止：
                {taipeiDeadline(assignment.deadlineAt)}
              </p>
              <p className="assignment-card__meta">
                次數 {attemptSummary(assignment)}・{latestOutcome(assignment)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
