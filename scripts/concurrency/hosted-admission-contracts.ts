import { z } from 'zod';
import type { ValidatedHostedConfig } from './hosted-config';
import { functionalStages } from './functional-receipt';
import {
  hostedTargetSchema,
  hostedPredecessorSchema,
  hostedSourceProofSchema,
  trustedHostedSourceProofSchema,
} from './hosted-provenance';
export const admissionSha = z.string().regex(/^[a-f0-9]{64}$/u);
export const admissionUtc = z.iso.datetime({ offset: true }).max(40);
const marker = z.string().regex(/^[a-z][a-z0-9-]{7,79}$/u);
const revision = z.string().regex(/^[a-f0-9]{40}$/u);
export const admissionLocalLegIds = [
  ...[3, 10, 20].map(
    (n) => `anonymous_entry_prepare-native_browser-${String(n)}`,
  ),
  ...[40, 60].map((n) => `fresh_registration-native_browser-${String(n)}`),
  ...[3, 10, 20, 40, 60].map(
    (n) => `existing_login_game-native_browser-${String(n)}`,
  ),
  ...[3, 10, 20, 40, 60].map((n) => `backend_game-node_protocol-${String(n)}`),
];
const run = z.strictObject({
  runId: marker,
  planId: marker,
  fixtureMarker: marker,
  nonceSha256: admissionSha,
});
const mail = z.strictObject({
  capability: z.literal('REAL_MAIL_CONTROLLED_INBOX'),
  controlledInboxSha256: admissionSha,
  sendPermission: z.literal('OWNER_APPROVED'),
  checkedAtUtc: admissionUtc,
});
export const approvalReadSchema = z.strictObject({
  approvalBytes: z.string().min(1).max(131072),
  expectedApprovalSha256: admissionSha,
});
// Only the read preflight header: the unchanged validateHostedConfig validates
// every nested scope/policy/mail field before any reservation is attempted.
export const approvalHeaderSchema = z.strictObject({
  schemaVersion: z.literal(1),
  kind: z.literal('ROOT_HOSTED_APPROVAL'),
  scope: z.unknown(),
  dataPolicy: z.unknown(),
  mail: z.unknown(),
  window: z.strictObject({ notBefore: admissionUtc, expiresAt: admissionUtc }),
  predecessor: hostedPredecessorSchema,
  sourceProof: hostedSourceProofSchema,
  rootRun: run,
});
export const deploymentWitnessSchema = z.strictObject({
  observed: hostedTargetSchema.extend({ observedAtUtc: admissionUtc }).strict(),
  edgeManifestSha256: admissionSha,
  migrationManifestSha256: admissionSha,
  evidenceSha256: admissionSha,
  runIdentity: run
    .extend({ state: z.enum(['UNUSED', 'RESERVED', 'USED']) })
    .strict(),
  controlledMail: mail.nullable(),
  sourceProof: trustedHostedSourceProofSchema,
});
export const localWitnessSchema = z.strictObject({
  predecessor: hostedPredecessorSchema,
  checkedAtUtc: admissionUtc,
  evidenceSha256: admissionSha,
  functional: z.strictObject({
    candidateRevision: revision,
    resultSha256: admissionSha,
    closeSha256: admissionSha,
    stages: z
      .array(
        z.strictObject({
          stage: z.enum(functionalStages),
          verdict: z.literal('PASS'),
          proofSha256: admissionSha,
        }),
      )
      .length(15),
    ownedResourcesClosed: z.literal(true),
    publication: z.literal('VERIFIED'),
  }),
  capacity: z.strictObject({
    candidateRevision: revision,
    manifestSha256: admissionSha,
    chainSha256: admissionSha,
    legs: z
      .array(
        z.strictObject({
          ordinal: z.number().int().min(0).max(14),
          legId: z.enum(admissionLocalLegIds),
          verdict: z.literal('PASS'),
          resultSha256: admissionSha,
          closeSha256: admissionSha,
          publicationSha256: admissionSha,
          ownedResourcesClosed: z.literal(true),
        }),
      )
      .length(15),
  }),
});
export const mergeWitnessSchema = z.strictObject({
  proofSha256: admissionSha,
  evidenceSha256: admissionSha,
  checkedAtUtc: admissionUtc,
  checks: z.strictObject({
    gitObjects: z.literal('VERIFIED'),
    ownerApproval: z.literal('VERIFIED'),
    branchProtection: z.literal('VERIFIED'),
    appTreeEquivalent: z.literal('VERIFIED'),
  }),
});
export type RootRead<T> =
  | { status: 'VERIFIED'; value: T }
  | { status: 'UNKNOWN' | 'PARTIAL' | 'NOT_FOUND' };
export type DeploymentWitness = z.infer<typeof deploymentWitnessSchema>;
export type LocalWitness = z.infer<typeof localWitnessSchema>;
export type MergeWitness = z.infer<typeof mergeWitnessSchema>;
export type ReadonlyDeep<T> = T extends object
  ? { readonly [K in keyof T]: ReadonlyDeep<T[K]> }
  : T;
export interface ReservationBinding {
  approvalSha256: string;
  nonceSha256: string;
  expiresAt: string;
  scope: ValidatedHostedConfig['config'];
  deployment: {
    target: z.infer<typeof hostedTargetSchema>;
    edgeManifestSha256: string;
    migrationManifestSha256: string;
    evidenceSha256: string;
    runIdentity: z.infer<typeof run>;
    controlledMail: Omit<
      NonNullable<DeploymentWitness['controlledMail']>,
      'checkedAtUtc'
    > | null;
    sourceProofSha256: string | null;
  };
  predecessor: Omit<LocalWitness, 'checkedAtUtc'>;
  sourceProof: Omit<MergeWitness, 'checkedAtUtc'> | null;
}
/** Future Root adapter contract only. UNKNOWN is not evidence of a write.
 * Its durable store must retain uncertainty monotonically across processes;
 * subsequent attempts may only return UNKNOWN/ALREADY_RESERVED, never UNUSED.
 * evidenceSha256 references immutable input evidence, not checkedAt timestamps.
 */
export interface RootAdmissionPorts {
  nowUtc: () => string;
  readApprovedBytes: () => Promise<
    RootRead<z.infer<typeof approvalReadSchema>>
  >;
  observeDeployment: (
    phase: 'ADMIT' | 'RECHECK',
  ) => Promise<RootRead<DeploymentWitness>>;
  verifyLocalPredecessor: () => Promise<RootRead<LocalWitness>>;
  verifyProtectedMerge: () => Promise<RootRead<MergeWitness>>;
  reserveOnce: (
    binding: ReadonlyDeep<ReservationBinding>,
  ) => Promise<{ status: 'RESERVED' | 'ALREADY_RESERVED' | 'UNKNOWN' }>;
}
declare const opaque: unique symbol;
export interface OpaqueReservation {
  readonly [opaque]: true;
}
export type SafeReservationView = ReadonlyDeep<{
  executionAuthority: 'NONE';
  state: 'RESERVED';
  binding: ReservationBinding;
}>;
export const admissionFailureSchema = z.enum([
  'PORT_THROW',
  'UNKNOWN',
  'PARTIAL',
  'NOT_FOUND',
  'SHAPE',
  'WINDOW',
  'CLOCK',
  'PREDECESSOR',
  'SOURCE',
  'CONFIG',
  'DRIFT',
  'ALREADY_RESERVED',
  'RESERVATION_UNKNOWN',
  'REUSED',
  'OPAQUE',
]);
