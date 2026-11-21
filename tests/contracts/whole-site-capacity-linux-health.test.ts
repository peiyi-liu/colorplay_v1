import { linuxScopeHelperNames } from '../../scripts/concurrency/root-helper-contracts';
import { describe, expect, it } from 'vitest';
import { validateExecutionProfile } from '../../scripts/concurrency/execution-profile';
import { sha256 } from '../../scripts/concurrency/local-runtime';
import {
  createLinuxCapacityHealth,
  validateLinuxCapacityHealth,
} from '../../scripts/concurrency/capacity-linux-health';
import { capacityFixture } from './helpers/whole-site-capacity';
import { parseCapacityScope } from '../../scripts/concurrency/capacity-scope';
import {
  createCapacityManifest,
  capacityManifestHash,
} from '../../scripts/concurrency/capacity-manifest';
import {
  newCapacityReceipt,
  finalizeCapacityReceipt,
} from '../../scripts/concurrency/capacity-receipt';
import { assertCapacityRootClose } from '../../scripts/concurrency/capacity-publication';
import { summarizeOperations } from '../../scripts/concurrency/capacity-metrics';

const profileFixture = (databaseIdentitySha256 = 'd'.repeat(64)) => {
  const profile = {
    schemaVersion: 1,
    kind: 'LINUX_FREE_4CPU_16G_V1',
    host: {
      platform: 'linux',
      distribution: 'ubuntu-24.04',
      logicalCpu: 4,
      nominalMemoryBytes: 16 * 1024 ** 3,
      memTotalBytes: 16 * 1024 ** 3 - 1000000,
      affinityCpus: [0, 1, 2, 3],
      cpuQuotaUs: null,
      cpuPeriodUs: null,
      cgroupIdentitySha256: '1'.repeat(64),
      limitChainSha256: '2'.repeat(64),
      clockTicksPerSecond: 100,
      dedicatedGenerator: false,
    },
    identity: {
      jobSha256: 'a'.repeat(64),
      instanceSha256: 'b'.repeat(64),
      bootIdSha256: 'c'.repeat(64),
      databaseIdentitySha256,
      ownerUid: 1001,
    },
    backend: {
      source: 'SAME_HOST_CGROUP_V2',
      cgroupIdentitySha256: 'e'.repeat(64),
      cpuQuotaUs: 400000,
      cpuPeriodUs: 100000,
      memoryMaxBytes: 6 * 1024 ** 3,
      services: 8,
    },
  };
  const bytes = JSON.stringify(profile),
    trusted = {
      expectedSha256: sha256(bytes),
      observed: {
        host: profile.host,
        identity: profile.identity,
        backend: profile.backend,
      },
    };
  return {
    profile,
    bytes,
    trusted,
    authority: validateExecutionProfile(bytes, trusted),
  };
};

