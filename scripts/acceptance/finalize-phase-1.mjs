import { chromium } from '@playwright/test';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import process from 'node:process';

import { createEvidenceRun, renderSummary } from './create-run.mjs';
import { countAcceptanceIds } from '../verify/count-acceptance.mjs';

const expectedAcceptanceCount = 84;
const phaseOnePassIds = new Set([
  'AC-ENV-001',
  'AC-ENV-004',
  'AC-AUTH-001',
  'AC-AUTH-004',
  'AC-SEC-007',
  'AC-DOC-001',
  'AC-DOC-002',
  'AC-DOC-003',
]);
const externalStepIds = new Set(['AC-ENV-003', 'AC-SEC-006']);
const checkpointIds = new Set([
  'AC-ENV-002',
  'AC-AUTH-002',
  'AC-AUTH-003',
  'AC-AUTH-005',
  'AC-LEARN-004',
  'AC-SEC-003',
  'AC-UI-001',
  'AC-UI-002',
  'AC-UI-003',
  'AC-UI-004',
  'AC-UI-005',
  'AC-UI-006',
  'AC-UI-007',
  'AC-UI-008',
  'AC-UI-009',
  'AC-UI-010',
  'AC-UI-013',
  'AC-UI-014',
  'AC-UI-015',
  'AC-A11Y-001',
  'AC-A11Y-002',
  'AC-A11Y-004',
  'AC-A11Y-005',
  'AC-PERF-001',
  'AC-COMPAT-001',
  'AC-REL-002',
]);

const requiredReports = [
  'reports/install.log',
  'db/db-rls.log',
  'reports/lint.log',
  'reports/format-check.log',
  'reports/typecheck.log',
  'reports/coverage.log',
  'reports/build.log',
  'reports/database-types.log',
  'reports/lighthouse-login.json',
  'reports/e2e.log',
  'reports/acceptance-headed.json',
  'reports/acceptance-cross-browser.json',
  'reports/secret-scan.txt',
];

function parseArguments(argumentsList) {
  const values = new Map();
  for (let index = 0; index < argumentsList.length; index += 2) {
    const key = argumentsList[index];
    const value = argumentsList[index + 1];
    if (!key?.startsWith('--') || value === undefined || values.has(key)) {
      throw new Error('PHASE_1_INVALID_ARGUMENTS');
    }
    values.set(key, value);
  }
  for (const required of [
    '--app-url',
    '--commands-file',
    '--dirty-worktree',
    '--git-sha',
    '--run-id',
  ]) {
    if (!values.has(required)) throw new Error('PHASE_1_INVALID_ARGUMENTS');
  }
  return values;
}

async function requireFile(path) {
  const details = await stat(path);
  if (!details.isFile() || details.size === 0) {
    throw new Error(`PHASE_1_REQUIRED_ARTIFACT_MISSING:${path}`);
  }
}

function countPlaywrightResults(report) {
  let passed = 0;
  let skipped = 0;
  let failed = 0;
  const visitSuite = (suite) => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        if (test.status === 'expected') passed += 1;
        else if (test.status === 'skipped') skipped += 1;
        else failed += 1;
      }
    }
    for (const nested of suite.suites ?? []) visitSuite(nested);
  };
  for (const suite of report.suites ?? []) visitSuite(suite);
  return { failed, passed, skipped };
}

async function validateScopedPlaywrightReport(path, minimumPassed) {
  const report = JSON.parse(await readFile(path, 'utf8'));
  const counts = countPlaywrightResults(report);
  if (
    counts.failed !== 0 ||
    counts.skipped !== 0 ||
    counts.passed < minimumPassed
  ) {
    throw new Error(`PHASE_1_PLAYWRIGHT_SCOPE_FAILED:${path}`);
  }
}

async function readCommands(path) {
  const text = await readFile(path, 'utf8');
  return text
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [command, startedAt, duration, reportPath, exitCode] =
        line.split('\t');
      if (
        !command ||
        !startedAt ||
        !duration ||
        !reportPath ||
        exitCode !== '0'
      ) {
        throw new Error('PHASE_1_COMMAND_REPORT_INVALID');
      }
      return {
        command,
        duration_ms: Number(duration),
        exit_code: 0,
        report_path: reportPath,
        started_at: startedAt,
      };
    });
}

