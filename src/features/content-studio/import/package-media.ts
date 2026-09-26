import { unzipSync } from 'fflate';
import * as XLSX from 'xlsx';

import type { ContentMediaSemanticRole } from '../api/content-media-contracts';
import { ContentImportParseError } from './contracts';

const MAX_ENTRIES = 100;
const MAX_EXPANDED_BYTES = 40 * 1024 * 1024;
const MAX_MEDIA_BYTES = 2 * 1024 * 1024;
const ALLOWED_CSV_SHEETS = new Set([
  'Course',
  'Chapter',
  'Section',
  'Subtopic',
  'RC',
  'QB',
  'CR',
  'LT',
  'Question',
  'Media',
]);

export type ContentImportMediaFile = Readonly<{
  file: File;
  path: string;
  semanticRole: ContentMediaSemanticRole;
}>;

const safePath = (path: string): boolean =>
  path.length > 0 &&
  path.length <= 240 &&
  !path.startsWith('/') &&
  !path.includes('\\') &&
  !path.split('/').includes('..') &&
  path.split('/').filter(Boolean).length <= 4;

const mimeForPath = (path: string): string => {
  if (/\.jpe?g$/iu.test(path)) return 'image/jpeg';
  if (/\.png$/iu.test(path)) return 'image/png';
  if (/\.webp$/iu.test(path)) return 'image/webp';
  throw new ContentImportParseError('IMPORT_MEDIA_INVALID', path);
};

const textField = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value.trim() : fallback;

const readWorkbook = (
  entries: Readonly<Record<string, Uint8Array>>,
): XLSX.WorkBook => {
  const workbookBytes = entries['content.xlsx'];
  const csvPaths = Object.keys(entries).filter((path) =>
    /^csv\/[A-Za-z]+\.csv$/u.test(path),
  );
  if ((workbookBytes !== undefined) === csvPaths.length > 0)
    throw new ContentImportParseError('IMPORT_AUTHORITY_CONFLICT');
  if (workbookBytes !== undefined)
    return XLSX.read(workbookBytes, { cellFormula: true, type: 'array' });

  const workbook = XLSX.utils.book_new();
  for (const path of csvPaths.sort()) {
    const name = path.slice(4, -4);
    if (!ALLOWED_CSV_SHEETS.has(name))
      throw new ContentImportParseError('IMPORT_WORKBOOK_INVALID', path);
    const bytes = entries[path];
    if (!bytes) throw new ContentImportParseError('IMPORT_WORKBOOK_INVALID');
    const parsed = XLSX.read(bytes, { raw: true, type: 'array' });
    const sourceName = parsed.SheetNames[0];
    const sheet = sourceName ? parsed.Sheets[sourceName] : undefined;
    if (!sheet) throw new ContentImportParseError('IMPORT_WORKBOOK_INVALID');
    XLSX.utils.book_append_sheet(workbook, sheet, name);
  }
  return workbook;
};

export async function inspectContentImportMedia(
  file: File,
): Promise<readonly ContentImportMediaFile[]> {
  if (!file.name.toLowerCase().endsWith('.zip')) return [];
  const bytes = new Uint8Array(await file.arrayBuffer());
  let entryCount = 0;
  let expandedBytes = 0;
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes, {
      filter(entry) {
        entryCount += 1;
        expandedBytes += entry.originalSize;
        if (
          entryCount > MAX_ENTRIES ||
          expandedBytes > MAX_EXPANDED_BYTES ||
          entry.originalSize > Math.max(entry.size * 100, 1024 * 1024) ||
          !safePath(entry.name)
        )
          throw new ContentImportParseError(
            'IMPORT_LIMIT_EXCEEDED',
            `${entry.name}:${String(entry.size)}:${String(entry.originalSize)}:${String(entryCount)}:${String(expandedBytes)}`,
          );
        return true;
      },
    });
  } catch (error) {
    if (error instanceof ContentImportParseError) throw error;
    throw new ContentImportParseError('IMPORT_WORKBOOK_INVALID');
  }

  const workbook = readWorkbook(entries);
  for (const sheet of Object.values(workbook.Sheets)) {
    for (const [coordinate, cell] of Object.entries(sheet)) {
      const value: unknown = cell;
      const record =
        typeof value === 'object' && value !== null
          ? (value as Record<string, unknown>)
          : null;
      if (!coordinate.startsWith('!') && record?.f !== undefined)
        throw new ContentImportParseError(
          'IMPORT_FORMULA_REJECTED',
          coordinate,
        );
    }
  }
  const mediaSheet = workbook.Sheets.Media;
  const rows = mediaSheet
    ? XLSX.utils.sheet_to_json<Record<string, unknown>>(mediaSheet, {
        defval: null,
        raw: true,
      })
    : [];
  const declared = new Map<string, ContentMediaSemanticRole>();
  for (const row of rows) {
    const path = textField(row.path);
    const semanticRole = textField(
      row.semantic_role,
      'standard',
    ) as ContentMediaSemanticRole;
    if (
      !/^media\/[A-Za-z0-9][A-Za-z0-9._/-]*\.(?:jpe?g|png|webp)$/iu.test(
        path,
      ) ||
      !safePath(path) ||
      !['standard', 'color_critical'].includes(semanticRole) ||
      declared.has(path)
    )
      throw new ContentImportParseError('IMPORT_MEDIA_INVALID', path);
    declared.set(path, semanticRole);
  }

  const actual = Object.entries(entries).filter(([path]) =>
    path.startsWith('media/'),
  );
  if (
    actual.some(([path]) => !declared.has(path)) ||
    [...declared].some(
      ([path]) => !actual.some(([actualPath]) => actualPath === path),
    )
  )
    throw new ContentImportParseError('IMPORT_MEDIA_INVALID');

  return actual.map(([path, source]) => {
    if (source.byteLength <= 0 || source.byteLength > MAX_MEDIA_BYTES)
      throw new ContentImportParseError('IMPORT_MEDIA_INVALID', path);
    return {
      file: new File([source], path.split('/').at(-1) ?? 'media', {
        type: mimeForPath(path),
      }),
      path,
      semanticRole: declared.get(path) ?? 'standard',
    };
  });
}
