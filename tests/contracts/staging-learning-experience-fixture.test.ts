// AGENTS.md section 6: this file exceeds 500 lines. Issue #37 and Issue #41
// both scope ownership to a small, fixed set of files (this one plus the
// .mjs/.d.mts it covers), so splitting it into multiple test files would be
// an out-of-scope refactor; the length is one contract test file growing
// with its module's fail-closed gates, not an unbounded or unrelated file.
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildFixtureAppMetadata,
  deriveRunScopedEmail,
  deriveRunScopedLoginAccount,
  type FixtureAppMetadata,
  type FixtureProfileVerification,
  generateSecurePassword,
  isLearningFixtureCredentialBundle,
  isLearningFixtureCredentialPair,
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
    const first = deriveRunScopedEmail('1234567890', '1', 'student');
    const second = deriveRunScopedEmail('1234567890', '2', 'student');
    expect(first).not.toBe(second);
    expect(first).toMatch(/^[a-z0-9-]+@colorplay\.test$/u);
    expect(second).toMatch(/^[a-z0-9-]+@colorplay\.test$/u);
  });

  it('produces a distinct identity for each of the three kinds at the same run id and attempt', () => {
    const emails = new Set([
      deriveRunScopedEmail('1234567890', '1', 'student'),
      deriveRunScopedEmail('1234567890', '1', 'owner-teacher'),
      deriveRunScopedEmail('1234567890', '1', 'non-owner-teacher'),
    ]);
    expect(emails.size).toBe(3);
  });

  it('keeps the local-part within the RFC 5321 64-char limit at the maximum allowed run id, attempt, and longest kind', () => {
    const maxRunId = '9'.repeat(20); // RUN_ID_PATTERN allows up to 20 digits
    const maxRunAttempt = '9'.repeat(4); // RUN_ATTEMPT_PATTERN allows up to 4
    const email = deriveRunScopedEmail(
      maxRunId,
      maxRunAttempt,
      'non-owner-teacher',
    );
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

describe('deriveRunScopedLoginAccount', () => {
  it('produces a value satisfying the profiles.login_account column check', () => {
    const account = deriveRunScopedLoginAccount('1234567890', '1', 'student');
    expect(account).toMatch(/^[a-z0-9]{3,20}$/u);
  });

  it('is deterministic for the same run id, attempt, and kind', () => {
    const first = deriveRunScopedLoginAccount('1234567890', '2', 'student');
    const second = deriveRunScopedLoginAccount('1234567890', '2', 'student');
    expect(first).toBe(second);
  });

  it('differs across run id, attempt, and kind so short concatenation cannot collide', () => {
    // A naive concat/truncate of the values could alias distinct triples
    // (e.g. runId "1" + runAttempt "23" vs runId "12" + runAttempt "3");
    // hashing with separators keeps these apart.
    const accounts = new Set([
      deriveRunScopedLoginAccount('1', '23', 'student'),
      deriveRunScopedLoginAccount('12', '3', 'student'),
      deriveRunScopedLoginAccount('123', '1', 'student'),
      deriveRunScopedLoginAccount('1234567890', '1', 'student'),
      deriveRunScopedLoginAccount('1234567890', '2', 'student'),
      deriveRunScopedLoginAccount('1234567890', '2', 'owner-teacher'),
      deriveRunScopedLoginAccount('1234567890', '2', 'non-owner-teacher'),
    ]);
    expect(accounts.size).toBe(7);
  });

  it('stays within the 20-char column limit at the maximum allowed run id and attempt, for every kind', () => {
    const maxRunId = '9'.repeat(20);
    const maxRunAttempt = '9'.repeat(4);
    for (const kind of [
      'student',
      'owner-teacher',
      'non-owner-teacher',
    ] as const) {
      const account = deriveRunScopedLoginAccount(
        maxRunId,
        maxRunAttempt,
        kind,
      );
      expect(account.length).toBeLessThanOrEqual(20);
      expect(account).toMatch(/^[a-z0-9]{3,20}$/u);
    }
  });
});

describe('buildFixtureAppMetadata', () => {
  it('tags exactly the six required app_metadata keys', () => {
    const metadata = buildFixtureAppMetadata({
      gitSha: 'b'.repeat(40),
      kind: 'owner-teacher',
      runAttempt: '2',
      runId: '42',
    });
    expect(metadata).toEqual({
      colorplay_fixture_environment: 'staging',
      colorplay_fixture_git_sha: 'b'.repeat(40),
      colorplay_fixture_identity: 'owner-teacher',
      colorplay_fixture_kind: 'learning-experience',
      colorplay_fixture_run_attempt: '2',
      colorplay_fixture_run_id: '42',
    });
  });
});

const VALID_BUNDLE = {
  nonOwnerTeacher: { email: 'c@colorplay.test', password: 'secret-value-c' },
  ownerTeacher: { email: 'b@colorplay.test', password: 'secret-value-b' },
  student: { email: 'a@colorplay.test', password: 'secret-value-a' },
};

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
    await writeFile(credentialPath, `${JSON.stringify(VALID_BUNDLE)}\n`);
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
    [
      'missing non-owner teacher (partial provisioning)',
      { ...VALID_BUNDLE, nonOwnerTeacher: undefined },
    ],
    [
      'missing owner teacher (partial provisioning)',
      { ...VALID_BUNDLE, ownerTeacher: undefined },
    ],
    [
      'missing student (partial provisioning)',
      { ...VALID_BUNDLE, student: undefined },
    ],
    [
      'a nested pair missing its password',
      { ...VALID_BUNDLE, student: { email: 'a@colorplay.test' } },
    ],
    [
      'a nested pair with an empty email',
      { ...VALID_BUNDLE, student: { email: '', password: 'x' } },
    ],
    [
      'a nested pair with an extra key',
      {
        ...VALID_BUNDLE,
        student: { email: 'a@colorplay.test', password: 'x', secret: 'y' },
      },
    ],
    [
      'wrong types on a nested pair',
      { ...VALID_BUNDLE, student: { email: 1, password: true } },
    ],
    [
      'an extra top-level identity key',
      { ...VALID_BUNDLE, admin: VALID_BUNDLE.student },
    ],
  ])('fails closed on schema violation: %s', async (_label, bundle) => {
    await writeFile(credentialPath, JSON.stringify(bundle), { mode: 0o600 });
    await chmod(credentialPath, 0o600);
    await expect(
      readRunScopedLearningFixtureCredentialFile(credentialPath),
    ).rejects.toThrow(LEARNING_FIXTURE_CREDENTIAL_FALLBACK_SENTINEL);
  });

  it('resolves all three identities from a correctly-shaped, 0600 bundle file', async () => {
    await writeFile(credentialPath, JSON.stringify(VALID_BUNDLE), {
      mode: 0o600,
    });
    await chmod(credentialPath, 0o600);
    await expect(
      readRunScopedLearningFixtureCredentialFile(credentialPath),
    ).resolves.toEqual(VALID_BUNDLE);
  });
});

