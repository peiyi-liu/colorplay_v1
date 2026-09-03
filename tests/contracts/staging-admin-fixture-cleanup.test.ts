import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// This file intentionally keeps manifest, runtime, orchestration, SQL/RPC, and
// output-redaction assertions in one audit surface for the single destructive
// cleanup contract; the production runtime and SQL modules remain separated.

import { describe, expect, it } from 'vitest';

import {
  buildDatabaseSql,
  buildCleanupRpcArguments,
  validateAuthFixtureMetadata,
  validateCleanupManifest,
  validateCleanupSnapshot,
  type AdminFixtureCleanupManifest,
  type CleanupSnapshot,
} from '../../scripts/staging/admin-fixture-cleanup-contract.mjs';
import {
  createDryRunReceipt,
  parseCleanupArguments,
  validateCleanupEnvironment,
  validateDryRunReceipt,
} from '../../scripts/staging/admin-fixture-cleanup-runtime-contract.mjs';
import {
  runCleanupWorkflow,
  type CleanupPorts,
} from '../../scripts/staging/admin-fixture-cleanup.mjs';

const IDS = {
  adminUser: '10000000-0000-4000-8000-000000000001',
  teacherUser: '10000000-0000-4000-8000-000000000002',
  denialUser: '10000000-0000-4000-8000-000000000003',
  principal: '20000000-0000-4000-8000-000000000001',
  denialPrincipal: '20000000-0000-4000-8000-000000000002',
  cleanupOperation: '30000000-0000-4000-8000-000000000001',
  session: '40000000-0000-4000-8000-000000000001',
  invitation: '40000000-0000-4000-8000-000000000002',
  securityOperation: '40000000-0000-4000-8000-000000000003',
  authorization: '40000000-0000-4000-8000-000000000004',
  execution: '40000000-0000-4000-8000-000000000005',
  teacherOperation: '40000000-0000-4000-8000-000000000006',
} as const;

function validManifest(): AdminFixtureCleanupManifest {
  return {
    schema_version: 1,
    environment: 'staging',
    project_ref: 'onkxnkzeixpezetkmocf',
    run_id: 'admin-b-hosted-20260903-01',
    git_sha: '1ee3f063c1d7ec4887685f587eb87b57dcc77e67',
    deployment_id: 'dpl_0123456789abcdefghijklmnopqrstuv',
    expected_migration_head: '20260903000300',
    expected_migration_ledger_sha256: 'a'.repeat(64),
    cleanup_operation_id: IDS.cleanupOperation,
    auth_users: [
      { label: 'phase1-bootstrap-admin', id: IDS.adminUser, role: 'admin' },
      {
        label: 'admin-b-created-teacher',
        id: IDS.teacherUser,
        role: 'teacher',
      },
    ],
    profile_ids: [IDS.adminUser, IDS.teacherUser],
    admin_principals: [
      { auth_user_id: IDS.adminUser, audit_principal_id: IDS.principal },
    ],
    rows: {
      admin_sessions: [IDS.session],
      admin_invitations: [IDS.invitation],
      admin_security_operations: [IDS.securityOperation],
      admin_command_authorizations: [IDS.authorization],
      admin_command_executions: [IDS.execution],
      teacher_account_operations: [IDS.teacherOperation],
    },
  };
}

function cleanSnapshot(manifest = validManifest()): CleanupSnapshot {
  return {
    auth_users_present: 0,
    database_counts: {
      admin_audit_principals: 0,
      admin_invitations: 0,
      admin_security_identities: 0,
      admin_security_operations: 0,
      admin_sessions: 0,
      admin_command_authorizations: 0,
      admin_command_executions: 0,
      profiles: 0,
      teacher_account_operations: 0,
    },
    migration_head: manifest.expected_migration_head,
    migration_ledger_sha256: manifest.expected_migration_ledger_sha256,
  };
}

