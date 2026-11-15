import { z } from 'zod';
import { fail, type FunctionalScope } from './config';
export const requiredProofs = {
  canonical_baseline: ['canonical_snapshot'],
  fixture_setup: ['five_owned_identities', 'admin_bootstrap'],
  classroom_setup: ['two_owned_classrooms', 'student_memberships'],
  registration_recovery: [
    'registration_ui',
    'recovery_ui',
    'old_password_denied',
  ],
  auth_controls: ['invalid_credentials_denied', 'reload_tabs_subject_wallet'],
  student_s1: [
    'review_progress',
    'quiz_finalize',
    'mastery',
    'purchase_replay_equip',
    'achievements_leaderboard',
    'ledger',
  ],
  student_s2: [
    'review_progress',
    'quiz_finalize',
    'remediation',
    'achievements_leaderboard',
    'ledger',
  ],
  teacher_reads: ['teacher_ui_classroom', 'members_progress_analytics'],
  tenant_denials: ['cross_tenant_denied'],
  live_finalized: [
    'live_ui_all_questions',
    'live_final_report',
    'live_outsider',
  ],
  admin_reads: ['admin_mfa_ui', 'admin_major_reads'],
  admin_denials: ['student_teacher_admin_denied'],
  media: [
    'mounted_single_happy',
    'mounted_single_critical_recovery',
    'mounted_single_cancel',
    'zip_recovery',
    'zip_cancel',
    'sql_storage_hashes',
  ],
  controlled_refresh: ['owned_refresh_rejected'],
  health: ['all_observers_available', 'zero_unexpected'],
} as const;
export type FunctionalStage = keyof typeof requiredProofs;
export const functionalStages = Object.keys(
  requiredProofs,
) as FunctionalStage[];
const count = z.number().int().nonnegative().max(1_000_000_000);
const counts = z.strictObject({
  identities: count.optional(),
  classrooms: count.optional(),
  students: count.optional(),
  cards: count.optional(),
  answers: count.optional(),
  correct: count.optional(),
  xp: count.optional(),
  tokens: count.optional(),
  mediaAssets: count.optional(),
  mediaVariants: count.optional(),
  drafts: count.optional(),
  questions: count.optional(),
  adminReads: count.optional(),
  expectedMediaDrops: count.optional(),
  unexpectedErrors: count.optional(),
});
const proof = z.strictObject({
  proofs: z.array(z.string().min(1).max(50)).max(12),
  counts,
});
export type FunctionalStageProof = z.infer<typeof proof>;
export const validateStageProof = (
  stage: FunctionalStage,
  value: unknown,
): FunctionalStageProof => {
  const parsed = proof.safeParse(value);
  const expected: readonly string[] = requiredProofs[stage];
  if (
    !parsed.success ||
    parsed.data.proofs.length !== expected.length ||
    new Set(parsed.data.proofs).size !== expected.length ||
    expected.some((name) => !parsed.data.proofs.includes(name))
  )
    return fail('FUNCTIONAL_OPERATION_FAILED');
  return parsed.data;
};
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const row = z.strictObject({
  stage: z.enum(functionalStages),
  status: z.enum(['not_run', 'running', 'pass', 'fail']),
  elapsedMs: z.number().nonnegative().nullable(),
  proof: proof.nullable(),
});
const cleanup = z.strictObject({
  status: z.enum(['not_run', 'verified', 'failed', 'unavailable']),
  resourcesClosed: z.boolean().nullable(),
  settled: z.boolean().nullable(),
});
export type FunctionalCleanup = z.infer<typeof cleanup>;
export const functionalReceiptSchema = z.strictObject({
  schemaVersion: z.literal(1),
  sourceRevision: z.string().regex(/^[a-f0-9]{40}$/u),
  artifactRevision: z.string().regex(/^[a-f0-9]{40}$/u),
  artifactSha256: digest,
  anonKeySha256: digest,
  serviceKeySha256: digest,
  environment: z.literal('local'),
  projectId: z.literal('cp-whole-site-261115'),
  runId: z.string().regex(/^wsb-[a-z0-9]{6,16}-[a-z0-9]{6,16}$/u),
  mode: z.literal('INTERCEPTED_FUNCTIONAL_CORRECTNESS'),
  databaseUrl: z.literal('postgresql://127.0.0.1:58322/postgres'),
  stages: z.array(row).length(functionalStages.length),
  cleanup,
  retention: z.literal(
    'OWNED_AUTH_PROFILE_CLASSES_LEDGER_MEDIA_DRAFTS_AUDIT_RETAINED',
  ),
  result: z.enum(['RUNNING', 'FAIL', 'INCONCLUSIVE', 'PASS']),
  failureStage: z
    .enum([...functionalStages, 'preflight', 'cleanup'])
    .nullable(),
  timedOut: z.boolean(),
  realDeviceProof: z.literal(false),
  nativeCapacityProof: z.literal(false),
  phaseAcceptance: z.literal(false),
});
export type FunctionalReceipt = z.infer<typeof functionalReceiptSchema>;
export const newFunctionalReceipt = (
  scope: FunctionalScope,
  artifactSha256: string,
): FunctionalReceipt =>
  functionalReceiptSchema.parse({
    schemaVersion: 1,
    sourceRevision: scope.expectedRevision,
    artifactRevision: scope.expectedRevision,
    artifactSha256,
    anonKeySha256: scope.anonKeySha256,
    serviceKeySha256: scope.serviceKeySha256,
    environment: 'local',
    projectId: scope.projectId,
    runId: scope.runId,
    mode: 'INTERCEPTED_FUNCTIONAL_CORRECTNESS',
    databaseUrl: 'postgresql://127.0.0.1:58322/postgres',
    stages: functionalStages.map((stage) => ({
      stage,
      status: 'not_run',
      elapsedMs: null,
      proof: null,
    })),
    cleanup: { status: 'not_run', resourcesClosed: null, settled: null },
    retention: 'OWNED_AUTH_PROFILE_CLASSES_LEDGER_MEDIA_DRAFTS_AUDIT_RETAINED',
    result: 'RUNNING',
    failureStage: null,
    timedOut: false,
    realDeviceProof: false,
    nativeCapacityProof: false,
    phaseAcceptance: false,
  });
export const finishFunctionalReceipt = (
  input: FunctionalReceipt,
): FunctionalReceipt => {
  const receipt = functionalReceiptSchema.parse(input);
  const complete = receipt.stages.every((entry, index) => {
    if (
      entry.stage !== functionalStages[index] ||
      entry.status !== 'pass' ||
      entry.proof === null
    )
      return false;
    try {
      validateStageProof(entry.stage, entry.proof);
      return true;
    } catch {
      return false;
    }
  });
  const closed =
    receipt.cleanup.status === 'verified' &&
    receipt.cleanup.resourcesClosed === true &&
    receipt.cleanup.settled === true;
  receipt.result =
    complete && closed && !receipt.timedOut && receipt.failureStage === null
      ? 'PASS'
      : receipt.timedOut || receipt.cleanup.status === 'unavailable'
        ? 'INCONCLUSIVE'
        : 'FAIL';
  return receipt;
};
