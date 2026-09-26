import type { ContentEntityType, ContentScope } from '../api/contracts';

export type ContentStudioStatus = 'draft' | 'published' | 'archived';

export type ContentStudioItem = Readonly<{
  bankKind: 'QB' | 'CR' | 'LT' | null;
  chapterId: string | null;
  draftId: string | null;
  entityId: string | null;
  entityType: ContentEntityType;
  parentId: string | null;
  parentType: ContentEntityType | null;
  sectionId: string | null;
  stableCode: string;
  status: ContentStudioStatus;
  subtopicId: string | null;
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
    bankKind: null,
    chapterId: scope.chapter.chapterId,
    entityId: scope.chapter.chapterId,
    entityType: 'chapter',
    parentId: null,
    parentType: 'course',
    sectionId: null,
    stableCode: scope.chapter.stableCode,
    status: scope.chapter.status,
    subtopicId: null,
    title: scope.chapter.title,
    version: null,
  });

  const addBank = (
    bank: ContentScope['chapterBanks'][number],
    parentId: string,
    parentType: 'chapter' | 'section',
  ) => {
    add({
      bankKind: bank.kind,
      chapterId: scope.chapter.chapterId,
      entityId: bank.bankId,
      entityType: 'assessment_bank',
      parentId,
      parentType,
      sectionId: parentType === 'section' ? parentId : null,
      stableCode: bank.stableCode,
      status: bank.status,
      subtopicId: null,
      title: bank.title,
      version: null,
    });
    bank.questions.forEach((question) => {
      add({
        bankKind: bank.kind,
        chapterId: scope.chapter.chapterId,
        entityId: question.entityId,
        entityType: 'question',
        parentId: bank.bankId,
        parentType: 'assessment_bank',
        sectionId: parentType === 'section' ? parentId : null,
        stableCode: question.stableCode,
        status: question.status,
        subtopicId: null,
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
      bankKind: null,
      chapterId: scope.chapter.chapterId,
      entityId: section.sectionId,
      entityType: 'section',
      parentId: scope.chapter.chapterId,
      parentType: 'chapter',
      sectionId: section.sectionId,
      stableCode: section.stableCode,
      status: section.status,
      subtopicId: null,
      title: section.title,
      version: null,
    });
    section.banks.forEach((bank) => {
      addBank(bank, section.sectionId, 'section');
    });
    section.subtopics.forEach((subtopic) => {
      add({
        bankKind: null,
        chapterId: scope.chapter.chapterId,
        entityId: subtopic.subtopicId,
        entityType: 'subtopic',
        parentId: section.sectionId,
        parentType: 'section',
        sectionId: section.sectionId,
        stableCode: subtopic.stableCode,
        status: subtopic.status,
        subtopicId: subtopic.subtopicId,
        title: subtopic.title,
        version: null,
      });
      subtopic.reviewCards.forEach((card) => {
        add({
          bankKind: null,
          chapterId: scope.chapter.chapterId,
          entityId: card.entityId,
          entityType: 'review_card',
          parentId: subtopic.subtopicId,
          parentType: 'subtopic',
          sectionId: section.sectionId,
          stableCode: card.stableCode,
          status: card.status,
          subtopicId: subtopic.subtopicId,
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
        bankKind: null,
        chapterId: scope.chapter.chapterId,
        draftId: draft.draftId,
        entityId: draft.entityId,
        entityType: draft.entityType,
        parentId: null,
        parentType: null,
        sectionId: null,
        stableCode: draft.stableCode,
        status: 'draft',
        subtopicId: null,
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
    bankKind: selected?.bankKind ?? null,
    chapterId: selected?.chapterId ?? null,
    draftId: null,
    entityId: null,
    entityType,
    parentId: selected?.entityId ?? null,
    parentType: selected?.entityType ?? null,
    sectionId: selected?.sectionId ?? null,
    stableCode: '',
    status: 'draft',
    subtopicId: selected?.subtopicId ?? null,
    title: `新增${CONTENT_ENTITY_LABELS[entityType]}`,
    version: null,
  };
}
