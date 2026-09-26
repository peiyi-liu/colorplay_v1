import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';

const EXPECTED_PACKAGE_COUNTS = Object.freeze({
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
});
const EXPECTED_DATABASE_COUNTS = Object.freeze({
  Chapter: 1,
  Course: 1,
  CR: 1,
  CRQuestion: 62,
  LT: 3,
  LTQuestion: 60,
  QB: 3,
  QBQuestion: 111,
  RC: 8,
  Section: 3,
  Subtopic: 3,
});
const COMMAND_LABELS = Object.freeze([
  'prettier scoped',
  'pnpm lint',
  'pnpm typecheck',
  'pnpm build',
  'focused vitest',
  'focused pgtap',
  'chapter 3 readiness sql',
  'content studio browser viewports',
]);

const isRecord = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const exactObject = (actual, expected) =>
  isRecord(actual) &&
  Object.keys(actual).length === Object.keys(expected).length &&
  Object.entries(expected).every(([key, value]) => actual[key] === value);

export function evaluateChapter3Readiness({ database, packageManifest }) {
  if (
    !isRecord(database) ||
    !isRecord(packageManifest) ||
    database.chapter !== 'chapter-3' ||
    database.migration_head !== '20260926000800' ||
    !exactObject(packageManifest.content_counts, EXPECTED_PACKAGE_COUNTS) ||
    !exactObject(database.published_counts, EXPECTED_DATABASE_COUNTS) ||
    packageManifest.unresolved_errors !== 0 ||
    packageManifest.unresolved_warnings !== 0 ||
    !Array.isArray(packageManifest.media) ||
    packageManifest.media.length !== 8 ||
    !isRecord(database.integrity) ||
    Object.values(database.integrity).some((count) => count !== 0)
  ) {
    throw new Error('CONTENT_STUDIO_CH3_READINESS_FAILED');
  }
  return {
    chapter: 'chapter-3',
    current_media_manifest_mappings: database.media?.current_manifest_mappings,
    decision: 'PASS',
    migration_head: database.migration_head,
    package_media_count: packageManifest.media.length,
    published_counts: database.published_counts,
  };
}

const parseCommands = async (root) => {
  const rows = (await readFile(join(root, 'reports/commands.tsv'), 'utf8'))
    .trim()
    .split('\n');
  if (rows.length !== COMMAND_LABELS.length)
    throw new Error('CONTENT_STUDIO_CH3_COMMAND_REPORT_INVALID');
  return rows.map((row, index) => {
    const [label, exitCode, report] = row.split('\t');
    if (
      label !== COMMAND_LABELS[index] ||
      exitCode !== '0' ||
      !report?.startsWith('reports/')
    )
      throw new Error('CONTENT_STUDIO_CH3_COMMAND_REPORT_INVALID');
    return { exit_code: 0, label, report };
  });
};

export async function finalizeContentStudioChapter3(runDirectory) {
  const root = resolve(runDirectory);
  const run = JSON.parse(await readFile(join(root, 'run.json'), 'utf8'));
  if (
    !isRecord(run) ||
    run.phase !== 'content-studio-chapter-3' ||
    !/^[0-9a-f]{40}$/u.test(run.git_sha ?? '') ||
    run.dirty_worktree !== false
  )
    throw new Error('CONTENT_STUDIO_CH3_SOURCE_STATE_INVALID');
  const commands = await parseCommands(root);
  const readinessSource = await readFile(
    join(root, 'reports/readiness.json'),
    'utf8',
  );
  const database = JSON.parse(readinessSource.trim());
  const packageManifest = JSON.parse(
    await readFile(
      join(process.cwd(), 'content/packages/chapter-3/package-manifest.json'),
      'utf8',
    ),
  );
  const readiness = evaluateChapter3Readiness({ database, packageManifest });
  const manifest = {
    acceptance_ids: [
      'AC-TCH-002',
      'AC-TCH-003',
      'AC-TCH-004',
      'AC-TCH-005',
      'AC-TCH-006',
      'AC-TCH-007',
      'AC-TCH-008',
      'AC-PROG-014',
      'AC-PROG-015',
    ],
    boundary: 'Phase 2 Content Studio + Chapter 3 Local slice',
    commands,
    decision: 'PASS',
    dirty_worktree: false,
    git_sha: run.git_sha,
    phase: run.phase,
    readiness,
    schema_version: 1,
    supabase_environment: 'local',
  };
  await writeFile(
    join(root, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return manifest;
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : undefined;
if (invokedPath === import.meta.url) {
  const runDirectory = process.argv[2];
  if (!runDirectory) {
    process.stderr.write('CONTENT_STUDIO_CH3_FINALIZER_ARGUMENT_REQUIRED\n');
    process.exitCode = 1;
  } else {
    try {
      await finalizeContentStudioChapter3(runDirectory);
    } catch (error) {
      process.stderr.write(
        `${error instanceof Error ? error.message : 'CONTENT_STUDIO_CH3_FINALIZER_FAILED'}\n`,
      );
      process.exitCode = 1;
    }
  }
}
