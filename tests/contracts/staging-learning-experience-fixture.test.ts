import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildFixtureAppMetadata,
  deriveRunScopedEmail,
  type FixtureAppMetadata,
  generateSecurePassword,
  isLearningFixtureCredentials,
  LEARNING_FIXTURE_CREDENTIAL_FALLBACK_SENTINEL,
  readRunScopedLearningFixtureCredentialFile,
  runProvisionWorkflow,
  sanitizeProvisionFailure,
  validateProvisionerEnvironment,
} from '../../scripts/staging/provision-learning-experience-fixture.mjs';

const PROJECT_REF = 'onkxnkzeixpezetkmocf';
const validEnv = () => ({
  GITHUB_RUN_ATTEMPT: '1',
  GITHUB_RUN_ID: '1234567890',
  GITHUB_SHA: 'a'.repeat(40),
  LEARNING_EXPERIENCE_FIXTURE_CREDENTIAL_FILE:
    '/tmp/runner-temp-fixture/learning-experience-fixture-credential.json',
  RUNNER_TEMP: '/tmp/runner-temp-fixture',
  STAGING_SUPABASE_PROJECT_REF: PROJECT_REF,
  STAGING_SUPABASE_SECRET_KEY: 'sb_secret_fake_value',
  STAGING_SUPABASE_URL: `https://${PROJECT_REF}.supabase.co`,
});

describe('validateProvisionerEnvironment', () => {
  it('accepts an exactly valid environment', () => {
    const resolved = validateProvisionerEnvironment(validEnv());
    expect(resolved).toEqual({
      credentialFilePath:
        '/tmp/runner-temp-fixture/learning-experience-fixture-credential.json',
      gitSha: 'a'.repeat(40),
      projectRef: PROJECT_REF,
      runAttempt: '1',
      runId: '1234567890',
      secretKey: 'sb_secret_fake_value',
      url: `https://${PROJECT_REF}.supabase.co`,
    });
  });

  it.each([
    [
      'wrong project ref',
      { STAGING_SUPABASE_PROJECT_REF: 'wrong-project-ref' },
    ],
    [
      'URL/ref mismatch',
      { STAGING_SUPABASE_URL: 'https://other-project.supabase.co' },
    ],
    [
      'URL with a query string',
      { STAGING_SUPABASE_URL: `https://${PROJECT_REF}.supabase.co?x=1` },
    ],
    [
      'missing new secret key (legacy-only)',
      {
        STAGING_SUPABASE_SECRET_KEY: undefined,
        STAGING_SUPABASE_SERVICE_ROLE_KEY: 'legacy-fake-value',
      },
    ],
    ['blank secret key', { STAGING_SUPABASE_SECRET_KEY: '   ' }],
    ['malformed run id', { GITHUB_RUN_ID: 'not-a-number' }],
    ['zero run id', { GITHUB_RUN_ID: '0' }],
    ['malformed run attempt', { GITHUB_RUN_ATTEMPT: 'one' }],
    ['malformed git sha (too short)', { GITHUB_SHA: 'abc123' }],
    ['malformed git sha (uppercase)', { GITHUB_SHA: 'A'.repeat(40) }],
    [
      'credential path outside RUNNER_TEMP',
      {
        LEARNING_EXPERIENCE_FIXTURE_CREDENTIAL_FILE:
          '/tmp/elsewhere/credential.json',
      },
    ],
    [
      'credential path equal to RUNNER_TEMP itself',
      {
        LEARNING_EXPERIENCE_FIXTURE_CREDENTIAL_FILE: '/tmp/runner-temp-fixture',
      },
    ],
  ])('fails closed on %s', (_label, override) => {
    expect(() =>
      validateProvisionerEnvironment({ ...validEnv(), ...override }),
    ).toThrow(/^LEARNING_FIXTURE_PROVISION_[A-Z0-9_]+$/u);
  });
});

