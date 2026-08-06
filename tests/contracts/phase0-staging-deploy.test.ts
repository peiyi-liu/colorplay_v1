import { execFileSync, spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const retiredScript = resolve(
  repositoryRoot,
  'scripts/staging/bootstrap-staging-db.mjs',
);
const rebuildScript = resolve(
  repositoryRoot,
  'scripts/staging/rebuild-staging.sh',
);

let fixtureRoot = '';
const currentSha = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: repositoryRoot,
  encoding: 'utf8',
}).trim();

beforeEach(async () => {
  fixtureRoot = await mkdtemp(resolve(tmpdir(), 'colorplay-staging-test-'));
});

afterEach(async () => {
  await rm(fixtureRoot, { recursive: true, force: true });
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

describe('retired Staging bootstrap', () => {
  it('always fails without network, SQL, Auth, or key access', async () => {
    const source = await readFile(retiredScript, 'utf8');
    const result = await run(process.execPath, [retiredScript]);

    expect(result.code).not.toBe(0);
    expect(result.stderr).toBe('UNSAFE_BOOTSTRAP_RETIRED\n');
    expect(result.stdout).toBe('');
    expect(source).not.toMatch(
      /fetch|https?:|database\/query|auth\.users|api-keys/u,
    );
    expect(source).not.toMatch(/SUPABASE_(?:ACCESS_TOKEN|SERVICE_ROLE_KEY)/u);
  });
});

describe('guarded Staging rebuild', () => {
  it.each([
    [
      'wrong project ref',
      { STAGING_PROJECT_REF: 'wrong-project' },
      'STAGING_TARGET_MISMATCH',
    ],
    [
      'wrong SHA',
      { COLORPLAY_FROZEN_GIT_SHA: '0'.repeat(40) },
      'STAGING_SHA_MISMATCH',
    ],
    [
      'no owner authorization',
      { OWNER_AUTHORIZED: 'false' },
      'STAGING_OWNER_AUTHORIZATION_REQUIRED',
    ],
  ])('rejects %s before hosted mutation', async (_name, override, error) => {
    const result = await run('bash', [rebuildScript, '--preflight-only'], {
      COLORPLAY_FROZEN_GIT_SHA: currentSha,
      OWNER_AUTHORIZED: 'true',
      STAGING_EXPECTED_PROJECT_REF: 'staging-project-ref',
      STAGING_PROJECT_REF: 'staging-project-ref',
      ...override,
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(`${error}\n`);
    expect(result.stdout).not.toContain('CHECKPOINT_START');
  });

  it('requires passing backup and migration evidence', async () => {
    const backup = resolve(fixtureRoot, 'backup.json');
    const migration = resolve(fixtureRoot, 'migration.json');
    await writeFile(backup, '{"schema_version":1,"decision":"freeze"}\n');
    await writeFile(
      migration,
      '{"schema_version":1,"decision":"blocked","drift":[]}\n',
    );
    const result = await run('bash', [rebuildScript, '--preflight-only'], {
      BACKUP_VERIFICATION_RESULT: backup,
      COLORPLAY_FROZEN_GIT_SHA: currentSha,
      MIGRATION_COMPARISON_RESULT: migration,
      OWNER_AUTHORIZED: 'true',
      STAGING_EXPECTED_PROJECT_REF: 'staging-project-ref',
      STAGING_PROJECT_REF: 'staging-project-ref',
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('STAGING_BACKUP_NOT_VERIFIED\n');
    expect(result.stdout).not.toContain('CHECKPOINT_START');
  });

  it('defines revalidated, resumable, separately logged checkpoints', async () => {
    const source = await readFile(rebuildScript, 'utf8');

    expect(source).toContain('verify_preflight');
    expect(source).toContain('database-reset');
    expect(source).toContain('auth-cleanup');
    expect(source).toContain('storage-cleanup');
    expect(source).toContain('migration-replay');
    expect(source).toContain('approved-content-import');
    expect(source).toContain('fixture-creation');
    expect(source).toContain('AUTH_USERS_AFTER=0');
    expect(source).toContain('STORAGE_OBJECTS_AFTER=0');
    expect(source).toContain('supabase db reset --linked');
    expect(source).toContain('supabase migration list --linked');
    expect(source).not.toContain('--mode hosted');
    expect(source).not.toContain('schema_migrations');
  });
});

describe('automatic Staging deployment', () => {
  it('deploys only the exact protected Staging SHA and target', async () => {
    const workflow = await readFile(
      '.github/workflows/staging-deploy.yml',
      'utf8',
    );

    expect(workflow).toMatch(/push:\n\s+branches:\n\s+- staging/u);
    expect(workflow).toContain('COLORPLAY_DEPLOYMENT_ENVIRONMENT: staging');
    expect(workflow).toContain('colorplay-staging-web');
    expect(workflow).toContain('staging.colorplayapp.com');
    expect(workflow).toContain('github.sha');
    expect(workflow).toContain('supabase functions deploy');
    expect(workflow).toContain('STAGING_SUPABASE_PROJECT_REF');
    expect(workflow).not.toMatch(
      /PRODUCTION|production-project|https:\/\/colorplayapp\.com/u,
    );
  });

  it('requires marker, browser/RWD, negative authorization, and human gates', async () => {
    const workflow = await readFile(
      '.github/workflows/staging-deploy.yml',
      'utf8',
    );

    expect(workflow).toContain('phase0:smoke');
    expect(workflow).toContain('--target-origin');
    expect(workflow).toContain('--output');
    expect(workflow).not.toContain('--url ');
    expect(workflow).toContain('phase:learning-experience');
    expect(workflow).toContain('chromium');
    expect(workflow).toContain('firefox');
    expect(workflow).toContain('webkit');
    expect(workflow).toContain('1280x720');
    expect(workflow).toContain('812x375');
    expect(workflow).toContain('375x812');
    expect(workflow).toContain('staging-marker');
    expect(workflow).toContain('rls-cross-tenant-negative');
    expect(workflow).toContain('environment: staging-real-device');
    expect(workflow).toContain('staging-gate');
    expect(workflow).toContain('target_url=');
    expect(workflow).toContain('deployment_id');
    expect(workflow).toContain('deployed_functions');
  });
});
