import fs from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createHostedLocalPredecessor,
  type HostedLocalPredecessorRootInput,
} from '../../scripts/concurrency/hosted-local-predecessor';
import {
  capacityFixture,
  completeCapacityReceipt,
} from './helpers/whole-site-capacity';
import { functionalRequestSchema } from '../../scripts/concurrency/functional-runtime';
import { parseFunctionalScope } from '../../scripts/concurrency/config';
import { syntheticScope } from './helpers/whole-site-functional';
import { syntheticLinuxRuntime } from './helpers/whole-site-linux-runtime';
import { parseCapacityScope } from '../../scripts/concurrency/capacity-scope';
import {
  createCapacityManifest,
  capacityManifestHash,
} from '../../scripts/concurrency/capacity-manifest';
import { finalizeCapacityReceipt } from '../../scripts/concurrency/capacity-receipt';
import { createCapacityCandidate } from '../../scripts/concurrency/capacity-publication';
import { linuxCapacityHealthSchema } from '../../scripts/concurrency/capacity-linux-health';
import { functionalCandidateSchema } from '../../scripts/concurrency/functional-receipt';
import { sha256 } from '../../scripts/concurrency/local-runtime';
import { linuxScopeHelperNames } from '../../scripts/concurrency/root-helper-contracts';
import { linuxExecutionProfileObservedSchema } from '../../scripts/concurrency/execution-profile';
let directory = '';
beforeEach(async () => {
  const root = join(process.cwd(), '.git/m65-local-predecessor/fixtures');
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  directory = await fs.realpath(await fs.mkdtemp(join(root, 'case-')));
});
afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(directory, { recursive: true, force: true });
});
const fixture = async () => {
  const f = await capacityFixture(),
    p = syntheticLinuxRuntime(f.input.databaseIdentitySha256);
  const receipt = { ...f.receipt, executionProfileSha256: p.profileSha };
  const { result: ignored, ...pending } = receipt;
  void ignored;
  const candidate = functionalCandidateSchema.parse({
    schemaVersion: 1,
    result: 'PENDING_EXTERNAL_ATTESTATION',
    receipt: pending,
  });
  const request = {
    schemaVersion: 1,
    scope: {
      ...syntheticScope(),
      executionProfileSha256: p.profileSha,
    },
    artifactSha256: receipt.artifactSha256,
    secretsSha256: '1'.repeat(64),
    profileRuntime: { helperClosureSha256: sha256(p.closure) },
    helpers: Object.fromEntries(
      [
        'functional-preflight.py',
        'canonical-baseline.py',
        'media-readback.py',
      ].map((name) => [name, p.hashes[name]]),
    ),
  };
  functionalRequestSchema.parse(request);
  parseFunctionalScope(request.scope);
  const encoded = (value: unknown) => JSON.stringify(value);
  const write = async (name: string, value: unknown) => {
    const path = join(directory, name);
    await fs.mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const bytes = encoded(value);
    await fs.writeFile(path, bytes, { mode: 0o600 });
    return sha256(bytes);
  };
  const resultSha256 = await write(
    'functional/functional-result.json',
    receipt,
  );
  const requestSha256 = await write(
    'functional/functional-request.json',
    request,
  );
  const candidateSha256 = await write(
    'functional/functional-result-candidate.json',
    candidate,
  );
  const close = {
    ...f.processClose,
    executionProfileSha256: p.profileSha,
    functionalResultSha256: resultSha256,
    requestSha256,
    candidateSha256,
  };
  const closeSha256 = await write(
    'functional/functional-process-close.json',
    close,
  );
  const stages = [];
  for (const row of receipt.stages)
    stages.push({
      stage: row.stage,
      sha256: await write(
        `functional/stage-${row.stage.replaceAll('_', '-')}-confirmed.json`,
        { stage: row.stage, elapsedMs: row.elapsedMs, proof: row.proof },
      ),
    });
  const input = {
    ...f.input,
    executionProfileSha256: p.profileSha,
    functionalResultSha256: resultSha256,
    functionalProcessCloseSha256: closeSha256,
    functionalRequestSha256: requestSha256,
    helpers: Object.fromEntries(
      linuxScopeHelperNames.map((name) => [name, p.hashes[name]]),
    ),
  };
  const scope = parseCapacityScope(input, {
    receiptBytes: encoded(receipt),
    processCloseBytes: encoded(close),
    executionProfileAuthority: p.authority,
  });
  const plan = createCapacityManifest(scope),
    manifestSha256 = await write('capacity/manifest.json', plan);
  const references = new Map<
    string,
    {
      legId: string;
      resultSha256: string;
      processCloseSha256: string;
      requestSha256: string;
    }
  >();
  const legs = [];
  for (const [ordinal, leg] of plan.legs.entries()) {
    const predecessor = leg.predecessorLegId
      ? references.get(leg.predecessorLegId)
      : undefined;
    const base = completeCapacityReceipt(
      scope,
      plan,
      leg.legId,
      predecessor?.resultSha256 ?? null,
    );
    const { health: old, ...rest } = base;
    void old;
    const browser = leg.mode !== 'NODE_PROTOCOL';
    const health = linuxCapacityHealthSchema.parse({
      kind: 'LINUX_CAPACITY_HEALTH_V1',
      executionProfileSha256: p.profileSha,
      mode: leg.mode,
      validity: 'VALID',
      reasons: [],
      hostSamples: 2,
      backendSamples: 2,
      nodeRssMaxBytes: 1000,
      browserTreeRssMaxBytes: browser ? 1000 : null,
      browserTreePssMaxBytes: browser ? 1000 : null,
      lastHostAgeMs: 1,
      lastBackendAgeMs: 1,
      eventLoopP95MaxMs: 1,
      hostSwapIncreaseMaxBytes: 0,
      memoryPsiSomeAvg10MaxPercent: 0,
      memoryPsiFullAvg10MaxPercent: 0,
      hostOomKillDeltaMax: 0,
      backendOomDeltaMax: 0,
      durationsMs: { browser_pss: 0, host_psi: 0, event_loop: 0, host_swap: 0 },
      nodeCpuLifetimePercentOfHost: 1,
      browserCpuLifetimePercentOfHost: browser ? 1 : null,
      backendCgroupIdentitySha256: p.profile.backend.cgroupIdentitySha256,
      backendMemoryMaxBytes: 6 * 1024 ** 3,
      backendMemoryCurrentBytes: 1000,
      backendSwapCurrentBytes: 0,
      backendCpuQuotaCores: 4,
      backendCpuIntervalPercent: 1,
    });
    const result = finalizeCapacityReceipt(
      {
        ...rest,
        runId: `wcr-abcdef-${String(ordinal).padStart(6, '0')}`,
        health,
      },
      plan,
      scope,
    );
    expect(result.result).toBe('PASS');
    const chain = [];
    let cursor = leg.predecessorLegId;
    while (cursor) {
      const ref = references.get(cursor);
      if (!ref) throw Error('SYNTHETIC_CHAIN');
      chain.unshift(ref);
      cursor =
        plan.legs.find((l) => l.legId === cursor)?.predecessorLegId ?? null;
    }
    const registrationReady =
      ordinal >= 5
        ? [
            references.get(plan.legs[3]?.legId ?? ''),
            references.get(plan.legs[4]?.legId ?? ''),
          ]
        : [];
    const request = {
      schemaVersion: 1,
      confirmation: 'LOCAL_WHOLE_SITE_CAPACITY_ONE_LEG',
      scope,
      profileRuntime: { helperClosureSha256: sha256(p.closure) },
      legId: leg.legId,
      runId: result.runId,
      manifestSha256: capacityManifestHash(plan),
      manifestFileSha256: manifestSha256,
      privatePlanSha256: '1'.repeat(64),
      oracleApprovalSha256: '2'.repeat(64),
      secretsSha256: '3'.repeat(64),
      bundleProofSha256: '4'.repeat(64),
      helpers: Object.fromEntries(
        [
          'capacity-root-readonly.py',
          'capacity-registration-readback.py',
          'capacity-retention-readback.py',
          'capacity-preflight-readback.py',
        ].map((name) => [name, '5'.repeat(64)]),
      ),
      rootCapacityPublisherSha256: '6'.repeat(64),
      rootCapacityValidatorSha256: '7'.repeat(64),
      retention: {
        sequence: ordinal,
        previousProofSha256: null,
        completedRegistrationCohorts: ordinal >= 5 ? [40, 60] : [],
      },
      predecessors: chain,
      registrationReady,
    };
    const basePath = `capacity/${leg.legId}/`;
    const resultSha256 = await write(basePath + 'capacity-result.json', result),
      candidateSha256 = await write(
        basePath + 'capacity-result-candidate.json',
        createCapacityCandidate(result),
      ),
      requestSha256 = await write(basePath + 'capacity-request.json', request);
    const physical = {
      schemaVersion: 1,
      executionProfileSha256: p.profileSha,
      kind: 'ROOT_CAPACITY_PROCESS_CLOSE',
      projectId: scope.projectId,
      planId: scope.planId,
      planSha256: capacityManifestHash(plan),
      sourceRevision: scope.sourceRevision,
      artifactSha256: scope.artifactSha256,
      runId: result.runId,
      legId: leg.legId,
      mode: leg.mode,
      result: 'VERIFIED',
      runOutcome: 'PASS',
      exitCode: 0,
      signal: null,
      elapsedMs: 1000,
      outerBudgetMs: 1500000,
      stdoutSha256: '8'.repeat(64),
      candidateSha256,
      capacityResultSha256: resultSha256,
      requestSha256,
      ownedResourcesClosed: true,
      observedOwnedProcessesRemaining: 0,
      stderrBytes: 0,
      sourceStillFrozen: true,
      rootCapacityPublisherSha256: '6'.repeat(64),
      rootCapacityValidatorSha256: '7'.repeat(64),
      resourceVerification: 'PRODUCER_CLEANUP_AND_OBSERVED_PROCESS_EXIT',
    };
    const closeSha256 = await write(
      basePath + 'capacity-process-close.json',
      physical,
    );
    references.set(leg.legId, {
      legId: leg.legId,
      resultSha256,
      processCloseSha256: closeSha256,
      requestSha256,
    });
    legs.push({
      ordinal,
      legId: leg.legId,
      resultSha256,
      closeSha256,
      candidateSha256,
      requestSha256,
    });
  }
  const index = {
    schemaVersion: 1,
    kind: 'ROOT_HELD_LOCAL_PREDECESSOR_INDEX',
    candidateRevision: scope.sourceRevision,
    functional: {
      resultSha256,
      closeSha256,
      candidateSha256,
      requestSha256,
      stages,
    },
    capacity: { manifestSha256, legs },
  };
  const root: HostedLocalPredecessorRootInput = {
    evidenceRoot: directory,
    expectedIndexSha256: await write('local-predecessor.json', index),
    predecessor: {
      candidateRevision: scope.sourceRevision,
      localFunctionalResultSha256: resultSha256,
      localFunctionalCloseSha256: closeSha256,
      localCapacityManifestSha256: manifestSha256,
      localCapacityChainSha256: sha256(encoded(legs)),
    },
    functionalPublishers: {
      publisherSha256: scope.rootPublisherSha256,
      validatorSha256: scope.rootValidatorSha256,
    },
    capacityPublishers: {
      publisherSha256: '6'.repeat(64),
      validatorSha256: '7'.repeat(64),
    },
    profile: {
      bytes: p.profileBytes,
      expectedSha256: p.profileSha,
      observed: linuxExecutionProfileObservedSchema.parse({
        host: p.profile.host,
        identity: p.profile.identity,
        backend: p.profile.backend,
      }),
    },
    nowUtc: () => '2026-11-18T00:00:00Z',
  };
  const reseal = async () => {
    root.expectedIndexSha256 = await write('local-predecessor.json', index);
    root.predecessor.localFunctionalResultSha256 =
      index.functional.resultSha256;
    root.predecessor.localFunctionalCloseSha256 = index.functional.closeSha256;
    root.predecessor.localCapacityManifestSha256 =
      index.capacity.manifestSha256;
    root.predecessor.localCapacityChainSha256 = sha256(
      JSON.stringify(index.capacity.legs),
    );
  };
  return { root, index, write, reseal };
};
it('actual Root port distinguishes missing original index without inventing a verified predecessor', async () => {
  const f = await fixture();
  await fs.unlink(join(directory, 'local-predecessor.json'));
  expect(await createHostedLocalPredecessor(f.root)()).toEqual({
    status: 'NOT_FOUND',
  });
});
it('rechecks the complete synthetic actual-byte 15/15 chain with original validators, not caller summaries', async () => {
  const f = await fixture(),
    value = await createHostedLocalPredecessor(f.root)();
  expect(value.status).toBe('VERIFIED');
  if (value.status !== 'VERIFIED') throw Error('SYNTHETIC_ADAPTER_REJECTED');
  expect(value.value.functional.stages).toHaveLength(15);
  expect(value.value.capacity.legs).toHaveLength(15);
  expect(value.value.checkedAtUtc).toBe('2026-11-18T00:00:00Z');
  expect(value.value.evidenceSha256).toBe(f.root.expectedIndexSha256);
});

