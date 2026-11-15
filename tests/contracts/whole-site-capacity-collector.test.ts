import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCapacityCollector } from '../../scripts/concurrency/capacity-collector';
import { hostSample, vmSample } from './helpers/whole-site-capacity';
const deferred = () => {
  let resolve!: (v: unknown) => void;
  const promise = new Promise<unknown>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
afterEach(() => vi.useRealTimers());
describe('capacity physical collectors', () => {
  it('does not release baseline before both collectors and real loop observation', async () => {
    vi.useFakeTimers();
    let now = 0;
    const host = deferred(),
      vm = deferred();
    let ready = false,
      hosts = 0;
    const c = createCapacityCollector(
      'NATIVE_BROWSER',
      new AbortController().signal,
      {
        host: () =>
          ++hosts === 1
            ? host.promise
            : Promise.resolve(hostSample(1000000 + now)),
        vm: () => vm.promise,
        now: () => now,
        loop: () => 2,
      },
    );
    const starting = c.start().then(() => {
      ready = true;
    });
    host.resolve(hostSample());
    await Promise.resolve();
    expect(ready).toBe(false);
    vm.resolve(vmSample());
    now = 1000;
    await vi.advanceTimersByTimeAsync(1000);
    await starting;
    expect(ready).toBe(true);
    expect(c.snapshot().validity).toBe('VALID');
    await c.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('serializes slow host samples and never converts unavailable to zero', async () => {
    vi.useFakeTimers();
    let now = 0,
      calls = 0,
      active = 0,
      max = 0;
    const late = deferred();
    const c = createCapacityCollector(
      'NATIVE_BROWSER',
      new AbortController().signal,
      {
        host: async () => {
          calls++;
          active++;
          max = Math.max(max, active);
          if (calls > 1) await late.promise;
          active--;
          return hostSample(calls * 1000);
        },
        vm: async () => {
          await Promise.resolve();
          return vmSample();
        },
        now: () => now,
        loop: () => 2,
      },
    );
    const s = c.start();
    now = 1000;
    await vi.advanceTimersByTimeAsync(1000);
    await s;
    now = 2000;
    await vi.advanceTimersByTimeAsync(1000);
    now = 6000;
    await vi.advanceTimersByTimeAsync(4000);
    expect(max).toBe(1);
    expect(c.snapshot().validity).toBe('UNKNOWN');
    late.resolve(null);
    await c.stop();
    expect(c.pending()).toBe(0);
  });
  it('abort during first baseline settles and leaves no startup timer', async () => {
    vi.useFakeTimers();
    const abort = new AbortController();
    const c = createCapacityCollector('NATIVE_BROWSER', abort.signal, {
      host: async () => {
        await Promise.resolve();
        return hostSample();
      },
      vm: async () => {
        await Promise.resolve();
        return vmSample();
      },
      loop: () => 2,
    });
    const started = c.start();
    const assertion = expect(started).rejects.toThrow(
      'CAPACITY_EVIDENCE_INVALID',
    );
    abort.abort();
    await assertion;
    await c.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('initial collector cadence and baseline admission', () => {
  it('schedules each stream from its own initial completion, not startup completion', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const firstHost = deferred(),
      firstVm = deferred(),
      hostAt: number[] = [],
      vmAt: number[] = [];
    const invalid = vi.fn();
    const c = createCapacityCollector(
      'NATIVE_BROWSER',
      new AbortController().signal,
      {
        now: () => Date.now(),
        loop: () => 2,
        onInvalid: invalid,
        host: () => {
          hostAt.push(Date.now());
          return hostAt.length === 1
            ? firstHost.promise
            : Promise.resolve(hostSample(1000000 + Date.now()));
        },
        vm: () => {
          vmAt.push(Date.now());
          return vmAt.length === 1
            ? firstVm.promise
            : Promise.resolve(vmSample(9990000 + Date.now()));
        },
      },
    );
    const starting = c.start();
    await vi.advanceTimersByTimeAsync(100);
    firstVm.resolve(vmSample(9990100));
    await vi.advanceTimersByTimeAsync(100);
    firstHost.resolve(hostSample(1000200));
    await vi.advanceTimersByTimeAsync(800);
    await starting;
    await vi.advanceTimersByTimeAsync(199);
    expect(hostAt).toEqual([0]);
    await vi.advanceTimersByTimeAsync(1);
    expect(hostAt).toEqual([0, 1200]);
    await vi.advanceTimersByTimeAsync(3899);
    expect(vmAt).toEqual([0]);
    await vi.advanceTimersByTimeAsync(1);
    expect(vmAt).toEqual([0, 5100]);
    expect(invalid).not.toHaveBeenCalled();
    expect(c.snapshot().validity).toBe('VALID');
    await c.stop();
    expect(c.pending()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('keeps early host recurrence while initial VM is pending without notifying incomplete baseline', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const firstVm = deferred(),
      invalid = vi.fn();
    let hosts = 0,
      ready = false;
    const c = createCapacityCollector(
      'NATIVE_BROWSER',
      new AbortController().signal,
      {
        now: () => Date.now(),
        loop: () => 2,
        onInvalid: invalid,
        host: () => {
          hosts++;
          return Promise.resolve(hostSample(1000000 + Date.now()));
        },
        vm: () => firstVm.promise,
      },
    );
    const starting = c.start().then(() => {
      ready = true;
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(hosts).toBe(2);
    expect(ready).toBe(false);
    expect(invalid).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);
    firstVm.resolve(vmSample(9991500));
    await starting;
    expect(ready).toBe(true);
    expect(c.snapshot().validity).toBe('VALID');
    await c.stop();
    expect(c.pending()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each(['host', 'vm'] as const)(
    'still rejects invalid initial %s even if recurrence can return valid samples',
    async (kind) => {
      vi.useFakeTimers();
      vi.setSystemTime(0);
      let hosts = 0,
        vms = 0;
      const c = createCapacityCollector(
        'NATIVE_BROWSER',
        new AbortController().signal,
        {
          now: () => Date.now(),
          loop: () => 2,
          host: () =>
            Promise.resolve(
              ++hosts === 1 && kind === 'host'
                ? null
                : hostSample(1000000 + Date.now()),
            ),
          vm: () =>
            Promise.resolve(
              ++vms === 1 && kind === 'vm'
                ? null
                : vmSample(9990000 + Date.now()),
            ),
        },
      );
      const assertion = expect(c.start()).rejects.toThrow(
        'CAPACITY_EVIDENCE_INVALID',
      );
      await vi.advanceTimersByTimeAsync(1000);
      await assertion;
      expect(vi.getTimerCount()).toBe(0);
      await c.stop();
      expect(c.pending()).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    },
  );
  it('stop during delayed baseline settles late collections without recurrence or callbacks', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const host = deferred(),
      vm = deferred(),
      invalid = vi.fn();
    const c = createCapacityCollector(
      'NATIVE_BROWSER',
      new AbortController().signal,
      {
        host: () => host.promise,
        vm: () => vm.promise,
        now: () => Date.now(),
        loop: () => 2,
        onInvalid: invalid,
      },
    );
    const assertion = expect(c.start()).rejects.toThrow(
      'CAPACITY_EVIDENCE_INVALID',
    );
    await vi.advanceTimersByTimeAsync(200);
    const stopped = c.stop();
    host.resolve(hostSample(1000200));
    vm.resolve(vmSample(9990200));
    await assertion;
    await stopped;
    await vi.runAllTimersAsync();
    expect(invalid).not.toHaveBeenCalled();
    expect(c.pending()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
