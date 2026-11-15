import { z } from 'zod';
import {
  executionProfileDigest,
  executionProfileField,
} from './execution-profile';
import {
  validateReceiptHealth,
  receiptHealthStatus,
} from './capacity-receipt-health';
import { sha256 } from './local-runtime';
import {
  capacityScopeSchema,
  capacityFailure,
  requireCapacityScope,
  type CapacityScope,
} from './capacity-scope';
import {
  capacityLegSchema,
  capacityManifestHash,
  findCapacityLeg,
  validateCapacityManifest,
  type CapacityManifest,
} from './capacity-manifest';
import {
  capacityMetricsSchema,
  barrierResultSchema,
  validateCapacityMetrics,
} from './capacity-metrics';
import { capacityHealthSchema } from './capacity-health';
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
export const capacityBundleSchema = z.strictObject({
  sourceRevision: z.string().regex(/^[a-f0-9]{40}$/u),
  artifactSha256: digest,
  entryClosureSha256: digest,
  entryClosureGzipBytes: z.number().int().positive(),
  recursiveColdImports: z.literal(true),
  deduplicatedChunks: z.literal(true),
});
export const capacityRateLimitSchema = z
  .strictObject({
    observed429Count: z.number().int().nonnegative(),
    source: z.enum([
      'NOT_OBSERVED',
      'RETRY_AFTER_HEADER',
      'OBSERVED_WINDOW',
      'UNAVAILABLE',
    ]),
    retryAfterSeconds: z.number().int().min(0).max(86400).nullable(),
    observedAtUtc: z.iso.datetime({ offset: true }).nullable(),
    nextEligibleAtUtc: z.iso.datetime({ offset: true }).nullable(),
    evidenceSha256: digest.nullable(),
    automaticRetryCount: z.literal(0),
  })
  .superRefine((value, context) => {
    const reject = () => {
      context.addIssue({
        code: 'custom',
        message: 'CAPACITY_RATE_LIMIT_INVALID',
      });
    };
    if (value.observed429Count === 0) {
      if (
        value.source !== 'NOT_OBSERVED' ||
        value.retryAfterSeconds !== null ||
        value.observedAtUtc !== null ||
        value.nextEligibleAtUtc !== null ||
        value.evidenceSha256 !== null
      )
        reject();
      return;
    }
    if (
      value.source === 'NOT_OBSERVED' ||
      value.observedAtUtc === null ||
      value.evidenceSha256 === null
    ) {
      reject();
      return;
    }
    if (value.source === 'UNAVAILABLE') {
      if (value.retryAfterSeconds !== null || value.nextEligibleAtUtc !== null)
        reject();
      return;
    }
    if (
      value.nextEligibleAtUtc === null ||
      Date.parse(value.nextEligibleAtUtc) < Date.parse(value.observedAtUtc)
    ) {
      reject();
      return;
    }
    if (
      value.source === 'RETRY_AFTER_HEADER' &&
      (value.retryAfterSeconds === null ||
        Date.parse(value.nextEligibleAtUtc) -
          Date.parse(value.observedAtUtc) !==
          value.retryAfterSeconds * 1000)
    )
      reject();
  });
