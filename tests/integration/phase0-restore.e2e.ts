import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';

// Not discovered by daily Vitest or generic integration *.test.ts runs.
if (process.env.PHASE0_RESTORE_E2E !== '1') {
  process.stderr.write('RESTORE_E2E_OPT_IN_REQUIRED\n');
  process.exit(1);
}
const exec = promisify(execFile);
const repositoryRoot = resolve(import.meta.dirname, '../..');
const options = { cwd: repositoryRoot };
let head: string;
let migrations: string[];
try {
  await exec('git', ['diff', '--exit-code', 'HEAD', '--'], options);
  await exec(
    'git',
    [
      'ls-files',
      '--error-unmatch',
      '--',
      'tests/integration/phase0-restore.e2e.ts',
      'scripts/backup/create-backup.sh',
      'scripts/backup/restore-local.sh',
    ],
    options,
  );
  head = (await exec('git', ['rev-parse', 'HEAD'], options)).stdout.trim();
  assert.match(head, /^[0-9a-f]{40}$/u);
  const files = (await readdir(resolve(repositoryRoot, 'supabase/migrations')))
    .filter((file) => file.endsWith('.sql'))
    .sort();
  const committed = (
    await exec(
      'git',
      ['ls-tree', '-r', '--name-only', 'HEAD', '--', 'supabase/migrations'],
      options,
    )
  ).stdout
    .trim()
    .split('\n')
    .filter((file) => file.endsWith('.sql'))
    .sort();
  assert.ok(files.length > 0);
  assert.deepEqual(
    files.map((file) => `supabase/migrations/${file}`),
    committed,
  );
  migrations = files.map((file) => file.split('_')[0] ?? '');
} catch {
  process.stderr.write('RESTORE_E2E_SOURCE_NOT_COMMITTED\n');
  process.exit(1);
}
await test(
  'real isolated encrypted synthetic restore (explicit opt-in)',
  { timeout: 300_000 },
  async () => {
    await exec('aws', ['--version'], options);
    await exec('age', ['--version'], options);
    await exec('age-keygen', ['--version'], options);
    await exec('docker', ['info', '--format', '{{.ServerVersion}}'], options);
    async function resources() {
      const containers = await exec(
        'docker',
        ['ps', '--all', '--format', '{{.Names}}'],
        options,
      );
      const networks = await exec(
        'docker',
        ['network', 'ls', '--format', '{{.Name}}'],
        options,
      );
      return {
        containers: containers.stdout.trim().split('\n').sort(),
        networks: networks.stdout.trim().split('\n').sort(),
      };
    }
    const baseline = await resources();
    const root = await mkdtemp(
      resolve(tmpdir(), 'colorplay-real-restore-e2e-'),
    );
    const backupRoot = resolve(root, 'backup');
    const created = await exec(
      'bash',
      [
        'scripts/backup/create-backup.sh',
        '--fixture',
        'synthetic',
        '--output-root',
        backupRoot,
        '--fake-upload-root',
        resolve(root, 'fake-s3'),
      ],
      options,
    );
    assert.equal(created.stderr, '');
    assert.match(created.stdout, /SYNTHETIC_BACKUP_CREATED/);
    // One call only; no retry on failure. Receipts remain outside Git for review.
    const restored = await exec(
      'bash',
      ['scripts/backup/restore-local.sh', '--backup-root', backupRoot],
      {
        ...options,
        env: { ...process.env, RESTORE_EXPECTED_REPO_SHA: head.trim() },
        timeout: 280_000,
      },
    );
    assert.equal(restored.stderr, '');
    assert.match(restored.stdout, /LOCAL_RESTORE_VERIFIED/);
    const report: unknown = JSON.parse(
      await readFile(resolve(backupRoot, 'restore-report.json'), 'utf8'),
    );
    assert.ok(typeof report === 'object' && report !== null);
    const fields = report as Record<string, unknown>;
    assert.equal(fields.schema_version, 1);
    assert.equal(fields.decision, 'pass');
    assert.equal(fields.target, 'isolated-local');
    assert.match(String(fields.backup_prefix), /^production\//u);
    assert.equal(fields.repo_sha, head.trim());
    assert.equal(fields.migration_first, migrations[0]);
    assert.equal(fields.migration_last, migrations.at(-1));
    assert.ok(
      typeof fields.actual_data_loss_hours === 'number' &&
        fields.actual_data_loss_hours >= 0,
    );
    assert.ok(
      typeof fields.elapsed_seconds === 'number' && fields.elapsed_seconds >= 0,
    );
    assert.equal(fields.application_startup, 'skipped');
    assert.equal(fields.authorization_probe, 'skipped');
    assert.equal(fields.role_inventory, 'skipped');
    assert.deepEqual(fields.cleanup, {
      verified: true,
      residual_containers: 0,
      residual_networks: 0,
      temp_root_removed: true,
    });
    assert.deepEqual(await resources(), baseline);
    await writeFile(
      resolve(root, 'drill-receipt.json'),
      JSON.stringify(
        {
          schema_version: 1,
          repo_sha: head.trim(),
          decision: 'pass',
          baseline_resources_preserved: true,
          report: fields,
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    process.stdout.write(
      `RESTORE_E2E_VERIFIED receipt=${resolve(root, 'drill-receipt.json')}\n`,
    );
  },
);
