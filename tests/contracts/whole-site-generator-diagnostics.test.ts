import { mkdtemp, readFile, lstat, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { capacityJournal } from '../../scripts/concurrency/capacity-runtime';
const required = <T>(value: T | null | undefined): T => {
  if (value === null || value === undefined) throw Error('SYNTHETIC_REQUIRED');
  return value;
};
import { afterEach, expect, it, vi } from 'vitest';
import {
  createGeneratorProfiler,
  type GeneratorProfilerSession,
} from '../../scripts/concurrency/capacity-generator-profiler';
import {
  createGeneratorDiagnostics,
  generatorOperation,
  finishGeneratorJournal,
} from '../../scripts/concurrency/capacity-generator-diagnostics';
const flush = async () => {
  for (let i = 0; i < 25; i++) await Promise.resolve();
};
const profile = () => ({
  nodes: [
    {
      id: 1,
      callFrame: {
        functionName: 'PRIVATE_FUNCTION',
        scriptId: '1',
        url: 'PRIVATE_PATH',
        lineNumber: 1,
        columnNumber: 1,
      },
    },
  ],
  startTime: 100,
  endTime: 200,
  samples: [1],
  timeDeltas: [100],
});
const fixture = () => {
  let now = 0,
    hold: string | undefined,
    errorAt: string | undefined,
    listener: string | undefined;
  const callbacks: ((error: unknown, result?: unknown) => void)[] = [];
  const session: GeneratorProfilerSession = {
    connect: vi.fn(),
    disconnect: vi.fn(),
    post: vi.fn<GeneratorProfilerSession['post']>((method, _params, cb) => {
      if (method === hold) callbacks.push(cb);
      else
        cb(
          method === errorAt ? Error('PRIVATE') : null,
          method === 'Profiler.stop' ? { profile: profile() } : {},
        );
    }),
  };
  const p = createGeneratorProfiler({
    session: () => session,
    listener: () => listener,
    now: () => ++now,
  });
  return {
    p,
    session,
    callbacks,
    setHold: (v: string) => {
      hold = v;
    },
    setError: (v: string) => {
      errorAt = v;
    },
    setListener: () => {
      listener = 'PRIVATE';
    },
  };
};
afterEach(() => vi.useRealTimers());
it('uses only internal approved methods, one pending capture and exact private serialized bytes', async () => {
  vi.useFakeTimers();
  const f = fixture();
  f.p.start();
  f.p.start();
  await flush();
  expect(f.session.post).toHaveBeenCalledTimes(3);
  expect(vi.mocked(f.session.post).mock.calls.map((c) => c[0])).toEqual([
    'Profiler.enable',
    'Profiler.setSamplingInterval',
    'Profiler.start',
  ]);
  expect(vi.mocked(f.session.post).mock.calls[1]?.[1]).toEqual({
    interval: 20000,
  });
  await f.p.finish();
  await f.p.finish();
  expect(f.session.disconnect).toHaveBeenCalledTimes(1);
  expect(f.p.snapshot()).toMatchObject({
    collection: 'OBSERVED',
    closed: true,
    pending: 0,
    timerPending: false,
    counts: { nodes: 1, samples: 1 },
  });
  expect(f.p.snapshot().bytes).toBe(Buffer.byteLength(required(f.p.profile())));
  expect(JSON.stringify(f.p.snapshot())).not.toContain('PRIVATE');
  expect(vi.getTimerCount()).toBe(0);
});
it.each([
  'Profiler.enable',
  'Profiler.setSamplingInterval',
  'Profiler.start',
  'Profiler.stop',
  'Profiler.disable',
])(
  'method failure %s never produces raw or changes original operations',
  async (method) => {
    vi.useFakeTimers();
    const f = fixture();
    f.setError(method);
    f.p.start();
    await flush();
    await f.p.finish();
    expect(f.p.snapshot()).toMatchObject({
      collection: 'UNAVAILABLE',
      closed: true,
      pending: 0,
      timerPending: false,
    });
    expect(f.p.profile()).toBeUndefined();
    expect(f.session.disconnect).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  },
);
it('held start does not postpone load; finish cancels pending and fences late callbacks', async () => {
  vi.useFakeTimers();
  const f = fixture();
  f.setHold('Profiler.enable');
  f.p.start();
  let ran = false;
  await generatorOperation(undefined, 'LANDING', 0, () => {
    ran = true;
    return Promise.resolve();
  });
  expect(ran).toBe(true);
  await f.p.finish();
  const before = JSON.stringify(f.p.snapshot());
  f.callbacks[0]?.(null, {});
  await flush();
  expect(JSON.stringify(f.p.snapshot())).toBe(before);
  expect(f.p.snapshot()).toMatchObject({
    collection: 'UNAVAILABLE',
    closed: true,
    pending: 0,
    timerPending: false,
  });
  expect(vi.getTimerCount()).toBe(0);
});
it('cooperative deadline stops once and callback timeout disconnects without late mutation', async () => {
  vi.useFakeTimers();
  const f = fixture();
  f.p.start();
  await flush();
  f.setHold('Profiler.stop');
  await vi.advanceTimersByTimeAsync(60000);
  expect(f.p.snapshot().pending).toBe(1);
  await vi.advanceTimersByTimeAsync(1000);
  await f.p.finish();
  const before = JSON.stringify(f.p.snapshot());
  f.callbacks[0]?.(null, { profile: profile() });
  await flush();
  expect(JSON.stringify(f.p.snapshot())).toBe(before);
  expect(f.p.profile()).toBeUndefined();
  expect(f.session.disconnect).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});
it('never touches an existing external listener', async () => {
  vi.useFakeTimers();
  const f = fixture();
  f.setListener();
  f.p.start();
  await flush();
  await f.p.finish();
  expect(f.session.connect).not.toHaveBeenCalled();
  expect(f.session.post).not.toHaveBeenCalled();
  expect(f.p.snapshot().collection).toBe('UNAVAILABLE');
  expect(vi.getTimerCount()).toBe(0);
});
it.each(['nodes', 'samples', 'timeDeltas', 'bytes', 'clock', 'unknown'])(
  'strict profile rejects %s overflow/shape without retaining partial',
  async (kind) => {
    vi.useFakeTimers();
    const f = fixture(),
      value: Record<string, unknown> = profile();
    if (kind === 'nodes')
      value.nodes = Array.from({ length: 10001 }, () => profile().nodes[0]);
    if (kind === 'samples') value.samples = Array(10001).fill(1);
    if (kind === 'timeDeltas') value.timeDeltas = Array(10001).fill(1);
    if (kind === 'bytes')
      value.nodes = [
        {
          ...profile().nodes[0],
          callFrame: {
            ...required(profile().nodes[0]).callFrame,
            url: 'X'.repeat(2097153),
          },
        },
      ];
    if (kind === 'clock') value.endTime = 0;
    if (kind === 'unknown') value.PRIVATE = true;
    vi.mocked(f.session.post).mockImplementation((method, _params, cb) => {
      cb(null, method === 'Profiler.stop' ? { profile: value } : {});
    });
    f.p.start();
    await flush();
    await f.p.finish();
    expect(f.p.profile()).toBeUndefined();
    expect(f.p.snapshot().collection).toBe('UNAVAILABLE');
  },
);
const binding = {
  sourceRevision: 'a'.repeat(40),
  planId: 'wsc-261117-abcdef123456',
  legId: 'anonymous_entry_prepare-native_browser-20',
  executionProfileSha256: 'b'.repeat(64),
};
const diagnosticFixture = () => {
  const f = fixture();
  let now = 100,
    cpu = { user: 100, system: 100 },
    elu = { active: 1, idle: 1, utilization: 0.5 };
  const d = createGeneratorDiagnostics(binding, {
    now: () => now,
    cpu: () => cpu,
    elu: () => elu,
    profiler: f.p,
  });
  return {
    d,
    f,
    advance: () => {
      now += 1000;
      cpu = { user: 2100100, system: 100100 };
      elu = { active: 201, idle: 801, utilization: 0.2 };
    },
    clock: (v: number) => {
      now = v;
    },
  };
};
it('keeps real own-process interval CPU above one core and ELU separate from lifetime stats', async () => {
  vi.useFakeTimers();
  const h = diagnosticFixture();
  h.d.start();
  await flush();
  h.advance();
  h.d.interval(12);
  h.d.health({
    validity: 'VALID',
    lastHostAgeMs: 20,
    lastBackendAgeMs: 40,
    ignored: 'PRIVATE',
  });
  h.d.observe({ phase: 'LANDING', state: 'ENTERED', actorOrdinal: 0 });
  await h.d.finish();
  expect(h.d.snapshot()).toMatchObject({
    ...binding,
    collection: 'OBSERVED',
    sealed: true,
    intervals: [
      {
        elapsedMs: 1000,
        ownUserCpuMs: 2100,
        ownSystemCpuMs: 100,
        eventLoopP95Ms: 12,
      },
    ],
    lastHealthObservation: { validity: 'VALID', lastHostAgeMs: 20 },
  });
  expect(JSON.stringify(h.d.snapshot())).not.toContain('PRIVATE');
  expect(vi.getTimerCount()).toBe(0);
});
it.each(['event', 'interval', 'clock', 'unknown', 'late'])(
  'bounded diagnostics mark %s unavailable without masking operations',
  async (kind) => {
    vi.useFakeTimers();
    const h = diagnosticFixture();
    h.d.start();
    await flush();
    if (kind === 'event')
      for (let i = 0; i < 4097; i++)
        h.d.observe({ phase: 'ARM', state: 'ENTERED', actorOrdinal: 0 });
    if (kind === 'interval')
      for (let i = 0; i < 2049; i++) {
        h.advance();
        h.d.interval(1);
      }
    if (kind === 'clock') {
      h.clock(Number.NaN);
      h.d.observe({ phase: 'ARM', state: 'ENTERED', actorOrdinal: 0 });
    }
    if (kind === 'unknown')
      Reflect.apply(h.d.observe, undefined, [
        { phase: 'PRIVATE', state: 'ENTERED', actorOrdinal: 0 },
      ]);
    await h.d.finish();
    if (kind === 'late')
      h.d.observe({ phase: 'ARM', state: 'ENTERED', actorOrdinal: 0 });
    expect(h.d.snapshot().collection).toBe('UNAVAILABLE');
    expect(
      Buffer.byteLength(JSON.stringify(h.d.snapshot())),
    ).toBeLessThanOrEqual(1048576);
  },
);
it('observer exceptions never mask sync/async operation errors or suppress invocation', async () => {
  const sentinel = Error('PRIVATE'),
    observer = () => {
      throw Error('OBSERVER');
    };
  expect(() =>
    generatorOperation(observer, 'READY', 0, () => {
      throw sentinel;
    }),
  ).toThrow(sentinel);
  await expect(
    generatorOperation(observer, 'READY', 0, () => Promise.reject(sentinel)),
  ).rejects.toBe(sentinel);
  await expect(
    generatorOperation(observer, 'READY', 0, () => Promise.resolve(7)),
  ).resolves.toBe(7);
});
it('writes only existing private journal and preserves prior operation error on writer failure', async () => {
  vi.useFakeTimers();
  const h = diagnosticFixture();
  h.d.start();
  await flush();
  const journal = {
    write: vi.fn((_name: string, _value: unknown) => {
      void _name;
      void _value;
      return Promise.resolve();
    }),
  };
  await finishGeneratorJournal(h.d, journal, false);
  expect(journal.write.mock.calls.map((c) => c[0])).toEqual([
    'generator-node-profile',
    'generator-diagnostics',
  ]);
  const other = diagnosticFixture();
  other.d.start();
  await flush();
  const error = Error('WRITE'),
    bad = { write: vi.fn(() => Promise.reject(error)) };
  await expect(
    finishGeneratorJournal(other.d, bad, true),
  ).resolves.toBeUndefined();
  const third = diagnosticFixture();
  third.d.start();
  await flush();
  await expect(
    finishGeneratorJournal(third.d, bad, false),
  ).resolves.toBeUndefined();
  expect(bad.write).toHaveBeenCalledTimes(4);
  expect(third.d.snapshot().collection).toBe('UNAVAILABLE');
});

it('one close budget covers stop plus disable; disconnect error cannot claim closed', async () => {
  vi.useFakeTimers();
  const f = fixture();
  f.p.start();
  await flush();
  f.setHold('Profiler.stop');
  const done = f.p.finish();
  await vi.advanceTimersByTimeAsync(800);
  f.setHold('Profiler.disable');
  f.callbacks[0]?.(null, { profile: profile() });
  await flush();
  await vi.advanceTimersByTimeAsync(200);
  await done;
  expect(f.p.snapshot()).toMatchObject({
    collection: 'UNAVAILABLE',
    reason: 'CLOSE_TIMEOUT',
    pending: 0,
    timerPending: false,
    closed: true,
  });
  expect(f.p.profile()).toBeUndefined();
  expect(vi.getTimerCount()).toBe(0);
  const other = fixture();
  vi.mocked(other.session.disconnect).mockImplementation(() => {
    throw Error('PRIVATE');
  });
  other.p.start();
  await flush();
  await other.p.finish();
  expect(other.p.snapshot()).toMatchObject({
    collection: 'UNAVAILABLE',
    closed: false,
    reason: 'DISCONNECT_FAILED',
  });
  expect(other.p.profile()).toBeUndefined();
  expect(vi.getTimerCount()).toBe(0);
});

it('actual private writer stores exact UTF8 profile bytes and metadata under0600 only', async () => {
  const directory = await realpath(
    await mkdtemp(join(tmpdir(), 'm38-synthetic-')),
  );
  try {
    const h = diagnosticFixture();
    h.d.start();
    await flush();
    await finishGeneratorJournal(h.d, capacityJournal(directory), false);
    const path = join(directory, 'generator-node-profile.json'),
      bytes = await readFile(path),
      metadata = JSON.parse(
        await readFile(join(directory, 'generator-diagnostics.json'), 'utf8'),
      ) as { profiler: { bytes: number; sha256: string } };
    expect((await lstat(path)).mode & 0o777).toBe(0o600);
    expect(
      (await lstat(join(directory, 'generator-diagnostics.json'))).mode & 0o777,
    ).toBe(0o600);
    expect(metadata.profiler.bytes).toBe(bytes.length);
    expect(metadata.profiler.sha256).toBe(
      createHash('sha256').update(bytes).digest('hex'),
    );
    expect(bytes.length).toBeLessThanOrEqual(2097152);
    expect(
      (await readFile(join(directory, 'generator-diagnostics.json'))).length,
    ).toBeLessThanOrEqual(1048576);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it('serializes incremental event rows near linearly instead of the entire journal per row', () => {
  const h = diagnosticFixture(),
    stringify = JSON.stringify;
  let total = 0;
  const spy = vi
    .spyOn(JSON, 'stringify')
    .mockImplementation((value: unknown) => {
      const text = stringify(value);
      total += Buffer.byteLength(text);
      return text;
    });
  try {
    for (let i = 0; i < 2000; i++)
      h.d.observe({ phase: 'PAGE', state: 'COMPLETED', actorOrdinal: 0 });
  } finally {
    spy.mockRestore();
  }
  const snapshot = h.d.snapshot(),
    finalBytes = Buffer.byteLength(JSON.stringify(snapshot));
  expect(snapshot.events).toHaveLength(2000);
  expect(snapshot.collection).toBe('OBSERVED');
  expect(total).toBeLessThan(finalBytes * 3);
});
it('profile write failure still writes unavailable metadata and never replaces successful close', async () => {
  vi.useFakeTimers();
  const h = diagnosticFixture();
  h.d.start();
  await flush();
  const calls: { name: string; value: unknown }[] = [];
  const writer = {
    write: (name: string, value: unknown) => {
      calls.push({ name, value });
      return name === 'generator-node-profile'
        ? Promise.reject(Error('PRIVATE_WRITE'))
        : Promise.resolve();
    },
  };
  await expect(
    finishGeneratorJournal(h.d, writer, false),
  ).resolves.toBeUndefined();
  expect(calls.map((c) => c.name)).toEqual([
    'generator-node-profile',
    'generator-diagnostics',
  ]);
  expect(calls[1]?.value).toMatchObject({
    collection: 'UNAVAILABLE',
    storage: { profile: 'UNAVAILABLE', metadata: 'WRITE_ATTEMPTED' },
  });
  expect(JSON.stringify(calls[1]?.value)).not.toContain('PRIVATE');
});
