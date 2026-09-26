import { unzipSync } from 'npm:fflate@0.8.2';
import * as XLSX from 'npm:xlsx@0.18.5';

const MAX_PACKAGE_BYTES = 10 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 40 * 1024 * 1024;
const MAX_ENTRIES = 100;
const MAX_ROWS = 5_000;

const sheetTypes = new Map<string, readonly [string, string?]>([
  ['Course', ['course']],
  ['Chapter', ['chapter']],
  ['Section', ['section']],
  ['Subtopic', ['subtopic']],
  ['RC', ['review_card']],
  ['QB', ['assessment_bank', 'QB']],
  ['CR', ['assessment_bank', 'CR']],
  ['LT', ['assessment_bank', 'LT']],
  ['Question', ['question']],
]);

export class ContentImportPackageError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = 'ContentImportPackageError';
    this.code = code;
  }
}

const safePath = (path: string): boolean =>
  path.length > 0 &&
  path.length <= 240 &&
  !path.startsWith('/') &&
  !path.includes('\\') &&
  !path.split('/').includes('..') &&
  path.split('/').filter(Boolean).length <= 4;

const safeText = (value: unknown): string | number | boolean | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value !== 'string')
    throw new ContentImportPackageError('IMPORT_WORKBOOK_INVALID');
  const text = value.trim();
  if (/^[=+\-@]/u.test(text))
    throw new ContentImportPackageError('IMPORT_FORMULA_REJECTED');
  if (/\u0000|<script|\bon[a-z]+\s*=/iu.test(text))
    throw new ContentImportPackageError('IMPORT_UNSAFE_TEXT');
  return text;
};

const jsonObjectValue = (value: unknown): Record<string, unknown> => {
  if (value === null || value === undefined || value === '') return {};
  if (typeof value !== 'string')
    throw new ContentImportPackageError('IMPORT_WORKBOOK_INVALID');
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed))
      return parsed as Record<string, unknown>;
  } catch {
    // Converted to the stable import error below.
  }
  throw new ContentImportPackageError('IMPORT_WORKBOOK_INVALID');
};

const numberValue = (value: unknown, fallback: number): number => {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && /^\d+$/u.test(value)) return Number(value);
  if (value === null || value === undefined || value === '') return fallback;
  throw new ContentImportPackageError('IMPORT_WORKBOOK_INVALID');
};

const booleanValue = (value: unknown, fallback: boolean): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string' && /^(true|false)$/iu.test(value))
    return value.toLowerCase() === 'true';
  if (value === null || value === undefined || value === '') return fallback;
  throw new ContentImportPackageError('IMPORT_WORKBOOK_INVALID');
};

const rejectWorkbookFormulas = (workbook: XLSX.WorkBook): void => {
  for (const sheet of Object.values(workbook.Sheets)) {
    for (const [coordinate, cell] of Object.entries(sheet)) {
      if (!coordinate.startsWith('!') && cell.f !== undefined)
        throw new ContentImportPackageError('IMPORT_FORMULA_REJECTED');
    }
  }
};

const validateXlsxEnvelope = (bytes: Uint8Array): void => {
  let entryCount = 0;
  let expandedBytes = 0;
  try {
    unzipSync(bytes, {
      filter(file) {
        entryCount += 1;
        expandedBytes += file.originalSize;
        if (
          entryCount > MAX_ENTRIES ||
          expandedBytes > MAX_UNCOMPRESSED_BYTES ||
          file.originalSize > Math.max(file.size * 100, 1024 * 1024) ||
          !safePath(file.name)
        )
          throw new ContentImportPackageError('IMPORT_ZIP_UNSAFE');
        return false;
      },
    });
  } catch (error) {
    if (error instanceof ContentImportPackageError) throw error;
    throw new ContentImportPackageError('IMPORT_WORKBOOK_INVALID');
  }
};