describe('deriveRunScopedEmail', () => {
  it('produces a distinct identity for the same run id at a different attempt', () => {
    const first = deriveRunScopedEmail('1234567890', '1');
    const second = deriveRunScopedEmail('1234567890', '2');
    expect(first).not.toBe(second);
    expect(first).toMatch(/^[a-z0-9-]+@colorplay\.test$/u);
    expect(second).toMatch(/^[a-z0-9-]+@colorplay\.test$/u);
  });

  it('keeps the local-part within the RFC 5321 64-char limit at the maximum allowed run id and attempt', () => {
    const maxRunId = '9'.repeat(20); // RUN_ID_PATTERN allows up to 20 digits
    const maxRunAttempt = '9'.repeat(4); // RUN_ATTEMPT_PATTERN allows up to 4
    const email = deriveRunScopedEmail(maxRunId, maxRunAttempt);
    const [localPart] = email.split('@');
    expect(localPart).toBeDefined();
    expect(localPart?.length).toBeLessThanOrEqual(64);
    expect(email).toMatch(/^[a-z0-9-]+@colorplay\.test$/u);
  });
});

describe('generateSecurePassword', () => {
  it('generates a long, non-repeating secret', () => {
    const first = generateSecurePassword();
    const second = generateSecurePassword();
    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThanOrEqual(32);
  });
});

describe('buildFixtureAppMetadata', () => {
  it('tags exactly the five required app_metadata keys', () => {
    const metadata = buildFixtureAppMetadata({
      gitSha: 'b'.repeat(40),
      runAttempt: '2',
      runId: '42',
    });
    expect(metadata).toEqual({
      colorplay_fixture_environment: 'staging',
      colorplay_fixture_git_sha: 'b'.repeat(40),
      colorplay_fixture_kind: 'learning-experience',
      colorplay_fixture_run_attempt: '2',
      colorplay_fixture_run_id: '42',
    });
  });
});

describe('readRunScopedLearningFixtureCredentialFile', () => {
  let fixtureRoot = '';
  let credentialPath = '';

  beforeEach(async () => {
    fixtureRoot = await mkdtemp(join(tmpdir(), 'learning-fixture-read-'));
    credentialPath = join(fixtureRoot, 'credential.json');
  });

  afterEach(async () => {
    await rm(fixtureRoot, { recursive: true, force: true });
  });

  it('fails closed when the file does not exist', async () => {
    await expect(
      readRunScopedLearningFixtureCredentialFile(credentialPath),
    ).rejects.toThrow(LEARNING_FIXTURE_CREDENTIAL_FALLBACK_SENTINEL);
  });

  it('fails closed when the file permissions are not exactly 0600', async () => {
    await writeFile(
      credentialPath,
      '{"email":"a@colorplay.test","password":"x"}\n',
    );
    await chmod(credentialPath, 0o644);
    await expect(
      readRunScopedLearningFixtureCredentialFile(credentialPath),
    ).rejects.toThrow(LEARNING_FIXTURE_CREDENTIAL_FALLBACK_SENTINEL);
  });

  it('fails closed on malformed JSON', async () => {
    await writeFile(credentialPath, 'not json', { mode: 0o600 });
    await chmod(credentialPath, 0o600);
    await expect(
      readRunScopedLearningFixtureCredentialFile(credentialPath),
    ).rejects.toThrow(LEARNING_FIXTURE_CREDENTIAL_FALLBACK_SENTINEL);
  });

  it.each([
    ['missing password', '{"email":"a@colorplay.test"}'],
    ['empty email', '{"email":"","password":"x"}'],
    ['extra key', '{"email":"a@colorplay.test","password":"x","secret":"y"}'],
    ['wrong types', '{"email":1,"password":true}'],
  ])('fails closed on schema violation: %s', async (_label, json) => {
    await writeFile(credentialPath, json, { mode: 0o600 });
    await chmod(credentialPath, 0o600);
    await expect(
      readRunScopedLearningFixtureCredentialFile(credentialPath),
    ).rejects.toThrow(LEARNING_FIXTURE_CREDENTIAL_FALLBACK_SENTINEL);
  });

  it('resolves the credentials from a correctly-shaped, 0600 file', async () => {
    await writeFile(
      credentialPath,
      '{"email":"a@colorplay.test","password":"secret-value"}',
      { mode: 0o600 },
    );
    await chmod(credentialPath, 0o600);
    await expect(
      readRunScopedLearningFixtureCredentialFile(credentialPath),
    ).resolves.toEqual({ email: 'a@colorplay.test', password: 'secret-value' });
  });
});

