import * as XLSX from 'xlsx';

import {
  ContentImportParseError,
  type ImportEntityType,
  type NormalizedImportItem,
  type NormalizedImportPackage,
} from './contracts';

const MAX_ROWS = 5_000;
const authoritySheets = new Map<
  string,
  Readonly<{ entityType: ImportEntityType; kind?: 'QB' | 'CR' | 'LT' }>
>([
  ['Course', { entityType: 'course' }],
  ['Chapter', { entityType: 'chapter' }],
  ['Section', { entityType: 'section' }],
  ['Subtopic', { entityType: 'subtopic' }],
  ['RC', { entityType: 'review_card' }],
  ['QB', { entityType: 'assessment_bank', kind: 'QB' }],
  ['CR', { entityType: 'assessment_bank', kind: 'CR' }],
  ['LT', { entityType: 'assessment_bank', kind: 'LT' }],
  ['Question', { entityType: 'question' }],
]);

type Cell = string | number | boolean | null;
type SourceRow = Record<string, Cell>;

const normalizedCell = (value: unknown): Cell => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.trim();
  throw new ContentImportParseError('IMPORT_WORKBOOK_INVALID');
};

const rejectUnsafeCell = (value: Cell, coordinate: string): void => {
  if (typeof value !== 'string') return;
  if (/^[=+\-@]/u.test(value)) {
    throw new ContentImportParseError('IMPORT_FORMULA_REJECTED', coordinate);
  }
  if (value.includes('\0') || /<script|\bon[a-z]+\s*=/iu.test(value)) {
    throw new ContentImportParseError('IMPORT_UNSAFE_TEXT', coordinate);
  }
};

const asRows = (sheet: XLSX.WorkSheet, sheetName: string): SourceRow[] => {
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
    raw: true,
  });
  return rows.map((row, rowIndex) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => {
        const cell = normalizedCell(value);
        rejectUnsafeCell(cell, `${sheetName}!${key}${String(rowIndex + 2)}`);
        return [key.trim().toLowerCase(), cell];
      }),
    ),
  );
};

const numberValue = (value: Cell, fallback: number): number => {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && /^\d+$/u.test(value)) return Number(value);
  return fallback;
};

const booleanValue = (value: Cell, fallback: boolean): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string' && /^(true|false)$/iu.test(value))
    return value.toLowerCase() === 'true';
  if (value === null) return fallback;
  throw new ContentImportParseError('IMPORT_WORKBOOK_INVALID');
};

const textValue = (value: Cell): string =>
  value === null ? '' : String(value).trim();

const jsonObjectValue = (value: Cell): Record<string, unknown> => {
  if (value === null || value === '') return {};
  if (typeof value !== 'string')
    throw new ContentImportParseError('IMPORT_WORKBOOK_INVALID');
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed))
      return parsed as Record<string, unknown>;
  } catch {
    // Converted to the stable import error below.
  }
  throw new ContentImportParseError('IMPORT_WORKBOOK_INVALID');
};

const rejectWorkbookFormulas = (workbook: XLSX.WorkBook): void => {
  for (const sheet of Object.values(workbook.Sheets)) {
    for (const coordinate of Object.keys(sheet)) {
      const raw: unknown = sheet[coordinate] as unknown;
      const cell =
        typeof raw === 'object' && raw !== null
          ? (raw as Record<string, unknown>)
          : null;
      if (!coordinate.startsWith('!') && cell?.f !== undefined)
        throw new ContentImportParseError(
          'IMPORT_FORMULA_REJECTED',
          coordinate,
        );
    }
  }
};

const payloadFor = (
  row: SourceRow,
  sheetName: string,
  kind?: 'QB' | 'CR' | 'LT',
): Record<string, unknown> => {
  const omitted = new Set(['stable_code']);
  const payload: Record<string, unknown> = Object.fromEntries(
    Object.entries(row)
      .filter(
        ([key, value]) => !omitted.has(key) && value !== null && value !== '',
      )
      .map(([key, value]) => [key, value]),
  );
  if (kind !== undefined) payload.kind = kind;
  if (kind !== undefined)
    payload.selection_settings = jsonObjectValue(
      row.selection_settings ?? null,
    );
  payload.sort_order = numberValue(row.sort_order ?? null, 0);
  if (
    ['Course', 'Chapter', 'Section', 'Subtopic', 'QB', 'CR', 'LT'].includes(
      sheetName,
    )
  )
    payload.description = textValue(row.description ?? null);
  if (sheetName === 'RC') {
    payload.group_label = textValue(row.group_label ?? null);
    payload.requires_recompletion = booleanValue(
      row.requires_recompletion ?? null,
      false,
    );
  }
  if (sheetName === 'Question') {
    payload.question_type = 'single_choice';
    payload.duration_seconds = numberValue(row.duration_seconds ?? null, 20);
    payload.explanation = textValue(row.explanation ?? null);
    payload.options = ['A', 'B', 'C', 'D']
      .map((key, index) => ({
        is_correct: textValue(row.correct_key ?? null).toUpperCase() === key,
        key,
        sort_order: index + 1,
        text: textValue(row[`option_${key.toLowerCase()}`] ?? null),
      }))
      .filter((option) => option.text !== '');
    delete payload.correct_key;
    delete payload.option_a;
    delete payload.option_b;
    delete payload.option_c;
    delete payload.option_d;
  }
  return payload;
};

export function parseContentWorkbook(
  bytes: ArrayBuffer | Uint8Array,
): NormalizedImportPackage {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(bytes, { cellFormula: true, type: 'array' });
  } catch {
    throw new ContentImportParseError('IMPORT_WORKBOOK_INVALID');
  }
  rejectWorkbookFormulas(workbook);

  const items: NormalizedImportItem[] = [];
  const stableCodes = new Set<string>();
  for (const [sheetName, config] of authoritySheets) {
    const sheet = workbook.Sheets[sheetName];
    if (sheet === undefined) continue;
    const rows = asRows(sheet, sheetName);
    for (const [index, row] of rows.entries()) {
      if (items.length >= MAX_ROWS)
        throw new ContentImportParseError('IMPORT_LIMIT_EXCEEDED');
      const stableCode = textValue(row.stable_code ?? null);
      if (stableCode === '')
        throw new ContentImportParseError(
          'IMPORT_REQUIRED_FIELD',
          `${sheetName}!stable_code${String(index + 2)}`,
        );
      const identity = `${config.entityType}:${stableCode}`;
      if (stableCodes.has(identity))
        throw new ContentImportParseError('IMPORT_DUPLICATE_CODE', identity);
      stableCodes.add(identity);
      items.push({
        entityType: config.entityType,
        payload: payloadFor(row, sheetName, config.kind),
        rowNumber: index + 2,
        sheet: sheetName,
        stableCode,
      });
    }
  }
  if (items.length === 0)
    throw new ContentImportParseError('IMPORT_WORKBOOK_INVALID');

  const mediaSheet = workbook.Sheets.Media;
  const mediaPaths =
    mediaSheet === undefined
      ? []
      : asRows(mediaSheet, 'Media').map((row, index) => {
          const path = textValue(row.path ?? null);
          if (
            path === '' ||
            !/^media\/[A-Za-z0-9][A-Za-z0-9._/-]*\.(?:jpe?g|png|webp)$/iu.test(
              path,
            ) ||
            path.includes('..') ||
            textValue(row.alt_text ?? null) === ''
          ) {
            throw new ContentImportParseError(
              'IMPORT_MEDIA_INVALID',
              `Media row ${String(index + 2)}`,
            );
          }
          return path;
        });

  return { items, mediaPaths, sourceFormat: 'xlsx' };
}
