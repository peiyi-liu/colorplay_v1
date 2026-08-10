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
    cardCount: 9,
    cardTitles: [
      '色彩的分類',
      '色彩三要素',
      '色彩三要素',
      '色彩三要素',
      '色彩三要素',
      '色名的表示',
      '色名的表示',
      '色名的表示',
      '色名的表示',
    ],
  },
  {
    chapterCode: 'chapter-3',
    sectionKey: '3-2',
    subtopicId: '036f87e5-edc3-6500-604b-76fef106db70',
    cardCount: 10,
    cardTitles: [
      '色彩體系的基本結構',
      '色彩體系的基本結構',
      '色彩體系的基本結構',
      '色彩體系的基本結構',
      '色彩體系的分類',
      '常用的色彩體系',
      '常用的色彩體系',
      '常用的色彩體系',
      '常用的色彩體系',
      '常用的色彩體系',
    ],
  },
  {
    chapterCode: 'chapter-3',
    sectionKey: '3-3',
    subtopicId: '776c7d9d-fa82-bd21-24e0-15f0b14aaa31',
    cardCount: 7,
    cardTitles: [
      '色光表示法',
      '色光表示法',
      '色票表示法',
      '色票表示法',
      '色票表示法',
      '色票表示法',
      '色票表示法',
    ],
  },
];

export const REVIEW_DRAFT_CARD_ID = '0253e291-1308-1dce-26c7-16750cd3e967';

export const REVIEW_MEDIA_CARD: Readonly<{
  alt: string;
  title: string;
}> | null = null;
