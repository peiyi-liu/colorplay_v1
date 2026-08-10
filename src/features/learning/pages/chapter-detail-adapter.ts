import type { StudentChapterMapEntry } from '../api/chapter-map';
import type {
  ChapterReviewSection,
  LearningError,
  LearningProgressRow,
  ReviewCompletionRow,
} from '../api/learning-repository';
import type {
  ChapterDetailChapterView,
  ChapterDetailRetryTarget,
  ChapterDetailViewModel,
  MasteryDisplay,
  MasteryVersionScore,
} from './chapter-detail-view-model';

export function deriveMasteryDisplay(
  input:
    | Readonly<{
        source: 'legacy';
        masteryPercent: number | null;
        rulesVersion: string | null;
      }>
    | Readonly<{
        source: 'explicit-no-attempt-this-version';
        currentContentVersion: string;
      }>
    | Readonly<{
        source: 'versioned';
        highest: MasteryVersionScore;
        current: MasteryVersionScore | Readonly<{ contentVersion: string }>;
      }>,
): MasteryDisplay {
  if (input.source === 'legacy') {
    if (input.masteryPercent === null || input.rulesVersion === null) {
      return { kind: 'unavailable-until-backend-contract' };
    }
    return {
      kind: 'legacy-recorded',
      masteryPercent: input.masteryPercent,
      rulesVersion: input.rulesVersion,
    };
  }
  if (input.source === 'explicit-no-attempt-this-version') {
    return {
      kind: 'not-attempted-current-version',
      currentContentVersion: input.currentContentVersion,
    };
  }
  const { current, highest } = input;
  if (!('masteryPercent' in current)) {
    return {
      current: {
        contentVersion: current.contentVersion,
        kind: 'not-attempted',
      },
      highest,
      kind: 'versioned',
      merged: false,
    };
  }
  const merged =
    highest.contentVersion === current.contentVersion &&
    highest.masteryPercent === current.masteryPercent;
  return { current, highest, kind: 'versioned', merged };
}

export const isCardCompleted = (
  card: Readonly<{
    cardId: string;
    requiresRecompletion: boolean;
    version: number;
  }>,
  completions: readonly ReviewCompletionRow[],
): boolean =>
  completions.some(
    (row) =>
      row.reviewCardId === card.cardId &&
      (row.cardVersion === card.version || !card.requiresRecompletion),
  );

const NON_RETRYABLE_ERROR_CODES = new Set<string>(['INVALID_RESPONSE']);

export function deriveChapterDetailViewModel(
  input: Readonly<{
    chapterMapEntry: StudentChapterMapEntry | undefined;
    chapterMapIsPending: boolean;
    chapterMapIsError: boolean;
    reviewSections: readonly ChapterReviewSection[] | undefined;
    reviewIsPending: boolean;
    reviewError: LearningError | null;
    progressRows: readonly LearningProgressRow[] | undefined;
    progressIsPending: boolean;
    progressIsError: boolean;
    completions: readonly ReviewCompletionRow[] | undefined;
    completionsIsPending: boolean;
    completionsIsError: boolean;
  }>,
): ChapterDetailViewModel {
  if (input.chapterMapIsPending) return { state: 'loading' };
  if (input.chapterMapIsError) {
    return {
      errorCode: 'UNAVAILABLE',
      retryTarget: 'chapter-map',
      retryable: true,
      state: 'error',
    };
  }
  if (!input.chapterMapEntry) {
    return {
      errorCode: 'CHAPTER_NOT_FOUND',
      retryTarget: null,
      retryable: false,
      state: 'error',
    };
  }

  const entry = input.chapterMapEntry;
  if (entry.accessState === 'locked') {
    return {
      chapterTitle: entry.title,
      state: 'locked',
      unmetConditions: entry.blockers,
    };
  }
  if (entry.accessState === 'content_unavailable') {
    return { chapterTitle: entry.title, state: 'content-preparing' };
  }

  // 過期快取：map 仍回報 available，但 guarded review 讀取已經偵測到鎖定——
  // 頁內渲染 locked（沿用目前已知的 blockers，通常為空；頁面 shell 會觸發
  // 一次 chapterMap.refetch() 取得真正的 unmet conditions，見 Task 2）。
  if (input.reviewError?.code === 'CHAPTER_LOCKED') {
    return {
      chapterTitle: entry.title,
      state: 'locked',
      unmetConditions: entry.blockers,
    };
  }

  if (
    input.reviewIsPending ||
    input.progressIsPending ||
    input.completionsIsPending
  ) {
    return { state: 'loading' };
  }

  if (input.reviewError) {
    const retryable = !NON_RETRYABLE_ERROR_CODES.has(input.reviewError.code);
    const retryTarget: ChapterDetailRetryTarget | null = retryable
      ? 'chapter-content'
      : null;
    return {
      errorCode: input.reviewError.code,
      retryTarget,
      retryable,
      state: 'error',
    };
  }
  if (input.progressIsError || input.completionsIsError) {
    return {
      errorCode: 'UNAVAILABLE',
      retryTarget: 'chapter-content',
      retryable: true,
      state: 'error',
    };
  }

  const sections = input.reviewSections ?? [];
  const hasCards = sections.some((section) =>
    section.subtopics.some((subtopic) => subtopic.cards.length > 0),
  );
  if (!hasCards) {
    return {
      chapterTitle: entry.title,
      reason: '章節已發布但沒有可用的複習卡或題目，內容管線可能未完整匯入。',
      state: 'content-readiness-error',
    };
  }

  const progressRows = input.progressRows ?? [];
  const completions = input.completions ?? [];
  const chapterRow = progressRows.find((row) => row.scope === 'chapter');

  const chapter: ChapterDetailChapterView = {
    chapterId: entry.chapterId,
    masteryDisplay: deriveMasteryDisplay({
      masteryPercent: chapterRow?.mastery ?? null,
      rulesVersion: chapterRow?.rulesVersion ?? null,
      source: 'legacy',
    }),
    reviewCompleted: entry.reviewCompleted,
    reviewTotal: entry.reviewTotal,
    sections: sections.map((section) => ({
      sectionId: section.sectionId,
      subtopics: section.subtopics.map((subtopic) => {
        const row = progressRows.find(
          (candidate) =>
            candidate.scope === 'subtopic' &&
            candidate.subtopicId === subtopic.subtopicId,
        );
        return {
          cards: subtopic.cards.map((card) => ({
            cardId: card.cardId,
            completed: isCardCompleted(card, completions),
            content: card.content,
            groupLabel: card.groupLabel,
            media: card.media,
            title: card.title,
          })),
          mastery: row?.mastery ?? null,
          reviewCompleted: row?.reviewCompleted ?? 0,
          reviewTotal: row?.reviewTotal ?? null,
          subtopicId: subtopic.subtopicId,
          title: subtopic.title,
        };
      }),
      title: section.title,
    })),
    sortOrder: entry.sortOrder,
    status: chapterRow?.status ?? 'not_started',
    templateId: entry.templateId,
    title: entry.title,
  };

  return {
    chapter,
    state: entry.accessState === 'completed' ? 'completed' : 'in-progress',
  };
}
