import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';

import {
  assertEvidenceSafe,
  requireNonEmptyEvidence,
} from './evidence-policy.mjs';

export const ACCEPTANCE_IDS = Object.freeze([
  'AC-TCH-001',
  'AC-TCH-002',
  'AC-TCH-003',
  'AC-TCH-004',
  'AC-TCH-005',
  'AC-TCH-006',
  'AC-TCH-007',
  'AC-TCH-008',
  'AC-TCH-009',
  'AC-MIG-003',
]);

const COMMAND_LABELS = Object.freeze([
  'pnpm format:check',
  'pnpm lint',
  'pnpm typecheck',
  'pnpm test',
  'pnpm build',
  'pnpm test:db',
  'pnpm exec supabase db reset --local',
  'bash scripts/supabase/wait-for-postgrest.sh',
  'pnpm exec tsx scripts/supabase/seed-auth.ts',
  "bash scripts/test-e2e-local.sh --project=chromium --headed --grep='Teacher Content phase gate'",
]);

const EXPECTED_BROWSER_FAILURES = Object.freeze([
  Object.freeze({
    expected_count: 1,
    observed_count: 1,
    status: 400,
    url_pattern: /\/rest\/v1\/rpc\/upsert_question_draft(?:\?.*)?$/u.source,
  }),
]);

const isPlainObject = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const listFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? listFiles(path) : [path];
    }),
  );
  return nested.flat();
};

const translateEvidenceError = (error) => {
  if (!(error instanceof Error)) return error;
  const messages = {
    EVIDENCE_INVALID_BINARY: 'TEACHER_CONTENT_INVALID_BINARY_EVIDENCE',
    EVIDENCE_INVALID_PATH: 'TEACHER_CONTENT_INVALID_EVIDENCE_PATH',
    EVIDENCE_REQUIRED_MISSING: 'TEACHER_CONTENT_REQUIRED_EVIDENCE_MISSING',
    EVIDENCE_SENSITIVE: 'TEACHER_CONTENT_SENSITIVE_EVIDENCE',
  };
  return new Error(messages[error.message] ?? error.message);
};
const requireEvidence = async (paths) => {
  try {
    await requireNonEmptyEvidence(paths);
  } catch (error) {
    throw translateEvidenceError(error);
  }
};
const assertSafe = async (input) => {
  try {
    await assertEvidenceSafe(input);
  } catch (error) {
    throw translateEvidenceError(error);
  }
};

const relativeEvidencePath = (root, path) => {
  const output = relative(root, path).split(sep).join('/');
  if (!output || output.startsWith('../') || output.includes('/../')) {
    throw new Error('TEACHER_CONTENT_INVALID_EVIDENCE_PATH');
  }
  return output;
};

const parseCommands = async (root) => {
  const rows = (await readFile(join(root, 'reports/commands.tsv'), 'utf8'))
    .trim()
    .split('\n')
    .filter(Boolean);
  if (rows.length !== COMMAND_LABELS.length) {
    throw new Error('TEACHER_CONTENT_REQUIRED_EVIDENCE_MISSING');
  }
  const commands = [];
  for (const [index, row] of rows.entries()) {
    const [label, startedAt, durationSource, report, exitSource, ...extra] =
      row.split('\t');
    const durationMs = Number(durationSource);
    const exitCode = Number(exitSource);
    if (
      extra.length > 0 ||
      label !== COMMAND_LABELS[index] ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(startedAt ?? '') ||
      !Number.isSafeInteger(durationMs) ||
      durationMs < 0 ||
      exitCode !== 0 ||
      !report?.startsWith('reports/')
    ) {
      throw new Error('TEACHER_CONTENT_COMMAND_REPORT_INVALID');
    }
    const reportPath = resolve(root, report);
    if (dirname(reportPath) !== resolve(root, 'reports')) {
      throw new Error('TEACHER_CONTENT_COMMAND_REPORT_INVALID');
    }
    await requireEvidence([reportPath]);
    commands.push({
      duration_ms: durationMs,
      exit_code: 0,
      label,
      report,
      started_at: startedAt,
    });
  }
  return commands;
};

