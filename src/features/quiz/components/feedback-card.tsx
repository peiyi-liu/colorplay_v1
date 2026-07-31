import {
  SpiritAvatar,
  spiritForSeed,
  spiritLabels,
} from '../../../components/ui/spirit-avatar';
import type { QuizAnswerResult } from '../api/quiz-repository';

export type QuizFeedbackResult = Pick<
  QuizAnswerResult,
  | 'answerStatus'
  | 'correctOptionId'
  | 'correctOptionText'
  | 'explanation'
  | 'scoreDelta'
  | 'selectedOptionId'
  | 'totalScore'
>;

const feedbackHeading = {
  correct: '✓ 答對了',
  incorrect: '✕ 答錯了',
  timeout: '⌛ 作答逾時',
} as const;

const verdictFlair = {
  correct: 'HIT!',
  incorrect: 'MISS',
  timeout: '魔物反擊！',
} as const;

export function FeedbackCard({
  isLastQuestion,
  isPending,
  mentorSeed,
  onContinue,
  result,
}: Readonly<{
  isLastQuestion: boolean;
  isPending: boolean;
  mentorSeed?: string;
  onContinue: () => void;
  result: QuizFeedbackResult;
}>) {
  const mentor =
    mentorSeed === undefined ? undefined : spiritForSeed(mentorSeed);
  return (
    <aside
      className={`feedback-card feedback-card--${result.answerStatus}`}
      aria-labelledby="quiz-feedback-title"
    >
      <span aria-hidden="true" className="feedback-card__flair">
        {verdictFlair[result.answerStatus]}
      </span>
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
      {mentor ? (
        <div className="feedback-card__mentor">
          <SpiritAvatar variant={mentor} />
          <span
            className={`feedback-card__mentor-name feedback-card__mentor-name--${mentor}`}
          >
            {spiritLabels[mentor]}
          </span>
        </div>
      ) : null}
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
