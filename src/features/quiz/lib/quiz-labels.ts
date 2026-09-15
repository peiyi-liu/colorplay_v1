import type { QuizSession } from '../api/quiz-repository';

export const withoutNumberPrefix = (title: string) =>
  title.replace(
    /^\s*(?:第\s*)?\d+(?:\s*[-–—・.]\s*\d+)?(?:\s*章|節)?\s*[-–—・.]?\s*/u,
    '',
  );

export function quizChallengeLabel(session: QuizSession | undefined) {
  if (session?.gameRulesVersion === '2026-07-progress-1') return '錯題補救練習';
  return session?.challengeKind === 'section' &&
    session.sectionSortOrder !== null &&
    session.sectionTitle
    ? `${String(session.chapterSortOrder)}-${String(session.sectionSortOrder)}・${withoutNumberPrefix(session.sectionTitle)}`
    : '章節總挑戰';
}
