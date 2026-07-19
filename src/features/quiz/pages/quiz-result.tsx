import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';

import { RouteLoading } from '../../../app/boundaries/route-loading';
import { parsePublicEnv } from '../../../lib/config/public-env';
import { getBrowserSupabaseClient } from '../../../lib/supabase/browser-client';
import {
  createQuizRepository,
  QuizRepositoryError,
  type QuizAssignmentAttempt,
  type QuizQuestion,
  type QuizRepository,
} from '../api/quiz-repository';

const assignmentBanner = (attempt: QuizAssignmentAttempt) => {
  if (attempt.status === 'completed' && attempt.passed === true)
    return '作業已完成並通過。';
  if (attempt.status === 'completed') return '作業已完成，未達及格分數。';
  if (attempt.status === 'expired')
    return '已超過作業截止時間，本次不計入作業。';
  return null;
};

const answerText = (question: QuizQuestion, optionId: string | null) => {
  if (optionId === null) return '未作答（逾時）';
  return (
    question.options.find(({ id }) => id === optionId)?.text ??
    '答案資料無法顯示'
  );
};

export function QuizResultPage({
  repository: suppliedRepository,
}: Readonly<{ repository?: QuizRepository }>) {
  const { sessionId } = useParams();
  const location = useLocation();
  const assignmentAttempt =
    location.state &&
    typeof location.state === 'object' &&
    'assignmentAttempt' in location.state
      ? (location.state as { assignmentAttempt: QuizAssignmentAttempt })
          .assignmentAttempt
      : null;
  const repository = useMemo(
    () =>
      suppliedRepository ??
      createQuizRepository(
        getBrowserSupabaseClient(parsePublicEnv(import.meta.env)),
      ),
    [suppliedRepository],
  );
  const sessionQuery = useQuery({
    enabled: Boolean(sessionId),
    queryFn: () => {
      if (!sessionId) throw new QuizRepositoryError('SESSION_NOT_FOUND');
      return repository.getSession(sessionId);
    },
    queryKey: ['quiz', 'session', sessionId ?? 'missing'],
    retry: (failureCount, error) =>
      error instanceof QuizRepositoryError &&
      error.code === 'UNAVAILABLE' &&
      failureCount < 2,
  });

  if (sessionQuery.isPending) return <RouteLoading withinMain />;

  const session = sessionQuery.data;
  if (sessionQuery.isError || !session || session.status !== 'completed') {
    const message =
      sessionQuery.error instanceof Error
        ? sessionQuery.error.message
        : '這次挑戰尚未完成，暫時不能查看結果。';
    return (
      <section className="quiz-message-panel">
        <h1>無法顯示結果</h1>
        <p role="alert">{message}</p>
        <Link className="primary-action" data-primary-action="true" to="/app">
          回章節
        </Link>
      </section>
    );
  }

  return (
    <section className="quiz-result" aria-labelledby="quiz-result-title">
      <header className="quiz-result__summary">
        <span className="quiz-result__emoji" aria-hidden="true">
          🎉
        </span>
        <p className="route-panel__eyebrow">{session.chapterTitle}</p>
        <h1 id="quiz-result-title">挑戰完成</h1>
        <div className="quiz-result__totals" aria-label="挑戰結果摘要">
          <p>總分 {String(session.totalScore)}</p>
          <p>
            答對 {String(session.correctCount)} /{' '}
            {String(session.questionCount)} 題
          </p>
          <p>+{String(session.xpAwarded)} XP</p>
          <p>+{String(session.tokensAwarded)} Token</p>
        </div>
        {assignmentAttempt && assignmentBanner(assignmentAttempt) ? (
          <div role="status">
            <p>{assignmentBanner(assignmentAttempt)}</p>
            <Link to="/app/assignments">返回我的作業</Link>
          </div>
        ) : null}
        <p className="quiz-result__rules">
          獎勵規則：{session.gameRulesVersion}（
          {String(session.rewardRatePercent)}%）
        </p>
        {session.gameRulesVersion === '2026-07-progress-1' ? (
          <div role="status">
            <p>
              補救練習完成：原始成績不變，Token +0，XP 以 20%
              計；答對的錯題已解決。
            </p>
            <Link to="/app/mistakes">返回我的錯題</Link>
          </div>
        ) : session.rewardRatePercent === 20 ? (
          <p className="quiz-result__decay">
            今日同一挑戰已完成 3 次，本次 XP 為 20%，Token 為 0。
          </p>
        ) : null}
      </header>

      <div className="quiz-result__review" aria-label="逐題回顧">
        {session.questions.map((question) => {
          const correct = question.answerStatus === 'correct';
          const timeout = question.answerStatus === 'timeout';
          return (
            <article
              className="result-question"
              key={question.sessionQuestionId}
            >
              <header>
                <p>第 {String(question.position)} 題</p>
                <h2>{correct ? '✓ 答對' : timeout ? '⌛ 逾時' : '✕ 答錯'}</h2>
              </header>
              <h3>{question.prompt}</h3>
              <dl>
                <div>
                  <dt>我的答案</dt>
                  <dd>{answerText(question, question.selectedOptionId)}</dd>
                </div>
                <div>
                  <dt>正確答案</dt>
                  <dd>{answerText(question, question.correctOptionId)}</dd>
                </div>
                <div>
                  <dt>解析</dt>
                  <dd>{question.explanation}</dd>
                </div>
              </dl>
            </article>
          );
        })}
      </div>

      <nav className="quiz-result__actions" aria-label="結果頁操作">
        <Link
          className="primary-action"
          data-primary-action="true"
          to={`/app/quiz/new?template=${session.templateId}`}
        >
          再玩一次
        </Link>
        <Link className="secondary-action" to="/app">
          回章節
        </Link>
      </nav>
    </section>
  );
}
