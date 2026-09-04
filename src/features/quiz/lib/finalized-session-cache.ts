import type { QuizFinalResult, QuizSession } from '../api/quiz-repository';

export const applyFinalResultToSession = (
  cachedSession: QuizSession | undefined,
  finalResult: QuizFinalResult,
): QuizSession | undefined =>
  cachedSession
    ? {
        ...cachedSession,
        answeredCount: finalResult.answeredCount,
        completedAt: finalResult.completedAt,
        correctCount: finalResult.correctCount,
        gameRulesVersion: finalResult.gameRulesVersion,
        questionCount: finalResult.questionCount,
        rewardRatePercent: finalResult.rewardRatePercent,
        status: finalResult.status,
        tokensAwarded: finalResult.tokensAwarded,
        totalScore: finalResult.totalScore,
        xpAwarded: finalResult.xpAwarded,
      }
    : cachedSession;
