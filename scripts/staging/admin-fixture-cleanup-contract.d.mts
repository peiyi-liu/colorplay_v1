export type CleanupMode = 'dry-run' | 'execute' | 'verify';
export type FixtureRole = 'admin' | 'teacher' | 'non_admin_denial';

export interface AdminFixtureCleanupManifest {
  schema_version: 1;
  environment: 'staging';
  project_ref: string;
  run_id: string;
  git_sha: string;
  deployment_id: string;
  expected_migration_head: string;
  expected_migration_ledger_sha256: string;
  cleanup_operation_id: string;
  auth_users: Array<{ label: string; id: string; role: FixtureRole }>;
  profile_ids: string[];
  admin_principals: Array<{
    auth_user_id: string;
    audit_principal_id: string;
  }>;
  rows: {
    admin_sessions: string[];
    admin_invitations: string[];
    admin_security_operations: string[];
    admin_command_authorizations: string[];
    admin_command_executions: string[];
    teacher_account_operations: string[];
  };
}

export interface DatabaseCounts {
  admin_audit_principals: number;
  admin_invitations: number;
  admin_security_identities: number;
  admin_security_operations: number;
  admin_sessions: number;
  admin_command_authorizations: number;
  admin_command_executions: number;
  profiles: number;
  teacher_account_operations: number;
}

export interface DatabaseSnapshot {
  database_counts: DatabaseCounts;
  migration_head: string;
  migration_ledger_sha256: string;
}

export interface CleanupSnapshot extends DatabaseSnapshot {
  auth_users_present: number;
}

export interface DryRunReceipt {
  schema_version: 1;
  project_ref: string;
  run_id: string;
  manifest_sha256: string;
  issued_at: string;
  expires_at: string;
  snapshot: CleanupSnapshot;
}

export interface CleanupArguments {
  confirmation: string | null;
  manifestPath: string;
  mode: CleanupMode;
  receiptPath: string | null;
}

export interface CleanupRuntime {
  database: {
    database: string;
    host: string;
    password: string;
    port: string;
    user: string;
  };
  projectRef: string;
  serviceRoleKey: string;
  supabaseUrl: string;
}

export const CLEANUP_ROW_KEYS: readonly (keyof AdminFixtureCleanupManifest['rows'])[];
export function validateCleanupManifest(
  input: unknown,
): AdminFixtureCleanupManifest;
export function manifestSha256(manifest: AdminFixtureCleanupManifest): string;
export function validateAuthFixtureMetadata(
  fixture: AdminFixtureCleanupManifest['auth_users'][number],
  runId: string,
  appMetadata: unknown,
): void;
export function validateCleanupSnapshot(
  snapshot: unknown,
  expectedMigrationHead: string,
  expectedMigrationLedgerSha256: string,
): CleanupSnapshot;
export function buildDatabaseSql(
  manifest: AdminFixtureCleanupManifest,
  mode: Exclude<CleanupMode, 'execute'>,
): string;
export function buildCleanupRpcArguments(
  manifest: AdminFixtureCleanupManifest,
): {
  p_admin_command_authorization_ids: string[];
  p_admin_command_execution_ids: string[];
  p_admin_invitation_ids: string[];
  p_admin_principal_auth_user_ids: string[];
  p_admin_principal_ids: string[];
  p_admin_security_operation_ids: string[];
  p_admin_session_ids: string[];
  p_auth_user_ids: string[];
  p_auth_user_labels: string[];
  p_cleanup_operation_id: string;
  p_expected_migration_head: string;
  p_expected_migration_ledger_sha256: string;
  p_profile_ids: string[];
  p_project_ref: string;
  p_run_id: string;
  p_teacher_account_operation_ids: string[];
};
