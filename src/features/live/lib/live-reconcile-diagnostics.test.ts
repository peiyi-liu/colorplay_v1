import { types } from 'node:util';
import { afterEach, expect, it, vi } from 'vitest';
import {
  captureLiveReconcileProjection,
  createLiveReconcileDiagnostics,
  emitLiveTrace,
  liveTraceEvents,
} from './live-reconcile-diagnostics';

interface Slot {
  v: number;
  g: number;
  o: number;
  c: number[];
  l: number[][];
  p: number[][];
  h: number[][];
  t: number[][];
  f: number[];
  x: boolean;
  q: string;
}
const install = () => {
  const slot = { v: 1 } as Slot;
  Object.defineProperty(window, '__colorplayCapacityRealtime', {
    configurable: true,
    value: { liveTrace: slot },
  });
  const trace = createLiveReconcileDiagnostics();
  expect(trace).toBeDefined();
  return { slot, trace };
};
const project = (slot: Slot) =>
  captureLiveReconcileProjection(slot.q, types.isProxy);
afterEach(() => {
  Reflect.deleteProperty(window, '__colorplayCapacityRealtime');
  vi.restoreAllMocks();
});

it('is off without the controlled data slot and never calls a slot getter', () => {
  expect(createLiveReconcileDiagnostics()).toBeUndefined();
  const getter = vi.fn(() => ({}));
  Object.defineProperty(window, '__colorplayCapacityRealtime', {
    configurable: true,
    get: getter,
  });
  expect(createLiveReconcileDiagnostics()).toBeUndefined();
  expect(getter).not.toHaveBeenCalled();
});

it('records actual active and queued start ordinals until their corresponding work settles', () => {
  const { slot, trace } = install();
  emitLiveTrace(trace, 'SCHED_AUTH');
  expect(project(slot).slice(68, 70)).toEqual([1, 0]);
  emitLiveTrace(trace, 'SCHED_START');
  emitLiveTrace(trace, 'READ_START');
  emitLiveTrace(trace, 'COORD_QUEUE');
  const during = project(slot);
  expect(during[66]).toBe(2);
  expect(during[70]).toBe(3);
  expect(during[72]).toBe(4);
  emitLiveTrace(trace, 'READ_RETURN', { stateVersion: 11, currentPosition: 5 });
  expect(project(slot).slice(70, 72)).toEqual([-1, -1]);
  emitLiveTrace(trace, 'READ_START');
  expect(project(slot).slice(72, 74)).toEqual([-1, -1]);
  emitLiveTrace(trace, 'READ_FAIL');
  emitLiveTrace(trace, 'SCHED_FAIL');
  expect(project(slot).slice(66, 74)).toEqual(Array(8).fill(-1));
  expect(project(slot)[75]).toBe(liveTraceEvents.indexOf('READ_FAIL'));
});

it('does not allow an old document-trace generation to overwrite a new generation', () => {
  const { slot, trace } = install();
  emitLiveTrace(trace, 'READ_START');
  const next = createLiveReconcileDiagnostics();
  emitLiveTrace(next, 'SDK_CALLBACK', { payload: { state_version: 11 } });
  const before = slot.q;
  emitLiveTrace(trace, 'READ_RETURN', { stateVersion: 99 });
  expect(slot.q).toBe(before);
  expect(project(slot)[2]).toBe(2);
});

it('retains bounded counters and last progress after head/tail overflow without persisting payloads', () => {
  const { slot, trace } = install();
  for (let version = 1; version <= 100; version += 1) {
    emitLiveTrace(trace, 'SDK_CALLBACK', { payload: { state_version: 11 } });
    emitLiveTrace(trace, 'HANDLER_AUTHORITATIVE', {
      state_version: version,
      session_id: 'PRIVATE_SESSION',
      question: 'PRIVATE_QUESTION',
      options: ['PRIVATE_ANSWER'],
      auth: 'PRIVATE_TOKEN',
      error: new Error('PRIVATE_ERROR'),
    });
  }
  expect(project(slot)[1]).toBe(2);
  expect(slot.c[0]).toBe(100);
  expect(slot.l[1]?.[2]).toBe(100);
  expect(slot.h).toHaveLength(4);
  expect(slot.t).toHaveLength(12);
  expect(JSON.stringify(slot)).not.toContain('PRIVATE');
  expect(Buffer.byteLength(JSON.stringify(slot))).toBeLessThanOrEqual(4096);
  expect(Buffer.byteLength(slot.q)).toBeLessThanOrEqual(768);
});

it('bounds the real worst-case serialized browser and Node shapes', () => {
  const { slot, trace } = install();
  slot.o = 999999;
  slot.c = Array(32).fill(31250) as number[];
  slot.c[0] = 31249;
  slot.l = Array.from({ length: 6 }, () => [999999, 31, 1000000, 20, 86400000]);
  slot.h = Array.from({ length: 4 }, () => [999999, 31, 1000000, 20, 86400000]);
  slot.t = Array.from({ length: 12 }, () => [
    999999, 31, 1000000, 20, 86400000,
  ]);
  slot.p = Array.from({ length: 4 }, () => [999999, 86400000]);
  slot.f = [999999, 19, 1000000, 20, 86400000];
  emitLiveTrace(trace, 'READ_FAIL');
  expect(project(slot)).toHaveLength(79);
  expect(Buffer.byteLength(slot.q)).toBeLessThanOrEqual(768);
  expect(Buffer.byteLength(JSON.stringify(slot))).toBeLessThanOrEqual(4096);
  emitLiveTrace(trace, 'SDK_CALLBACK', { payload: { state_version: 11 } });
  expect(project(slot)).toEqual([1, 3]);
});

