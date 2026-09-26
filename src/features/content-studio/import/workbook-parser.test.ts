import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';

import { ContentImportParseError } from './contracts';
import { parseContentWorkbook } from './workbook-parser';

const isArrayBuffer = (value: unknown): value is ArrayBuffer =>
  Object.prototype.toString.call(value) === '[object ArrayBuffer]';

const workbookBytes = (
  sheets: Readonly<Record<string, readonly Record<string, unknown>[]>>,
): ArrayBuffer => {
  const workbook = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet([...rows]),
      name,
    );
  }
  const output: unknown = XLSX.write(workbook, {
    bookType: 'xlsx',
    type: 'array',
  });
  if (!isArrayBuffer(output)) throw new Error('XLSX_WRITE_FAILED');
  return output;
};

describe('ContentImport workbook parser', () => {
  it('normalizes RC, scoped banks and questions from one workbook', () => {
    const parsed = parseContentWorkbook(
      workbookBytes({
        QB: [
          {
            section_code: 'sheet-3-1',
            stable_code: 'QB31',
            title: '3-1 小節題庫',
          },
        ],
        Question: [
          {
            bank_code: 'QB31',
            correct_key: 'A',
            explanation: '解析',
            option_a: '正確',
            option_b: '錯誤',
            prompt: '何者正確？',
            stable_code: 'QB3101',
          },
        ],
        RC: [
          {
            content: '複習內容',
            stable_code: 'RC31-01',
            subtopic_code: 'sheet-3-1-all',
            title: '色彩三要素',
          },
        ],
      }),
    );

    expect(parsed.items).toHaveLength(3);
    expect(parsed.items.find((item) => item.sheet === 'QB')).toMatchObject({
      entityType: 'assessment_bank',
      payload: { kind: 'QB', section_code: 'sheet-3-1' },
    });
    expect(
      parsed.items.find((item) => item.sheet === 'Question'),
    ).toMatchObject({
      payload: {
        duration_seconds: 20,
        options: [
          { is_correct: true, key: 'A', text: '正確' },
          { is_correct: false, key: 'B', text: '錯誤' },
        ],
      },
    });
  });

  it.each([
    ['=HYPERLINK("https://evil")', 'IMPORT_FORMULA_REJECTED'],
    ['<script>alert(1)</script>', 'IMPORT_UNSAFE_TEXT'],
  ])('rejects unsafe cell %s', (prompt, code) => {
    expect(() =>
      parseContentWorkbook(
        workbookBytes({
          Question: [
            {
              bank_code: 'QB31',
              correct_key: 'A',
              option_a: '甲',
              option_b: '乙',
              prompt,
              stable_code: 'QB3101',
            },
          ],
        }),
      ),
    ).toThrow(expect.objectContaining({ code }));
  });

  it('rejects a real XLSX formula cell instead of trusting its cached value', () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet([
      { content: '快取值', stable_code: 'RC-FORMULA', title: '公式測試' },
    ]);
    sheet.A2 = { f: 'HYPERLINK("https://evil")', t: 's', v: '快取值' };
    XLSX.utils.book_append_sheet(workbook, sheet, 'RC');
    const bytes: unknown = XLSX.write(workbook, {
      bookType: 'xlsx',
      type: 'array',
    });
    if (!isArrayBuffer(bytes)) throw new Error('XLSX_WRITE_FAILED');

    expect(() => parseContentWorkbook(bytes)).toThrow(
      expect.objectContaining({ code: 'IMPORT_FORMULA_REJECTED' }),
    );
  });

  it('rejects duplicate stable codes and invalid media paths', () => {
    expect(() =>
      parseContentWorkbook(
        workbookBytes({
          Media: [{ alt_text: '圖', path: 'media/../secret.png' }],
          RC: [
            { content: '甲', stable_code: 'RC31', title: '甲' },
            { content: '乙', stable_code: 'RC31', title: '乙' },
          ],
        }),
      ),
    ).toThrow(ContentImportParseError);
  });
});
