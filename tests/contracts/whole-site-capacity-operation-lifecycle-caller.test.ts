import { EventEmitter } from 'node:events';
import { expect, it, vi } from 'vitest';
import type { CapacityRuntime } from '../../scripts/concurrency/capacity-runtime';
import { capacityFixture } from './helpers/whole-site-capacity';
import { parseCapacityScope } from '../../scripts/concurrency/capacity-scope';
import { createCapacityManifest } from '../../scripts/concurrency/capacity-manifest';
import { createCapacityJourneys } from '../../scripts/concurrency/capacity-journeys';
import {
  capacityOperationLifecycleSchema,
  createCapacityOperationLifecycle,
  captureCapacityOperationLifecycle,
} from '../../scripts/concurrency/capacity-operation-diagnostics';
const h = vi.hoisted(() => ({ mode: 'actual', trace: [] as string[] }));
vi.mock('../../scripts/concurrency/capacity-browser-runtime', async (load) => ({
  ...(await load<
    typeof import('../../scripts/concurrency/capacity-browser-runtime')
  >()),
  createNativeCapacityBrowser: () => ({
    start: () => {
      h.trace.push('NATIVE_START');
      return Promise.resolve();
    },
    createActor: (actorIndex: number) =>
      Promise.resolve({
        actorIndex,
        page: Object.assign(new EventEmitter(), { isClosed: () => false }),
        context: {
          newCDPSession: () =>
            Promise.resolve(
              Object.assign(new EventEmitter(), {
                send: () => Promise.resolve(),
                detach: () => {
                  h.trace.push('DETACH');
                  return Promise.resolve();
                },
              }),
            ),
        },
      }),
    close: () => {
      h.trace.push('NATIVE_CLOSE');
      return Promise.resolve();
    },
    snapshot: () => ({ available: true, resourcesClosed: true }),
  }),
}));
vi.mock('../../scripts/concurrency/capacity-collector', () => ({
  createCapacityCollector: () => ({
    start: () => Promise.resolve(),
    stop: () => {
      h.trace.push('COLLECTOR_STOP');
      return Promise.resolve('HEALTH');
    },
    snapshot: () => ({}),
    pending: () => 0,
  }),
}));
vi.mock('../../scripts/concurrency/capacity-browser-entry', () => ({
  runCapacityEntryBarrier: async (options: {
    runtime: {
      start(): Promise<void>;
      createActor(index: number): Promise<unknown>;
    };
  }) => {
    await options.runtime.start();
    await options.runtime.createActor(0);
    return {
      report: {
        result: 'PASS',
        entry: {
          result: 'VALID',
          actorsExpected: 3,
          requestsObserved: 3,
          skewMs: 1,
        },
      },
    };
  },
}));
vi.mock(
  '../../scripts/concurrency/capacity-operation-observer',
  async (load) => {
    const actual =
      await load<
        typeof import('../../scripts/concurrency/capacity-operation-observer')
      >();
    return {
      ...actual,
      createCapacityOperationObserver: (
        ...args: Parameters<typeof actual.createCapacityOperationObserver>
      ) => {
        if (h.mode === 'actual')
          return actual.createCapacityOperationObserver(...args);
        const port: Record<string, unknown> = {
          samples: () => [],
          snapshot: () => ({ physicalRequests: 0, unattributedRequests: 0 }),
          dispose: () => {
            h.trace.push('OBSERVER_DISPOSE');
            return Promise.resolve();
          },
        };
        if (h.mode === 'getter')
          Object.defineProperty(port, 'operationLifecycle', {
            get() {
              throw Error('PRIVATE_SECRET');
            },
          });
        if (h.mode === 'throw')
          port.operationLifecycle = () => {
            throw Error('PRIVATE_SECRET');
          };
        if (h.mode === 'malformed')
          port.operationLifecycle = () => ({
            collection: 'OBSERVED',
            SECRET: 'PRIVATE_SECRET',
          });
        if (h.mode === 'proxy')
          return Promise.resolve(
            new Proxy(port, {
              get() {
                throw Error('PRIVATE_SECRET');
              },
            }),
          );
        return Promise.resolve(port);
      },
    };
  },
);
it.each([
  'actual',
  'missing',
  'getter',
  'throw',
  'malformed',
  'writer',
] as const)(
  'actual journeys finally writer safely captures %s operation port after original close',
  async (mode) => {
    h.mode = mode;
    h.trace = [];
    const f = await capacityFixture(),
      scope = parseCapacityScope(f.input, f.proof),
      manifest = createCapacityManifest(scope),
      leg = manifest.legs[0];
    if (!leg) throw Error('SYNTHETIC_LEG');
    const writes: { name: string; value: unknown }[] = [];
    const sentinel = Error('ORIGINAL_WRITER_ERROR');
    const runtime = {
      scope,
      manifest,
      leg,
      privatePlan: { actors: [] },
      anonymous: () => Promise.resolve({}),
      rootAccounting: () => [],
      journal: {
        directory: 'SYNTHETIC',
        write: (name: string, value: unknown) => {
          h.trace.push('WRITE_' + name);
          writes.push({ name, value });
          return mode === 'writer' && name === 'transport-accounting'
            ? Promise.reject(sentinel)
            : Promise.resolve();
        },
      },
    } as unknown as CapacityRuntime;
    const journey = createCapacityJourneys(
      runtime,
      new AbortController().signal,
      () => undefined,
    );
    expect((await journey.run()).completed).toHaveLength(3);
    if (mode === 'writer') await expect(journey.stop()).rejects.toBe(sentinel);
    else expect(await journey.stop()).toBe('HEALTH');
    const result = writes.find((r) => r.name === 'transport-accounting')
      ?.value as { operationLifecycle: { collection: string }[] };
    expect(result.operationLifecycle[0]?.collection).toBe(
      mode === 'actual'
        ? 'OBSERVED'
        : mode === 'missing' || mode === 'writer'
          ? 'UNOBSERVED'
          : 'UNAVAILABLE',
    );
    expect(h.trace.indexOf('COLLECTOR_STOP')).toBeLessThan(
      h.trace.indexOf('WRITE_transport-accounting'),
    );
    expect(h.trace.indexOf('NATIVE_CLOSE')).toBeLessThan(
      h.trace.indexOf('WRITE_transport-accounting'),
    );
    expect(JSON.stringify(result.operationLifecycle)).not.toMatch(
      /PRIVATE_SECRET|SECRET/,
    );
  },
);
it('capture safely rejects Proxy and oversized fake diagnostic without invoking its getters or making it authority', () => {
  const getter = vi.fn(() => {
    throw Error('PRIVATE_SECRET');
  });
  expect(
    captureCapacityOperationLifecycle(new Proxy({}, { get: getter }))
      .collection,
  ).toBe('UNAVAILABLE');
  expect(getter).not.toHaveBeenCalled();
  const value = createCapacityOperationLifecycle(() => 1).seal();
  expect(
    captureCapacityOperationLifecycle({ operationLifecycle: () => value }),
  ).toEqual(value);
  const huge = { ...value, events: Array(33).fill({}) };
  expect(
    captureCapacityOperationLifecycle({ operationLifecycle: () => huge })
      .collection,
  ).toBe('UNAVAILABLE');
});
it('actual capture enforces serialized UTF8 bytes even for a structurally valid closed oversized snapshot', () => {
  const diag = createCapacityOperationLifecycle(() => 1);
  diag.record('RUN_ENTERED', {
    available: true,
    disposed: false,
    pending: 0,
    activeOperation: 'teacher_dashboard',
    cache: 'cold',
    during: true,
  });
  const small = diag.seal(),
    point = small.events[0];
  if (!point) throw Error('SYNTHETIC_POINT');
  const huge = {
    ...small,
    eventCount: 32,
    events: Array.from({ length: 32 }, (_, i) => ({
      ...point,
      ordinal: i + 1,
    })),
    pendingTotal: 64,
    pendingCaptured: 64,
    pendingAtFirstInvalid: Array.from({ length: 64 }, (_, i) => ({
      ordinal: i + 1,
      operation: 'teacher_dashboard',
      startCdpMs: 123456789012345,
      endCdpMs: 123456789012346,
      status: 200,
      cached: false,
    })),
    firstInvalid: { ...point, reason: 'SETTLE_DEADLINE', kind: 'INVALID' },
    firstSettleDeadline: {
      ...point,
      reason: 'SETTLE_DEADLINE',
      kind: 'INVALID',
    },
  };
  expect(capacityOperationLifecycleSchema.safeParse(huge).success).toBe(true);
  expect(Buffer.byteLength(JSON.stringify(huge))).toBeGreaterThan(16384);
  expect(
    captureCapacityOperationLifecycle({ operationLifecycle: () => huge })
      .collection,
  ).toBe('UNAVAILABLE');
});
