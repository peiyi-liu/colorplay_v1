import { spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const createScript = resolve(repositoryRoot, 'scripts/backup/create-backup.sh');

let root = '';

beforeEach(async () => {
  root = await mkdtemp(resolve(tmpdir(), 'colorplay-backup-test-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function run(command: string, argumentsList: string[], env = {}) {
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

describe('encrypted immutable backup creation', () => {
  it('creates a synthetic encrypted-only upload fixture', async () => {
    const outputRoot = resolve(root, 'output');
    const uploadRoot = resolve(root, 'fake-s3');
    const result = await run('bash', [
      createScript,
      '--fixture',
      'synthetic',
      '--output-root',
      outputRoot,
      '--fake-upload-root',
      uploadRoot,
    ]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('SYNTHETIC_BACKUP_CREATED');
    const uploaded = await readdir(uploadRoot, { recursive: true });
    const files = uploaded.filter((path) => path.includes('.'));
    expect(files.length).toBeGreaterThan(4);
    expect(files.every((path) => path.endsWith('.age'))).toBe(true);
    expect(files.some((path) => path.endsWith('.sql'))).toBe(false);
    expect(files.some((path) => path.endsWith('manifest.json'))).toBe(false);
  });

  it('requires explicit production target, project ref, budget, and recipient', async () => {
    const result = await run('bash', [
      createScript,
      '--environment',
      'production',
      '--project-ref',
      'abcdefghijklmnopqrst',
      '--output-root',
      resolve(root, 'output'),
    ]);

    expect(result.code).toBe(1);
    expect(result.stderr).toBe('BACKUP_REQUIRED_ENV_MISSING\n');
  });

  it('keeps writer operations write-only with fixed prefix and Compliance lock', async () => {
    const source = await readFile(createScript, 'utf8');
    const uploadFunction = source.slice(
      source.indexOf('upload_production_object()'),
      source.indexOf('create_synthetic_fixture()'),
    );

    expect(source).toContain('production/$backup_date/$backup_id/');
    expect(source).toContain('--object-lock-mode COMPLIANCE');
    expect(source).toContain(
      'retention_epoch=$((upload_epoch + 30 * 24 * 60 * 60))',
    );
    expect(source).toContain('B2_CAPACITY_BUDGET_BYTES');
    expect(source).toContain('select id from storage.buckets order by id');
    expect(source).toContain('"s3://$bucket_id"');
    expect(source).not.toContain('"s3://storage"');
    expect(source).not.toContain('AGE_SECRET_KEY');
    expect(uploadFunction).toContain('s3api put-object');
    expect(uploadFunction).not.toMatch(/s3api (?:get|delete)-object/u);
    expect(uploadFunction).not.toMatch(/\bs3 rm\b/u);
  });

  it('formats retention timestamps on both BSD and GNU date implementations', async () => {
    const source = await readFile(createScript, 'utf8');

    expect(source).toContain('format_retention_until_utc()');
    expect(source).toContain('date -u -r "$epoch"');
    expect(source).toContain('date -u --date "@$epoch"');
  });
});

describe('backup verification and workflow boundaries', () => {
  it('freezes promotion when projected capacity exceeds the owner budget', async () => {
    const outputRoot = resolve(root, 'output');
    await run('bash', [
      createScript,
      '--fixture',
      'synthetic',
      '--output-root',
      outputRoot,
      '--fake-upload-root',
      resolve(root, 'fake-s3'),
    ]);
    const metadataPath = resolve(outputRoot, 'verification-metadata.json');
    const metadata = JSON.parse(await readFile(metadataPath, 'utf8')) as Record<
      string,
      unknown
    >;
    metadata.used_bytes = 95;
    metadata.projected_next_backup_bytes = 10;
    metadata.budget_bytes = 100;
    await import('node:fs/promises').then(({ writeFile }) =>
      writeFile(metadataPath, JSON.stringify(metadata)),
    );
    const result = await run(
      process.execPath,
      [
        resolve(repositoryRoot, 'scripts/backup/verify-backup.mjs'),
        '--metadata',
        metadataPath,
        '--encrypted-sample',
        resolve(outputRoot, 'backup-manifest.json.age'),
        '--output',
        resolve(root, 'verification.json'),
        '--evidence-root',
        root,
      ],
      { AGE_IDENTITY_FILE: resolve(outputRoot, 'fixture-recovery-key.txt') },
    );

    expect(result.code).toBe(1);
    expect(result.stderr).toBe('BACKUP_CAPACITY_FREEZE\n');
  });

  it('separates writer and recovery credentials in the daily workflow', async () => {
    const workflow = await readFile('.github/workflows/backup.yml', 'utf8');
    const createJob = workflow.slice(
      workflow.indexOf('  create-backup:'),
      workflow.indexOf('  verify-backup:'),
    );
    const verifyJob = workflow.slice(
      workflow.indexOf('  verify-backup:'),
      workflow.indexOf('  report-failure:'),
    );

    expect(workflow).toContain('schedule:');
    expect(workflow).toContain('concurrency: production-backup');
    expect(createJob).toContain('environment: production-backup');
    expect(createJob).toContain('B2_WRITER_KEY_ID');
    expect(createJob).not.toContain('B2_RECOVERY_APPLICATION_KEY');
    expect(createJob).not.toContain('AGE_IDENTITY');
    expect(verifyJob).toContain('environment: production-recovery');
    expect(verifyJob).toContain('B2_RECOVERY_APPLICATION_KEY');
    expect(verifyJob).toContain('AGE_IDENTITY');
    expect(verifyJob).toContain('s3api head-object');
    expect(verifyJob).toContain('s3api list-objects-v2');
    expect(verifyJob).toContain('ObjectLockMode');
    expect(verifyJob).toContain('ObjectLockRetainUntil');
    expect(workflow).toContain("context: 'backup-freshness'");
    expect(workflow).toContain("title: '[dedupe] Production backup failure'");
  });
});
