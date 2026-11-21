import { type CapacityScope } from '../../../scripts/concurrency/capacity-scope';
import { type CapacityManifest } from '../../../scripts/concurrency/capacity-manifest';
import { newCapacityReceipt } from '../../../scripts/concurrency/capacity-receipt';
import { summarizeOperations } from '../../../scripts/concurrency/capacity-metrics';
import { createCapacityHealth } from '../../../scripts/concurrency/capacity-health';
import { readyScope } from './whole-site-functional';
import { sha256 } from '../../../scripts/concurrency/local-runtime';
import {
  newFunctionalReceipt,
  finishFunctionalReceipt,
  functionalStages,
  requiredProofs,
} from '../../../scripts/concurrency/functional-receipt';
export const capacityFixture = async () => {
  const functional = await readyScope();
  const started = newFunctionalReceipt(functional, 'a'.repeat(64));
  started.stages = functionalStages.map((stage) => ({
    stage,
    status: 'pass',
    elapsedMs: 1,
    proof: { proofs: [...requiredProofs[stage]], counts: {} },
  }));
  started.cleanup = {
    status: 'verified',
    resourcesClosed: true,
    settled: true,
  };
  const receipt = finishFunctionalReceipt(started);
  const receiptBytes = JSON.stringify(receipt);
  const processClose = {
    schemaVersion: 1,
    kind: 'ROOT_FUNCTIONAL_PROCESS_CLOSE',
    projectId: functional.projectId,
    sourceRevision: functional.expectedRevision,
    runId: functional.runId,
    result: 'VERIFIED',
    runOutcome: 'PASS',
    exitCode: 0,
    signal: null,
    elapsedMs: 1000,
    outerBudgetMs: 1500000,
    stdoutSha256: 'a'.repeat(64),
    candidateSha256: 'b'.repeat(64),
    functionalResultSha256: sha256(receiptBytes),
    requestSha256: 'c'.repeat(64),
    ownedResourcesClosed: true,
    observedOwnedProcessesRemaining: 0,
    stderrBytes: 0,
    sourceStillFrozen: true,
    rootPublisherSha256: 'd'.repeat(64),
    rootValidatorSha256: 'e'.repeat(64),
    resourceVerification: 'PRODUCER_CLEANUP_AND_OBSERVED_PROCESS_EXIT',
  };
  const processCloseBytes = JSON.stringify(processClose);
  const input = {
    schemaVersion: 1,
    environment: 'local',
    projectId: functional.projectId,
    planId: 'wsc-abcdef-123456',
    sourceRevision: functional.expectedRevision,
    artifactRevision: functional.expectedRevision,
    artifactSha256: receipt.artifactSha256,
    anonKeySha256: functional.anonKeySha256,
    serviceKeySha256: functional.serviceKeySha256,
    databaseIdentitySha256: functional.databaseIdentitySha256,
    appUrl: 'http://127.0.0.1:58373',
    supabaseUrl: 'http://127.0.0.1:58321',
    databaseUrl: 'postgresql://127.0.0.1:58322/postgres',
    mailpitUrl: 'http://127.0.0.1:58324',
    functionalRunId: functional.runId,
    functionalResultSha256: sha256(receiptBytes),
    functionalProcessCloseSha256: sha256(processCloseBytes),
    functionalRequestSha256: processClose.requestSha256,
    rootPublisherSha256: processClose.rootPublisherSha256,
    rootValidatorSha256: processClose.rootValidatorSha256,
    helpers: {
      'functional-preflight.py': 'a'.repeat(64),
      'canonical-baseline.py': 'b'.repeat(64),
      'media-readback.py': 'c'.repeat(64),
      'host-sample.py': 'd'.repeat(64),
      'vm-sample.py': 'e'.repeat(64),
    },
  };
  return {
    input,
    receipt,
    processClose,
    proof: { receiptBytes, processCloseBytes },
  };
};
export const hostSample = (at = 1000000) => ({
  platform: 'darwin',
  sampledAtMonotonicMs: at,
  hostMemoryBytes: 16 * 1024 ** 3,
  hostLogicalCpu: 8,
  hostPressureFlag: 1,
  hostSwapUsedBytes: 0,
  nodeStart: '123',
  browserStart: '456',
  treeComplete: true,
  nodeRssBytes: 100000000,
  nodePhysicalFootprintBytes: 80000000,
  nodeCpuLifetimePercentOfOneCore: 50,
  browserProcessCount: 3,
  browserTreeRssBytes: 8 * 1024 ** 3,
  browserTreePhysicalFootprintBytes: 2 * 1024 ** 3,
  browserCpuLifetimePercentOfOneCore: 200,
  memoryAccounting:
    'DARWIN_RUSAGE_INFO_V0_PHYSICAL_FOOTPRINT_WITH_SEPARATE_RSS',
  readOnly: true,
});
export const vmSample = (at = 9990000) => ({
  sampledAtMonotonicMs: at,
  vmBootIdSha256: 'a'.repeat(64),
  vmLogicalCpu: 4,
  vmMemoryTotalBytes: 6 * 1024 ** 3,
  vmMemoryAvailableBytes: 4 * 1024 ** 3,
  vmSwapTotalBytes: 0,
  vmSwapFreeBytes: 0,
  vmCpuTicks: {
    user: 100,
    nice: 0,
    system: 100,
    idle: 800,
    iowait: 0,
    irq: 0,
    softirq: 0,
    steal: 0,
  },
  vmLoad1: 1,
  vmLoad5: 1,
  vmLoad15: 1,
  readOnly: true,
});
export const operation = (
  index: number,
  duration = 100,
  overrides: Record<string, unknown> = {},
) => ({
  id: `op-${String(index).padStart(6, '0')}`,
  actorIndex: index % 40,
  operation: 'published_content',
  startedAtMs: 0,
  finishedAtMs: duration,
  status: 'success',
  reason: null,
  attempts: [{ startedAtMs: 0, finishedAtMs: duration }],
  cache: 'cold',
  replayOf: null,
  ...overrides,
});

