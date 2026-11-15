import { z } from 'zod';
import { capacityEngineeringGuards as guards } from './capacity-manifest';
import {
  capacityModes,
  capacityFailure,
  type CapacityMode,
} from './capacity-scope';
const nonnegative = z.number().nonnegative();
const bytes = nonnegative.int();
const start = z.string().regex(/^[0-9]{1,30}$/u);
export const hostCapacitySampleSchema = z.strictObject({
  platform: z.literal('darwin'),
  sampledAtMonotonicMs: nonnegative,
  hostMemoryBytes: bytes.positive(),
  hostLogicalCpu: bytes.positive(),
  hostPressureFlag: z.union([z.literal(1), z.literal(2), z.literal(4)]),
  hostSwapUsedBytes: bytes,
  nodeStart: start,
  browserStart: start.nullable(),
  treeComplete: z.boolean().nullable(),
  nodeRssBytes: bytes,
  nodePhysicalFootprintBytes: bytes,
  nodeCpuLifetimePercentOfOneCore: nonnegative,
  browserProcessCount: bytes,
  browserTreeRssBytes: bytes.nullable(),
  browserTreePhysicalFootprintBytes: bytes.nullable(),
  browserCpuLifetimePercentOfOneCore: nonnegative.nullable(),
  memoryAccounting: z.literal(
    'DARWIN_RUSAGE_INFO_V0_PHYSICAL_FOOTPRINT_WITH_SEPARATE_RSS',
  ),
  readOnly: z.literal(true),
});
export const vmCapacitySampleSchema = z.strictObject({
  sampledAtMonotonicMs: nonnegative,
  vmBootIdSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  vmLogicalCpu: z.literal(4),
  vmMemoryTotalBytes: bytes.positive(),
  vmMemoryAvailableBytes: bytes,
  vmSwapTotalBytes: bytes,
  vmSwapFreeBytes: bytes,
  vmCpuTicks: z.strictObject({
    user: bytes,
    nice: bytes,
    system: bytes,
    idle: bytes,
    iowait: bytes,
    irq: bytes,
    softirq: bytes,
    steal: bytes,
  }),
  vmLoad1: nonnegative,
  vmLoad5: nonnegative,
  vmLoad15: nonnegative,
  readOnly: z.literal(true),
});
export type HostCapacitySample = z.infer<typeof hostCapacitySampleSchema>;
export type VmCapacitySample = z.infer<typeof vmCapacitySampleSchema>;
interface Collected<T> {
  startedAtNodeMs: number;
  completedAtNodeMs: number;
  sample: T;
}
const reasons = [
  'collector_unavailable',
  'host_stale',
  'vm_stale',
  'loop_stale',
  'tree_or_identity_changed',
  'node_rss',
  'browser_footprint',
  'host_critical',
  'host_warning',
  'event_loop',
  'host_swap',
] as const;
type Reason = (typeof reasons)[number];
export const capacityHealthSchema = z.strictObject({
  mode: z.enum(capacityModes),
  validity: z.enum(['VALID', 'GENERATOR_LIMITED', 'UNKNOWN']),
  reasons: z.array(z.enum(reasons)).max(reasons.length),
  hostSamples: bytes,
  vmSamples: bytes,
  nodeRssMaxBytes: bytes.nullable(),
  browserTreeRssMaxBytes: bytes.nullable(),
  browserTreeFootprintMaxBytes: bytes.nullable(),
  hostSwapIncreaseMaxBytes: bytes.nullable(),
  lastHostAgeMs: nonnegative.nullable(),
  lastVmAgeMs: nonnegative.nullable(),
  eventLoopP95MaxMs: nonnegative.nullable(),
  nodeCpuLifetimePercentOfHost: nonnegative.nullable(),
  browserCpuLifetimePercentOfHost: nonnegative.nullable(),
  vmCpuIntervalPercent: nonnegative.max(100).nullable(),
  hostPressureFlag: z
    .union([z.literal(1), z.literal(2), z.literal(4)])
    .nullable(),
  vmMemoryAvailableBytes: bytes.nullable(),
  vmMemoryTotalBytes: bytes.nullable(),
  vmSwapUsedBytes: bytes.nullable(),
  vmLoad1: nonnegative.nullable(),
});
export type CapacityHealth = z.infer<typeof capacityHealthSchema>;
export const validateCapacityHealth = (input: unknown): CapacityHealth => {
  const health = capacityHealthSchema.parse(input);
  if (health.validity === 'VALID') {
    if (
      health.reasons.length !== 0 ||
      health.hostSamples < 1 ||
      health.vmSamples < 1 ||
      health.nodeRssMaxBytes === null ||
      health.nodeRssMaxBytes <= 0 ||
      health.nodeRssMaxBytes > guards.nodeRssLimitBytes ||
      health.hostPressureFlag === null ||
      health.hostPressureFlag === 4 ||
      health.lastHostAgeMs === null ||
      health.lastHostAgeMs > guards.hostSampleMaxAgeMs ||
      health.lastVmAgeMs === null ||
      health.lastVmAgeMs > guards.vmSampleMaxAgeMs ||
      health.eventLoopP95MaxMs === null ||
      health.nodeCpuLifetimePercentOfHost === null ||
      health.vmMemoryTotalBytes === null ||
      health.vmMemoryTotalBytes <= 0 ||
      health.vmMemoryAvailableBytes === null ||
      health.vmMemoryAvailableBytes > health.vmMemoryTotalBytes
    )
      return capacityFailure();
    if (
      health.mode === 'NODE_PROTOCOL'
        ? health.browserTreeRssMaxBytes !== null ||
          health.browserTreeFootprintMaxBytes !== null ||
          health.browserCpuLifetimePercentOfHost !== null
        : health.browserTreeRssMaxBytes === null ||
          health.browserTreeRssMaxBytes <= 0 ||
          health.browserTreeFootprintMaxBytes === null ||
          health.browserTreeFootprintMaxBytes <= 0 ||
          health.browserCpuLifetimePercentOfHost === null
    )
      return capacityFailure();
  }
  return health;
};