async function readBrowserVersion() {
  const browser = await chromium.launch({ headless: true });
  try {
    return browser.version();
  } finally {
    await browser.close();
  }
}

function screenshotsFor(id, screenshotPaths) {
  const prefixes = {
    'AC-AUTH-001': ['AC-AUTH-001__'],
    'AC-AUTH-003': ['AC-AUTH-003__'],
    'AC-AUTH-005': ['AC-AUTH-005__'],
    'AC-COMPAT-001': ['AC-COMPAT-001__'],
  }[id];
  if (!prefixes) return [];
  return screenshotPaths.filter((path) =>
    prefixes.some((prefix) => path.split('/').at(-1)?.startsWith(prefix)),
  );
}

function phaseClassification(id) {
  if (phaseOnePassIds.has(id)) return 'Complete in the local Phase 1 gate.';
  if (externalStepIds.has(id)) {
    return 'NOT VERIFIED — external Steps 5–8 require authenticated GitHub, Supabase, and Vercel access.';
  }
  if (id === 'AC-UI-010') {
    return 'NOT VERIFIED — automated Phase 1 viewport checkpoint only; required real-device keyboard evidence is absent.';
  }
  if (id === 'AC-UI-012') {
    return 'NOT VERIFIED — Outside Phase 1 behavior and required real Android Back evidence are absent.';
  }
  if (checkpointIds.has(id)) {
    return 'NOT VERIFIED — Phase 1 checkpoint evidence does not satisfy the full-MVP criterion.';
  }
  return 'NOT VERIFIED — Outside Phase 1; owned by a follow-on MVP plan.';
}

async function listEvidencePaths(runDirectory, directory) {
  const { readdir } = await import('node:fs/promises');
  const root = join(runDirectory, directory);
  const entries = await readdir(root, { withFileTypes: true });
  const paths = await Promise.all(
    entries.map(async (entry) => {
      const absolute = join(root, entry.name);
      if (!entry.isDirectory()) return [relative(runDirectory, absolute)];
      const nested = await listEvidencePaths(
        runDirectory,
        join(directory, entry.name),
      );
      return nested;
    }),
  );
  return paths.flat();
}

