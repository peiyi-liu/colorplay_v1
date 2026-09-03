export type MigrationInventory = Readonly<{
  schema_version: 1;
  environment: 'local' | 'staging' | 'production';
  project_ref: string | null;
  frozen_git_sha: string;
  collected_at_utc: string;
  repo_migrations: readonly Readonly<{ filename: string; sha256: string }>[];
  hosted_ledger: readonly Readonly<{ version: string; name: string | null }>[];
  schema_sha256: string;
  generated_types_sha256: string;
  aggregate_counts: Readonly<Record<string, number>>;
  auth_user_count: number;
  storage: readonly Readonly<{
    bucket: string;
    object_count: number;
    total_bytes: number;
  }>[];
  custom_roles: readonly string[];
  extensions: readonly string[];
}>;
