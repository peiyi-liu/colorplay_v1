import { expect, it } from 'vitest';
import { syntheticLinuxRuntime } from './helpers/whole-site-linux-runtime';
import { validateExecutionProfile } from '../../scripts/concurrency/execution-profile';
import { sha256 } from '../../scripts/concurrency/local-runtime';
import {
  createLinuxCapacityHealth,
  validateLinuxCapacityHealth,
} from '../../scripts/concurrency/capacity-linux-health';
import {
  createCapacityManifest,
  validateCapacityManifest,
  capacityManifestHash,
} from '../../scripts/concurrency/capacity-manifest';
import { parseCapacityScope } from '../../scripts/concurrency/capacity-scope';
import { linuxScopeHelperNames } from '../../scripts/concurrency/root-helper-contracts';
import { capacityFixture } from './helpers/whole-site-capacity';

const kind = 'LINUX_VM_12CPU_32G_BROWSER12G_V1';
const fixture = () => {
  const profile = syntheticLinuxRuntime().profile;
  profile.kind = kind;
  Object.assign(profile.host, {
    logicalCpu: 12,
    nominalMemoryBytes: 32 * 1024 ** 3,
    memTotalBytes: 31 * 1024 ** 3,
    affinityCpus: Array.from({ length: 12 }, (_, index) => index),
  });
  return profile;
};
const approve = (profile = fixture()) => {
  const bytes = JSON.stringify(profile);
  return validateExecutionProfile(bytes, {
    expectedSha256: sha256(bytes),
    observed: {
      host: profile.host,
      identity: profile.identity,
      backend: profile.backend,
    },
  });
};
it('accepts the independently approved browser12G version on the exact twelve-CPU host', () => {
  expect(approve().profile.kind).toBe(kind);
});