export const createCapacityHealth = (mode: CapacityMode) => {
  let host: Collected<HostCapacitySample> | null = null,
    vm: Collected<VmCapacitySample> | null = null,
    loop: { atNodeMs: number; p95Ms: number } | null = null;
  let unknown = false,
    hostSamples = 0,
    vmSamples = 0,
    baselineSwap: number | null = null;
  let nodeMax: number | null = null,
    rssMax: number | null = null,
    footprintMax: number | null = null,
    swapMax: number | null = null,
    loopMax: number | null = null,
    vmCpu: number | null = null;
  const limited = new Set<Reason>(),
    faults = new Set<Reason>(),
    since = new Map<Reason, number>();
  const max = (previous: number | null, value: number) =>
    previous === null ? value : Math.max(previous, value);
  const sustain = (reason: Reason, condition: boolean, at: number) => {
    if (!condition) {
      since.delete(reason);
      return;
    }
    const began = since.get(reason) ?? at;
    since.set(reason, began);
    if (at - began >= guards.sustainedMs) limited.add(reason);
  };
  const envelope = <T>(input: Collected<T>) =>
    Number.isFinite(input.startedAtNodeMs) &&
    Number.isFinite(input.completedAtNodeMs) &&
    input.startedAtNodeMs >= 0 &&
    input.completedAtNodeMs >= input.startedAtNodeMs;
  return {
    host: (input: Collected<unknown>) => {
      try {
        if (!envelope(input)) throw new Error('INVALID');
        const sample = hostCapacitySampleSchema.parse(input.sample),
          protocol = mode === 'NODE_PROTOCOL';
        if (
          sample.hostMemoryBytes !== 16 * 1024 ** 3 ||
          sample.hostLogicalCpu !== 8 ||
          sample.nodeRssBytes === 0 ||
          sample.nodePhysicalFootprintBytes === 0
        )
          throw new Error('INVALID');
        if (
          protocol
            ? sample.browserStart !== null ||
              sample.treeComplete !== null ||
              sample.browserProcessCount !== 0 ||
              sample.browserTreeRssBytes !== null ||
              sample.browserTreePhysicalFootprintBytes !== null ||
              sample.browserCpuLifetimePercentOfOneCore !== null
            : sample.browserStart === null ||
              sample.treeComplete !== true ||
              sample.browserProcessCount < 1 ||
              sample.browserTreeRssBytes === null ||
              sample.browserTreeRssBytes <= 0 ||
              sample.browserTreePhysicalFootprintBytes === null ||
              sample.browserTreePhysicalFootprintBytes <= 0 ||
              sample.browserCpuLifetimePercentOfOneCore === null
        )
          throw new Error('TREE');
        if (
          host &&
          (sample.nodeStart !== host.sample.nodeStart ||
            sample.browserStart !== host.sample.browserStart ||
            sample.sampledAtMonotonicMs <= host.sample.sampledAtMonotonicMs ||
            input.startedAtNodeMs <= host.startedAtNodeMs)
        ) {
          faults.add('tree_or_identity_changed');
          throw new Error('IDENTITY');
        }
        if (
          host &&
          input.startedAtNodeMs - host.startedAtNodeMs >
            guards.hostSampleMaxAgeMs
        ) {
          unknown = true;
          since.clear();
        }
        host = { ...input, sample };
        hostSamples++;
        baselineSwap ??= sample.hostSwapUsedBytes;
        nodeMax = max(nodeMax, sample.nodeRssBytes);
        swapMax = max(
          swapMax,
          Math.max(0, sample.hostSwapUsedBytes - baselineSwap),
        );
        if (sample.browserTreeRssBytes !== null)
          rssMax = max(rssMax, sample.browserTreeRssBytes);
        if (sample.browserTreePhysicalFootprintBytes !== null)
          footprintMax = max(
            footprintMax,
            sample.browserTreePhysicalFootprintBytes,
          );
        if (sample.nodeRssBytes > guards.nodeRssLimitBytes)
          limited.add('node_rss');
        if (sample.hostPressureFlag === 4) limited.add('host_critical');
        sustain(
          'browser_footprint',
          sample.browserTreePhysicalFootprintBytes !== null &&
            sample.browserTreePhysicalFootprintBytes >
              guards.browserFootprintLimitBytes,
          input.completedAtNodeMs,
        );
        sustain(
          'host_warning',
          sample.hostPressureFlag === 2,
          input.completedAtNodeMs,
        );
        sustain(
          'host_swap',
          sample.hostSwapUsedBytes - baselineSwap >=
            guards.swapIncreaseLimitBytes,
          input.completedAtNodeMs,
        );
      } catch {
        unknown = true;
        faults.add('collector_unavailable');
      }
    },
    vm: (input: Collected<unknown>) => {
      try {
        if (!envelope(input)) throw new Error('INVALID');
        const sample = vmCapacitySampleSchema.parse(input.sample);
        if (
          sample.vmMemoryAvailableBytes > sample.vmMemoryTotalBytes ||
          sample.vmSwapFreeBytes > sample.vmSwapTotalBytes
        )
          throw new Error('INVALID');
        if (vm) {
          if (
            sample.vmBootIdSha256 !== vm.sample.vmBootIdSha256 ||
            sample.sampledAtMonotonicMs <= vm.sample.sampledAtMonotonicMs ||
            input.startedAtNodeMs <= vm.startedAtNodeMs
          )
            throw new Error('IDENTITY');
          const keys = Object.keys(
            sample.vmCpuTicks,
          ) as (keyof typeof sample.vmCpuTicks)[];
          const previousTicks = vm.sample.vmCpuTicks;
          const deltas = keys.map(
            (key) => sample.vmCpuTicks[key] - previousTicks[key],
          );
          if (deltas.some((value) => value < 0)) throw new Error('COUNTER');
          const total = deltas.reduce((a, b) => a + b, 0),
            idle =
              sample.vmCpuTicks.idle -
              vm.sample.vmCpuTicks.idle +
              sample.vmCpuTicks.iowait -
              vm.sample.vmCpuTicks.iowait;
          vmCpu = total > 0 ? ((total - idle) / total) * 100 : null;
          if (
            input.startedAtNodeMs - vm.startedAtNodeMs >
            guards.vmSampleMaxAgeMs
          )
            unknown = true;
        }
        vm = { ...input, sample };
        vmSamples++;
      } catch {
        unknown = true;
        faults.add('collector_unavailable');
      }
    },
    eventLoop: (input: { atNodeMs: number; p95Ms: number }) => {
      if (
        !Number.isFinite(input.atNodeMs) ||
        !Number.isFinite(input.p95Ms) ||
        input.atNodeMs < 0 ||
        input.p95Ms < 0 ||
        (loop && input.atNodeMs <= loop.atNodeMs)
      ) {
        unknown = true;
        return;
      }
      if (loop && input.atNodeMs - loop.atNodeMs > guards.hostSampleMaxAgeMs) {
        unknown = true;
        since.delete('event_loop');
      }
      loop = { ...input };
      loopMax = max(loopMax, input.p95Ms);
      sustain(
        'event_loop',
        input.p95Ms > guards.eventLoopP95LimitMs,
        input.atNodeMs,
      );
    },
    snapshot: (atNodeMs: number): CapacityHealth => {
      const stale = new Set<Reason>(faults);
      const age = (
        input: { startedAtNodeMs: number; completedAtNodeMs: number } | null,
      ) =>
        input &&
        Number.isFinite(atNodeMs) &&
        atNodeMs >= input.completedAtNodeMs
          ? atNodeMs - input.startedAtNodeMs
          : null;
      const hostAge = age(host),
        vmAge = age(vm);
      if (hostAge === null || hostAge > guards.hostSampleMaxAgeMs)
        stale.add('host_stale');
      if (vmAge === null || vmAge > guards.vmSampleMaxAgeMs)
        stale.add('vm_stale');
      if (
        !loop ||
        atNodeMs < loop.atNodeMs ||
        atNodeMs - loop.atNodeMs > guards.hostSampleMaxAgeMs
      )
        stale.add('loop_stale');
      if (unknown) stale.add('collector_unavailable');
      const browserCpu = host?.sample.browserCpuLifetimePercentOfOneCore;
      return validateCapacityHealth({
        mode,
        validity: stale.size
          ? 'UNKNOWN'
          : limited.size
            ? 'GENERATOR_LIMITED'
            : 'VALID',
        reasons: [...new Set([...stale, ...limited])],
        hostSamples,
        vmSamples,
        nodeRssMaxBytes: nodeMax,
        browserTreeRssMaxBytes: rssMax,
        browserTreeFootprintMaxBytes: footprintMax,
        hostSwapIncreaseMaxBytes: swapMax,
        lastHostAgeMs: hostAge,
        lastVmAgeMs: vmAge,
        eventLoopP95MaxMs: loopMax,
        nodeCpuLifetimePercentOfHost: host
          ? host.sample.nodeCpuLifetimePercentOfOneCore /
            host.sample.hostLogicalCpu
          : null,
        browserCpuLifetimePercentOfHost:
          host && browserCpu !== null && browserCpu !== undefined
            ? browserCpu / host.sample.hostLogicalCpu
            : null,
        vmCpuIntervalPercent: vmCpu,
        hostPressureFlag: host?.sample.hostPressureFlag ?? null,
        vmMemoryAvailableBytes: vm?.sample.vmMemoryAvailableBytes ?? null,
        vmMemoryTotalBytes: vm?.sample.vmMemoryTotalBytes ?? null,
        vmSwapUsedBytes: vm
          ? vm.sample.vmSwapTotalBytes - vm.sample.vmSwapFreeBytes
          : null,
        vmLoad1: vm?.sample.vmLoad1 ?? null,
      });
    },
  };
};
