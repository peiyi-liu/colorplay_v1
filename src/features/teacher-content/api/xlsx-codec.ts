import * as XLSX from 'xlsx';

import {
  validateQuestionRow,
  validateReviewCardRow,
} from '../../../../scripts/content/validation-rules.mjs';

/**
 * XLSX 匯入範本與解析（spec/06 §6：三工作表 章節／複習卡／題庫）。
 * 解析只做結構與規則驗證，產生預覽列與逐列錯誤；一切寫入由信任指令
 * 在伺服器端重新驗證後才發生。
 */

export const TEMPLATE_SHEETS = Object.freeze({
  chapters: '章節',
  questions: '題庫',
  reviewCards: '複習卡',
});

const CHAPTER_HEADERS = ['章節編號', '章節名稱', '章節描述', '顯示順序'];
const REVIEW_HEADERS = [
  '章節編號',
  '小節',
  '子主題',
  '卡片標題',
  '卡片內容',
  '圖片網址（選填）',
  '替代文字（圖片時必填）',
];
const QUESTION_HEADERS = [
  '章節編號',
  '小節',
  '子主題',
  '題號',
  '題型',
  '題目',
  '選項A',
  '選項B',
  '選項C',
  '選項D',
  '正解',
  '解析',
];

export const ROW_LIMIT = 500;

export type ImportRowError = Readonly<{
  code: string;
  field: string;
  message: string;
  row: number;
  sheet: string;
}>;

export type ImportQuestionRow = Readonly<{
  answerKey: string;
  chapter: string;
  code: string;
  explanation: string;
  options: readonly Readonly<{ key: string; text: string }>[];
  prompt: string;
  row: number;
  sectionLabel: string;
  subtopicLabel: string;
}>;

export type ImportReviewCardRow = Readonly<{
  altText: string;
  chapter: string;
  content: string;
  mediaUrl: string;
  row: number;
  sectionLabel: string;
  subtopicLabel: string;
  title: string;
}>;

export type ImportChapterRow = Readonly<{
  chapter: string;
  description: string;
  row: number;
  sortOrder: string;
  title: string;
}>;

export type ParsedWorkbook = Readonly<{
  chapters: readonly ImportChapterRow[];
  errors: readonly ImportRowError[];
  questions: readonly ImportQuestionRow[];
  reviewCards: readonly ImportReviewCardRow[];
  totalRows: number;
}>;

const errorMessages: Record<string, string> = {
  ANSWER_INVALID: '正解需為 A–D 或 1–4，不可留空或其他值',
  ANSWER_OPTION_MISSING: '正解指向的選項不存在或為空白',
  CODE_DUPLICATE: '題號重複',
  CODE_FORMAT: '題號格式需為 章-節-兩位序號（例如 3-1-01）',
  CONTENT_INVALID: '卡片內容需為 1–8000 字',
  EXPLANATION_INVALID: '解析超過 2000 字',
  MEDIA_ALT_REQUIRED: '有圖片網址時必須填寫替代文字',
  OPTIONS_INVALID: '需要 2–4 個非空選項，每個不超過 500 字',
  PROMPT_INVALID: '題目需為 1–1000 字',
  ROW_LIMIT: `單次匯入最多 ${String(ROW_LIMIT)} 列`,
  SHEET_MISSING: '缺少必要工作表',
  TITLE_INVALID: '卡片標題需為 1–200 字',
  UNSAFE_TEXT: '內容含不允許的 script 或事件屬性',
};

const messageFor = (code: string) => errorMessages[code] ?? code;

export function buildTemplateWorkbook(): ArrayBuffer {
  const workbook = XLSX.utils.book_new();
  const chapterSheet = XLSX.utils.aoa_to_sheet([
    CHAPTER_HEADERS,
    ['3', '色彩表示', '色彩三要素與色彩體系', '3'],
  ]);
  const reviewSheet = XLSX.utils.aoa_to_sheet([
    REVIEW_HEADERS,
    [
      '3',
      '3-1 色彩三要素與色名的表示',
      '色彩的分類',
      '（示範）卡片標題',
      '（示範）卡片內容，支援多行。',
      '',
      '',
    ],
  ]);
  const questionSheet = XLSX.utils.aoa_to_sheet([
    QUESTION_HEADERS,
    [
      '3',
      '3-1 色彩三要素與色名的表示',
      '色彩的分類',
      '3-1-99',
      '單選',
      '（示範）題目文字',
      '選項一',
      '選項二',
      '選項三',
      '選項四',
      'A',
      '（示範）解析文字',
    ],
  ]);
  XLSX.utils.book_append_sheet(
    workbook,
    chapterSheet,
    TEMPLATE_SHEETS.chapters,
  );
  XLSX.utils.book_append_sheet(
    workbook,
    reviewSheet,
    TEMPLATE_SHEETS.reviewCards,
  );
  XLSX.utils.book_append_sheet(
    workbook,
    questionSheet,
    TEMPLATE_SHEETS.questions,
  );
  return XLSX.write(workbook, {
    bookType: 'xlsx',
    type: 'array',
  }) as ArrayBuffer;
}

