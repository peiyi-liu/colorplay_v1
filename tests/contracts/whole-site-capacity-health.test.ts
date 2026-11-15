import { describe, it, expect } from 'vitest';
import { createCapacityHealth } from '../../scripts/concurrency/capacity-health';
import { hostSample, vmSample } from './helpers/whole-site-capacity';
const feed = (
  health: ReturnType<typeof createCapacityHealth>,
  at: number,
  host: unknown = hostSample(1000000 + at),
  vm: unknown = vmSample(9990000 + at),
  lag = 10,
) => {
  health.host({ startedAtNodeMs: at, completedAtNodeMs: at + 1, sample: host });
  health.vm({ startedAtNodeMs: at, completedAtNodeMs: at + 1, sample: vm });
  health.eventLoop({ atNodeMs: at + 1, p95Ms: lag });
};
describe('separate host/VM clocks, footprint guards and unavailable data', () => {
  it('never mixes Python and Node epochs and never treats high RSS as footprint', () => {
    const health = createCapacityHealth('NATIVE_BROWSER');
    feed(health, 0);
    const out = health.snapshot(2);
    expect(out.validity).toBe('VALID');
    expect(out.browserTreeRssMaxBytes).toBe(8 * 1024 ** 3);
    expect(out.browserTreeFootprintMaxBytes).toBe(2 * 1024 ** 3);
    expect(out.nodeCpuLifetimePercentOfHost).toBe(50 / 8);
  });
  it('requires continuous10s warning/footprint/lag and stops instantly on NodeRSS/critical', () => {
    const h = createCapacityHealth('NATIVE_BROWSER');
    for (let at = 0; at <= 10000; at += 1000)
      feed(h, at, {
        ...hostSample(1000000 + at),
        browserTreePhysicalFootprintBytes: 7 * 1024 ** 3,
      });
    expect(h.snapshot(10002).validity).toBe('GENERATOR_LIMITED');
    const instant = createCapacityHealth('NATIVE_BROWSER');
    feed(instant, 0, { ...hostSample(), hostPressureFlag: 4 });
    expect(instant.snapshot(2).validity).toBe('GENERATOR_LIMITED');
  });
  it('missing/stale/unsupported/tree/PID reuse never defaults to valid zeros', () => {
    expect(createCapacityHealth('NATIVE_BROWSER').snapshot(0).validity).toBe(
      'UNKNOWN',
    );
    const h = createCapacityHealth('NATIVE_BROWSER');
    feed(h, 0);
    expect(h.snapshot(3002).validity).toBe('UNKNOWN');
    const bad = createCapacityHealth('NATIVE_BROWSER');
    feed(bad, 0);
    feed(bad, 1000, { ...hostSample(1001000), browserStart: '999' });
    expect(bad.snapshot(1002).validity).toBe('UNKNOWN');
  });
  it.each(['host_warning', 'host_swap', 'event_loop'] as const)(
    'requires sustained %s10s and resets on normal readings',
    (reason) => {
      const h = createCapacityHealth('NATIVE_BROWSER');
      feed(h, 0);
      for (let at = 1000; at <= 10000; at += 1000)
        feed(
          h,
          at,
          {
            ...hostSample(1000000 + at),
            hostPressureFlag: reason === 'host_warning' ? 2 : 1,
            hostSwapUsedBytes: reason === 'host_swap' ? 512 * 1024 ** 2 : 0,
          },
          vmSample(9990000 + at),
          reason === 'event_loop' ? 201 : 10,
        );
      expect(h.snapshot(10002).validity).toBe('VALID');
      feed(
        h,
        11000,
        {
          ...hostSample(1011000),
          hostPressureFlag: reason === 'host_warning' ? 2 : 1,
          hostSwapUsedBytes: reason === 'host_swap' ? 512 * 1024 ** 2 : 0,
        },
        vmSample(10001000),
        reason === 'event_loop' ? 201 : 10,
      );
      expect(h.snapshot(11002).reasons).toContain(reason);
    },
  );
  it('does not manufacture browser tree zeros in protocol and keeps VM CPU interval separate', () => {
    const h = createCapacityHealth('NODE_PROTOCOL');
    const sample = {
      ...hostSample(),
      browserStart: null,
      treeComplete: null,
      browserProcessCount: 0,
      browserTreeRssBytes: null,
      browserTreePhysicalFootprintBytes: null,
      browserCpuLifetimePercentOfOneCore: null,
    };
    feed(h, 0, sample);
    expect(h.snapshot(2).validity).toBe('VALID');
    expect(h.snapshot(2).browserTreeRssMaxBytes).toBeNull();
    const vm = vmSample(9995000);
    vm.vmCpuTicks.user += 100;
    vm.vmCpuTicks.idle += 300;
    h.vm({ startedAtNodeMs: 5000, completedAtNodeMs: 5001, sample: vm });
    expect(h.snapshot(5002).vmCpuIntervalPercent).toBe(25);
  });
  it('rejects invalid flag, unsupported platform, incomplete tree and stale VM independently', () => {
    for (const bad of [
      { ...hostSample(), hostPressureFlag: 0 },
      { ...hostSample(), platform: 'linux' },
      { ...hostSample(), treeComplete: false },
    ]) {
      const h = createCapacityHealth('NATIVE_BROWSER');
      h.host({ startedAtNodeMs: 0, completedAtNodeMs: 1, sample: bad });
      expect(h.snapshot(2).validity).toBe('UNKNOWN');
    }
    const h = createCapacityHealth('NATIVE_BROWSER');
    feed(h, 0);
    for (let at = 1000; at <= 8000; at += 1000) {
      h.host({
        startedAtNodeMs: at,
        completedAtNodeMs: at + 1,
        sample: hostSample(1000000 + at),
      });
      h.eventLoop({ atNodeMs: at + 1, p95Ms: 10 });
    }
    expect(h.snapshot(8002).reasons).toContain('vm_stale');
  });
  it('enforces exact Node RSS boundary and does not turn high CPU into generator limitation', () => {
    const h = createCapacityHealth('NATIVE_BROWSER');
    feed(h, 0, {
      ...hostSample(),
      nodeRssBytes: 2 * 1024 ** 3,
      nodeCpuLifetimePercentOfOneCore: 700,
    });
    expect(h.snapshot(2).validity).toBe('VALID');
    feed(h, 1000, { ...hostSample(1001000), nodeRssBytes: 2 * 1024 ** 3 + 1 });
    expect(h.snapshot(1002).reasons).toContain('node_rss');
  });
  it.each(['NATIVE_BROWSER', 'HYBRID_BROWSER_SDK'] as const)(
    'requires positive measured browser RSS and footprint in %s',
    (mode) => {
      for (const field of [
        'browserTreeRssBytes',
        'browserTreePhysicalFootprintBytes',
      ] as const) {
        const health = createCapacityHealth(mode);
        feed(health, 0, { ...hostSample(), [field]: 0 });
        expect(health.snapshot(2).validity).toBe('UNKNOWN');
      }
      const healthy = createCapacityHealth(mode);
      feed(healthy, 0);
      expect(healthy.snapshot(2).validity).toBe('VALID');
    },
  );
  it('does not infer sustained footprint limitation from one short high peak', () => {
    const health = createCapacityHealth('NATIVE_BROWSER');
    feed(health, 0, {
      ...hostSample(),
      browserTreePhysicalFootprintBytes: 7 * 1024 ** 3,
    });
    expect(health.snapshot(2).validity).toBe('VALID');
    feed(health, 1000);
    expect(health.snapshot(1002).validity).toBe('VALID');
    expect(health.snapshot(1002).browserTreeFootprintMaxBytes).toBe(
      7 * 1024 ** 3,
    );
  });
});
