export type ClassroomLeaderboardCommand = Readonly<{
  label: string;
  started_at: string;
  duration_ms: number;
  report: string;
  exit_code: 0;
}>;

export type ClassroomLeaderboardManifest = Readonly<{
  schema_version: 1;
  phase: 'classroom-leaderboard-v2';
  git_sha: string;
  dirty_worktree: false;
  supabase_environment: 'local';
  acceptance_ids: readonly string[];
  commands: readonly ClassroomLeaderboardCommand[];
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
      status: 400 | 403;
      url_pattern: string;
    }>[];
    page_errors: 0;
    failed_requests: 0;
    server_errors: 0;
  }>;
  decision: 'PASS';
}>;

export const ACCEPTANCE_IDS: readonly string[];
export function finalizeClassroomLeaderboard(
  runDirectory: string,
): Promise<ClassroomLeaderboardManifest>;
