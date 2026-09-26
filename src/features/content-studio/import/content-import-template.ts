import * as XLSX from 'xlsx';

const sheets = {
  Course: [
    ['stable_code', 'title', 'description', 'sort_order'],
    ['color-theory', '色彩原理', '課程說明範例', 1],
  ],
  Chapter: [
    ['stable_code', 'course_code', 'title', 'description', 'sort_order'],
    ['chapter-3', 'color-theory', '色彩表示', '章節說明範例', 3],
  ],
  Section: [
    ['stable_code', 'chapter_code', 'title', 'description', 'sort_order'],
    ['sheet-3-1', 'chapter-3', '3-1 色彩三要素與色名的表示', '', 1],
  ],
  Subtopic: [
    ['stable_code', 'section_code', 'title', 'description', 'sort_order'],
    ['sheet-3-1-all', 'sheet-3-1', '3-1 色彩三要素與色名的表示', '', 1],
  ],
  RC: [
    [
      'stable_code',
      'subtopic_code',
      'group_label',
      'title',
      'content',
      'requires_recompletion',
      'sort_order',
    ],
    [
      'RC-EXAMPLE',
      'sheet-3-1-all',
      '3-1',
      '複習卡範例',
      '請以實際教學內容取代本列。',
      false,
      999,
    ],
  ],
  QB: [
    [
      'stable_code',
      'section_code',
      'title',
      'description',
      'selection_settings',
      'sort_order',
    ],
    ['QB-sheet-3-1', 'sheet-3-1', '3-1 小節題庫', '', '{}', 1],
  ],
  CR: [
    [
      'stable_code',
      'chapter_code',
      'title',
      'description',
      'selection_settings',
      'sort_order',
    ],
    ['CR-chapter-3', 'chapter-3', '第三章總測驗', '', '{}', 1],
  ],
  LT: [
    [
      'stable_code',
      'section_code',
      'title',
      'description',
      'selection_settings',
      'sort_order',
    ],
    ['LT-sheet-3-1', 'sheet-3-1', '3-1 Live 題庫', '', '{}', 1],
  ],
  Question: [
    [
      'stable_code',
      'bank_code',
      'prompt',
      'option_a',
      'option_b',
      'option_c',
      'option_d',
      'correct_key',
      'explanation',
      'duration_seconds',
      'sort_order',
    ],
    [
      'QB3199',
      'QB-sheet-3-1',
      '範例題目：色彩三要素包含哪些？',
      '色相、明度、彩度',
      '紅、黃、藍',
      '冷、暖、中性',
      '光、眼睛、物體',
      'A',
      '請以實際教學解析取代本列。',
      20,
      999,
    ],
  ],
  Media: [
    ['owner_code', 'path', 'alt_text', 'semantic_role', 'sort_order'],
    ['RC-EXAMPLE', 'media/example.webp', '色彩教學圖片範例', 'standard', 0],
  ],
} as const;

export const CONTENT_IMPORT_TEMPLATE_SHEETS = Object.freeze(
  Object.keys(sheets),
);

const isArrayBuffer = (value: unknown): value is ArrayBuffer =>
  Object.prototype.toString.call(value) === '[object ArrayBuffer]';

export function createContentImportTemplate(): ArrayBuffer {
  const workbook = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    const sheet = XLSX.utils.aoa_to_sheet(rows.map((row) => [...row]));
    sheet['!autofilter'] = {
      ref: `A1:${XLSX.utils.encode_col(rows[0].length - 1)}2`,
    };
    sheet['!cols'] = rows[0].map((header) => ({
      wch: Math.max(14, typeof header === 'string' ? header.length + 2 : 14),
    }));
    XLSX.utils.book_append_sheet(workbook, sheet, name);
  }
  const output: unknown = XLSX.write(workbook, {
    bookType: 'xlsx',
    compression: true,
    type: 'array',
  });
  if (!isArrayBuffer(output))
    throw new Error('CONTENT_IMPORT_TEMPLATE_GENERATION_FAILED');
  return output;
}
