import { z } from 'zod';
import { executionProfileDigest } from './execution-profile';
import {
  capacityFailure,
  capacityModes,
  type CapacityScope,
} from './capacity-scope';
import {
  capacityManifestHash,
  findCapacityLeg,
  type CapacityManifest,
} from './capacity-manifest';
import {
  capacityReceiptSchema,
  assertCapacityPredecessor,
  finalizeCapacityReceipt,
  type CapacityReceipt,
} from './capacity-receipt';
import { sha256 } from './local-runtime';
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
export const capacityCandidateSchema = z.strictObject({
  schemaVersion: z.literal(1),
  result: z.literal('PENDING_EXTERNAL_ATTESTATION'),
  receipt: capacityReceiptSchema.omit({ result: true }),
});
export const createCapacityCandidate = (input: CapacityReceipt) => {
  const { result, ...receipt } = capacityReceiptSchema.parse(input);
  void result;
  return capacityCandidateSchema.parse({
    schemaVersion: 1,
    result: 'PENDING_EXTERNAL_ATTESTATION',
    receipt,
  });
};
export const capacityProcessCloseSchema = z.strictObject({
  executionProfileSha256: executionProfileDigest.optional(),
  schemaVersion: z.literal(1),
  kind: z.literal('ROOT_CAPACITY_PROCESS_CLOSE'),
  projectId: z.literal('cp-whole-site-261115'),
  planId: z.string().regex(/^wsc-[a-z0-9]{6,16}-[a-z0-9]{6,16}$/u),
  planSha256: digest,
  sourceRevision: z.string().regex(/^[a-f0-9]{40}$/u),
  artifactSha256: digest,
  runId: capacityReceiptSchema.shape.runId,
  legId: capacityReceiptSchema.shape.leg.shape.legId,
  mode: z.enum(capacityModes),
  result: z.enum(['VERIFIED', 'FAILED', 'INCONCLUSIVE']),
  runOutcome: z.enum(['PASS', 'FAIL', 'INCONCLUSIVE']),
  exitCode: z.number().int().min(0).max(255).nullable(),
  signal: z.enum(['SIGTERM', 'SIGKILL', 'OTHER']).nullable(),
  elapsedMs: z.number().nonnegative(),
  outerBudgetMs: z.literal(1500000),
  stdoutSha256: digest,
  candidateSha256: digest.nullable(),
  capacityResultSha256: digest.nullable(),
  requestSha256: digest,
  ownedResourcesClosed: z.boolean().nullable(),
  observedOwnedProcessesRemaining: z.number().int().nonnegative().nullable(),
  stderrBytes: z.number().int().nonnegative(),
  sourceStillFrozen: z.boolean(),
  rootCapacityPublisherSha256: digest,
  rootCapacityValidatorSha256: digest,
  resourceVerification: z.literal('PRODUCER_CLEANUP_AND_OBSERVED_PROCESS_EXIT'),
});
export const capacityAuthorityReferenceSchema = z.strictObject({
  legId: capacityReceiptSchema.shape.leg.shape.legId,
  resultSha256: digest,
  processCloseSha256: digest,
  requestSha256: digest,
});
export interface CapacityPublishedLink extends z.infer<
  typeof capacityAuthorityReferenceSchema
> {
  receiptBytes: string;
  processCloseBytes: string;
}
export interface CapacityPublishers {
  rootCapacityPublisherSha256: string;
  rootCapacityValidatorSha256: string;
}
export const assertCapacityRootClose = (
  plan: CapacityManifest,
  scope: CapacityScope,
  link: CapacityPublishedLink,
  publishers: CapacityPublishers,
) => {
  try {
    if (
      Buffer.byteLength(link.receiptBytes) > 262144 ||
      Buffer.byteLength(link.processCloseBytes) > 16384 ||
      sha256(link.receiptBytes) !== link.resultSha256 ||
      sha256(link.processCloseBytes) !== link.processCloseSha256
    )
      return capacityFailure();
    const receipt = capacityReceiptSchema.parse(JSON.parse(link.receiptBytes));
    const close = capacityProcessCloseSchema.parse(
      JSON.parse(link.processCloseBytes),
    );
    const recomputed = finalizeCapacityReceipt(receipt, plan, scope);
    if (
      JSON.stringify(receipt) !== JSON.stringify(recomputed) ||
      close.executionProfileSha256 !== scope.executionProfileSha256 ||
      receipt.executionProfileSha256 !== scope.executionProfileSha256 ||
      receipt.result !== 'PASS' ||
      close.result !== 'VERIFIED' ||
      close.runOutcome !== 'PASS' ||
      close.exitCode !== 0 ||
      close.signal !== null ||
      close.elapsedMs > close.outerBudgetMs ||
      close.ownedResourcesClosed !== true ||
      close.observedOwnedProcessesRemaining !== 0 ||
      close.stderrBytes !== 0 ||
      !close.sourceStillFrozen ||
      close.candidateSha256 === null ||
      close.capacityResultSha256 !== link.resultSha256 ||
      close.requestSha256 !== link.requestSha256 ||
      close.rootCapacityPublisherSha256 !==
        publishers.rootCapacityPublisherSha256 ||
      close.rootCapacityValidatorSha256 !==
        publishers.rootCapacityValidatorSha256 ||
      close.planId !== scope.planId ||
      close.planSha256 !== capacityManifestHash(plan) ||
      close.sourceRevision !== scope.sourceRevision ||
      close.artifactSha256 !== scope.artifactSha256 ||
      close.runId !== receipt.runId ||
      close.legId !== receipt.leg.legId ||
      close.legId !== link.legId ||
      close.mode !== receipt.leg.mode
    )
      return capacityFailure();
    return receipt;
  } catch {
    return capacityFailure();
  }
};
export const assertPublishedCapacityChain = (
  plan: CapacityManifest,
  scope: CapacityScope,
  legId: string,
  links: readonly CapacityPublishedLink[],
  registrationReady: readonly CapacityPublishedLink[],
  publishers: CapacityPublishers,
) => {
  const leg = findCapacityLeg(plan, legId);
  for (const link of [...links, ...registrationReady])
    assertCapacityRootClose(plan, scope, link, publishers);
  const previous = assertCapacityPredecessor(plan, legId, links, scope);
  if (
    leg.scenario === 'existing_login_game' ||
    leg.scenario === 'backend_game'
  ) {
    if (
      registrationReady.length !== 2 ||
      registrationReady[0]?.legId !== 'fresh_registration-native_browser-40' ||
      registrationReady[1]?.legId !== 'fresh_registration-native_browser-60'
    )
      return capacityFailure();
    assertCapacityPredecessor(
      plan,
      'fresh_registration-native_browser-60',
      registrationReady.slice(0, 1),
      scope,
    );
    const sixty = assertCapacityRootClose(
      plan,
      scope,
      registrationReady[1],
      publishers,
    );
    if (
      sixty.predecessorSha256 !== registrationReady[0].resultSha256 ||
      !sixty.overallSloPassed
    )
      return capacityFailure();
  } else if (registrationReady.length !== 0) return capacityFailure();
  return previous;
};
