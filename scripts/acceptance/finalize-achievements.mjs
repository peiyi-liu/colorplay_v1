import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';

import {
  assertEvidenceSafe,
  requireNonEmptyEvidence,
} from './evidence-policy.mjs';

export const ACCEPTANCE_IDS = Object.freeze([
  'AC-ACH-001',
  'AC-ACH-002',
  'AC-ACH-003',
  'AC-ACH-004',
  'AC-ACH-005',
]);

const COMMAND_LABELS = Object.freeze([
  'pnpm format:check',
  'pnpm lint',
  'pnpm typecheck',
  'pnpm test',
  'pnpm build',
  'pnpm test:db',
  'pnpm exec supabase db reset --local',
  'pnpm exec tsx scripts/supabase/seed-auth.ts',
  "bash scripts/test-e2e-local.sh --project=chromium --headed --grep='Achievements phase gate'",
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

const relativeEvidencePath = (root, path) => {
  const output = relative(root, path).split(sep).join('/');
  if (!output || output.startsWith('../') || output.includes('/../')) {
    throw new Error('ACHIEVEMENTS_INVALID_EVIDENCE_PATH');
  }
  return output;
};

const translateEvidenceError = (error) => {
  if (!(error instanceof Error)) return error;
  const messages = {
    EVIDENCE_INVALID_BINARY: 'ACHIEVEMENTS_INVALID_BINARY_EVIDENCE',
    EVIDENCE_INVALID_PATH: 'ACHIEVEMENTS_INVALID_EVIDENCE_PATH',
    EVIDENCE_REQUIRED_MISSING: 'ACHIEVEMENTS_REQUIRED_EVIDENCE_MISSING',
    EVIDENCE_SENSITIVE: 'ACHIEVEMENTS_SENSITIVE_EVIDENCE',
  };
  return new Error(messages[error.message] ?? error.message);
};

const requireAchievementsEvidence = async (paths) => {
  try {
    await requireNonEmptyEvidence(paths);
  } catch (error) {
    throw translateEvidenceError(error);
  }
};

const assertAchievementsEvidenceSafe = async (input) => {
  try {
    await assertEvidenceSafe(input);
  } catch (error) {
    throw translateEvidenceError(error);
  }
};

const parseCommands = async (root) => {
  const rows = (await readFile(join(root, 'reports/commands.tsv'), 'utf8'))
    .trim()
    .split('\n')
    .filter(Boolean);
  if (rows.length !== COMMAND_LABELS.length) {
    throw new Error('ACHIEVEMENTS_REQUIRED_EVIDENCE_MISSING');
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
      throw new Error('ACHIEVEMENTS_COMMAND_REPORT_INVALID');
    }
    const reportPath = resolve(root, report);
    if (dirname(reportPath) !== resolve(root, 'reports')) {
      throw new Error('ACHIEVEMENTS_COMMAND_REPORT_INVALID');
    }
    await requireAchievementsEvidence([reportPath]);
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
    run.phase !== 'achievements' ||
    !/^[0-9a-f]{40}$/u.test(run.git_sha ?? '') ||
    run.dirty_worktree !== false ||
    run.supabase_environment !== 'local' ||
    JSON.stringify(run.acceptance_ids) !== JSON.stringify(ACCEPTANCE_IDS)
  ) {
    throw new Error('ACHIEVEMENTS_INVALID_SOURCE_STATE');
  }
};

const assertBrowserHealth = (health) => {
  if (
    !isPlainObject(health) ||
    health.console_errors !== 0 ||
    health.page_errors !== 0 ||
    health.failed_requests !== 0 ||
    health.server_errors !== 0
  ) {
    throw new Error('ACHIEVEMENTS_BROWSER_HEALTH_FAILED');
  }
};

export async function finalizeAchievements(runDirectory) {
  const root = resolve(runDirectory);
  const run = await readJson(join(root, 'run.json'));
  assertSourceState(run);
  const commands = await parseCommands(root);
  const [screenshots, videos, traces, reports] = await Promise.all(
    ['screenshots', 'videos', 'traces', 'reports'].map((directory) =>
      listFiles(join(root, directory)),
    ),
  );
  const requiredScreenshotNames = ['375x812', '768x1024', '1440x900'];
  if (
    screenshots.length !== 3 ||
    videos.length !== 1 ||
    traces.length !== 1 ||
    !screenshots.every((path) => path.endsWith('.png')) ||
    !videos.every((path) => path.endsWith('.webm')) ||
    !traces.every((path) => path.endsWith('.zip')) ||
    !requiredScreenshotNames.every((name) =>
      screenshots.some((path) => path.includes(name)),
    )
  ) {
    throw new Error('ACHIEVEMENTS_REQUIRED_EVIDENCE_MISSING');
  }
  await requireAchievementsEvidence([
    ...screenshots,
    ...videos,
    ...traces,
    ...reports,
  ]);

  const browserHealth = await readJson(
    join(root, 'reports/browser-health.json'),
  );
  assertBrowserHealth(browserHealth);

  const evidencePaths = [
    join(root, 'run.json'),
    ...screenshots,
    ...videos,
    ...traces,
    ...reports.filter((path) => !path.endsWith('/manifest.json')),
  ];
  await assertAchievementsEvidenceSafe({
    evidencePaths,
    root,
    tracePaths: traces,
  });

  const sortedRelative = (paths) =>
    paths.map((path) => relativeEvidencePath(root, path)).sort();
  const manifest = {
    acceptance_ids: [...ACCEPTANCE_IDS],
    artifacts: {
      reports: sortedRelative(reports),
      screenshots: sortedRelative(screenshots),
      traces: sortedRelative(traces),
      videos: sortedRelative(videos),
    },
    browser_health: {
      console_errors: 0,
      failed_requests: 0,
      page_errors: 0,
    },
    commands,
    decision: 'PASS',
    dirty_worktree: false,
    git_sha: run.git_sha,
    phase: 'achievements',
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
    process.stderr.write('ACHIEVEMENTS_FINALIZER_ARGUMENT_REQUIRED\n');
    process.exitCode = 1;
  } else {
    try {
      await finalizeAchievements(runDirectory);
    } catch (error) {
      process.stderr.write(
        `${error instanceof Error ? error.message : 'ACHIEVEMENTS_FINALIZER_FAILED'}\n`,
      );
      process.exitCode = 1;
    }
  }
}
