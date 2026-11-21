import { afterEach, expect, it, vi } from 'vitest';
import { basename, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import * as configModule from '../../scripts/concurrency/capacity-config';
import { loadExecutionProfileRuntime } from '../../scripts/concurrency/execution-profile-runtime';
import {
  loadCapacityRuntime,
  type CapacityRuntimeIo,
} from '../../scripts/concurrency/capacity-runtime';
import {
  rootBytesSha256,
  linuxScopeHelperNames,
  rootHelperDiagnosticsSchema,
} from '../../scripts/concurrency/root-helper-contracts';
import { parseCapacityScope } from '../../scripts/concurrency/capacity-scope';
import {
  createCapacityManifest,
  capacityManifestHash,
} from '../../scripts/concurrency/capacity-manifest';
import { createCapacityPrivatePlan } from '../../scripts/concurrency/capacity-private-plan';
import { syntheticLinuxRuntime } from './helpers/whole-site-linux-runtime';
import { capacityFixture } from './helpers/whole-site-capacity';
import { syntheticSecrets } from './helpers/whole-site-functional';
const flush = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};
afterEach(() => vi.restoreAllMocks());
const profileFixture = async (databaseIdentity = 'd'.repeat(64)) => {
  const f = syntheticLinuxRuntime(databaseIdentity);
  const read = vi.fn((path: string) => Promise.resolve(f.files[path] ?? ''));
  const execute = vi.fn((_helper: string, args: readonly string[]) =>
    Promise.resolve({
      sourceRevision: args[0],
      challenge: args[2],
      observed: {
        host: f.profile.host,
        identity: f.profile.identity,
        backend: f.profile.backend,
      },
    }),
  );
  const abort = new AbortController();
  const runtime = await loadExecutionProfileRuntime(
    {
      sourceRevision: 'a'.repeat(40),
      profileSha256: f.profileSha,
      descriptor: { helperClosureSha256: rootBytesSha256(f.closure) },
      databaseIdentitySha256: databaseIdentity,
      helperHashes: f.hashes,
    },
    { platform: 'linux', read, execute },
    abort.signal,
  );
  if (!runtime) throw Error('SYNTHETIC_LINUX_REQUIRED');
  read.mockClear();
  return { ...f, runtime, read, execute, abort };
};
it.each([
  'profile-error',
  'closure-error',
  'both-errors',
  'profile-hash',
  'closure-hash',
  'sync-profile',
] as const)(
  'actual verify drains both metadata before preserving priority for %s',
  async (kind) => {
    const f = await profileFixture(),
      profile = Promise.withResolvers<string>(),
      closure = Promise.withResolvers<string>();
    const first = Error('SYNTHETIC_PROFILE'),
      second = Error('SYNTHETIC_CLOSURE');
    const events: string[] = [];
    f.read.mockImplementation((path) => {
      if (basename(path) === 'execution-profile.json') {
        if (kind === 'sync-profile') throw first;
        return profile.promise;
      }
      if (basename(path) === 'execution-profile-helper-closure.json')
        return closure.promise;
      throw Error('HELPERS_MUST_NOT_START');
    });
    let settled = false;
    const task = f.runtime.verify((phase, state) =>
      events.push(`${phase}:${state}`),
    );
    void task.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    const expected = kind === 'closure-error' ? second : first;
    const check = kind.endsWith('hash')
      ? expect(task).rejects.toThrow('ROOT_HELPER_INVALID')
      : expect(task).rejects.toBe(expected);
    if (kind === 'closure-error' || kind === 'both-errors')
      closure.reject(second);
    else if (kind === 'closure-hash') closure.resolve('CHANGED');
    if (kind === 'profile-error' || kind === 'both-errors')
      profile.reject(first);
    else if (kind === 'profile-hash') profile.resolve('CHANGED');
    await flush();
    expect(f.read).toHaveBeenCalledTimes(2);
    if (kind !== 'both-errors') expect(settled).toBe(false);
    profile.resolve(f.profileBytes);
    closure.resolve(f.closure);
    await check;
    expect(f.read).toHaveBeenCalledTimes(2);
    expect(events).not.toContain('HELPER_BATCH:ENTERED');
    expect(f.execute).toHaveBeenCalledTimes(1);
  },
);
it('profile hash failure outranks closure read error and phase chronology stays actual', async () => {
  const f = await profileFixture(),
    profile = Promise.withResolvers<string>(),
    closure = Promise.withResolvers<string>();
  f.read.mockImplementation((path) =>
    basename(path) === 'execution-profile.json'
      ? profile.promise
      : closure.promise,
  );
  const events: string[] = [];
  const task = f.runtime.verify((p, s) => events.push(`${p}:${s}`));
  const check = expect(task).rejects.toThrow('ROOT_HELPER_INVALID');
  closure.reject(Error('SYNTHETIC_CLOSURE'));
  await flush();
  expect(events).toEqual([
    'PROFILE_META:ENTERED',
    'CLOSURE_META:ENTERED',
    'CLOSURE_META:FAILED',
  ]);
  profile.resolve('CHANGED');
  await check;
  expect(events.at(-1)).toBe('PROFILE_META:FAILED');
});
it('observer throw cannot change success, original IO error, or invent later completed phases', async () => {
  const f = await profileFixture(),
    observer = vi.fn(() => {
      throw Error('SYNTHETIC_OBSERVER');
    });
  await expect(f.runtime.verify(observer)).resolves.toHaveProperty('closure');
  expect(f.read).toHaveBeenCalledTimes(16);
  expect(observer).toHaveBeenCalledTimes(1);
  const sentinel = Error('SYNTHETIC_IO');
  f.read.mockRejectedValue(sentinel);
  await expect(f.runtime.verify(observer)).rejects.toBe(sentinel);
});
it('abort remains closed, all metadata settle, and IO failure priority stays original', async () => {
  const f = await profileFixture(),
    closure = Promise.withResolvers<string>();
  f.read.mockImplementation((path) =>
    basename(path) === 'execution-profile-helper-closure.json'
      ? closure.promise
      : Promise.resolve(f.files[path] ?? ''),
  );
  const task = f.runtime.verify();
  const check = expect(task).rejects.toThrow('ROOT_HELPER_INVALID');
  await flush();
  f.abort.abort();
  closure.resolve(f.closure);
  await check;
  expect(f.read).toHaveBeenCalledTimes(16);
  f.read.mockClear();
  await expect(f.runtime.verify()).rejects.toThrow();
  expect(f.read).not.toHaveBeenCalled();
});
it('unobserved legacy absent Linux profile stays absent and executes no IO', async () => {
  const read = vi.fn(),
    execute = vi.fn();
  await expect(
    loadExecutionProfileRuntime(
      {
        sourceRevision: 'a'.repeat(40),
        profileSha256: undefined,
        descriptor: undefined,
        databaseIdentitySha256: 'd'.repeat(64),
        helperHashes: {},
      },
      { platform: 'darwin', read, execute },
      new AbortController().signal,
    ),
  ).resolves.toBeUndefined();
  expect(read).not.toHaveBeenCalled();
  expect(execute).not.toHaveBeenCalled();
});

