import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';

import {
  CONTENT_IMPORT_TEMPLATE_SHEETS,
  createContentImportTemplate,
} from './content-import-template';
import { parseContentWorkbook } from './workbook-parser';

describe('content import template', () => {
  it('round-trips through SheetJS with every supported authority sheet', () => {
    const bytes = createContentImportTemplate();
    const workbook = XLSX.read(bytes, { type: 'array' });

    expect(workbook.SheetNames).toEqual(CONTENT_IMPORT_TEMPLATE_SHEETS);
    expect(bytes.byteLength).toBeGreaterThan(1_000);

    const parsed = parseContentWorkbook(bytes);
    expect(parsed.items).toHaveLength(9);
    expect(parsed.mediaPaths).toEqual(['media/example.webp']);
    expect(parsed.items.map((item) => item.entityType)).toEqual([
      'course',
      'chapter',
      'section',
      'subtopic',
      'review_card',
      'assessment_bank',
      'assessment_bank',
      'assessment_bank',
      'question',
    ]);
  });
});
