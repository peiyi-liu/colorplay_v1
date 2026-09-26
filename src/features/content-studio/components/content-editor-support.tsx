import type { UseFormRegister } from 'react-hook-form';

import type { ContentPreview } from '../api/contracts';
import type { EditorValues } from './content-editor-form-model';

export function ContentEditorQuestionFields({
  register,
}: Readonly<{ register: UseFormRegister<EditorValues> }>) {
  return (
    <>
      <label>
        題型
        <input disabled value="單選題" />
      </label>
      <label>
        題目
        <textarea rows={4} {...register('prompt')} />
      </label>
      <div className="content-editor__options">
        {(['A', 'B', 'C', 'D'] as const).map((key) => (
          <label key={key}>
            選項 {key}
            <input {...register(`option${key}`)} />
          </label>
        ))}
      </div>
      <label>
        正確選項
        <select {...register('correctAnswer')}>
          {['A', 'B', 'C', 'D'].map((key) => (
            <option key={key}>{key}</option>
          ))}
        </select>
      </label>
      <input
        type="hidden"
        {...register('durationSeconds', { valueAsNumber: true })}
      />
      <label>
        解說
        <textarea rows={4} {...register('explanation')} />
      </label>
    </>
  );
}

export function ContentEditorFeedback({
  conflicted,
  notice,
  onReload,
  projection,
}: Readonly<{
  conflicted: boolean;
  notice: string | null;
  onReload: () => Promise<unknown>;
  projection: ContentPreview['projection'] | null;
}>) {
  return (
    <>
      {notice ? (
        <p className="content-editor__notice" role="status">
          {notice}
        </p>
      ) : null}
      {conflicted ? (
        <button
          className="secondary-action"
          type="button"
          onClick={() => void onReload()}
        >
          重新載入並比較
        </button>
      ) : null}
      {projection ? (
        <section aria-label="學生安全預覽" className="content-editor__preview">
          <h3>學生預覽</h3>
          {projection.entityType === 'question' ? (
            <>
              <p>{projection.prompt}</p>
              <ol type="A">
                {projection.options.map((option) => (
                  <li key={option.key}>{option.text}</li>
                ))}
              </ol>
            </>
          ) : (
            <>
              <strong>{projection.title}</strong>
              <p>{projection.content}</p>
            </>
          )}
        </section>
      ) : null}
    </>
  );
}

export function ContentEditorActions({
  isNew,
  isSaving,
  onPreview,
  onValidate,
  showPreview,
}: Readonly<{
  isNew: boolean;
  isSaving: boolean;
  onPreview: () => void;
  onValidate: () => void;
  showPreview: boolean;
}>) {
  return (
    <>
      <div
        className="content-editor__validation-help"
        id="draft-validation-help"
      >
        <strong>「驗證草稿」會做什麼？</strong>
        <span>
          檢查必填欄位、父層關係、題目選項與圖片資料；通過不等於已發布。
        </span>
      </div>
      <div className="content-editor__actions">
        <button className="primary-action" disabled={isSaving} type="submit">
          {isSaving ? '儲存中…' : isNew ? '新增內容' : '儲存草稿'}
        </button>
        <button
          aria-describedby="draft-validation-help"
          className="secondary-action"
          onClick={onValidate}
          type="button"
        >
          驗證草稿
        </button>
        {showPreview ? (
          <button
            className="secondary-action"
            onClick={onPreview}
            type="button"
          >
            學生預覽
          </button>
        ) : null}
      </div>
    </>
  );
}