const normalizedRows = (
  workbook: XLSX.WorkBook,
): Array<Record<string, unknown>> => {
  const items: Array<Record<string, unknown>> = [];
  const identities = new Set<string>();
  const mediaByOwner = new Map<string, Array<Record<string, unknown>>>();
  const mediaSheet = workbook.Sheets.Media;
  if (mediaSheet !== undefined) {
    const mediaRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      mediaSheet,
      { defval: null, raw: true },
    );
    for (const source of mediaRows) {
      const ownerCode = String(safeText(source.owner_code) ?? '');
      const path = String(safeText(source.path) ?? '');
      const altText = String(safeText(source.alt_text) ?? '');
      const semanticRole = String(safeText(source.semantic_role) ?? 'standard');
      const sortOrder = Number(safeText(source.sort_order) ?? 0);
      if (
        ownerCode === '' ||
        altText === '' ||
        !safePath(path) ||
        !/^media\/.+\.(?:jpe?g|png|webp)$/iu.test(path) ||
        !['standard', 'color_critical'].includes(semanticRole) ||
        !Number.isInteger(sortOrder) ||
        sortOrder < 0
      )
        throw new ContentImportPackageError('IMPORT_MEDIA_INVALID');
      const references = mediaByOwner.get(ownerCode) ?? [];
      references.push({
        alt_text: altText,
        import_path: path,
        semantic_role: semanticRole,
        sort_order: sortOrder,
      });
      mediaByOwner.set(ownerCode, references);
    }
  }
  for (const [sheetName, [entityType, kind]] of sheetTypes) {
    const sheet = workbook.Sheets[sheetName];
    if (sheet === undefined) continue;
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: null,
      raw: true,
    });
    for (const [index, source] of rows.entries()) {
      if (items.length >= MAX_ROWS)
        throw new ContentImportPackageError('IMPORT_LIMIT_EXCEEDED');
      const row = Object.fromEntries(
        Object.entries(source).map(([key, value]) => [
          key.trim().toLowerCase(),
          safeText(value),
        ]),
      );
      const stableCode = String(row.stable_code ?? '').trim();
      if (stableCode === '')
        throw new ContentImportPackageError('IMPORT_REQUIRED_FIELD');
      const identity = `${entityType}:${stableCode}`;
      if (identities.has(identity))
        throw new ContentImportPackageError('IMPORT_DUPLICATE_CODE');
      identities.add(identity);
      const payload: Record<string, unknown> = Object.fromEntries(
        Object.entries(row).filter(
          ([key, value]) =>
            key !== 'stable_code' && value !== null && value !== '',
        ),
      );
      if (kind !== undefined) payload.kind = kind;
      if (kind !== undefined)
        payload.selection_settings = jsonObjectValue(row.selection_settings);
      payload.sort_order = numberValue(row.sort_order, 0);
      if (
        ['Course', 'Chapter', 'Section', 'Subtopic', 'QB', 'CR', 'LT'].includes(
          sheetName,
        )
      )
        payload.description = String(row.description ?? '');
      if (entityType === 'review_card') {
        payload.group_label = String(row.group_label ?? '');
        payload.requires_recompletion = booleanValue(
          row.requires_recompletion,
          false,
        );
        payload.media = mediaByOwner.get(stableCode) ?? [];
        mediaByOwner.delete(stableCode);
      }
      if (entityType === 'question') {
        const correctKey = String(row.correct_key ?? '').toUpperCase();
        payload.question_type = 'single_choice';
        payload.duration_seconds = numberValue(row.duration_seconds, 20);
        payload.explanation = String(row.explanation ?? '');
        payload.options = ['A', 'B', 'C', 'D']
          .map((key, optionIndex) => ({
            is_correct: correctKey === key,
            key,
            sort_order: optionIndex + 1,
            text: String(row[`option_${key.toLowerCase()}`] ?? '').trim(),
          }))
          .filter((option) => option.text !== '');
        for (const key of [
          'correct_key',
          'option_a',
          'option_b',
          'option_c',
          'option_d',
        ])
          delete payload[key];
      }
      items.push({
        entity_type: entityType,
        payload,
        row_number: index + 2,
        sheet: sheetName,
        stable_code: stableCode,
      });
    }
  }
  if (items.length === 0)
    throw new ContentImportPackageError('IMPORT_WORKBOOK_INVALID');
  if (mediaByOwner.size > 0)
    throw new ContentImportPackageError('IMPORT_MEDIA_INVALID');
  return items;
};

