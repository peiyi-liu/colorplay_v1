import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import type { ContentAuthoringRepository } from '../api/content-authoring-repository';
import type { ContentEditorState, ContentEntityType } from '../api/contracts';
import {
  CONTENT_ENTITY_LABELS,
  type ContentStudioItem,
} from '../lib/content-studio-model';
import { contentStudioKeys } from '../query-keys';

const editorSchema = z.object({
  content: z.string().max(5000),
  description: z.string().max(1000),
  durationSeconds: z.number().int().min(5).max(120),
  explanation: z.string().max(2000),
  groupLabel: z.string().max(120),
  kind: z.enum(['QB', 'CR', 'LT']),
  optionA: z.string().max(500),
  optionB: z.string().max(500),
  optionC: z.string().max(500),
  optionD: z.string().max(500),
  correctAnswer: z.enum(['A', 'B', 'C', 'D']),
  parentId: z.string(),
  prompt: z.string().max(1000),
  sortOrder: z.number().int().nonnegative(),
  stableCode: z.string().trim().min(1).max(200),
  title: z.string().max(100),
});

type EditorValues = z.infer<typeof editorSchema>;

function stringValue(payload: Readonly<Record<string, unknown>>, key: string) {
  return typeof payload[key] === 'string' ? payload[key] : '';
}

function numberValue(
  payload: Readonly<Record<string, unknown>>,
  key: string,
  fallback: number,
) {
  return typeof payload[key] === 'number' ? payload[key] : fallback;
}

function valuesFromState(
  item: ContentStudioItem,
  state: ContentEditorState | null,
): EditorValues {
  const payload = state?.draft?.payload ?? state?.current?.payload ?? {};
  const options = Array.isArray(payload.options)
    ? (payload.options as Record<string, unknown>[])
    : [];
  const optionText = (key: string) => {
    const value = options.find((option) => option.key === key)?.text;
    return typeof value === 'string' ? value : '';
  };
  const correct = options.find((option) => option.is_correct === true)?.key;
  return {
    content: stringValue(payload, 'content'),
    correctAnswer:
      correct === 'A' || correct === 'B' || correct === 'C' || correct === 'D'
        ? correct
        : 'A',
    description: stringValue(payload, 'description'),
    durationSeconds: numberValue(payload, 'duration_seconds', 20),
    explanation: stringValue(payload, 'explanation'),
    groupLabel: stringValue(payload, 'group_label'),
    kind: payload.kind === 'CR' || payload.kind === 'LT' ? payload.kind : 'QB',
    optionA: optionText('A'),
    optionB: optionText('B'),
    optionC: optionText('C'),
    optionD: optionText('D'),
    parentId:
      (stringValue(payload, 'course_id') ||
        stringValue(payload, 'chapter_id') ||
        stringValue(payload, 'section_id') ||
        stringValue(payload, 'subtopic_id') ||
        stringValue(payload, 'bank_id') ||
        item.parentId) ??
      '',
    prompt: stringValue(payload, 'prompt'),
    sortOrder: numberValue(payload, 'sort_order', 0),
    stableCode: state?.draft?.stableCode ?? state?.current?.stableCode ?? '',
    title: stringValue(payload, 'title') || item.title,
  };
}

function payloadFromValues(
  entityType: ContentEntityType,
  values: EditorValues,
): Readonly<Record<string, unknown>> {
  const common = { sort_order: values.sortOrder, title: values.title };
  switch (entityType) {
    case 'course':
      return { ...common, description: values.description };
    case 'chapter':
      return {
        ...common,
        course_id: values.parentId,
        description: values.description,
      };
    case 'section':
      return {
        ...common,
        chapter_id: values.parentId,
        description: values.description,
      };
    case 'subtopic':
      return {
        ...common,
        section_id: values.parentId,
        description: values.description,
      };
    case 'review_card':
      return {
        ...common,
        content: values.content,
        group_label: values.groupLabel,
        media: [],
        subtopic_id: values.parentId,
      };
    case 'assessment_bank':
      return {
        ...common,
        ...(values.kind === 'CR'
          ? { chapter_id: values.parentId }
          : { section_id: values.parentId }),
        description: values.description,
        kind: values.kind,
        selection_settings: {},
      };
    case 'question':
      return {
        bank_id: values.parentId,
        duration_seconds: values.durationSeconds,
        explanation: values.explanation,
        options: (['A', 'B', 'C', 'D'] as const)
          .map((key, index) => ({
            is_correct: values.correctAnswer === key,
            key,
            sort_order: index + 1,
            text: values[`option${key}`],
          }))
          .filter((option) => option.text.trim().length > 0),
        prompt: values.prompt,
        question_type: 'single_choice',
        sort_order: values.sortOrder,
      };
  }
}