it.each([
  '[-0,0]',
  '[1,0.0]',
  '[1,0e0]',
  '[1,Infinity]',
  '[1,NaN]',
  '[1,01]',
  '[1,-2]',
  '[1,4]',
  '[1,1]',
  '[1,0,0]',
  '[1,"PRIVATE"]',
  '[1,0]'.repeat(200),
  '[1,9007199254740993]',
])('rejects malformed/noncanonical numeric wire data %s', (raw) => {
  expect(captureLiveReconcileProjection(raw, types.isProxy)).toEqual([1, 3]);
});

it('rejects out-of-range indexes and impossible count totals', () => {
  const { slot, trace } = install();
  emitLiveTrace(trace, 'SDK_CALLBACK', { payload: { state_version: 11 } });
  const good = project(slot);
  for (const [index, value] of [
    [0, 2],
    [2, 10000],
    [4, 2],
    [37, 32],
    [38, 1000001],
    [40, 86400001],
  ] as const) {
    const bad = [...good];
    bad[index] = value;
    expect(captureLiveReconcileProjection(bad, types.isProxy)).toEqual([1, 3]);
  }
  expect(captureLiveReconcileProjection(good, types.isProxy)).toEqual(good);
});

it('rejects Node Proxy/accessor/function/custom-prototype without invoking their callbacks', () => {
  let calls = 0;
  const accessor = [1, 0];
  Object.defineProperty(accessor, '1', {
    get: () => {
      calls += 1;
      return 0;
    },
  });
  const proxy = new Proxy([1, 0], {
    get: () => {
      calls += 1;
      throw Error();
    },
  });
  const fn = Object.defineProperty(() => undefined, 'q', {
    get: () => {
      calls += 1;
      return '[1,0]';
    },
  });
  const custom: unknown = Object.setPrototypeOf([1, 0], {});
  for (const raw of [accessor, proxy, fn, custom, { q: '[1,0]' }]) {
    expect(captureLiveReconcileProjection(raw, types.isProxy)).toEqual([1, 3]);
  }
  expect(calls).toBe(0);
});

it('does not read inherited or own payload getters, and still isolates a throwing observer', () => {
  const { slot, trace } = install();
  let calls = 0;
  emitLiveTrace(
    trace,
    'HANDLER_AUTHORITATIVE',
    Object.create({
      get state_version() {
        calls += 1;
        return 11;
      },
    }),
  );
  expect(project(slot)).toEqual([1, 3]);
  emitLiveTrace(trace, 'HANDLER_AUTHORITATIVE', {
    get state_version() {
      calls += 1;
      return 11;
    },
  });
  expect(calls).toBe(0);
  expect(() => {
    emitLiveTrace(
      {
        event: () => {
          throw Error('PRIVATE');
        },
      },
      'READ_FAIL',
    );
  }).not.toThrow();
});

it('records the actual handler wire-version instead of an unrelated camel-case alias', () => {
  const { slot, trace } = install();
  const value = { stateVersion: 99, state_version: 11, currentPosition: 5 };
  emitLiveTrace(trace, 'HANDLER_AUTHORITATIVE', value);
  expect(slot.l[1]?.[2]).toBe(11);
  emitLiveTrace(trace, 'CACHE_UPDATE', value);
  expect(slot.l[4]?.[2]).toBe(99);
});

it('marks the original pending scheduler window inactive when disposal cancels it', () => {
  const { slot, trace } = install();
  emitLiveTrace(trace, 'SCHED_ROSTER');
  expect(project(slot)[68]).toBe(1);
  emitLiveTrace(trace, 'SCHED_DISPOSE');
  expect(project(slot).slice(68, 70)).toEqual([-1, -1]);
});

it('keeps the last actual SDK callback version when later status callbacks arrive', () => {
  const { slot, trace } = install();
  emitLiveTrace(trace, 'SDK_CALLBACK', { payload: { state_version: 11 } });
  expect(slot.l[0]?.[2]).toBe(11);
  const received = [...(slot.l[0] ?? [])];
  emitLiveTrace(trace, 'SDK_STATUS');
  expect(slot.c[26]).toBe(1);
  expect(slot.l[0]).toEqual(received);
});

it('refuses malformed SDK payloads and never invokes message or payload getters', () => {
  for (const value of [
    null,
    {},
    { payload: null },
    { payload: { state_version: '11' } },
  ]) {
    const { slot, trace } = install();
    emitLiveTrace(trace, 'SDK_CALLBACK', value);
    expect(project(slot)).toEqual([1, 3]);
  }
  let calls = 0;
  for (const value of [
    {
      get payload() {
        calls += 1;
        return { state_version: 11 };
      },
    },
    {
      payload: {
        get state_version() {
          calls += 1;
          return 11;
        },
      },
    },
  ]) {
    const { slot, trace } = install();
    emitLiveTrace(trace, 'SDK_CALLBACK', value);
    expect(project(slot)).toEqual([1, 3]);
  }
  expect(calls).toBe(0);
});
