import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import type { ContentAuthoringRepository } from '../api/content-authoring-repository';
import {
  createContentMediaRepository,
  type ContentMediaRepository,
} from '../api/content-media-repository';
import type {
  ContentEditorState,
  ContentCatalog,
  ContentEntityType,
  ContentScope,
} from '../api/contracts';
import {
  CONTENT_ENTITY_LABELS,
  type ContentStudioItem,
} from '../lib/content-studio-model';
import { contentStudioKeys } from '../query-keys';
import {
  editorSchema,
  ENTITY_TYPES,
  type EditorValues,
  nextStableCode,
  newHierarchyOrder,
  payloadFromValues,
  valuesFromState,
} from './content-editor-form-model';
import { ContentEditorMediaField } from './content-editor-media-field';
import { ContentEditorScopeFields } from './content-editor-scope-fields';
import {
  ContentEditorActions,
  ContentEditorFeedback,
  ContentEditorQuestionFields,
} from './content-editor-support';

export function ContentEditorForm({
  allItems,
  catalog,
  item,
  mediaRepository = createContentMediaRepository(),
  onCancel,
  onChapterChange,
  onCreated,
  onDirtyChange,
  onNewTypeChange,
  onOpenLifecycle,
  onReload,
  repository,
  scope,
  state,
}: Readonly<{
  allItems: readonly ContentStudioItem[];
  catalog: ContentCatalog;
  item: ContentStudioItem;
  mediaRepository?: ContentMediaRepository | undefined;
  onCancel: () => void;
  onChapterChange: (chapterId: string) => void;
  onCreated: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onNewTypeChange: (entityType: ContentEntityType) => void;
  onOpenLifecycle: () => void;
  onReload: () => Promise<unknown>;
  repository: ContentAuthoringRepository;
  scope: ContentScope;
  state: ContentEditorState | null;
}>) {
  const queryClient = useQueryClient();
  const isNew = item.entityId === null && item.draftId === null;
  const [draftIdentity, setDraftIdentity] = useState(() => ({
    draftId: state?.draft?.draftId ?? item.draftId,
    revision: state?.draft?.revision ?? 0,
  }));
  const [notice, setNotice] = useState<string | null>(null);
  const [conflicted, setConflicted] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageAlt, setImageAlt] = useState('');
  const [imageRole, setImageRole] = useState<'standard' | 'color_critical'>(
    'standard',
  );
  const saveRequest = useRef<{ id: string; signature: string } | null>(null);
  const uploadRequest = useRef<string | null>(null);
  const initialValues = useMemo(() => {
    const initial = valuesFromState(item, state, scope);
    const order = isNew
      ? newHierarchyOrder(item.entityType, scope, catalog, initial.sectionId)
      : null;
    if (order !== null) initial.sortOrder = order;
    return initial;
  }, [catalog, isNew, item, scope, state]);
  const {
    control,
    formState: { errors, isDirty },
    handleSubmit,
    register,
    reset,
    setValue,
  } = useForm<EditorValues>({
    defaultValues: initialValues,
    resolver: zodResolver(editorSchema),
  });
  const values = useWatch({
    control,
    defaultValue: initialValues,
  }) as EditorValues;
  useEffect(() => {
    onDirtyChange(isDirty);
    return () => {
      onDirtyChange(false);
    };
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    if (!isNew) return;
    const stableCode = nextStableCode(item.entityType, values, scope, allItems);
    if (values.stableCode !== stableCode)
      setValue('stableCode', stableCode, { shouldDirty: false });
  }, [allItems, isNew, item.entityType, scope, setValue, values]);

  useEffect(() => {
    let parentId = values.parentId;
    if (item.entityType === 'section') parentId = values.chapterId;
    if (item.entityType === 'subtopic') parentId = values.sectionId;
    if (item.entityType === 'review_card') parentId = values.subtopicId;
    if (item.entityType === 'assessment_bank')
      parentId = values.kind === 'CR' ? values.chapterId : values.sectionId;
    if (item.entityType === 'question') parentId = values.bankId;
    if (values.parentId !== parentId)
      setValue('parentId', parentId, { shouldDirty: false });
  }, [item.entityType, setValue, values]);

  const save = useMutation({
    mutationFn: (formValues: EditorValues) => {
      const signature = JSON.stringify({
        draftIdentity,
        entityId: item.entityId,
        entityType: item.entityType,
        stableCode: formValues.stableCode,
        values: formValues,
      });
      if (saveRequest.current?.signature !== signature)
        saveRequest.current = { id: crypto.randomUUID(), signature };
      return repository.saveDraft({
        draftId: draftIdentity.draftId,
        entityId: item.entityId,
        entityType: item.entityType,
        expectedRevision: draftIdentity.revision,
        payload: payloadFromValues(item.entityType, formValues),
        requestId: saveRequest.current.id,
        source: 'manual',
        stableCode: formValues.stableCode,
      });
    },
    onError: () => {
      setNotice('草稿儲存失敗，資料尚未變更。');
    },
    onSuccess: (result, formValues) => {
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
      reset(formValues);
      void queryClient.invalidateQueries({ queryKey: contentStudioKeys.all });
      if (isNew) onCreated();
      else setNotice(`草稿已儲存（修訂 ${String(result.draft.revision)}）`);
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
    onError: () => {
      setNotice('請先儲存草稿，再執行驗證。');
    },
    onSuccess: (result) => {
      if (result.outcome === 'denied') setNotice(result.message);
      else if (result.valid) setNotice('草稿驗證通過，可以進入發布流程。');
      else setNotice(result.issues.map((issue) => issue.message).join('；'));
    },
  });

  const deleteDraft = useMutation({
    mutationFn: () => {
      if (!draftIdentity.draftId || draftIdentity.revision < 1)
        throw new Error('DRAFT_REQUIRED');
      return repository.deleteDraft({
        draftId: draftIdentity.draftId,
        expectedRevision: draftIdentity.revision,
        requestId: crypto.randomUUID(),
      });
    },
    onError: () => {
      setNotice('草稿刪除失敗，資料未變更。');
    },
    onSuccess: (result) => {
      if (result.outcome === 'denied') {
        setNotice(result.message);
        return;
      }
      void queryClient.invalidateQueries({ queryKey: contentStudioKeys.all });
      onCreated();
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
    onError: () => {
      setNotice('請先儲存草稿，才能產生學生預覽。');
    },
  });

  const uploadImage = useMutation({
    mutationFn: async () => {
      if (!imageFile || !imageAlt.trim()) throw new Error('IMAGE_REQUIRED');
      uploadRequest.current ??= crypto.randomUUID();
      return mediaRepository.uploadAndProcess({
        file: imageFile,
        requestId: uploadRequest.current,
        semanticRole: imageRole,
      });
    },
    onError: () => {
      setNotice('圖片處理失敗；原圖不會加入內容。');
    },
    onSuccess: (asset) => {
      setValue(
        'media',
        [
          ...values.media,
          {
            alt_text: imageAlt.trim(),
            manifest_id: asset.assetId,
            semantic_role: asset.semanticRole,
            sort_order: values.media.length,
          },
        ],
        { shouldDirty: true },
      );
      setImageFile(null);
      setImageAlt('');
      uploadRequest.current = null;
      setNotice('圖片已壓縮為 WebP 並加入表單；儲存草稿後才會套用。');
    },
  });

  const heading = isNew
    ? `新增${CONTENT_ENTITY_LABELS[item.entityType]}`
    : `編輯 ${item.stableCode}`;
  const showHierarchyNumber = [
    'course',
    'chapter',
    'section',
    'subtopic',
  ].includes(item.entityType);

  return (
    <form
      className="content-editor"
      onSubmit={(event) => {
        void handleSubmit(
          (formValues) => {
            save.mutate(formValues);
          },
          () => {
            setNotice('尚有必填或格式錯誤欄位，請依欄位提示修正後再儲存。');
          },
        )(event);
      }}
    >
      <header className="content-editor__heading">
        <div>
          <button
            className="content-editor__back"
            onClick={onCancel}
            type="button"
          >
            <ArrowLeft aria-hidden="true" /> 返回清單
          </button>
          <h2>{heading}</h2>
        </div>
        <span className={`content-status content-status--${item.status}`}>
          {isNew
            ? '新增中'
            : item.status === 'published'
              ? '已發布'
              : item.status === 'archived'
                ? '已封存'
                : '草稿'}
        </span>
      </header>

      {isNew ? (
        <label>
          新增類型
          <select
            value={item.entityType}
            onChange={(event) => {
              onNewTypeChange(event.target.value as ContentEntityType);
            }}
          >
            {ENTITY_TYPES.map((type) => (
              <option key={type} value={type}>
                {CONTENT_ENTITY_LABELS[type]}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label>
          內容類型
          <select aria-label="內容類型" disabled value={item.entityType}>
            <option value={item.entityType}>
              {CONTENT_ENTITY_LABELS[item.entityType]}
            </option>
          </select>
        </label>
      )}

      <ContentEditorScopeFields
        catalog={catalog}
        item={item}
        onChapterChange={onChapterChange}
        register={register}
        scope={scope}
        setValue={setValue}
        values={values}
      />
      <div className="content-editor__identity-grid">
        <label>
          穩定代碼
          <input aria-label="穩定代碼" disabled value={values.stableCode} />
          <input type="hidden" {...register('stableCode')} />
        </label>
        {item.entityType !== 'course' ? (
          <label>
            上層 ID
            <input aria-label="上層 ID" disabled value={values.parentId} />
            <input type="hidden" {...register('parentId')} />
          </label>
        ) : null}
      </div>
      {errors.stableCode ? (
        <p role="alert">請先完成必要的章節與父層選擇。</p>
      ) : null}

      {showHierarchyNumber ? (
        <label>
          {item.entityType === 'chapter'
            ? '章節編號'
            : item.entityType === 'section'
              ? '小節編號'
              : item.entityType === 'subtopic'
                ? '子主題編號'
                : '課程順序'}
          <input
            min="1"
            type="number"
            {...register('sortOrder', { valueAsNumber: true })}
          />
        </label>
      ) : (
        <input
          type="hidden"
          {...register('sortOrder', { valueAsNumber: true })}
        />
      )}

      {item.entityType !== 'question' ? (
        <label>
          標題
          <input {...register('title')} />
        </label>
      ) : null}
      {['course', 'chapter', 'section', 'subtopic', 'assessment_bank'].includes(
        item.entityType,
      ) ? (
        <label>
          說明（選填）
          <textarea rows={4} {...register('description')} />
        </label>
      ) : null}
      {item.entityType === 'review_card' ? (
        <>
          <label>
            群組標籤
            <input {...register('groupLabel')} />
            <span>
              學生端優先顯示此標籤；留白時顯示「標題」。目前學生主標題：
              {values.groupLabel || values.title || '（尚未輸入）'}
            </span>
          </label>
          <label>
            複習卡內容
            <textarea rows={10} {...register('content')} />
          </label>
          <ContentEditorMediaField
            altText={imageAlt}
            file={imageFile}
            isUploading={uploadImage.isPending}
            media={values.media}
            onAltTextChange={setImageAlt}
            onFileChange={(file) => {
              setImageFile(file);
              uploadRequest.current = null;
            }}
            onRemove={(index) => {
              setValue(
                'media',
                values.media
                  .filter((_, mediaIndex) => mediaIndex !== index)
                  .map((media, mediaIndex) => ({
                    ...media,
                    sort_order: mediaIndex,
                  })),
                { shouldDirty: true },
              );
            }}
            onRoleChange={setImageRole}
            onUpload={() => {
              uploadImage.mutate();
            }}
            role={imageRole}
          />
        </>
      ) : null}
      {item.entityType === 'question' ? (
        <ContentEditorQuestionFields register={register} />
      ) : null}

      <ContentEditorFeedback
        conflicted={conflicted}
        notice={notice}
        onReload={onReload}
        projection={
          preview.data?.outcome === 'ok' ? preview.data.projection : null
        }
      />
      <ContentEditorActions
        canDeleteDraft={draftIdentity.draftId !== null}
        isNew={isNew}
        isSaving={save.isPending}
        onDeleteDraft={() => {
          if (window.confirm('確定刪除此草稿？已發布版本不會被刪除。')) {
            deleteDraft.mutate();
          }
        }}
        onOpenLifecycle={onOpenLifecycle}
        onPreview={() => {
          preview.mutate();
        }}
        onValidate={() => {
          validate.mutate();
        }}
        showPreview={
          item.entityType === 'review_card' || item.entityType === 'question'
        }
      />
    </form>
  );
}
