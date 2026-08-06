import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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

function run(command: string, argumentsList: string[]) {
  return new Promise<{ code: number | null; stderr: string; stdout: string }>(
    (resolveResult, reject) => {
      const child = spawn(command, argumentsList, {
        cwd: repositoryRoot,
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

async function createFixture() {
  const backupRoot = resolve(root, 'backup');
  const created = await run('bash', [
    createScript,
    '--fixture',
    'synthetic',
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
      'supabase stop --project-id "$restore_project_id" --no-backup',
    );
    expect(source).toContain(
      '[[ "$temporary_root" == "${TMPDIR:-/tmp}/colorplay-restore."* ]]',
    );
    expect(source).not.toContain('docker exec supabase_db_colorplay');
    expect(source).not.toContain('supabase stop --all');
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
    ) as { decision: string; elapsed_seconds: number; target: string };
    expect(report.decision).toBe('pass');
    expect(report.target).toBe('isolated-local');
    expect(typeof report.elapsed_seconds).toBe('number');
    expect(report.elapsed_seconds).toBeGreaterThanOrEqual(0);
  }, 120_000);
});
