import { join } from 'node:path';
import { validateExecutionProfile } from '../../../scripts/concurrency/execution-profile';
import {
  ROOT_RUNTIME_DIRECTORY,
  linuxClosureNames,
  rootBytesSha256,
} from '../../../scripts/concurrency/root-helper-contracts';
export const syntheticLinuxRuntime = (
  databaseIdentitySha256 = 'd'.repeat(64),
) => {
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
      databaseIdentitySha256: databaseIdentitySha256,
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
  const profileBytes = JSON.stringify(profile),
    profileSha = rootBytesSha256(profileBytes);
  const files: Record<string, string> = Object.fromEntries(
    linuxClosureNames.map((n) => [
      join(ROOT_RUNTIME_DIRECTORY, n),
      '# synthetic ' + n,
    ]),
  );
  const hashes: Record<string, string> = Object.fromEntries(
    linuxClosureNames.map((n) => [
      n,
      rootBytesSha256(files[join(ROOT_RUNTIME_DIRECTORY, n)] ?? ''),
    ]),
  );
  const closure = JSON.stringify({
    schemaVersion: 1,
    sourceRevision: 'a'.repeat(40),
    executionProfileSha256: profileSha,
    files: hashes,
  });
  const authority = validateExecutionProfile(profileBytes, {
    expectedSha256: profileSha,
    observed: {
      host: profile.host,
      identity: profile.identity,
      backend: profile.backend,
    },
  });
  files[join(ROOT_RUNTIME_DIRECTORY, 'execution-profile.json')] = profileBytes;
  files[join(ROOT_RUNTIME_DIRECTORY, 'execution-profile-helper-closure.json')] =
    closure;
  return {
    profile,
    profileBytes,
    profileSha,
    files,
    hashes,
    closure,
    authority,
  };
};
