import { strToU8, zipSync } from 'npm:fflate@0.8.2';
import * as XLSX from 'npm:xlsx@0.18.5';

import {
  ContentImportPackageError,
  parseTrustedContentPackage,
} from './parser.ts';

const assertEquals = (actual: unknown, expected: unknown): void => {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(
      `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
};

const workbookBytes = (): Uint8Array => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([
      {
        content: '複習內容',
        stable_code: 'RC31-01',
        subtopic_code: 'sheet-3-1-all',
        title: '色彩三要素',
      },
    ]),
    'RC',
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([
      {
        alt_text: '色彩三要素圖',
        owner_code: 'RC31-01',
        path: 'media/P301.png',
        semantic_role: 'standard',
        sort_order: 0,
      },
    ]),
    'Media',
  );
  return new Uint8Array(
    XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }),
  );
};

Deno.test('parses one XLSX authority and bounded media from ZIP', () => {
  const zipped = zipSync({
    'content.xlsx': workbookBytes(),
    'media/P301.png': new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
  });
  const parsed = parseTrustedContentPackage(zipped, 'chapter-3.zip');
  assertEquals(parsed.sourceFormat, 'xlsx');
  assertEquals(parsed.items.length, 1);
  assertEquals(
    parsed.media.map((item) => item.path),
    ['media/P301.png'],
  );
});

Deno.test('parses CSV package authority', () => {
  const zipped = zipSync({
    'csv/Media.csv': strToU8(
      'owner_code,path,alt_text,semantic_role,sort_order\nRC31-01,media/P301.png,色彩三要素圖,standard,0',
    ),
    'csv/RC.csv': strToU8(
      'stable_code,subtopic_code,title,content\nRC31-01,sheet-3-1-all,色彩三要素,複習內容',
    ),
    'media/P301.png': new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
  });
  const parsed = parseTrustedContentPackage(zipped, 'chapter-3.zip');
  assertEquals(parsed.sourceFormat, 'csv_zip');
  assertEquals(parsed.items.length, 1);
  assertEquals(parsed.media.length, 1);
});

Deno.test('rejects mixed authority and traversal', () => {
  for (const zipped of [
    zipSync({
      'content.xlsx': workbookBytes(),
      'csv/RC.csv': strToU8('stable_code\nRC31'),
    }),
    zipSync({ 'one/two/three/four/five/secret.csv': strToU8('secret') }),
  ]) {
    let error: unknown;
    try {
      parseTrustedContentPackage(zipped, 'unsafe.zip');
    } catch (caught) {
      error = caught;
    }
    if (!(error instanceof ContentImportPackageError))
      throw new Error('expected fail-closed package rejection');
  }
});

Deno.test('rejects a real XLSX formula cell at the trusted boundary', () => {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet([
    { content: '快取值', stable_code: 'RC-FORMULA', title: '公式測試' },
  ]);
  sheet.A2 = { f: 'HYPERLINK("https://evil")', t: 's', v: '快取值' };
  XLSX.utils.book_append_sheet(workbook, sheet, 'RC');
  const bytes = new Uint8Array(
    XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }),
  );
  let error: unknown;
  try {
    parseTrustedContentPackage(bytes, 'formula.xlsx');
  } catch (caught) {
    error = caught;
  }
  if (
    !(error instanceof ContentImportPackageError) ||
    error.code !== 'IMPORT_FORMULA_REJECTED'
  )
    throw new Error('expected formula rejection');
});
