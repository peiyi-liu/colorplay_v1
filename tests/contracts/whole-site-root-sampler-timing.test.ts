import { createCapacityCollector } from '../../scripts/concurrency/capacity-collector';
import { hostSample, vmSample } from './helpers/whole-site-capacity';
const required = <T>(value: T | null | undefined): T => {
  if (value === null || value === undefined) throw Error('SYNTHETIC_REQUIRED');
  return value;
};
import { PassThrough } from 'node:stream';
import { execFileSync } from 'node:child_process';
import { afterEach, expect, it, vi } from 'vitest';
import { samplerTimingSchema } from '../../scripts/concurrency/root-sampler-timing-contracts';
import { decodeRootSamplerTiming } from '../../scripts/concurrency/root-sampler-timing-decoder';
import {
  executeRootHelper,
  decodeRootSamplerFailure,
} from '../../scripts/concurrency/root-helper-executor';
import {
  createRootHelperDiagnostics,
  approveRootHelperClosure,
  linuxClosureNames,
  rootBytesSha256,
  rootHelperDiagnosticsSchema,
  rootHelperEventSchema,
} from '../../scripts/concurrency/root-helper-contracts';
import { linuxHostSampleSchema } from '../../scripts/concurrency/capacity-linux-health';
const timing = () => ({
  collection: 'OBSERVED',
  scope: 'PYTHON_REQUEST_TO_RETURN_ONLY',
  stages: [
    { stage: 'REQUEST', visits: 1, wallMs: 2, ownCpuMs: 1 },
    { stage: 'CONTEXT', visits: 2, wallMs: 3, ownCpuMs: 2 },
  ],
  wallMs: 5,
  ownCpuMs: 3,
  lastStage: 'CONTEXT',
});
const failure = () => ({
  result: 'HOST_SAMPLE_UNAVAILABLE',
  code: 'UNKNOWN',
  stage: 'CONTEXT',
  errno: null,
  rawProviderOutput: false,
  samplerTiming: timing(),
});
const positiveHost = () => ({
  platform: 'linux',
  executionProfileSha256: 'a'.repeat(64),
  sampledAtMonotonicMs: 1,
  instanceSha256: 'a'.repeat(64),
  jobSha256: 'a'.repeat(64),
  generatorCgroupIdentitySha256: 'a'.repeat(64),
  limitChainSha256: 'a'.repeat(64),
  hostMemoryTotalBytes: 1,
  hostLogicalCpu: 4,
  node: { pid: 1, startTicks: '1', uid: 1, bootIdSha256: 'a'.repeat(64) },
  browser: null,
  treeComplete: null,
  browserProcessCount: 0,
  nodeRssBytes: 1,
  nodePssBytes: 1,
  browserTreeRssBytes: null,
  browserTreePssBytes: null,
  nodeCpuLifetimePercentOfOneCore: 1,
  browserCpuLifetimePercentOfOneCore: null,
  hostSwapUsedBytes: 0,
  memoryPsiSomeAvg10Percent: 0,
  memoryPsiFullAvg10Percent: 0,
  hostOomKills: 0,
  memoryAccounting: 'LINUX_SMAPS_ROLLUP_PSS_WITH_SEPARATE_RSS',
  readOnly: true,
});
it('runs actual Python main and positive sample with only synthetic providers/clocks', () => {
  expect(
    execFileSync(
      process.platform === 'darwin'
        ? '/opt/homebrew/bin/python3'
        : '/usr/bin/python3',
      ['-B', 'tests/contracts/helpers/root_sampler_timing_driver.py'],
      {
        env: {
          PATH: '/usr/bin:/bin',
          DEVELOPER_DIR: '/Library/Developer/CommandLineTools',
        },
        timeout: 10000,
        maxBuffer: 65536,
      },
    ).toString(),
  ).toBe('');
});
it('decodes only strict known host body and marks no sample authority', () => {
  expect(decodeRootSamplerTiming(JSON.stringify(failure()))).toEqual({
    collection: 'OBSERVED',
    authority: 'SAMPLE_AUTHORITY_NOT_EVALUATED',
    samplerTiming: timing(),
  });
  expect(decodeRootSamplerFailure(JSON.stringify(failure()))).toEqual(
    failure(),
  );
  const old = { ...failure(), samplerTiming: undefined };
  expect(decodeRootSamplerFailure(JSON.stringify(old))).not.toHaveProperty(
    'samplerTiming',
  );
  expect(decodeRootSamplerTiming(JSON.stringify(old)).collection).toBe(
    'UNOBSERVED',
  );
});
it.each([
  'backend',
  'extra',
  'unknown-stage',
  'unknown-field',
  'partial',
  'oversize',
  'sum',
  'duplicate',
  'bad-last',
  'bounds',
])('rejects %s without raw provider strings', (kind) => {
  const value = structuredClone(failure()) as Record<string, unknown>;
  if (kind === 'backend') value.result = 'BACKEND_SAMPLE_UNAVAILABLE';
  if (kind === 'extra') value.PRIVATE = 'PRIVATE';
  if (kind === 'unknown-stage')
    value.samplerTiming = {
      ...timing(),
      stages: [{ ...timing().stages[0], stage: 'PRIVATE' }],
    };
  if (kind === 'unknown-field')
    value.samplerTiming = { ...timing(), PRIVATE: true };
  if (kind === 'sum') value.samplerTiming = { ...timing(), wallMs: 6 };
  if (kind === 'duplicate')
    value.samplerTiming = {
      ...timing(),
      stages: [timing().stages[0], timing().stages[0]],
    };
  if (kind === 'bad-last')
    value.samplerTiming = { ...timing(), lastStage: 'MEMINFO' };
  if (kind === 'bounds') value.samplerTiming = { ...timing(), ownCpuMs: 30001 };
  const text =
    kind === 'partial'
      ? '{PRIVATE'
      : kind === 'oversize'
        ? ' '.repeat(131073)
        : JSON.stringify(value);
  const result = decodeRootSamplerTiming(text);
  expect(result.collection).toBe('UNAVAILABLE');
  expect(JSON.stringify(result)).not.toContain('PRIVATE');
});
it('validates positive Linux host outer shape while leaving timing optional', () => {
  const host = {
    platform: 'linux',
    executionProfileSha256: 'a'.repeat(64),
    sampledAtMonotonicMs: 1,
    instanceSha256: 'a'.repeat(64),
    jobSha256: 'a'.repeat(64),
    generatorCgroupIdentitySha256: 'a'.repeat(64),
    limitChainSha256: 'a'.repeat(64),
    hostMemoryTotalBytes: 1,
    hostLogicalCpu: 4,
    node: { pid: 1, startTicks: '1', uid: 1, bootIdSha256: 'a'.repeat(64) },
    browser: null,
    treeComplete: null,
    browserProcessCount: 0,
    nodeRssBytes: 1,
    nodePssBytes: 1,
    browserTreeRssBytes: null,
    browserTreePssBytes: null,
    nodeCpuLifetimePercentOfOneCore: 1,
    browserCpuLifetimePercentOfOneCore: null,
    hostSwapUsedBytes: 0,
    memoryPsiSomeAvg10Percent: 0,
    memoryPsiFullAvg10Percent: 0,
    hostOomKills: 0,
    memoryAccounting: 'LINUX_SMAPS_ROLLUP_PSS_WITH_SEPARATE_RSS',
    readOnly: true,
  };
  expect(linuxHostSampleSchema.parse(host)).not.toHaveProperty('samplerTiming');
  expect(
    decodeRootSamplerTiming(
      JSON.stringify({ ...host, samplerTiming: timing() }),
    ).collection,
  ).toBe('OBSERVED');
  expect(
    decodeRootSamplerTiming(
      JSON.stringify({ ...host, nodePssBytes: null, samplerTiming: timing() }),
    ).collection,
  ).toBe('UNAVAILABLE');
});
it('actual executor passively observes timing after close including aborted exit0 without resolving', async () => {
  const stdout = new PassThrough(),
    stdin = new PassThrough(),
    signal = new AbortController(),
    d = createRootHelperDiagnostics(),
    trace = d.begin('linux-host-sample.py', 0);
  let close:
    ((code: number | null, s: NodeJS.Signals | null) => void) | undefined;
  const task = executeRootHelper(
    'linux-host-sample.py',
    [],
    null,
    signal.signal,
    linuxAuthority(),
    {
      platform: 'linux',
      killGroup: vi.fn(),
      spawn: () => ({
        pid: 123,
        stdin,
        stdout,
        onError: () => undefined,
        onClose: (fn) => {
          close = fn;
        },
      }),
    },
    trace.observe,
  );
  const rejected = expect(task).rejects.toThrow('ROOT_HELPER_INVALID');
  signal.abort();
  stdout.emit(
    'data',
    Buffer.from(JSON.stringify({ ...positiveHost(), samplerTiming: timing() })),
  );
  expect(
    d.snapshot().calls[0]?.events.some((e) => e.event === 'HOST_TIMING'),
  ).toBe(false);
  close?.(0, null);
  await rejected;
  trace.finish();
  const value = rootHelperDiagnosticsSchema.parse(d.snapshot()),
    events = required(value.calls[0]).events;
  expect(events.findIndex((e) => e.event === 'CLOSE')).toBeLessThan(
    events.findIndex((e) => e.event === 'HOST_TIMING'),
  );
  expect(events).toContainEqual(
    expect.objectContaining({
      event: 'HOST_TIMING',
      timingState: 'OBSERVED',
      timingAuthority: 'SAMPLE_AUTHORITY_NOT_EVALUATED',
    }),
  );
  expect(events.some((e) => e.event === 'RESOLVE')).toBe(false);
  expect(required(value.calls[0]).firstFailure?.event).toBe('ABORT');
});
it('nullable/unknown timing is explicit, backend cannot carry host sideband', () => {
  const value = {
    ...failure(),
    samplerTiming: {
      collection: 'UNAVAILABLE',
      scope: 'PYTHON_REQUEST_TO_RETURN_ONLY',
      reason: 'CLOCK_INVALID',
    },
  };
  expect(decodeRootSamplerTiming(JSON.stringify(value)).collection).toBe(
    'UNAVAILABLE',
  );
  expect(
    decodeRootSamplerFailure(
      JSON.stringify({ ...value, result: 'BACKEND_SAMPLE_UNAVAILABLE' }),
    ),
  ).toBeUndefined();
  expect(
    samplerTimingSchema.safeParse({ ...timing(), wallMs: NaN }).success,
  ).toBe(false);
  expect(
    rootHelperEventSchema.safeParse({
      event: 'HOST_TIMING',
      state: 'OBSERVED',
      timingState: 'OBSERVED',
      timingAuthority: 'SAMPLE_AUTHORITY_NOT_EVALUATED',
    }).success,
  ).toBe(false);
});