async function main() {
  const argumentsMap = parseArguments(process.argv.slice(2));
  const projectRoot = process.cwd();
  const runId = argumentsMap.get('--run-id');
  const outputRoot = join(projectRoot, 'artifacts/acceptance');
  const runDirectory = join(outputRoot, runId);

  for (const report of requiredReports)
    await requireFile(join(runDirectory, report));
  await validateScopedPlaywrightReport(
    join(runDirectory, 'reports/acceptance-headed.json'),
    1,
  );
  await validateScopedPlaywrightReport(
    join(runDirectory, 'reports/acceptance-cross-browser.json'),
    3,
  );

  const browserHealthPaths = await listEvidencePaths(runDirectory, 'network');
  if (browserHealthPaths.length < 6) {
    throw new Error('PHASE_1_BROWSER_HEALTH_REPORTS_MISSING');
  }
  for (const path of browserHealthPaths) {
    const health = JSON.parse(await readFile(join(runDirectory, path), 'utf8'));
    if (Object.values(health).some((value) => value !== 0)) {
      throw new Error('PHASE_1_BROWSER_HEALTH_FAILED');
    }
  }

  const screenshotPaths = await listEvidencePaths(runDirectory, 'screenshots');
  const tracePaths = await listEvidencePaths(runDirectory, 'traces');
  const videoPaths = await listEvidencePaths(runDirectory, 'videos');
  if (
    screenshotPaths.length < 24 ||
    tracePaths.length < 4 ||
    videoPaths.length < 4
  ) {
    throw new Error('PHASE_1_REQUIRED_BROWSER_EVIDENCE_MISSING');
  }

  const acceptanceMarkdown = await readFile(
    join(projectRoot, 'acceptance/ACCEPTANCE_CRITERIA.md'),
    'utf8',
  );
  const acceptanceIds = countAcceptanceIds(acceptanceMarkdown);
  if (acceptanceIds.length !== expectedAcceptanceCount) {
    throw new Error('PHASE_1_ACCEPTANCE_COUNT_MISMATCH');
  }

  const commands = await readCommands(argumentsMap.get('--commands-file'));
  const startedAt = commands[0].started_at;
  const finishedAt = new Date().toISOString();
  const knownFailures = [
    {
      description:
        'Steps 5–8 are blocked by missing interactive authentication and were not attempted.',
      id_or_area: 'External deployment',
      owner: 'Repository owner',
      target: 'Authenticated release session',
      user_impact:
        'No public CI, remote Supabase, Preview, or Production claim exists.',
      workaround:
        'Complete the reviewed external runbook with account-owner credentials.',
    },
    {
      description:
        'Full-MVP criteria outside the Auth/profile foundation remain NOT VERIFIED.',
      id_or_area: 'Full MVP',
      owner: 'Follow-on plans',
      target: 'Later MVP phases',
      user_impact: 'This evidence cannot authorize an MVP release.',
      workaround: 'Implement and verify the owning follow-on plans.',
    },
    {
      description:
        'AC-UI-010 and AC-UI-012 lack required real-device evidence.',
      id_or_area: 'Real devices',
      owner: 'Human acceptance operator',
      target: 'Release-candidate acceptance',
      user_impact: 'Mobile keyboard and Android Back remain NOT VERIFIED.',
      workaround: 'Capture evidence on real iOS or Android hardware.',
    },
  ];

  const { manifest: baseline } = await createEvidenceRun({
    appUrl: argumentsMap.get('--app-url'),
    browser: { name: 'chromium', version: await readBrowserVersion() },
    commands,
    dirtyWorktree: argumentsMap.get('--dirty-worktree') === 'true',
    finishedAt,
    gitSha: argumentsMap.get('--git-sha'),
    knownFailures,
    migrationVersion: '20260714000100',
    outputRoot,
    projectRoot,
    runId,
    seedVersion: 'phase1-local-auth-v1',
    startedAt,
    supabaseEnvironment: 'local',
    viewports: [
      { height: 812, width: 375 },
      { height: 1024, width: 768 },
      { height: 900, width: 1440 },
    ],
  });

  const acceptance = acceptanceIds.map((id) => {
    const passed = phaseOnePassIds.has(id);
    const screenshots = screenshotsFor(id, screenshotPaths);
    return {
      automated_test: passed
        ? id.startsWith('AC-AUTH')
          ? 'tests/acceptance/phase-1.spec.ts'
          : 'scripts/acceptance/run-phase-1.sh'
        : null,
      db_network_proof:
        id === 'AC-AUTH-004' || id === 'AC-DOC-002'
          ? ['db/db-rls.log', 'reports/database-types.log']
          : id === 'AC-AUTH-001'
            ? browserHealthPaths
            : id === 'AC-ENV-004' || id === 'AC-SEC-007'
              ? ['reports/secret-scan.txt']
              : [],
      evidence_files: passed
        ? [...screenshots, ...tracePaths, ...videoPaths]
        : [],
      id,
      notes: phaseClassification(id),
      screenshots,
      status: passed ? 'PASS' : 'NOT VERIFIED',
      traces_videos: id === 'AC-AUTH-001' ? [...tracePaths, ...videoPaths] : [],
    };
  });
  const passCount = acceptance.filter(({ status }) => status === 'PASS').length;
  const manifest = {
    ...baseline,
    acceptance,
    branch: process.env.GIT_BRANCH_NAME ?? 'NOT CAPTURED',
    phase_1_decision: 'PASS',
    release_decision: 'BLOCKED',
    scope: 'phase-1-foundation-auth-profile',
    status_counts: {
      FAIL: 0,
      'NOT APPLICABLE': 0,
      'NOT VERIFIED': expectedAcceptanceCount - passCount,
      PASS: passCount,
    },
  };
  await writeFile(
    join(runDirectory, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
  const evidenceTemplate = await readFile(
    join(projectRoot, 'acceptance/EVIDENCE_TEMPLATE.md'),
    'utf8',
  );
  await writeFile(
    join(runDirectory, 'summary.md'),
    renderSummary(manifest, evidenceTemplate),
    'utf8',
  );
  process.stdout.write(`${runDirectory}\n`);
}

try {
  await main();
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'PHASE_1_FINALIZE_FAILED'}\n`,
  );
  process.exitCode = 1;
}
