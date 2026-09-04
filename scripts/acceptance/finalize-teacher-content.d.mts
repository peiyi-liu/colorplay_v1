export type TeacherContentCommand = Readonly<{
  label: string;
  started_at: string;
  duration_ms: number;
  report: string;
  exit_code: 0;
}>;

export type TeacherContentManifest = Readonly<{
  schema_version: 1;
  phase: 'teacher-content-retirement-v2';
  git_sha: string;
  dirty_worktree: false;
  supabase_environment: 'local';
  acceptance_ids: readonly string[];
  commands: readonly TeacherContentCommand[];
  artifacts: Readonly<{
    downloads: readonly string[];
    screenshots: readonly string[];
    videos: readonly string[];
    traces: readonly string[];
    reports: readonly string[];
  }>;
  browser_health: Readonly<{
    console_errors: 0;
    expected_failures: readonly never[];
    page_errors: 0;
    failed_requests: 0;
    server_errors: 0;
  }>;
  decision: 'PASS';
}>;

export const ACCEPTANCE_IDS: readonly string[];
export function finalizeTeacherContent(
  runDirectory: string,
): Promise<TeacherContentManifest>;