describe('isLearningFixtureCredentials', () => {
  it.each([
    [{ email: 'a@colorplay.test', password: 'x' }, true],
    [{ email: '', password: 'x' }, false],
    [{ email: 'a@colorplay.test' }, false],
    [null, false],
    ['string', false],
  ])('classifies %j as %s', (value, expected) => {
    expect(isLearningFixtureCredentials(value)).toBe(expected);
  });
});

type FakeCounts = Readonly<{
  profiles: number;
  walletTokenBalance: number | null;
  wallets: number;
}>;

function fakePorts(
  overrides: Readonly<{
    countProfileAndWallet?: () => Promise<FakeCounts>;
  }> = {},
) {
  const writtenFiles: { credentials: unknown; path: string }[] = [];
  return {
    ports: {
      auth: { createStudent: () => Promise.resolve('fake-user-id') },
      database: {
        countProfileAndWallet:
          overrides.countProfileAndWallet ??
          (() =>
            Promise.resolve<FakeCounts>({
              profiles: 1,
              walletTokenBalance: 0,
              wallets: 1,
            })),
      },
      filesystem: {
        writeCredentialFile: (path: string, credentials: unknown) => {
          writtenFiles.push({ credentials, path });
          return Promise.resolve();
        },
      },
    },
    writtenFiles,
  };
}

const environment = () => ({
  credentialFilePath: '/tmp/runner-temp-fixture/credential.json',
  gitSha: 'c'.repeat(40),
  projectRef: PROJECT_REF,
  runAttempt: '1',
  runId: '999',
  secretKey: 'sb_secret_fake_value',
  url: `https://${PROJECT_REF}.supabase.co`,
});

describe('runProvisionWorkflow', () => {
  it('calls createStudent with the exact derived identity, countProfileAndWallet with its exact returned user id, and only then writes the file', async () => {
    const env = environment();
    const expectedEmail = deriveRunScopedEmail(env.runId, env.runAttempt);
    const expectedAppMetadata = buildFixtureAppMetadata(env);
    const fakeUserId = 'fake-user-id-42';

    const createStudent = vi
      .fn<
        (input: {
          appMetadata: FixtureAppMetadata;
          email: string;
          password: string;
        }) => Promise<string>
      >()
      .mockResolvedValue(fakeUserId);
    const countProfileAndWallet = vi.fn(() =>
      Promise.resolve({ profiles: 1, walletTokenBalance: 0, wallets: 1 }),
    );
    const writeCredentialFile = vi.fn(() => Promise.resolve());

    const result = await runProvisionWorkflow({
      environment: env,
      ports: {
        auth: { createStudent },
        database: { countProfileAndWallet },
        filesystem: { writeCredentialFile },
      },
    });

    expect(createStudent).toHaveBeenCalledTimes(1);
    const createStudentArgs = createStudent.mock.calls[0]?.[0];
    expect(createStudentArgs?.email).toBe(expectedEmail);
    // Never assert a literal password value -- only its type -- so this
    // test can't accidentally snapshot the generated secret.
    expect(typeof createStudentArgs?.password).toBe('string');
    expect(createStudentArgs?.appMetadata).toEqual(expectedAppMetadata);

    expect(countProfileAndWallet).toHaveBeenCalledTimes(1);
    expect(countProfileAndWallet).toHaveBeenCalledWith(fakeUserId);

    expect(writeCredentialFile).toHaveBeenCalledTimes(1);
    const [createOrder] = createStudent.mock.invocationCallOrder;
    const [countOrder] = countProfileAndWallet.mock.invocationCallOrder;
    const [writeOrder] = writeCredentialFile.mock.invocationCallOrder;
    expect(createOrder).toBeLessThan(countOrder ?? 0);
    expect(countOrder).toBeLessThan(writeOrder ?? 0);

    expect(result.email).toBe(expectedEmail);
  });

  it.each([
    ['extra profile row', { profiles: 2, walletTokenBalance: 0, wallets: 1 }],
    ['missing wallet row', { profiles: 1, walletTokenBalance: 0, wallets: 0 }],
    [
      'non-zero starting balance',
      { profiles: 1, walletTokenBalance: 5, wallets: 1 },
    ],
  ])('fails closed before writing any file on %s', async (_label, counts) => {
    const { ports, writtenFiles } = fakePorts({
      countProfileAndWallet: () => Promise.resolve(counts),
    });
    await expect(
      runProvisionWorkflow({ environment: environment(), ports }),
    ).rejects.toThrow('LEARNING_FIXTURE_PROVISION_CARDINALITY_INVALID');
    expect(writtenFiles).toHaveLength(0);
  });
});