// Approved configuration is the external fake boundary. The actual capacity
// loader/call, profile verifier, authority checks and journal projector run.
const callerFixture = async () => {
  const base = await capacityFixture(),
    p = await profileFixture(base.input.databaseIdentitySha256);
  const receiptBytes = JSON.stringify({
    ...base.receipt,
    executionProfileSha256: p.profileSha,
  });
  const processCloseBytes = JSON.stringify({
    ...base.processClose,
    functionalResultSha256: rootBytesSha256(receiptBytes),
    executionProfileSha256: p.profileSha,
  });
  const scope = parseCapacityScope(
    {
      ...base.input,
      executionProfileSha256: p.profileSha,
      functionalResultSha256: rootBytesSha256(receiptBytes),
      functionalProcessCloseSha256: rootBytesSha256(processCloseBytes),
      helpers: Object.fromEntries(
        linuxScopeHelperNames.map((n) => [n, p.hashes[n]]),
      ),
    },
    { receiptBytes, processCloseBytes, executionProfileAuthority: p.authority },
  );
  const manifest = createCapacityManifest(scope);
  const identities = ['T1', 'T2', 'S1', 'S2', 'A1', 'R1'].map(
    (alias, index) => ({
      alias,
      account: `wb${String(index).padStart(16, '0')}`,
      email: `synthetic${String(index)}@colorplay.test`,
      password: 'AaSynthetic',
      displayName: alias,
      userId: randomUUID(),
      role:
        alias === 'A1'
          ? 'admin'
          : alias.startsWith('T')
            ? 'teacher'
            : 'student',
    }),
  );
  const privatePlan = createCapacityPrivatePlan(scope, manifest, identities),
    root = configModule.CAPACITY_RUNTIME_ROOT;
  const journalRoot = join(root, 'capacity-journals', scope.planId),
    functional = join(root, 'functional-private', scope.functionalRunId);
  const helpers = Object.fromEntries(
    configModule.capacityRootHelperNames.map((n) => [n, p.hashes[n]]),
  );
  const bundleBytes = JSON.stringify({
    sourceRevision: scope.sourceRevision,
    artifactSha256: scope.artifactSha256,
    entryClosureSha256: 'a'.repeat(64),
    entryClosureGzipBytes: 300000,
    recursiveColdImports: true,
    deduplicatedChunks: true,
  });
  const secretBytes = JSON.stringify({
    ANON_KEY: syntheticSecrets.anonKey,
    SERVICE_ROLE_KEY: syntheticSecrets.serviceKey,
  });
  const bindings = {
    manifestSha256: capacityManifestHash(manifest),
    manifestFileSha256: rootBytesSha256(JSON.stringify(manifest)),
    privatePlanSha256: rootBytesSha256(JSON.stringify(privatePlan)),
    bundleProofSha256: rootBytesSha256(bundleBytes),
  };
  const approval = JSON.stringify({
    schemaVersion: 1,
    confirmation: 'LOCAL_CAPACITY_READ_ONLY_ORACLES',
    projectId: scope.projectId,
    planId: scope.planId,
    sourceRevision: scope.sourceRevision,
    scope,
    journalDir: journalRoot,
    functionalJournalDir: functional,
    helpers,
    ...bindings,
    registrationActors: privatePlan.actors.slice(6).map((a, index) => ({
      actorIndex: index < 40 ? index : index - 40,
      alias: a.alias,
      email: a.email,
      account: a.account,
      cohortSize: index < 40 ? 40 : 60,
    })),
  });
  const leg = manifest.legs[0];
  if (!leg) throw Error('SYNTHETIC_LEG_REQUIRED');
  const request = configModule.capacityRequestSchema.parse({
    schemaVersion: 1,
    confirmation: 'LOCAL_WHOLE_SITE_CAPACITY_ONE_LEG',
    scope,
    profileRuntime: { helperClosureSha256: rootBytesSha256(p.closure) },
    legId: leg.legId,
    runId: 'wcr-abcdef-123456',
    ...bindings,
    oracleApprovalSha256: rootBytesSha256(approval),
    secretsSha256: rootBytesSha256(secretBytes),
    helpers,
    rootCapacityPublisherSha256: 'a'.repeat(64),
    rootCapacityValidatorSha256: 'b'.repeat(64),
    retention: {
      sequence: 0,
      previousProofSha256: null,
      completedRegistrationCohorts: [],
    },
    predecessors: [],
    registrationReady: [],
  });
  const configuration: configModule.CapacityConfiguration = {
    request,
    profileRuntime: p.runtime,
    requestSha256: rootBytesSha256(JSON.stringify(request)),
    scope,
    manifest,
    privatePlan,
    leg,
    journalRoot,
    predecessors: [],
    registrationReady: [],
    predecessorSha256: null,
  };
  vi.spyOn(configModule, 'loadCapacityConfiguration').mockResolvedValue(
    configuration,
  );
  const files = {
    ...p.files,
    [join(root, 'status-secret.json')]: secretBytes,
    [join(root, 'entry-bundle-proof.json')]: bundleBytes,
    [join(root, `capacity-oracle-approval-${scope.planId}.json`)]: approval,
  };
  for (const identity of identities) {
    const name =
      identity.alias === 'R1'
        ? 'r1-active-password-confirmed'
        : `create-${identity.alias.toLowerCase()}-confirmed`;
    files[join(functional, `${name}.json`)] = JSON.stringify({
      identity: { ...identity, label: identity.alias },
    });
  }
  const execute = vi.fn<CapacityRuntimeIo['execute']>(() =>
    Promise.resolve({
      synthetic: true,
    }),
  );
  const runtime = await loadCapacityRuntime(
    '/synthetic-approved-config',
    new AbortController().signal,
    {
      platform: 'linux',
      read: (path) => Promise.resolve(files[path] ?? ''),
      directory: () => Promise.resolve(),
      git: () =>
        Promise.resolve({ repoSha: scope.sourceRevision, dirty: false }),
      execute,
    },
  );
  return { p, runtime, execute };
};
it('actual capacity call records both pre/post Node phases without fake native witness', async () => {
  const f = await callerFixture();
  await expect(
    f.runtime.host({}, new AbortController().signal),
  ).resolves.toEqual({ synthetic: true });
  const snapshot = f.runtime.rootDiagnostics();
  expect(rootHelperDiagnosticsSchema.safeParse(snapshot).success).toBe(true);
  const call = snapshot.calls[0];
  expect(call?.executorWitness).toBe('UNOBSERVED');
  const phases = call?.events
    .filter((e) => e.domain === 'PHASE')
    .map((e) => `${e.event}:${e.state}`);
  for (const phase of ['PROFILE_META', 'CLOSURE_META', 'HELPER_BATCH']) {
    expect(phases?.filter((e) => e === `${phase}:ENTERED`)).toHaveLength(2);
    expect(phases?.filter((e) => e === `${phase}:COMPLETED`)).toHaveLength(2);
  }
  expect(call?.firstFailure).toBeNull();
  expect(f.execute).toHaveBeenCalledTimes(1);
});
it('actual capacity caller cannot return helper success through a changed postverify proof', async () => {
  const f = await callerFixture();
  f.execute.mockImplementationOnce(() => {
    f.p.files[join(configModule.CAPACITY_RUNTIME_ROOT, 'linux_proc.py')] =
      'CHANGED';
    return Promise.resolve({ synthetic: true });
  });
  await expect(
    f.runtime.host({}, new AbortController().signal),
  ).rejects.toThrow('ROOT_HELPER_INVALID');
  const call = f.runtime.rootDiagnostics().calls[0];
  expect(call?.executorWitness).toBe('UNOBSERVED');
  expect(call?.firstFailure).toMatchObject({
    domain: 'PHASE',
    event: 'HELPER_BATCH',
    state: 'FAILED',
  });
  expect(f.runtime.rootAccounting()).toHaveLength(0);
});