export function ContentEditorForm({
  item,
  onDirtyChange,
  onReload,
  repository,
  state,
}: Readonly<{
  item: ContentStudioItem;
  onDirtyChange: (dirty: boolean) => void;
  onReload: () => Promise<unknown>;
  repository: ContentAuthoringRepository;
  state: ContentEditorState | null;
}>) {
  const queryClient = useQueryClient();
  const [draftIdentity, setDraftIdentity] = useState(() => ({
    draftId: state?.draft?.draftId ?? item.draftId,
    revision: state?.draft?.revision ?? 0,
  }));
  const [notice, setNotice] = useState<string | null>(null);
  const [conflicted, setConflicted] = useState(false);
  const saveRequest = useRef<{ id: string; signature: string } | null>(null);
  const initialValues = useMemo(
    () => valuesFromState(item, state),
    [item, state],
  );
  const {
    formState: { errors, isDirty },
    handleSubmit,
    register,
    reset,
  } = useForm<EditorValues>({
    defaultValues: initialValues,
    resolver: zodResolver(editorSchema),
  });

  useEffect(() => {
    onDirtyChange(isDirty);
    return () => {
      onDirtyChange(false);
    };
  }, [isDirty, onDirtyChange]);

  const save = useMutation({
    mutationFn: (values: EditorValues) => {
      const signature = JSON.stringify({
        draftIdentity,
        entityId: item.entityId,
        entityType: item.entityType,
        stableCode: values.stableCode,
        values,
      });
      if (saveRequest.current?.signature !== signature) {
        saveRequest.current = { id: crypto.randomUUID(), signature };
      }
      return repository.saveDraft({
        draftId: draftIdentity.draftId,
        entityId: item.entityId,
        entityType: item.entityType,
        expectedRevision: draftIdentity.revision,
        payload: payloadFromValues(item.entityType, values),
        requestId: saveRequest.current.id,
        source: 'manual',
        stableCode: values.stableCode,
      });
    },
    onSuccess: (result, values) => {
      if (result.outcome === 'denied') {
        saveRequest.current = null;
        setConflicted(result.code === 'CONTENT_DRAFT_CONFLICT');
        setNotice(
          result.code === 'CONTENT_DRAFT_CONFLICT'
            ? '草稿已被其他工作階段更新，請重新載入後比較。'
            : result.message,
        );
        return;
      }
      saveRequest.current = null;
      setConflicted(false);
      setDraftIdentity({
        draftId: result.draft.draftId,
        revision: result.draft.revision,
      });
      reset(values);
      setNotice(`草稿已儲存（修訂 ${String(result.draft.revision)}）`);
      void queryClient.invalidateQueries({ queryKey: contentStudioKeys.all });
    },
    onError: () => {
      setNotice('草稿儲存失敗，資料尚未變更。');
    },
  });

  const validate = useMutation({
    mutationFn: () => {
      if (!draftIdentity.draftId || draftIdentity.revision < 1)
        throw new Error('DRAFT_REQUIRED');
      return repository.validateDraft({
        draftId: draftIdentity.draftId,
        expectedRevision: draftIdentity.revision,
      });
    },
    onSuccess: (result) => {
      if (result.outcome === 'denied') setNotice(result.message);
      else if (result.valid) setNotice('草稿驗證通過');
      else setNotice(result.issues.map((issue) => issue.message).join('；'));
    },
    onError: () => {
      setNotice('請先儲存草稿，再執行驗證。');
    },
  });

  const preview = useMutation({
    mutationFn: () => {
      if (!draftIdentity.draftId || draftIdentity.revision < 1)
        throw new Error('DRAFT_REQUIRED');
      return repository.previewDraft({
        draftId: draftIdentity.draftId,
        expectedRevision: draftIdentity.revision,
      });
    },
  });

  const publishedStableCode = state?.current?.version != null;
  return (
    <form
      className="content-editor"
      onSubmit={(event) => {
        void handleSubmit((values) => {
          save.mutate(values);
        })(event);
      }}
    >
      <header>
        <div>
          <span>{CONTENT_ENTITY_LABELS[item.entityType]}</span>
          <h2>{item.title}</h2>
        </div>
        <span className={`content-status content-status--${item.status}`}>
          {item.status === 'published'
            ? '已發布'
            : item.status === 'archived'
              ? '已封存'
              : '草稿'}
        </span>
      </header>
      <label>
        穩定代碼
        <input disabled={publishedStableCode} {...register('stableCode')} />
      </label>
      {errors.stableCode ? <p role="alert">請輸入穩定代碼。</p> : null}
      <label>
        標題
        <input {...register('title')} />
      </label>
      {item.entityType !== 'course' ? (
        <label>
          上層 ID
          <input {...register('parentId')} />
        </label>
      ) : null}
      <label>
        排序
        <input
          min="0"
          type="number"
          {...register('sortOrder', { valueAsNumber: true })}
        />
      </label>

      {['course', 'chapter', 'section', 'subtopic'].includes(
        item.entityType,
      ) ? (
        <label>
          說明
          <textarea rows={4} {...register('description')} />
        </label>
      ) : null}
      {item.entityType === 'review_card' ? (
        <>
          <label>
            群組標籤
            <input {...register('groupLabel')} />
          </label>
          <label>
            複習卡內容
            <textarea rows={10} {...register('content')} />
          </label>
        </>
      ) : null}
      {item.entityType === 'assessment_bank' ? (
        <>
          <label>
            題庫類型
            <select {...register('kind')}>
              <option value="QB">QB 小節測驗</option>
              <option value="LT">LT Live 題庫</option>
              <option value="CR">CR 章節總測驗</option>
            </select>
          </label>
          <label>
            說明
            <textarea rows={3} {...register('description')} />
          </label>
        </>
      ) : null}
      {item.entityType === 'question' ? (
        <>
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
            正確答案
            <select {...register('correctAnswer')}>
              {['A', 'B', 'C', 'D'].map((key) => (
                <option key={key}>{key}</option>
              ))}
            </select>
          </label>
          <label>
            作答秒數
            <input
              min="5"
              max="120"
              type="number"
              {...register('durationSeconds', { valueAsNumber: true })}
            />
          </label>
          <label>
            解說
            <textarea rows={4} {...register('explanation')} />
          </label>
        </>
      ) : null}

      {notice ? (
        <p className="content-editor__notice" role="status">
          {notice}
        </p>
      ) : null}
      {conflicted ? (
        <button
          className="secondary-action"
          type="button"
          onClick={() => {
            void onReload();
          }}
        >
          重新載入並比較
        </button>
      ) : null}
      {preview.data?.outcome === 'ok' ? (
        <section aria-label="學生安全預覽" className="content-editor__preview">
          <h3>學生預覽</h3>
          {'prompt' in preview.data.projection ? (
            <p>{preview.data.projection.prompt}</p>
          ) : (
            <>
              <strong>{preview.data.projection.title}</strong>
              <p>{preview.data.projection.content}</p>
            </>
          )}
        </section>
      ) : null}
      <div className="content-editor__actions">
        <button
          className="primary-action"
          disabled={save.isPending}
          type="submit"
        >
          {save.isPending ? '儲存中…' : '儲存草稿'}
        </button>
        <button
          className="secondary-action"
          type="button"
          onClick={() => {
            validate.mutate();
          }}
        >
          驗證草稿
        </button>
        {item.entityType === 'review_card' || item.entityType === 'question' ? (
          <button
            className="secondary-action"
            type="button"
            onClick={() => {
              preview.mutate();
            }}
          >
            學生預覽
          </button>
        ) : null}
      </div>
    </form>
  );
}
