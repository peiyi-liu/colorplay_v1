#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import console from 'node:console';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { zipSync } from 'fflate';
import XLSX from 'xlsx';

import { buildCompatibilityWorkbook } from './build-import-package.mjs';
import { buildSheetSnapshot } from './verify-sheet-db.mjs';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const packageDirectory = join(projectRoot, 'content/packages/chapter-3');
const sourceMediaDirectory = join(
  projectRoot,
  'scripts/assets/source/review-card-media/chapter-3',
);
const sourceMediaManifestPath = join(
  sourceMediaDirectory,
  'review-media-manifest.json',
);
const canonicalWorkbookPath = join(packageDirectory, 'content.xlsx');
const canonicalManifestPath = join(packageDirectory, 'package-manifest.json');
const defaultSourcePath = join(
  projectRoot,
  'artifacts/content/question-bank.xlsx',
);
const defaultZipPath = join(
  projectRoot,
  'artifacts/content/chapter-3-content-import.zip',
);
const deterministicMtime = new Date('1980-01-01T00:00:00.000Z');

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

const readOption = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const contentRows = (workbook) =>
  Object.fromEntries(
    workbook.SheetNames.map((sheetName) => [
      sheetName,
      XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' })
        .length,
    ]),
  );

const appliesToChapter3 = (issue) => {
  const scopedCodes = String(issue).match(/\b(?:QB|CR|LT|RC)[1-6]\d{3}\b/gu);
  return scopedCodes === null || scopedCodes.some((code) => code[2] === '3');
};

const mediaEntries = ({ fixes, sourceManifest }) => {
  const sourceByReference = new Map(
    sourceManifest.files.map((file) => [file.reference, file]),
  );
  return Object.entries(fixes.reviewCardMedia ?? {})
    .filter(([ownerCode]) => ownerCode.startsWith('RC3'))
    .flatMap(([ownerCode, raw]) =>
      (Array.isArray(raw) ? raw : [raw]).map((media, index) => {
        const reference = String(media.attachmentRef ?? '').trim();
        const source = sourceByReference.get(reference);
        const sourcePath = join(sourceMediaDirectory, `${reference}.webp`);
        const bytes = readFileSync(sourcePath);
        if (!source || !media.alt?.trim())
          throw new Error(`CHAPTER_3_MEDIA_MAPPING_INVALID:${ownerCode}`);
        return {
          altText: media.alt.trim(),
          bytes,
          height: source.height,
          ownerCode,
          path: `media/${reference}.webp`,
          semanticRole: 'color_critical',
          sha256: sha256(bytes),
          sortOrder: index,
          sourcePath: `scripts/assets/source/review-card-media/chapter-3/${reference}.webp`,
          width: source.width,
        };
      }),
    )
    .sort((left, right) =>
      `${left.ownerCode}:${String(left.sortOrder)}`.localeCompare(
        `${right.ownerCode}:${String(right.sortOrder)}`,
      ),
    );
};

export function buildChapter3CanonicalPackage({ sourcePath, zipPath }) {
  const fixes = JSON.parse(
    readFileSync(
      join(projectRoot, 'scripts/content/import-fixes.json'),
      'utf8',
    ),
  );
  const sourceBytes = readFileSync(sourcePath);
  const snapshot = buildSheetSnapshot({
    fixes,
    workbook: XLSX.read(sourceBytes),
  });
  const blockingErrors = snapshot.errors.filter(appliesToChapter3);
  const blockingWarnings = snapshot.warnings.filter(appliesToChapter3);
  if (blockingErrors.length > 0 || blockingWarnings.length > 0) {
    throw new Error(
      `CHAPTER_3_SOURCE_NOT_READY:errors=${String(blockingErrors.length)}:warnings=${String(blockingWarnings.length)}`,
    );
  }
  const sourceMediaManifest = JSON.parse(
    readFileSync(sourceMediaManifestPath, 'utf8'),
  );
  const media = mediaEntries({ fixes, sourceManifest: sourceMediaManifest });
  const { attachmentWarnings, workbook } = buildCompatibilityWorkbook(
    snapshot,
    '3',
    media,
  );
  const mediaOwners = [
    ...new Set(media.map((entry) => entry.ownerCode)),
  ].sort();
  if (
    JSON.stringify([...attachmentWarnings].sort()) !==
    JSON.stringify(mediaOwners)
  ) {
    throw new Error('CHAPTER_3_MEDIA_ATTACHMENT_COUNT_MISMATCH');
  }
  const workbookBytes = Buffer.from(
    XLSX.write(workbook, {
      bookType: 'xlsx',
      compression: true,
      type: 'buffer',
    }),
  );
  const counts = contentRows(workbook);
  const manifest = {
    chapter: 'chapter-3',
    content_counts: counts,
    format_version: 1,
    media: media.map((entry) => ({
      alt_text: entry.altText,
      bytes: entry.bytes.byteLength,
      height: entry.height,
      owner_code: entry.ownerCode,
      package_path: entry.path,
      semantic_role: entry.semanticRole,
      sha256: entry.sha256,
      sort_order: entry.sortOrder,
      source_path: entry.sourcePath,
      width: entry.width,
    })),
    package_authority: 'content.xlsx',
    source: {
      kind: 'google_sheet_xlsx_export',
      sha256: sha256(sourceBytes),
    },
    unresolved_errors: 0,
    unresolved_warnings: 0,
    workbook_sha256: sha256(workbookBytes),
  };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);

  mkdirSync(packageDirectory, { recursive: true });
  writeFileSync(canonicalWorkbookPath, workbookBytes);
  writeFileSync(canonicalManifestPath, manifestBytes);

  if (zipPath) {
    mkdirSync(dirname(zipPath), { recursive: true });
    const zipEntries = {
      'content.xlsx': [workbookBytes, { mtime: deterministicMtime }],
      'package-manifest.json': [manifestBytes, { mtime: deterministicMtime }],
    };
    for (const entry of media) {
      zipEntries[entry.path] = [entry.bytes, { mtime: deterministicMtime }];
    }
    writeFileSync(zipPath, zipSync(zipEntries, { level: 9 }));
  }
  return { manifest, workbookPath: canonicalWorkbookPath, zipPath };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const sourcePath = resolve(readOption('--source') ?? defaultSourcePath);
  const zipPath = resolve(readOption('--zip') ?? defaultZipPath);
  const result = buildChapter3CanonicalPackage({ sourcePath, zipPath });
  console.log(`Chapter 3 canonical workbook：${result.workbookPath}`);
  console.log(`Chapter 3 upload ZIP：${result.zipPath}`);
  console.log(JSON.stringify(result.manifest.content_counts));
}
