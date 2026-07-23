type PlaywrightReport = Readonly<{
  suites?: readonly PlaywrightSuite[];
}>;

type PlaywrightSuite = Readonly<{
  specs?: readonly Readonly<{
    tests?: readonly Readonly<{ status?: string }>[];
  }>[];
  suites?: readonly PlaywrightSuite[];
}>;

type PlaywrightCounts = Readonly<{
  failed: number;
  passed: number;
  skipped: number;
}>;

type PhaseChecks = Readonly<
  Partial<
    Record<
      | 'acceptanceBrowsersPassed'
      | 'browserHealthClean'
      | 'commandsPassed'
      | 'fullE2ePassed'
      | 'realStackArtifactsPresent'
      | 'requiredEvidencePresent'
      | 'secretsClean'
      | 'sourceStateMatches',
      boolean
    >
  >
>;

type AcceptanceRow = Readonly<{
  automated_test: string | null;
  db_network_proof: readonly string[];
  evidence_files: readonly string[];
  id: string;
  notes: string;
  screenshots: readonly string[];
  status: 'PASS' | 'NOT VERIFIED';
  traces_videos: readonly string[];
}>;

export function countPlaywrightResults(
  report: PlaywrightReport,
): PlaywrightCounts;
export function validatePlaywrightReport(
  report: PlaywrightReport,
  minimumPassed: number,
): PlaywrightCounts;
export function derivePhaseOneDecision(
  checks: PhaseChecks | Readonly<Record<string, boolean>>,
): 'PASS' | 'FAIL';
export function buildAcceptanceRows(
  options: Readonly<{
    acceptanceIds: readonly string[];
    browserHealthPaths?: readonly string[];
    criterionProofs: Readonly<Record<string, boolean>>;
    screenshotPaths: readonly string[];
    tracePaths?: readonly string[];
    videoPaths?: readonly string[];
  }>,
): AcceptanceRow[];
