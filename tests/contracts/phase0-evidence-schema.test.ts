import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const releaseScript = resolve(
  repositoryRoot,
  'scripts/release/release-record.mjs',
);
const backupScript = resolve(
  repositoryRoot,
  'scripts/backup/create-manifest.mjs',
);

interface CommandResult {
  exitCode: number | null;
  stderr: string;
  stdout: string;
}

let temporaryRoot = '';

beforeEach(async () => {
  temporaryRoot = await mkdtemp(resolve(tmpdir(), 'colorplay-evidence-test-'));
});

afterEach(async () => {
  await rm(temporaryRoot, { force: true, recursive: true });
});

function validReleaseRecord() {
  return {
    schema_version: 1,
    attempt_id: 'production-20260806-001',
    git_sha: '8e521b7f4bd9194f0ac23ea531ccf9f20da3d407',
    vercel_deployment_id: 'dpl_1234567890abcdef',
    vercel_deployment_url: 'https://colorplay-candidate.vercel.app',
    production_supabase_ref: 'abcdefghijklmnopqrst',
    migration_first: '20260713000000',
    migration_last: '20260730000000',
    staging_gate_run_url:
      'https://github.com/peiyi-liu/colorplay_v1/actions/runs/1001',
    production_gate_run_url:
      'https://github.com/peiyi-liu/colorplay_v1/actions/runs/1002',
    approval_actor: 'release-owner',
    approval_at_utc: '2026-08-06T03:00:00.000Z',
    post_deploy_smoke: 'passed',
    previous_healthy_deployment_id: 'dpl_abcdef1234567890',
    created_at_utc: '2026-08-06T03:01:00.000Z',
  };
}

function validBackupInput() {
  return {
    schema_version: 1,
    environment: 'production',
    project_ref: 'abcdefghijklmnopqrst',
    repo_sha: '8e521b7f4bd9194f0ac23ea531ccf9f20da3d407',
    migration_first: '20260713000000',
    migration_last: '20260730000000',
    created_at_utc: '2026-08-06T03:05:00.000Z',
    cli_versions: {
      age: '1.3.1',
      b2: '4.4.2',
      pg_dump: '17.5',
      supabase: '2.109.1',
    },
    dump_files: [
      {
        path: 'data.sql.age',
        sha256: 'a'.repeat(64),
        size_bytes: 300,
      },
      {
        path: 'roles.sql.age',
        sha256: 'b'.repeat(64),
        size_bytes: 100,
      },
    ],
    storage_objects: [
      {
        bucket: 'avatars',
        path: 'z/file.png.age',
        sha256: 'c'.repeat(64),
        size_bytes: 50,
      },
      {
        bucket: 'avatars',
        path: 'a/file.png.age',
        sha256: 'd'.repeat(64),
        size_bytes: 25,
      },
    ],
    age_recipient_fingerprint: 'age1syntheticrecipientfingerprint',
    b2_prefix: 'production/2026/08/06/backup-001/',
    object_lock_expires_at_utc: '2026-09-05T03:05:00.000Z',
    lifecycle_policy_version: 'production-30d-v1',
  };
}

async function run(
  script: string,
  argumentsList: string[],
): Promise<CommandResult> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [script, ...argumentsList], {
      cwd: temporaryRoot,
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
    child.once('close', (exitCode) => {
      resolveResult({ exitCode, stderr, stdout });
    });
  });
}

async function createReleaseRecord(input: Record<string, unknown>) {
  const inputPath = resolve(temporaryRoot, 'release-input.json');
  const outputPath = resolve(temporaryRoot, 'release-record.json');
  await writeFile(inputPath, JSON.stringify(input), 'utf8');
  const result = await run(releaseScript, [
    'create',
    '--input',
    inputPath,
    '--output',
    outputPath,
    '--evidence-root',
    temporaryRoot,
  ]);
  return { inputPath, outputPath, result };
}

async function createBackupManifest(input: Record<string, unknown>) {
  const inputPath = resolve(temporaryRoot, 'backup-input.json');
  const outputPath = resolve(temporaryRoot, 'backup-manifest.json');
  await writeFile(inputPath, JSON.stringify(input), 'utf8');
  const result = await run(backupScript, [
    '--input',
    inputPath,
    '--output',
    outputPath,
    '--evidence-root',
    temporaryRoot,
  ]);
  return { outputPath, result };
}

