#!/usr/bin/env node
import { createHash, randomBytes } from 'node:crypto';
import { chmod, readFile, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL, URL } from 'node:url';

import { createClient } from '@supabase/supabase-js';

// Task 0A-2 / Issue #41 run-scoped Hosted learning-experience fixture. Every
// GitHub workflow run/attempt provisions its own synthetic student *and* its
// own owner/non-owner teacher pair instead of reusing tests/fixtures/users.ts'
// learningStudent/learningTeacher/teacherTwo, so repeated Hosted runs stop
// accumulating XP/Token/mistakes -- or drifting teacher role/profile state --
// on shared accounts (see the bounded read-only design audit this file
// implements). This stage does NOT delete or reset anything -- created
// identities and their data are left in place, tagged via app_metadata, for a
// later Phase 0B clean rebuild to reconcile. This file must never remove rows
// from public.xp_transactions or public.wallet_transactions (immutable
// ledgers guarded by triggers), never bypass those triggers, and never reset
// any ledger -- it only ever INSERTs new auth users and reads counts back.

const EXPECTED_PROJECT_REF = 'onkxnkzeixpezetkmocf';
const RUN_ID_PATTERN = /^[1-9][0-9]{0,19}$/u;
const RUN_ATTEMPT_PATTERN = /^[1-9][0-9]{0,3}$/u;
const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const CREDENTIAL_FILE_MODE = 0o600;

export const LEARNING_FIXTURE_CREDENTIAL_FALLBACK_SENTINEL =
  'LEARNING_EXPERIENCE_RUN_SCOPED_FIXTURE_REQUIRED';

const isRecord = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function fail(code) {
  throw new Error(code);
}

function requireString(value, pattern, code) {
  if (typeof value !== 'string' || !pattern.test(value)) fail(code);
  return value;
}

/**
 * Validate the closed set of inputs this provisioner accepts. Any other
 * environment variable -- any prior or legacy secret name included -- is
 * ignored entirely; this function never reads one, so there is no silent
 * fallback path to reintroduce. The project ref and URL hostname are
 * checked here, in the caller, because the Supabase API itself does not
 * (and must not be assumed to) reject a request for validating which
 * project a caller intended to target.
 *
 * @param {NodeJS.ProcessEnv} environment
 */
export function validateProvisionerEnvironment(environment) {
  const projectRef = environment.STAGING_SUPABASE_PROJECT_REF;
  if (projectRef !== EXPECTED_PROJECT_REF) {
    fail('LEARNING_FIXTURE_PROVISION_PROJECT_REF_INVALID');
  }

  const expectedUrl = `https://${EXPECTED_PROJECT_REF}.supabase.co`;
  let parsedUrl;
  try {
    parsedUrl = new URL(environment.STAGING_SUPABASE_URL ?? '');
  } catch {
    fail('LEARNING_FIXTURE_PROVISION_URL_INVALID');
  }
  if (
    parsedUrl.protocol !== 'https:' ||
    parsedUrl.hostname !== `${EXPECTED_PROJECT_REF}.supabase.co` ||
    parsedUrl.pathname !== '/' ||
    parsedUrl.search !== ''
  ) {
    fail('LEARNING_FIXTURE_PROVISION_URL_INVALID');
  }

  const secretKey = environment.STAGING_SUPABASE_SECRET_KEY;
  if (typeof secretKey !== 'string' || secretKey.trim().length === 0) {
    fail('LEARNING_FIXTURE_PROVISION_SECRET_KEY_MISSING');
  }

  const runId = requireString(
    environment.GITHUB_RUN_ID,
    RUN_ID_PATTERN,
    'LEARNING_FIXTURE_PROVISION_RUN_ID_INVALID',
  );
  const runAttempt = requireString(
    environment.GITHUB_RUN_ATTEMPT,
    RUN_ATTEMPT_PATTERN,
    'LEARNING_FIXTURE_PROVISION_RUN_ATTEMPT_INVALID',
  );
  const gitSha = requireString(
    environment.GITHUB_SHA,
    SHA_PATTERN,
    'LEARNING_FIXTURE_PROVISION_GIT_SHA_INVALID',
  );

  const runnerTemp = environment.RUNNER_TEMP;
  const credentialFilePath =
    environment.LEARNING_EXPERIENCE_FIXTURE_CREDENTIAL_FILE;
  if (typeof runnerTemp !== 'string' || runnerTemp.length === 0) {
    fail('LEARNING_FIXTURE_PROVISION_RUNNER_TEMP_MISSING');
  }
  if (
    typeof credentialFilePath !== 'string' ||
    credentialFilePath.length === 0
  ) {
    fail('LEARNING_FIXTURE_PROVISION_CREDENTIAL_PATH_MISSING');
  }
  const resolvedRunnerTemp = resolve(runnerTemp);
  const resolvedCredentialPath = resolve(credentialFilePath);
  const relativeToRunnerTemp = relative(
    resolvedRunnerTemp,
    resolvedCredentialPath,
  );
  if (
    relativeToRunnerTemp.length === 0 ||
    relativeToRunnerTemp === '..' ||
    relativeToRunnerTemp.startsWith(`..${'/'}`) ||
    isAbsolute(relativeToRunnerTemp)
  ) {
    fail('LEARNING_FIXTURE_PROVISION_CREDENTIAL_PATH_OUTSIDE_RUNNER_TEMP');
  }

  return {
    credentialFilePath: resolvedCredentialPath,
    gitSha,
    projectRef,
    runAttempt,
    runId,
    secretKey,
    url: expectedUrl,
  };
}

