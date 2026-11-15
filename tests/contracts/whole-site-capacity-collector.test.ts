import { syntheticLinuxRuntime } from './helpers/whole-site-linux-runtime';
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

// Synthetic kernel facts exercise the actual M1 reducer through the collector.
const linuxFixture = () => {
  const { profile, authority } = syntheticLinuxRuntime();
  const host = (at: number) => ({
    platform: 'linux',
    executionProfileSha256: authority.sha256,
    sampledAtMonotonicMs: 100000 + at,
    instanceSha256: profile.identity.instanceSha256,
    jobSha256: profile.identity.jobSha256,
    generatorCgroupIdentitySha256: profile.host.cgroupIdentitySha256,
    limitChainSha256: profile.host.limitChainSha256,
    hostMemoryTotalBytes: profile.host.memTotalBytes,
    hostLogicalCpu: 4,
    node: {
      pid: 1,
      startTicks: '100',
      uid: 1001,
      bootIdSha256: profile.identity.bootIdSha256,
    },
    browser: null,
    treeComplete: null,
    browserProcessCount: 0,
    nodeRssBytes: 1000000,
    nodePssBytes: 900000,
    browserTreeRssBytes: null,
    browserTreePssBytes: null,
    nodeCpuLifetimePercentOfOneCore: 10,
    browserCpuLifetimePercentOfOneCore: null,
    hostSwapUsedBytes: 0,
    memoryPsiSomeAvg10Percent: 0,
    memoryPsiFullAvg10Percent: 0,
    hostOomKills: 0,
    memoryAccounting: 'LINUX_SMAPS_ROLLUP_PSS_WITH_SEPARATE_RSS',
    readOnly: true,
  });
  const backend = (at: number) => ({
    source: 'SAME_HOST_CGROUP_V2',
    executionProfileSha256: authority.sha256,
    sampledAtMonotonicMs: 500000 + at,
    cgroupIdentitySha256: profile.backend.cgroupIdentitySha256,
    cpuQuotaUs: 400000,
    cpuPeriodUs: 100000,
    memoryMaxBytes: 6 * 1024 ** 3,
    services: 8,
    memoryCurrentBytes: 1000000,
    swapCurrentBytes: 0,
    cpuUsageUsec: at * 1000,
    throttledUsec: 0,
    oom: 0,
    oomKill: 0,
    readOnly: true,
  });
  return { authority, host, backend };
};
describe('Linux backend cadence without a fake VM', () => {
  it('admits real backend baseline and schedules from each initial completion', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const f = linuxFixture(),
      firstBackend = deferred(),
      calls: number[] = [],
      invalid = vi.fn();
    const c = createCapacityCollector(
      'NODE_PROTOCOL',
      new AbortController().signal,
      {
        executionProfileAuthority: f.authority,
        host: () => Promise.resolve(f.host(Date.now())),
        backend: () => {
          calls.push(Date.now());
          return calls.length === 1
            ? firstBackend.promise
            : Promise.resolve(f.backend(Date.now()));
        },
        now: () => Date.now(),
        loop: () => 2,
        onInvalid: invalid,
      },
    );
    const starting = c.start();
    await vi.advanceTimersByTimeAsync(1500);
    expect(invalid).not.toHaveBeenCalled();
    firstBackend.resolve(f.backend(1500));
    await starting;
    expect(c.snapshot().validity).toBe('VALID');
    expect(c.snapshot()).not.toHaveProperty('vmSamples');
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls).toEqual([0, 6500]);
    await c.stop();
    expect(c.pending()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
it.each(['abort', 'invalid-initial'])(
  'keeps Linux %s baseline bounded and clears timers',
  async (bad) => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const f = linuxFixture(),
      pending = deferred(),
      abort = new AbortController(),
      invalid = vi.fn();
    const c = createCapacityCollector('NODE_PROTOCOL', abort.signal, {
      executionProfileAuthority: f.authority,
      host: () => Promise.resolve(f.host(Date.now())),
      backend: () =>
        bad === 'invalid-initial' ? Promise.resolve(null) : pending.promise,
      loop: () => 2,
      now: () => Date.now(),
      onInvalid: invalid,
    });
    const failed = expect(c.start()).rejects.toThrow(
      'CAPACITY_EVIDENCE_INVALID',
    );
    if (bad === 'abort') {
      abort.abort();
      pending.resolve(f.backend(0));
    } else await vi.advanceTimersByTimeAsync(1000);
    await failed;
    await c.stop();
    expect(c.pending()).toBe(0);
    expect(invalid).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  },
);
