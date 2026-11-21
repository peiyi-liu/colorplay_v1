import { describe, expect, it } from 'vitest';
import { parseFunctionalScope } from '../../scripts/concurrency/config';
import {
  newFunctionalReceipt,
  functionalReceiptSchema,
} from '../../scripts/concurrency/functional-receipt';
import { validateExecutionProfile } from '../../scripts/concurrency/execution-profile';
import {
  preflightFunctional,
  sha256,
  requireFunctionalReady,
} from '../../scripts/concurrency/local-runtime';
import {
  syntheticSecrets,
  preflightPorts,
  syntheticAttestation,
  syntheticScope,
} from './helpers/whole-site-functional';

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

describe('explicit optional execution profile without rewriting legacy bytes', () => {
  it('admits explicit profile identity syntactically while leaving authority to preflight', () => {
    const scope = parseFunctionalScope({
      ...syntheticScope(),
      executionProfileSha256: 'f'.repeat(64),
    });
    expect(scope).toHaveProperty('executionProfileSha256', 'f'.repeat(64));
    expect(newFunctionalReceipt(scope, 'a'.repeat(64))).toHaveProperty(
      'executionProfileSha256',
      'f'.repeat(64),
    );
  });
  it('does not insert a key or alter legacy receipt serialization', () => {
    const scope = syntheticScope(),
      receipt = newFunctionalReceipt(scope, 'a'.repeat(64));
    expect(Object.hasOwn(scope, 'executionProfileSha256')).toBe(false);
    expect(Object.hasOwn(receipt, 'executionProfileSha256')).toBe(false);
    const bytes = JSON.stringify(receipt);
    expect(
      JSON.stringify(functionalReceiptSchema.parse(JSON.parse(bytes))),
    ).toBe(bytes);
  });
});

describe('Linux functional admission stays closed without Root authority', () => {
  it('requires independently pinned profile, same DB and matching runtime attestation before marker fetch', async () => {
    const old = syntheticScope(),
      p = profileFixture(old.databaseIdentitySha256);
    const attestation = JSON.stringify({
      ...syntheticAttestation,
      executionProfileSha256: p.authority.sha256,
    });
    const scope = {
      ...old,
      executionProfileSha256: p.authority.sha256,
      runtimeAttestationSha256: sha256(attestation),
    };
    const ports = {
      ...preflightPorts(),
      attestation: () => Promise.resolve(attestation),
      executionProfileAuthority: p.authority,
    };
    const ready = await preflightFunctional(
      scope,
      syntheticSecrets,
      new AbortController().signal,
      ports,
    );
    expect(() => {
      requireFunctionalReady(ready);
    }).not.toThrow();
    expect(Object.isFrozen(ready)).toBe(true);
    const { executionProfileAuthority, ...missing } = ports;
    expect(executionProfileAuthority).toBe(p.authority);
    await expect(
      preflightFunctional(
        scope,
        syntheticSecrets,
        new AbortController().signal,
        missing,
      ),
    ).rejects.toThrow('FUNCTIONAL_PREFLIGHT_FAILED');
    await expect(
      preflightFunctional(
        scope,
        syntheticSecrets,
        new AbortController().signal,
        {
          ...ports,
          executionProfileAuthority: profileFixture('0'.repeat(64)).authority,
        },
      ),
    ).rejects.toThrow('FUNCTIONAL_PREFLIGHT_FAILED');
    await expect(
      preflightFunctional(
        scope,
        syntheticSecrets,
        new AbortController().signal,
        { ...ports, attestation: preflightPorts().attestation },
      ),
    ).rejects.toThrow('FUNCTIONAL_PREFLIGHT_FAILED');
  });
});
