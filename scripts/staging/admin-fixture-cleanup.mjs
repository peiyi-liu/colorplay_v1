#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { createClient } from '@supabase/supabase-js';

import {
  buildDatabaseSql,
  buildCleanupRpcArguments,
  validateAuthFixtureMetadata,
  validateCleanupManifest,
  validateCleanupSnapshot,
} from './admin-fixture-cleanup-contract.mjs';
import {
  createDryRunReceipt,
  parseCleanupArguments,
  validateCleanupEnvironment,
  validateDryRunReceipt,
} from './admin-fixture-cleanup-runtime-contract.mjs';

const POSTGRES_IMAGE = 'public.ecr.aws/supabase/postgres:17.6.1.143';

function fail(code) {
  throw new Error(code);
}

function assertDatabaseResidueZero(snapshot) {
  if (Object.values(snapshot.database_counts).some((count) => count !== 0)) {
    fail('ADMIN_FIXTURE_CLEANUP_DATABASE_RESIDUE');
  }
}

function snapshotWithAuth(databaseSnapshot, authUsersPresent) {
  return {
    auth_users_present: authUsersPresent,
    database_counts: databaseSnapshot.database_counts,
    migration_head: databaseSnapshot.migration_head,
    migration_ledger_sha256: databaseSnapshot.migration_ledger_sha256,
  };
}

export async function runCleanupWorkflow({
  confirmation = null,
  manifest,
  mode,
  now = new Date(),
  ports,
  receipt = null,
}) {
  const valid = validateCleanupManifest(manifest);
  const authUserIds = valid.auth_users.map(({ id }) => id);

  if (mode === 'dry-run') {
    const databaseSnapshot = await ports.database.runReadOnly(
      buildDatabaseSql(valid, 'dry-run'),
      'dry-run',
    );
    const authUsersPresent = await ports.auth.inspectExact(
      valid.auth_users,
      valid.run_id,
    );
    return {
      outcome: 'dry_run_complete',
      receipt: createDryRunReceipt(
        valid,
        snapshotWithAuth(databaseSnapshot, authUsersPresent),
        now,
      ),
    };
  }

  if (mode === 'execute') {
    validateDryRunReceipt(valid, receipt, now);
    if (
      confirmation !==
      `CLEANUP_ADMIN_FIXTURES:${valid.project_ref}:${valid.run_id}`
    ) {
      fail('ADMIN_FIXTURE_CLEANUP_CONFIRMATION_INVALID');
    }
    await ports.auth.inspectExact(valid.auth_users, valid.run_id);
    const postDatabaseCleanup = await ports.database.executeExact(valid);
    validateCleanupSnapshot(
      snapshotWithAuth(postDatabaseCleanup, 0),
      valid.expected_migration_head,
      valid.expected_migration_ledger_sha256,
    );
    assertDatabaseResidueZero(postDatabaseCleanup);
    await ports.auth.deleteExact(authUserIds);
  } else if (mode !== 'verify') {
    fail('ADMIN_FIXTURE_CLEANUP_MODE_INVALID');
  }

  const databaseSnapshot = await ports.database.runReadOnly(
    buildDatabaseSql(valid, 'verify'),
    'verify',
  );
  const authUsersPresent = await ports.auth.inspectExact(
    valid.auth_users,
    valid.run_id,
  );
  validateCleanupSnapshot(
    snapshotWithAuth(databaseSnapshot, authUsersPresent),
    valid.expected_migration_head,
    valid.expected_migration_ledger_sha256,
  );
  assertDatabaseResidueZero(databaseSnapshot);
  if (authUsersPresent !== 0) fail('ADMIN_FIXTURE_CLEANUP_AUTH_RESIDUE');
  return { outcome: 'cleanup_verified' };
}

