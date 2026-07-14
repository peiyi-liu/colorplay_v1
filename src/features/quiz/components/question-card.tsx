import type { SyntheticEvent } from 'react';

import type { QuizQuestion } from '../api/quiz-repository';

export function QuestionCard({
  isPending,
  locked,
  onSelect,
  onSubmit,
  question,
  selectedOptionId,
}: Readonly<{
  isPending: boolean;
  locked: boolean;
  onSelect: (optionId: string) => void;
  onSubmit: () => void;
  question: QuizQuestion;
  selectedOptionId: string | null;
}>) {
  const handleSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (locked || isPending || selectedOptionId === null) return;
    onSubmit();
  };

  return (
    <form className="question-card" onSubmit={handleSubmit}>
      <fieldset disabled={locked || isPending}>
        <legend>{question.prompt}</legend>
        <div className="question-options">
          {question.options.map((option) => (
            <label
              className="question-option"
              data-selected={selectedOptionId === option.id ? 'true' : 'false'}
              key={option.id}
            >
              <input
                checked={selectedOptionId === option.id}
                name={`question-${question.sessionQuestionId}`}
                onChange={() => {
                  onSelect(option.id);
                }}
                type="radio"
                value={option.id}
              />
              <span className="question-option__key" aria-hidden="true">
                {option.key}
              </span>
              <span>{option.text}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {locked ? null : (
        <div className="question-card__action">
          <button
            className="primary-action"
            data-primary-action="true"
            disabled={isPending || selectedOptionId === null}
            type="submit"
          >
            {isPending ? '送出中…' : '送出答案'}
          </button>
        </div>
      )}
    </form>
  );
}
