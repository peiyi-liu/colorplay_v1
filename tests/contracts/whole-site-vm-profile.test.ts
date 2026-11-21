import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { syntheticLinuxRuntime } from './helpers/whole-site-linux-runtime';
import { validateExecutionProfile } from '../../scripts/concurrency/execution-profile';
import { sha256 } from '../../scripts/concurrency/local-runtime';

const paid = (cpu: 12 | 16 = 16) => {
  const value = structuredClone(syntheticLinuxRuntime().profile);
  value.kind = cpu === 12 ? 'LINUX_VM_12CPU_32G_V1' : 'LINUX_VM_16CPU_32G_V1';
  Object.assign(value.host, {
    logicalCpu: cpu,
    nominalMemoryBytes: 32 * 1024 ** 3,
    memTotalBytes: 31 * 1024 ** 3,
    affinityCpus: Array.from({ length: cpu }, (_, index) => index),
  });
  return value;
};
const validate = (value: ReturnType<typeof paid>) => {
  const bytes = JSON.stringify(value);
  return validateExecutionProfile(bytes, {
    expectedSha256: sha256(bytes),
    observed: {
      host: value.host,
      identity: value.identity,
      backend: value.backend,
    },
  });
};
describe('paid VM profile without changing free authority or engineering guards', () => {
  it('accepts the complete paid tuple and both memory boundaries', () => {
    for (const memory of [28, 31, 32]) {
      const value = paid();
      value.host.memTotalBytes = memory * 1024 ** 3;
      expect(validate(value).profile.kind).toBe('LINUX_VM_16CPU_32G_V1');
    }
  });
  it.each(['kind', 'cpu', 'memory', 'affinity', 'quota', 'backend'])(
    'rejects independently re-pinned mixed %s',
    (bad) => {
      const value = paid();
      if (bad === 'kind') value.kind = 'LINUX_FREE_4CPU_16G_V1';
      if (bad === 'cpu') value.host.logicalCpu = 4;
      if (bad === 'memory') value.host.memTotalBytes = 28 * 1024 ** 3 - 1;
      if (bad === 'affinity') value.host.affinityCpus[15] = 0;
      if (bad === 'quota')
        Object.assign(value.host, { cpuQuotaUs: 400000, cpuPeriodUs: 100000 });
      if (bad === 'backend') value.backend.memoryMaxBytes = 32 * 1024 ** 3;
      expect(() => validate(value)).toThrow();
    },
  );
  it('preserves the existing free schema acceptance range', () => {
    const value = syntheticLinuxRuntime().profile;
    value.host.memTotalBytes = 1;
    expect(validate(value).profile.kind).toBe('LINUX_FREE_4CPU_16G_V1');
  });
});

it('loads paid/free runtime authority through actual fresh helper observations', async () => {
  const { loadExecutionProfileRuntime } =
    await import('../../scripts/concurrency/execution-profile-runtime');
  const { ROOT_RUNTIME_DIRECTORY, linuxClosureNames } =
    await import('../../scripts/concurrency/root-helper-contracts');
  for (const profile of [
    paid(),
    paid(12),
    { ...paid(12), kind: 'LINUX_VM_12CPU_32G_BROWSER12G_V1' },
    syntheticLinuxRuntime().profile,
  ]) {
    const profileBytes = JSON.stringify(profile),
      profileSha = sha256(profileBytes);
    const files = Object.fromEntries(
      linuxClosureNames.map((name) => [
        join(ROOT_RUNTIME_DIRECTORY, name),
        '# synthetic ' + name,
      ]),
    );
    const hashes = Object.fromEntries(
      linuxClosureNames.map((name) => [
        name,
        sha256(files[join(ROOT_RUNTIME_DIRECTORY, name)] ?? ''),
      ]),
    );
    const closure = JSON.stringify({
      schemaVersion: 1,
      sourceRevision: 'a'.repeat(40),
      executionProfileSha256: profileSha,
      files: hashes,
    });
    files[join(ROOT_RUNTIME_DIRECTORY, 'execution-profile.json')] =
      profileBytes;
    files[
      join(ROOT_RUNTIME_DIRECTORY, 'execution-profile-helper-closure.json')
    ] = closure;
    const runtime = await loadExecutionProfileRuntime(
      {
        sourceRevision: 'a'.repeat(40),
        profileSha256: profileSha,
        descriptor: { helperClosureSha256: sha256(closure) },
        databaseIdentitySha256: profile.identity.databaseIdentitySha256,
        helperHashes: hashes,
      },
      {
        platform: 'linux',
        read: async (path) =>
          files[path] ?? Promise.reject(new Error('UNEXPECTED_READ')),
        execute: (_helper, args) =>
          Promise.resolve({
            sourceRevision: args[0],
            challenge: args[2],
            observed: {
              host: profile.host,
              identity: profile.identity,
              backend: profile.backend,
            },
          }),
      },
      new AbortController().signal,
    );
    expect(runtime?.authority.profile.kind).toBe(profile.kind);
    await runtime?.verify();
  }
});

