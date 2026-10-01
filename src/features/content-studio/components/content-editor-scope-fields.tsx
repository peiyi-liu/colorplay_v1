import type { UseFormRegister, UseFormSetValue } from 'react-hook-form';
import type { ContentCatalog, ContentScope } from '../api/contracts';
import type { ContentStudioItem } from '../lib/content-studio-model';
import type { EditorValues } from './content-editor-form-model';

export function ContentEditorScopeFields({
  catalog,
  item,
  onChapterChange,
  register,
  scope,
  setValue,
  values,
}: Readonly<{
  catalog: ContentCatalog;
  item: ContentStudioItem;
  onChapterChange: (chapterId: string) => void;
  register: UseFormRegister<EditorValues>;
  scope: ContentScope;
  setValue: UseFormSetValue<EditorValues>;
  values: EditorValues;
}>) {
  const sections = scope.sections.filter(
    (section) => section.status !== 'archived',
  );
  const subtopics =
    sections
      .find((section) => section.sectionId === values.sectionId)
      ?.subtopics.filter((subtopic) => subtopic.status !== 'archived') ?? [];
  const banks =
    values.kind === 'CR'
      ? scope.chapterBanks
      : (sections.find((section) => section.sectionId === values.sectionId)
          ?.banks ?? []);
  const eligibleBanks = banks.filter(
    (bank) => bank.kind === values.kind && bank.status !== 'archived',
  );
  return (
    <div className="content-editor__scope-grid">
      {item.entityType === 'chapter' ? (
        catalog.courses.length === 1 ? (
          <p>課程：{catalog.courses[0]?.title}（本平台目前只有一門課程）</p>
        ) : (
          <label>
            所屬課程
            <select aria-label="所屬課程" {...register('parentId')}>
              {catalog.courses
                .filter((course) => course.status !== 'archived')
                .map((course) => (
                  <option key={course.courseId} value={course.courseId}>
                    {course.title}
                  </option>
                ))}
            </select>
          </label>
        )
      ) : null}
      {!['course', 'chapter'].includes(item.entityType) ? (
        <label>
          章節
          <select
            aria-label="章節"
            disabled={item.entityId !== null}
            value={values.chapterId}
            onChange={(event) => {
              setValue('chapterId', event.target.value, { shouldDirty: true });
              setValue('sectionId', '', { shouldDirty: true });
              setValue('subtopicId', '', { shouldDirty: true });
              setValue('bankId', '', { shouldDirty: true });
              onChapterChange(event.target.value);
            }}
          >
            {catalog.chapters
              .filter((chapter) => chapter.status !== 'archived')
              .map((chapter) => (
                <option key={chapter.chapterId} value={chapter.chapterId}>
                  第 {chapter.sortOrder} 章・{chapter.title}
                </option>
              ))}
          </select>
        </label>
      ) : null}
      {(['subtopic', 'review_card', 'assessment_bank', 'question'].includes(
        item.entityType,
      ) &&
        values.kind !== 'CR') ||
      item.entityType === 'subtopic' ||
      item.entityType === 'review_card' ? (
        <label>
          小節
          <select
            aria-label="小節"
            disabled={item.entityId !== null}
            value={values.sectionId}
            onChange={(event) => {
              setValue('sectionId', event.target.value, { shouldDirty: true });
              setValue('subtopicId', '', { shouldDirty: true });
              setValue('bankId', '', { shouldDirty: true });
            }}
          >
            <option value="">請選擇小節</option>
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
          <select
            aria-label="子主題"
            disabled={item.entityId !== null}
            {...register('subtopicId')}
          >
            <option value="">請選擇子主題</option>
            {subtopics.map((subtopic) => (
              <option key={subtopic.subtopicId} value={subtopic.subtopicId}>
                {subtopic.title}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {['assessment_bank', 'question'].includes(item.entityType) ? (
        <label>
          題庫類型
          <select
            aria-label="題庫類型"
            disabled={item.entityId !== null}
            value={values.kind}
            onChange={(event) => {
              setValue('kind', event.target.value as EditorValues['kind'], {
                shouldDirty: true,
              });
              setValue('bankId', '', { shouldDirty: true });
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
          所屬題目集合
          <select
            aria-label="題庫"
            disabled={item.entityId !== null}
            {...register('bankId')}
          >
            <option value="">請選擇題目集合</option>
            {eligibleBanks.map((bank) => (
              <option key={bank.bankId} value={bank.bankId}>
                {bank.title}
              </option>
            ))}
          </select>
          {eligibleBanks.length === 0 ? (
            <span>此範圍尚無題目集合；請先建立並發布題目集合。</span>
          ) : null}
        </label>
      ) : null}
      {item.entityId ? (
        <p className="content-workflow__hint">
          已發布內容的歸屬不可直接搬移；如需搬移，請在新位置新增內容，再封存舊內容。
        </p>
      ) : (
        <p className="content-workflow__hint">
          可自由選擇新增位置，不受清單篩選限制。新增父層請先發布，再建立其下的內容。
        </p>
      )}
    </div>
  );
}
