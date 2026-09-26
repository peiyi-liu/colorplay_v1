import type { ContentEntityType, ContentScope } from '../api/contracts';

export type ContentStudioStatus = 'draft' | 'published' | 'archived';

export type ContentStudioItem = Readonly<{
  draftId: string | null;
  entityId: string | null;
  entityType: ContentEntityType;
  parentId: string | null;
  parentType: ContentEntityType | null;
  stableCode: string;
  status: ContentStudioStatus;
  title: string;
  version: number | null;
}>;

export const CONTENT_ENTITY_LABELS: Record<ContentEntityType, string> = {
  assessment_bank: '測驗題庫',
  chapter: '章節',
  course: '課程',
  question: '測驗題目',
  review_card: '複習卡',
  section: '小節',
  subtopic: '子主題',
};

export function flattenContentScope(scope: ContentScope): ContentStudioItem[] {
  const draftsByEntity = new Map(
    scope.drafts
      .filter((draft) => draft.entityId !== null)
      .map((draft) => [draft.entityId, draft]),
  );
  const items: ContentStudioItem[] = [];
  const add = (
    item: Omit<ContentStudioItem, 'draftId'> & { draftId?: string | null },
  ) => {
    items.push({
      ...item,
      draftId:
        item.draftId ??
        (item.entityId ? draftsByEntity.get(item.entityId)?.draftId : null) ??
        null,
    });
  };

  add({
    entityId: scope.chapter.chapterId,
    entityType: 'chapter',
    parentId: null,
    parentType: 'course',
    stableCode: scope.chapter.stableCode,
    status: scope.chapter.status,
    title: scope.chapter.title,
    version: null,
  });

  const addBank = (
    bank: ContentScope['chapterBanks'][number],
    parentId: string,
    parentType: 'chapter' | 'section',
  ) => {
    add({
      entityId: bank.bankId,
      entityType: 'assessment_bank',
      parentId,
      parentType,
      stableCode: bank.stableCode,
      status: bank.status,
      title: bank.title,
      version: null,
    });
    bank.questions.forEach((question) => {
      add({
        entityId: question.entityId,
        entityType: 'question',
        parentId: bank.bankId,
        parentType: 'assessment_bank',
        stableCode: question.stableCode,
        status: question.status,
        title: question.title,
        version: question.version,
      });
    });
  };

  scope.chapterBanks.forEach((bank) => {
    addBank(bank, scope.chapter.chapterId, 'chapter');
  });
  scope.sections.forEach((section) => {
    add({
      entityId: section.sectionId,
      entityType: 'section',
      parentId: scope.chapter.chapterId,
      parentType: 'chapter',
      stableCode: section.stableCode,
      status: section.status,
      title: section.title,
      version: null,
    });
    section.banks.forEach((bank) => {
      addBank(bank, section.sectionId, 'section');
    });
    section.subtopics.forEach((subtopic) => {
      add({
        entityId: subtopic.subtopicId,
        entityType: 'subtopic',
        parentId: section.sectionId,
        parentType: 'section',
        stableCode: subtopic.stableCode,
        status: subtopic.status,
        title: subtopic.title,
        version: null,
      });
      subtopic.reviewCards.forEach((card) => {
        add({
          entityId: card.entityId,
          entityType: 'review_card',
          parentId: subtopic.subtopicId,
          parentType: 'subtopic',
          stableCode: card.stableCode,
          status: card.status,
          title: card.title,
          version: card.version,
        });
      });
    });
  });

  scope.drafts
    .filter(
      (draft) =>
        draft.entityId === null ||
        !items.some((item) => item.entityId === draft.entityId),
    )
    .forEach((draft) => {
      add({
        draftId: draft.draftId,
        entityId: draft.entityId,
        entityType: draft.entityType,
        parentId: null,
        parentType: null,
        stableCode: draft.stableCode,
        status: 'draft',
        title: '未發布草稿',
        version: null,
      });
    });

  return items;
}

export function createNewContentItem(
  entityType: ContentEntityType,
  selected: ContentStudioItem | null,
): ContentStudioItem {
  return {
    draftId: null,
    entityId: null,
    entityType,
    parentId: selected?.entityId ?? null,
    parentType: selected?.entityType ?? null,
    stableCode: '',
    status: 'draft',
    title: `新增${CONTENT_ENTITY_LABELS[entityType]}`,
    version: null,
  };
}
