export type EvidenceBrowser = Readonly<{
  name: string;
  version: string;
}>;

export type EvidenceOs = Readonly<{
  name: string;
  version: string;
}>;

export type EvidenceViewport = Readonly<{
  height: number;
  width: number;
}>;

export type EvidenceCommand = Readonly<{
  command: string;
  duration_ms: number;
  exit_code: number;
  report_path: string | null;
  started_at: string;
}>;

export type KnownFailure = Readonly<{
  id_or_area: string;
  description: string;
  user_impact: string;
  workaround: string;
  owner: string;
  target: string;
}>;

export type RealDeviceEvidence = Readonly<{
  android_back_tested: boolean;
  browser: string;
  css_viewport: string;
  device_model: string;
  evidence_files: readonly string[];
  evidence_id: string;
  keyboard_visible: boolean;
  orientation: string;
  os: string;
}>;

export type CreateEvidenceRunOptions = Readonly<{
  acceptancePath?: string;
  appUrl: string;
  browser?: EvidenceBrowser;
  commands?: readonly EvidenceCommand[];
  dirtyWorktree?: boolean;
  evidenceTemplatePath?: string;
  finishedAt?: string;
  gitSha?: string;
  knownFailures?: readonly KnownFailure[];
  migrationVersion?: string | null;
  os?: EvidenceOs;
  outputRoot?: string;
  projectRoot?: string;
  realDevices?: readonly RealDeviceEvidence[];
  runId?: string;
  seedVersion?: string | null;
  startedAt?: string;
  supabaseEnvironment: 'local' | 'staging';
  viewports?: readonly EvidenceViewport[];
}>;

export type AcceptanceEvidenceEntry = Readonly<{
  automated_test: null;
  db_network_proof: readonly string[];
  evidence_files: readonly string[];
  id: string;
  notes: string;
  screenshots: readonly string[];
  status: 'NOT VERIFIED';
  traces_videos: readonly string[];
}>;

export type EvidenceManifest = Readonly<{
  acceptance: readonly AcceptanceEvidenceEntry[];
  app_url: string;
  browser: EvidenceBrowser;
  commands: readonly EvidenceCommand[];
  dirty_worktree: boolean;
  finished_at: string;
  git_sha: string;
  known_failures: readonly KnownFailure[];
  migration_version: string | null;
  os: EvidenceOs;
  real_devices: readonly RealDeviceEvidence[];
  release_decision: 'BLOCKED';
  run_id: string;
  schema_version: 1;
  seed_version: string | null;
  started_at: string;
  status_counts: Readonly<{
    FAIL: 0;
    'NOT APPLICABLE': 0;
    'NOT VERIFIED': number;
    PASS: 0;
  }>;
  supabase_environment: 'local' | 'staging';
  viewports: readonly EvidenceViewport[];
}>;

export function createEvidenceRun(
  options: CreateEvidenceRunOptions,
): Promise<Readonly<{ manifest: EvidenceManifest; runDirectory: string }>>;

export function parseCreateRunArguments(
  argumentsList: readonly string[],
): Promise<CreateEvidenceRunOptions>;
