import { z } from 'zod';

export const importEntityTypeSchema = z.enum([
  'course',
  'chapter',
  'section',
  'subtopic',
  'review_card',
  'assessment_bank',
  'question',
]);

export type ImportEntityType = z.infer<typeof importEntityTypeSchema>;

export type NormalizedImportItem = Readonly<{
  entityType: ImportEntityType;
  payload: Readonly<Record<string, unknown>>;
  rowNumber: number;
  sheet: string;
  stableCode: string;
}>;

export type NormalizedImportPackage = Readonly<{
  items: readonly NormalizedImportItem[];
  mediaPaths: readonly string[];
  sourceFormat: 'xlsx' | 'csv_zip';
}>;

export class ContentImportParseError extends Error {
  readonly code:
    | 'IMPORT_AUTHORITY_CONFLICT'
    | 'IMPORT_DUPLICATE_CODE'
    | 'IMPORT_FORMULA_REJECTED'
    | 'IMPORT_LIMIT_EXCEEDED'
    | 'IMPORT_MEDIA_INVALID'
    | 'IMPORT_REQUIRED_FIELD'
    | 'IMPORT_UNSAFE_TEXT'
    | 'IMPORT_WORKBOOK_INVALID';

  constructor(code: ContentImportParseError['code'], detail?: string) {
    super(detail === undefined ? code : `${code}: ${detail}`);
    this.name = 'ContentImportParseError';
    this.code = code;
  }
}
