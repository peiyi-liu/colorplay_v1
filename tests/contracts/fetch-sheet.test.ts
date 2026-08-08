import { describe, expect, it } from 'vitest';
import XLSX from 'xlsx';

import {
  extractQuestionRows,
  extractReviewRows,
  QUESTION_TAB_NAME,
  REVIEW_TAB_NAME,
  toCsv,
  toQuestionsCsv,
  toReviewCardsCsv,
} from '../../scripts/content/fetch-sheet.mjs';
import { buildReviewCardImport } from '../../scripts/content/import-review-cards.mjs';
import { parseCsv } from '../../scripts/content/import-shared.mjs';

const MESSY_QUESTION_HEADER = [
  '題號',
  '章節',
  '章節標題',
  '小節',
  '小節標題',
  '題目',
  '選項 A ',
  '選項 B ',
  '選項 C',
  '選項 D',
  '正確答案 ',
  '答錯觀念解析',
];

function makeWorkbook({
  questionRows = [],
  reviewRows = [],
}: Readonly<{
  questionRows?: readonly (readonly string[])[];
  reviewRows?: readonly (readonly string[])[];
}>) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      [' ', '小節', '子主題', '卡片標題', '卡片內容'],
      ...reviewRows.map((row) => [...row]),
    ]),
    REVIEW_TAB_NAME,
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      MESSY_QUESTION_HEADER,
      ...questionRows.map((row) => [...row]),
    ]),
    QUESTION_TAB_NAME,
  );
  return workbook;
}

const fullRow = [
  '3-1-01',
  '3',
  '色彩表示',
  '31',
  '色彩三要素與色名的表示',
  '純色加入黑色所得的色彩稱為？',
  '明色',
  '中間色',
  '濁色',
  '暗色',
  'D',
  '純色加入黑色後明度降低，稱為「暗色」。',
];
const placeholderRow = [
  '1101',
  '1',
  '認識色彩',
  '11',
  '色彩的來源',
  '',
  '',
  '',
  '',
  '',
  '',
  '本單元探討色彩的來源（佔位解析）。',
];
const missingAnswerRow = [
  '4-1-01',
  '4',
  '色彩與視覺',
  '41',
  '眼睛的構造',
  '視覺處理順序何者正確？',
  '甲',
  '乙',
  '丙',
  '丁',
  '',
  '解析文字。',
];

describe('fetch-sheet 題庫分頁解析', () => {
  it('容忍表頭尾空格並依欄名對應欄位', () => {
    const result = extractQuestionRows(
      makeWorkbook({ questionRows: [fullRow] }),
    );
    expect(result.problems).toEqual([]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      answer: 'D',
      chapter: '3',
      code: '3-1-01',
      prompt: '純色加入黑色所得的色彩稱為？',
      sectionTitle: '色彩三要素與色名的表示',
    });
    expect(result.rows[0]?.options).toEqual({
      A: '明色',
      B: '中間色',
      C: '濁色',
      D: '暗色',
    });
  });

  it('過濾佔位列（僅有解析）但保留缺正解列給防呆', () => {
    const result = extractQuestionRows(
      makeWorkbook({
        questionRows: [placeholderRow, fullRow, missingAnswerRow],
      }),
    );
    expect(result.placeholders).toEqual([
      { chapter: '1', code: '1-1-01', rowNumber: 2 },
    ]);
    expect(result.rows.map((row) => row.code)).toEqual(['3-1-01', '4-1-01']);
  });

  it('題號欄為純數值時轉換為 n-n-nn（3110 = 第3章第1節第10題）', () => {
    const numericCodeRow = [
      '3110',
      '3',
      '色彩表示',
      '31',
      '色彩三要素與色名的表示',
      '下列純色何者明度最高？',
      '黃色',
      '紅色',
      '紫色',
      '黑色',
      'A',
      '黃色的反射率最高，明度最高。',
    ];
    const result = extractQuestionRows(
      makeWorkbook({ questionRows: [numericCodeRow] }),
    );
    expect(result.rows[0]?.code).toBe('3-1-10');
  });

  it('題號欄已是 n-n-nn 時原樣保留', () => {
    const result = extractQuestionRows(
      makeWorkbook({ questionRows: [fullRow] }),
    );
    expect(result.rows[0]?.code).toBe('3-1-01');
  });

  it('缺少必要欄位時回報 problems', () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([['題號', '章節']]),
      QUESTION_TAB_NAME,
    );
    const result = extractQuestionRows(workbook);
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toContain('缺少必要欄位');
  });

  it('toQuestionsCsv 輸出 import-questions 的 10 欄位置式契約', () => {
    const { rows } = extractQuestionRows(
      makeWorkbook({ questionRows: [fullRow] }),
    );
    const parsed = parseCsv(toQuestionsCsv(rows));
    expect(parsed[0]).toHaveLength(10);
    expect(parsed[1]).toEqual([
      '3-1-01',
      '3',
      '色彩三要素與色名的表示',
      '純色加入黑色所得的色彩稱為？',
      '明色',
      '中間色',
      '濁色',
      '暗色',
      'D',
      '純色加入黑色後明度降低，稱為「暗色」。',
    ]);
  });
});

describe('fetch-sheet 複習大廳解析', () => {
  it('容忍空白章欄表頭，輸出可被 buildReviewCardImport 使用', () => {
    const result = extractReviewRows(
      makeWorkbook({
        reviewRows: [
          [
            '3',
            '3-1 色彩三要素與色名的表示',
            '色彩的分類',
            '有彩色',
            '第一行\n第二行',
          ],
          ['', '', '色彩三要素', '甚麼是HVC', '內容乙'],
        ],
      }),
    );
    expect(result.problems).toEqual([]);
    const imported = buildReviewCardImport({
      csvText: toReviewCardsCsv(result.rows),
      fixes: { chapterMap: { '3': 'chapter-3' } },
    });
    expect(imported.problems).toEqual([]);
    expect(imported.cards.map((card) => card.title)).toEqual([
      '有彩色',
      '甚麼是HVC',
    ]);
    expect(imported.cards[0]?.content).toBe('第一行\n第二行');
  });
});

describe('toCsv 跳脫', () => {
  it('引號、逗號與換行皆正確跳脫並可反解析', () => {
    const rows = [['a"b', 'c,d', 'e\nf', '平文']];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});
