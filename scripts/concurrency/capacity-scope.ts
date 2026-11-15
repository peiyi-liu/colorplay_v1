import { z } from 'zod';
import { sha256 } from './local-runtime';
import {
  finishFunctionalReceipt,
  functionalReceiptSchema,
} from './functional-receipt';
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const revision = z.string().regex(/^[a-f0-9]{40}$/u);
const runId = z.string().regex(/^wsb-[a-z0-9]{6,16}-[a-z0-9]{6,16}$/u);
export const capacityModes = [
  'NATIVE_BROWSER',
  'NODE_PROTOCOL',
  'HYBRID_BROWSER_SDK',
] as const;
export type CapacityMode = (typeof capacityModes)[number];
export const capacityScopeSchema = z.strictObject({
  schemaVersion: z.literal(1),
  environment: z.literal('local'),
  projectId: z.literal('cp-whole-site-261115'),
  planId: z.string().regex(/^wsc-[a-z0-9]{6,16}-[a-z0-9]{6,16}$/u),
  sourceRevision: revision,
  artifactRevision: revision,
  artifactSha256: digest,
  anonKeySha256: digest,
  serviceKeySha256: digest,
  databaseIdentitySha256: digest,
  appUrl: z.literal('http://127.0.0.1:58373'),
  supabaseUrl: z.literal('http://127.0.0.1:58321'),
  databaseUrl: z.literal('postgresql://127.0.0.1:58322/postgres'),
  mailpitUrl: z.literal('http://127.0.0.1:58324'),
  functionalRunId: runId,
  functionalResultSha256: digest,
  functionalProcessCloseSha256: digest,
  functionalRequestSha256: digest,
  rootPublisherSha256: digest,
  rootValidatorSha256: digest,
  helpers: z.strictObject({
    'functional-preflight.py': digest,
    'canonical-baseline.py': digest,
    'media-readback.py': digest,
    'host-sample.py': digest,
    'vm-sample.py': digest,
  }),
});
export type CapacityScope = z.infer<typeof capacityScopeSchema>;
export const functionalProcessCloseSchema = z.strictObject({
  schemaVersion: z.literal(1),
  kind: z.literal('ROOT_FUNCTIONAL_PROCESS_CLOSE'),
  projectId: z.literal('cp-whole-site-261115'),
  sourceRevision: revision,
  runId,
  result: z.enum(['VERIFIED', 'FAILED', 'INCONCLUSIVE']),
  runOutcome: z.enum(['PASS', 'FAIL', 'INCONCLUSIVE']),
  exitCode: z.number().int().nullable(),
  signal: z.enum(['SIGTERM', 'SIGKILL', 'OTHER']).nullable(),
  elapsedMs: z.number().nonnegative(),
  outerBudgetMs: z.literal(1500000),
  stdoutSha256: digest,
  candidateSha256: digest.nullable(),
  functionalResultSha256: digest.nullable(),
  requestSha256: digest,
  ownedResourcesClosed: z.boolean().nullable(),
  observedOwnedProcessesRemaining: z.number().int().nonnegative().nullable(),
  stderrBytes: z.number().int().nonnegative(),
  sourceStillFrozen: z.boolean(),
  rootPublisherSha256: digest,
  rootValidatorSha256: digest,
  resourceVerification: z.literal('PRODUCER_CLEANUP_AND_OBSERVED_PROCESS_EXIT'),
});
const ready = new WeakSet<object>();
export const capacityFailure = (): never => {
  throw new Error('CAPACITY_EVIDENCE_INVALID');
};
export const requireCapacityScope = (scope: CapacityScope) => {
  if (!ready.has(scope)) capacityFailure();
};
export const parseCapacityScope = (
  input: unknown,
  authority: { receiptBytes: string; processCloseBytes: string },
): CapacityScope => {
  try {
    const scope = capacityScopeSchema.parse(input);
    if (
      Buffer.byteLength(authority.receiptBytes) > 131072 ||
      Buffer.byteLength(authority.processCloseBytes) > 32768
    )
      return capacityFailure();
    if (
      sha256(authority.receiptBytes) !== scope.functionalResultSha256 ||
      sha256(authority.processCloseBytes) !== scope.functionalProcessCloseSha256
    )
      return capacityFailure();
    const receipt = functionalReceiptSchema.parse(
      JSON.parse(authority.receiptBytes),
    );
    const closed = functionalProcessCloseSchema.parse(
      JSON.parse(authority.processCloseBytes),
    );
    if (
      receipt.result !== 'PASS' ||
      finishFunctionalReceipt(receipt).result !== 'PASS' ||
      closed.result !== 'VERIFIED' ||
      closed.runOutcome !== 'PASS' ||
      closed.exitCode !== 0 ||
      closed.signal !== null ||
      closed.elapsedMs > closed.outerBudgetMs ||
      closed.ownedResourcesClosed !== true ||
      closed.observedOwnedProcessesRemaining !== 0 ||
      closed.stderrBytes !== 0 ||
      !closed.sourceStillFrozen ||
      closed.candidateSha256 === null ||
      closed.functionalResultSha256 !== scope.functionalResultSha256 ||
      closed.requestSha256 !== scope.functionalRequestSha256 ||
      closed.rootPublisherSha256 !== scope.rootPublisherSha256 ||
      closed.rootValidatorSha256 !== scope.rootValidatorSha256
    )
      return capacityFailure();
    if (
      scope.sourceRevision !== scope.artifactRevision ||
      receipt.sourceRevision !== scope.sourceRevision ||
      receipt.artifactRevision !== scope.sourceRevision ||
      closed.sourceRevision !== scope.sourceRevision ||
      closed.runId !== scope.functionalRunId ||
      receipt.runId !== scope.functionalRunId ||
      receipt.artifactSha256 !== scope.artifactSha256 ||
      receipt.anonKeySha256 !== scope.anonKeySha256 ||
      receipt.serviceKeySha256 !== scope.serviceKeySha256
    )
      return capacityFailure();
    Object.freeze(scope.helpers);
    Object.freeze(scope);
    ready.add(scope);
    return scope;
  } catch {
    return capacityFailure();
  }
};