export const sheetOf = (
  workbook: XLSX.WorkBook,
  name: string,
): XLSX.WorkSheet => {
  const sheet = workbook.Sheets[name];
  if (!sheet) throw new Error(`XLSX_SHEET_MISSING:${name}`);
  return sheet;
};

const cellText = (row: Record<string, unknown>, header: string): string => {
  const value = row[header];
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  return '';
};

export function parseContentWorkbook(data: ArrayBuffer): ParsedWorkbook {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(data, { type: 'array' });
  } catch {
    return {
      chapters: [],
      errors: [
        {
          code: 'FILE_INVALID',
          field: '檔案',
          message: '無法讀取 XLSX 檔案',
          row: 0,
          sheet: '',
        },
      ],
      questions: [],
      reviewCards: [],
      totalRows: 0,
    };
  }

  const errors: ImportRowError[] = [];
  const pushError = (
    sheet: string,
    row: number,
    field: string,
    code: string,
  ) => {
    errors.push({ code, field, message: messageFor(code), row, sheet });
  };

  for (const sheetName of Object.values(TEMPLATE_SHEETS)) {
    if (!workbook.SheetNames.includes(sheetName)) {
      pushError(sheetName, 0, '工作表', 'SHEET_MISSING');
    }
  }
  if (errors.length > 0) {
    return {
      chapters: [],
      errors,
      questions: [],
      reviewCards: [],
      totalRows: 0,
    };
  }

  const readSheet = (name: string): Record<string, unknown>[] =>
    XLSX.utils.sheet_to_json(sheetOf(workbook, name), {
      defval: '',
    });

  const chapterRows = readSheet(TEMPLATE_SHEETS.chapters);
  const reviewRows = readSheet(TEMPLATE_SHEETS.reviewCards);
  const questionRows = readSheet(TEMPLATE_SHEETS.questions);
  const totalRows =
    chapterRows.length + reviewRows.length + questionRows.length;
  if (totalRows > ROW_LIMIT) {
    pushError('', 0, '列數', 'ROW_LIMIT');
    return { chapters: [], errors, questions: [], reviewCards: [], totalRows };
  }

  const chapters: ImportChapterRow[] = chapterRows.map((row, index) => ({
    chapter: cellText(row, '章節編號'),
    description: cellText(row, '章節描述'),
    row: index + 2,
    sortOrder: cellText(row, '顯示順序'),
    title: cellText(row, '章節名稱'),
  }));

  let carriedChapter = '';
  let carriedSection = '';
  const reviewCards: ImportReviewCardRow[] = reviewRows.map((row, index) => {
    const chapterCell = cellText(row, '章節編號');
    const sectionCell = cellText(row, '小節');
    if (chapterCell !== '') carriedChapter = chapterCell;
    if (sectionCell !== '') carriedSection = sectionCell;
    const entry: ImportReviewCardRow = {
      altText: cellText(row, '替代文字（圖片時必填）'),
      chapter: carriedChapter,
      content: cellText(row, '卡片內容'),
      mediaUrl: cellText(row, '圖片網址（選填）'),
      row: index + 2,
      sectionLabel: carriedSection,
      subtopicLabel: cellText(row, '子主題'),
      title: cellText(row, '卡片標題'),
    };
    for (const issue of validateReviewCardRow(entry)) {
      pushError(
        TEMPLATE_SHEETS.reviewCards,
        entry.row,
        issue.field,
        issue.code,
      );
    }
    if (entry.mediaUrl !== '' && entry.altText === '') {
      pushError(
        TEMPLATE_SHEETS.reviewCards,
        entry.row,
        '替代文字',
        'MEDIA_ALT_REQUIRED',
      );
    }
    return entry;
  });

  const seenCodes = new Set<string>();
  const questions: ImportQuestionRow[] = questionRows.map((row, index) => {
    const options = (['A', 'B', 'C', 'D'] as const)
      .map((key) => ({ key, text: cellText(row, `選項${key}`) }))
      .filter((entry) => entry.text !== '');
    const entry = {
      answer: cellText(row, '正解'),
      code: cellText(row, '題號'),
      explanation: cellText(row, '解析'),
      options,
      prompt: cellText(row, '題目'),
    };
    const rowNumber = index + 2;
    for (const issue of validateQuestionRow(entry)) {
      pushError(TEMPLATE_SHEETS.questions, rowNumber, issue.field, issue.code);
    }
    if (seenCodes.has(entry.code)) {
      pushError(TEMPLATE_SHEETS.questions, rowNumber, '題號', 'CODE_DUPLICATE');
    }
    seenCodes.add(entry.code);
    return {
      answerKey: entry.answer.toUpperCase(),
      chapter: cellText(row, '章節編號'),
      code: entry.code,
      explanation: entry.explanation,
      options,
      prompt: entry.prompt,
      row: rowNumber,
      sectionLabel: cellText(row, '小節'),
      subtopicLabel: cellText(row, '子主題'),
    };
  });

  return { chapters, errors, questions, reviewCards, totalRows };
}
