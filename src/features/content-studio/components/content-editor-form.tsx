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
  payloadFromValues,
  valuesFromState,
} from './content-editor-form-model';
import { ContentEditorMediaField } from './content-editor-media-field';
import {
  ContentEditorActions,
  ContentEditorFeedback,
  ContentEditorQuestionFields,
} from './content-editor-support';

export function ContentEditorForm({
  allItems,
  item,
  mediaRepository = createContentMediaRepository(),
  onCancel,
  onCreated,
  onDirtyChange,
  onNewTypeChange,
  onReload,
  repository,
  scope,
  state,
}: Readonly<{
  allItems: readonly ContentStudioItem[];
  item: ContentStudioItem;
  mediaRepository?: ContentMediaRepository | undefined;
  onCancel: () => void;
  onCreated: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onNewTypeChange: (entityType: ContentEntityType) => void;
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
  const initialValues = useMemo(
    () => valuesFromState(item, state, scope),
    [item, scope, state],
  );
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
  const sections = scope.sections;
  const subtopics =
    sections.find((section) => section.sectionId === values.sectionId)
      ?.subtopics ?? [];
  const allBanks = [
    ...scope.chapterBanks,
    ...sections.flatMap((section) => section.banks),
  ];
  const eligibleBanks = allBanks.filter(
    (bank) =>
      bank.kind === values.kind &&
      (bank.kind === 'CR' ||
        sections.some(
          (section) =>
            section.sectionId === values.sectionId &&
            section.banks.some((entry) => entry.bankId === bank.bankId),
        )),
  );

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
        void handleSubmit((formValues) => {
          save.mutate(formValues);
        })(event);
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
          <span>{CONTENT_ENTITY_LABELS[item.entityType]}</span>
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
      ) : null}

      <div className="content-editor__scope-grid">
        {item.entityType !== 'course' ? (
          <label>
            章節
            <select aria-label="章節" value={scope.chapter.chapterId} disabled>
              <option value={scope.chapter.chapterId}>
                第 {scope.chapter.sortOrder} 章・{scope.chapter.title}
              </option>
            </select>
          </label>
        ) : null}
        {['subtopic', 'review_card', 'assessment_bank', 'question'].includes(
          item.entityType,
        ) &&
        !(item.entityType === 'assessment_bank' && values.kind === 'CR') ? (
          <label>
            小節
            <select
              aria-label="小節"
              value={values.sectionId}
              onChange={(event) => {
                const sectionId = event.target.value;
                const section = sections.find(
                  (entry) => entry.sectionId === sectionId,
                );
                setValue('sectionId', sectionId, { shouldDirty: true });
                setValue(
                  'subtopicId',
                  section?.subtopics.at(0)?.subtopicId ?? '',
                  {
                    shouldDirty: true,
                  },
                );
                const bank = section?.banks.find(
                  (entry) => entry.kind === values.kind,
                );
                if (bank)
                  setValue('bankId', bank.bankId, { shouldDirty: true });
              }}
            >
              {sections.map((section) => (
                <option key={section.sectionId} value={section.sectionId}>
                  {section.title}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {item.entityType === 'review_card' ? (
          <label>
            子主題
            <select aria-label="子主題" {...register('subtopicId')}>
              {subtopics.map((subtopic) => (
                <option key={subtopic.subtopicId} value={subtopic.subtopicId}>
                  {subtopic.title}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {item.entityType === 'assessment_bank' ||
        item.entityType === 'question' ? (
          <label>
            題庫類型
            <select
              {...register('kind')}
              onChange={(event) => {
                const kind = event.target.value as 'QB' | 'CR' | 'LT';
                setValue('kind', kind, { shouldDirty: true });
                const nextBank = allBanks.find(
                  (bank) =>
                    bank.kind === kind &&
                    (kind === 'CR' ||
                      sections
                        .find(
                          (section) => section.sectionId === values.sectionId,
                        )
                        ?.banks.some((entry) => entry.bankId === bank.bankId)),
                );
                if (nextBank)
                  setValue('bankId', nextBank.bankId, { shouldDirty: true });
              }}
            >
              <option value="QB">QB 小節題庫</option>
              <option value="LT">LT Live 題庫</option>
              <option value="CR">CR 章節總題庫</option>
            </select>
          </label>
        ) : null}
        {item.entityType === 'question' ? (
          <label>
            題庫
            <select aria-label="題庫" {...register('bankId')}>
              {eligibleBanks.map((bank) => (
                <option key={bank.bankId} value={bank.bankId}>
                  {bank.title}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

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
        isNew={isNew}
        isSaving={save.isPending}
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
