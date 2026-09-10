import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Mirrors record-staging-monitor-proof.mjs's poll constants (not statically imported: no .d.mts was added).
const MARKER_POLL_BUDGET_MS = 30_000;
const MARKER_POLL_INTERVAL_MS = 5_000;
const MARKER_REQUEST_TIMEOUT_MS = 15_000;

const repositoryRoot = resolve(import.meta.dirname, '../..');
const script = resolve(
  repositoryRoot,
  'scripts/admin/record-staging-monitor-proof.mjs',
);
const revision = 'a'.repeat(40);
const projectRef = 'onkxnkzeixpezetkmocf';
const syntheticSecret = 'synthetic-access-token-do-not-log';
const hostilePath = '/private/tmp/synthetic-monitor-proof-secret.json';

let fixtureRoot = '';
let preload = '';
let requestLog = '';
let markerLog = '';
let sleepLog = '';
let abortTimeoutLog = '';

beforeEach(async () => {
  fixtureRoot = await mkdtemp(
    resolve(tmpdir(), 'colorplay-monitor-proof-diagnostics-'),
  );
  const artifactDirectory = resolve(
    fixtureRoot,
    'artifacts/acceptance/admin-ui',
  );
  await mkdir(artifactDirectory, { recursive: true });
  await writeFile(
    resolve(artifactDirectory, 'staging-artifact-auth.json'),
    JSON.stringify({
      gitSha: revision,
      intendedOrigin: 'https://staging.colorplayapp.com',
      projectRef,
      results: [
        { profileLoaded: true, role: 'student' },
        { profileLoaded: true, role: 'teacher' },
      ],
    }),
  );
  preload = resolve(fixtureRoot, 'fake-fetch.mjs');
  requestLog = resolve(fixtureRoot, 'management-requests.ndjson');
  markerLog = resolve(fixtureRoot, 'marker-attempts.ndjson');
  sleepLog = resolve(fixtureRoot, 'sleep-calls.ndjson');
  abortTimeoutLog = resolve(fixtureRoot, 'abort-timeout-calls.ndjson');
  await writeFile(
    preload,
    `
import { appendFileSync } from 'node:fs';

const scenario = process.env.COLORPLAY_MONITOR_TEST_SCENARIO;
const revision = process.env.GITHUB_SHA;
const requestLog = process.env.COLORPLAY_MONITOR_REQUEST_LOG;
const markerLog = process.env.COLORPLAY_MONITOR_MARKER_LOG;
const sleepLog = process.env.COLORPLAY_MONITOR_SLEEP_LOG;
const abortTimeoutLog = process.env.COLORPLAY_MONITOR_ABORT_TIMEOUT_LOG;
const markerSequence = process.env.COLORPLAY_MONITOR_MARKER_SEQUENCE
  ? process.env.COLORPLAY_MONITOR_MARKER_SEQUENCE.split(',').map((token) => {
      const [step, durationRaw] = token.split(':');
      return { durationMs: durationRaw ? Number(durationRaw) : 0, step };
    })
  : null;
const secret = ${JSON.stringify(syntheticSecret)};
const hostilePath = ${JSON.stringify(hostilePath)};

if (scenario === 'unknown-internal') {
  Date.prototype.toISOString = () => {
    throw new Error('unknown internal leaked ' + secret + ' ' + hostilePath);
  };
}

let fakeClockMs = 0;
globalThis.performance.now = () => fakeClockMs;

const originalSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms, ...args) => {
  appendFileSync(sleepLog, JSON.stringify({ ms }) + '\\n');
  fakeClockMs += ms;
  return originalSetTimeout(fn, 0, ...args);
};

const originalAbortSignalTimeout = AbortSignal.timeout;
AbortSignal.timeout = (delay) => {
  appendFileSync(abortTimeoutLog, JSON.stringify({ ms: delay }) + '\\n');
  return originalAbortSignalTimeout(delay);
};

let markerAttempt = 0;

globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  if (url.endsWith('/admin-release.json')) {
    if (markerSequence !== null) {
      const { durationMs, step } =
        markerSequence[Math.min(markerAttempt, markerSequence.length - 1)];
      markerAttempt += 1;
      fakeClockMs += durationMs;
      appendFileSync(markerLog, JSON.stringify({ step }) + '\\n');
      if (step === 'network') {
        throw new Error(
          'marker network leaked ' + secret + ' ' + hostilePath,
        );
      }
      if (step === 'invalid-json') {
        return new Response('not-json{', { status: 200 });
      }
      if (step === 'http-failure') {
        return new Response('', { status: 503 });
      }
      return new Response(
        JSON.stringify(
          step === 'stale'
            ? { environment: 'staging', revision: 'b'.repeat(40) }
            : { environment: 'staging', revision },
        ),
        { status: 200 },
      );
    }
    if (scenario === 'marker-network') {
      throw new Error('marker network leaked ' + secret + ' ' + hostilePath);
    }
    return new Response(
      JSON.stringify(
        scenario === 'marker-invalid'
          ? { environment: 'staging', revision: 'b'.repeat(40) }
          : { environment: 'staging', revision },
      ),
      { status: 200 },
    );
  }

  if (!url.includes('/database/query')) {
    throw new Error('unexpected URL ' + url);
  }
  const query = JSON.parse(String(init.body)).query;
  appendFileSync(requestLog, JSON.stringify({ query, url }) + '\\n');
  if (scenario === 'management-network') {
    throw new Error('management network leaked ' + secret + ' ' + hostilePath);
  }

  const isAtomicQuery =
    /^do \\$colorplay_monitor_proof\\$/u.test(query) &&
    (query.match(/perform public\\.svc_admin_record_monitor_observations/gu) ?? [])
      .length === 1 &&
    (query.match(/perform admin_monitoring\\.enqueue_collection\\(\\)/gu) ?? [])
      .length === 1 &&
    (query.match(/exception when query_canceled or assert_failure or others then/gu) ?? [])
      .length === 2 &&
    query.indexOf('perform public.svc_admin_record_monitor_observations') <
      query.indexOf('perform admin_monitoring.enqueue_collection()');
  if (scenario === 'success' && isAtomicQuery) {
    return new Response('{}', { status: 200 });
  }

  const responses = {
    'auth-401': [401, 'unauthorized ' + secret],
    'auth-403': [403, 'forbidden ' + secret],
    'rate-limited': [429, 'rate limited ' + secret],
    'upstream': [503, 'upstream ' + hostilePath],
    'upstream-record-sql': [
      500,
      JSON.stringify({ message: 'STAGING_MONITOR_PROOF_RECORD_SQL_FAILED' }),
    ],
    'upstream-enqueue-sql': [
      502,
      JSON.stringify({ message: 'STAGING_MONITOR_PROOF_ENQUEUE_SQL_FAILED' }),
    ],
    'record-sql': [
      400,
      JSON.stringify({
        message: 'STAGING_MONITOR_PROOF_RECORD_SQL_FAILED',
        detail: secret,
      }),
    ],
    'enqueue-sql': [
      400,
      JSON.stringify({
        message: 'STAGING_MONITOR_PROOF_ENQUEUE_SQL_FAILED',
        detail: hostilePath,
      }),
    ],
    'query-rejected': [400, 'syntax error ' + secret + ' ' + hostilePath],
    'decorated-record': [
      400,
      JSON.stringify({
        message: 'prefix STAGING_MONITOR_PROOF_RECORD_SQL_FAILED suffix',
      }),
    ],
    success: [400, 'atomic diagnostic query missing ' + secret],
  };
  const [status, body] = responses[scenario] ?? [418, secret];
  return new Response(body, { status });
};
`,
  );
});

