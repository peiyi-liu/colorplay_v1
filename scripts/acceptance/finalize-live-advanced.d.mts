export type LiveAdvancedCommand = Readonly<{
  label: string;
  started_at: string;
  duration_ms: number;
  report: string;
  exit_code: 0;
}>;

export type LiveAdvancedManifest = Readonly<{
  schema_version: 1;
  phase: 'live-advanced-v1';
  git_sha: string;
  dirty_worktree: false;
  supabase_environment: 'local';
  acceptance_ids: readonly string[];
  commands: readonly LiveAdvancedCommand[];
  artifacts: Readonly<{
    screenshots: readonly string[];
    videos: readonly string[];
    traces: readonly string[];
    reports: readonly string[];
  }>;
  browser_health: Readonly<{
    console_errors: 0;
    expected_failures: readonly Readonly<{
      expected_count: 1;
      observed_count: 1;
      status: 400;
      url_pattern: string;
    }>[];
    page_errors: 0;
    failed_requests: 0;
    server_errors: 0;
  }>;
  latency_profile: Readonly<Record<string, unknown>>;
  decision: 'PASS';
}>;

export const ACCEPTANCE_IDS: readonly string[];
export function finalizeLiveAdvanced(
  runDirectory: string,
): Promise<LiveAdvancedManifest>;
