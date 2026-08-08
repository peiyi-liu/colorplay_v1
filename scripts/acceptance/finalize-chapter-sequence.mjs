import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';

import {
  assertEvidenceSafe,
  requireNonEmptyEvidence,
} from './evidence-policy.mjs';

export const ACCEPTANCE_IDS = Object.freeze([
  'AC-SEQUENCE-001',
  'AC-SEQUENCE-002',
  'AC-SEQUENCE-003',
  'AC-SEQUENCE-004',
  'AC-SEQUENCE-005',
]);

const FIXTURE_EMAIL = 'sequence.student@colorplay.test';
const COMMAND_LABELS = Object.freeze([
  'pnpm content:verify-sequential',
  'pnpm exec prettier --check chapter-sequence-v1',
  'pnpm lint',
  'pnpm typecheck',
  'pnpm test',
  'pnpm build',
  'pnpm exec supabase test db --local',
  'pnpm exec supabase db reset --local',
  'bash scripts/supabase/wait-for-postgrest.sh',
  'pnpm exec tsx scripts/supabase/seed-auth.ts',
  'bash scripts/maintenance/reset-sequence-fixture.sh --execute RESET_SEQUENCE_FIXTURE_2026_08',
  'pnpm exec supabase db query --local --file scripts/acceptance/prepare-chapter-sequence-fixture.sql',
  'pnpm exec supabase db query --local activate_course_sequential',
  "bash scripts/test-e2e-local.sh --project=chromium --headed --grep='Chapter 1 to 6 sequence phase gate'",
]);
const REQUIRED_SCREENSHOTS = Object.freeze([
  'map-all-complete-1280x720.png',
  'map-available-1280x720.png',
  'map-completed-1280x720.png',
  'map-locked-1280x720.png',
]);
const VIEWPORTS = Object.freeze([
  Object.freeze({ height: 720, label: 'desktop-landscape', width: 1280 }),
  Object.freeze({ height: 375, label: 'tablet-landscape', width: 812 }),
  Object.freeze({ height: 812, label: 'mobile-portrait', width: 375 }),
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
    EVIDENCE_INVALID_BINARY: 'CHAPTER_SEQUENCE_INVALID_BINARY_EVIDENCE',
    EVIDENCE_INVALID_PATH: 'CHAPTER_SEQUENCE_INVALID_EVIDENCE_PATH',
    EVIDENCE_REQUIRED_MISSING: 'CHAPTER_SEQUENCE_REQUIRED_EVIDENCE_MISSING',
    EVIDENCE_SENSITIVE: 'CHAPTER_SEQUENCE_SENSITIVE_EVIDENCE',
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
    throw new Error('CHAPTER_SEQUENCE_INVALID_EVIDENCE_PATH');
  }
  return output;
};

const parseCommands = async (root) => {
  const rows = (await readFile(join(root, 'reports/commands.tsv'), 'utf8'))
    .trim()
    .split('\n')
    .filter(Boolean);
  if (rows.length !== COMMAND_LABELS.length) {
    throw new Error('CHAPTER_SEQUENCE_REQUIRED_EVIDENCE_MISSING');
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
      throw new Error('CHAPTER_SEQUENCE_COMMAND_REPORT_INVALID');
    }
    const reportPath = resolve(root, report);
    if (dirname(reportPath) !== resolve(root, 'reports')) {
      throw new Error('CHAPTER_SEQUENCE_COMMAND_REPORT_INVALID');
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
    run.phase !== 'chapter-sequence-v1' ||
    !/^[0-9a-f]{40}$/u.test(run.git_sha ?? '') ||
    run.dirty_worktree !== false ||
    run.supabase_environment !== 'local' ||
    run.fixture_email !== FIXTURE_EMAIL ||
    JSON.stringify(run.acceptance_ids) !== JSON.stringify(ACCEPTANCE_IDS)
  ) {
    throw new Error('CHAPTER_SEQUENCE_INVALID_SOURCE_STATE');
  }
};

const assertBrowserHealth = (health) => {
  if (
    !isPlainObject(health) ||
    health.console_errors !== 0 ||
    health.page_errors !== 0 ||
    health.failed_requests !== 0 ||
    health.server_errors !== 0 ||
    JSON.stringify(health.expected_failures) !== '[]'
  ) {
    throw new Error('CHAPTER_SEQUENCE_BROWSER_HEALTH_FAILED');
  }
};

const assertDatabaseGate = async (root) => {
  const report = await readFile(
    join(root, 'reports/database-integration.log'),
    'utf8',
  );
  const summary = report.match(/Files=(\d+), Tests=(\d+)/u);
  const result = report.match(/Result:\s+(\w+)/u);
  if (
    !summary ||
    !result ||
    Number(summary[1]) <= 0 ||
    Number(summary[2]) <= 0 ||
    result[1] !== 'PASS'
  ) {
    throw new Error('CHAPTER_SEQUENCE_DATABASE_GATE_FAILED');
  }
};

const assertSetupReports = async (root) => {
  const [readiness, activation, fixture] = await Promise.all([
    readFile(join(root, 'reports/content-readiness.log'), 'utf8'),
    readFile(join(root, 'reports/sequential-activation.log'), 'utf8'),
    readFile(join(root, 'reports/fixture-mastery.log'), 'utf8'),
  ]);
  if (!readiness.includes('SEQUENTIAL_CONTENT_READY')) {
    throw new Error('CHAPTER_SEQUENCE_CONTENT_NOT_READY');
  }
  if (
    !activation.includes('sequential') ||
    !activation.includes('chapter_count')
  ) {
    throw new Error('CHAPTER_SEQUENCE_ACTIVATION_INVALID');
  }
  if (!/COMMIT/iu.test(fixture)) {
    throw new Error('CHAPTER_SEQUENCE_FIXTURE_INVALID');
  }
};