const controlsSchema = z.strictObject({
  functionalAuthority: z.boolean().nullable(),
  ownership: z.boolean().nullable(),
  journey: z.boolean().nullable(),
  readback: z.boolean().nullable(),
  outsider: z.boolean().nullable(),
  retention: z.boolean().nullable(),
  cleanup: z.boolean().nullable(),
  resourcesClosed: z.boolean().nullable(),
  settled: z.boolean().nullable(),
  unexpectedErrors: z.number().int().nonnegative().nullable(),
});
const failureReasons = [
  'missing_proof',
  'functional_failure',
  'backend_resource',
  'generator_unknown',
  'generator_limited',
  'barrier_unknown',
  'barrier_limited',
  'metrics_incomplete',
  'operation_budget',
  'bundle_owner_acceptance',
  'bundle_too_large',
  'timeout',
  'cleanup_incomplete',
] as const;
export const capacityReceiptSchema = z.strictObject({
  executionProfileSha256: executionProfileDigest.optional(),
  schemaVersion: z.literal(1),
  scope: capacityScopeSchema,
  planSha256: digest,
  leg: capacityLegSchema,
  runId: z.string().regex(/^wcr-[a-z0-9]{6,16}-[a-z0-9]{6,16}$/u),
  predecessorSha256: digest.nullable(),
  controls: controlsSchema,
  rateLimit: capacityRateLimitSchema.nullable(),
  metrics: capacityMetricsSchema.nullable(),
  health: capacityHealthSchema.nullable(),
  barriers: z
    .array(
      z.strictObject({
        name: z.enum(['entry', 'submit', 'backend']),
        measurement: barrierResultSchema.nullable(),
      }),
    )
    .max(2),
  bundle: capacityBundleSchema.nullable(),
  bundleResult: z.enum([
    'NOT_EVALUATED',
    'TARGET_MET',
    'OWNER_ACCEPTANCE_REQUIRED',
    'FAIL',
  ]),
  productResult: z.enum(['UNKNOWN', 'PASS', 'FAIL']),
  sloResult: z.enum([
    'NOT_APPLICABLE',
    'PASS',
    'FAIL',
    'NOT_EVALUATED_INSUFFICIENT_SAMPLES',
    'NOT_EVALUATED_MISSING_EVIDENCE',
  ]),
  overallSloPassed: z.boolean(),
  timedOut: z.boolean(),
  runAborted: z.boolean(),
  elapsedMs: z.number().nonnegative().nullable(),
  result: z.enum(['RUNNING', 'PASS', 'FAIL', 'INCONCLUSIVE']),
  failureReasons: z.array(z.enum(failureReasons)).max(failureReasons.length),
  cwv: z.literal('NOT_EVALUATED'),
  realDevice: z.literal('NOT_EVALUATED'),
  hosted: z.literal('NOT_EVALUATED'),
  phaseAcceptance: z.literal('NOT_EVALUATED'),
});
export type CapacityReceipt = z.infer<typeof capacityReceiptSchema>;
export const newCapacityReceipt = (
  plan: CapacityManifest,
  scope: CapacityScope,
  legId: string,
  runId: string,
  predecessorSha256: string | null,
): CapacityReceipt => {
  requireCapacityScope(scope);
  validateCapacityManifest(plan, scope);
  const leg = findCapacityLeg(plan, legId);
  return capacityReceiptSchema.parse({
    ...executionProfileField(scope),
    schemaVersion: 1,
    scope,
    planSha256: capacityManifestHash(plan),
    leg,
    runId,
    predecessorSha256,
    controls: {
      functionalAuthority: null,
      ownership: null,
      journey: null,
      readback: null,
      outsider: null,
      retention: null,
      cleanup: null,
      resourcesClosed: null,
      settled: null,
      unexpectedErrors: null,
    },
    rateLimit: null,
    metrics: null,
    health: null,
    barriers: leg.barriers.map((name) => ({ name, measurement: null })),
    bundle: null,
    bundleResult: 'NOT_EVALUATED',
    productResult: 'UNKNOWN',
    sloResult: leg.requiredOperations.length
      ? 'NOT_EVALUATED_MISSING_EVIDENCE'
      : 'NOT_APPLICABLE',
    overallSloPassed: false,
    timedOut: false,
    runAborted: false,
    elapsedMs: null,
    result: 'RUNNING',
    failureReasons: [],
    cwv: 'NOT_EVALUATED',
    realDevice: 'NOT_EVALUATED',
    hosted: 'NOT_EVALUATED',
    phaseAcceptance: 'NOT_EVALUATED',
  });
};
export const finalizeCapacityReceipt = (
  input: unknown,
  plan: CapacityManifest,
  scope: CapacityScope,
): CapacityReceipt => {
  try {
    requireCapacityScope(scope);
    validateCapacityManifest(plan, scope);
    const receipt = capacityReceiptSchema.parse(input),
      leg = findCapacityLeg(plan, receipt.leg.legId);
    if (
      receipt.executionProfileSha256 !== scope.executionProfileSha256 ||
      JSON.stringify(receipt.scope) !== JSON.stringify(scope) ||
      receipt.planSha256 !== capacityManifestHash(plan) ||
      JSON.stringify(receipt.leg) !== JSON.stringify(leg) ||
      (leg.predecessorLegId === null) !==
        (receipt.predecessorSha256 === null) ||
      JSON.stringify(receipt.barriers.map((row) => row.name)) !==
        JSON.stringify(leg.barriers)
    )
      return capacityFailure();
    if (receipt.metrics !== null)
      receipt.metrics = validateCapacityMetrics(receipt.metrics);
    if (receipt.health !== null)
      receipt.health = validateReceiptHealth(receipt.health, scope);
    const reasons = new Set<(typeof failureReasons)[number]>();
    const controls = receipt.controls;
    if (receipt.rateLimit === null) reasons.add('missing_proof');
    else if (receipt.rateLimit.observed429Count > 0)
      reasons.add('functional_failure');
    const required = [
      controls.functionalAuthority,
      controls.ownership,
      controls.journey,
      controls.readback,
      controls.retention,
      controls.cleanup,
      controls.resourcesClosed,
      controls.settled,
    ];
    if (
      leg.scenario === 'existing_login_game' ||
      leg.scenario === 'backend_game'
    )
      required.push(controls.outsider);
    if (
      required.some((value) => value === null) ||
      controls.unexpectedErrors === null ||
      receipt.elapsedMs === null
    )
      reasons.add('missing_proof');
    if (
      required.some((value) => value === false) ||
      (controls.unexpectedErrors !== null && controls.unexpectedErrors > 0)
    )
      reasons.add('functional_failure');
    if (
      controls.cleanup === null ||
      controls.resourcesClosed === null ||
      controls.settled === null
    )
      reasons.add('cleanup_incomplete');
    receipt.productResult =
      required.every((value) => value === true) &&
      controls.unexpectedErrors === 0
        ? 'PASS'
        : reasons.has('functional_failure')
          ? 'FAIL'
          : 'UNKNOWN';
    if (receipt.timedOut || receipt.runAborted) reasons.add('timeout');
    const healthStatus = receiptHealthStatus(receipt.health, leg.mode);
    if (healthStatus) reasons.add(healthStatus);
    for (const barrier of receipt.barriers) {
      if (
        !barrier.measurement ||
        barrier.measurement.result === 'UNKNOWN' ||
        barrier.measurement.actorsExpected !== leg.actors ||
        barrier.measurement.requestsObserved !== leg.actors ||
        barrier.measurement.skewMs === null
      )
        reasons.add('barrier_unknown');
      else if (
        barrier.measurement.result === 'GENERATOR_LIMITED' ||
        barrier.measurement.skewMs > 250
      )
        reasons.add('barrier_limited');
    }
    receipt.bundleResult = 'NOT_EVALUATED';
    if (!receipt.bundle) reasons.add('missing_proof');
    else {
      if (
        receipt.bundle.sourceRevision !== scope.sourceRevision ||
        receipt.bundle.artifactSha256 !== scope.artifactSha256
      )
        return capacityFailure();
      const bytes = receipt.bundle.entryClosureGzipBytes;
      receipt.bundleResult =
        bytes <= 300 * 1024
          ? 'TARGET_MET'
          : bytes <= 350 * 1024
            ? 'OWNER_ACCEPTANCE_REQUIRED'
            : 'FAIL';
      if (bytes > 350 * 1024) reasons.add('bundle_too_large');
      else if (bytes > 300 * 1024) reasons.add('bundle_owner_acceptance');
    }
    receipt.overallSloPassed = false;
    if (receipt.metrics?.actorsStarted !== leg.actors) {
      receipt.sloResult = 'NOT_EVALUATED_MISSING_EVIDENCE';
      reasons.add('metrics_incomplete');
    } else {
      if (
        receipt.metrics.actorsCompleted !== leg.actors ||
        receipt.metrics.actorCompletionRate !== 1
      )
        reasons.add('functional_failure');
      const metrics = receipt.metrics;
      const operations = leg.requiredOperations.map(
        (name) => metrics.operations[name],
      );
      if (operations.length === 0) receipt.sloResult = 'NOT_APPLICABLE';
      else if (operations.some((row) => row.result === 'FAIL')) {
        receipt.sloResult = 'FAIL';
        reasons.add('operation_budget');
      } else if (operations.every((row) => row.result === 'PASS')) {
        receipt.sloResult = 'PASS';
        receipt.overallSloPassed = true;
      } else if (
        operations.every(
          (row) =>
            row.result === 'PASS' ||
            row.result === 'NOT_EVALUATED_INSUFFICIENT_SAMPLES',
        )
      )
        receipt.sloResult = 'NOT_EVALUATED_INSUFFICIENT_SAMPLES';
      else receipt.sloResult = 'NOT_EVALUATED_MISSING_EVIDENCE';
      if (receipt.sloResult === 'NOT_EVALUATED_MISSING_EVIDENCE')
        reasons.add('metrics_incomplete');
      if (leg.actors >= 40 && operations.some((row) => row.result !== 'PASS'))
        reasons.add('metrics_incomplete');
    }
    if (reasons.has('functional_failure')) receipt.productResult = 'FAIL';
    const inconclusive = [
      'backend_resource',
      'missing_proof',
      'generator_unknown',
      'generator_limited',
      'barrier_unknown',
      'barrier_limited',
      'metrics_incomplete',
      'bundle_owner_acceptance',
      'timeout',
      'cleanup_incomplete',
    ] as const;
    receipt.result = [...inconclusive].some((reason) => reasons.has(reason))
      ? 'INCONCLUSIVE'
      : reasons.size
        ? 'FAIL'
        : 'PASS';
    if (
      reasons.has('backend_resource') ||
      reasons.has('generator_unknown') ||
      reasons.has('generator_limited') ||
      reasons.has('barrier_unknown') ||
      reasons.has('barrier_limited')
    )
      receipt.sloResult = 'NOT_EVALUATED_MISSING_EVIDENCE';
    receipt.overallSloPassed =
      receipt.result === 'PASS' && receipt.sloResult === 'PASS';
    receipt.failureReasons = [...reasons];
    return capacityReceiptSchema.parse(receipt);
  } catch {
    return capacityFailure();
  }
};
export const assertCapacityPredecessor = (
  plan: CapacityManifest,
  legId: string,
  links: readonly { receiptBytes: string }[],
  scope: CapacityScope,
): string | null => {
  validateCapacityManifest(plan, scope);
  const target = findCapacityLeg(plan, legId);
  const expected = [];
  let cursor = target.predecessorLegId;
  while (cursor !== null) {
    const leg = findCapacityLeg(plan, cursor);
    expected.unshift(leg);
    cursor = leg.predecessorLegId;
  }
  if (links.length !== expected.length) return capacityFailure();
  let previous: string | null = null;
  for (const [index, link] of links.entries()) {
    if (Buffer.byteLength(link.receiptBytes) > 262144) return capacityFailure();
    const receipt = capacityReceiptSchema.parse(JSON.parse(link.receiptBytes)),
      leg = expected[index];
    const recomputed = finalizeCapacityReceipt(receipt, plan, scope);
    if (
      JSON.stringify(recomputed) !== JSON.stringify(receipt) ||
      !leg ||
      receipt.result !== 'PASS' ||
      receipt.leg.legId !== leg.legId ||
      receipt.planSha256 !== capacityManifestHash(plan) ||
      JSON.stringify(receipt.scope) !== JSON.stringify(plan.scope) ||
      JSON.stringify(receipt.leg) !== JSON.stringify(leg) ||
      receipt.predecessorSha256 !== previous ||
      receipt.health?.validity !== 'VALID' ||
      receipt.controls.cleanup !== true ||
      receipt.controls.resourcesClosed !== true ||
      receipt.controls.settled !== true ||
      receipt.productResult !== 'PASS' ||
      receipt.timedOut ||
      receipt.runAborted
    )
      return capacityFailure();
    if (
      receipt.leg.actors >= 40 &&
      leg.requiredOperations.length > 0 &&
      !receipt.overallSloPassed
    )
      return capacityFailure();
    previous = sha256(link.receiptBytes);
  }
  return previous;
};
