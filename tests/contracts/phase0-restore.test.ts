import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const createScript = resolve(repositoryRoot, 'scripts/backup/create-backup.sh');
const restoreScript = resolve(
  repositoryRoot,
  'scripts/backup/restore-local.sh',
);
const prepareRolesScript = resolve(
  repositoryRoot,
  'scripts/backup/prepare-roles-for-restore.mjs',
);
const createDatabaseInventoryScript = resolve(
  repositoryRoot,
  'scripts/backup/create-database-inventory.mjs',
);
const restoreWorkflow = resolve(
  repositoryRoot,
  '.github/workflows/restore-drill.yml',
);
let root = '';

beforeEach(async () => {
  root = await mkdtemp(resolve(tmpdir(), 'colorplay-restore-test-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function run(
  command: string,
  argumentsList: string[],
  env: Record<string, string> = {},
) {
  return new Promise<{ code: number | null; stderr: string; stdout: string }>(
    (resolveResult, reject) => {
      const child = spawn(command, argumentsList, {
        cwd: repositoryRoot,
        env: { ...process.env, ...env },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.on('data', (chunk: string) => {
        stderr += chunk;
      });
      child.once('error', reject);
      child.once('close', (code) => {
        resolveResult({ code, stderr, stdout });
      });
    },
  );
}

async function createFixture(fixture = 'synthetic') {
  const backupRoot = resolve(root, 'backup');
  const created = await run('bash', [
    createScript,
    '--fixture',
    fixture,
    '--output-root',
    backupRoot,
    '--fake-upload-root',
    resolve(root, 'fake-s3'),
  ]);
  expect(created.code).toBe(0);
  return backupRoot;
}

async function recipientFor(backupRoot: string) {
  const identityPath = resolve(backupRoot, 'fixture-recovery-key.txt');
  const recipientResult = await run('age-keygen', ['-y', identityPath]);
  expect(recipientResult.code).toBe(0);
  return recipientResult.stdout.trim();
}

async function patchManifest(
  backupRoot: string,
  mutate: (manifest: Record<string, unknown>) => void,
) {
  const identityPath = resolve(backupRoot, 'fixture-recovery-key.txt');
  const manifestPath = resolve(backupRoot, 'backup-manifest.json.age');
  const checksumPath = resolve(backupRoot, 'backup-manifest.json.age.sha256');
  const plaintextPath = resolve(root, 'manifest-plaintext.json');

  const decrypted = await run('age', [
    '--decrypt',
    '--identity',
    identityPath,
    '--output',
    plaintextPath,
    manifestPath,
  ]);
  expect(decrypted.code).toBe(0);

  const manifest = JSON.parse(await readFile(plaintextPath, 'utf8')) as Record<
    string,
    unknown
  >;
  mutate(manifest);
  await writeFile(plaintextPath, JSON.stringify(manifest));

  const recipient = await recipientFor(backupRoot);
  const encrypted = await run('age', [
    '--recipient',
    recipient,
    '--output',
    manifestPath,
    plaintextPath,
  ]);
  expect(encrypted.code).toBe(0);

  const checksum = createHash('sha256')
    .update(await readFile(manifestPath))
    .digest('hex');
  await writeFile(checksumPath, `${checksum}  backup-manifest.json.age\n`);
}

async function addEncryptedInventoryFile(backupRoot: string) {
  const recipient = await recipientFor(backupRoot);
  const plaintextPath = resolve(root, 'inventory-plaintext.json');
  await writeFile(plaintextPath, JSON.stringify({ placeholder: true }));
  const encryptedPath = resolve(
    backupRoot,
    'encrypted',
    'database-inventory.json.age',
  );
  const encrypted = await run('age', [
    '--recipient',
    recipient,
    '--output',
    encryptedPath,
    plaintextPath,
  ]);
  expect(encrypted.code).toBe(0);
  const contents = await readFile(encryptedPath);
  return {
    path: 'database-inventory.json.age',
    sha256: createHash('sha256').update(contents).digest('hex'),
    size_bytes: contents.length,
  };
}

function installFakePnpmStackStartProbe() {
  const fakeBin = resolve(root, 'bin');
  const fakePnpm = resolve(fakeBin, 'pnpm');
  return mkdir(fakeBin).then(() =>
    writeFile(
      fakePnpm,
      "#!/usr/bin/env bash\nprintf '%s\\n' 'RESTORE_STACK_START_REACHED' >&2\nexit 86\n",
      { mode: 0o700 },
    ).then(() => ({ PATH: `${fakeBin}:${process.env.PATH ?? ''}` })),
  );
}

describe('isolated Local restore', () => {
  it.each([
    ['https://example.supabase.co'],
    ['abcdefghijklmnopqrst'],
    ['/'],
    [process.env.HOME ?? '/Users/invalid'],
    [repositoryRoot],
  ])('rejects unsafe target %s before touching a backup', async (target) => {
    const result = await run('bash', [
      restoreScript,
      '--target',
      target,
      '--backup-root',
      resolve(root, 'missing'),
    ]);

    expect(result.code).toBe(1);
    expect(result.stderr).toBe('RESTORE_TARGET_MUST_BE_LOCAL\n');
  });

  it('fails checksum before invoking age decryption', async () => {
    const backupRoot = await createFixture();
    await writeFile(
      resolve(backupRoot, 'backup-manifest.json.age.sha256'),
      `${'0'.repeat(64)}  backup-manifest.json.age\n`,
    );
    const marker = resolve(root, 'age-called');
    const result = await run('bash', [
      restoreScript,
      '--target',
      'local',
      '--backup-root',
      backupRoot,
      '--age-marker',
      marker,
    ]);

    expect(result.code).toBe(1);
    expect(result.stderr).toBe('RESTORE_CHECKSUM_MISMATCH\n');
    await expect(readFile(marker)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('uses a unique disposable Supabase workdir and bounded cleanup', async () => {
    const source = await readFile(restoreScript, 'utf8');

    expect(source).toContain('mktemp -d');
    expect(source).toContain('colorplay-restore.XXXXXXXX');
    expect(source).toContain('supabase start --workdir "$restore_workdir"');
    expect(source).toContain(
      'label=com.supabase.cli.project=$restore_project_id',
    );
    expect(source).toContain('docker rm --force "$container"');
    expect(source).toContain(
      'docker network rm "supabase_network_$restore_project_id"',
    );
    expect(source).toContain('supabase_*_"$restore_project_id"');
    expect(source).toContain(
      '[[ "$temporary_root" == "${TMPDIR:-/tmp}/colorplay-restore."* ]]',
    );
    expect(source).not.toContain('docker exec supabase_db_colorplay');
    expect(source).not.toContain('supabase stop --all');
    expect(source).toContain('database-inventory.json');
    expect(source).toContain('create-database-inventory.mjs');
    expect(source).toContain('prepare-roles-for-restore.mjs');
    expect(source).toContain("restore_database='colorplay_restore_target'");
    expect(source).toContain('createdb');
    expect(source).toContain('--template=template0');
    expect(source).toContain('-d "$restore_database"');
    expect(source).toContain('--database "$restore_database"');
    expect(source).toContain('RESTORE_ROLES_FAILED');
    expect(source).toContain('RESTORE_SCHEMA_FAILED');
    expect(source).toContain('RESTORE_DATA_FAILED');
    expect(source).toContain('2>"$temporary_root/roles-restore.log"');
    expect(source).toContain('authorization_probe');
    expect(source).toContain('application_startup');
    expect(source.match(/-U supabase_admin/gu)?.length).toBeGreaterThanOrEqual(
      4,
    );
  });

  it('makes only duplicate CREATE ROLE statements idempotent', async () => {
    const input = resolve(root, 'roles.sql');
    const output = resolve(root, 'prepared-roles.sql');
    await writeFile(
      input,
      'CREATE ROLE anon;\nALTER ROLE anon WITH NOLOGIN;\nGRANT anon TO postgres;\n',
    );
    const result = await run(process.execPath, [
      prepareRolesScript,
      '--input',
      input,
      '--output',
      output,
    ]);

    expect(result).toEqual({
      code: 0,
      stderr: '',
      stdout: 'ROLE_RESTORE_SQL_PREPARED\n',
    });
    const prepared = await readFile(output, 'utf8');
    expect(prepared).toContain('WHEN duplicate_object THEN NULL;');
    expect(prepared).toContain('CREATE ROLE anon;');
    expect(prepared).toContain('ALTER ROLE anon WITH NOLOGIN;');
    expect(prepared).toContain('GRANT anon TO postgres;');
  });

  it('collects restored inventory from the clean database as the Local superuser', async () => {
    const source = await readFile(createDatabaseInventoryScript, 'utf8');

    expect(source).toMatch(/'-U',\s*'supabase_admin',\s*'-d',\s*database,/u);
    expect(source).toContain('colorplay_restore_target');
    expect(source).toContain('custom_roles');
    expect(source).toContain('auth_invariants');
    expect(source).toContain('authorization_sha256');
  });

  it('runs only trusted workflow code before and during recovery-secret use', async () => {
    const workflow = await readFile(restoreWorkflow, 'utf8');
    const jobHeader = workflow.slice(
      workflow.indexOf('  restore-drill:'),
      workflow.indexOf('    steps:'),
    );

    expect(workflow).toContain('ref: ${{ github.sha }}');
    expect(workflow).toContain('RESTORE_WORKFLOW_REF_UNTRUSTED');
    expect(workflow).toContain('Verify decrypted manifest binding');
    expect(workflow).not.toContain('ref: ${{ inputs.source_sha }}');
    expect(jobHeader).not.toContain('AGE_IDENTITY:');
    expect(jobHeader).not.toContain('B2_RECOVERY_KEY_ID:');
    expect(jobHeader).not.toContain('B2_RECOVERY_APPLICATION_KEY:');
  });

  it('rejects a CREATE ROLE statement outside the strict dump shape', async () => {
    const input = resolve(root, 'roles.sql');
    const output = resolve(root, 'prepared-roles.sql');
    await writeFile(input, 'CREATE ROLE anon WITH LOGIN;\n');
    const result = await run(process.execPath, [
      prepareRolesScript,
      '--input',
      input,
      '--output',
      output,
    ]);

    expect(result.code).toBe(1);
    expect(result.stderr).toBe('ROLE_RESTORE_INPUT_INVALID\n');
  });

  it('rejects a backup whose manifest does not match the approved source SHA', async () => {
    const backupRoot = await createFixture();
    const result = await run(
      'bash',
      [restoreScript, '--backup-root', backupRoot],
      { RESTORE_EXPECTED_REPO_SHA: 'b'.repeat(40) },
    );

    expect(result.code).toBe(1);
    expect(result.stderr).toBe('RESTORE_SOURCE_SHA_MISMATCH\n');
    expect(result.stdout).toBe('');
  });

  it('restores the encrypted synthetic set and records a matching RTO report', async () => {
    const backupRoot = await createFixture();
    const result = await run('bash', [
      restoreScript,
      '--backup-root',
      backupRoot,
    ]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('LOCAL_RESTORE_VERIFIED');
    const report = JSON.parse(
      await readFile(resolve(backupRoot, 'restore-report.json'), 'utf8'),
    ) as {
      actual_data_loss_hours: number;
      backup_prefix: string;
      decision: string;
      elapsed_seconds: number;
      application_startup: string;
      authorization_probe: string;
      role_inventory: string;
      migration_first: string;
      migration_last: string;
      repo_sha: string;
      schema_version: number;
      target: string;
    };
    expect(report.schema_version).toBe(1);
    expect(report.decision).toBe('pass');
    expect(report.target).toBe('isolated-local');
    expect(report.backup_prefix).toMatch(/^production\//u);
    expect(report.repo_sha).toBe('a'.repeat(40));
    expect(report.migration_first).toBe('20260713000100');
    expect(report.migration_last).toBe('20260728000100');
    expect(report.actual_data_loss_hours).toBeGreaterThanOrEqual(0);
    expect(report.application_startup).toBe('skipped');
    expect(report.authorization_probe).toBe('skipped');
    expect(report.role_inventory).toBe('skipped');
    expect(typeof report.elapsed_seconds).toBe('number');
    expect(report.elapsed_seconds).toBeGreaterThanOrEqual(0);
    // A cold GitHub runner may need almost two minutes to start the disposable
    // Supabase stack (the prior passing run took 119.838 seconds). This is an
    // integrity drill, not a two-minute RTO requirement; the CI job itself
    // remains bounded at 30 minutes and the product RTO target is eight hours.
  }, 300_000);

  it('accepts an empty Storage inventory before starting the isolated stack', async () => {
    const backupRoot = await createFixture('synthetic-empty-storage');
    const fakeBin = resolve(root, 'bin');
    const fakePnpm = resolve(fakeBin, 'pnpm');
    await mkdir(fakeBin);
    await writeFile(
      fakePnpm,
      "#!/usr/bin/env bash\nprintf '%s\\n' 'RESTORE_STACK_START_REACHED' >&2\nexit 86\n",
      { mode: 0o700 },
    );
    const result = await run(
      'bash',
      [restoreScript, '--backup-root', backupRoot],
      { PATH: `${fakeBin}:${process.env.PATH ?? ''}` },
    );

    expect(result.code).toBe(1);
    expect(result.stderr).toBe('RESTORE_STACK_START_FAILED\n');
    expect(result.stderr).not.toContain('ENOENT');
  });

  it('advances past artifact classification for a production artifact with inventory present', async () => {
    const backupRoot = await createFixture('synthetic');
    const inventoryEntry = await addEncryptedInventoryFile(backupRoot);
    await patchManifest(backupRoot, (manifest) => {
      manifest.artifact_kind = 'production';
      (manifest.dump_files as unknown[]).push(inventoryEntry);
    });
    const env = await installFakePnpmStackStartProbe();

    const result = await run(
      'bash',
      [restoreScript, '--backup-root', backupRoot],
      env,
    );

    expect(result.code).toBe(1);
    expect(result.stderr).toBe('RESTORE_STACK_START_FAILED\n');
  });

  it('rejects a production artifact missing database-inventory.json', async () => {
    const backupRoot = await createFixture('synthetic');
    await patchManifest(backupRoot, (manifest) => {
      manifest.artifact_kind = 'production';
    });

    const result = await run('bash', [
      restoreScript,
      '--backup-root',
      backupRoot,
    ]);

    expect(result.code).toBe(1);
    expect(result.stderr).toBe('RESTORE_DATABASE_INVENTORY_REQUIRED\n');
  });

  it('rejects a backup missing artifact_kind', async () => {
    const backupRoot = await createFixture('synthetic');
    await patchManifest(backupRoot, (manifest) => {
      delete manifest.artifact_kind;
    });

    const result = await run('bash', [
      restoreScript,
      '--backup-root',
      backupRoot,
    ]);

    expect(result.code).toBe(1);
    expect(result.stderr).toBe('RESTORE_ARTIFACT_KIND_INVALID\n');
  });

  it.each([
    ['unknown string value', 'staging'],
    ['numeric value', 7],
    ['empty string', ''],
    ['trailing newline value', 'synthetic_fixture\n'],
    ['trailing whitespace value', 'production '],
  ])(
    'rejects a backup with an invalid artifact_kind (%s)',
    async (_name, value) => {
      const backupRoot = await createFixture('synthetic');
      await patchManifest(backupRoot, (manifest) => {
        manifest.artifact_kind = value;
      });

      const result = await run('bash', [
        restoreScript,
        '--backup-root',
        backupRoot,
      ]);

      expect(result.code).toBe(1);
      expect(result.stderr).toBe('RESTORE_ARTIFACT_KIND_INVALID\n');
    },
  );

  it('rejects a manifest that is not valid JSON without leaking a stack trace', async () => {
    const backupRoot = await createFixture('synthetic');
    const manifestPath = resolve(backupRoot, 'backup-manifest.json.age');
    const checksumPath = resolve(backupRoot, 'backup-manifest.json.age.sha256');
    const malformedPath = resolve(root, 'malformed-manifest.json');
    await writeFile(malformedPath, '{');
    const recipient = await recipientFor(backupRoot);
    const encrypted = await run('age', [
      '--recipient',
      recipient,
      '--output',
      manifestPath,
      malformedPath,
    ]);
    expect(encrypted.code).toBe(0);
    const checksum = createHash('sha256')
      .update(await readFile(manifestPath))
      .digest('hex');
    await writeFile(checksumPath, `${checksum}  backup-manifest.json.age\n`);

    const result = await run('bash', [
      restoreScript,
      '--backup-root',
      backupRoot,
    ]);

    expect(result.code).toBe(1);
    expect(result.stderr).toBe('RESTORE_ARTIFACT_KIND_INVALID\n');
  });

  it('rejects errors without leaking paths, SQL, or credentials for artifact classification failures', async () => {
    const backupRoot = await createFixture('synthetic');
    await patchManifest(backupRoot, (manifest) => {
      manifest.artifact_kind = 'production';
    });

    const result = await run('bash', [
      restoreScript,
      '--backup-root',
      backupRoot,
    ]);

    expect(result.stderr).not.toMatch(
      /select|insert|psql|\/(Users|tmp|private)\//iu,
    );
    expect(result.stdout).toBe('');
  });

  it('uses recovery-only credentials in a protected manual restore workflow', async () => {
    const workflow = await readFile(
      '.github/workflows/restore-drill.yml',
      'utf8',
    );

    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('environment: production-recovery');
    expect(workflow).toContain('B2_RECOVERY_KEY_ID');
    expect(workflow).toContain('B2_RECOVERY_APPLICATION_KEY');
    expect(workflow).toContain('AGE_IDENTITY');
    expect(workflow).not.toContain('B2_WRITER_KEY_ID');
    expect(workflow).not.toContain('B2_WRITER_APPLICATION_KEY');
    expect(workflow).toContain('RESTORE_BACKUP_PREFIX_INVALID');
    expect(workflow).toContain('aws s3 sync');
    expect(workflow).toContain('phase0:restore:local');
    expect(workflow).toContain('RESTORE_EXPECTED_REPO_SHA');
    expect(workflow).toContain('Secret-scan sanitized restore evidence');
    expect(workflow).toContain('production-restore-drill-result');
  });
});