const runHealth = (profile: ReturnType<typeof fixture>, pss: number) => {
  const authority = approve(profile);
  const health = createLinuxCapacityHealth('NATIVE_BROWSER', authority);
  const node = {
    pid: 10,
    startTicks: '100',
    uid: 1001,
    bootIdSha256: profile.identity.bootIdSha256,
  };
  const feed = (at: number) => {
    health.host({
      startedAtNodeMs: at,
      completedAtNodeMs: at,
      sample: {
        platform: 'linux',
        executionProfileSha256: authority.sha256,
        sampledAtMonotonicMs: 100000 + at,
        instanceSha256: profile.identity.instanceSha256,
        jobSha256: profile.identity.jobSha256,
        generatorCgroupIdentitySha256: profile.host.cgroupIdentitySha256,
        limitChainSha256: profile.host.limitChainSha256,
        hostMemoryTotalBytes: profile.host.memTotalBytes,
        hostLogicalCpu: profile.host.logicalCpu,
        node,
        browser: { ...node, pid: 11, startTicks: '101' },
        treeComplete: true,
        browserProcessCount: 3,
        nodeRssBytes: 1000000,
        nodePssBytes: 900000,
        browserTreeRssBytes: pss + 1024 ** 3,
        browserTreePssBytes: pss,
        nodeCpuLifetimePercentOfOneCore: 20,
        browserCpuLifetimePercentOfOneCore: 50,
        hostSwapUsedBytes: 0,
        memoryPsiSomeAvg10Percent: 0,
        memoryPsiFullAvg10Percent: 0,
        hostOomKills: 0,
        memoryAccounting: 'LINUX_SMAPS_ROLLUP_PSS_WITH_SEPARATE_RSS',
        readOnly: true,
      },
    });
    health.backend({
      startedAtNodeMs: at,
      completedAtNodeMs: at,
      sample: {
        source: 'SAME_HOST_CGROUP_V2',
        executionProfileSha256: authority.sha256,
        sampledAtMonotonicMs: 200000 + at,
        cgroupIdentitySha256: profile.backend.cgroupIdentitySha256,
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
    health.eventLoop({ atNodeMs: at, p95Ms: 2 });
    return health.snapshot(at);
  };
  return { authority, feed };
};
const versions = [
  ['LINUX_FREE_4CPU_16G_V1', 4, 16, 6],
  ['LINUX_VM_16CPU_32G_V1', 16, 32, 6],
  ['LINUX_VM_12CPU_32G_V1', 12, 32, 6],
  [kind, 12, 32, 12],
] as const;
const version = (row: readonly [string, number, number, number]) => {
  const profile = fixture();
  profile.kind = row[0];
  Object.assign(profile.host, {
    logicalCpu: row[1],
    nominalMemoryBytes: row[2] * 1024 ** 3,
    memTotalBytes: (row[2] - 1) * 1024 ** 3,
    affinityCpus: Array.from({ length: row[1] }, (_, i) => i),
  });
  return profile;
};
it.each(versions)(
  'preserves %s exact PSS boundary and the original ten-second window',
  (name, cpu, ram, limit) => {
    const profile = version([name, cpu, ram, limit]);
    for (const delta of [0, 1]) {
      const { authority, feed } = runHealth(profile, limit * 1024 ** 3 + delta);
      for (let at = 0; at <= 10000; at += 1000) {
        const result = feed(at);
        expect(result.validity).toBe(
          delta && at === 10000 ? 'GENERATOR_LIMITED' : 'VALID',
        );
        expect(validateLinuxCapacityHealth(result, authority)).toEqual(result);
      }
    }
  },
);
it('does not upgrade old twelve-CPU policy from hardware and rejects cross-profile summaries', () => {
  const old = version(versions[2]);
  const modern = runHealth(fixture(), 7 * 1024 ** 3);
  const legacy = runHealth(old, 7 * 1024 ** 3);
  for (let at = 0; at <= 10000; at += 1000) {
    modern.feed(at);
    legacy.feed(at);
  }
  const result = modern.feed(11000);
  expect(result.validity).toBe('VALID');
  expect(legacy.feed(11000).reasons).toContain('browser_pss');
  expect(() => validateLinuxCapacityHealth(result, legacy.authority)).toThrow();
});
it.each([
  'cpu',
  'affinity',
  'low-memory',
  'high-memory',
  'quota',
  'backend',
  'kind',
  'extra',
])('rejects independently re-pinned invalid new-version %s', (bad) => {
  const profile = fixture();
  if (bad === 'cpu') profile.host.logicalCpu = 16;
  if (bad === 'affinity') profile.host.affinityCpus[11] = 0;
  if (bad === 'low-memory') profile.host.memTotalBytes = 28 * 1024 ** 3 - 1;
  if (bad === 'high-memory') profile.host.memTotalBytes = 32 * 1024 ** 3 + 1;
  if (bad === 'quota')
    Object.assign(profile.host, { cpuQuotaUs: 400000, cpuPeriodUs: 100000 });
  if (bad === 'backend') profile.backend.memoryMaxBytes = 12 * 1024 ** 3;
  if (bad === 'kind') profile.kind = 'UNKNOWN';
  if (bad === 'extra')
    Object.assign(profile, { browserPssLimitBytes: 12 * 1024 ** 3 });
  expect(() => approve(profile)).toThrow();
});
const scoped = async (profile: ReturnType<typeof fixture>) => {
  const f = await capacityFixture();
  profile.identity.databaseIdentitySha256 = f.input.databaseIdentitySha256;
  const authority = approve(profile);
  const receiptBytes = JSON.stringify({
    ...f.receipt,
    executionProfileSha256: authority.sha256,
  });
  const processCloseBytes = JSON.stringify({
    ...f.processClose,
    executionProfileSha256: authority.sha256,
    functionalResultSha256: sha256(receiptBytes),
  });
  return parseCapacityScope(
    {
      ...f.input,
      executionProfileSha256: authority.sha256,
      helpers: Object.fromEntries(
        linuxScopeHelperNames.map((n) => [n, 'b'.repeat(64)]),
      ),
      functionalResultSha256: sha256(receiptBytes),
      functionalProcessCloseSha256: sha256(processCloseBytes),
    },
    { receiptBytes, processCloseBytes, executionProfileAuthority: authority },
  );
};
it('binds guard bytes and plan hashes to genuine authority and rejects both cross-kind substitutions', async () => {
  const oldScope = await scoped(version(versions[2])),
    newScope = await scoped(fixture());
  const oldPlan = createCapacityManifest(oldScope),
    newPlan = createCapacityManifest(newScope);
  expect([oldPlan.engineeringGuards, newPlan.engineeringGuards]).toEqual([
    expect.objectContaining({ browserPssLimitBytes: 6 * 1024 ** 3 }),
    expect.objectContaining({ browserPssLimitBytes: 12 * 1024 ** 3 }),
  ]);
  expect(capacityManifestHash(oldPlan)).not.toBe(capacityManifestHash(newPlan));
  for (const [plan, scope, other] of [
    [oldPlan, oldScope, newPlan],
    [newPlan, newScope, oldPlan],
  ] as const) {
    expect(validateCapacityManifest(plan, scope)).toEqual(plan);
    expect(() =>
      validateCapacityManifest(
        { ...plan, engineeringGuards: other.engineeringGuards },
        scope,
      ),
    ).toThrow();
    expect(() => validateCapacityManifest(other, scope)).toThrow();
  }
});
