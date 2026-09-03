import type {
  AdminFixtureCleanupManifest,
  CleanupArguments,
  CleanupMode,
  CleanupRuntime,
  CleanupSnapshot,
  DryRunReceipt,
} from './admin-fixture-cleanup-contract.mjs';

export function parseCleanupArguments(
  argumentsList: string[],
): CleanupArguments;
export function validateCleanupEnvironment(
  manifest: AdminFixtureCleanupManifest,
  environment: NodeJS.ProcessEnv,
  mode: CleanupMode,
): CleanupRuntime;
export function createDryRunReceipt(
  manifest: AdminFixtureCleanupManifest,
  snapshot: CleanupSnapshot,
  now?: Date,
): DryRunReceipt;
export function validateDryRunReceipt(
  manifest: AdminFixtureCleanupManifest,
  receipt: unknown,
  now?: Date,
): DryRunReceipt;
