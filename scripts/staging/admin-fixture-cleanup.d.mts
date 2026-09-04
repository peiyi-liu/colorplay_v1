import type {
  AdminFixtureCleanupManifest,
  CleanupMode,
  DatabaseSnapshot,
  DryRunReceipt,
} from './admin-fixture-cleanup-contract.mjs';

export interface CleanupPorts {
  auth: {
    inspectExact(
      fixtures: AdminFixtureCleanupManifest['auth_users'],
      runId: string,
    ): Promise<number>;
    deleteExact(ids: string[]): Promise<void>;
  };
  database: {
    executeExact(
      manifest: AdminFixtureCleanupManifest,
    ): Promise<DatabaseSnapshot>;
    runReadOnly(
      sql: string,
      mode: Exclude<CleanupMode, 'execute'>,
    ): Promise<DatabaseSnapshot>;
  };
}

export type CleanupWorkflowResult =
  | { outcome: 'dry_run_complete'; receipt: DryRunReceipt }
  | { outcome: 'cleanup_verified' };

export function runCleanupWorkflow(input: {
  confirmation?: string | null;
  manifest: AdminFixtureCleanupManifest;
  mode: CleanupMode;
  now?: Date;
  ports: CleanupPorts;
  receipt?: DryRunReceipt | null;
}): Promise<CleanupWorkflowResult>;
