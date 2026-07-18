// 由 scripts/content/import-review-cards.mjs 產生，請勿手動編輯。
// E2E 測試依此清單推導複習卡數量與標題，內容變動時測試自動適應。
export type ReviewSubtopicContent = Readonly<{
  chapterCode: string;
  sectionKey: string;
  subtopicId: string;
  cardCount: number;
  cardTitles: readonly string[];
}>;

export const REVIEW_MANIFEST: readonly ReviewSubtopicContent[] = [
  {
    chapterCode: 'chapter-3',
    sectionKey: '3-1',
    subtopicId: 'f929cde5-c294-46ce-5faf-c866b3cb9583',
    cardCount: 3,
    cardTitles: ['有彩色與無彩色', '甚麼是HVC', '三種色名類型'],
  },
];

export const REVIEW_DRAFT_CARD_ID = '0253e291-1308-1dce-26c7-16750cd3e967';

export const REVIEW_MEDIA_CARD: Readonly<{
  alt: string;
  title: string;
}> | null = { alt: '十二色相環示意圖', title: '有彩色與無彩色' };
