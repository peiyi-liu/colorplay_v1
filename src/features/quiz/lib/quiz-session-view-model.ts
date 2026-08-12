import type { QuizQuestion } from '../api/quiz-repository';
import type { QuizFeedbackResult } from '../components/feedback-card';

export type QuizActionError = Readonly<{
  kind: 'advance' | 'finalize' | 'submit';
  message: string;
}>;

export const quizActionErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : '答題服務暫時無法使用，請稍後重試。';

export const feedbackFromQuestion = (
  question: QuizQuestion | undefined,
  totalScore: number,
): QuizFeedbackResult | undefined => {
  if (
    !question?.answerStatus ||
    !question.correctOptionId ||
    !question.explanation ||
    question.scoreDelta === null
  ) {
    return undefined;
  }
  const correctOption = question.options.find(
    ({ id }) => id === question.correctOptionId,
  );
  if (!correctOption) return undefined;
  return {
    answerStatus: question.answerStatus,
    correctOptionId: question.correctOptionId,
    correctOptionText: correctOption.text,
    explanation: question.explanation,
    scoreDelta: question.scoreDelta,
    selectedOptionId: question.selectedOptionId,
    totalScore,
  };
};