it('rejects a four-CPU sample under the independently approved paid profile', async () => {
  const { createLinuxCapacityHealth } =
    await import('../../scripts/concurrency/capacity-linux-health');
  for (const profileCpu of [12, 16] as const) {
    const profile = paid(profileCpu),
      authority = validate(profile);
    const node = {
      pid: 123,
      startTicks: '1',
      uid: 1001,
      bootIdSha256: profile.identity.bootIdSha256,
    };
    const sample = {
      platform: 'linux',
      executionProfileSha256: authority.sha256,
      sampledAtMonotonicMs: 100,
      instanceSha256: profile.identity.instanceSha256,
      jobSha256: profile.identity.jobSha256,
      generatorCgroupIdentitySha256: profile.host.cgroupIdentitySha256,
      limitChainSha256: profile.host.limitChainSha256,
      hostMemoryTotalBytes: profile.host.memTotalBytes,
      hostLogicalCpu: 16,
      node,
      browser: null,
      treeComplete: null,
      browserProcessCount: 0,
      nodeRssBytes: 1000,
      nodePssBytes: 900,
      browserTreeRssBytes: null,
      browserTreePssBytes: null,
      nodeCpuLifetimePercentOfOneCore: 1,
      browserCpuLifetimePercentOfOneCore: null,
      hostSwapUsedBytes: 0,
      memoryPsiSomeAvg10Percent: 0,
      memoryPsiFullAvg10Percent: 0,
      hostOomKills: 0,
      memoryAccounting: 'LINUX_SMAPS_ROLLUP_PSS_WITH_SEPARATE_RSS',
      readOnly: true,
    };
    for (const cpu of [16, 12, 4]) {
      const health = createLinuxCapacityHealth('NODE_PROTOCOL', authority);
      health.host({
        startedAtNodeMs: 0,
        completedAtNodeMs: 1,
        sample: { ...sample, hostLogicalCpu: cpu },
      });
      expect(health.snapshot(1).hostSamples).toBe(cpu === profileCpu ? 1 : 0);
    }
  }
});

it('accepts only the full twelve-CPU tuple, not mixed sixteen-CPU facts', () => {
  for (const memory of [28, 31, 32]) {
    const value = paid(12);
    value.host.memTotalBytes = memory * 1024 ** 3;
    expect(validate(value).profile.kind).toBe('LINUX_VM_12CPU_32G_V1');
    Object.assign(value.host, { cpuQuotaUs: 1200000, cpuPeriodUs: 100000 });
    expect(validate(value).profile.kind).toBe('LINUX_VM_12CPU_32G_V1');
  }
  for (const from of [12, 16] as const) {
    const to = from === 12 ? 16 : 12;
    const value = paid(from);
    value.kind = paid(to).kind;
    expect(() => validate(value)).toThrow('EXECUTION_PROFILE_INVALID');
  }
});
