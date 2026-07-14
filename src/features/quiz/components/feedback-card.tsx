import type { QuizAnswerResult } from '../api/quiz-repository';

const feedbackHeading = {
  correct: '✓ 答對了',
  incorrect: '✕ 答錯了',
  timeout: '⌛ 作答逾時',
} as const;

export function FeedbackCard({
  isLastQuestion,
  isPending,
  onContinue,
  result,
}: Readonly<{
  isLastQuestion: boolean;
  isPending: boolean;
  onContinue: () => void;
  result: QuizAnswerResult;
}>) {
  return (
    <aside
      className={`feedback-card feedback-card--${result.answerStatus}`}
      aria-labelledby="quiz-feedback-title"
    >
      <h2 id="quiz-feedback-title">{feedbackHeading[result.answerStatus]}</h2>
      {result.scoreDelta > 0 ? (
        <p className="feedback-card__score">
          本題 +{String(result.scoreDelta)} 分
        </p>
      ) : null}
      {result.answerStatus === 'correct' ? null : (
        <p>
          <strong>正確答案：{result.correctOptionText}</strong>
        </p>
      )}
      <p>{result.explanation}</p>
      <button
        className="primary-action"
        data-primary-action="true"
        disabled={isPending}
        onClick={onContinue}
        type="button"
      >
        {isLastQuestion ? '結算並查看結果' : '我理解了，下一題'}
      </button>
    </aside>
  );
}
