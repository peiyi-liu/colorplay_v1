import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { RouteLoading } from '../../../app/boundaries/route-loading';
import {
  useMyAssignments,
  useStartAssignmentAttempt,
} from '../hooks/use-assignments';
import {
  type AssignmentRepository,
  AssignmentRepositoryError,
  type StudentAssignment,
} from '../types';
import {
  attemptSummary,
  latestOutcome,
  taipeiDeadline,
} from './student-assignments-page';

const startBlocker = (assignment: StudentAssignment): string | null => {
  const now = Date.now();
  if (assignment.status === 'paused') return '這份作業目前暫停中。';
  if (
    assignment.availableFrom !== null &&
    now < new Date(assignment.availableFrom).getTime()
  )
    return `作業將於 ${taipeiDeadline(assignment.availableFrom)} 開放。`;
  if (
    assignment.deadlineAt !== null &&
    now >= new Date(assignment.deadlineAt).getTime()
  )
    return '已超過截止時間。';
  if (
    assignment.attemptLimit !== null &&
    assignment.attemptsUsed >= assignment.attemptLimit
  )
    return '已用完作答次數。';
  return null;
};

const startErrorMessage = (error: unknown) => {
  if (error instanceof AssignmentRepositoryError) {
    if (error.code === 'DEADLINE_PASSED') return '已超過截止時間。';
    if (error.code === 'ATTEMPT_LIMIT_REACHED') return '已用完作答次數。';
    if (error.code === 'NOT_AVAILABLE_YET') return '作業尚未開放。';
    if (error.code === 'NOT_PUBLISHED') return '這份作業目前暫停中。';
    if (error.code === 'NOT_FOUND') return '找不到這份作業。';
  }
  return '目前無法開始作答，請稍後重試。';
};

export function StudentAssignmentDetailPage({
  assignmentId: suppliedAssignmentId,
  repository,
}: Readonly<{
  assignmentId?: string;
  repository?: AssignmentRepository;
}>) {
  const params = useParams();
  const assignmentId = suppliedAssignmentId ?? params.assignmentId ?? '';
  const navigate = useNavigate();
  const assignments = useMyAssignments(repository);
  const start = useStartAssignmentAttempt(repository);
  const requestIdRef = useRef(crypto.randomUUID());
  const [startError, setStartError] = useState<string>();

  if (assignments.isPending) return <RouteLoading withinMain />;
  if (assignments.isError) {
    return (
      <section className="route-panel">
        <h1>作業內容</h1>
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

  const assignment = assignments.data.find(
    (entry) => entry.assignmentId === assignmentId,
  );
  if (!assignment) {
    return (
      <section className="route-panel">
        <h1>作業內容</h1>
        <p role="alert">找不到這份作業，或你不是作業對象。</p>
        <Link className="primary-action" to="/app/assignments">
          回作業列表
        </Link>
      </section>
    );
  }

  const blocker = startBlocker(assignment);

  const beginAttempt = async () => {
    setStartError(undefined);
    try {
      const attempt = await start.mutateAsync({
        assignmentId: assignment.assignmentId,
        requestId: requestIdRef.current,
      });
      void navigate(`/app/quiz/${attempt.sessionId}`);
    } catch (error) {
      setStartError(startErrorMessage(error));
    }
  };

  return (
    <section aria-labelledby="assignment-detail-title" className="w-full">
      <header>
        <p className="route-panel__eyebrow">{assignment.classroomName}</p>
        <h1 id="assignment-detail-title">{assignment.title}</h1>
      </header>
      <dl>
        <dt>開放時間</dt>
        <dd>{taipeiDeadline(assignment.availableFrom)}</dd>
        <dt>截止時間</dt>
        <dd>{taipeiDeadline(assignment.deadlineAt)}</dd>
        <dt>作答次數</dt>
        <dd>{attemptSummary(assignment)}</dd>
        <dt>及格分數</dt>
        <dd>{String(assignment.passingThreshold)} 分</dd>
        <dt>最新結果</dt>
        <dd>{latestOutcome(assignment)}</dd>
      </dl>
      {blocker ? <p role="status">{blocker}</p> : null}
      <button
        className="primary-action"
        data-primary-action="true"
        disabled={Boolean(blocker) || start.isPending}
        onClick={() => void beginAttempt()}
        type="button"
      >
        {start.isPending ? '準備題目中…' : '開始作答'}
      </button>
      {startError ? <p role="alert">{startError}</p> : null}
      <Link to="/app/assignments">回作業列表</Link>
    </section>
  );
}
