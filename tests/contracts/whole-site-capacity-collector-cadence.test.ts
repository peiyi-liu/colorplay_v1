import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCapacityCollector } from '../../scripts/concurrency/capacity-collector';
import { hostSample, vmSample } from './helpers/whole-site-capacity';
const deferred = () => {
  let resolve!: (value: unknown) => void;
  const promise = new Promise<unknown>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
afterEach(() => vi.useRealTimers());
describe('actual collector start-relative serial cadence, synthetic clock only', () => {
  it('does not let an extra idle period after a 2100ms sample expire the original 3s guard', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const slow = deferred(),
      starts: number[] = [],
      invalid = vi.fn();
    const c = createCapacityCollector(
      'NATIVE_BROWSER',
      new AbortController().signal,
      {
        now: () => Date.now(),
        loop: () => 2,
        onInvalid: invalid,
        host: () => {
          starts.push(Date.now());
          return starts.length === 2
            ? slow.promise
            : Promise.resolve(hostSample(1000000 + Date.now()));
        },
        vm: () => Promise.resolve(vmSample(9990000 + Date.now())),
      },
    );
    const start = c.start();
    await vi.advanceTimersByTimeAsync(1000);
    await start;
    expect(starts).toEqual([0, 1000]);
    await vi.advanceTimersByTimeAsync(2100);
    slow.resolve(hostSample(1001000));
    await vi.advanceTimersByTimeAsync(950);
    expect(Date.now()).toBe(4050);
    expect(c.snapshot().validity).toBe('VALID');
    expect(invalid).not.toHaveBeenCalled();
    expect(starts).toHaveLength(3);
    expect(starts[2]).toBeGreaterThanOrEqual(3100);
    expect(starts[2]).toBeLessThanOrEqual(3101);
    await c.stop();
    expect(c.pending()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('keeps the original 1s/5s call periods with nonzero sampling costs and parallel kinds', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const calls = { host: [] as number[], resource: [] as number[] };
    const active = { host: 0, resource: 0 },
      max = { host: 0, resource: 0 };
    let parallel = false;
    const sample = (kind: 'host' | 'resource', cost: number) => {
      calls[kind].push(Date.now());
      active[kind]++;
      max[kind] = Math.max(max[kind], active[kind]);
      parallel ||= active.host === 1 && active.resource === 1;
      return new Promise<unknown>((resolve) => {
        setTimeout(() => {
          active[kind]--;
          resolve(
            kind === 'host'
              ? hostSample(1000000 + Date.now())
              : vmSample(9990000 + Date.now()),
          );
        }, cost);
      });
    };
    const c = createCapacityCollector(
      'NATIVE_BROWSER',
      new AbortController().signal,
      {
        now: () => Date.now(),
        loop: () => 2,
        host: () => sample('host', 200),
        vm: () => sample('resource', 700),
      },
    );
    const start = c.start();
    await vi.advanceTimersByTimeAsync(1000);
    await start;
    await vi.advanceTimersByTimeAsync(9700);
    expect(calls.host).toEqual(
      Array.from({ length: 11 }, (_, index) => index * 1000),
    );
    expect(calls.resource).toEqual([0, 5000, 10000]);
    expect(max).toEqual({ host: 1, resource: 1 });
    expect(parallel).toBe(true);
    expect(c.snapshot().validity).toBe('VALID');
    await c.stop();
    expect(c.pending()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each(['host', 'resource'] as const)(
    'overdue %s makes one timer-based next call, without catch-up queue or overlap',
    async (kind) => {
      vi.useFakeTimers();
      vi.setSystemTime(0);
      const slow = deferred(),
        starts: number[] = [];
      let active = 0,
        max = 0;
      const period = kind === 'host' ? 1000 : 5000,
        cost = period + 1100;
      const sample = async () => {
        starts.push(Date.now());
        active++;
        max = Math.max(max, active);
        try {
          if (starts.length === 2) await slow.promise;
          return kind === 'host'
            ? hostSample(1000000 + Date.now())
            : vmSample(9990000 + Date.now());
        } finally {
          active--;
        }
      };
      const c = createCapacityCollector(
        'NATIVE_BROWSER',
        new AbortController().signal,
        {
          now: () => Date.now(),
          loop: () => 2,
          host:
            kind === 'host'
              ? sample
              : () => Promise.resolve(hostSample(1000000 + Date.now())),
          vm:
            kind === 'resource'
              ? sample
              : () => Promise.resolve(vmSample(9990000 + Date.now())),
        },
      );
      const start = c.start();
      await vi.advanceTimersByTimeAsync(1000);
      await start;
      await vi.advanceTimersByTimeAsync(period - 1000 + cost);
      expect(starts).toEqual([0, period]);
      expect(max).toBe(1);
      slow.resolve(null);
      await vi.advanceTimersByTimeAsync(50);
      expect(starts).toHaveLength(3);
      expect(max).toBe(1);
      expect(starts[2]).toBeGreaterThanOrEqual(period + cost);
      expect(starts[2]).toBeLessThanOrEqual(period + cost + 1);
      await vi.advanceTimersByTimeAsync(period - 50 + 1);
      expect(starts).toHaveLength(4);
      expect(max).toBe(1);
      await c.stop();
      expect(c.pending()).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    },
  );
  it.each(['stop', 'abort'] as const)(
    '%s while a sample is pending fences late completion and removes all owned timers',
    async (action) => {
      vi.useFakeTimers();
      vi.setSystemTime(0);
      const slow = deferred(),
        signal = new AbortController(),
        invalid = vi.fn();
      let calls = 0;
      const c = createCapacityCollector('NATIVE_BROWSER', signal.signal, {
        now: () => Date.now(),
        loop: () => 2,
        onInvalid: invalid,
        host: () =>
          ++calls === 2
            ? slow.promise
            : Promise.resolve(hostSample(1000000 + Date.now())),
        vm: () => Promise.resolve(vmSample(9990000 + Date.now())),
      });
      const start = c.start();
      await vi.advanceTimersByTimeAsync(1000);
      await start;
      const notifications = invalid.mock.calls.length;
      if (action === 'abort') signal.abort();
      const stopping = c.stop();
      expect(c.pending()).toBe(1);
      slow.resolve(hostSample(1001000));
      await stopping;
      await vi.advanceTimersByTimeAsync(20000);
      expect(calls).toBe(2);
      expect(invalid).toHaveBeenCalledTimes(notifications);
      expect(c.pending()).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    },
  );
  it('does not restamp a too-long sample and still reports original host_stale', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const slow = deferred(),
      invalid = vi.fn();
    let calls = 0;
    const c = createCapacityCollector(
      'NATIVE_BROWSER',
      new AbortController().signal,
      {
        now: () => Date.now(),
        loop: () => 2,
        onInvalid: invalid,
        host: () =>
          ++calls === 2
            ? slow.promise
            : Promise.resolve(hostSample(1000000 + Date.now())),
        vm: () => Promise.resolve(vmSample(9990000 + Date.now())),
      },
    );
    const start = c.start();
    await vi.advanceTimersByTimeAsync(1000);
    await start;
    await vi.advanceTimersByTimeAsync(4100);
    slow.resolve(hostSample(1005100));
    await Promise.resolve();
    await Promise.resolve();
    const state = c.snapshot();
    expect(state.validity).toBe('UNKNOWN');
    expect(state.reasons).toContain('host_stale');
    expect(state.lastHostAgeMs).toBe(4100);
    expect(invalid).toHaveBeenCalledWith('UNKNOWN');
    await c.stop();
    expect(c.pending()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