afterEach(async () => {
  await rm(fixtureRoot, { force: true, recursive: true });
});

function runScenario(scenario: string, overrides: Record<string, string> = {}) {
  return new Promise<{ code: number | null; stderr: string; stdout: string }>(
    (resolveResult, reject) => {
      const child = spawn(process.execPath, ['--import', preload, script], {
        cwd: fixtureRoot,
        env: {
          COLORPLAY_MONITOR_TEST_SCENARIO: scenario,
          COLORPLAY_MONITOR_REQUEST_LOG: requestLog,
          COLORPLAY_MONITOR_MARKER_LOG: markerLog,
          COLORPLAY_MONITOR_SLEEP_LOG: sleepLog,
          COLORPLAY_MONITOR_ABORT_TIMEOUT_LOG: abortTimeoutLog,
          GITHUB_RUN_ID: '123456',
          GITHUB_SHA: revision,
          STAGING_SUPABASE_ACCESS_TOKEN: syntheticSecret,
          STAGING_SUPABASE_PROJECT_REF: projectRef,
          ...overrides,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stderr = '';
      let stdout = '';
      child.stderr.setEncoding('utf8');
      child.stdout.setEncoding('utf8');
      child.stderr.on('data', (chunk: string) => {
        stderr += chunk;
      });
      child.stdout.on('data', (chunk: string) => {
        stdout += chunk;
      });
      child.once('error', reject);
      child.once('close', (code) => {
        resolveResult({ code, stderr, stdout });
      });
    },
  );
}

function expectSafeFailure(
  result: { code: number | null; stderr: string; stdout: string },
  sentinel: string,
) {
  expect(result.code).toBe(1);
  expect(result.stdout).toBe('');
  expect(result.stderr).toBe(`${sentinel}\n`);
  expect(result.stderr).not.toContain(syntheticSecret);
  expect(result.stderr).not.toContain(hostilePath);
}

function parseManagementRequest(line: string) {
  const value: unknown = JSON.parse(line);
  if (
    value === null ||
    typeof value !== 'object' ||
    !('query' in value) ||
    typeof value.query !== 'string' ||
    !('url' in value) ||
    typeof value.url !== 'string'
  ) {
    throw new Error('INVALID_SYNTHETIC_MANAGEMENT_REQUEST');
  }
  return { query: value.query, url: value.url };
}

async function readNdjsonLines(path: string): Promise<string[]> {
  let content: string;
  try {
    content = await readFile(path, 'utf8');
  } catch {
    return [];
  }
  return content.trim().length === 0 ? [] : content.trim().split('\n');
}

function parseSleepCall(line: string): { ms: number } {
  const value: unknown = JSON.parse(line);
  if (
    value === null ||
    typeof value !== 'object' ||
    !('ms' in value) ||
    typeof value.ms !== 'number'
  ) {
    throw new Error('INVALID_SYNTHETIC_SLEEP_CALL');
  }
  return { ms: value.ms };
}

async function readParsedCalls(path: string): Promise<{ ms: number }[]> {
  return (await readNdjsonLines(path)).map(parseSleepCall);
}

// 30000 divides evenly by 5000: an all-instant sustained failure spends
// exactly 6 request/sleep pairs before the 7th attempt is skipped outright.
const maxMarkerAttempts = MARKER_POLL_BUDGET_MS / MARKER_POLL_INTERVAL_MS;
const maxMarkerSleeps = maxMarkerAttempts;

describe('Staging monitoring proof diagnostics', () => {
  it.each([
    ['marker-network', 'STAGING_MONITOR_PROOF_MARKER_NETWORK_FAILED'],
    ['marker-invalid', 'STAGING_MONITOR_PROOF_MARKER_INVALID'],
    ['management-network', 'STAGING_MONITOR_PROOF_MANAGEMENT_NETWORK_FAILED'],
    ['auth-401', 'STAGING_MONITOR_PROOF_MANAGEMENT_AUTH_FAILED'],
    ['auth-403', 'STAGING_MONITOR_PROOF_MANAGEMENT_AUTH_FAILED'],
    ['rate-limited', 'STAGING_MONITOR_PROOF_MANAGEMENT_RATE_LIMITED'],
    ['upstream', 'STAGING_MONITOR_PROOF_MANAGEMENT_UPSTREAM_FAILED'],
    ['upstream-record-sql', 'STAGING_MONITOR_PROOF_RECORD_SQL_FAILED'],
    ['upstream-enqueue-sql', 'STAGING_MONITOR_PROOF_ENQUEUE_SQL_FAILED'],
    ['record-sql', 'STAGING_MONITOR_PROOF_RECORD_SQL_FAILED'],
    ['enqueue-sql', 'STAGING_MONITOR_PROOF_ENQUEUE_SQL_FAILED'],
    ['query-rejected', 'STAGING_MONITOR_PROOF_QUERY_REJECTED'],
    ['decorated-record', 'STAGING_MONITOR_PROOF_QUERY_REJECTED'],
    ['unknown-internal', 'STAGING_MONITOR_PROOF_FAILED'],
  ])(
    'classifies %s without leaking raw diagnostics',
    async (scenario, code) => {
      expectSafeFailure(await runScenario(scenario), code);
    },
  );

  it('classifies invalid configuration before network access', async () => {
    expectSafeFailure(
      await runScenario('success', { GITHUB_RUN_ID: 'not-an-integer' }),
      'STAGING_MONITOR_PROOF_CONFIGURATION_INVALID',
    );
  });

  it('classifies malformed artifact evidence', async () => {
    await writeFile(
      resolve(
        fixtureRoot,
        'artifacts/acceptance/admin-ui/staging-artifact-auth.json',
      ),
      '{not-json',
    );
    expectSafeFailure(
      await runScenario('success'),
      'STAGING_MONITOR_PROOF_ARTIFACT_INVALID',
    );
  });

  it('records proof with one atomic query containing both stage guards', async () => {
    const result = await runScenario('success');
    const requests = (await readFile(requestLog, 'utf8'))
      .trim()
      .split('\n')
      .map(parseManagementRequest);

    expect(result).toEqual({
      code: 0,
      stderr: '',
      stdout: 'STAGING_MONITOR_PROOF_RECORDED\n',
    });
    expect(requests).toHaveLength(1);
    const request = requests[0];
    expect(request).toBeDefined();
    if (request === undefined)
      throw new Error('MISSING_SYNTHETIC_MANAGEMENT_REQUEST');
    expect(request.query).toMatch(/^do \$colorplay_monitor_proof\$/u);
    expect(request.query).toContain(
      'perform public.svc_admin_record_monitor_observations',
    );
    expect(request.query).toContain(
      'perform admin_monitoring.enqueue_collection()',
    );
    expect(
      request.query.indexOf(
        'perform public.svc_admin_record_monitor_observations',
      ),
    ).toBeLessThan(
      request.query.indexOf('perform admin_monitoring.enqueue_collection()'),
    );
  });

  it('does not retry a rejected Management API query', async () => {
    expectSafeFailure(
      await runScenario('query-rejected'),
      'STAGING_MONITOR_PROOF_QUERY_REJECTED',
    );
    const requests = (await readFile(requestLog, 'utf8')).trim().split('\n');

    expect(requests).toHaveLength(1);
  });

  const MARKER_RECOVERY_CASES: [string, number, string][] = [
    ['transient marker staleness', 3, 'stale,stale,exact'],
    ['a transient marker network failure', 2, 'network,exact'],
    ['an invalid marker JSON body', 2, 'invalid-json,exact'],
    ['a non-2xx marker response', 2, 'http-failure,exact'],
  ];

  it.each(MARKER_RECOVERY_CASES)(
    'recovers from %s and calls Management API exactly once',
    async (_label, attempts, sequence) => {
      const result = await runScenario('success', {
        COLORPLAY_MONITOR_MARKER_SEQUENCE: sequence,
      });

      expect(result).toEqual({
        code: 0,
        stderr: '',
        stdout: 'STAGING_MONITOR_PROOF_RECORDED\n',
      });
      expect(await readNdjsonLines(markerLog)).toHaveLength(attempts);
      expect(await readNdjsonLines(sleepLog)).toHaveLength(attempts - 1);
      expect(await readNdjsonLines(requestLog)).toHaveLength(1);
    },
  );

  const MARKER_SUSTAINED_CASES: [string, string, string][] = [
    ['marker staleness', 'STAGING_MONITOR_PROOF_MARKER_INVALID', 'stale'],
    [
      'a marker network failure',
      'STAGING_MONITOR_PROOF_MARKER_NETWORK_FAILED',
      'network',
    ],
    [
      'an invalid marker JSON body',
      'STAGING_MONITOR_PROOF_MARKER_INVALID',
      'invalid-json',
    ],
    [
      'a non-2xx marker response',
      'STAGING_MONITOR_PROOF_MARKER_INVALID',
      'http-failure',
    ],
  ];

  it.each(MARKER_SUSTAINED_CASES)(
    'classifies sustained %s as the deadline-exhaustion sentinel without calling Management API',
    async (_label, sentinel, sequence) => {
      const result = await runScenario('success', {
        COLORPLAY_MONITOR_MARKER_SEQUENCE: sequence,
      });

      expectSafeFailure(result, sentinel);
      expect(await readNdjsonLines(markerLog)).toHaveLength(maxMarkerAttempts);
      expect(await readNdjsonLines(requestLog)).toHaveLength(0);
      const sleeps = await readParsedCalls(sleepLog);
      expect(sleeps).toHaveLength(maxMarkerSleeps);
      for (const { ms } of sleeps) expect(ms).toBe(MARKER_POLL_INTERVAL_MS);
    },
  );

  // Each duration stays under its own timeout (one that outran it would abort).
  it('shortens each later request timeout to the time left as slow requests consume the 30s deadline', async () => {
    const result = await runScenario('success', {
      COLORPLAY_MONITOR_MARKER_SEQUENCE: 'stale:14000,network',
    });

    expectSafeFailure(result, 'STAGING_MONITOR_PROOF_MARKER_NETWORK_FAILED');
    const steps = ['stale', 'network', 'network', 'network'].map((step) =>
      JSON.stringify({ step }),
    );
    const abortTimeouts = [15_000, 11_000, 6_000, 1_000].map((ms) => ({ ms }));
    const sleeps = [5_000, 5_000, 5_000, 1_000].map((ms) => ({ ms }));
    const observedAbortTimeouts = await readParsedCalls(abortTimeoutLog);
    const observedSleeps = await readParsedCalls(sleepLog);
    expect(await readNdjsonLines(markerLog)).toEqual(steps);
    expect(observedAbortTimeouts).toEqual(abortTimeouts);
    expect(observedSleeps).toEqual(sleeps);
    expect(await readNdjsonLines(requestLog)).toHaveLength(0);
  });

  // A monotonic clock can leave a fractional number of milliseconds
  // remaining; the real AbortSignal.timeout throws ERR_OUT_OF_RANGE on a
  // non-integer delay. Pre-fix this made the 2nd attempt's fetch never run,
  // misclassified as 'network' instead of reaching the fake fetch at all.
  it('floors a fractional deadline into a valid integer AbortSignal.timeout', async () => {
    const result = await runScenario('success', {
      COLORPLAY_MONITOR_MARKER_SEQUENCE: 'stale:10000.3,exact',
    });

    expect(result).toEqual({
      code: 0,
      stderr: '',
      stdout: 'STAGING_MONITOR_PROOF_RECORDED\n',
    });
    expect(await readNdjsonLines(markerLog)).toEqual(
      ['stale', 'exact'].map((step) => JSON.stringify({ step })),
    );
    const abortTimeouts = (await readParsedCalls(abortTimeoutLog)).slice(0, 2);
    expect(abortTimeouts).toEqual([{ ms: 15_000 }, { ms: 14_999 }]);
    for (const { ms } of abortTimeouts) {
      expect(Number.isInteger(ms)).toBe(true);
      expect(ms).toBeGreaterThan(0);
      expect(ms).toBeLessThanOrEqual(MARKER_REQUEST_TIMEOUT_MS);
    }
    expect(await readNdjsonLines(requestLog)).toHaveLength(1);
  });
});
