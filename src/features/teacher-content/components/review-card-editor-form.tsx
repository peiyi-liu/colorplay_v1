import { useState } from 'react';
import type { SyntheticEvent } from 'react';

import type {
  ReviewCardDraftPayload,
  SubtopicOption,
} from '../api/teacher-content-repository';
import {
  type ReviewCardFormValues,
  toReviewCardDraftPayload,
  validateReviewCardForm,
} from './content-form-validation';

export function ReviewCardEditorForm({
  heading,
  initial,
  onCancel,
  onSubmit,
  pending,
  submitLabel,
  subtopics,
}: Readonly<{
  heading: string;
  initial: ReviewCardFormValues;
  onCancel(): void;
  onSubmit(payload: ReviewCardDraftPayload): void;
  pending: boolean;
  submitLabel: string;
  subtopics: readonly SubtopicOption[];
}>) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<readonly string[]>([]);

  const submit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validation = validateReviewCardForm(values);
    setErrors(validation);
    if (validation.length > 0) return;
    onSubmit(toReviewCardDraftPayload(values));
  };

  return (
    <form aria-label={heading} className="content-editor" onSubmit={submit}>
      <h3>{heading}</h3>
      <div>
        <label htmlFor="card-subtopic">子題</label>
        <select
          id="card-subtopic"
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
        <label htmlFor="card-code">卡片代碼</label>
        <input
          id="card-code"
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
        <label htmlFor="card-group">分組（選填）</label>
        <input
          id="card-group"
          onChange={(event) => {
            setValues((current) => ({
              ...current,
              groupLabel: event.target.value,
            }));
          }}
          value={values.groupLabel}
        />
      </div>
      <div>
        <label htmlFor="card-title">標題</label>
        <input
          id="card-title"
          onChange={(event) => {
            setValues((current) => ({
              ...current,
              title: event.target.value,
            }));
          }}
          value={values.title}
        />
      </div>
      <div>
        <label htmlFor="card-content">內容</label>
        <textarea
          id="card-content"
          onChange={(event) => {
            setValues((current) => ({
              ...current,
              content: event.target.value,
            }));
          }}
          value={values.content}
        />
      </div>
      <div>
        <label htmlFor="card-media-url">圖片網址（選填）</label>
        <input
          id="card-media-url"
          onChange={(event) => {
            setValues((current) => ({
              ...current,
              mediaUrl: event.target.value,
            }));
          }}
          value={values.mediaUrl}
        />
      </div>
      <div>
        <label htmlFor="card-media-alt">替代文字（圖片時必填）</label>
        <input
          id="card-media-alt"
          onChange={(event) => {
            setValues((current) => ({
              ...current,
              mediaAlt: event.target.value,
            }));
          }}
          value={values.mediaAlt}
        />
      </div>
      <div>
        <label htmlFor="card-recompletion">學生需重新完成此卡</label>
        <input
          checked={values.requiresRecompletion}
          id="card-recompletion"
          onChange={(event) => {
            setValues((current) => ({
              ...current,
              requiresRecompletion: event.target.checked,
            }));
          }}
          type="checkbox"
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
