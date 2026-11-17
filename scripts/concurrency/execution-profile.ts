import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
export const executionProfileDigest = z.string().regex(/^[a-f0-9]{64}$/u);
const bytes = z.number().int().nonnegative(),
  positive = bytes.positive();
export const linuxEngineeringGuards = Object.freeze({
  nodeRssLimitBytes: 2 * 1024 ** 3,
  browserPssLimitBytes: 6 * 1024 ** 3,
  sustainedMs: 10000,
  eventLoopP95LimitMs: 200,
  swapIncreaseLimitBytes: 512 * 1024 ** 2,
  hostSampleMaxAgeMs: 3000,
  backendSampleMaxAgeMs: 7000,
  barrierSkewMaxMs: 250,
  memoryPsiSomeAvg10LimitPercent: 10,
  memoryPsiFullAvg10LimitPercent: 1,
} as const);
export const linuxEngineeringGuardsSchema = z.strictObject({
  nodeRssLimitBytes: z.literal(linuxEngineeringGuards.nodeRssLimitBytes),
  browserPssLimitBytes: z.literal(linuxEngineeringGuards.browserPssLimitBytes),
  sustainedMs: z.literal(10000),
  eventLoopP95LimitMs: z.literal(200),
  swapIncreaseLimitBytes: z.literal(
    linuxEngineeringGuards.swapIncreaseLimitBytes,
  ),
  hostSampleMaxAgeMs: z.literal(3000),
  backendSampleMaxAgeMs: z.literal(7000),
  barrierSkewMaxMs: z.literal(250),
  memoryPsiSomeAvg10LimitPercent: z.literal(10),
  memoryPsiFullAvg10LimitPercent: z.literal(1),
});
const hostFields = {
  platform: z.literal('linux'),
  distribution: z.literal('ubuntu-24.04'),
  cpuQuotaUs: positive.nullable(),
  cpuPeriodUs: positive.nullable(),
  cgroupIdentitySha256: executionProfileDigest,
  limitChainSha256: executionProfileDigest,
  clockTicksPerSecond: positive,
  dedicatedGenerator: z.literal(false),
};
const freeHost = z.strictObject({
  ...hostFields,
  logicalCpu: z.literal(4),
  nominalMemoryBytes: z.literal(16 * 1024 ** 3),
  memTotalBytes: positive.max(16 * 1024 ** 3),
  affinityCpus: z.array(bytes).length(4),
});
const paidHost = z.strictObject({
  ...hostFields,
  logicalCpu: z.literal(16),
  nominalMemoryBytes: z.literal(32 * 1024 ** 3),
  memTotalBytes: positive.min(28 * 1024 ** 3).max(32 * 1024 ** 3),
  affinityCpus: z.array(bytes).length(16),
});
const paid12Host = paidHost.extend({
  logicalCpu: z.literal(12),
  affinityCpus: z.array(bytes).length(12),
});
const host = z.union([freeHost, paidHost, paid12Host]);
const identity = z.strictObject({
  jobSha256: executionProfileDigest,
  instanceSha256: executionProfileDigest,
  bootIdSha256: executionProfileDigest,
  databaseIdentitySha256: executionProfileDigest,
  ownerUid: bytes,
});
const backend = z.strictObject({
  source: z.literal('SAME_HOST_CGROUP_V2'),
  cgroupIdentitySha256: executionProfileDigest,
  cpuQuotaUs: positive,
  cpuPeriodUs: positive,
  memoryMaxBytes: z.literal(6 * 1024 ** 3),
  services: z.literal(8),
});
export const linuxExecutionProfileObservedSchema = z.strictObject({
  host,
  identity,
  backend,
});
export const linuxExecutionProfileSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    schemaVersion: z.literal(1),
    kind: z.literal('LINUX_FREE_4CPU_16G_V1'),
    host: freeHost,
    identity,
    backend,
  }),
  z.strictObject({
    schemaVersion: z.literal(1),
    kind: z.literal('LINUX_VM_16CPU_32G_V1'),
    host: paidHost,
    identity,
    backend,
  }),
  z.strictObject({
    schemaVersion: z.literal(1),
    kind: z.literal('LINUX_VM_12CPU_32G_V1'),
    host: paid12Host,
    identity,
    backend,
  }),
]);
type Profile = z.infer<typeof linuxExecutionProfileSchema>;
type ReadonlyDeep<T> = T extends object
  ? { readonly [K in keyof T]: ReadonlyDeep<T[K]> }
  : T;
export interface ExecutionProfileAuthority {
  readonly sha256: string;
  readonly profile: ReadonlyDeep<Profile>;
}
const approved = new WeakSet<ExecutionProfileAuthority>();
const reject = (): never => {
  throw new Error('EXECUTION_PROFILE_INVALID');
};
const freeze = (value: unknown): void => {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
};
/** Root must independently approve the bytes and verify actual kernel/job/DB
 * facts. This parser checks that attestation, not GitHub or /proc itself.
 */
export const validateExecutionProfile = (
  profileBytes: string,
  trusted: unknown,
): ExecutionProfileAuthority => {
  try {
    if (Buffer.byteLength(profileBytes) > 32768) reject();
    const root = z
      .strictObject({
        expectedSha256: executionProfileDigest,
        observed: z.strictObject({ host, identity, backend }),
      })
      .parse(trusted);
    const sha256 = createHash('sha256').update(profileBytes).digest('hex');
    if (sha256 !== root.expectedSha256) reject();
    const profile = linuxExecutionProfileSchema.parse(JSON.parse(profileBytes));
    if (
      !isDeepStrictEqual(root.observed, {
        host: profile.host,
        identity: profile.identity,
        backend: profile.backend,
      }) ||
      new Set(profile.host.affinityCpus).size !== profile.host.logicalCpu ||
      (profile.host.cpuQuotaUs === null
        ? profile.host.cpuPeriodUs !== null
        : profile.host.cpuPeriodUs === null ||
          profile.host.cpuQuotaUs / profile.host.cpuPeriodUs !==
            profile.host.logicalCpu) ||
      profile.backend.cpuQuotaUs / profile.backend.cpuPeriodUs !== 4
    )
      reject();
    const authority = { sha256, profile };
    freeze(authority);
    approved.add(authority);
    return authority;
  } catch {
    return reject();
  }
};
export const requireExecutionProfile = (
  sha256: string | undefined,
  authority?: ExecutionProfileAuthority,
  databaseIdentitySha256?: string,
): ExecutionProfileAuthority | undefined => {
  if (sha256 === undefined) {
    if (authority !== undefined) reject();
    return undefined;
  }
  if (
    !authority ||
    !approved.has(authority) ||
    authority.sha256 !== sha256 ||
    (databaseIdentitySha256 !== undefined &&
      authority.profile.identity.databaseIdentitySha256 !==
        databaseIdentitySha256)
  )
    reject();
  return authority;
};
export const executionProfileField = (scope: {
  executionProfileSha256?: string | undefined;
}) =>
  scope.executionProfileSha256 === undefined
    ? {}
    : { executionProfileSha256: scope.executionProfileSha256 };