// Every derived email/login_account is scoped by (kind, runId, runAttempt)
// -- kind is one of 'student' | 'owner-teacher' | 'non-owner-teacher' -- so
// the student and its two teachers never collide with each other or across
// runs.
//
// Deterministic given (kind, runId, runAttempt): the same run retried at a
// new attempt always gets a distinct identity, but nothing here is secret --
// only the password (generateSecurePassword) needs to be unpredictable.
export function deriveRunScopedEmail(runId, runAttempt, kind) {
  // "learning-fixture-" (17) + kind (<=18, "non-owner-teacher-") +
  // runId (<=20) + "-" (1) + runAttempt (<=4) = <=60 chars, comfortably
  // inside the RFC 5321 64-char local-part limit.
  return `learning-fixture-${kind}-${runId}-${runAttempt}@colorplay.test`;
}

export function generateSecurePassword() {
  return randomBytes(32).toString('base64url');
}

// public.profiles.login_account is constrained to `^[a-z0-9]{3,20}$` and
// unique (see 20260723000100_account_identity.sql). A hash of (kind, runId,
// runAttempt) -- rather than naive concatenation/truncation of the three
// values -- keeps distinct identity/run/attempt combinations from colliding
// into the same short string; the DB's own unique index remains the
// fail-closed backstop if a collision ever did occur.
const LOGIN_ACCOUNT_LENGTH = 16;

export function deriveRunScopedLoginAccount(runId, runAttempt, kind) {
  const digest = createHash('sha256')
    .update(`learning-fixture:${kind}:${runId}:${runAttempt}`)
    .digest('hex');
  return digest.slice(0, LOGIN_ACCOUNT_LENGTH);
}

export function buildFixtureAppMetadata({ gitSha, kind, runAttempt, runId }) {
  return {
    colorplay_fixture_environment: 'staging',
    colorplay_fixture_git_sha: gitSha,
    colorplay_fixture_identity: kind,
    colorplay_fixture_kind: 'learning-experience',
    colorplay_fixture_run_attempt: runAttempt,
    colorplay_fixture_run_id: runId,
  };
}

export function isLearningFixtureCredentialPair(value) {
  return (
    isRecord(value) &&
    Object.keys(value).length === 2 &&
    typeof value.email === 'string' &&
    value.email.length > 0 &&
    typeof value.password === 'string' &&
    value.password.length > 0
  );
}

const CREDENTIAL_BUNDLE_KEYS = ['nonOwnerTeacher', 'ownerTeacher', 'student'];

export function isLearningFixtureCredentialBundle(value) {
  return (
    isRecord(value) &&
    Object.keys(value).length === CREDENTIAL_BUNDLE_KEYS.length &&
    CREDENTIAL_BUNDLE_KEYS.every((key) =>
      isLearningFixtureCredentialPair(value[key]),
    )
  );
}

// Read-side counterpart used by tests/e2e/learning-experience.spec.ts. Kept
// here (not in the spec) because importing the spec file itself into Vitest
// throws -- Playwright's test() rejects being called outside its runner --
// so this is the only place both the spec and this file's own contract
// tests can safely share the fail-closed file-reading contract.
export async function readRunScopedLearningFixtureCredentialFile(
  path,
  fsPort = { readFile, stat },
) {
  let stats;
  try {
    stats = await fsPort.stat(path);
  } catch {
    throw new Error(LEARNING_FIXTURE_CREDENTIAL_FALLBACK_SENTINEL);
  }
  if ((stats.mode & 0o777) !== CREDENTIAL_FILE_MODE) {
    throw new Error(LEARNING_FIXTURE_CREDENTIAL_FALLBACK_SENTINEL);
  }
  let raw;
  try {
    raw = await fsPort.readFile(path, 'utf8');
  } catch {
    throw new Error(LEARNING_FIXTURE_CREDENTIAL_FALLBACK_SENTINEL);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(LEARNING_FIXTURE_CREDENTIAL_FALLBACK_SENTINEL);
  }
  if (!isLearningFixtureCredentialBundle(parsed)) {
    throw new Error(LEARNING_FIXTURE_CREDENTIAL_FALLBACK_SENTINEL);
  }
  return {
    nonOwnerTeacher: parsed.nonOwnerTeacher,
    ownerTeacher: parsed.ownerTeacher,
    student: parsed.student,
  };
}

