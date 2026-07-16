import { chromium } from '@playwright/test';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import process from 'node:process';

import { createEvidenceRun, renderSummary } from './create-run.mjs';
import {
  buildAcceptanceRows,
  derivePhaseOneDecision,
  validatePlaywrightReport,
} from './phase-1-policy.mjs';
import {
  countAcceptanceIds,
  EXPECTED_ACCEPTANCE_COUNT,
} from '../verify/count-acceptance.mjs';

const requiredReports = [
  'reports/install.log',
  'reports/supabase-start.log',
  'db/db-reset.log',
  'db/db-rls.log',
  'reports/lint.log',
  'reports/format-check.log',
  'reports/typecheck.log',
  'reports/coverage.log',
  'reports/build.log',
  'reports/database-types.log',
  'reports/lighthouse-login.json',
  'reports/e2e.log',
  'reports/e2e.json',
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
    '--source-state-verified',
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

async function validateScopedPlaywrightReport(path, minimumPassed) {
  const report = JSON.parse(await readFile(path, 'utf8'));
  try {
    return validatePlaywrightReport(report, minimumPassed);
  } catch {
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
  const fullE2eCounts = await validateScopedPlaywrightReport(
    join(runDirectory, 'reports/e2e.json'),
    30,
  );
  const headedCounts = await validateScopedPlaywrightReport(
    join(runDirectory, 'reports/acceptance-headed.json'),
    1,
  );
  const crossBrowserCounts = await validateScopedPlaywrightReport(
    join(runDirectory, 'reports/acceptance-cross-browser.json'),
    3,
  );

  const browserHealthPaths = await listEvidencePaths(runDirectory, 'network');
  if (browserHealthPaths.length < 6) {
    throw new Error('PHASE_1_BROWSER_HEALTH_REPORTS_MISSING');
  }
  let browserHealthClean = true;
  for (const path of browserHealthPaths) {
    const health = JSON.parse(await readFile(join(runDirectory, path), 'utf8'));
    if (Object.values(health).some((value) => value !== 0)) {
      browserHealthClean = false;
    }
  }
  if (!browserHealthClean) throw new Error('PHASE_1_BROWSER_HEALTH_FAILED');

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
  if (acceptanceIds.length !== EXPECTED_ACCEPTANCE_COUNT) {
    throw new Error('PHASE_1_ACCEPTANCE_COUNT_MISMATCH');
  }

  const commands = await readCommands(argumentsMap.get('--commands-file'));
  const secretScan = await readFile(
    join(runDirectory, 'reports/secret-scan.txt'),
    'utf8',
  );
  const secretsClean =
    /^findings=0$/mu.test(secretScan) &&
    /^scope=current-tree,git-history,dist,phase-1-artifacts,expanded-traces$/mu.test(
      secretScan,
    );
  if (!secretsClean) throw new Error('PHASE_1_SECRET_SCAN_FAILED');

  const [supabaseStartReport, databaseResetReport, databaseReport] =
    await Promise.all([
      readFile(join(runDirectory, 'reports/supabase-start.log'), 'utf8'),
      readFile(join(runDirectory, 'db/db-reset.log'), 'utf8'),
      readFile(join(runDirectory, 'db/db-rls.log'), 'utf8'),
    ]);
  const realStackArtifactsPresent =
    /^status=started$/mu.test(supabaseStartReport) &&
    databaseResetReport.includes('Finished supabase db reset') &&
    databaseReport.includes('Result: PASS') &&
    databaseReport.includes('Tests 12 passed');
  if (!realStackArtifactsPresent) {
    throw new Error('PHASE_1_REAL_STACK_PROOF_MISSING');
  }
  const databaseTypesVerified = commands.some(
    ({ command, exit_code: exitCode }) =>
      command === 'bash tests/contracts/database-types.test.sh' &&
      exitCode === 0,
  );

  const sourceStateMatches =
    argumentsMap.get('--source-state-verified') === 'true';
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

  const acceptance = buildAcceptanceRows({
    acceptanceIds,
    browserHealthPaths,
    criterionProofs: {
      'AC-DOC-002': realStackArtifactsPresent && databaseTypesVerified,
      'AC-ENV-004': secretsClean,
      'AC-SEC-007': secretsClean,
    },
    screenshotPaths,
    tracePaths,
    videoPaths,
  });
  const passCount = acceptance.filter(({ status }) => status === 'PASS').length;
  const phaseOneDecision = derivePhaseOneDecision({
    acceptanceBrowsersPassed:
      headedCounts.passed >= 1 && crossBrowserCounts.passed >= 3,
    browserHealthClean,
    commandsPassed:
      commands.length >= 16 &&
      commands.every(({ exit_code: exitCode }) => exitCode === 0),
    fullE2ePassed: fullE2eCounts.passed >= 30,
    realStackArtifactsPresent,
    requiredEvidencePresent:
      screenshotPaths.length >= 24 &&
      tracePaths.length >= 4 &&
      videoPaths.length >= 4,
    secretsClean,
    sourceStateMatches,
  });
  if (phaseOneDecision !== 'PASS') {
    throw new Error('PHASE_1_SCOPED_CHECK_FAILED');
  }
  const manifest = {
    ...baseline,
    acceptance,
    branch: process.env.GIT_BRANCH_NAME ?? 'NOT CAPTURED',
    phase_1_decision: phaseOneDecision,
    release_decision: 'BLOCKED',
    scope: 'phase-1-foundation-auth-profile',
    status_counts: {
      FAIL: 0,
      'NOT APPLICABLE': 0,
      'NOT VERIFIED': EXPECTED_ACCEPTANCE_COUNT - passCount,
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