const assertSourceState = (run) => {
  if (
    !isPlainObject(run) ||
    run.phase !== 'teacher-content-v1' ||
    !/^[0-9a-f]{40}$/u.test(run.git_sha ?? '') ||
    run.dirty_worktree !== false ||
    run.supabase_environment !== 'local' ||
    JSON.stringify(run.acceptance_ids) !== JSON.stringify(ACCEPTANCE_IDS)
  ) {
    throw new Error('TEACHER_CONTENT_INVALID_SOURCE_STATE');
  }
};
const assertBrowserHealth = (health) => {
  if (
    !isPlainObject(health) ||
    health.console_errors !== 0 ||
    health.page_errors !== 0 ||
    health.failed_requests !== 0 ||
    health.server_errors !== 0 ||
    JSON.stringify(health.expected_failures) !==
      JSON.stringify(EXPECTED_BROWSER_FAILURES)
  ) {
    throw new Error('TEACHER_CONTENT_BROWSER_HEALTH_FAILED');
  }
};

export async function finalizeTeacherContent(runDirectory) {
  const root = resolve(runDirectory);
  const run = await readJson(join(root, 'run.json'));
  assertSourceState(run);
  const commands = await parseCommands(root);
  const [downloads, screenshots, videos, traces, reports] = await Promise.all(
    ['downloads', 'screenshots', 'videos', 'traces', 'reports'].map(
      (directory) => listFiles(join(root, directory)),
    ),
  );
  const requiredScreenshots = [
    'teacher-dashboard-1440x900.png',
    'import-preview-768x1024.png',
    'content-workspace-375x812.png',
  ];
  if (
    downloads.length !== 1 ||
    !downloads[0]?.endsWith('/colorplay-content-template.xlsx') ||
    screenshots.length !== 3 ||
    videos.length !== 1 ||
    traces.length !== 1 ||
    !requiredScreenshots.every((name) =>
      screenshots.some((path) => path.endsWith(`/${name}`)),
    ) ||
    !videos[0]?.endsWith('.webm') ||
    !traces[0]?.endsWith('.zip')
  ) {
    throw new Error('TEACHER_CONTENT_REQUIRED_EVIDENCE_MISSING');
  }
  await requireEvidence([
    ...downloads,
    ...screenshots,
    ...videos,
    ...traces,
    ...reports,
  ]);
  const browserHealth = await readJson(
    join(root, 'reports/browser-health.json'),
  );
  assertBrowserHealth(browserHealth);
  await assertSafe({
    evidencePaths: [
      join(root, 'run.json'),
      ...downloads,
      ...screenshots,
      ...videos,
      ...traces,
      ...reports,
    ],
    root,
    // The xlsx template is a PK zip archive: scan its textual entries the
    // same way trace archives are scanned instead of as raw bytes.
    tracePaths: [...traces, ...downloads],
  });
  const sortedRelative = (paths) =>
    paths.map((path) => relativeEvidencePath(root, path)).sort();
  const manifest = {
    acceptance_ids: [...ACCEPTANCE_IDS],
    artifacts: {
      downloads: sortedRelative(downloads),
      reports: sortedRelative(reports),
      screenshots: sortedRelative(screenshots),
      traces: sortedRelative(traces),
      videos: sortedRelative(videos),
    },
    browser_health: {
      console_errors: 0,
      expected_failures: [...EXPECTED_BROWSER_FAILURES],
      failed_requests: 0,
      page_errors: 0,
      server_errors: 0,
    },
    commands,
    decision: 'PASS',
    dirty_worktree: false,
    git_sha: run.git_sha,
    phase: 'teacher-content-v1',
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
    process.stderr.write('TEACHER_CONTENT_FINALIZER_ARGUMENT_REQUIRED\n');
    process.exitCode = 1;
  } else {
    try {
      await finalizeTeacherContent(runDirectory);
    } catch (error) {
      process.stderr.write(
        `${
          error instanceof Error
            ? error.message
            : 'TEACHER_CONTENT_FINALIZER_FAILED'
        }\n`,
      );
      process.exitCode = 1;
    }
  }
}