const assertPhaseState = (state) => {
  if (
    !isPlainObject(state) ||
    state.fixture_email !== FIXTURE_EMAIL ||
    state.progression_mode !== 'sequential' ||
    !Array.isArray(state.completion_checkpoints) ||
    state.completion_checkpoints.length !== 6 ||
    !isPlainObject(state.live_bypass) ||
    !Array.isArray(state.viewport_measurements) ||
    state.viewport_measurements.length !== 3 ||
    state.unavailable_state !== 'not_applicable_after_six_chapter_readiness'
  ) {
    throw new Error('CHAPTER_SEQUENCE_PHASE_STATE_INVALID');
  }

  for (const [index, checkpoint] of state.completion_checkpoints.entries()) {
    if (
      !isPlainObject(checkpoint) ||
      checkpoint.chapter !== index + 1 ||
      checkpoint.current_state !== 'completed' ||
      checkpoint.next_state !== (index < 5 ? 'available' : null) ||
      !Number.isInteger(checkpoint.review_cards_completed) ||
      checkpoint.review_cards_completed < 1
    ) {
      throw new Error('CHAPTER_SEQUENCE_COMPLETION_CHECKPOINT_INVALID');
    }
  }

  if (
    state.live_bypass.answer !== true ||
    state.live_bypass.entry !== true ||
    state.live_bypass.chapter2_locked_before !== true ||
    state.live_bypass.chapter2_locked_after !== true
  ) {
    throw new Error('CHAPTER_SEQUENCE_LIVE_BYPASS_INVALID');
  }

  let sharedInformation;
  for (const [index, measurement] of state.viewport_measurements.entries()) {
    const expected = VIEWPORTS[index];
    if (
      !isPlainObject(measurement) ||
      measurement.label !== expected.label ||
      measurement.width !== expected.width ||
      measurement.height !== expected.height ||
      measurement.viewport_width !== expected.width ||
      measurement.scroll_width > expected.width ||
      measurement.building_min_width < 44 ||
      measurement.building_min_height < 44 ||
      measurement.action_width < 44 ||
      measurement.action_height < 44 ||
      measurement.focus_visible !== true ||
      measurement.locked_cloud_covers_building !== true ||
      measurement.locked_cloud_covers_sign !== false ||
      measurement.reduced_motion_animation_none !== true ||
      !Array.isArray(measurement.information)
    ) {
      throw new Error('CHAPTER_SEQUENCE_VIEWPORT_MEASUREMENT_INVALID');
    }
    const information = JSON.stringify(measurement.information);
    sharedInformation ??= information;
    if (information !== sharedInformation) {
      throw new Error('CHAPTER_SEQUENCE_VIEWPORT_INFORMATION_DRIFT');
    }
  }
};

export async function finalizeChapterSequence(runDirectory) {
  const root = resolve(runDirectory);
  const run = await readJson(join(root, 'run.json'));
  assertSourceState(run);
  const commands = await parseCommands(root);
  const [screenshots, videos, traces, reports] = await Promise.all(
    ['screenshots', 'videos', 'traces', 'reports'].map((directory) =>
      listFiles(join(root, directory)),
    ),
  );
  if (
    screenshots.length !== REQUIRED_SCREENSHOTS.length ||
    videos.length !== 1 ||
    traces.length !== 1 ||
    !REQUIRED_SCREENSHOTS.every((name) =>
      screenshots.some((path) => path.endsWith(`/${name}`)),
    ) ||
    !videos[0]?.endsWith('.webm') ||
    !traces[0]?.endsWith('.zip')
  ) {
    throw new Error('CHAPTER_SEQUENCE_REQUIRED_EVIDENCE_MISSING');
  }
  await requireEvidence([...screenshots, ...videos, ...traces, ...reports]);
  const [browserHealth, phaseState] = await Promise.all([
    readJson(join(root, 'reports/browser-health.json')),
    readJson(join(root, 'reports/phase-state.json')),
  ]);
  assertBrowserHealth(browserHealth);
  assertPhaseState(phaseState);
  await assertDatabaseGate(root);
  await assertSetupReports(root);

  // The exact local-only fixture address is intentionally required above, but
  // it is not copied into the publishable manifest and is excluded from the
  // generic email detector. Every other artifact remains under the standard
  // evidence-policy.mjs scan.
  const safeReports = reports.filter(
    (path) => !path.endsWith('/phase-state.json'),
  );
  await assertSafe({
    evidencePaths: [...screenshots, ...videos, ...traces, ...safeReports],
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
      expected_failures: [],
      failed_requests: 0,
      page_errors: 0,
      server_errors: 0,
    },
    commands,
    completion_checkpoints: 6,
    decision: 'PASS',
    dirty_worktree: false,
    fixture: 'sequenceStudent',
    git_sha: run.git_sha,
    live_bypass: true,
    phase: 'chapter-sequence-v1',
    progression_mode: 'sequential',
    schema_version: 1,
    supabase_environment: 'local',
    viewport_measurements: 3,
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
    process.stderr.write('CHAPTER_SEQUENCE_FINALIZER_ARGUMENT_REQUIRED\n');
    process.exitCode = 1;
  } else {
    try {
      await finalizeChapterSequence(runDirectory);
    } catch (error) {
      process.stderr.write(
        `${
          error instanceof Error
            ? error.message
            : 'CHAPTER_SEQUENCE_FINALIZER_FAILED'
        }\n`,
      );
      process.exitCode = 1;
    }
  }
}