const samples = (
  f: ReturnType<typeof profileFixture>,
  at = 0,
  protocol = false,
) => ({
  host: {
    platform: 'linux',
    executionProfileSha256: f.authority.sha256,
    sampledAtMonotonicMs: 100000 + at,
    instanceSha256: f.profile.identity.instanceSha256,
    jobSha256: f.profile.identity.jobSha256,
    generatorCgroupIdentitySha256: f.profile.host.cgroupIdentitySha256,
    limitChainSha256: f.profile.host.limitChainSha256,
    hostMemoryTotalBytes: f.profile.host.memTotalBytes,
    hostLogicalCpu: 4,
    node: {
      pid: 10,
      startTicks: '100',
      uid: 1001,
      bootIdSha256: f.profile.identity.bootIdSha256,
    },
    browser: protocol
      ? null
      : {
          pid: 11,
          startTicks: '101',
          uid: 1001,
          bootIdSha256: f.profile.identity.bootIdSha256,
        },
    treeComplete: protocol ? null : true,
    browserProcessCount: protocol ? 0 : 3,
    nodeRssBytes: 1000000,
    nodePssBytes: 900000,
    browserTreeRssBytes: protocol ? null : 7 * 1024 ** 3,
    browserTreePssBytes: protocol ? null : 2 * 1024 ** 3,
    nodeCpuLifetimePercentOfOneCore: 20,
    browserCpuLifetimePercentOfOneCore: protocol ? null : 50,
    hostSwapUsedBytes: 0,
    memoryPsiSomeAvg10Percent: 0,
    memoryPsiFullAvg10Percent: 0,
    hostOomKills: 0,
    memoryAccounting: 'LINUX_SMAPS_ROLLUP_PSS_WITH_SEPARATE_RSS',
    readOnly: true,
  },
  backend: {
    source: 'SAME_HOST_CGROUP_V2',
    executionProfileSha256: f.authority.sha256,
    sampledAtMonotonicMs: 200000 + at,
    cgroupIdentitySha256: f.profile.backend.cgroupIdentitySha256,
    cpuQuotaUs: 400000,
    cpuPeriodUs: 100000,
    memoryMaxBytes: 6 * 1024 ** 3,
    services: 8,
    memoryCurrentBytes: 1024 ** 3,
    swapCurrentBytes: 0,
    cpuUsageUsec: at * 1000,
    throttledUsec: 0,
    oom: 0,
    oomKill: 0,
    readOnly: true,
  },
});
const feed = (
  h: ReturnType<typeof createLinuxCapacityHealth>,
  s: ReturnType<typeof samples>,
  at: number,
) => {
  h.host({ startedAtNodeMs: at, completedAtNodeMs: at, sample: s.host });
  h.backend({ startedAtNodeMs: at, completedAtNodeMs: at, sample: s.backend });
  h.eventLoop({ atNodeMs: at, p95Ms: 2 });
};
describe('truthful free Linux samples and fixed engineering guards', () => {
  it('separates PSS/RSS and actual backend without any Darwin VM/flags, including protocol browser-null', () => {
    for (const protocol of [false, true]) {
      const f = profileFixture(),
        h = createLinuxCapacityHealth(
          protocol ? 'NODE_PROTOCOL' : 'NATIVE_BROWSER',
          f.authority,
        );
      feed(h, samples(f, 0, protocol), 0);
      const out = h.snapshot(0);
      expect(out.validity).toBe('VALID');
      expect(out.backendSamples).toBe(1);
      expect(out).not.toHaveProperty('vmSamples');
      expect(out).not.toHaveProperty('hostPressureFlag');
      expect(out).not.toHaveProperty('browserTreeFootprintMaxBytes');
      expect(out.browserTreePssMaxBytes).toBe(protocol ? null : 2 * 1024 ** 3);
      expect(() => validateLinuxCapacityHealth(out)).toThrow();
      expect(() =>
        validateLinuxCapacityHealth({ ...out, backendSamples: 0 }, f.authority),
      ).toThrow();
    }
  });
  it.each(['same-start', 'different-start'])(
    'rejects Node as browser on the first sample (%s)',
    (variant) => {
      const f = profileFixture(),
        h = createLinuxCapacityHealth('NATIVE_BROWSER', f.authority),
        first = samples(f);
      first.host.browser = {
        ...first.host.node,
        startTicks:
          variant === 'same-start' ? first.host.node.startTicks : '999',
      };
      feed(h, first, 0);
      const result = h.snapshot(0);
      expect(result.validity).toBe('UNKNOWN');
      expect(result.hostSamples).toBe(0);
      expect(result.reasons).toContain('identity_changed');
    },
  );
  it('rejects VALID summaries missing actual PSI/swap measurements or substituting PSS for RSS', () => {
    const f = profileFixture(),
      h = createLinuxCapacityHealth('NATIVE_BROWSER', f.authority);
    feed(h, samples(f), 0);
    const good = h.snapshot(0);
    for (const field of [
      'memoryPsiSomeAvg10MaxPercent',
      'memoryPsiFullAvg10MaxPercent',
      'hostSwapIncreaseMaxBytes',
      'backendSwapCurrentBytes',
    ] as const) {
      expect(() =>
        validateLinuxCapacityHealth({ ...good, [field]: null }, f.authority),
      ).toThrow();
    }
    expect(() =>
      validateLinuxCapacityHealth(
        { ...good, browserTreePssMaxBytes: 8 * 1024 ** 3 },
        f.authority,
      ),
    ).toThrow();
  });
  it.each([
    'missing-psi',
    'missing-pss',
    'pss-rss',
    'tree',
    'darwin',
    'boot',
    'pid-reuse',
    'instance',
    'counter-reset',
    'cgroup',
    'limits',
    'fake-vm',
  ])('keeps %s UNKNOWN rather than replacing the baseline', (bad) => {
    const f = profileFixture(),
      h = createLinuxCapacityHealth('NATIVE_BROWSER', f.authority);
    const first = samples(f);
    if (bad === 'counter-reset') first.backend.cpuUsageUsec = 2000000;
    feed(h, first, 0);
    const next = samples(f, 1000);
    if (bad === 'missing-psi')
      Reflect.deleteProperty(next.host, 'memoryPsiSomeAvg10Percent');
    if (bad === 'missing-pss') next.host.browserTreePssBytes = null;
    if (bad === 'pss-rss') next.host.browserTreePssBytes = 8 * 1024 ** 3;
    if (bad === 'tree') next.host.treeComplete = false;
    if (bad === 'darwin') next.host.platform = 'darwin';
    if (bad === 'boot') next.host.node.bootIdSha256 = '0'.repeat(64);
    if (bad === 'pid-reuse') next.host.node.startTicks = '999';
    if (bad === 'instance') next.host.instanceSha256 = '0'.repeat(64);
    if (bad === 'counter-reset') next.backend.cpuUsageUsec = 1000000;
    if (bad === 'cgroup') next.backend.cgroupIdentitySha256 = '0'.repeat(64);
    if (bad === 'limits') next.backend.memoryMaxBytes = 7 * 1024 ** 3;
    if (bad === 'fake-vm') next.backend.source = 'VM';
    feed(h, next, 1000);
    expect(h.snapshot(1000).validity).toBe('UNKNOWN');
  });
  it('retains all freshness limits, immediate Node/host OOM and separate backend OOM uncertainty', () => {
    for (const bad of ['node', 'host-oom', 'backend-oom', 'stale']) {
      const f = profileFixture(),
        h = createLinuxCapacityHealth('NATIVE_BROWSER', f.authority);
      const first = samples(f);
      if (bad === 'counter-reset') first.backend.cpuUsageUsec = 2000000;
      feed(h, first, 0);
      const next = samples(f, 1000);
      if (bad === 'node') next.host.nodeRssBytes = 2 * 1024 ** 3 + 1;
      if (bad === 'host-oom') next.host.hostOomKills = 1;
      if (bad === 'backend-oom') next.backend.oomKill = 1;
      feed(h, next, 1000);
      const out = h.snapshot(bad === 'stale' ? 9000 : 1000);
      expect(out.validity).toBe(
        bad === 'backend-oom' || bad === 'stale'
          ? 'UNKNOWN'
          : 'GENERATOR_LIMITED',
      );
      if (bad === 'backend-oom') {
        expect(out.reasons).toContain('backend_oom');
        expect(out.reasons).not.toContain('browser_pss');
      }
      expect(() =>
        validateLinuxCapacityHealth(
          { ...out, validity: 'VALID', reasons: [] },
          f.authority,
        ),
      ).toThrow();
    }
  });
  it.each(['pss', 'psi', 'swap', 'loop'])(
    'sustains fixed %s budget for ten seconds without relaxing it',
    (bad) => {
      const f = profileFixture(),
        h = createLinuxCapacityHealth('NATIVE_BROWSER', f.authority);
      feed(h, samples(f), 0);
      for (let at = 1000; at <= 11000; at += 1000) {
        const s = samples(f, at);
        if (bad === 'pss') s.host.browserTreePssBytes = 6 * 1024 ** 3 + 1;
        if (bad === 'psi') s.host.memoryPsiSomeAvg10Percent = 10;
        if (bad === 'swap') s.host.hostSwapUsedBytes = 512 * 1024 ** 2;
        h.host({ startedAtNodeMs: at, completedAtNodeMs: at, sample: s.host });
        h.backend({
          startedAtNodeMs: at,
          completedAtNodeMs: at,
          sample: s.backend,
        });
        h.eventLoop({ atNodeMs: at, p95Ms: bad === 'loop' ? 201 : 2 });
        expect(h.snapshot(at).validity).toBe(
          at < 11000 ? 'VALID' : 'GENERATOR_LIMITED',
        );
      }
    },
  );
});