const legBase = 'capacity/anonymous_entry_prepare-native_browser-3/';
it.each([
  ['missing stage', 'functional/stage-health-confirmed.json', 'PARTIAL'],
  ['missing original request', legBase + 'capacity-request.json', 'PARTIAL'],
  ['missing result', legBase + 'capacity-result.json', 'PARTIAL'],
] as const)(
  'refuses %s without partial verification',
  async (_name, file, expected) => {
    const f = await fixture();
    await fs.unlink(join(directory, file));
    expect(await createHostedLocalPredecessor(f.root)()).toEqual({
      status: expected,
    });
  },
);
it.each([
  'missing stage',
  'duplicate stage',
  'reordered legs',
  'missing leg',
  'summary only',
])('refuses Root-index semantic defect: %s', async (kind) => {
  const f = await fixture();
  if (kind === 'missing stage') f.index.functional.stages.pop();
  if (kind === 'duplicate stage') f.index.functional.stages.copyWithin(1, 0, 1);
  if (kind === 'reordered legs') f.index.capacity.legs.reverse();
  if (kind === 'missing leg') f.index.capacity.legs.pop();
  if (kind === 'summary only') Object.assign(f.index, { verified: true });
  await f.reseal();
  expect(await createHostedLocalPredecessor(f.root)()).toEqual({
    status: 'UNKNOWN',
  });
});
it.each([
  'FAIL',
  'unclosed',
  'foreign source',
  'foreign run',
  'candidate mismatch',
  'request mismatch',
])(
  'rechecks original publication semantics despite consistent index hashes: %s',
  async (kind) => {
    const f = await fixture(),
      ref = f.index.capacity.legs[0];
    if (!ref) throw Error('SYNTHETIC_LEG_MISSING');
    const file =
      kind === 'FAIL'
        ? 'capacity-result.json'
        : kind === 'candidate mismatch'
          ? 'capacity-result-candidate.json'
          : kind === 'request mismatch'
            ? 'capacity-request.json'
            : 'capacity-process-close.json';
    const value = JSON.parse(
      await fs.readFile(join(directory, legBase + file), 'utf8'),
    ) as Record<string, unknown>;
    if (kind === 'FAIL') value.result = 'FAIL';
    if (kind === 'unclosed') value.ownedResourcesClosed = false;
    if (kind === 'foreign source') value.sourceRevision = 'b'.repeat(40);
    if (kind === 'foreign run') value.runId = 'wcr-abcdef-foreign';
    if (kind === 'candidate mismatch')
      (value.receipt as Record<string, unknown>).elapsedMs = 999;
    if (kind === 'request mismatch') value.runId = 'wcr-abcdef-foreign';
    const sri = await f.write(legBase + file, value);
    if (kind === 'FAIL') ref.resultSha256 = sri;
    else if (kind === 'candidate mismatch') ref.candidateSha256 = sri;
    else if (kind === 'request mismatch') ref.requestSha256 = sri;
    else ref.closeSha256 = sri;
    await f.reseal();
    expect(await createHostedLocalPredecessor(f.root)()).toEqual({
      status: 'UNKNOWN',
    });
  },
);
it.each([
  'byte tamper',
  'wrong hash',
  'profile self assertion',
  'observed drift',
  'expired clock shape',
])('refuses independent Root binding defect: %s', async (kind) => {
  const f = await fixture();
  if (kind === 'byte tamper')
    await fs.appendFile(join(directory, legBase + 'capacity-result.json'), ' ');
  if (kind === 'wrong hash') f.root.expectedIndexSha256 = '0'.repeat(64);
  if (kind === 'profile self assertion')
    f.root.profile.expectedSha256 = '0'.repeat(64);
  if (kind === 'observed drift')
    Object.assign(f.root.profile.observed.host, { logicalCpu: 999 });
  if (kind === 'expired clock shape') f.root.nowUtc = () => 'not-utc';
  expect(await createHostedLocalPredecessor(f.root)()).toEqual({
    status: 'UNKNOWN',
  });
});
it.each([
  'public file',
  'foreign owner',
  'public folder',
  'symlink',
  'hardlink',
  'oversize',
  'traversal',
  'read drift',
  'unknown IO',
])('rejects private evidence boundary defect: %s', async (kind) => {
  const f = await fixture(),
    file = join(directory, legBase + 'capacity-result.json');
  if (kind === 'public file') await fs.chmod(file, 0o644);
  if (kind === 'foreign owner')
    vi.spyOn(process, 'getuid').mockReturnValue(424242);
  if (kind === 'public folder') await fs.chmod(dirname(file), 0o755);
  if (kind === 'symlink') {
    await fs.rename(file, file + '.held');
    await fs.symlink(file + '.held', file);
  }
  if (kind === 'hardlink') await fs.link(file, file + '.linked');
  if (kind === 'oversize') await fs.writeFile(file, ' '.repeat(262145));
  if (kind === 'traversal')
    f.root.evidenceRoot += '/../' + (directory.split('/').at(-1) ?? 'missing');
  if (kind === 'unknown IO')
    vi.spyOn(fs, 'open').mockRejectedValueOnce(Error('SYNTHETIC_IO'));
  if (kind === 'read drift') {
    const open = fs.open;
    vi.spyOn(fs, 'open').mockImplementation(async (...args) => {
      const handle = await open(...args);
      if (args[0] === file) await fs.appendFile(file, ' ');
      return handle;
    });
  }
  expect(await createHostedLocalPredecessor(f.root)()).toEqual({
    status: 'UNKNOWN',
  });
});
it.each(['{"a":1,"a":2}', '{"a":1,"\\u0061":2}', '{"nested":{"a":1,"a":2}}'])(
  'rejects decoded duplicate JSON keys before original validators',
  async (raw) => {
    const f = await fixture();
    await fs.writeFile(join(directory, 'local-predecessor.json'), raw);
    f.root.expectedIndexSha256 = sha256(raw);
    expect(await createHostedLocalPredecessor(f.root)()).toEqual({
      status: 'UNKNOWN',
    });
  },
);
