// Test-only fixtures for chapter-detail-page 相關測試。禁止被任何 production route 檔案 import。
import type { StudentChapterMapEntry } from '../api/chapter-map';
import type {
  ChapterReviewSection,
  LearningProgressRow,
  ReviewCompletionRow,
} from '../api/learning-repository';

export const chapterMapEntryFixture = (
  overrides: Partial<StudentChapterMapEntry> = {},
): StudentChapterMapEntry => ({
  accessState: 'available',
  blockers: [],
  chapterId: '21000000-0000-0000-0000-000000000003',
  description: '色彩體系與應用',
  mastery: 59.5,
  progressStatus: 'learning',
  reviewCompleted: 1,
  reviewTotal: 3,
  sortOrder: 3,
  stableCode: 'chapter-3',
  templateId: '26000000-0000-0000-0000-000000000003',
  templateQuestionCount: 10,
  title: '色彩體系與應用',
  ...overrides,
});

export const chapterReviewSectionsFixture = (
  overrides: Partial<ChapterReviewSection>[] = [],
): readonly ChapterReviewSection[] => {
  const base: ChapterReviewSection = {
    sectionId: 'cd732278-0bfe-1293-19e1-338db3fe6a3c',
    sortOrder: 1,
    stableCode: 'sheet-3-1',
    subtopics: [
      {
        cards: [
          {
            cardId: '25500000-0000-0000-0000-000000000001',
            content: '第一行\n\n第二行',
            groupLabel: '色彩的分類',
            media: [],
            requiresRecompletion: false,
            sortOrder: 1,
            title: '有彩色與無彩色',
            version: 1,
          },
        ],
        sortOrder: 1,
        stableCode: 'sheet-3-1-all',
        subtopicId: 'f929cde5-c294-46ce-5faf-c866b3cb9583',
        title: '3-1 色彩三要素與色名的表示',
      },
    ],
    title: '3-1 色彩三要素與色名的表示',
  };
  return overrides.length > 0
    ? overrides.map((partial) => ({ ...base, ...partial }))
    : [base];
};

export const learningProgressRowsFixture = (
  overrides: Partial<LearningProgressRow>[] = [],
): readonly LearningProgressRow[] => {
  const chapterRow: LearningProgressRow = {
    accuracy: 95.7,
    chapterId: '21000000-0000-0000-0000-000000000003',
    coverage: 62.2,
    mastery: 59.5,
    reviewCompleted: 1,
    reviewTotal: 3,
    rulesVersion: '2026-07-progress-1',
    scope: 'chapter',
    status: 'learning',
    subtopicId: null,
  };
  const subtopicRow: LearningProgressRow = {
    accuracy: 66.7,
    chapterId: '21000000-0000-0000-0000-000000000003',
    coverage: 23.1,
    mastery: 15.4,
    reviewCompleted: 1,
    reviewTotal: 3,
    rulesVersion: '2026-07-progress-1',
    scope: 'subtopic',
    status: 'learning',
    subtopicId: 'f929cde5-c294-46ce-5faf-c866b3cb9583',
  };
  const base = [chapterRow, subtopicRow];
  const pairAt = (index: number): LearningProgressRow => {
    const row = base[index % 2];
    if (!row)
      throw new Error('learningProgressRowsFixture: index out of range');
    return row;
  };
  return overrides.length > 0
    ? overrides.map((partial, index) => ({ ...pairAt(index), ...partial }))
    : base;
};

export const reviewCompletionsFixture = (): readonly ReviewCompletionRow[] => [
  { cardVersion: 1, reviewCardId: '25500000-0000-0000-0000-000000000001' },
];
