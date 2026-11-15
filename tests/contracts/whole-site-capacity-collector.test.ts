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
    let ready = false;
    const c = createCapacityCollector(
      'NATIVE_BROWSER',
      new AbortController().signal,
      {
        host: () => host.promise,
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
