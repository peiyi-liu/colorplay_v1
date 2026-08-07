export type MigrationDriftClass =
  | 'semantic_equivalent_version_filename'
  | 'hosted_only_untracked'
  | 'repo_only_unapplied'
  | 'supabase_managed_schema_extension_difference';

export type MigrationComparison = Readonly<{
  schema_version: 1;
  decision: 'pass' | 'blocked';
  drift: readonly Readonly<{ class: MigrationDriftClass }>[];
}>;
