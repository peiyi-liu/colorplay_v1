import { syntheticLinuxRuntime } from './helpers/whole-site-linux-runtime';
import {
  linuxScopeHelperNames,
  type RootExecutable,
} from '../../scripts/concurrency/root-helper-contracts';
import type { CapacityRuntimeIo } from '../../scripts/concurrency/capacity-runtime';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { capacityFixture } from './helpers/whole-site-capacity';
import { syntheticSecrets } from './helpers/whole-site-functional';
import { parseCapacityScope } from '../../scripts/concurrency/capacity-scope';
import {
  createCapacityManifest,
  capacityManifestHash,
} from '../../scripts/concurrency/capacity-manifest';
import { createCapacityPrivatePlan } from '../../scripts/concurrency/capacity-private-plan';
import { sha256 } from '../../scripts/concurrency/local-runtime';
import {
  CAPACITY_RUNTIME_ROOT,
  capacityRootHelperNames,
} from '../../scripts/concurrency/capacity-config';
import { loadCapacityRuntime } from '../../scripts/concurrency/capacity-runtime';
const required = <T>(value: T | null | undefined): T => {
  if (value === null || value === undefined)
    throw new Error('SYNTHETIC_FIXTURE_MISSING');
  return value;
};

const fixture = async (linux = false) => {
  const f = await capacityFixture();
  f.input.helpers['host-sample.py'] = sha256('host-sample.py');
  f.input.helpers['vm-sample.py'] = sha256('vm-sample.py');
  const profile = linux
    ? syntheticLinuxRuntime(f.input.databaseIdentitySha256)
    : undefined;
  const receiptBytes = JSON.stringify({
    ...f.receipt,
    ...(profile ? { executionProfileSha256: profile.profileSha } : {}),
  });
  const processCloseBytes = JSON.stringify({
    ...f.processClose,
    functionalResultSha256: sha256(receiptBytes),
    ...(profile ? { executionProfileSha256: profile.profileSha } : {}),
  });
  const scope = parseCapacityScope(
      {
        ...f.input,
        functionalResultSha256: sha256(receiptBytes),
        functionalProcessCloseSha256: sha256(processCloseBytes),
        ...(profile
          ? {
              executionProfileSha256: profile.profileSha,
              helpers: Object.fromEntries(
                linuxScopeHelperNames.map((n) => [n, profile.hashes[n]]),
              ),
            }
          : {}),
      },
      {
        receiptBytes,
        processCloseBytes,
        ...(profile ? { executionProfileAuthority: profile.authority } : {}),
      },
    ),
    manifest = createCapacityManifest(scope);
  const identities = ['T1', 'T2', 'S1', 'S2', 'A1', 'R1'].map(
    (alias, index) => ({
      alias,
      account: `wb${String(index).padStart(16, '0')}`,
      email: `synthetic${String(index)}@colorplay.test`,
      password: 'AaSynthetic',
      displayName: `驗證${alias}`,
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
    manifestBytes = JSON.stringify(manifest),
    privateBytes = JSON.stringify(privatePlan),
    journalDir = join(CAPACITY_RUNTIME_ROOT, 'capacity-journals', scope.planId),
    functionalJournalDir = join(
      CAPACITY_RUNTIME_ROOT,
      'functional-private',
      scope.functionalRunId,
    );
  const helpers = Object.fromEntries(
    capacityRootHelperNames.map((name) => [
      name,
      profile?.hashes[name] ?? sha256(name),
    ]),
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
    UNRELATED_PRIVATE: 'SECRET_MARKER',
  });
  const bindings = {
    manifestSha256: capacityManifestHash(manifest),
    manifestFileSha256: sha256(manifestBytes),
    privatePlanSha256: sha256(privateBytes),
    bundleProofSha256: sha256(bundleBytes),
  };
  const approval = {
    schemaVersion: 1,
    confirmation: 'LOCAL_CAPACITY_READ_ONLY_ORACLES',
    projectId: scope.projectId,
    planId: scope.planId,
    sourceRevision: scope.sourceRevision,
    scope,
    journalDir,
    functionalJournalDir,
    helpers,
    ...bindings,
    registrationActors: privatePlan.actors.slice(6).map((a, index) => ({
      actorIndex: index < 40 ? index : index - 40,
      alias: a.alias,
      email: a.email,
      account: a.account,
      cohortSize: index < 40 ? 40 : 60,
    })),
  };
  const approvalBytes = JSON.stringify(approval),
    request = {
      schemaVersion: 1,
      ...(profile
        ? { profileRuntime: { helperClosureSha256: sha256(profile.closure) } }
        : {}),
      confirmation: 'LOCAL_WHOLE_SITE_CAPACITY_ONE_LEG',
      scope,
      legId: required(manifest.legs[0]).legId,
      runId: 'wcr-abcdef-123456',
      ...bindings,
      oracleApprovalSha256: sha256(approvalBytes),
      secretsSha256: sha256(secretBytes),
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
    };
  const path = join(
      CAPACITY_RUNTIME_ROOT,
      `capacity-request-${request.runId}.json`,
    ),
    files = new Map<string, string>([
      [path, JSON.stringify(request)],
      [join(functionalJournalDir, 'functional-result.json'), receiptBytes],
      [
        join(functionalJournalDir, 'functional-process-close.json'),
        processCloseBytes,
      ],
      [
        join(
          CAPACITY_RUNTIME_ROOT,
          'capacity-plans',
          scope.planId,
          'manifest.json',
        ),
        manifestBytes,
      ],
      [
        join(
          CAPACITY_RUNTIME_ROOT,
          'capacity-plans',
          scope.planId,
          'private-plan.json',
        ),
        privateBytes,
      ],
      [join(CAPACITY_RUNTIME_ROOT, 'status-secret.json'), secretBytes],
      [join(CAPACITY_RUNTIME_ROOT, 'entry-bundle-proof.json'), bundleBytes],
      [
        join(
          CAPACITY_RUNTIME_ROOT,
          `capacity-oracle-approval-${scope.planId}.json`,
        ),
        approvalBytes,
      ],
    ]);
  for (const helper of [
    ...capacityRootHelperNames,
    'host-sample.py',
    'vm-sample.py',
  ])
    files.set(join(CAPACITY_RUNTIME_ROOT, helper), helper);
  if (profile)
    for (const [path, body] of Object.entries(profile.files))
      files.set(path, body);
  for (const identity of identities) {
    const name =
      identity.alias === 'R1'
        ? 'r1-active-password-confirmed'
        : `create-${identity.alias.toLowerCase()}-confirmed`;
    files.set(
      join(functionalJournalDir, `${name}.json`),
      JSON.stringify({ identity: { ...identity, label: identity.alias } }),
    );
  }
  const io = {
    platform: linux ? 'linux' : 'darwin',
    read: async (p: string) => {
      await Promise.resolve();
      const v = files.get(p);
      if (v === undefined) throw Error('MISSING');
      return v;
    },
    directory: async () => {
      await Promise.resolve();
      return undefined;
    },
    git: async () => {
      await Promise.resolve();
      return { repoSha: scope.sourceRevision, dirty: false };
    },
    execute: vi.fn<CapacityRuntimeIo['execute']>(
      async (helper: RootExecutable, args: readonly string[]) => {
        await Promise.resolve();
        if (profile && helper === 'execution-profile-preflight.py')
          return {
            sourceRevision: scope.sourceRevision,
            challenge: args[2],
            observed: {
              host: profile.profile.host,
              identity: profile.profile.identity,
              backend: profile.profile.backend,
            },
          };
        return {
          databaseIdentitySha256: scope.databaseIdentitySha256,
          readOnlyProofSha256: 'a'.repeat(64),
          sourceFrozen: true,
          artifactMatched: true,
          approvedPlanMatched: true,
        };
      },
    ),
  };
  return { scope, path, files, io, request, approval };
};
const sortedJson = (value: unknown): unknown => {
  if (Array.isArray(value))
    return value.map((item: unknown) => sortedJson(item));
  if (value !== null && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(object)
        .sort()
        .map((key) => [key, sortedJson(object[key])]),
    );
  }
  return value;
};
const replaceApproval = (
  f: Awaited<ReturnType<typeof fixture>>,
  value: unknown,
  bindHash = true,
) => {
  const bytes = JSON.stringify(sortedJson(value));
  f.files.set(
    join(
      CAPACITY_RUNTIME_ROOT,
      `capacity-oracle-approval-${f.scope.planId}.json`,
    ),
    bytes,
  );
  if (bindHash) {
    f.request.oracleApprovalSha256 = sha256(bytes);
    f.files.set(f.path, JSON.stringify(f.request));
  }
};
describe('capacity strict runtime read-only boundary', () => {
  it('loads only approved fixed files without executing a helper or creating fixtures', async () => {
    const f = await fixture(),
      runtime = await loadCapacityRuntime(
        f.path,
        new AbortController().signal,
        f.io,
      );
    expect(f.io.execute).not.toHaveBeenCalled();
    expect(JSON.stringify(runtime.scope)).not.toContain('SECRET_MARKER');
    await runtime.preflight();
    expect(f.io.execute).toHaveBeenCalledWith(
      'capacity-preflight-readback.py',
      [f.scope.sourceRevision, f.scope.planId, f.request.oracleApprovalSha256],
      expect.objectContaining({ operation: 'preflight' }),
      expect.any(AbortSignal),
    );
  });
  it.each(['helper', 'r1-password', 'bundle', 'key'])(
    'rejects changed %s before any root command',
    async (kind) => {
      const f = await fixture();
      const path =
        kind === 'helper'
          ? join(CAPACITY_RUNTIME_ROOT, 'capacity-root-readonly.py')
          : kind === 'r1-password'
            ? join(
                CAPACITY_RUNTIME_ROOT,
                'functional-private',
                f.scope.functionalRunId,
                'r1-active-password-confirmed.json',
              )
            : kind === 'bundle'
              ? join(CAPACITY_RUNTIME_ROOT, 'entry-bundle-proof.json')
              : join(CAPACITY_RUNTIME_ROOT, 'status-secret.json');
      f.files.set(
        path,
        required(f.files.get(path)).replace('AaSynthetic', 'ChangedSecret') +
          ' ',
      );
      await expect(
        loadCapacityRuntime(f.path, new AbortController().signal, f.io),
      ).rejects.toThrow('CAPACITY_EVIDENCE_INVALID');
      expect(f.io.execute).not.toHaveBeenCalled();
    },
  );
});

describe('approval semantic identity remains strict under Python sort_keys', () => {
  it('accepts an entire recursively sorted approval with its actual byte hash bound', async () => {
    const f = await fixture();
    replaceApproval(f, f.approval);
    const runtime = await loadCapacityRuntime(
      f.path,
      new AbortController().signal,
      f.io,
    );
    expect(runtime.scope).toEqual(f.scope);
    expect(f.io.execute).not.toHaveBeenCalled();
  });
  it.each([
    'scope-value',
    'scope-extra',
    'scope-missing',
    'helper-value',
    'helper-extra',
    'helper-missing',
    'wrong-hash',
  ])('rejects sorted approval %s before any helper', async (kind) => {
    const f = await fixture(),
      changed = structuredClone(f.approval);
    if (kind === 'scope-value') changed.scope.artifactSha256 = 'd'.repeat(64);
    if (kind === 'scope-extra')
      Object.assign(changed.scope, { unexpected: 'SYNTHETIC_SECRET' });
    if (kind === 'scope-missing')
      Reflect.deleteProperty(changed.scope, 'helpers');
    if (kind === 'helper-value')
      changed.helpers['capacity-root-readonly.py'] = 'd'.repeat(64);
    if (kind === 'helper-extra')
      Object.assign(changed.helpers, { 'unexpected.py': 'd'.repeat(64) });
    if (kind === 'helper-missing')
      Reflect.deleteProperty(changed.helpers, 'capacity-root-readonly.py');
    replaceApproval(f, changed, kind !== 'wrong-hash');
    await expect(
      loadCapacityRuntime(f.path, new AbortController().signal, f.io),
    ).rejects.toThrow('CAPACITY_EVIDENCE_INVALID');
    expect(f.io.execute).not.toHaveBeenCalled();
  });
});

import { admitCapacityRun } from '../../scripts/concurrency/capacity-runtime';
import type { CapacityRuntime } from '../../scripts/concurrency/capacity-runtime';
it('write-once admission refuses a second CLI run before any provision or root request', async () => {
  const files = new Map<string, unknown>();
  const runtime = {
    request: { runId: 'wcr-abcdef-123456' },
    requestSha256: 'a'.repeat(64),
    leg: { legId: 'anonymous_entry_prepare-native_browser-3' },
    journal: {
      directory: 'synthetic',
      write: (name: string, value: unknown) => {
        if (files.has(name))
          return Promise.reject(new Error('ALREADY_ADMITTED'));
        files.set(name, value);
        return Promise.resolve();
      },
    },
  } as unknown as CapacityRuntime;
  await admitCapacityRun(runtime, new AbortController().signal);
  const original = JSON.stringify(files.get('capacity-run-admitted'));
  await expect(
    admitCapacityRun(runtime, new AbortController().signal),
  ).rejects.toThrow('ALREADY_ADMITTED');
  expect(JSON.stringify(files.get('capacity-run-admitted'))).toBe(original);
  expect(files.size).toBe(1);
});

describe('independently approved Linux capacity runtime', () => {
  it('passes real closure/preflight authority to host and backend without a VM alias', async () => {
    const f = await fixture(true),
      approval = sha256(required(f.files.get(f.path)));
    const runtime = await loadCapacityRuntime(
      f.path,
      new AbortController().signal,
      f.io,
      approval,
    );
    expect(f.io.execute.mock.calls.map((c) => c[0])).toEqual([
      'execution-profile-preflight.py',
    ]);
    await runtime.host(
      { mode: 'NODE_PROTOCOL', nodePid: 123 },
      new AbortController().signal,
    );
    await runtime.backend(new AbortController().signal);
    expect(f.io.execute.mock.calls.map((c) => c[0])).toEqual([
      'execution-profile-preflight.py',
      'linux-host-sample.py',
      'backend-cgroup-sample.py',
    ]);
    await expect(runtime.vm(new AbortController().signal)).rejects.toThrow();
    expect(f.io.execute).toHaveBeenCalledTimes(3);
  });
  it.each([undefined, '0'.repeat(64)])(
    'rejects absent or wrong independent approval before any helper',
    async (approval) => {
      const f = await fixture(true);
      await expect(
        loadCapacityRuntime(
          f.path,
          new AbortController().signal,
          f.io,
          approval,
        ),
      ).rejects.toThrow('CAPACITY_EVIDENCE_INVALID');
      expect(f.io.execute).not.toHaveBeenCalled();
    },
  );
});

it('records only safe same-clock call boundaries after execution and both verifications settle', async () => {
  const f = await fixture(true);
  const runtime = await loadCapacityRuntime(
    f.path,
    new AbortController().signal,
    f.io,
    sha256(required(f.files.get(f.path))),
  );
  let clock = 100;
  const now = vi.spyOn(performance, 'now').mockImplementation(() => clock);
  const originalRead = f.io.read;
  f.io.read = async (path) => {
    clock += 2;
    return originalRead(path);
  };
  const entered = Promise.withResolvers<undefined>();
  const executed = Promise.withResolvers<unknown>();
  f.io.execute.mockImplementationOnce(() => {
    entered.resolve(undefined);
    return executed.promise;
  });
  try {
    const task = runtime.host(
      { private: 'SYNTHETIC_SECRET' },
      new AbortController().signal,
    );
    await entered.promise;
    expect(runtime.rootAccounting()).toEqual([]);
    clock = 300;
    executed.resolve({ synthetic: true });
    await expect(task).resolves.toEqual({ synthetic: true });
    expect(runtime.rootAccounting()).toEqual([
      {
        helper: 'linux-host-sample.py',
        outcome: 'ok',
        elapsedMs: 200,
        callStartedAtNodeMs: 100,
        executeStartedAtNodeMs: 130,
        executeClosedAtNodeMs: 300,
        callCompletedAtNodeMs: 330,
      },
    ]);
    f.io.execute.mockRejectedValueOnce(new Error('SYNTHETIC_ORIGINAL_ERROR'));
    await expect(runtime.backend(new AbortController().signal)).rejects.toThrow(
      'SYNTHETIC_ORIGINAL_ERROR',
    );
    expect(runtime.rootAccounting()[1]).toMatchObject({
      outcome: 'unknown',
      elapsedMs: 30,
    });
    expect(f.io.execute).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(runtime.rootAccounting())).not.toContain('SYNTHETIC');
  } finally {
    now.mockRestore();
  }
});

it.each(['before', 'after'])(
  'keeps %s-verification failure outside the historical accounting rows',
  async (phase) => {
    const f = await fixture(true);
    const runtime = await loadCapacityRuntime(
      f.path,
      new AbortController().signal,
      f.io,
      sha256(required(f.files.get(f.path))),
    );
    const path = join(CAPACITY_RUNTIME_ROOT, 'linux_runtime_common.py');
    if (phase === 'before') f.files.set(path, 'SYNTHETIC_CHANGED');
    else
      f.io.execute.mockImplementationOnce(() => {
        f.files.set(path, 'SYNTHETIC_CHANGED');
        return Promise.resolve({ synthetic: true });
      });
    await expect(
      runtime.host({}, new AbortController().signal),
    ).rejects.toThrow();
    expect(runtime.rootAccounting()).toEqual([]);
    expect(f.io.execute).toHaveBeenCalledTimes(phase === 'before' ? 1 : 2);
  },
);