describe('release record evidence', () => {
  it('creates deterministic closed JSON and verifies its checksum', async () => {
    const first = await createReleaseRecord(validReleaseRecord());
    expect(first.result).toEqual({
      exitCode: 0,
      stderr: '',
      stdout: 'RELEASE_RECORD_CREATED\n',
    });
    const firstText = await readFile(first.outputPath, 'utf8');
    const firstChecksum = await readFile(`${first.outputPath}.sha256`, 'utf8');
    expect(firstChecksum).toMatch(
      new RegExp(`^[0-9a-f]{64}  ${basename(first.outputPath)}\\n$`, 'u'),
    );

    const secondOutput = resolve(temporaryRoot, 'release-record-second.json');
    const secondResult = await run(releaseScript, [
      'create',
      '--input',
      first.inputPath,
      '--output',
      secondOutput,
      '--evidence-root',
      temporaryRoot,
    ]);
    expect(secondResult.exitCode).toBe(0);
    expect(await readFile(secondOutput, 'utf8')).toBe(firstText);

    const verifyResult = await run(releaseScript, [
      'verify',
      '--record',
      first.outputPath,
      '--checksum',
      `${first.outputPath}.sha256`,
    ]);
    expect(verifyResult).toEqual({
      exitCode: 0,
      stderr: '',
      stdout: 'RELEASE_RECORD_VERIFIED\n',
    });
  });

  it.each([
    ['extra field', { debug: true }],
    ['Email actor', { approval_actor: 'owner@example.com' }],
    ['non-UTC timestamp', { created_at_utc: '2026-08-06T11:01:00+08:00' }],
    ['malformed SHA', { git_sha: 'not-a-sha' }],
    ['malformed deployment id', { vercel_deployment_id: 'deployment-1' }],
    ['malformed project ref', { production_supabase_ref: 'wrong-ref' }],
    ['missing previous deployment', { previous_healthy_deployment_id: '' }],
    [
      'credential-bearing URL',
      { vercel_deployment_url: 'https://user:pass@example.com' },
    ],
    [
      'URL query',
      { staging_gate_run_url: 'https://example.com/run?token=synthetic' },
    ],
    ['URL hash', { production_gate_run_url: 'https://example.com/run#secret' }],
  ])('rejects %s', async (_name, mutation) => {
    const result = await createReleaseRecord({
      ...validReleaseRecord(),
      ...mutation,
    });

    expect(result.result.exitCode).toBe(1);
    expect(result.result.stdout).toBe('');
    expect(result.result.stderr).toBe('RELEASE_RECORD_INVALID\n');
  });

  it('rejects output paths outside the evidence root', async () => {
    const inputPath = resolve(temporaryRoot, 'release-input.json');
    await writeFile(inputPath, JSON.stringify(validReleaseRecord()), 'utf8');
    const result = await run(releaseScript, [
      'create',
      '--input',
      inputPath,
      '--output',
      resolve(temporaryRoot, '..', 'escaped-record.json'),
      '--evidence-root',
      temporaryRoot,
    ]);

    expect(result.stderr).toBe('EVIDENCE_OUTPUT_OUTSIDE_ROOT\n');
    expect(result.exitCode).toBe(1);
  });

  it('detects a record changed after checksum creation', async () => {
    const created = await createReleaseRecord(validReleaseRecord());
    expect(created.result.exitCode).toBe(0);
    await writeFile(created.outputPath, '{}\n', 'utf8');

    const result = await run(releaseScript, [
      'verify',
      '--record',
      created.outputPath,
      '--checksum',
      `${created.outputPath}.sha256`,
    ]);

    expect(result.stderr).toBe('RELEASE_RECORD_CHECKSUM_MISMATCH\n');
    expect(result.exitCode).toBe(1);
  });
});

describe('backup manifest evidence', () => {
  it('sorts dump and Storage inventories and writes aggregate-only metadata', async () => {
    const created = await createBackupManifest(validBackupInput());

    expect(created.result).toEqual({
      exitCode: 0,
      stderr: '',
      stdout: 'BACKUP_MANIFEST_CREATED\n',
    });
    const manifest = JSON.parse(await readFile(created.outputPath, 'utf8')) as {
      dump_files: { path: string }[];
      storage: {
        inventory_sha256: string;
        object_count: number;
        total_bytes: number;
      };
      storage_objects?: unknown;
    };
    expect(manifest.dump_files.map(({ path }) => path)).toEqual([
      'data.sql.age',
      'roles.sql.age',
    ]);
    expect(manifest.storage.inventory_sha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(manifest.storage.object_count).toBe(2);
    expect(manifest.storage.total_bytes).toBe(75);
    expect(manifest.storage_objects).toBeUndefined();
  });

  it.each([
    ['extra field', { debug: true }],
    ['wrong environment', { environment: 'staging' }],
    ['secret-looking key', { api_secret: 'synthetic' }],
    ['credential value', { lifecycle_policy_version: 'Bearer synthetic' }],
    ['Email value', { age_recipient_fingerprint: 'owner@example.com' }],
    [
      'plaintext dump path',
      {
        dump_files: [
          { path: 'data.sql', sha256: 'a'.repeat(64), size_bytes: 1 },
        ],
      },
    ],
    ['wrong B2 prefix', { b2_prefix: 'staging/backup-001/' }],
  ])('rejects %s', async (_name, mutation) => {
    const created = await createBackupManifest({
      ...validBackupInput(),
      ...mutation,
    });

    expect(created.result.stderr).toBe('BACKUP_MANIFEST_INVALID\n');
    expect(created.result.exitCode).toBe(1);
  });
});
