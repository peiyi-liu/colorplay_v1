import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  resolveNamedSupabaseKey,
  SupabaseApiKeyConfigurationError,
} from '../../supabase/functions/_shared/api-keys';
import { readLocalAdminEnvironment } from '../../scripts/supabase/local-environment';

const repositoryRoot = resolve(import.meta.dirname, '../..');

interface FakeClientCall {
  key: string;
  url: string;
}

function createCapturingClientFactory(
  calls: FakeClientCall[],
  overrides: Record<string, unknown> = {},
) {
  return (url: string, key: string) => {
    calls.push({ key, url });
    return {
      auth: {
        admin: {
          createUser: () =>
            Promise.resolve({
              data: null,
              error: { message: 'capture-stop' },
            }),
          listUsers: () =>
            Promise.resolve({ data: { users: [] }, error: null }),
        },
      },
      storage: {
        listBuckets: () => Promise.resolve({ data: [], error: null }),
      },
      ...overrides,
    };
  };
}

/**
 * Runs one of this incident's manual Node scripts IN-PROCESS (never as a
 * real network-touching subprocess): mocks `@supabase/supabase-js` with a
 * capturing fake so no real Supabase host is ever contacted, spies on
 * `process.exit` so a script's own `fail()`/exit path can't kill the test
 * runner, and always restores argv/env afterward. `env` values here are
 * synthetic sentinels only -- never a real key.
 */
async function runManualScriptInProcess(
  scriptPath: string,
  argv: string[],
  env: Record<string, string | undefined>,
): Promise<{
  calls: FakeClientCall[];
  exitCode: number | null;
  threw: Error | null;
}> {
  const calls: FakeClientCall[] = [];
  vi.doMock('@supabase/supabase-js', () => ({
    createClient: createCapturingClientFactory(calls),
  }));
  const originalArgv = process.argv;
  const managedKeys = [
    'SUPABASE_URL',
    'SUPABASE_SECRET_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'STAGING_SUPABASE_URL',
    'STAGING_SUPABASE_SECRET_KEY',
    'STAGING_SUPABASE_SERVICE_ROLE_KEY',
    'STAGING_PROJECT_REF',
    'STAGING_EXPECTED_PROJECT_REF',
  ] as const;
  const originalValues = new Map<string, string | undefined>();
  for (const key of managedKeys) originalValues.set(key, process.env[key]);
  for (const key of managedKeys) Reflect.deleteProperty(process.env, key);
  Object.assign(process.env, env);
  process.argv = ['node', scriptPath, ...argv];
  let exitCode: number | null = null;
  const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((
    code?: number,
  ) => {
    exitCode = code ?? 0;
    throw new Error(`process.exit(${String(code)})`);
  }) as never);
  try {
    const cacheBust = `${Date.now().toString()}-${Math.random().toString()}`;
    await import(`${scriptPath}?t=${cacheBust}`);
    return { calls, exitCode, threw: null };
  } catch (error) {
    return { calls, exitCode, threw: error as Error };
  } finally {
    process.argv = originalArgv;
    for (const key of managedKeys) {
      const original = originalValues.get(key);
      if (original === undefined) Reflect.deleteProperty(process.env, key);
      else process.env[key] = original;
    }
    exitSpy.mockRestore();
    vi.doUnmock('@supabase/supabase-js');
    vi.resetModules();
  }
}

