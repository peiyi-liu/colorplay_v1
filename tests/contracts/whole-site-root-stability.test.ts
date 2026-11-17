import { execFileSync } from 'node:child_process';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import {
  approveRootHelperClosure,
  createRootHelperDiagnostics,
  linuxClosureNames,
  rootBytesSha256,
  rootHelperDiagnosticsSchema,
  rootSamplerFailureSchema,
} from '../../scripts/concurrency/root-helper-contracts';
import {
  decodeRootSamplerFailure,
  executeRootHelper,
} from '../../scripts/concurrency/root-helper-executor';
import { rootStabilitySchema } from '../../scripts/concurrency/root-stability-contracts';
const stability = () => ({
  attempts: 76,
  elapsedMs: 0,
  stopReason: 'ATTEMPT_CAP',
  lastAttemptOutcome: 'COMPLETE_MISMATCH',
  lastMismatchKinds: ['CHROME_SET'],
  comparisonComplete: true,
  beforeChromeCount: 1,
  afterChromeCount: 2,
  addedCount: 1,
  removedCount: 0,
  changedIdentityCount: 0,
});
const envelope = () => ({
  result: 'HOST_SAMPLE_UNAVAILABLE',
  code: 'PROCESS_TREE_INCOMPLETE',
  stage: 'STABILITY',
  errno: null,
  rawProviderOutput: false,
  stability: stability(),
});
it('runs the actual sampler with pure synthetic providers/time only', () => {
  const result = execFileSync(
    process.platform === 'darwin'
      ? '/opt/homebrew/bin/python3'
      : '/usr/bin/python3',
    ['-B', 'tests/contracts/helpers/root_stability_driver.py'],
    {
      cwd: process.cwd(),
      env: {
        PATH: '/usr/bin:/bin',
        DEVELOPER_DIR: '/Library/Developer/CommandLineTools',
      },
      timeout: 10000,
      maxBuffer: 65536,
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );
  expect(result.toString()).toBe('');
});
it('accepts strict host nested and preserves old absence without defaults', () => {
  expect(decodeRootSamplerFailure(JSON.stringify(envelope()))).toEqual(
    envelope(),
  );
  const old: Record<string, unknown> = { ...envelope() };
  delete old.stability;
  const parsed = decodeRootSamplerFailure(JSON.stringify(old));
  expect(parsed).toEqual(old);
  expect(parsed).not.toHaveProperty('stability');
});
it('retains nullable partial counts and truthful clock failure', () => {
  const value = {
    ...envelope(),
    stage: 'SMAPS',
    stability: {
      ...stability(),
      attempts: 1,
      elapsedMs: 1500,
      stopReason: 'WINDOW_EXHAUSTED',
      lastAttemptOutcome: 'UNOBSERVED',
      comparisonComplete: false,
      lastMismatchKinds: [],
      afterChromeCount: null,
      addedCount: null,
      removedCount: null,
      changedIdentityCount: null,
    },
  };
  expect(decodeRootSamplerFailure(JSON.stringify(value))).toEqual(value);
  const clock = {
    ...value,
    stability: {
      ...value.stability,
      beforeChromeCount: null,
      elapsedMs: null,
      stopReason: 'CLOCK_INVALID',
    },
  };
  expect(decodeRootSamplerFailure(JSON.stringify(clock))).toEqual(clock);
});
const negatives: [string, (value: Record<string, unknown>) => void][] = [
  [
    'unknown outer code',
    (v) => {
      v.code = 'PRIVATE';
    },
  ],
  [
    'unknown outer stage',
    (v) => {
      v.stage = 'PRIVATE';
    },
  ],
  [
    'backend',
    (v) => {
      v.result = 'BACKEND_SAMPLE_UNAVAILABLE';
    },
  ],
  [
    'ordinary guard',
    (v) => {
      v.code = 'PROCESS_OWNER_CHANGED';
    },
  ],
  [
    'other stage',
    (v) => {
      v.stage = 'PROFILE';
    },
  ],
  [
    'errno',
    (v) => {
      v.errno = 'EACCES';
    },
  ],
  [
    'outer extra',
    (v) => {
      v.PRIVATE = 'PRIVATE';
    },
  ],
];
it.each(negatives)(
  'rejects nested incompatible %s without washing into UNKNOWN',
  (_name, mutate) => {
    const value: Record<string, unknown> = envelope();
    mutate(value);
    expect(decodeRootSamplerFailure(JSON.stringify(value))).toBeUndefined();
  },
);
const badNested: [string, Record<string, unknown>][] = [
  ['extra', { PRIVATE: 'PRIVATE' }],
  ['attempt boolean', { attempts: true }],
  ['attempt cap', { attempts: 77 }],
  ['attempt fractional', { attempts: 1.5 }],
  ['elapsed huge', { elapsedMs: 30001 }],
  ['count huge', { beforeChromeCount: 65537 }],
  ['count bool', { addedCount: false }],
  ['sum', { afterChromeCount: 3 }],
  ['removed overflow', { removedCount: 2, afterChromeCount: 0 }],
  [
    'changed overflow',
    {
      changedIdentityCount: 2,
      lastMismatchKinds: ['CHROME_SET', 'CHROME_IDENTITY'],
    },
  ],
  ['duplicate', { lastMismatchKinds: ['CHROME_SET', 'CHROME_SET'] }],
  [
    'node missing mixed',
    { lastMismatchKinds: ['NODE_MISSING', 'NODE_IDENTITY', 'CHROME_SET'] },
  ],
  [
    'node binary without identity',
    { lastMismatchKinds: ['NODE_BINARY', 'CHROME_SET'] },
  ],
  ['private kind', { lastMismatchKinds: ['constructor'] }],
  ['cap count', { attempts: 3 }],
  ['clock false elapsed', { stopReason: 'CLOCK_INVALID' }],
  ['missing elapsed', { elapsedMs: null }],
  ['partial false counts', { comparisonComplete: false }],
  ['complete null', { beforeChromeCount: null }],
  ['set missing kind', { lastMismatchKinds: ['NODE_IDENTITY'] }],
  [
    'identity missing kind',
    {
      addedCount: 0,
      afterChromeCount: 1,
      changedIdentityCount: 1,
      lastMismatchKinds: ['NODE_IDENTITY'],
    },
  ],
  ['zero attempts', { attempts: 0 }],
  [
    'stable with mismatch',
    {
      lastAttemptOutcome: 'STABLE_AFTER_DEADLINE',
      stopReason: 'WINDOW_EXHAUSTED',
    },
  ],
];
it.each(badNested)('strict nested rejects %s', (_name, delta) => {
  const value = { ...envelope(), stability: { ...stability(), ...delta } };
  expect(rootSamplerFailureSchema.safeParse(value).success).toBe(false);
  expect(decodeRootSamplerFailure(JSON.stringify(value))).toBeUndefined();
});
it('rejects NaN/Infinity before serialization and null after JSON encoding', () => {
  for (const elapsedMs of [NaN, Infinity, -Infinity]) {
    expect(
      rootStabilitySchema.safeParse({ ...stability(), elapsedMs }).success,
    ).toBe(false);
    expect(
      decodeRootSamplerFailure(
        JSON.stringify({
          ...envelope(),
          stability: { ...stability(), elapsedMs },
        }),
      ),
    ).toBeUndefined();
  }
});

describe('actual executor callback and journal projection', () => {
  it.each(['valid', 'invalid'] as const)(
    'keeps original nonzero rejection for %s nested',
    async (kind) => {
      const files = Object.fromEntries(
        linuxClosureNames.map((n) => [n, 'a'.repeat(64)]),
      );
      const text = JSON.stringify({
        schemaVersion: 1,
        sourceRevision: 'b'.repeat(40),
        executionProfileSha256: 'c'.repeat(64),
        files,
      });
      const authority = approveRootHelperClosure(
        text,
        rootBytesSha256(text),
        'b'.repeat(40),
        'c'.repeat(64),
        files,
      );
      const stdout = new PassThrough(),
        stdin = new PassThrough();
      let close:
        | ((code: number | null, signal: NodeJS.Signals | null) => void)
        | undefined;
      const diagnostics = createRootHelperDiagnostics(),
        trace = diagnostics.begin('linux-host-sample.py', 0);
      const task = executeRootHelper(
        'linux-host-sample.py',
        [],
        null,
        new AbortController().signal,
        authority,
        {
          platform: 'linux',
          killGroup: () => {
            throw Error('UNEXPECTED_KILL');
          },
          spawn: () => ({
            pid: 123,
            stdout,
            stdin,
            onError: () => undefined,
            onClose: (fn) => {
              close = fn;
            },
          }),
        },
        trace.observe,
      );
      const body =
        kind === 'valid'
          ? envelope()
          : {
              ...envelope(),
              stability: { ...stability(), PRIVATE: 'PRIVATE' },
            };
      stdout.emit('data', Buffer.from(JSON.stringify(body)));
      expect(
        diagnostics
          .snapshot()
          .calls[0]?.events.some((e) => e.event === 'CLOSE'),
      ).toBe(false);
      close?.(1, null);
      await expect(task).rejects.toThrow('ROOT_HELPER_INVALID');
      trace.finish();
      const snapshot = diagnostics.snapshot(),
        result = snapshot.calls[0]?.events.find((e) => e.event === 'ENVELOPE');
      expect(rootHelperDiagnosticsSchema.safeParse(snapshot).success).toBe(
        true,
      );
      expect(result).toMatchObject({
        envelopeState: kind === 'valid' ? 'OBSERVED' : 'UNAVAILABLE',
      });
      if (kind === 'valid')
        expect(result).toMatchObject({ envelope: envelope() });
      expect(snapshot.calls[0]?.firstFailure?.event).toBe('CLOSE');
      expect(JSON.stringify(snapshot)).not.toContain('PRIVATE');
    },
  );
});

it('actual Python failure envelopes survive the bounded decoder strict wire contract', () => {
  const raw = execFileSync(
    process.platform === 'darwin'
      ? '/opt/homebrew/bin/python3'
      : '/usr/bin/python3',
    ['-B', 'tests/contracts/helpers/root_stability_driver.py', '--envelopes'],
    {
      cwd: process.cwd(),
      env: { PATH: '/usr/bin:/bin' },
      timeout: 10000,
      maxBuffer: 65536,
    },
  ).toString();
  const values: unknown = JSON.parse(raw);
  expect(Array.isArray(values)).toBe(true);
  if (!Array.isArray(values)) throw Error('SYNTHETIC_ENVELOPES_REQUIRED');
  expect(values).toHaveLength(5);
  for (const value of values) {
    expect(rootSamplerFailureSchema.safeParse(value).success).toBe(true);
    expect(decodeRootSamplerFailure(JSON.stringify(value))).toEqual(value);
  }
  expect(raw).not.toMatch(/pid|path|PRIVATE|nonce|hash/iu);
});

it.each([
  ['window before deadline', 'WINDOW_EXHAUSTED', 0],
  ['attempt cap after deadline', 'ATTEMPT_CAP', 2000],
  ['attempt cap outside numeric tolerance', 'ATTEMPT_CAP', 1500 + 2e-9],
] as const)(
  'rejects impossible reason/elapsed: %s',
  (_name, stopReason, elapsedMs) => {
    const body = {
      ...envelope(),
      stability: { ...stability(), stopReason, elapsedMs },
    };
    if (stopReason === 'WINDOW_EXHAUSTED') {
      Object.assign(body.stability, {
        lastAttemptOutcome: 'STABLE_AFTER_DEADLINE',
        lastMismatchKinds: [],
        afterChromeCount: 1,
        addedCount: 0,
      });
    }
    expect(rootSamplerFailureSchema.safeParse(body).success).toBe(false);
    expect(decodeRootSamplerFailure(JSON.stringify(body))).toBeUndefined();
  },
);
it('observes exact1500ms deadline and strictly earlier attempt-cap boundaries', () => {
  const late = {
    ...envelope(),
    stability: {
      ...stability(),
      stopReason: 'WINDOW_EXHAUSTED',
      elapsedMs: 1500,
      lastAttemptOutcome: 'STABLE_AFTER_DEADLINE',
      lastMismatchKinds: [],
      afterChromeCount: 1,
      addedCount: 0,
    },
  };
  expect(decodeRootSamplerFailure(JSON.stringify(late))).toEqual(late);
  const cap = {
    ...envelope(),
    stability: { ...stability(), elapsedMs: 1499.999 },
  };
  expect(decodeRootSamplerFailure(JSON.stringify(cap))).toEqual(cap);
});

it('preserves Python raw boundary elapsed with only1e-9ms numeric tolerance', () => {
  const started = 0.8451685194757863;
  const elapsedMs = (started + 1.5 - started) * 1000;
  expect(elapsedMs).toBe(1499.9999999999998);
  for (const raw of [elapsedMs, 1500]) {
    const body = {
      ...envelope(),
      stability: {
        ...stability(),
        stopReason: 'WINDOW_EXHAUSTED',
        elapsedMs: raw,
        lastAttemptOutcome: 'STABLE_AFTER_DEADLINE',
        lastMismatchKinds: [],
        afterChromeCount: 1,
        addedCount: 0,
      },
    };
    expect(decodeRootSamplerFailure(JSON.stringify(body))).toEqual(body);
    expect(
      decodeRootSamplerFailure(JSON.stringify(body))?.stability?.elapsedMs,
    ).toBe(raw);
  }
  for (const raw of [1500, 1500 + 0.5e-9]) {
    const body = {
      ...envelope(),
      stability: { ...stability(), elapsedMs: raw },
    };
    expect(decodeRootSamplerFailure(JSON.stringify(body))).toEqual(body);
  }
  const tooEarly = {
    ...envelope(),
    stability: {
      ...stability(),
      stopReason: 'WINDOW_EXHAUSTED',
      elapsedMs: 1500 - 2e-9,
    },
  };
  expect(decodeRootSamplerFailure(JSON.stringify(tooEarly))).toBeUndefined();
});
