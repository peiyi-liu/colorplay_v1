import { samplerTimingSchema } from './root-sampler-timing-contracts';
import { z } from 'zod';
import {
  linuxEngineeringGuards as g,
  executionProfileDigest as sha,
  requireExecutionProfile,
  type ExecutionProfileAuthority,
} from './execution-profile';
import type { CapacityMode } from './capacity-scope';
const n = z.number().nonnegative(),
  bytes = n.int();
const pid = z.strictObject({
  pid: bytes.positive(),
  startTicks: z.string().regex(/^[0-9]{1,30}$/u),
  uid: bytes,
  bootIdSha256: sha,
});
export const linuxHostSampleSchema = z.strictObject({
  platform: z.literal('linux'),
  samplerTiming: samplerTimingSchema.optional(),
  executionProfileSha256: sha,
  sampledAtMonotonicMs: n,
  instanceSha256: sha,
  jobSha256: sha,
  generatorCgroupIdentitySha256: sha,
  limitChainSha256: sha,
  hostMemoryTotalBytes: bytes.positive(),
  hostLogicalCpu: z.union([z.literal(4), z.literal(16)]),
  node: pid,
  browser: pid.nullable(),
  treeComplete: z.boolean().nullable(),
  browserProcessCount: bytes,
  nodeRssBytes: bytes.positive(),
  nodePssBytes: bytes.positive(),
  browserTreeRssBytes: bytes.positive().nullable(),
  browserTreePssBytes: bytes.positive().nullable(),
  nodeCpuLifetimePercentOfOneCore: n,
  browserCpuLifetimePercentOfOneCore: n.nullable(),
  hostSwapUsedBytes: bytes,
  memoryPsiSomeAvg10Percent: n.max(100),
  memoryPsiFullAvg10Percent: n.max(100),
  hostOomKills: bytes,
  memoryAccounting: z.literal('LINUX_SMAPS_ROLLUP_PSS_WITH_SEPARATE_RSS'),
  readOnly: z.literal(true),
});
export const linuxBackendSampleSchema = z.strictObject({
  source: z.literal('SAME_HOST_CGROUP_V2'),
  executionProfileSha256: sha,
  sampledAtMonotonicMs: n,
  cgroupIdentitySha256: sha,
  cpuQuotaUs: bytes.positive(),
  cpuPeriodUs: bytes.positive(),
  memoryMaxBytes: bytes.positive(),
  services: z.literal(8),
  memoryCurrentBytes: bytes,
  swapCurrentBytes: bytes,
  cpuUsageUsec: bytes,
  throttledUsec: bytes,
  oom: bytes,
  oomKill: bytes,
  readOnly: z.literal(true),
});
const unknownReasons = [
  'collector_unavailable',
  'identity_changed',
  'host_stale',
  'backend_stale',
  'loop_stale',
  'backend_limits_changed',
  'backend_oom',
] as const;
const limitedReasons = [
  'node_rss',
  'browser_pss',
  'host_psi',
  'host_oom',
  'event_loop',
  'host_swap',
] as const;
type Reason = (typeof unknownReasons)[number] | (typeof limitedReasons)[number];
const durationsSchema = z.strictObject({
  browser_pss: n,
  host_psi: n,
  event_loop: n,
  host_swap: n,
});
export const linuxCapacityHealthSchema = z.strictObject({
  kind: z.literal('LINUX_CAPACITY_HEALTH_V1'),
  executionProfileSha256: sha,
  mode: z.enum(['NATIVE_BROWSER', 'NODE_PROTOCOL', 'HYBRID_BROWSER_SDK']),
  validity: z.enum(['VALID', 'UNKNOWN', 'GENERATOR_LIMITED']),
  reasons: z.array(z.enum([...unknownReasons, ...limitedReasons])).max(13),
  hostSamples: bytes,
  backendSamples: bytes,
  nodeRssMaxBytes: bytes.nullable(),
  browserTreeRssMaxBytes: bytes.nullable(),
  browserTreePssMaxBytes: bytes.nullable(),
  lastHostAgeMs: n.nullable(),
  lastBackendAgeMs: n.nullable(),
  eventLoopP95MaxMs: n.nullable(),
  hostSwapIncreaseMaxBytes: bytes.nullable(),
  memoryPsiSomeAvg10MaxPercent: n.max(100).nullable(),
  memoryPsiFullAvg10MaxPercent: n.max(100).nullable(),
  hostOomKillDeltaMax: bytes,
  backendOomDeltaMax: bytes,
  durationsMs: durationsSchema,
  nodeCpuLifetimePercentOfHost: n.nullable(),
  browserCpuLifetimePercentOfHost: n.nullable(),
  backendCgroupIdentitySha256: sha.nullable(),
  backendMemoryMaxBytes: bytes.nullable(),
  backendMemoryCurrentBytes: bytes.nullable(),
  backendSwapCurrentBytes: bytes.nullable(),
  backendCpuQuotaCores: n.nullable(),
  backendCpuIntervalPercent: n.nullable(),
});
export type LinuxCapacityHealth = z.infer<typeof linuxCapacityHealthSchema>;
const fail = (): never => {
  throw new Error('CAPACITY_EVIDENCE_INVALID');
};
export const validateLinuxCapacityHealth = (
  input: unknown,
  authority?: ExecutionProfileAuthority,
): LinuxCapacityHealth => {
  const h = linuxCapacityHealthSchema.parse(input),
    a = requireExecutionProfile(h.executionProfileSha256, authority) ?? fail();
  const reasons = new Set(h.reasons);
  if (reasons.size !== h.reasons.length) fail();
  if (
    h.nodeRssMaxBytes !== null &&
    h.nodeRssMaxBytes > g.nodeRssLimitBytes &&
    !reasons.has('node_rss')
  )
    fail();
  if (h.hostOomKillDeltaMax > 0 && !reasons.has('host_oom')) fail();
  if (h.backendOomDeltaMax > 0 && !reasons.has('backend_oom')) fail();
  for (const key of [
    'browser_pss',
    'host_psi',
    'event_loop',
    'host_swap',
  ] as const)
    if (h.durationsMs[key] >= g.sustainedMs && !reasons.has(key)) fail();
  const expected = unknownReasons.some((r) => reasons.has(r))
    ? 'UNKNOWN'
    : limitedReasons.some((r) => reasons.has(r))
      ? 'GENERATOR_LIMITED'
      : 'VALID';
  if (h.validity !== expected) fail();
  if (
    h.validity === 'VALID' &&
    (h.hostSamples < 1 ||
      h.backendSamples < 1 ||
      h.nodeRssMaxBytes === null ||
      h.nodeRssMaxBytes <= 0 ||
      h.lastHostAgeMs === null ||
      h.lastHostAgeMs > g.hostSampleMaxAgeMs ||
      h.lastBackendAgeMs === null ||
      h.lastBackendAgeMs > g.backendSampleMaxAgeMs ||
      h.eventLoopP95MaxMs === null ||
      h.nodeCpuLifetimePercentOfHost === null ||
      h.memoryPsiSomeAvg10MaxPercent === null ||
      h.memoryPsiFullAvg10MaxPercent === null ||
      h.hostSwapIncreaseMaxBytes === null ||
      h.backendSwapCurrentBytes === null ||
      h.backendCgroupIdentitySha256 !==
        a.profile.backend.cgroupIdentitySha256 ||
      h.backendMemoryMaxBytes !== a.profile.backend.memoryMaxBytes ||
      h.backendCpuQuotaCores !== 4 ||
      h.backendMemoryCurrentBytes === null ||
      h.backendMemoryCurrentBytes > h.backendMemoryMaxBytes)
  )
    fail();
  if (
    h.validity === 'VALID' &&
    (h.mode === 'NODE_PROTOCOL'
      ? h.browserTreeRssMaxBytes !== null ||
        h.browserTreePssMaxBytes !== null ||
        h.browserCpuLifetimePercentOfHost !== null
      : h.browserTreeRssMaxBytes === null ||
        h.browserTreeRssMaxBytes <= 0 ||
        h.browserTreePssMaxBytes === null ||
        h.browserTreePssMaxBytes <= 0 ||
        h.browserCpuLifetimePercentOfHost === null)
  )
    fail();
  if (
    h.browserTreePssMaxBytes !== null &&
    h.browserTreeRssMaxBytes !== null &&
    h.browserTreePssMaxBytes > h.browserTreeRssMaxBytes
  )
    fail();
  return h;
};
interface Collected<T> {
  startedAtNodeMs: number;
  completedAtNodeMs: number;
  sample: T;
}
export const createLinuxCapacityHealth = (
  mode: CapacityMode,
  authority: ExecutionProfileAuthority,
) => {
  const a = requireExecutionProfile(authority.sha256, authority) ?? fail(),
    profile = a.profile;
  let host: Collected<z.infer<typeof linuxHostSampleSchema>> | null = null,
    backend: Collected<z.infer<typeof linuxBackendSampleSchema>> | null = null;
  let loop: { atNodeMs: number; p95Ms: number } | null = null,
    hostSamples = 0,
    backendSamples = 0,
    baselineSwap = 0,
    baselineHostOom = 0,
    baselineBackendOom = 0;
  let nodeMax: number | null = null,
    rssMax: number | null = null,
    pssMax: number | null = null,
    swapMax: number | null = null,
    loopMax: number | null = null,
    someMax: number | null = null,
    fullMax: number | null = null,
    hostOomMax = 0,
    backendOomMax = 0,
    backendCpu: number | null = null;
  const faults = new Set<Reason>(),
    since = new Map<string, number>();
  const durations = {
    browser_pss: 0,
    host_psi: 0,
    event_loop: 0,
    host_swap: 0,
  };
  const max = (old: number | null, value: number) =>
    old === null ? value : Math.max(old, value);
  const sustain = (
    key: keyof typeof durations,
    condition: boolean,
    at: number,
  ) => {
    if (!condition) {
      since.delete(key);
      return;
    }
    const began = since.get(key) ?? at;
    since.set(key, began);
    durations[key] = Math.max(durations[key], at - began);
    if (at - began >= g.sustainedMs) faults.add(key);
  };
  const envelope = (v: Collected<unknown>) =>
    [v.startedAtNodeMs, v.completedAtNodeMs].every(Number.isFinite) &&
    v.startedAtNodeMs >= 0 &&
    v.completedAtNodeMs >= v.startedAtNodeMs;
  const samePid = (x: z.infer<typeof pid>, y: z.infer<typeof pid>) =>
    x.pid === y.pid &&
    x.startTicks === y.startTicks &&
    x.uid === y.uid &&
    x.bootIdSha256 === y.bootIdSha256;
  return {
    host: (input: Collected<unknown>) => {
      try {
        if (!envelope(input)) fail();
        const s = linuxHostSampleSchema.parse(input.sample);
        if (
          s.nodePssBytes > s.nodeRssBytes ||
          (s.browserTreePssBytes !== null &&
            s.browserTreeRssBytes !== null &&
            s.browserTreePssBytes > s.browserTreeRssBytes)
        )
          fail();
        const identity = (p: z.infer<typeof pid>) =>
          p.bootIdSha256 === profile.identity.bootIdSha256 &&
          p.uid === profile.identity.ownerUid;
        if (
          s.executionProfileSha256 !== a.sha256 ||
          s.instanceSha256 !== profile.identity.instanceSha256 ||
          s.jobSha256 !== profile.identity.jobSha256 ||
          s.generatorCgroupIdentitySha256 !==
            profile.host.cgroupIdentitySha256 ||
          s.limitChainSha256 !== profile.host.limitChainSha256 ||
          s.hostMemoryTotalBytes !== profile.host.memTotalBytes ||
          s.hostLogicalCpu !== profile.host.logicalCpu ||
          (s.browser !== null && s.browser.pid === s.node.pid) ||
          !identity(s.node) ||
          (s.browser && !identity(s.browser))
        ) {
          faults.add('identity_changed');
          fail();
        }
        if (
          mode === 'NODE_PROTOCOL'
            ? s.browser !== null ||
              s.treeComplete !== null ||
              s.browserProcessCount !== 0 ||
              s.browserTreeRssBytes !== null ||
              s.browserTreePssBytes !== null ||
              s.browserCpuLifetimePercentOfOneCore !== null
            : s.browser === null ||
              s.treeComplete !== true ||
              s.browserProcessCount < 1 ||
              s.browserTreeRssBytes === null ||
              s.browserTreePssBytes === null ||
              s.browserCpuLifetimePercentOfOneCore === null
        )
          fail();
        if (
          host &&
          (s.sampledAtMonotonicMs <= host.sample.sampledAtMonotonicMs ||
            input.startedAtNodeMs <= host.startedAtNodeMs ||
            !samePid(s.node, host.sample.node) ||
            (s.browser &&
              host.sample.browser &&
              !samePid(s.browser, host.sample.browser)) ||
            s.hostOomKills < host.sample.hostOomKills)
        ) {
          faults.add('identity_changed');
          fail();
        }
        if (
          host &&
          input.startedAtNodeMs - host.startedAtNodeMs > g.hostSampleMaxAgeMs
        ) {
          faults.add('host_stale');
          since.clear();
        }
        if (!host) {
          baselineSwap = s.hostSwapUsedBytes;
          baselineHostOom = s.hostOomKills;
        }
        host = { ...input, sample: s };
        hostSamples++;
        nodeMax = max(nodeMax, s.nodeRssBytes);
        if (s.browserTreeRssBytes !== null)
          rssMax = max(rssMax, s.browserTreeRssBytes);
        if (s.browserTreePssBytes !== null)
          pssMax = max(pssMax, s.browserTreePssBytes);
        swapMax = max(swapMax, Math.max(0, s.hostSwapUsedBytes - baselineSwap));
        someMax = max(someMax, s.memoryPsiSomeAvg10Percent);
        fullMax = max(fullMax, s.memoryPsiFullAvg10Percent);
        hostOomMax = Math.max(hostOomMax, s.hostOomKills - baselineHostOom);
        if (s.nodeRssBytes > g.nodeRssLimitBytes) faults.add('node_rss');
        if (hostOomMax > 0) faults.add('host_oom');
        sustain(
          'browser_pss',
          s.browserTreePssBytes !== null &&
            s.browserTreePssBytes > g.browserPssLimitBytes,
          input.completedAtNodeMs,
        );
        sustain(
          'host_psi',
          s.memoryPsiSomeAvg10Percent >= 10 || s.memoryPsiFullAvg10Percent >= 1,
          input.completedAtNodeMs,
        );
        sustain(
          'host_swap',
          s.hostSwapUsedBytes - baselineSwap >= g.swapIncreaseLimitBytes,
          input.completedAtNodeMs,
        );
      } catch {
        faults.add('collector_unavailable');
      }
    },
    backend: (input: Collected<unknown>) => {
      try {
        if (!envelope(input)) fail();
        const s = linuxBackendSampleSchema.parse(input.sample),
          p = profile.backend;
        if (
          s.executionProfileSha256 !== a.sha256 ||
          s.cgroupIdentitySha256 !== p.cgroupIdentitySha256 ||
          s.cpuQuotaUs !== p.cpuQuotaUs ||
          s.cpuPeriodUs !== p.cpuPeriodUs ||
          s.memoryMaxBytes !== p.memoryMaxBytes ||
          s.memoryCurrentBytes > s.memoryMaxBytes
        ) {
          faults.add('backend_limits_changed');
          fail();
        }
        const previousBackend = backend;
        if (
          previousBackend &&
          (s.sampledAtMonotonicMs <=
            previousBackend.sample.sampledAtMonotonicMs ||
            input.startedAtNodeMs <= previousBackend.startedAtNodeMs ||
            (['cpuUsageUsec', 'throttledUsec', 'oom', 'oomKill'] as const).some(
              (key) => s[key] < previousBackend.sample[key],
            ))
        )
          fail();
        if (
          backend &&
          input.startedAtNodeMs - backend.startedAtNodeMs >
            g.backendSampleMaxAgeMs
        )
          faults.add('backend_stale');
        if (!backend) baselineBackendOom = s.oom + s.oomKill;
        backendOomMax = Math.max(
          backendOomMax,
          s.oom + s.oomKill - baselineBackendOom,
        );
        if (backendOomMax > 0) faults.add('backend_oom');
        backendCpu = backend
          ? ((s.cpuUsageUsec - backend.sample.cpuUsageUsec) /
              ((s.sampledAtMonotonicMs - backend.sample.sampledAtMonotonicMs) *
                1000 *
                4)) *
            100
          : null;
        backend = { ...input, sample: s };
        backendSamples++;
      } catch {
        faults.add('collector_unavailable');
      }
    },
    eventLoop: (input: { atNodeMs: number; p95Ms: number }) => {
      if (
        ![input.atNodeMs, input.p95Ms].every(Number.isFinite) ||
        input.atNodeMs < 0 ||
        input.p95Ms < 0 ||
        (loop && input.atNodeMs <= loop.atNodeMs)
      ) {
        faults.add('loop_stale');
        return;
      }
      if (loop && input.atNodeMs - loop.atNodeMs > g.hostSampleMaxAgeMs) {
        faults.add('loop_stale');
        since.delete('event_loop');
      }
      loop = { ...input };
      loopMax = max(loopMax, input.p95Ms);
      sustain('event_loop', input.p95Ms > 200, input.atNodeMs);
    },
    snapshot: (at: number): LinuxCapacityHealth => {
      const age = (v: Collected<unknown> | null) =>
        v && Number.isFinite(at) && at >= v.completedAtNodeMs
          ? at - v.startedAtNodeMs
          : null;
      const hostAge = age(host),
        backendAge = age(backend),
        reasons = new Set(faults);
      if (hostAge === null || hostAge > 3000) reasons.add('host_stale');
      if (backendAge === null || backendAge > 7000)
        reasons.add('backend_stale');
      if (!loop || at < loop.atNodeMs || at - loop.atNodeMs > 3000)
        reasons.add('loop_stale');
      return validateLinuxCapacityHealth(
        {
          kind: 'LINUX_CAPACITY_HEALTH_V1',
          executionProfileSha256: a.sha256,
          mode,
          validity: unknownReasons.some((r) => reasons.has(r))
            ? 'UNKNOWN'
            : limitedReasons.some((r) => reasons.has(r))
              ? 'GENERATOR_LIMITED'
              : 'VALID',
          reasons: [...reasons],
          hostSamples,
          backendSamples,
          nodeRssMaxBytes: nodeMax,
          browserTreeRssMaxBytes: rssMax,
          browserTreePssMaxBytes: pssMax,
          lastHostAgeMs: hostAge,
          lastBackendAgeMs: backendAge,
          eventLoopP95MaxMs: loopMax,
          hostSwapIncreaseMaxBytes: swapMax,
          memoryPsiSomeAvg10MaxPercent: someMax,
          memoryPsiFullAvg10MaxPercent: fullMax,
          hostOomKillDeltaMax: hostOomMax,
          backendOomDeltaMax: backendOomMax,
          durationsMs: { ...durations },
          nodeCpuLifetimePercentOfHost: host
            ? host.sample.nodeCpuLifetimePercentOfOneCore / 4
            : null,
          browserCpuLifetimePercentOfHost:
            host?.sample.browserCpuLifetimePercentOfOneCore == null
              ? null
              : host.sample.browserCpuLifetimePercentOfOneCore / 4,
          backendCgroupIdentitySha256:
            backend?.sample.cgroupIdentitySha256 ?? null,
          backendMemoryMaxBytes: backend?.sample.memoryMaxBytes ?? null,
          backendMemoryCurrentBytes: backend?.sample.memoryCurrentBytes ?? null,
          backendSwapCurrentBytes: backend?.sample.swapCurrentBytes ?? null,
          backendCpuQuotaCores: backend
            ? backend.sample.cpuQuotaUs / backend.sample.cpuPeriodUs
            : null,
          backendCpuIntervalPercent: backendCpu,
        },
        a,
      );
    },
  };
};