const linuxAuthority = () => {
  const files = Object.fromEntries(
      linuxClosureNames.map((n) => [n, 'c'.repeat(64)]),
    ),
    revision = 'a'.repeat(40),
    profile = 'b'.repeat(64);
  const text = JSON.stringify({
    schemaVersion: 1,
    sourceRevision: revision,
    executionProfileSha256: profile,
    files,
  });
  return approveRootHelperClosure(
    text,
    rootBytesSha256(text),
    revision,
    profile,
    files,
  );
};
afterEach(() => vi.useRealTimers());
it.each(['host-sample.py', 'backend-cgroup-sample.py'] as const)(
  'helper %s cannot emit Linux HostTiming even with Linux-shaped body',
  async (helper) => {
    const stdout = new PassThrough(),
      stdin = new PassThrough(),
      events: unknown[] = [];
    let close:
      ((c: number | null, s: NodeJS.Signals | null) => void) | undefined;
    const task = executeRootHelper(
      helper,
      [],
      null,
      new AbortController().signal,
      helper === 'host-sample.py' ? undefined : linuxAuthority(),
      {
        platform: helper === 'host-sample.py' ? 'darwin' : 'linux',
        killGroup: vi.fn(),
        spawn: () => ({
          pid: 123,
          stdin,
          stdout,
          onError: () => undefined,
          onClose: (fn) => {
            close = fn;
          },
        }),
      },
      (e) => events.push(e),
    );
    stdout.emit(
      'data',
      Buffer.from(
        JSON.stringify({ ...positiveHost(), samplerTiming: timing() }),
      ),
    );
    close?.(0, null);
    await task;
    expect(
      events.some(
        (e) =>
          typeof e === 'object' &&
          e !== null &&
          Reflect.get(e, 'event') === 'HOST_TIMING',
      ),
    ).toBe(false);
  },
);
it('actual collector keeps invalid judgment and next timer ahead of passive hooks', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  let value: number | null = 2;
  const trace: string[] = [],
    timers: number[] = [];
  const c = createCapacityCollector(
    'NATIVE_BROWSER',
    new AbortController().signal,
    {
      now: () => Date.now(),
      loop: () => value,
      host: () => Promise.resolve(hostSample(1000000 + Date.now())),
      vm: () => Promise.resolve(vmSample(9990000 + Date.now())),
      onInvalid: () => {
        trace.push('INVALID');
      },
      passiveLoop: () => {
        trace.push('PASSIVE_LOOP');
        timers.push(vi.getTimerCount());
      },
      passiveHealth: () => {
        trace.push('PASSIVE_HEALTH');
      },
    },
  );
  const start = c.start();
  await vi.advanceTimersByTimeAsync(1000);
  await start;
  trace.length = 0;
  timers.length = 0;
  value = null;
  await vi.advanceTimersByTimeAsync(1000);
  expect(trace.indexOf('INVALID')).toBeGreaterThanOrEqual(0);
  expect(trace.indexOf('PASSIVE_LOOP')).toBeGreaterThan(
    trace.indexOf('INVALID'),
  );
  expect(timers[0]).toBe(3);
  await c.stop();
  expect(c.pending()).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
});
it('original invalid callback error keeps identity and prevents later passive work', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  let value: number | null = 2;
  const sentinel = Error('SYNTHETIC_ORIGINAL'),
    passive = vi.fn();
  const c = createCapacityCollector(
    'NATIVE_BROWSER',
    new AbortController().signal,
    {
      now: () => Date.now(),
      loop: () => value,
      host: () => Promise.resolve(hostSample(1000000 + Date.now())),
      vm: () => Promise.resolve(vmSample(9990000 + Date.now())),
      onInvalid: () => {
        throw sentinel;
      },
      passiveLoop: passive,
    },
  );
  const start = c.start();
  await vi.advanceTimersByTimeAsync(1000);
  await start;
  passive.mockClear();
  value = null;
  await expect(vi.advanceTimersByTimeAsync(1000)).rejects.toBe(sentinel);
  expect(passive).not.toHaveBeenCalled();
  await c.stop();
  expect(c.pending()).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
});