describe('sanitizeProvisionFailure', () => {
  it('passes through this module’s own fixed sentinels', () => {
    expect(
      sanitizeProvisionFailure(
        new Error('LEARNING_FIXTURE_PROVISION_URL_INVALID'),
      ),
    ).toBe('LEARNING_FIXTURE_PROVISION_URL_INVALID');
  });

  it('never leaks a raw provider error containing a password or URL query', () => {
    const leaky = new Error(
      'invalid request to https://onkxnkzeixpezetkmocf.supabase.co/auth/v1/admin/users?apikey=sb_secret_fake_value for password "hunter2"',
    );
    const sanitized = sanitizeProvisionFailure(leaky);
    expect(sanitized).toBe('LEARNING_FIXTURE_PROVISION_FAILED');
    expect(sanitized).not.toContain('hunter2');
    expect(sanitized).not.toContain('apikey');
    expect(sanitized).not.toContain('supabase.co');
  });

  it('normalizes a non-Error throw the same way', () => {
    expect(sanitizeProvisionFailure('a plain string')).toBe(
      'LEARNING_FIXTURE_PROVISION_FAILED',
    );
  });
});

describe('ledger and trigger safety invariants', () => {
  it('never deletes, resets, or bypasses the immutable economy ledgers', async () => {
    const source = await readFile(
      'scripts/staging/provision-learning-experience-fixture.mjs',
      'utf8',
    );
    // Comments are allowed to *explain* the ledger-safety rule (and so may
    // legitimately name the tables); only the executable code must never
    // touch them, so strip comments before scanning.
    const code = source
      .replaceAll(/\/\*[\s\S]*?\*\//gu, '')
      .replaceAll(/\/\/.*$/gmu, '');
    expect(code).not.toMatch(/delete\s+from/iu);
    expect(code).not.toContain('truncate');
    expect(code).not.toContain('xp_transactions');
    expect(code).not.toContain('wallet_transactions');
    expect(code).not.toContain('security definer');
    expect(code).not.toContain('.rpc(');
    expect(code).not.toContain('STAGING_SUPABASE_SERVICE_ROLE_KEY');
  });
});

describe('phase-acceptance workflow wiring', () => {
  const stepSlice = (job: string, stepName: string) => {
    const start = job.indexOf(`- name: ${stepName}`);
    expect(start, stepName).toBeGreaterThan(-1);
    const next = job.indexOf('\n      - name:', start + 1);
    return next === -1 ? job.slice(start) : job.slice(start, next);
  };

  const phaseAcceptanceJob = async () => {
    const workflow = await readFile(
      '.github/workflows/staging-deploy.yml',
      'utf8',
    );
    const start = workflow.indexOf('\n  phase-acceptance:');
    expect(start).toBeGreaterThan(-1);
    const next = workflow.indexOf('\n  real-device-approval:', start);
    expect(next).toBeGreaterThan(start);
    return workflow.slice(start, next);
  };

  it('gives the secret key only to the provision step', async () => {
    const job = await phaseAcceptanceJob();
    const provisionStep = stepSlice(
      job,
      'Provision run-scoped learning-experience fixture',
    );
    const playwrightStep = stepSlice(
      job,
      "'phase:learning-experience hosted acceptance and rls-cross-tenant-negative'",
    );
    expect(provisionStep).toContain('secrets.STAGING_SUPABASE_SECRET_KEY');
    // SUPABASE_ANON_KEY is a public anon key already exposed to the browser
    // by the app itself; only the secret (service-role-equivalent) key is
    // the trust boundary this test guards.
    expect(playwrightStep).not.toContain('STAGING_SUPABASE_SECRET_KEY');
  });

  it('gives the Playwright step the credential file path and the gate flag, never a raw password', async () => {
    const job = await phaseAcceptanceJob();
    const playwrightStep = stepSlice(
      job,
      "'phase:learning-experience hosted acceptance and rls-cross-tenant-negative'",
    );
    expect(playwrightStep).toContain(
      'PLAYWRIGHT_REQUIRE_RUN_SCOPED_LEARNING_FIXTURE: on',
    );
    expect(playwrightStep).not.toContain('password');
  });

  it('removes the credential file unconditionally after the Playwright step', async () => {
    const job = await phaseAcceptanceJob();
    const playwrightIndex = job.indexOf(
      "- name: 'phase:learning-experience hosted acceptance and rls-cross-tenant-negative'",
    );
    const cleanupStep = stepSlice(
      job,
      'Remove run-scoped learning-experience fixture credential file',
    );
    const cleanupIndex = job.indexOf(cleanupStep);
    expect(cleanupIndex).toBeGreaterThan(playwrightIndex);
    expect(cleanupStep).toContain('if: always()');
    expect(cleanupStep).toContain(
      'rm -f "$LEARNING_EXPERIENCE_FIXTURE_CREDENTIAL_FILE"',
    );
  });

  it('declares the identical credential path in each of the three named steps, never at job level', async () => {
    const job = await phaseAcceptanceJob();
    // jobs.<job_id>.env does not support the `runner` context (only
    // jobs.<job_id>.steps.<step_id>.env does) -- a job-level declaration
    // referencing runner.temp is silently invalid, not merely redundant.
    const stepsIndex = job.indexOf('\n    steps:');
    expect(stepsIndex).toBeGreaterThan(-1);
    const jobLevelEnv = job.slice(0, stepsIndex);
    expect(jobLevelEnv).not.toContain('runner.temp');

    const declarationPattern =
      /LEARNING_EXPERIENCE_FIXTURE_CREDENTIAL_FILE: \$\{\{ runner\.temp \}\}\/learning-experience-fixture-credential\.json/gu;
    expect(job.match(declarationPattern)).toHaveLength(3);

    const provisionStep = stepSlice(
      job,
      'Provision run-scoped learning-experience fixture',
    );
    const playwrightStep = stepSlice(
      job,
      "'phase:learning-experience hosted acceptance and rls-cross-tenant-negative'",
    );
    const cleanupStep = stepSlice(
      job,
      'Remove run-scoped learning-experience fixture credential file',
    );
    for (const step of [provisionStep, playwrightStep, cleanupStep]) {
      expect(step.match(declarationPattern)).toHaveLength(1);
    }

    expect(provisionStep).not.toContain('email');
    expect(provisionStep).not.toContain('password');
  });

  it('never relies on GITHUB_ENV to hand the path from one step to the next', async () => {
    const job = await phaseAcceptanceJob();
    // A provision step that fails after writing the file, but before any
    // GITHUB_ENV append, must not orphan a credential file cleanup can't
    // find -- so this job must not use GITHUB_ENV for this at all.
    expect(job).not.toContain('GITHUB_ENV');
  });
});
