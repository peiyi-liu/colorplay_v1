import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import { zipSync } from 'fflate';
import * as XLSX from 'xlsx';

import { inspectContentImportMedia } from '../../src/features/content-studio/import/package-media';

const packageRoot = join(process.cwd(), 'content/packages/chapter-3');
const manifestPath = join(packageRoot, 'package-manifest.json');
const workbookPath = join(packageRoot, 'content.xlsx');
const sha256 = (bytes: Buffer) =>
  createHash('sha256').update(bytes).digest('hex');
const rows = (workbook: XLSX.WorkBook, sheet: string) => {
  const worksheet = workbook.Sheets[sheet];
  if (!worksheet) throw new Error(`MISSING_SHEET:${sheet}`);
  return XLSX.utils.sheet_to_json(worksheet, {
    defval: '',
  }) as unknown as Record<string, unknown>[];
};

interface CanonicalManifest {
  chapter: string;
  content_counts: Record<string, number>;
  media: readonly {
    alt_text: string;
    owner_code: string;
    package_path: string;
    semantic_role: string;
    sha256: string;
    source_path: string;
  }[];
  source: { sha256: string };
  unresolved_errors: number;
  unresolved_warnings: number;
  workbook_sha256: string;
}

describe('Chapter 3 canonical package', () => {
  it('pins exact content counts, source digest and media hashes', () => {
    const manifest = JSON.parse(
      readFileSync(manifestPath, 'utf8'),
    ) as unknown as CanonicalManifest;
    const workbookBytes = readFileSync(workbookPath);
    const workbook = XLSX.read(workbookBytes, { cellFormula: true });

    expect(manifest).toMatchObject({
      chapter: 'chapter-3',
      content_counts: {
        Chapter: 1,
        Course: 1,
        CR: 1,
        LT: 3,
        Media: 8,
        QB: 3,
        Question: 233,
        RC: 8,
        Section: 3,
        Subtopic: 3,
      },
      unresolved_errors: 0,
      unresolved_warnings: 0,
    });
    expect(manifest.workbook_sha256).toBe(sha256(workbookBytes));
    expect(manifest.source.sha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(manifest.media).toHaveLength(8);
    for (const media of manifest.media) {
      const sourceBytes = readFileSync(join(process.cwd(), media.source_path));
      expect(media.alt_text).toMatch(/\S/u);
      expect(media.owner_code).toMatch(/^RC3/u);
      expect(media.package_path).toMatch(/^media\/P3\d{2}\.webp$/u);
      expect(media.semantic_role).toBe('color_critical');
      expect(media.sha256).toBe(sha256(sourceBytes));
    }
    for (const [sheet, expected] of Object.entries(manifest.content_counts)) {
      expect(rows(workbook, sheet), sheet).toHaveLength(expected);
    }
  });

  it('has unique stable codes and valid QB/LT/CR parent routing', () => {
    const workbook = XLSX.readFile(workbookPath, { cellFormula: true });
    const sectionCodes = new Set(
      rows(workbook, 'Section').map((row) => row.stable_code),
    );
    const chapterCodes = new Set(
      rows(workbook, 'Chapter').map((row) => row.stable_code),
    );
    const bankCodes = new Set<string>();
    for (const sheet of ['QB', 'LT']) {
      for (const row of rows(workbook, sheet)) {
        expect(sectionCodes.has(row.section_code), JSON.stringify(row)).toBe(
          true,
        );
        expect(bankCodes.has(String(row.stable_code))).toBe(false);
        bankCodes.add(String(row.stable_code));
      }
    }
    for (const row of rows(workbook, 'CR')) {
      expect(chapterCodes.has(row.chapter_code), JSON.stringify(row)).toBe(
        true,
      );
      expect(bankCodes.has(String(row.stable_code))).toBe(false);
      bankCodes.add(String(row.stable_code));
    }
    const questionCodes = rows(workbook, 'Question').map((row) =>
      String(row.stable_code),
    );
    expect(new Set(questionCodes).size).toBe(questionCodes.length);
    expect(
      rows(workbook, 'Question').every((row) =>
        bankCodes.has(String(row.bank_code)),
      ),
    ).toBe(true);
    expect(
      workbook.SheetNames.some((sheet) => {
        const cells = (workbook.Sheets[sheet] ?? {}) as Record<string, unknown>;
        return Object.entries(cells).some(
          ([address, cell]) =>
            !address.startsWith('!') &&
            typeof cell === 'object' &&
            cell !== null &&
            'f' in cell &&
            typeof (cell as { f?: unknown }).f === 'string',
        );
      }),
    ).toBe(false);
  });

  it('contains no signed URLs, remote media URLs or secret material', () => {
    const source = `${readFileSync(manifestPath, 'utf8')}\n${readFileSync(
      workbookPath,
    ).toString('latin1')}`;
    expect(source).not.toMatch(
      /(?:service_role|supabase[_-]key|x-amz-signature|token=|https?:\/\/[^\s]*\.(?:png|jpe?g|webp))/iu,
    );
  });

  it('materializes as a ZIP with eight declared media files', async () => {
    const manifest = JSON.parse(
      readFileSync(manifestPath, 'utf8'),
    ) as unknown as CanonicalManifest;
    const entries: Record<string, Uint8Array> = {
      'content.xlsx': new Uint8Array(readFileSync(workbookPath)),
    };
    for (const media of manifest.media) {
      entries[media.package_path] = new Uint8Array(
        readFileSync(join(process.cwd(), media.source_path)),
      );
    }
    const bytes = zipSync(entries);
    const exactBuffer = Uint8Array.from(bytes).buffer;
    const file = new File([exactBuffer], 'chapter-3-content-import.zip', {
      type: 'application/zip',
    });
    Object.defineProperty(file, 'arrayBuffer', {
      value: () => Promise.resolve(exactBuffer),
    });
    await expect(inspectContentImportMedia(file)).resolves.toHaveLength(8);
  });
});