function runPsql(sql, database) {
  return new Promise((resolve, reject) => {
    const inheritedDockerEnvironment = Object.fromEntries(
      ['DOCKER_CONFIG', 'DOCKER_CONTEXT', 'DOCKER_HOST', 'HOME', 'PATH']
        .map((key) => [key, process.env[key]])
        .filter((entry) => typeof entry[1] === 'string'),
    );
    const child = spawn(
      'docker',
      [
        'run',
        '--rm',
        '--interactive',
        '--env',
        'PGHOST',
        '--env',
        'PGPORT',
        '--env',
        'PGDATABASE',
        '--env',
        'PGUSER',
        '--env',
        'PGPASSWORD',
        '--env',
        'PGSSLMODE',
        POSTGRES_IMAGE,
        'psql',
        '--no-password',
        '--set=ON_ERROR_STOP=1',
        '--tuples-only',
        '--no-align',
      ],
      {
        env: {
          ...inheritedDockerEnvironment,
          PGDATABASE: database.database,
          PGHOST: database.host,
          PGPASSWORD: database.password,
          PGPORT: database.port,
          PGSSLMODE: 'require',
          PGUSER: database.user,
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );
    let stdout = '';
    let stderrLength = 0;
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderrLength += Buffer.byteLength(chunk);
    });
    child.once('error', () =>
      reject(new Error('ADMIN_FIXTURE_CLEANUP_DATABASE_FAILED')),
    );
    child.once('close', (code) => {
      if (code !== 0) {
        reject(
          new Error(`ADMIN_FIXTURE_CLEANUP_DATABASE_FAILED:${stderrLength}`),
        );
        return;
      }
      const line = stdout
        .split('\n')
        .map((entry) => entry.trim())
        .filter((entry) => entry.startsWith('{'))
        .at(-1);
      if (!line) {
        reject(new Error('ADMIN_FIXTURE_CLEANUP_DATABASE_OUTPUT_INVALID'));
        return;
      }
      try {
        resolve(JSON.parse(line));
      } catch {
        reject(new Error('ADMIN_FIXTURE_CLEANUP_DATABASE_OUTPUT_INVALID'));
      }
    });
    child.stdin.end(sql);
  });
}

function createPorts(runtime) {
  const client = createClient(runtime.supabaseUrl, runtime.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const isMissingUser = (error) => error?.status === 404;
  return {
    auth: {
      async inspectExact(fixtures, runId) {
        let count = 0;
        for (const fixture of fixtures) {
          const result = await client.auth.admin.getUserById(fixture.id);
          if (result.error && !isMissingUser(result.error)) {
            fail('ADMIN_FIXTURE_CLEANUP_AUTH_READ_FAILED');
          }
          if (result.data.user) {
            validateAuthFixtureMetadata(
              fixture,
              runId,
              result.data.user.app_metadata,
            );
            count += 1;
          }
        }
        return count;
      },
      async deleteExact(ids) {
        for (const id of ids) {
          const result = await client.auth.admin.deleteUser(id);
          if (result.error && !isMissingUser(result.error)) {
            fail('ADMIN_FIXTURE_CLEANUP_AUTH_DELETE_FAILED');
          }
        }
      },
    },
    database: {
      async executeExact(manifest) {
        const result = await client.rpc(
          'cleanup_hosted_admin_fixtures',
          buildCleanupRpcArguments(manifest),
        );
        if (result.error || !result.data) {
          fail('ADMIN_FIXTURE_CLEANUP_DATABASE_FAILED');
        }
        return result.data;
      },
      runReadOnly: (sql) => runPsql(sql, runtime.database),
    },
  };
}

async function main() {
  const argumentsValue = parseCleanupArguments(process.argv.slice(2));
  const manifest = validateCleanupManifest(
    JSON.parse(await readFile(argumentsValue.manifestPath, 'utf8')),
  );
  const runtime = validateCleanupEnvironment(
    manifest,
    process.env,
    argumentsValue.mode,
  );
  const receipt =
    argumentsValue.mode === 'execute'
      ? JSON.parse(await readFile(argumentsValue.receiptPath, 'utf8'))
      : null;
  const result = await runCleanupWorkflow({
    confirmation: argumentsValue.confirmation,
    manifest,
    mode: argumentsValue.mode,
    ports: createPorts(runtime),
    receipt,
  });
  if (result.outcome === 'dry_run_complete') {
    await writeFile(
      argumentsValue.receiptPath,
      `${JSON.stringify(result.receipt, null, 2)}\n`,
      { flag: 'wx', mode: 0o600 },
    );
    process.stdout.write('ADMIN_FIXTURE_CLEANUP_DRY_RUN_COMPLETE\n');
  } else {
    process.stdout.write('ADMIN_FIXTURE_CLEANUP_VERIFIED\n');
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    const code =
      error instanceof Error &&
      /^ADMIN_FIXTURE_[A-Z0-9_:]+$/u.test(error.message)
        ? error.message
        : 'ADMIN_FIXTURE_CLEANUP_FAILED';
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  });
}
