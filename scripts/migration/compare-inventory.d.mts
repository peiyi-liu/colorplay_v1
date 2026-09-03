export type MigrationDriftClass =
  | 'semantic_equivalent_version_filename'
  | 'hosted_only_untracked'
  | 'repo_only_unapplied'
  | 'supabase_managed_schema_extension_difference';

export type MigrationComparison = Readonly<{
  schema_version: 1;
  decision: 'pass' | 'blocked';
  drift: readonly Readonly<{ class: MigrationDriftClass }>[];
  inventory_disposition: Readonly<{
    aggregate_table_keys_match: true;
    aggregate_counts_equal: boolean;
    repo_total_rows: number;
    target_total_rows: number;
    auth_user_count: Readonly<{ repo: number; target: number }>;
    storage: Readonly<{
      repo_bucket_count: number;
      repo_object_count: number;
      repo_total_bytes: number;
      target_bucket_count: number;
      target_object_count: number;
      target_total_bytes: number;
    }>;
  }>;
}>;
