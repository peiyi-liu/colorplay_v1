import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';

import {
  buildTemplateWorkbook,
  parseContentWorkbook,
  ROW_LIMIT,
  sheetOf,
  TEMPLATE_SHEETS,
} from './xlsx-codec';

const headerOf = (workbook: XLSX.WorkBook, sheetName: string): string[] => {
  const rows = XLSX.utils.sheet_to_json<string[]>(
    sheetOf(workbook, sheetName),
    { header: 1 },
  );
  return rows[0] ?? [];
};

const workbookWith = (
  questionRows: readonly (readonly string[])[],
  reviewRows: readonly (readonly string[])[] = [],
): ArrayBuffer => {
  const template = XLSX.read(buildTemplateWorkbook(), { type: 'array' });
  const questionHeader = headerOf(template, TEMPLATE_SHEETS.questions);
  const reviewHeader = headerOf(template, TEMPLATE_SHEETS.reviewCards);
  const chapterHeader = headerOf(template, TEMPLATE_SHEETS.chapters);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([chapterHeader]),
    TEMPLATE_SHEETS.chapters,
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      reviewHeader,
      ...reviewRows.map((row) => [...row]),
    ]),
    TEMPLATE_SHEETS.reviewCards,
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      questionHeader,
      ...questionRows.map((row) => [...row]),
    ]),
    TEMPLATE_SHEETS.questions,
  );
  return XLSX.write(workbook, {
    bookType: 'xlsx',
    type: 'array',
  }) as ArrayBuffer;
};

const validQuestionRow = [
  '3',
  '3-1 色彩三要素與色名的表示',
  '色彩的分類',
  '7-2-01',
  '單選',
  '匯入測試題目',
  '選項甲',
  '選項乙',
  '',
  '',
  'B',
  '匯入測試解析',
] as const;

describe('xlsx codec', () => {
  it('builds a real template with the three spec worksheets', () => {
    const workbook = XLSX.read(buildTemplateWorkbook(), { type: 'array' });
    expect(workbook.SheetNames).toEqual([
      TEMPLATE_SHEETS.chapters,
      TEMPLATE_SHEETS.reviewCards,
      TEMPLATE_SHEETS.questions,
    ]);
    const headerRow = XLSX.utils.sheet_to_json<string[]>(
      sheetOf(workbook, TEMPLATE_SHEETS.questions),
      { header: 1 },
    )[0];
    expect(headerRow).toContain('正解');
    expect(headerRow).toContain('題號');
  });

  it('parses a valid workbook with zero errors', () => {
    const parsed = parseContentWorkbook(workbookWith([validQuestionRow]));
    expect(parsed.errors).toEqual([]);
    expect(parsed.questions).toHaveLength(1);
    expect(parsed.questions[0]).toMatchObject({
      answerKey: 'B',
      code: '7-2-01',
      options: [
        { key: 'A', text: '選項甲' },
        { key: 'B', text: '選項乙' },
      ],
    });
  });

  it('reports per-row errors with sheet, row, field, and code', () => {
    const badAnswer = [...validQuestionRow] as string[];
    badAnswer[10] = 'X';
    const duplicate = [...validQuestionRow] as string[];
    const emptyPrompt = [...validQuestionRow] as string[];
    emptyPrompt[3] = '7-2-03';
    emptyPrompt[5] = '';
    const scripted = [...validQuestionRow] as string[];
    scripted[3] = '7-2-04';
    scripted[5] = '<script>window.__xss=1</script>';
    const parsed = parseContentWorkbook(
      workbookWith([
        validQuestionRow,
        badAnswer,
        duplicate,
        emptyPrompt,
        scripted,
      ]),
    );
    const codes = parsed.errors.map(
      (entry) => `${String(entry.row)}:${entry.code}`,
    );
    expect(codes).toEqual(
      expect.arrayContaining([
        '3:ANSWER_INVALID',
        '4:CODE_DUPLICATE',
        '5:PROMPT_INVALID',
        '6:UNSAFE_TEXT',
      ]),
    );
    expect(parsed.errors.every((entry) => entry.message.length > 0)).toBe(true);
    expect(
      parsed.errors.every((entry) => entry.sheet === TEMPLATE_SHEETS.questions),
    ).toBe(true);
  });

  it('rejects a workbook missing a required sheet', () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([['x']]),
      '別的表',
    );
    const data = XLSX.write(workbook, {
      bookType: 'xlsx',
      type: 'array',
    }) as ArrayBuffer;
    const parsed = parseContentWorkbook(data);
    expect(
      parsed.errors.filter((entry) => entry.code === 'SHEET_MISSING'),
    ).toHaveLength(3);
  });

  it('enforces the row-count ceiling', () => {
    const rows = Array.from({ length: ROW_LIMIT + 1 }, (_, index) => {
      const row = [...validQuestionRow] as string[];
      row[3] = `7-3-${String(index % 90).padStart(2, '0')}`;
      return row;
    });
    const parsed = parseContentWorkbook(workbookWith(rows));
    expect(parsed.errors.map((entry) => entry.code)).toContain('ROW_LIMIT');
  });

  it('requires alt text when a review card has media', () => {
    const parsed = parseContentWorkbook(
      workbookWith(
        [],
        [
          [
            '3',
            '3-1 色彩三要素與色名的表示',
            '色彩的分類',
            '帶圖卡片',
            '卡片內容',
            'https://example.com/wheel.svg',
            '',
          ],
        ],
      ),
    );
    expect(parsed.errors.map((entry) => entry.code)).toContain(
      'MEDIA_ALT_REQUIRED',
    );
  });

  it('fails cleanly on a malformed file', () => {
    const parsed = parseContentWorkbook(
      new TextEncoder().encode('not an xlsx').buffer,
    );
    expect(parsed.errors.length).toBeGreaterThan(0);
    expect(parsed.questions).toHaveLength(0);
    expect(parsed.reviewCards).toHaveLength(0);
  });
});