it('actual capacity caller stays pending until the final postverify read settles', async () => {
  const f = await callerFixture(),
    gate = Promise.withResolvers<string>();
  const path = join(
    configModule.CAPACITY_RUNTIME_ROOT,
    'linux_runtime_common.py',
  );
  f.execute.mockImplementationOnce(() => {
    f.p.read.mockImplementation((p) =>
      p === path ? gate.promise : Promise.resolve(f.p.files[p] ?? ''),
    );
    return Promise.resolve({ synthetic: true });
  });
  let settled = false;
  const task = f.runtime.host({}, new AbortController().signal);
  void task.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  await vi.waitFor(() => {
    expect(f.p.read).toHaveBeenCalledTimes(32);
  });
  expect(settled).toBe(false);
  expect(f.runtime.rootAccounting()).toHaveLength(0);
  gate.resolve(f.p.files[path] ?? '');
  await expect(task).resolves.toEqual({ synthetic: true });
  expect(f.runtime.rootAccounting()).toHaveLength(1);
});
it('actual capacity caller retains the original execute error after complete postverify', async () => {
  const f = await callerFixture(),
    sentinel = Error('SYNTHETIC_EXECUTE');
  f.execute.mockRejectedValueOnce(sentinel);
  await expect(f.runtime.host({}, new AbortController().signal)).rejects.toBe(
    sentinel,
  );
  expect(f.runtime.rootDiagnostics().calls[0]?.events).toContainEqual(
    expect.objectContaining({
      domain: 'PHASE',
      event: 'POST_VERIFY',
      state: 'COMPLETED',
    }),
  );
});
