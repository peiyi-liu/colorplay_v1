import { describe, expect, it, vi } from 'vitest';
import {
  validateExecutionProfile,
  requireExecutionProfile,
} from '../../scripts/concurrency/execution-profile';
import { sha256 } from '../../scripts/concurrency/local-runtime';
import { capacityFixture } from './helpers/whole-site-capacity';
import { parseCapacityScope } from '../../scripts/concurrency/capacity-scope';
import {
  createCapacityManifest,
  validateCapacityManifest,
} from '../../scripts/concurrency/capacity-manifest';

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

describe('independent fixed free-Linux profile authority', () => {
  it('pins exact bytes/observed facts, freezes nested values and cannot be cloned into authority', () => {
    const f = profileFixture();
    expect(requireExecutionProfile(f.authority.sha256, f.authority)).toBe(
      f.authority,
    );
    expect(Reflect.set(f.authority.profile.host, 'memTotalBytes', 1)).toBe(
      false,
    );
    expect(() =>
      requireExecutionProfile(f.authority.sha256, structuredClone(f.authority)),
    ).toThrow('EXECUTION_PROFILE_INVALID');
    expect(() => requireExecutionProfile(f.authority.sha256)).toThrow(
      'EXECUTION_PROFILE_INVALID',
    );
    expect(() => validateExecutionProfile(f.bytes + '\n', f.trusted)).toThrow(
      'EXECUTION_PROFILE_INVALID',
    );
    expect(() =>
      validateExecutionProfile(f.bytes, {
        ...f.trusted,
        observed: {
          ...f.trusted.observed,
          host: { ...f.profile.host, memTotalBytes: 1 },
        },
      }),
    ).toThrow('EXECUTION_PROFILE_INVALID');
  });
  it.each([
    'budget',
    'platform',
    'cpu',
    'affinity',
    'backend',
    'dedicated',
    'quota',
  ])('rejects %s despite a mock independent re-pin', (bad) => {
    const f = profileFixture(),
      p = structuredClone(f.profile);
    if (bad === 'budget')
      Object.assign(p, { browserPssLimitBytes: 12 * 1024 ** 3 });
    if (bad === 'platform') p.host.platform = 'darwin';
    if (bad === 'cpu') p.host.logicalCpu = 16;
    if (bad === 'affinity') p.host.affinityCpus = [0, 0, 1, 2];
    if (bad === 'backend') p.backend.memoryMaxBytes = 12 * 1024 ** 3;
    if (bad === 'dedicated') p.host.dedicatedGenerator = true;
    if (bad === 'quota') p.backend.cpuQuotaUs = 800000;
    const bytes = JSON.stringify(p);
    expect(() =>
      validateExecutionProfile(bytes, {
        expectedSha256: sha256(bytes),
        observed: { host: p.host, identity: p.identity, backend: p.backend },
      }),
    ).toThrow('EXECUTION_PROFILE_INVALID');
  });
  it('binds Linux functional receipt/physical close/scope and rejects missing authority or mixed profiles', async () => {
    const f = await capacityFixture(),
      p = profileFixture(f.input.databaseIdentitySha256);
    const receipt = {
        ...f.receipt,
        executionProfileSha256: p.authority.sha256,
      },
      receiptBytes = JSON.stringify(receipt);
    const close = {
        ...f.processClose,
        executionProfileSha256: p.authority.sha256,
        functionalResultSha256: sha256(receiptBytes),
      },
      processCloseBytes = JSON.stringify(close);
    const input = {
      ...f.input,
      executionProfileSha256: p.authority.sha256,
      functionalResultSha256: sha256(receiptBytes),
      functionalProcessCloseSha256: sha256(processCloseBytes),
    };
    const proof = {
      receiptBytes,
      processCloseBytes,
      executionProfileAuthority: p.authority,
    };
    const scope = parseCapacityScope(input, proof),
      manifest = createCapacityManifest(scope);
    expect(manifest.engineeringGuards).toHaveProperty(
      'browserPssLimitBytes',
      6 * 1024 ** 3,
    );
    expect(manifest.engineeringGuards).not.toHaveProperty(
      'browserFootprintLimitBytes',
    );
    expect(() =>
      parseCapacityScope(input, { receiptBytes, processCloseBytes }),
    ).toThrow();
    expect(() =>
      parseCapacityScope(input, {
        ...proof,
        executionProfileAuthority: profileFixture('0'.repeat(64)).authority,
      }),
    ).toThrow();
    for (const missing of ['receipt', 'close']) {
      const rb =
        missing === 'receipt' ? JSON.stringify(f.receipt) : receiptBytes;
      const cb =
        missing === 'close'
          ? JSON.stringify(f.processClose)
          : JSON.stringify({ ...close, functionalResultSha256: sha256(rb) });
      expect(() =>
        parseCapacityScope(
          {
            ...input,
            functionalResultSha256: sha256(rb),
            functionalProcessCloseSha256: sha256(cb),
          },
          { ...proof, receiptBytes: rb, processCloseBytes: cb },
        ),
      ).toThrow();
    }
    expect(() =>
      validateCapacityManifest(
        {
          ...manifest,
          engineeringGuards: {
            ...manifest.engineeringGuards,
            browserPssLimitBytes: 12 * 1024 ** 3,
          },
        },
        scope,
      ),
    ).toThrow();
    const old = parseCapacityScope(f.input, f.proof);
    expect(JSON.stringify(old)).toBe(JSON.stringify(f.input));
    expect(Object.hasOwn(old, 'executionProfileSha256')).toBe(false);
  });
  it('does not make requests when profile admission rejects', () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    try {
      expect(() => validateExecutionProfile('SYNTHETIC_PRIVATE', {})).toThrow(
        'EXECUTION_PROFILE_INVALID',
      );
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