describe('isLearningFixtureCredentialPair', () => {
  it.each([
    [{ email: 'a@colorplay.test', password: 'x' }, true],
    [{ email: '', password: 'x' }, false],
    [{ email: 'a@colorplay.test' }, false],
    [null, false],
    ['string', false],
  ])('classifies %j as %s', (value, expected) => {
    expect(isLearningFixtureCredentialPair(value)).toBe(expected);
  });
});

describe('isLearningFixtureCredentialBundle', () => {
  it('classifies a full three-identity bundle as valid', () => {
    expect(isLearningFixtureCredentialBundle(VALID_BUNDLE)).toBe(true);
  });

  it.each([
    ['missing an identity', { student: VALID_BUNDLE.student }],
    ['an extra identity', { ...VALID_BUNDLE, admin: VALID_BUNDLE.student }],
    ['a null identity', { ...VALID_BUNDLE, ownerTeacher: null }],
    ['a null value', null],
    ['a single pair, not a bundle', VALID_BUNDLE.student],
  ])('classifies %s as invalid', (_label, value) => {
    expect(isLearningFixtureCredentialBundle(value)).toBe(false);
  });
});

function fakePorts(
  overrides: Readonly<{
    provisionProfile?: () => Promise<number>;
    verifyFixtureProfile?: () => Promise<FixtureProfileVerification>;
  }> = {},
) {
  const writtenFiles: { credentials: unknown; path: string }[] = [];
  return {
    ports: {
      auth: { createIdentity: () => Promise.resolve('fake-user-id') },
      database: {
        provisionProfile:
          overrides.provisionProfile ?? (() => Promise.resolve(1)),
        verifyFixtureProfile:
          overrides.verifyFixtureProfile ??
          (() =>
            Promise.resolve<FixtureProfileVerification>({
              loginAccount: 'placeholder-login-account',
              profiles: 1,
              role: 'student',
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
  it('provisions the student, then the owner teacher, then the non-owner teacher -- each fully created, role-assigned, and verified -- and only then writes one credential bundle', async () => {
    const env = environment();
    const studentUserId = 'fake-user-id-student';
    const ownerTeacherUserId = 'fake-user-id-owner';
    const nonOwnerTeacherUserId = 'fake-user-id-non-owner';
    const roleByUserId: Record<string, string> = {
      [nonOwnerTeacherUserId]: 'teacher',
      [ownerTeacherUserId]: 'teacher',
      [studentUserId]: 'student',
    };
    const loginAccountByUserId: Record<string, string> = {
      [nonOwnerTeacherUserId]: deriveRunScopedLoginAccount(
        env.runId,
        env.runAttempt,
        'non-owner-teacher',
      ),
      [ownerTeacherUserId]: deriveRunScopedLoginAccount(
        env.runId,
        env.runAttempt,
        'owner-teacher',
      ),
      [studentUserId]: deriveRunScopedLoginAccount(
        env.runId,
        env.runAttempt,
        'student',
      ),
    };

    const createIdentity = vi
      .fn<
        (input: {
          appMetadata: FixtureAppMetadata;
          email: string;
          password: string;
        }) => Promise<string>
      >()
      .mockResolvedValueOnce(studentUserId)
      .mockResolvedValueOnce(ownerTeacherUserId)
      .mockResolvedValueOnce(nonOwnerTeacherUserId);
    const provisionProfile = vi.fn(() => Promise.resolve(1));
    const verifyFixtureProfile = vi.fn(
      (userId: string): Promise<FixtureProfileVerification> =>
        Promise.resolve({
          loginAccount: loginAccountByUserId[userId] ?? null,
          profiles: 1,
          role: roleByUserId[userId] ?? null,
          walletTokenBalance: 0,
          wallets: 1,
        }),
    );
    const writeCredentialFile = vi.fn<
      (path: string, credentials: unknown) => Promise<void>
    >(() => Promise.resolve());
    const appMetadataFor = (
      kind: 'student' | 'owner-teacher' | 'non-owner-teacher',
    ) =>
      buildFixtureAppMetadata({
        gitSha: env.gitSha,
        kind,
        runAttempt: env.runAttempt,
        runId: env.runId,
      });

    const result = await runProvisionWorkflow({
      environment: env,
      ports: {
        auth: { createIdentity },
        database: { provisionProfile, verifyFixtureProfile },
        filesystem: { writeCredentialFile },
      },
    });

    expect(createIdentity).toHaveBeenCalledTimes(3);
    expect(provisionProfile).toHaveBeenCalledTimes(3);
    expect(verifyFixtureProfile).toHaveBeenCalledTimes(3);
    expect(writeCredentialFile).toHaveBeenCalledTimes(1);

    const studentCreateArgs = createIdentity.mock.calls[0]?.[0];
    expect(studentCreateArgs?.email).toBe(
      deriveRunScopedEmail(env.runId, env.runAttempt, 'student'),
    );
    // Never assert a literal password value -- only its type -- so this
    // test can't accidentally snapshot a generated secret.
    expect(typeof studentCreateArgs?.password).toBe('string');
    expect(studentCreateArgs?.appMetadata).toEqual(appMetadataFor('student'));

    const ownerCreateArgs = createIdentity.mock.calls[1]?.[0];
    expect(ownerCreateArgs?.email).toBe(
      deriveRunScopedEmail(env.runId, env.runAttempt, 'owner-teacher'),
    );
    expect(ownerCreateArgs?.appMetadata).toEqual(
      appMetadataFor('owner-teacher'),
    );

    const nonOwnerCreateArgs = createIdentity.mock.calls[2]?.[0];
    expect(nonOwnerCreateArgs?.email).toBe(
      deriveRunScopedEmail(env.runId, env.runAttempt, 'non-owner-teacher'),
    );
    expect(nonOwnerCreateArgs?.appMetadata).toEqual(
      appMetadataFor('non-owner-teacher'),
    );

    expect(provisionProfile).toHaveBeenNthCalledWith(1, studentUserId, {
      loginAccount: loginAccountByUserId[studentUserId],
      role: 'student',
    });
    expect(provisionProfile).toHaveBeenNthCalledWith(2, ownerTeacherUserId, {
      loginAccount: loginAccountByUserId[ownerTeacherUserId],
      role: 'teacher',
    });
    expect(provisionProfile).toHaveBeenNthCalledWith(3, nonOwnerTeacherUserId, {
      loginAccount: loginAccountByUserId[nonOwnerTeacherUserId],
      role: 'teacher',
    });

    // The bundle is written only once every identity has been verified.
    const writeOrder = writeCredentialFile.mock.invocationCallOrder[0] ?? 0;
    for (const order of verifyFixtureProfile.mock.invocationCallOrder) {
      expect(order).toBeLessThan(writeOrder);
    }

    const writeCall = writeCredentialFile.mock.calls[0];
    expect(writeCall?.[0]).toBe(env.credentialFilePath);
    const writtenBundle = writeCall?.[1] as
      Record<string, { email: string; password: string }> | undefined;
    expect(writtenBundle?.nonOwnerTeacher?.email).toBe(
      deriveRunScopedEmail(env.runId, env.runAttempt, 'non-owner-teacher'),
    );
    expect(writtenBundle?.ownerTeacher?.email).toBe(
      deriveRunScopedEmail(env.runId, env.runAttempt, 'owner-teacher'),
    );
    expect(writtenBundle?.student?.email).toBe(
      deriveRunScopedEmail(env.runId, env.runAttempt, 'student'),
    );
    // Never assert a literal password value -- only its type -- so this
    // test can't accidentally snapshot a generated secret.
    expect(typeof writtenBundle?.nonOwnerTeacher?.password).toBe('string');
    expect(typeof writtenBundle?.ownerTeacher?.password).toBe('string');
    expect(typeof writtenBundle?.student?.password).toBe('string');

    expect(result).toEqual({
      nonOwnerTeacherEmail: deriveRunScopedEmail(
        env.runId,
        env.runAttempt,
        'non-owner-teacher',
      ),
      ownerTeacherEmail: deriveRunScopedEmail(
        env.runId,
        env.runAttempt,
        'owner-teacher',
      ),
      studentEmail: deriveRunScopedEmail(env.runId, env.runAttempt, 'student'),
    });
  });

  it.each([
    ['no row updated', 0],
    ['more than one row updated', 2],
  ])(
    'fails closed before verifying the profile or writing any file when provisionProfile reports %s (malformed update)',
    async (_label, updatedRowCount) => {
      const verifyFixtureProfile = vi.fn();
      const { ports, writtenFiles } = fakePorts({
        provisionProfile: () => Promise.resolve(updatedRowCount),
        verifyFixtureProfile,
      });
      await expect(
        runProvisionWorkflow({ environment: environment(), ports }),
      ).rejects.toThrow(
        'LEARNING_FIXTURE_PROVISION_LOGIN_ACCOUNT_UPDATE_FAILED',
      );
      expect(verifyFixtureProfile).not.toHaveBeenCalled();
      expect(writtenFiles).toHaveLength(0);
    },
  );

  // Every case below must flip exactly one field away from a fully valid
  // profile. Reusing a placeholder login account for the non-login-account
  // cases would make them fail on the login-account mismatch first, hiding
  // whether the corresponding profile/wallet/role check fires at all. These
  // exercise the shared provisionIdentity() gate via the student (the first
  // identity attempted), which is the same gate every identity runs through.
  const validFixtureProfile = (): FixtureProfileVerification => ({
    loginAccount: deriveRunScopedLoginAccount(
      environment().runId,
      environment().runAttempt,
      'student',
    ),
    profiles: 1,
    role: 'student',
    walletTokenBalance: 0,
    wallets: 1,
  });

  it.each([
    [
      'extra profile row (missing profile invariant)',
      { ...validFixtureProfile(), profiles: 2 },
    ],
    [
      'missing wallet row (missing profile invariant)',
      { ...validFixtureProfile(), wallets: 0 },
    ],
    [
      'non-zero starting balance',
      { ...validFixtureProfile(), walletTokenBalance: 5 },
    ],
    [
      'role is not the expected role (wrong role)',
      { ...validFixtureProfile(), role: 'teacher' },
    ],
    [
      'login_account does not match the derived value',
      { ...validFixtureProfile(), loginAccount: 'some-other-account' },
    ],
  ] satisfies [string, FixtureProfileVerification][])(
    'fails closed before writing any file on %s',
    async (_label, profile) => {
      const { ports, writtenFiles } = fakePorts({
        verifyFixtureProfile: () => Promise.resolve(profile),
      });
      await expect(
        runProvisionWorkflow({ environment: environment(), ports }),
      ).rejects.toThrow('LEARNING_FIXTURE_PROVISION_CARDINALITY_INVALID');
      expect(writtenFiles).toHaveLength(0);
    },
  );

  it('fails closed on a teacher-specific wrong role (owner teacher provisioned as student) without writing any file', async () => {
    const env = environment();
    const createIdentity = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce('fake-user-id-student')
      .mockResolvedValueOnce('fake-user-id-owner');
    const provisionProfile = vi.fn(() => Promise.resolve(1));
    const verifyFixtureProfile = vi
      .fn<(userId: string) => Promise<FixtureProfileVerification>>()
      .mockImplementationOnce(() =>
        Promise.resolve({
          loginAccount: deriveRunScopedLoginAccount(
            env.runId,
            env.runAttempt,
            'student',
          ),
          profiles: 1,
          role: 'student',
          walletTokenBalance: 0,
          wallets: 1,
        }),
      )
      // The owner teacher's role update silently didn't take -- this is the
      // exact Hosted failure Issue #41 root-caused.
      .mockImplementationOnce(() =>
        Promise.resolve({
          loginAccount: deriveRunScopedLoginAccount(
            env.runId,
            env.runAttempt,
            'owner-teacher',
          ),
          profiles: 1,
          role: 'student',
          walletTokenBalance: 0,
          wallets: 1,
        }),
      );
    const writeCredentialFile = vi.fn(() => Promise.resolve());

    await expect(
      runProvisionWorkflow({
        environment: env,
        ports: {
          auth: { createIdentity },
          database: { provisionProfile, verifyFixtureProfile },
          filesystem: { writeCredentialFile },
        },
      }),
    ).rejects.toThrow('LEARNING_FIXTURE_PROVISION_CARDINALITY_INVALID');

    // The student was fully provisioned and verified, but the pipeline must
    // stop before the non-owner teacher and must never write a file -- a
    // partially-provisioned bundle (missing/broken identities) is exactly
    // what this fail-closed gate exists to prevent.
    expect(createIdentity).toHaveBeenCalledTimes(2);
    expect(verifyFixtureProfile).toHaveBeenCalledTimes(2);
    expect(writeCredentialFile).not.toHaveBeenCalled();
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
