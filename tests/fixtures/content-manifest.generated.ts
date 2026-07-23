// 由 scripts/content/import-questions.mjs 產生，請勿手動編輯。
// E2E 測試依此清單推導「哪些章節可玩、各有幾題」，內容變動時測試自動適應。
export type ChapterContent = Readonly<{
  chapterCode: string;
  chapterNumber: number;
  questionCount: number;
  templateId: string;
}>;

export const CONTENT_MANIFEST: readonly ChapterContent[] = [
  {
    chapterCode: 'chapter-1',
    chapterNumber: 1,
    questionCount: 0,
    templateId: '26000000-0000-0000-0000-000000000001',
  },
  {
    chapterCode: 'chapter-2',
    chapterNumber: 2,
    questionCount: 0,
    templateId: '26000000-0000-0000-0000-000000000002',
  },
  {
    chapterCode: 'chapter-3',
    chapterNumber: 3,
    questionCount: 37,
    templateId: '26000000-0000-0000-0000-000000000003',
  },
  {
    chapterCode: 'chapter-4',
    chapterNumber: 4,
    questionCount: 8,
    templateId: '26000000-0000-0000-0000-000000000004',
  },
  {
    chapterCode: 'chapter-5',
    chapterNumber: 5,
    questionCount: 0,
    templateId: '26000000-0000-0000-0000-000000000005',
  },
  {
    chapterCode: 'chapter-6',
    chapterNumber: 6,
    questionCount: 0,
    templateId: '26000000-0000-0000-0000-000000000006',
  },
];