describe('Supabase API key migration', () => {
  it('prefers a named new API key over its legacy fallback', () => {
    expect(
      resolveNamedSupabaseKey({
        keySet: JSON.stringify({ default: 'sb_secret_new-key' }),
        legacyKey: 'legacy-service-role-key',
      }),
    ).toBe('sb_secret_new-key');
  });

  it('fails closed on malformed new-key JSON instead of silently using legacy', () => {
    expect(() =>
      resolveNamedSupabaseKey({
        keySet: '{not-json',
        legacyKey: 'legacy-service-role-key',
      }),
    ).toThrow(SupabaseApiKeyConfigurationError);
  });

  it('allows a bounded legacy fallback during the zero-downtime rollout', () => {
    expect(
      resolveNamedSupabaseKey({
        keySet: undefined,
        legacyKey: 'legacy-service-role-key',
      }),
    ).toBe('legacy-service-role-key');
  });

  it('fails closed when a new key set is explicitly present but empty', () => {
    expect(() =>
      resolveNamedSupabaseKey({
        keySet: '',
        legacyKey: 'legacy-service-role-key',
      }),
    ).toThrow(SupabaseApiKeyConfigurationError);
  });

  it.each(['auth-login', 'auth-recover', 'student-register'])(
    '%s consumes the shared new-key resolver',
    (functionName) => {
      const source = readFileSync(
        resolve(process.cwd(), `supabase/functions/${functionName}/index.ts`),
        'utf8',
      );
      expect(source).toContain("from '../_shared/api-keys.ts'");
      expect(source).not.toContain("Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')");
    },
  );

  it('uses a new secret key for an explicitly confirmed hosted seed', () => {
    expect(
      readLocalAdminEnvironment({
        SEED_REMOTE_CONFIRM: 'onkxnkzeixpezetkmocf',
        SUPABASE_SECRET_KEY: 'sb_secret_staging-only-key',
        SUPABASE_URL: 'https://onkxnkzeixpezetkmocf.supabase.co',
      }),
    ).toEqual({
      serviceRoleKey: 'sb_secret_staging-only-key',
      url: 'https://onkxnkzeixpezetkmocf.supabase.co',
    });
  });

  // 2026-08-06 commit e57808c 刻意退役這支腳本（改用 rebuild-staging.sh +
  // 專屬 contract test），staging-runbook.md 的 ADR-0002 banner 明文禁止
  // 復活「直接呼叫 Management API、無 owner-approval gate」的做法——所以
  // 這裡驗證的是「退役狀態沒被復活」，不是「腳本本身用了新 API key」。
  it('keeps the retired staging bootstrap script retired', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'scripts/staging/bootstrap-staging-db.mjs'),
      'utf8',
    );
    expect(source).toContain('UNSAFE_BOOTSTRAP_RETIRED');
    expect(source).toContain('process.exitCode = 1');
  });
});

describe('scripts/admin/create-teacher.mjs: new secret-key variable preferred, legacy fallback bounded, fail-closed on blank', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const scriptPath = resolve(
    repositoryRoot,
    'scripts/admin/create-teacher.mjs',
  );
  const validArgv = [
    '--email',
    'teacher@example.invalid',
    '--password',
    'Abc123',
    '--account',
    'teacher01',
    '--name',
    'Test Teacher',
  ];

  it('new-only: the new SUPABASE_SECRET_KEY value is what reaches createClient', async () => {
    const { calls } = await runManualScriptInProcess(scriptPath, validArgv, {
      SUPABASE_URL: 'https://example.invalid',
      SUPABASE_SECRET_KEY: 'sentinel-new-key',
    });
    expect(calls[0]?.key).toBe('sentinel-new-key');
  });

  it('new + legacy: the NEW value is used, never the legacy one', async () => {
    const { calls } = await runManualScriptInProcess(scriptPath, validArgv, {
      SUPABASE_URL: 'https://example.invalid',
      SUPABASE_SECRET_KEY: 'sentinel-new-key',
      SUPABASE_SERVICE_ROLE_KEY: 'sentinel-legacy-key',
    });
    expect(calls[0]?.key).toBe('sentinel-new-key');
  });

  it('legacy-only: the legacy value is used during the migration window', async () => {
    const { calls } = await runManualScriptInProcess(scriptPath, validArgv, {
      SUPABASE_URL: 'https://example.invalid',
      SUPABASE_SERVICE_ROLE_KEY: 'sentinel-legacy-key',
    });
    expect(calls[0]?.key).toBe('sentinel-legacy-key');
  });

  it('new explicitly blank + legacy present: fails closed, never falls back to legacy', async () => {
    const { calls, threw } = await runManualScriptInProcess(
      scriptPath,
      validArgv,
      {
        SUPABASE_URL: 'https://example.invalid',
        SUPABASE_SECRET_KEY: '   ',
        SUPABASE_SERVICE_ROLE_KEY: 'sentinel-legacy-key',
      },
    );
    expect(calls).toHaveLength(0);
    expect(threw?.message).toContain('ADMIN_SECRET_KEY_INVALID');
  });

  it('all missing: fails closed with ADMIN_ENV_MISSING, never reaching createClient', async () => {
    const { calls, threw } = await runManualScriptInProcess(
      scriptPath,
      validArgv,
      { SUPABASE_URL: 'https://example.invalid' },
    );
    expect(calls).toHaveLength(0);
    expect(threw?.message).toContain('ADMIN_ENV_MISSING');
  });
});