it('resets unsustained pressure without stitching separate intervals', () => {
  const f = profileFixture(),
    h = createLinuxCapacityHealth('NATIVE_BROWSER', f.authority);
  for (let at = 0; at <= 21000; at += 1000) {
    const s = samples(f, at);
    s.host.memoryPsiFullAvg10Percent = at === 10000 ? 0 : 1;
    feed(h, s, at);
    expect(h.snapshot(at).validity).toBe(
      at === 21000 ? 'GENERATOR_LIMITED' : 'VALID',
    );
  }
});
it('binds real Linux reducer output through final receipt and Root physical-close publication', async () => {
  const old = await capacityFixture(),
    f = profileFixture(old.input.databaseIdentitySha256);
  const functional = {
      ...old.receipt,
      executionProfileSha256: f.authority.sha256,
    },
    receiptBytes = JSON.stringify(functional);
  const functionalClose = {
      ...old.processClose,
      executionProfileSha256: f.authority.sha256,
      functionalResultSha256: sha256(receiptBytes),
    },
    processCloseBytes = JSON.stringify(functionalClose);
  const scope = parseCapacityScope(
    {
      ...old.input,
      helpers: Object.fromEntries(
        linuxScopeHelperNames.map((n) => [n, 'b'.repeat(64)]),
      ),
      executionProfileSha256: f.authority.sha256,
      functionalResultSha256: sha256(receiptBytes),
      functionalProcessCloseSha256: sha256(processCloseBytes),
    },
    { receiptBytes, processCloseBytes, executionProfileAuthority: f.authority },
  );
  const plan = createCapacityManifest(scope),
    r = newCapacityReceipt(
      plan,
      scope,
      'anonymous_entry_prepare-native_browser-3',
      'wcr-abcdef-123456',
      null,
    );
  const health = createLinuxCapacityHealth('NATIVE_BROWSER', f.authority);
  feed(health, samples(f), 0);
  r.health = health.snapshot(0);
  r.controls = {
    functionalAuthority: true,
    ownership: true,
    journey: true,
    readback: true,
    outsider: null,
    retention: true,
    cleanup: true,
    resourcesClosed: true,
    settled: true,
    unexpectedErrors: 0,
  };
  r.rateLimit = {
    observed429Count: 0,
    source: 'NOT_OBSERVED',
    retryAfterSeconds: null,
    observedAtUtc: null,
    nextEligibleAtUtc: null,
    evidenceSha256: null,
    automaticRetryCount: 0,
  };
  r.metrics = summarizeOperations([], 3, [0, 1, 2]);
  r.barriers = r.leg.barriers.map((name) => ({
    name,
    measurement: {
      result: 'VALID',
      actorsExpected: 3,
      requestsObserved: 3,
      skewMs: 1,
    },
  }));
  r.bundle = {
    sourceRevision: scope.sourceRevision,
    artifactSha256: scope.artifactSha256,
    entryClosureSha256: 'f'.repeat(64),
    entryClosureGzipBytes: 300 * 1024,
    recursiveColdImports: true,
    deduplicatedChunks: true,
  };
  r.elapsedMs = 100;
  const final = finalizeCapacityReceipt(r, plan, scope);
  expect(final.result).toBe('PASS');
  const publishers = {
      rootCapacityPublisherSha256: 'a'.repeat(64),
      rootCapacityValidatorSha256: 'b'.repeat(64),
    },
    bytes = JSON.stringify(final);
  const close = {
    schemaVersion: 1,
    kind: 'ROOT_CAPACITY_PROCESS_CLOSE',
    executionProfileSha256: f.authority.sha256,
    projectId: scope.projectId,
    planId: scope.planId,
    planSha256: capacityManifestHash(plan),
    sourceRevision: scope.sourceRevision,
    artifactSha256: scope.artifactSha256,
    runId: final.runId,
    legId: final.leg.legId,
    mode: final.leg.mode,
    result: 'VERIFIED',
    runOutcome: 'PASS',
    exitCode: 0,
    signal: null,
    elapsedMs: 100,
    outerBudgetMs: 1500000,
    stdoutSha256: 'c'.repeat(64),
    candidateSha256: 'd'.repeat(64),
    capacityResultSha256: sha256(bytes),
    requestSha256: 'e'.repeat(64),
    ownedResourcesClosed: true,
    observedOwnedProcessesRemaining: 0,
    stderrBytes: 0,
    sourceStillFrozen: true,
    ...publishers,
    resourceVerification: 'PRODUCER_CLEANUP_AND_OBSERVED_PROCESS_EXIT',
  };
  const link = (value: typeof close) => {
    const closeBytes = JSON.stringify(value);
    return {
      legId: final.leg.legId,
      resultSha256: sha256(bytes),
      processCloseSha256: sha256(closeBytes),
      requestSha256: value.requestSha256,
      receiptBytes: bytes,
      processCloseBytes: closeBytes,
    };
  };
  expect(
    assertCapacityRootClose(plan, scope, link(close), publishers).result,
  ).toBe('PASS');
  const missing = { ...close };
  Reflect.deleteProperty(missing, 'executionProfileSha256');
  expect(() =>
    assertCapacityRootClose(plan, scope, link(missing), publishers),
  ).toThrow();
  expect(() =>
    assertCapacityRootClose(
      plan,
      scope,
      link({ ...close, executionProfileSha256: '0'.repeat(64) }),
      publishers,
    ),
  ).toThrow();
  const next = samples(f, 1000);
  next.backend.oomKill = 1;
  feed(health, next, 1000);
  const uncertain = finalizeCapacityReceipt(
    { ...r, health: health.snapshot(1000) },
    plan,
    scope,
  );
  expect(uncertain.result).toBe('INCONCLUSIVE');
  expect(uncertain.failureReasons).toContain('backend_resource');
  expect(uncertain.failureReasons).not.toContain('generator_limited');
});
