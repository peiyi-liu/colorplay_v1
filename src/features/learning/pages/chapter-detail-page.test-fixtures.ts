// Test-only fixtures for chapter-detail-page 相關測試。禁止被任何 production route 檔案 import。
import type { StudentChapterMapEntry } from '../api/chapter-map';
import type {
  ChapterReviewSection,
  LearningProgressRow,
  ReviewCardView,
  ReviewCompletionRow,
} from '../api/learning-repository';

// DEV/TEST-ONLY 長文，用來證明 06-v2 書頁能承載真實複習卡常見的多段內容；
// production 一律使用 repository 回傳的 Google Sheet／DB 內容。
const REVIEW_READER_LONG_CONTENT = [
  '一、色相（Hue）\n色相是色彩的名稱，也是辨認不同顏色最直接的線索。紅、橙、黃、綠、藍與紫都屬於不同色相；觀察色相時，先找出它在色相環上的位置，再比較彼此的鄰近或對比關係。',
  '色相環把連續變化的顏色整理成環狀秩序。相鄰色相通常產生柔和、連續的感受；距離較遠或位在相對位置的色相，則容易形成明顯對比。',
  '二、明度（Value）\n明度描述色彩的深淺與亮暗。加入白色通常提高明度，加入黑色通常降低明度；即使色相相同，明度改變也會影響文字辨識、空間層次與視覺焦點。',
  '檢查明度時，可以暫時忽略色相，只比較各區域的亮暗差。重要資訊需要足夠的明度差，不能只依賴色彩名稱或個人對顏色的偏好。',
  '三、彩度（Saturation）\n彩度表示色彩的鮮豔或灰濁程度。高彩度顏色醒目而有張力，低彩度顏色沉穩而柔和；在同一畫面中安排不同彩度，可以建立主次並控制注意力。',
  '降低彩度不等於降低明度。灰濁的淺色與灰濁的深色都可能存在，因此判讀時要分開比較色相、明度和彩度，避免把三個屬性混為一談。',
  '四、三要素的關係\n任何一個具體顏色，都可以同時用色相、明度和彩度描述。只改變其中一項，觀看感受就可能不同；設計配色時，應先決定主要色相，再用明度確保資訊清楚，最後以彩度控制氣氛與焦點。',
  '暖色系常讓人聯想到陽光、火焰與活力，冷色系常讓人聯想到天空、水與寧靜。不過冷暖感受仍會受到明度、彩度、面積與周圍色彩影響，不能只看單一色票判斷。',
  '五、觀察練習\n找一張熟悉的海報，依序記錄主要色相、最亮與最暗的位置，以及彩度最高的焦點。再思考：如果降低焦點彩度，或縮小明度差，閱讀順序會發生什麼改變？',
  '重點整理\n色相回答「是什麼顏色」，明度回答「有多亮或多暗」，彩度回答「有多鮮豔或灰濁」。三者互相影響，共同構成我們實際看到的色彩樣貌。',
].join('\n\n');

const chapterEntryCard = (
  cardId: string,
  groupLabel: string,
  sortOrder: number,
): ReviewCardView => ({
  cardId,
  content:
    groupLabel === '色彩三要素'
      ? REVIEW_READER_LONG_CONTENT
      : `${groupLabel}的複習內容`,
  groupLabel,
  media:
    groupLabel === '色彩三要素'
      ? [
          {
            altText: '十二色相環示意圖',
            assetPath: '/media/review/color-wheel.svg',
          },
        ]
      : [],
  requiresRecompletion: false,
  sortOrder,
  title: groupLabel,
  version: 1,
});

export const chapterEntrySectionsFixture =
  (): readonly ChapterReviewSection[] => [
    {
      sectionId: 'cd732278-0bfe-1293-19e1-338db3fe6a3c',
      quizTemplateId: '26000000-0000-0000-0000-000000003101',
      sortOrder: 1,
      stableCode: 'sheet-3-1',
      subtopics: [
        {
          cards: [
            chapterEntryCard(
              '25500000-0000-0000-0000-000000000001',
              '色彩的分類',
              1,
            ),
            chapterEntryCard(
              '25500000-0000-0000-0000-000000000002',
              '色彩三要素',
              2,
            ),
            chapterEntryCard(
              '25500000-0000-0000-0000-000000000003',
              '色名的表示',
              3,
            ),
            chapterEntryCard(
              '25500000-0000-0000-0000-000000000004',
              '有彩色與無彩色',
              4,
            ),
            chapterEntryCard(
              '25500000-0000-0000-0000-000000000005',
              '色相的辨識',
              5,
            ),
            chapterEntryCard(
              '25500000-0000-0000-0000-000000000006',
              '明度的變化',
              6,
            ),
            chapterEntryCard(
              '25500000-0000-0000-0000-000000000007',
              '彩度的變化',
              7,
            ),
            chapterEntryCard(
              '25500000-0000-0000-0000-000000000008',
              '色彩三要素的關係',
              8,
            ),
            chapterEntryCard(
              '25500000-0000-0000-0000-000000000009',
              '系統色名',
              9,
            ),
            chapterEntryCard(
              '25500000-0000-0000-0000-000000000010',
              '慣用色名',
              10,
            ),
          ],
          sortOrder: 1,
          stableCode: 'sheet-3-1-all',
          subtopicId: 'f929cde5-c294-46ce-5faf-c866b3cb9583',
          title: '3-1 色彩三要素與色名的表示',
        },
      ],
      title: '3-1 色彩三要素與色名的表示',
    },
    {
      sectionId: 'cd9d5a87-3540-50ef-e85b-052ea5aac03c',
      quizTemplateId: '26000000-0000-0000-0000-000000003201',
      sortOrder: 2,
      stableCode: 'sheet-3-2',
      subtopics: [
        {
          cards: [
            chapterEntryCard(
              '25500000-0000-0000-0000-000000000011',
              '色彩體系的基本結構',
              1,
            ),
            chapterEntryCard(
              '25500000-0000-0000-0000-000000000012',
              '色彩體系的分類',
              2,
            ),
            chapterEntryCard(
              '25500000-0000-0000-0000-000000000013',
              '常用的色彩體系',
              3,
            ),
            chapterEntryCard(
              '25500000-0000-0000-0000-000000000014',
              '色彩體系的座標',
              4,
            ),
            chapterEntryCard(
              '25500000-0000-0000-0000-000000000015',
              '色彩體系的應用',
              5,
            ),
          ],
          sortOrder: 1,
          stableCode: 'sheet-3-2-all',
          subtopicId: '036f87e5-edc3-6500-604b-76fef106db70',
          title: '3-2 色彩體系',
        },
      ],
      title: '3-2 色彩體系',
    },
  ];

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
  reviewTotal: 15,
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
    quizTemplateId: '26000000-0000-0000-0000-000000003101',
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