describe('scripts/staging/cleanup-staging.mjs: new secret-key variable preferred, legacy fallback bounded, fail-closed on blank', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const scriptPath = resolve(
    repositoryRoot,
    'scripts/staging/cleanup-staging.mjs',
  );
  const baseEnv = {
    STAGING_PROJECT_REF: 'fake-ref',
    STAGING_EXPECTED_PROJECT_REF: 'fake-ref',
    STAGING_SUPABASE_URL: 'https://fake-ref.supabase.co',
  };

  it('new-only: the new STAGING_SUPABASE_SECRET_KEY value is what reaches createClient', async () => {
    const { calls, exitCode } = await runManualScriptInProcess(
      scriptPath,
      ['counts'],
      { ...baseEnv, STAGING_SUPABASE_SECRET_KEY: 'sentinel-new-key' },
    );
    expect(calls[0]?.key).toBe('sentinel-new-key');
    expect(exitCode).toBeNull();
  });

  it('new + legacy: the NEW value is used, never the legacy one', async () => {
    const { calls } = await runManualScriptInProcess(scriptPath, ['counts'], {
      ...baseEnv,
      STAGING_SUPABASE_SECRET_KEY: 'sentinel-new-key',
      STAGING_SUPABASE_SERVICE_ROLE_KEY: 'sentinel-legacy-key',
    });
    expect(calls[0]?.key).toBe('sentinel-new-key');
  });

  it('legacy-only: the legacy value is used during the migration window', async () => {
    const { calls } = await runManualScriptInProcess(scriptPath, ['counts'], {
      ...baseEnv,
      STAGING_SUPABASE_SERVICE_ROLE_KEY: 'sentinel-legacy-key',
    });
    expect(calls[0]?.key).toBe('sentinel-legacy-key');
  });

  it('new explicitly blank + legacy present: fails closed, never falls back to legacy', async () => {
    const { calls, threw, exitCode } = await runManualScriptInProcess(
      scriptPath,
      ['counts'],
      {
        ...baseEnv,
        STAGING_SUPABASE_SECRET_KEY: '   ',
        STAGING_SUPABASE_SERVICE_ROLE_KEY: 'sentinel-legacy-key',
      },
    );
    expect(calls).toHaveLength(0);
    expect(exitCode).toBe(1);
    expect(threw?.message).toContain('process.exit(1)');
  });

  it('all missing: fails closed, never reaching createClient', async () => {
    const { calls, exitCode } = await runManualScriptInProcess(
      scriptPath,
      ['counts'],
      baseEnv,
    );
    expect(calls).toHaveLength(0);
    expect(exitCode).toBe(1);
  });
});

