import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';

import { buildCompatibilityWorkbook } from '../../scripts/content/build-import-package.mjs';

import { parseContentWorkbook } from '../../src/features/content-studio/import/workbook-parser';

const isArrayBuffer = (value: unknown): value is ArrayBuffer =>
  Object.prototype.toString.call(value) === '[object ArrayBuffer]';

describe('legacy Sheet compatibility adapter', () => {
  it('emits the unified Chapter 3 workbook without writing content', () => {
    const { attachmentWarnings, workbook } = buildCompatibilityWorkbook({
      questions: [
        {
          answer: 'A',
          code: 'QB3198',
          explanation: '色相、明度、彩度是色彩三要素。',
          options: [
            { key: 'A', text: '色相、明度、彩度' },
            { key: 'B', text: '紅、黃、藍' },
          ],
          prompt: '下列何者是色彩三要素？',
        },
        {
          answer: 'A',
          code: 'QB1398',
          explanation: '這是第一章第三節，不可被第三章套件收錄。',
          options: [
            { key: 'A', text: '第一章' },
            { key: 'B', text: '第三章' },
          ],
          prompt: '此題屬於哪一章？',
        },
      ],
      reviewCards: [
        {
          attachmentRef: '',
          chapterCode: 'chapter-3',
          content: '色彩包含色相、明度、彩度。',
          groupLabel: '3-1',
          sectionKey: '3-1',
          sectionLabel: '3-1 色彩三要素與色名的表示',
          sortOrder: 1,
          stableCode: 'RC-ADAPTER-TEST',
          title: '色彩三要素',
        },
      ],
    });
    const bytes: unknown = XLSX.write(workbook, {
      bookType: 'xlsx',
      type: 'array',
    });
    if (!isArrayBuffer(bytes)) throw new Error('XLSX_WRITE_FAILED');
    const parsed = parseContentWorkbook(bytes);

    expect(attachmentWarnings).toEqual([]);
    expect(parsed.items).toHaveLength(7);
    expect(parsed.items.map((item) => item.sheet)).toEqual([
      'Course',
      'Chapter',
      'Section',
      'Subtopic',
      'RC',
      'QB',
      'Question',
    ]);
  });
});
