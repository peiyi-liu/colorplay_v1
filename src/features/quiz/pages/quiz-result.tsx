import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';

import { RouteLoading } from '../../../app/boundaries/route-loading';
import { parsePublicEnv } from '../../../lib/config/public-env';
import { getBrowserSupabaseClient } from '../../../lib/supabase/browser-client';
import { useAchievements } from '../../achievements/hooks/use-achievements';
import { type AchievementRepository } from '../../achievements/types';
import { useEconomySummary } from '../../rewards/hooks/use-economy-summary';
import { type EconomyRepository } from '../../rewards/types';
import {
  createQuizRepository,
  QuizRepositoryError,
  type QuizQuestion,
  type QuizRepository,
} from '../api/quiz-repository';
import { LootReveal } from '../components/loot-reveal';
import { crossedLevelBoundary, unlockedSince } from '../lib/reward-derivations';

const answerText = (question: QuizQuestion, optionId: string | null) => {
  if (optionId === null) return '未作答（逾時）';
  return (
    question.options.find(({ id }) => id === optionId)?.text ??
    '答案資料無法顯示'
  );
};

export function QuizResultPage({
  achievementRepository,
  economyRepository,
  repository: suppliedRepository,
}: Readonly<{
  achievementRepository?: AchievementRepository | undefined;
  economyRepository?: EconomyRepository | undefined;
  repository?: QuizRepository;
}>) {
  const { sessionId } = useParams();
  const location = useLocation();
  const fromFinalize = Boolean(
    (location.state as { fromFinalize?: boolean } | null)?.fromFinalize,
  );
  const economyQuery = useEconomySummary(economyRepository);
  const achievementsQuery = useAchievements(achievementRepository);
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

  const newAchievements =
    fromFinalize && achievementsQuery.data && session.completedAt
      ? unlockedSince(achievementsQuery.data.items, session.completedAt)
      : [];
  const leveledUp =
    fromFinalize && economyQuery.data
      ? crossedLevelBoundary(
          economyQuery.data.totalXp,
          session.xpAwarded,
          economyQuery.data.xpPerLevel,
        )
      : false;

  return (
    <section
      className="quiz-result scene-night victory-scene"
      aria-labelledby="quiz-result-title"
    >
      <header className="quiz-result__summary">
        <p aria-hidden="true" className="victory-banner">
          VICTORY
        </p>
        <p className="route-panel__eyebrow">{session.chapterTitle}</p>
        <h1 id="quiz-result-title">挑戰完成 🎉</h1>
        <LootReveal
          correctCount={session.correctCount}
          questionCount={session.questionCount}
          tokensAwarded={session.tokensAwarded}
          totalScore={session.totalScore}
          xpAwarded={session.xpAwarded}
        />
        {leveledUp && economyQuery.data ? (
          <p className="level-up-fanfare" role="status">
            LEVEL UP！等級提升至 Lv.{String(economyQuery.data.level)}
          </p>
        ) : null}
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

      {newAchievements.length > 0 ? (
        <section
          className="quiz-result__achievements"
          aria-labelledby="quiz-result-achievements-title"
        >
          <h2 id="quiz-result-achievements-title">本次新解鎖成就</h2>
          <ul>
            {newAchievements.map((item) => (
              <li className="achievement-loot" key={item.stableCode}>
                <span aria-hidden="true" className="achievement-loot__badge" />
                <div>
                  <strong>{item.displayName}</strong>
                  <p>{item.description}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

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
                <h2
                  className={`result-question__status--${
                    correct ? 'correct' : timeout ? 'timeout' : 'incorrect'
                  }`}
                >
                  {correct ? '✓ 答對' : timeout ? '⌛ 逾時' : '✕ 答錯'}
                </h2>
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