describe('scripts/staging/rebuild-staging.sh: new secret-key variable preferred, legacy fallback bounded, fail-closed on blank', () => {
  // rebuild-staging.sh's full pipeline needs a heavy owner-authorized
  // preflight (frozen SHA match, backup/migration verification JSON,
  // hosted-mutation record/schema files) entirely unrelated to credential
  // selection, and would go on to invoke real `pnpm exec supabase
  // link`/`db reset` afterward -- none of that is needed to exercise the
  // credential-selection block itself, and faking that whole pipeline
  // just to reach five lines of pure bash would be its own large, separate
  // undertaking. Instead this extracts that exact block VERBATIM from the
  // real file (by content anchor, not a hand-copied duplicate that could
  // silently drift) and runs it standalone with a stubbed `fail()` --
  // still genuine execution of the shipped bash logic, with zero external
  // commands, zero network, and zero Hosted access reachable from it.
  async function extractCredentialBlock(): Promise<string> {
    const source = await readFile(
      resolve(repositoryRoot, 'scripts/staging/rebuild-staging.sh'),
      'utf8',
    );
    const startMarker = "staging_secret_key=''";
    const endMarker = '  fail STAGING_CREDENTIALS_MISSING';
    const startIndex = source.indexOf(startMarker);
    const endIndex = source.indexOf(endMarker, startIndex);
    expect(startIndex).toBeGreaterThan(-1);
    expect(endIndex).toBeGreaterThan(-1);
    return source.slice(startIndex, endIndex + endMarker.length);
  }

  async function runCredentialBlock(
    env: Record<string, string | undefined>,
  ): Promise<{ code: number | null; resolved: string; stderr: string }> {
    const block = await extractCredentialBlock();
    const wrapper = `#!/usr/bin/env bash
set -euo pipefail
fail() { printf '%s\\n' "$1" >&2; exit 1; }
${block}
printf 'RESOLVED=%s\\n' "$staging_secret_key"
`;
    return new Promise((resolveResult, reject) => {
      const child = spawn('bash', ['-c', wrapper], {
        env: {
          PATH: process.env.PATH ?? '',
          ...Object.fromEntries(
            Object.entries(env).filter(([, value]) => value !== undefined),
          ),
        },
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
        const match = /^RESOLVED=(.*)$/mu.exec(stdout);
        resolveResult({ code, resolved: match?.[1] ?? '', stderr });
      });
    });
  }

  it('new-only: the new STAGING_SUPABASE_SECRET_KEY value is what gets resolved', async () => {
    const result = await runCredentialBlock({
      STAGING_SUPABASE_URL: 'https://fake-ref.supabase.co',
      STAGING_SUPABASE_SECRET_KEY: 'sentinel-new-key',
    });
    expect(result.resolved).toBe('sentinel-new-key');
    expect(result.code).toBe(0);
  });

  it('new + legacy: the NEW value is resolved, never the legacy one', async () => {
    const result = await runCredentialBlock({
      STAGING_SUPABASE_URL: 'https://fake-ref.supabase.co',
      STAGING_SUPABASE_SECRET_KEY: 'sentinel-new-key',
      STAGING_SUPABASE_SERVICE_ROLE_KEY: 'sentinel-legacy-key',
    });
    expect(result.resolved).toBe('sentinel-new-key');
  });

  it('legacy-only: the legacy value is resolved during the migration window', async () => {
    const result = await runCredentialBlock({
      STAGING_SUPABASE_URL: 'https://fake-ref.supabase.co',
      STAGING_SUPABASE_SERVICE_ROLE_KEY: 'sentinel-legacy-key',
    });
    expect(result.resolved).toBe('sentinel-legacy-key');
  });

  it('new explicitly blank + legacy present: fails closed, never falls back to legacy', async () => {
    const result = await runCredentialBlock({
      STAGING_SUPABASE_URL: 'https://fake-ref.supabase.co',
      STAGING_SUPABASE_SECRET_KEY: '   ',
      STAGING_SUPABASE_SERVICE_ROLE_KEY: 'sentinel-legacy-key',
    });
    expect(result.code).toBe(1);
    expect(result.stderr).toBe('STAGING_SECRET_KEY_INVALID\n');
    expect(result.resolved).toBe('');
  });

  it('all missing: fails closed with STAGING_CREDENTIALS_MISSING', async () => {
    const result = await runCredentialBlock({
      STAGING_SUPABASE_URL: 'https://fake-ref.supabase.co',
    });
    expect(result.code).toBe(1);
    expect(result.stderr).toBe('STAGING_CREDENTIALS_MISSING\n');
  });
});
