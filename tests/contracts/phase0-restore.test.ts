import { spawn } from 'node:child_process';
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
    expect(source).toContain('supabase_*_"$restore_project_id"');
    expect(source).toContain(
      '[[ "$temporary_root" == "${TMPDIR:-/tmp}/colorplay-restore."* ]]',
    );
    expect(source).not.toContain('docker exec supabase_db_colorplay');
    expect(source).not.toContain('supabase stop --all');
    expect(source).toContain('database-inventory.json');
    expect(source).toContain('create-database-inventory.mjs');
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

    expect(result.code).toBe(86);
    expect(result.stderr).toBe('');
    expect(result.stderr).not.toContain('ENOENT');
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