describe('hosted Admin fixture cleanup manifest', () => {
  it('accepts only a complete exact-ID Staging manifest', () => {
    expect(validateCleanupManifest(validManifest())).toEqual(validManifest());

    const invalid = validManifest();
    invalid.profile_ids = [IDS.adminUser];
    expect(() => validateCleanupManifest(invalid)).toThrow(
      'ADMIN_FIXTURE_MANIFEST_PROFILE_SET_MISMATCH',
    );
  });

  it('allows an exact audit-principal mapping for a non-Admin denial actor', () => {
    const manifest = validManifest();
    manifest.auth_users.push({
      label: 'non-admin-denial-actor',
      id: IDS.denialUser,
      role: 'non_admin_denial',
    });
    manifest.profile_ids.push(IDS.denialUser);
    manifest.admin_principals.push({
      auth_user_id: IDS.denialUser,
      audit_principal_id: IDS.denialPrincipal,
    });

    expect(validateCleanupManifest(manifest)).toEqual(manifest);
  });

  it('binds each Auth UUID to server-owned Staging run metadata', () => {
    const manifest = validManifest();
    const fixture = manifest.auth_users[0];
    if (!fixture) throw new Error('FIXTURE_REQUIRED');
    validateAuthFixtureMetadata(fixture, manifest.run_id, {
      colorplay_fixture_environment: 'staging',
      colorplay_fixture_label: fixture.label,
      colorplay_fixture_run_id: manifest.run_id,
    });
    expect(() => {
      validateAuthFixtureMetadata(fixture, manifest.run_id, {
        colorplay_fixture_environment: 'staging',
        colorplay_fixture_label: 'different-fixture',
        colorplay_fixture_run_id: manifest.run_id,
      });
    }).toThrow('ADMIN_FIXTURE_CLEANUP_AUTH_SCOPE_INVALID');
  });

  it('defaults to dry-run and binds every runtime target to the manifest ref', () => {
    expect(
      parseCleanupArguments([
        '--manifest',
        '/private/tmp/admin-fixtures.json',
        '--receipt',
        '/private/tmp/admin-fixtures.receipt.json',
      ]),
    ).toEqual({
      confirmation: null,
      manifestPath: '/private/tmp/admin-fixtures.json',
      mode: 'dry-run',
      receiptPath: '/private/tmp/admin-fixtures.receipt.json',
    });

    const manifest = validManifest();
    const environment = {
      STAGING_ADMIN_FIXTURE_CLEANUP_EXECUTE: '',
      STAGING_DATABASE_URL:
        'postgresql://fixture-user:fixture-password@db.onkxnkzeixpezetkmocf.supabase.co:5432/postgres',
      STAGING_DEPLOYMENT_ID: manifest.deployment_id,
      STAGING_GIT_SHA: manifest.git_sha,
      STAGING_EXPECTED_PROJECT_REF: manifest.project_ref,
      STAGING_PROJECT_REF: manifest.project_ref,
      STAGING_SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-key',
      STAGING_SUPABASE_URL: `https://${manifest.project_ref}.supabase.co`,
    };
    expect(
      validateCleanupEnvironment(manifest, environment, 'dry-run'),
    ).toEqual({
      database: {
        database: 'postgres',
        host: `db.${manifest.project_ref}.supabase.co`,
        password: 'fixture-password',
        port: '5432',
        user: 'fixture-user',
      },
      projectRef: manifest.project_ref,
      serviceRoleKey: 'synthetic-service-key',
      supabaseUrl: `https://${manifest.project_ref}.supabase.co`,
    });

    expect(() =>
      validateCleanupEnvironment(
        manifest,
        { ...environment, STAGING_GIT_SHA: '0'.repeat(40) },
        'dry-run',
      ),
    ).toThrow('ADMIN_FIXTURE_CLEANUP_TARGET_INVALID');
    expect(() =>
      validateCleanupEnvironment(
        manifest,
        {
          ...environment,
          STAGING_DATABASE_URL: `postgresql://fixture-user:%E0%A4%A@db.${manifest.project_ref}.supabase.co:5432/postgres`,
        },
        'dry-run',
      ),
    ).toThrow('ADMIN_FIXTURE_CLEANUP_TARGET_INVALID');
  });

  it('requires an unexpired receipt for the exact manifest before execute', () => {
    const manifest = validManifest();
    const receipt = createDryRunReceipt(
      manifest,
      {
        auth_users_present: 2,
        database_counts: {
          admin_audit_principals: 1,
          admin_invitations: 1,
          admin_security_identities: 1,
          admin_security_operations: 1,
          admin_sessions: 1,
          admin_command_authorizations: 1,
          admin_command_executions: 1,
          profiles: 2,
          teacher_account_operations: 1,
        },
        migration_head: manifest.expected_migration_head,
        migration_ledger_sha256: manifest.expected_migration_ledger_sha256,
      },
      new Date('2026-09-03T14:00:00.000Z'),
    );
    expect(
      validateDryRunReceipt(
        manifest,
        receipt,
        new Date('2026-09-03T14:10:00.000Z'),
      ),
    ).toEqual(receipt);

    const changed = validManifest();
    changed.run_id = 'admin-b-hosted-20260903-02';
    expect(() =>
      validateDryRunReceipt(
        changed,
        receipt,
        new Date('2026-09-03T14:10:00.000Z'),
      ),
    ).toThrow('ADMIN_FIXTURE_CLEANUP_RECEIPT_INVALID');
    expect(() =>
      validateDryRunReceipt(
        manifest,
        receipt,
        new Date('2026-09-03T14:31:00.000Z'),
      ),
    ).toThrow('ADMIN_FIXTURE_CLEANUP_RECEIPT_EXPIRED');
  });

  it('builds exact-ID read-only SQL with bilateral identity guards', () => {
    const manifest = validManifest();
    const dryRunSql = buildDatabaseSql(manifest, 'dry-run');
    const verifySql = buildDatabaseSql(manifest, 'verify');

    for (const id of [
      ...manifest.auth_users.map(({ id }) => id),
      ...manifest.profile_ids,
      ...Object.values(manifest.rows).flat(),
    ]) {
      expect(dryRunSql).toContain(`'${id}'::uuid`);
    }
    for (const sql of [dryRunSql, verifySql]) {
      expect(sql).not.toMatch(/\b(?:like|ilike)\b/iu);
      expect(sql).not.toContain('@colorplay.test');
      expect(sql).not.toContain('invited_email =');
      expect(sql).toContain('set transaction read only');
      expect(sql).not.toMatch(/\b(?:delete|update|insert)\b/iu);
      expect(sql).toContain(
        'ADMIN_FIXTURE_CLEANUP_IDENTITY_PRINCIPAL_SCOPE_INVALID',
      );
      expect(sql).toContain('ADMIN_FIXTURE_CLEANUP_BOOTSTRAP_STATE_INVALID');
      expect(sql).toContain('migration_ledger_sha256');
    }
    expect(dryRunSql).toContain('rollback;');
    expect(verifySql).toContain('ADMIN_FIXTURE_CLEANUP_SESSION_SCOPE_INVALID');
    expect(() => {
      Reflect.apply(buildDatabaseSql, undefined, [manifest, 'execute']);
    }).toThrow('ADMIN_FIXTURE_CLEANUP_MODE_INVALID');
  });

  it('maps every exact manifest identifier into the cleanup RPC arguments', () => {
    const manifest = validManifest();
    expect(buildCleanupRpcArguments(manifest)).toEqual({
      p_admin_command_authorization_ids:
        manifest.rows.admin_command_authorizations,
      p_admin_command_execution_ids: manifest.rows.admin_command_executions,
      p_admin_invitation_ids: manifest.rows.admin_invitations,
      p_admin_principal_auth_user_ids: manifest.admin_principals.map(
        ({ auth_user_id }) => auth_user_id,
      ),
      p_admin_principal_ids: manifest.admin_principals.map(
        ({ audit_principal_id }) => audit_principal_id,
      ),
      p_admin_security_operation_ids: manifest.rows.admin_security_operations,
      p_admin_session_ids: manifest.rows.admin_sessions,
      p_auth_user_ids: manifest.auth_users.map(({ id }) => id),
      p_auth_user_labels: manifest.auth_users.map(({ label }) => label),
      p_cleanup_operation_id: manifest.cleanup_operation_id,
      p_expected_migration_head: manifest.expected_migration_head,
      p_expected_migration_ledger_sha256:
        manifest.expected_migration_ledger_sha256,
      p_profile_ids: manifest.profile_ids,
      p_project_ref: manifest.project_ref,
      p_run_id: manifest.run_id,
      p_teacher_account_operation_ids: manifest.rows.teacher_account_operations,
    });
  });

  it('defines a transactional service-role-only exact-ID cleanup RPC', () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        'supabase/migrations/20260903000400_admin_fixture_cleanup_rpc.sql',
      ),
      'utf8',
    );
    expect(migration).toContain(
      'create function public.cleanup_hosted_admin_fixtures(',
    );
    expect(migration).toContain('security definer');
    expect(migration).toContain("auth.role() <> 'service_role'");
    expect(migration).toContain(
      'ADMIN_FIXTURE_CLEANUP_IDENTITY_PRINCIPAL_SCOPE_INVALID',
    );
    expect(migration).toContain(
      'ADMIN_FIXTURE_CLEANUP_BOOTSTRAP_STATE_INVALID',
    );
    expect(migration).toContain('p_expected_migration_ledger_sha256');
    expect(migration).toContain("'cleanup_hosted_admin_fixture_database'");
    expect(migration).toContain("'database_cleanup_complete'");
    expect(migration).toContain(
      'revoke all on function public.cleanup_hosted_admin_fixtures(',
    );
    expect(migration).toContain('to service_role;');
  });

  it('dry-runs first, then executes and verifies only the listed Auth UUIDs', async () => {
    const manifest = validManifest();
    const dirtySnapshot = cleanSnapshot(manifest);
    dirtySnapshot.auth_users_present = manifest.auth_users.length;
    dirtySnapshot.database_counts.profiles = manifest.profile_ids.length;
    const deletedIds: string[] = [];
    const databaseModes: string[] = [];
    const calls: string[] = [];
    const ports: CleanupPorts = {
      auth: {
        inspectExact: () => {
          calls.push('auth-inspect');
          return Promise.resolve(dirtySnapshot.auth_users_present);
        },
        deleteExact: (ids) => {
          calls.push('auth-delete');
          deletedIds.push(...ids);
          return Promise.resolve();
        },
      },
      database: {
        executeExact: () => {
          calls.push('database-execute-rpc');
          databaseModes.push('execute');
          return Promise.resolve(cleanSnapshot(manifest));
        },
        runReadOnly: (_sql, mode) => {
          calls.push(`database-${mode}`);
          databaseModes.push(mode);
          return Promise.resolve(
            mode === 'dry-run' ? dirtySnapshot : cleanSnapshot(manifest),
          );
        },
      },
    };

    const dryRun = await runCleanupWorkflow({
      manifest,
      mode: 'dry-run',
      now: new Date('2026-09-03T14:00:00.000Z'),
      ports,
    });
    expect(dryRun.outcome).toBe('dry_run_complete');
    expect(deletedIds).toEqual([]);
    if (dryRun.outcome !== 'dry_run_complete') {
      throw new Error('EXPECTED_DRY_RUN_RECEIPT');
    }

    ports.auth.inspectExact = () => {
      calls.push('auth-inspect');
      return Promise.resolve(0);
    };
    const execute = await runCleanupWorkflow({
      confirmation: `CLEANUP_ADMIN_FIXTURES:${manifest.project_ref}:${manifest.run_id}`,
      manifest,
      mode: 'execute',
      now: new Date('2026-09-03T14:10:00.000Z'),
      ports,
      receipt: dryRun.receipt,
    });
    expect(execute).toEqual({ outcome: 'cleanup_verified' });
    expect(deletedIds).toEqual(manifest.auth_users.map(({ id }) => id));
    expect(databaseModes).toEqual(['dry-run', 'execute', 'verify']);
    expect(calls).toEqual([
      'database-dry-run',
      'auth-inspect',
      'auth-inspect',
      'database-execute-rpc',
      'auth-delete',
      'database-verify',
      'auth-inspect',
    ]);
  });

  it('fails closed before Auth deletion when confirmation or DB residue is wrong', async () => {
    const manifest = validManifest();
    const receipt = createDryRunReceipt(
      manifest,
      cleanSnapshot(manifest),
      new Date('2026-09-03T14:00:00.000Z'),
    );
    const calls: string[] = [];
    const ports: CleanupPorts = {
      auth: {
        inspectExact: () => Promise.resolve(0),
        deleteExact: () => {
          calls.push('auth-delete');
          return Promise.resolve();
        },
      },
      database: {
        executeExact: () => {
          calls.push('database');
          const residue = cleanSnapshot(manifest);
          residue.database_counts.teacher_account_operations = 1;
          return Promise.resolve(residue);
        },
        runReadOnly: () => Promise.resolve(cleanSnapshot(manifest)),
      },
    };

    await expect(
      runCleanupWorkflow({
        confirmation: 'wrong',
        manifest,
        mode: 'execute',
        now: new Date('2026-09-03T14:10:00.000Z'),
        ports,
        receipt,
      }),
    ).rejects.toThrow('ADMIN_FIXTURE_CLEANUP_CONFIRMATION_INVALID');
    expect(calls).toEqual([]);

    await expect(
      runCleanupWorkflow({
        confirmation: `CLEANUP_ADMIN_FIXTURES:${manifest.project_ref}:${manifest.run_id}`,
        manifest,
        mode: 'execute',
        now: new Date('2026-09-03T14:10:00.000Z'),
        ports,
        receipt,
      }),
    ).rejects.toThrow('ADMIN_FIXTURE_CLEANUP_DATABASE_RESIDUE');
    expect(calls).toEqual(['database']);
  });

  it('rejects a zero-count verification from the wrong migration head', async () => {
    const manifest = validManifest();
    const snapshot = cleanSnapshot(manifest);
    snapshot.migration_head = '20260903000200';
    const ports: CleanupPorts = {
      auth: {
        inspectExact: () => Promise.resolve(0),
        deleteExact: () => Promise.resolve(),
      },
      database: {
        executeExact: () => Promise.resolve(snapshot),
        runReadOnly: () => Promise.resolve(snapshot),
      },
    };

    await expect(
      runCleanupWorkflow({ manifest, mode: 'verify', ports }),
    ).rejects.toThrow('ADMIN_FIXTURE_CLEANUP_SNAPSHOT_INVALID');
  });

  it.each([
    ['missing older migration', 'b'.repeat(64)],
    ['same-head fork with an extra migration', 'c'.repeat(64)],
  ])('rejects %s despite a matching migration head', (_case, ledgerHash) => {
    const manifest = validManifest();
    const snapshot = cleanSnapshot(manifest);
    snapshot.migration_ledger_sha256 = ledgerHash;
    expect(() =>
      validateCleanupSnapshot(
        snapshot,
        manifest.expected_migration_head,
        manifest.expected_migration_ledger_sha256,
      ),
    ).toThrow('ADMIN_FIXTURE_CLEANUP_SNAPSHOT_INVALID');
  });

  it('prints only a stable code when CLI input is invalid', () => {
    const script = resolve(
      process.cwd(),
      'scripts/staging/admin-fixture-cleanup.mjs',
    );
    const secret = 'must-never-appear-in-output';
    const result = spawnSync(process.execPath, [script], {
      env: {
        ...process.env,
        STAGING_DATABASE_URL: `postgresql://user:${secret}@example.invalid/postgres`,
        STAGING_SUPABASE_SERVICE_ROLE_KEY: secret,
      },
      encoding: 'utf8',
    });
    expect(result.stderr).toBe('ADMIN_FIXTURE_CLEANUP_USAGE\n');
    expect(result.stderr).not.toContain(secret);
  });
});
