export type AchievementsCommand = Readonly<{
  label: string;
  started_at: string;
  duration_ms: number;
  report: string;
  exit_code: 0;
}>;

export type AchievementsManifest = Readonly<{
  schema_version: 1;
  phase: 'achievements';
  git_sha: string;
  dirty_worktree: false;
  supabase_environment: 'local';
  acceptance_ids: readonly string[];
  commands: readonly AchievementsCommand[];
  artifacts: Readonly<{
    screenshots: readonly string[];
    videos: readonly string[];
    traces: readonly string[];
    reports: readonly string[];
  }>;
  browser_health: Readonly<{
    console_errors: 0;
    page_errors: 0;
    failed_requests: 0;
  }>;
  decision: 'PASS';
}>;

export const ACCEPTANCE_IDS: readonly string[];
export function finalizeAchievements(
  runDirectory: string,
): Promise<AchievementsManifest>;
