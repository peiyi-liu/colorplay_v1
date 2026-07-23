const requiredPhaseChecks = [
  'acceptanceBrowsersPassed',
  'browserHealthClean',
  'commandsPassed',
  'fullE2ePassed',
  'realStackArtifactsPresent',
  'requiredEvidencePresent',
  'secretsClean',
  'sourceStateMatches',
];

const criterionDefinitions = {
  'AC-ENV-004': {
    automated_test: 'scripts/acceptance/run-phase-1.sh',
    db_network_proof: ['reports/secret-scan.txt'],
    evidence_files: ['reports/secret-scan.txt'],
  },
  'AC-SEC-007': {
    automated_test: 'scripts/acceptance/run-phase-1.sh',
    db_network_proof: ['reports/secret-scan.txt'],
    evidence_files: ['reports/secret-scan.txt'],
  },
  'AC-DOC-002': {
    automated_test: 'tests/contracts/database-types.test.sh',
    db_network_proof: ['db/db-rls.log', 'reports/database-types.log'],
    evidence_files: ['db/db-rls.log', 'reports/database-types.log'],
  },
};

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

export function countPlaywrightResults(report) {
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

export function validatePlaywrightReport(report, minimumPassed) {
  const counts = countPlaywrightResults(report);
  if (
    counts.failed !== 0 ||
    counts.skipped !== 0 ||
    counts.passed < minimumPassed
  ) {
    throw new Error('PHASE_1_PLAYWRIGHT_SCOPE_FAILED');
  }
  return counts;
}

export function derivePhaseOneDecision(checks) {
  return requiredPhaseChecks.every((check) => checks[check] === true)
    ? 'PASS'
    : 'FAIL';
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

function notVerifiedReason(id) {
  const exactReasons = {
    'AC-ENV-001':
      'NOT VERIFIED — the gate installs in an existing worktree; a fresh checkout and node_modules deletion were not proven.',
    'AC-AUTH-001':
      'NOT VERIFIED — login and refresh are checkpoints, but criterion-specific role-appropriate navigation proof is not attached.',
    'AC-AUTH-004':
      'NOT VERIFIED — teacher query and export APIs required for the privilege test do not exist yet.',
    'AC-DOC-001':
      'NOT VERIFIED — Blocking criteria without test or manual evidence entries remain in the manifest.',
    'AC-DOC-003':
      'NOT VERIFIED — an independent reviewer check of the generated manifest and summary is not captured in this local run.',
  };
  if (exactReasons[id]) return exactReasons[id];
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

export function buildAcceptanceRows({
  acceptanceIds,
  criterionProofs,
  screenshotPaths,
}) {
  return acceptanceIds.map((id) => {
    const definition = criterionDefinitions[id];
    const passed = definition !== undefined && criterionProofs[id] === true;
    const screenshots = screenshotsFor(id, screenshotPaths);
    return {
      automated_test: passed ? definition.automated_test : null,
      db_network_proof: passed ? definition.db_network_proof : [],
      evidence_files: passed ? definition.evidence_files : [],
      id,
      notes: passed
        ? 'Complete with direct criterion-specific local evidence.'
        : notVerifiedReason(id),
      screenshots,
      status: passed ? 'PASS' : 'NOT VERIFIED',
      traces_videos: [],
    };
  });
}
