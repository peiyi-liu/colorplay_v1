import { URL } from 'node:url';

import {
  manifestSha256,
  validateCleanupManifest,
  validateCleanupSnapshot,
} from './admin-fixture-cleanup-contract.mjs';

const RECEIPT_TTL_MILLISECONDS = 30 * 60 * 1000;

const isRecord = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function fail(code) {
  throw new Error(code);
}

function requireExactKeys(value, expected, code) {
  if (!isRecord(value)) fail(code);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) fail(code);
}

export function parseCleanupArguments(argumentsList) {
  const parsed = {
    confirmation: null,
    manifestPath: null,
    mode: 'dry-run',
    receiptPath: null,
  };
  let selectedMode = false;
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (['--dry-run', '--execute', '--verify'].includes(argument)) {
      if (selectedMode) fail('ADMIN_FIXTURE_CLEANUP_USAGE');
      parsed.mode = argument.slice(2);
      selectedMode = true;
      continue;
    }
    const key = {
      '--confirmation': 'confirmation',
      '--manifest': 'manifestPath',
      '--receipt': 'receiptPath',
    }[argument];
    const value = argumentsList[index + 1];
    if (!key || typeof value !== 'string' || value.startsWith('--')) {
      fail('ADMIN_FIXTURE_CLEANUP_USAGE');
    }
    if (parsed[key] !== null) fail('ADMIN_FIXTURE_CLEANUP_USAGE');
    parsed[key] = value;
    index += 1;
  }
  if (
    parsed.manifestPath === null ||
    (parsed.mode !== 'verify' && parsed.receiptPath === null) ||
    (parsed.mode === 'execute' && parsed.confirmation === null) ||
    (parsed.mode !== 'execute' && parsed.confirmation !== null)
  ) {
    fail('ADMIN_FIXTURE_CLEANUP_USAGE');
  }
  return parsed;
}

export function validateCleanupEnvironment(manifest, environment, mode) {
  const valid = validateCleanupManifest(manifest);
  const projectRef = valid.project_ref;
  const expectedUrl = `https://${projectRef}.supabase.co`;
  const serviceRoleKey = environment.STAGING_SUPABASE_SERVICE_ROLE_KEY;
  const databaseUrl = environment.STAGING_DATABASE_URL;
  if (
    environment.STAGING_PROJECT_REF !== projectRef ||
    environment.STAGING_EXPECTED_PROJECT_REF !== projectRef ||
    environment.STAGING_GIT_SHA !== valid.git_sha ||
    environment.STAGING_DEPLOYMENT_ID !== valid.deployment_id ||
    environment.STAGING_SUPABASE_URL !== expectedUrl ||
    typeof serviceRoleKey !== 'string' ||
    serviceRoleKey.length === 0 ||
    typeof databaseUrl !== 'string' ||
    databaseUrl.length === 0 ||
    (mode === 'execute' &&
      environment.STAGING_ADMIN_FIXTURE_CLEANUP_EXECUTE !== 'yes')
  ) {
    fail('ADMIN_FIXTURE_CLEANUP_TARGET_INVALID');
  }

  let parsedDatabaseUrl;
  try {
    parsedDatabaseUrl = new URL(databaseUrl);
  } catch {
    fail('ADMIN_FIXTURE_CLEANUP_TARGET_INVALID');
  }
  if (
    !['postgres:', 'postgresql:'].includes(parsedDatabaseUrl.protocol) ||
    parsedDatabaseUrl.hostname !== `db.${projectRef}.supabase.co` ||
    parsedDatabaseUrl.pathname !== '/postgres' ||
    parsedDatabaseUrl.username.length === 0 ||
    parsedDatabaseUrl.password.length === 0 ||
    !['', '5432'].includes(parsedDatabaseUrl.port) ||
    [...parsedDatabaseUrl.searchParams.keys()].some(
      (key) => key !== 'sslmode',
    ) ||
    (parsedDatabaseUrl.searchParams.has('sslmode') &&
      parsedDatabaseUrl.searchParams.get('sslmode') !== 'require')
  ) {
    fail('ADMIN_FIXTURE_CLEANUP_TARGET_INVALID');
  }

  let user;
  let password;
  try {
    user = decodeURIComponent(parsedDatabaseUrl.username);
    password = decodeURIComponent(parsedDatabaseUrl.password);
  } catch {
    fail('ADMIN_FIXTURE_CLEANUP_TARGET_INVALID');
  }

  return {
    database: {
      database: 'postgres',
      host: parsedDatabaseUrl.hostname,
      password,
      port: parsedDatabaseUrl.port || '5432',
      user,
    },
    projectRef,
    serviceRoleKey,
    supabaseUrl: expectedUrl,
  };
}

export function createDryRunReceipt(manifest, snapshot, now = new Date()) {
  const valid = validateCleanupManifest(manifest);
  const safeSnapshot = validateCleanupSnapshot(
    snapshot,
    valid.expected_migration_head,
    valid.expected_migration_ledger_sha256,
  );
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    fail('ADMIN_FIXTURE_CLEANUP_RECEIPT_INVALID');
  }
  return {
    schema_version: 1,
    project_ref: valid.project_ref,
    run_id: valid.run_id,
    manifest_sha256: manifestSha256(valid),
    issued_at: now.toISOString(),
    expires_at: new Date(
      now.getTime() + RECEIPT_TTL_MILLISECONDS,
    ).toISOString(),
    snapshot: safeSnapshot,
  };
}

export function validateDryRunReceipt(manifest, receipt, now = new Date()) {
  const valid = validateCleanupManifest(manifest);
  requireExactKeys(
    receipt,
    [
      'schema_version',
      'project_ref',
      'run_id',
      'manifest_sha256',
      'issued_at',
      'expires_at',
      'snapshot',
    ],
    'ADMIN_FIXTURE_CLEANUP_RECEIPT_INVALID',
  );
  const issuedAt = Date.parse(receipt.issued_at);
  const expiresAt = Date.parse(receipt.expires_at);
  if (
    receipt.schema_version !== 1 ||
    receipt.project_ref !== valid.project_ref ||
    receipt.run_id !== valid.run_id ||
    receipt.manifest_sha256 !== manifestSha256(valid) ||
    !Number.isFinite(issuedAt) ||
    !Number.isFinite(expiresAt) ||
    expiresAt - issuedAt !== RECEIPT_TTL_MILLISECONDS ||
    now.getTime() < issuedAt
  ) {
    fail('ADMIN_FIXTURE_CLEANUP_RECEIPT_INVALID');
  }
  validateCleanupSnapshot(
    receipt.snapshot,
    valid.expected_migration_head,
    valid.expected_migration_ledger_sha256,
  );
  if (now.getTime() >= expiresAt) {
    fail('ADMIN_FIXTURE_CLEANUP_RECEIPT_EXPIRED');
  }
  return receipt;
}