export const completeCapacityReceipt = (
  scope: CapacityScope,
  plan: CapacityManifest,
  legId: string,
  predecessorSha256: string | null = null,
): ReturnType<typeof newCapacityReceipt> & {
  health: ReturnType<
    ReturnType<typeof createCapacityHealth>['snapshot']
  > | null;
} => {
  const receipt = newCapacityReceipt(
    plan,
    scope,
    legId,
    'wcr-abcdef-123456',
    predecessorSha256,
  );
  const count = receipt.leg.actors;
  const samples = receipt.leg.requiredOperations.flatMap((kind, kindIndex) =>
    Array.from({ length: count }, (_, i) =>
      operation(kindIndex * 100 + i, 100, {
        actorIndex: kind === 'teacher_dashboard' ? 0 : i % count,
        operation: kind,
        duringStudentBusinessLoad: kind === 'teacher_dashboard',
      }),
    ),
  );
  receipt.rateLimit = {
    observed429Count: 0,
    source: 'NOT_OBSERVED',
    retryAfterSeconds: null,
    observedAtUtc: null,
    nextEligibleAtUtc: null,
    evidenceSha256: null,
    automaticRetryCount: 0,
  };
  receipt.metrics = summarizeOperations(samples, count, [
    ...Array(count).keys(),
  ]);
  const health = createCapacityHealth(receipt.leg.mode);
  const browserless = receipt.leg.mode === 'NODE_PROTOCOL';
  const host = browserless
    ? {
        ...hostSample(),
        browserStart: null,
        treeComplete: null,
        browserProcessCount: 0,
        browserTreeRssBytes: null,
        browserTreePhysicalFootprintBytes: null,
        browserCpuLifetimePercentOfOneCore: null,
      }
    : hostSample();
  health.host({ startedAtNodeMs: 0, completedAtNodeMs: 1, sample: host });
  health.vm({ startedAtNodeMs: 0, completedAtNodeMs: 1, sample: vmSample() });
  health.eventLoop({ atNodeMs: 1, p95Ms: 10 });
  receipt.health = health.snapshot(2);
  receipt.controls = {
    functionalAuthority: true,
    ownership: true,
    journey: true,
    readback: true,
    outsider: receipt.leg.profile.outsiderActors ? true : null,
    retention: true,
    cleanup: true,
    resourcesClosed: true,
    settled: true,
    unexpectedErrors: 0,
  };
  receipt.barriers = receipt.leg.barriers.map((name) => ({
    name,
    measurement: {
      result: 'VALID',
      actorsExpected: count,
      requestsObserved: count,
      skewMs: 1,
    },
  }));
  receipt.bundle = {
    sourceRevision: scope.sourceRevision,
    artifactSha256: scope.artifactSha256,
    entryClosureSha256: 'a'.repeat(64),
    entryClosureGzipBytes: 300 * 1024,
    recursiveColdImports: true,
    deduplicatedChunks: true,
  };
  receipt.elapsedMs = 1000;
  return { ...receipt, health: health.snapshot(2) };
};