const workbookFromCsvEntries = (
  entries: Readonly<Record<string, Uint8Array>>,
): XLSX.WorkBook => {
  const workbook = XLSX.utils.book_new();
  for (const [path, bytes] of Object.entries(entries).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (!/^csv\/[A-Za-z]+\.csv$/u.test(path)) continue;
    const sheetName = path.slice(4, -4);
    if (!sheetTypes.has(sheetName) && sheetName !== 'Media')
      throw new ContentImportPackageError('IMPORT_WORKBOOK_INVALID');
    const parsed = XLSX.read(bytes, { raw: true, type: 'array' });
    const firstSheetName = parsed.SheetNames[0];
    const sheet = firstSheetName ? parsed.Sheets[firstSheetName] : undefined;
    if (sheet === undefined)
      throw new ContentImportPackageError('IMPORT_WORKBOOK_INVALID');
    XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  }
  return workbook;
};

export const parseTrustedContentPackage = (
  bytes: Uint8Array,
  filename: string,
): Readonly<{
  items: readonly Record<string, unknown>[];
  media: readonly Readonly<{
    bytes: Uint8Array;
    path: string;
  }>[];
  sourceFormat: 'xlsx' | 'csv_zip';
}> => {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_PACKAGE_BYTES)
    throw new ContentImportPackageError('IMPORT_LIMIT_EXCEEDED');
  if (filename.toLowerCase().endsWith('.xlsx')) {
    validateXlsxEnvelope(bytes);
    const workbook = XLSX.read(bytes, { cellFormula: true, type: 'array' });
    rejectWorkbookFormulas(workbook);
    const items = normalizedRows(workbook);
    if (
      items.some(
        (item) =>
          Array.isArray((item.payload as Record<string, unknown>).media) &&
          ((item.payload as Record<string, unknown>).media as unknown[])
            .length > 0,
      )
    )
      throw new ContentImportPackageError('IMPORT_MEDIA_INVALID');
    return { items, media: [], sourceFormat: 'xlsx' };
  }
  if (!filename.toLowerCase().endsWith('.zip'))
    throw new ContentImportPackageError('IMPORT_WORKBOOK_INVALID');

  let entryCount = 0;
  let expandedBytes = 0;
  const entries = unzipSync(bytes, {
    filter(file) {
      entryCount += 1;
      expandedBytes += file.originalSize;
      if (
        entryCount > MAX_ENTRIES ||
        expandedBytes > MAX_UNCOMPRESSED_BYTES ||
        file.originalSize > Math.max(file.size * 100, 1024 * 1024) ||
        !safePath(file.name)
      ) {
        throw new ContentImportPackageError('IMPORT_ZIP_UNSAFE');
      }
      return true;
    },
  });
  const hasWorkbook = entries['content.xlsx'] !== undefined;
  const hasCsv = Object.keys(entries).some((path) => path.startsWith('csv/'));
  if (hasWorkbook === hasCsv)
    throw new ContentImportPackageError('IMPORT_AUTHORITY_CONFLICT');
  const workbook = hasWorkbook
    ? (() => {
        validateXlsxEnvelope(entries['content.xlsx']);
        const parsed = XLSX.read(entries['content.xlsx'], {
          cellFormula: true,
          type: 'array',
        });
        rejectWorkbookFormulas(parsed);
        return parsed;
      })()
    : workbookFromCsvEntries(entries);
  const media = Object.entries(entries)
    .filter(([path]) => path.startsWith('media/'))
    .map(([path, mediaBytes]) => {
      if (
        !/^media\/[A-Za-z0-9][A-Za-z0-9._/-]*\.(?:jpe?g|png|webp)$/iu.test(
          path,
        ) ||
        mediaBytes.byteLength > 2 * 1024 * 1024
      ) {
        throw new ContentImportPackageError('IMPORT_MEDIA_INVALID');
      }
      return { bytes: mediaBytes, path };
    });
  const items = normalizedRows(workbook);
  const declaredPaths = new Set(
    items.flatMap((item) => {
      const payload = item.payload as Record<string, unknown>;
      return Array.isArray(payload.media)
        ? payload.media.map((reference) =>
            String((reference as Record<string, unknown>).import_path ?? ''),
          )
        : [];
    }),
  );
  if (
    media.some((item) => !declaredPaths.has(item.path)) ||
    [...declaredPaths].some((path) => !media.some((item) => item.path === path))
  )
    throw new ContentImportPackageError('IMPORT_MEDIA_INVALID');
  return {
    items,
    media,
    sourceFormat: hasWorkbook ? 'xlsx' : 'csv_zip',
  };
};
