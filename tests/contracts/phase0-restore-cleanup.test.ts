import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const exec = promisify(execFile);
const repositoryRoot = resolve(import.meta.dirname, '../..');
let root = '';
beforeEach(async () => {
  root = await mkdtemp(resolve(tmpdir(), 'colorplay-cleanup-test-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function restoreWithFakeStack(mode = 'success') {
  const backup = resolve(root, 'backup');
  await exec(
    'bash',
    [
      'scripts/backup/create-backup.sh',
      '--fixture',
      'synthetic',
      '--output-root',
      backup,
      '--fake-upload-root',
      resolve(root, 'fake-s3'),
    ],
    { cwd: repositoryRoot },
  );
  const bin = resolve(root, 'bin');
  await mkdir(bin);
  // Simulate the stack and Docker CLI only. No Docker daemon is contacted.
  await writeFile(
    resolve(bin, 'pnpm'),
    `#!${process.execPath}\nrequire('node:fs').writeFileSync(process.env.FAKE_CLEANUP_STATE + '.started', 'yes');\n`,
    { mode: 0o700 },
  );
  await writeFile(
    resolve(bin, 'docker'),
    `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2), mode = process.env.FAKE_CLEANUP_MODE;
const state = process.env.FAKE_CLEANUP_STATE;
fs.appendFileSync(state + '.calls', JSON.stringify(args) + '\\n');
const project = args.join(' ').match(/colorplay_restore_[0-9]+/)?.[0];
if (!fs.existsSync(state + '.started')) {
  if (mode === 'preflight-query-failure') process.exit(9);
  if (mode === 'project-collision' && args[0] === 'ps') process.stdout.write('supabase_db_' + project + '\\n');
  process.exit(0);
}
if (args[0] === 'exec') {
  const query = args.join(' ');
  if (query.includes('count(*)')) process.stdout.write('1\\n');
  if (query.includes('select version')) {
    const files = fs.readdirSync(process.env.FAKE_SOURCE_ROOT + '/supabase/migrations');
    process.stdout.write(files.filter(f => f.endsWith('.sql')).map(f => f.split('_')[0]).sort().join('\\n') + '\\n');
  }
  if (args.includes('-i')) process.stdin.resume();
} else if (args[0] === 'ps') {
  if (mode === 'query-failure') process.exit(9);
  if (!fs.existsSync(state + '.removed') || mode === 'container-residual') process.stdout.write('supabase_db_' + project + '\\n');
} else if (args[0] === 'rm') {
  if (mode === 'delete-failure') process.exit(8);
  fs.writeFileSync(state + '.removed', 'yes');
} else if (args[0] === 'network' && args[1] === 'ls') {
  if (!fs.existsSync(state + '.network-removed') || mode === 'network-residual') process.stdout.write('supabase_network_' + project + '\\n');
} else if (args[0] === 'network' && args[1] === 'rm') {
  if (mode === 'network-delete-failure') process.exit(8);
  fs.writeFileSync(state + '.network-removed', 'yes');
} else process.exit(7);
`,
    { mode: 0o700 },
  );
  await writeFile(
    resolve(bin, 'rm'),
    `#!${process.execPath}
const fs = require('node:fs');
if (process.env.FAKE_CLEANUP_MODE === 'temp-delete-failure') process.exit(8);
fs.rmSync(process.argv.at(-1), { recursive: true, force: true });
`,
    { mode: 0o700 },
  );
  const env = {
    ...process.env,
    TMPDIR: root,
    PATH: `${bin}:${process.env.PATH ?? ''}`,
    FAKE_CLEANUP_MODE: mode,
    FAKE_CLEANUP_STATE: resolve(root, 'state'),
    FAKE_SOURCE_ROOT: repositoryRoot,
  };
  try {
    const result = await exec(
      'bash',
      ['scripts/backup/restore-local.sh', '--backup-root', backup],
      { cwd: repositoryRoot, env, timeout: 4000 },
    );
    return { code: 0, ...result, backup };
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !('code' in error) ||
      !('stdout' in error) ||
      !('stderr' in error)
    )
      throw error;
    return {
      code: error.code,
      stdout: String(error.stdout),
      stderr: String(error.stderr),
      backup,
    };
  }
}

describe('restore cleanup behavior with a fake stack', () => {
  it.each(['untracked-migration', 'untracked-entry'])(
    'rejects %s before fixture or platform calls',
    async (mode) => {
      const source = resolve(root, 'source');
      const bin = resolve(root, 'lineage-bin');
      await mkdir(resolve(source, 'tests/integration'), { recursive: true });
      await mkdir(resolve(source, 'supabase/migrations'), { recursive: true });
      await mkdir(bin);
      await writeFile(resolve(source, 'package.json'), '{"type":"module"}\n');
      await writeFile(
        resolve(source, 'tests/integration/phase0-restore.e2e.ts'),
        await readFile(
          resolve(repositoryRoot, 'tests/integration/phase0-restore.e2e.ts'),
        ),
      );
      await writeFile(
        resolve(source, 'supabase/migrations/20260915000100_fixture.sql'),
        '-- synthetic fixture\n',
      );
      if (mode === 'untracked-migration')
        await writeFile(
          resolve(source, 'supabase/migrations/20260916000100_untracked.sql'),
          '-- must be rejected\n',
        );
      await writeFile(
        resolve(bin, 'git'),
        `#!${process.execPath}
const args = process.argv.slice(2);
if (args[0] === 'rev-parse') console.log('7b9e0ff553dd7dc89195f98de669d5ade4ae3006');
if (args[0] === 'ls-tree') console.log('supabase/migrations/20260915000100_fixture.sql');
if (args[0] === 'ls-files' && process.env.FAKE_LINEAGE_MODE === 'untracked-entry') process.exit(7);
`,
        { mode: 0o700 },
      );
      for (const tool of ['aws', 'docker'])
        await writeFile(
          resolve(bin, tool),
          `#!${process.execPath}\nrequire('node:fs').writeFileSync(process.env.FAKE_PLATFORM_MARKER, 'called');\nprocess.stderr.write('UNEXPECTED_PLATFORM_CALL\\n');\nprocess.exit(9);\n`,
          { mode: 0o700 },
        );
      let failure: unknown;
      try {
        await exec(
          process.execPath,
          [
            '--import',
            resolve(repositoryRoot, 'node_modules/tsx/dist/loader.mjs'),
            resolve(source, 'tests/integration/phase0-restore.e2e.ts'),
          ],
          {
            cwd: source,
            env: {
              ...process.env,
              PHASE0_RESTORE_E2E: '1',
              PATH: `${bin}:${process.env.PATH ?? ''}`,
              FAKE_LINEAGE_MODE: mode,
              FAKE_PLATFORM_MARKER: resolve(root, 'platform-called'),
            },
          },
        );
      } catch (error) {
        failure = error;
      }
      const stderr =
        typeof failure === 'object' && failure !== null && 'stderr' in failure
          ? String(failure.stderr)
          : '';
      expect(stderr).toContain('RESTORE_E2E_SOURCE_NOT_COMMITTED');
      await expect(
        readFile(resolve(root, 'platform-called')),
      ).rejects.toMatchObject({ code: 'ENOENT' });
    },
  );
  it('writes PASS only with verified cleanup evidence', async () => {
    const result = await restoreWithFakeStack();
    expect(result.code).toBe(0);
    const report: unknown = JSON.parse(
      await readFile(resolve(result.backup, 'restore-report.json'), 'utf8'),
    );
    expect(report).toMatchObject({
      decision: 'pass',
      cleanup: {
        verified: true,
        residual_containers: 0,
        residual_networks: 0,
        temp_root_removed: true,
      },
    });
    expect(result.stdout).toContain('LOCAL_RESTORE_VERIFIED');
  });
  it.each([
    'delete-failure',
    'query-failure',
    'container-residual',
    'network-residual',
    'network-delete-failure',
    'temp-delete-failure',
  ])('rejects %s rather than reporting PASS', async (mode) => {
    const result = await restoreWithFakeStack(mode);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('RESTORE_CLEANUP_FAILED');
    expect(result.stdout).not.toContain('LOCAL_RESTORE_VERIFIED');
    await expect(
      readFile(resolve(result.backup, 'restore-report.json')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it('requires an explicit real E2E opt-in before creating fixtures', async () => {
    let failure: unknown;
    try {
      await exec(
        process.execPath,
        ['--import', 'tsx', 'tests/integration/phase0-restore.e2e.ts'],
        {
          cwd: repositoryRoot,
          env: { ...process.env, PHASE0_RESTORE_E2E: '' },
        },
      );
    } catch (error) {
      failure = error;
    }
    expect(failure).toHaveProperty('code', 1);
    expect(
      typeof failure === 'object' && failure !== null && 'stderr' in failure
        ? String(failure.stderr)
        : '',
    ).toContain('RESTORE_E2E_OPT_IN_REQUIRED');
  });
  it.each(['project-collision', 'preflight-query-failure'])(
    'rejects %s before starting or deleting existing resources',
    async (mode) => {
      const result = await restoreWithFakeStack(mode);
      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain(
        mode === 'project-collision'
          ? 'RESTORE_PROJECT_COLLISION'
          : 'RESTORE_PREFLIGHT_FAILED',
      );
      await expect(
        readFile(resolve(root, 'state.started')),
      ).rejects.toMatchObject({ code: 'ENOENT' });
      const calls = await readFile(resolve(root, 'state.calls'), 'utf8');
      expect(calls).not.toContain('"rm"');
      await expect(
        readFile(resolve(result.backup, 'restore-report.json')),
      ).rejects.toMatchObject({ code: 'ENOENT' });
    },
  );
});