// One identity's full create -> assign role/login_account -> verify
// pipeline. Every call must complete (including verifyFixtureProfile) before
// runProvisionWorkflow is allowed to write any credential file -- a teacher
// whose role update silently failed on Hosted (this file's root-caused bug,
// Issue #41) must never reach the Playwright step's credential file.
async function provisionIdentity({ environment, expectedRole, kind, ports }) {
  const email = deriveRunScopedEmail(
    environment.runId,
    environment.runAttempt,
    kind,
  );
  const password = generateSecurePassword();
  const appMetadata = buildFixtureAppMetadata({ ...environment, kind });
  const loginAccount = deriveRunScopedLoginAccount(
    environment.runId,
    environment.runAttempt,
    kind,
  );

  const userId = await ports.auth.createIdentity({
    appMetadata,
    email,
    password,
  });

  const updatedRowCount = await ports.database.provisionProfile(userId, {
    loginAccount,
    role: expectedRole,
  });
  if (updatedRowCount !== 1) {
    fail('LEARNING_FIXTURE_PROVISION_LOGIN_ACCOUNT_UPDATE_FAILED');
  }

  const profile = await ports.database.verifyFixtureProfile(userId);
  if (
    profile.profiles !== 1 ||
    profile.role !== expectedRole ||
    profile.loginAccount !== loginAccount ||
    profile.wallets !== 1 ||
    profile.walletTokenBalance !== 0
  ) {
    fail('LEARNING_FIXTURE_PROVISION_CARDINALITY_INVALID');
  }

  return { email, password };
}

export async function runProvisionWorkflow({ environment, ports }) {
  const student = await provisionIdentity({
    environment,
    expectedRole: 'student',
    kind: 'student',
    ports,
  });
  const ownerTeacher = await provisionIdentity({
    environment,
    expectedRole: 'teacher',
    kind: 'owner-teacher',
    ports,
  });
  const nonOwnerTeacher = await provisionIdentity({
    environment,
    expectedRole: 'teacher',
    kind: 'non-owner-teacher',
    ports,
  });

  await ports.filesystem.writeCredentialFile(environment.credentialFilePath, {
    nonOwnerTeacher: {
      email: nonOwnerTeacher.email,
      password: nonOwnerTeacher.password,
    },
    ownerTeacher: {
      email: ownerTeacher.email,
      password: ownerTeacher.password,
    },
    student: { email: student.email, password: student.password },
  });
  return {
    nonOwnerTeacherEmail: nonOwnerTeacher.email,
    ownerTeacherEmail: ownerTeacher.email,
    studentEmail: student.email,
  };
}

function createPorts(runtime) {
  const client = createClient(runtime.url, runtime.secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return {
    auth: {
      async createIdentity({ appMetadata, email, password }) {
        const result = await client.auth.admin.createUser({
          app_metadata: appMetadata,
          email,
          email_confirm: true,
          password,
        });
        if (result.error || !result.data.user) {
          fail('LEARNING_FIXTURE_PROVISION_AUTH_CREATE_FAILED');
        }
        return result.data.user.id;
      },
    },
    database: {
      async provisionProfile(userId, { loginAccount, role }) {
        const result = await client
          .from('profiles')
          .update({ login_account: loginAccount, role })
          .eq('id', userId)
          .select('id');
        if (result.error) {
          fail('LEARNING_FIXTURE_PROVISION_LOGIN_ACCOUNT_UPDATE_FAILED');
        }
        return (result.data ?? []).length;
      },
      async verifyFixtureProfile(userId) {
        const [profileResult, walletResult] = await Promise.all([
          client
            .from('profiles')
            .select('role, login_account')
            .eq('id', userId),
          client.from('wallets').select('token_balance').eq('user_id', userId),
        ]);
        if (profileResult.error || walletResult.error) {
          fail('LEARNING_FIXTURE_PROVISION_CARDINALITY_CHECK_FAILED');
        }
        const profiles = profileResult.data ?? [];
        const wallets = walletResult.data ?? [];
        return {
          loginAccount: profiles[0]?.login_account ?? null,
          profiles: profiles.length,
          role: profiles[0]?.role ?? null,
          walletTokenBalance: wallets[0]?.token_balance ?? null,
          wallets: wallets.length,
        };
      },
    },
    filesystem: {
      async writeCredentialFile(path, credentials) {
        await writeFile(path, `${JSON.stringify(credentials)}\n`, {
          flag: 'wx',
          mode: CREDENTIAL_FILE_MODE,
        });
        await chmod(path, CREDENTIAL_FILE_MODE);
      },
    },
  };
}

// Any caught error, whatever its true message (a raw Supabase SDK error can
// embed the request URL or other detail), is reduced to one of this file's
// own fixed LEARNING_FIXTURE_* sentinels before it ever reaches stdout,
// stderr, or GitHub Actions logs -- never the original error text.
export function sanitizeProvisionFailure(error) {
  return error instanceof Error &&
    /^LEARNING_FIXTURE_[A-Z0-9_]+$/u.test(error.message)
    ? error.message
    : 'LEARNING_FIXTURE_PROVISION_FAILED';
}

async function main() {
  const environment = validateProvisionerEnvironment(process.env);
  await runProvisionWorkflow({ environment, ports: createPorts(environment) });
  process.stdout.write('LEARNING_FIXTURE_PROVISION_COMPLETE\n');
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    process.stderr.write(`${sanitizeProvisionFailure(error)}\n`);
    process.exitCode = 1;
  });
}
