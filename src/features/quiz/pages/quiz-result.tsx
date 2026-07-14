import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';

import { RouteLoading } from '../../../app/boundaries/route-loading';
import { parsePublicEnv } from '../../../lib/config/public-env';
import { getBrowserSupabaseClient } from '../../../lib/supabase/browser-client';
import {
  createQuizRepository,
  QuizRepositoryError,
  type QuizQuestion,
  type QuizRepository,
} from '../api/quiz-repository';

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
        <p className="route-panel__eyebrow">{session.chapterTitle}</p>
        <h1 id="quiz-result-title">挑戰完成</h1>
        <div className="quiz-result__totals" aria-label="挑戰結果摘要">
          <p>總分 {String(session.totalScore)}</p>
          <p>
            答對 {String(session.correctCount)} /{' '}
            {String(session.questionCount)} 題
          </p>
        </div>
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
