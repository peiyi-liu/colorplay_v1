export type BackupFileEntry = Readonly<{
  path: string;
  sha256: string;
  size_bytes: number;
}>;

export type BackupManifest = Readonly<{
  schema_version: 1;
  environment: 'production';
  artifact_kind: 'production' | 'synthetic_fixture';
  project_ref: string;
  repo_sha: string;
  migration_first: string;
  migration_last: string;
  created_at_utc: string;
  cli_versions: Readonly<{
    age: string;
    b2: string;
    pg_dump: string;
    supabase: string;
  }>;
  dump_files: readonly BackupFileEntry[];
  storage: Readonly<{
    inventory_sha256: string;
    object_count: number;
    total_bytes: number;
  }>;
  age_recipient_fingerprint: string;
  b2_prefix: string;
  object_lock_expires_at_utc: string;
  lifecycle_policy_version: string;
}>;

export function createBackupManifest(value: unknown): BackupManifest;
