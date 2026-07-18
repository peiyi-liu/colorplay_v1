import { useState } from 'react';
import type { SyntheticEvent } from 'react';

import type {
  QuestionDraftPayload,
  SubtopicOption,
} from '../api/teacher-content-repository';
import {
  OPTION_KEYS,
  type QuestionFormValues,
  toQuestionDraftPayload,
  validateQuestionForm,
} from './content-form-validation';

export function QuestionEditorForm({
  heading,
  initial,
  onCancel,
  onSubmit,
  pending,
  submitLabel,
  subtopics,
}: Readonly<{
  heading: string;
  initial: QuestionFormValues;
  onCancel(): void;
  onSubmit(payload: QuestionDraftPayload): void;
  pending: boolean;
  submitLabel: string;
  subtopics: readonly SubtopicOption[];
}>) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<readonly string[]>([]);

  const setOptionText = (index: number, text: string) => {
    setValues((current) => ({
      ...current,
      options: current.options.map((option, position) =>
        position === index ? { ...option, text } : option,
      ),
    }));
  };
  const setCorrect = (index: number) => {
    setValues((current) => ({
      ...current,
      options: current.options.map((option, position) => ({
        ...option,
        isCorrect: position === index,
      })),
    }));
  };

  const submit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validation = validateQuestionForm(values);
    setErrors(validation);
    if (validation.length > 0) return;
    onSubmit(toQuestionDraftPayload(values));
  };

  return (
    <form aria-label={heading} className="content-editor" onSubmit={submit}>
      <h3>{heading}</h3>
      <div>
        <label htmlFor="question-subtopic">子題</label>
        <select
          id="question-subtopic"
          onChange={(event) => {
            setValues((current) => ({
              ...current,
              subtopicId: event.target.value,
            }));
          }}
          value={values.subtopicId}
        >
          <option value="">請選擇子題</option>
          {subtopics.map((subtopic) => (
            <option key={subtopic.subtopicId} value={subtopic.subtopicId}>
              {subtopic.title}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="question-code">題號</label>
        <input
          id="question-code"
          onChange={(event) => {
            setValues((current) => ({
              ...current,
              stableCode: event.target.value,
            }));
          }}
          value={values.stableCode}
        />
      </div>
      <div>
        <label htmlFor="question-prompt">題目</label>
        <textarea
          id="question-prompt"
          onChange={(event) => {
            setValues((current) => ({
              ...current,
              prompt: event.target.value,
            }));
          }}
          value={values.prompt}
        />
      </div>
      {OPTION_KEYS.map((key, index) => (
        <div key={key}>
          <label htmlFor={`question-option-${key}`}>選項 {key}</label>
          <input
            id={`question-option-${key}`}
            onChange={(event) => {
              setOptionText(index, event.target.value);
            }}
            value={values.options[index]?.text ?? ''}
          />
          <input
            aria-label={`正解 ${key}`}
            checked={values.options[index]?.isCorrect ?? false}
            name="question-correct"
            onChange={() => {
              setCorrect(index);
            }}
            type="radio"
          />
        </div>
      ))}
      <div>
        <label htmlFor="question-explanation">解析</label>
        <textarea
          id="question-explanation"
          onChange={(event) => {
            setValues((current) => ({
              ...current,
              explanation: event.target.value,
            }));
          }}
          value={values.explanation}
        />
      </div>
      {errors.length > 0 ? (
        <ul role="alert">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}
      <button disabled={pending} type="submit">
        {submitLabel}
      </button>
      <button onClick={onCancel} type="button">
        取消
      </button>
    </form>
  );
}
