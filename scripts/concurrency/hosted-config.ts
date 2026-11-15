import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import {
  hostedTargetSchema,
  hostedPredecessorSchema,
  hostedSourceProofSchema,
  trustedHostedSourceProofSchema,
  assertHostedSourceProof,
} from './hosted-provenance';

const sha = z.string().regex(/^[a-f0-9]{64}$/u);
const utc = z.iso.datetime({ offset: true }).max(40);
const marker = z.string().regex(/^[a-z][a-z0-9-]{7,79}$/u);
const alias = z.string().regex(/^[A-Z][A-Z0-9_]{0,23}$/u);
const actor = z
  .object({ alias, role: z.enum(['anonymous', 'student', 'teacher']) })
  .strict();
const teacher = z.object({ alias, role: z.literal('teacher') }).strict();
const outsider = z.object({ alias, role: z.literal('student') }).strict();
const target = hostedTargetSchema;
const scopeSchema = target
  .extend({
    runId: marker,
    planId: marker,
    fixtureMarker: marker,
    scenario: z.enum([
      'anonymous_entry_prepare',
      'fresh_registration',
      'existing_login_game',
      'backend_game',
    ]),
    measuredCount: z.union([
      z.literal(3),
      z.literal(10),
      z.literal(20),
      z.literal(40),
      z.literal(60),
    ]),
    actors: z.array(actor).min(3).max(60),
    registrationCoordinator: teacher.nullable(),
    outsider: outsider.nullable(),
    plannedNewIdentities: z.number().int().min(0).max(1000),
    cumulativeFixtureCount: z.number().int().min(0).max(1000),
  })
  .strict();
const predecessor = hostedPredecessorSchema;
const runIdentity = z
  .object({
    runId: marker,
    planId: marker,
    fixtureMarker: marker,
    nonceSha256: sha,
  })
  .strict();
const mail = z
  .object({
    capability: z.literal('REAL_MAIL_CONTROLLED_INBOX'),
    controlledInboxSha256: sha,
    sendPermission: z.literal('OWNER_APPROVED'),
  })
  .strict();
const policy = z
  .object({
    immutableRetention: z.literal('RETAIN_LEDGER_MEDIA_AUDIT'),
    maxRetainedIdentities: z.number().int().min(0).max(1000),
    cleanup: z
      .array(
        z
          .object({
            category: z.enum([
              'owned_browser_contexts',
              'private_credential_temps',
              'owned_mutable_drafts',
              'owned_aborted_quarantine',
              'owned_auth_sessions',
            ]),
            maximumCount: z.number().int().min(1).max(1000),
          })
          .strict(),
      )
      .min(1)
      .max(5),
  })
  .strict();
const approvalSchema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.literal('ROOT_HOSTED_APPROVAL'),
    scope: scopeSchema,
    window: z.object({ notBefore: utc, expiresAt: utc }).strict(),
    dataPolicy: policy,
    mail: mail.nullable(),
    predecessor,
    sourceProof: hostedSourceProofSchema,
    rootRun: runIdentity,
  })
  .strict();
const trustedSchema = z
  .object({
    approvalBytes: z.string().min(1).max(131072),
    expectedApprovalSha256: sha,
    nowUtc: utc,
    sourceProof: trustedHostedSourceProofSchema,
    observed: target.extend({ observedAtUtc: utc }).strict(),
    predecessorAuthorization: predecessor
      .extend({ checkedAtUtc: utc })
      .strict(),
    runIdentity: runIdentity
      .extend({ state: z.enum(['UNUSED', 'RESERVED', 'USED']) })
      .strict(),
    controlledMail: mail.extend({ checkedAtUtc: utc }).strict().nullable(),
  })
  .strict();
const validated = Symbol('VALIDATED_HOSTED_CONFIGURATION_ONLY');
type DeepReadonly<T> = T extends object
  ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
  : T;
export interface ValidatedHostedConfig {
  readonly [validated]: true;
  readonly config: DeepReadonly<z.infer<typeof scopeSchema>>;
  readonly dataPolicy: DeepReadonly<z.infer<typeof policy>>;
  readonly window: Readonly<{ notBefore: string; expiresAt: string }>;
  readonly approvalSha256: string;
  readonly predecessor: DeepReadonly<z.infer<typeof predecessor>>;
  readonly sourceProvenance: DeepReadonly<
    z.infer<typeof hostedSourceProofSchema>
  >;
  readonly executionAuthority: 'NONE';
  readonly runReservation: 'REQUIRED_BEFORE_EFFECT';
  readonly remoteFreshness: 'ROOT_OPERATOR_REQUIRED';
  readonly predecessorVerification: 'ROOT_ADAPTER_RESPONSIBILITY';
  readonly authPermission: 'NONE' | 'SCENARIO_ONLY';
  readonly mailSending: 'NONE' | 'CONTROLLED_INBOX_ONLY';
}
const reject = (): never => {
  throw new Error('HOSTED_CONFIG_REJECTED');
};
const freeze = (value: unknown): void => {
  if (typeof value !== 'object' || value === null) return;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
};
const timestamp = (value: string) => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : reject();
};
const assertActors = (scope: z.infer<typeof scopeSchema>) => {
  const {
    actors,
    registrationCoordinator: coordinator,
    outsider: other,
  } = scope;
  if (actors.length !== scope.measuredCount) reject();
  const aliases = [
    ...actors.map((item) => item.alias),
    ...(coordinator ? [coordinator.alias] : []),
    ...(other ? [other.alias] : []),
  ];
  if (new Set(aliases).size !== aliases.length) reject();
  if (scope.scenario === 'anonymous_entry_prepare') {
    if (
      ![3, 10, 20].includes(scope.measuredCount) ||
      actors.some((item) => item.role !== 'anonymous') ||
      coordinator ||
      other ||
      scope.plannedNewIdentities !== 0
    )
      reject();
    return;
  }
  if (!other || scope.cumulativeFixtureCount < aliases.length) reject();
  if (scope.scenario === 'fresh_registration') {
    if (
      ![40, 60].includes(scope.measuredCount) ||
      !coordinator ||
      actors.some((item) => item.role !== 'student') ||
      scope.plannedNewIdentities !== scope.measuredCount
    )
      reject();
  } else if (
    coordinator ||
    scope.plannedNewIdentities !== 0 ||
    actors.filter((item) => item.role === 'teacher').length !== 1 ||
    actors.some((item) => item.role === 'anonymous')
  )
    reject();
};

/** Pure configuration validation only. `trustedInput` must come from an independent
 * root adapter, never the caller/request/environment. This checks pinned approval
 * bytes and supplied bindings; it neither verifies remote freshness/Local receipt
 * chains nor atomically consumes a nonce. The root operator must do all three.
 */
export const validateHostedConfig = (
  request: unknown,
  trustedInput: unknown,
): ValidatedHostedConfig => {
  try {
    const trusted = trustedSchema.parse(trustedInput);
    if (Buffer.byteLength(trusted.approvalBytes) > 131072) reject();
    const actualSha = createHash('sha256')
      .update(trusted.approvalBytes)
      .digest('hex');
    if (actualSha !== trusted.expectedApprovalSha256) reject();
    const approval = approvalSchema.parse(JSON.parse(trusted.approvalBytes));
    const scope = scopeSchema.parse(request);
    if (
      !isDeepStrictEqual(scope, approval.scope) ||
      scope.sourceRevision !== scope.webRevision
    )
      reject();
    const { observedAtUtc, ...observed } = trusted.observed;
    if (
      !isDeepStrictEqual(
        {
          environment: scope.environment,
          projectRef: scope.projectRef,
          supabaseOrigin: scope.supabaseOrigin,
          appOrigin: scope.appOrigin,
          sourceRevision: scope.sourceRevision,
          webRevision: scope.webRevision,
          fingerprints: scope.fingerprints,
        },
        observed,
      )
    )
      reject();
    const { checkedAtUtc, ...authorizedPredecessor } =
      trusted.predecessorAuthorization;
    if (!isDeepStrictEqual(authorizedPredecessor, approval.predecessor))
      reject();
    const { state, ...run } = trusted.runIdentity;
    if (
      state !== 'UNUSED' ||
      !isDeepStrictEqual(run, approval.rootRun) ||
      run.runId !== scope.runId ||
      run.planId !== scope.planId ||
      run.fixtureMarker !== scope.fixtureMarker
    )
      reject();
    const now = timestamp(trusted.nowUtc);
    const from = timestamp(approval.window.notBefore);
    const until = timestamp(approval.window.expiresAt);
    const observedAt = timestamp(observedAtUtc);
    if (
      until <= from ||
      until - from > 86_400_000 ||
      now < from ||
      now >= until ||
      observedAt < from ||
      observedAt > now ||
      timestamp(checkedAtUtc) > now
    )
      reject();
    assertHostedSourceProof(
      approval.sourceProof,
      trusted.sourceProof,
      observed,
      authorizedPredecessor,
      approval.window,
      trusted.nowUtc,
    );
    assertActors(scope);
    if (
      scope.cumulativeFixtureCount >
        approval.dataPolicy.maxRetainedIdentities ||
      new Set(approval.dataPolicy.cleanup.map((item) => item.category)).size !==
        approval.dataPolicy.cleanup.length
    )
      reject();
    if (scope.scenario === 'fresh_registration') {
      if (!approval.mail || !trusted.controlledMail) return reject();
      const { checkedAtUtc: mailTime, ...controlled } = trusted.controlledMail;
      if (
        !isDeepStrictEqual(controlled, approval.mail) ||
        timestamp(mailTime) < from ||
        timestamp(mailTime) > now
      )
        reject();
    } else if (approval.mail || trusted.controlledMail) reject();
    const result: ValidatedHostedConfig = {
      [validated]: true,
      config: scope,
      dataPolicy: approval.dataPolicy,
      window: {
        notBefore: new Date(from).toISOString(),
        expiresAt: new Date(until).toISOString(),
      },
      approvalSha256: actualSha,
      predecessor: approval.predecessor,
      sourceProvenance: approval.sourceProof,
      executionAuthority: 'NONE',
      runReservation: 'REQUIRED_BEFORE_EFFECT',
      remoteFreshness: 'ROOT_OPERATOR_REQUIRED',
      predecessorVerification: 'ROOT_ADAPTER_RESPONSIBILITY',
      authPermission:
        scope.scenario === 'anonymous_entry_prepare' ? 'NONE' : 'SCENARIO_ONLY',
      mailSending:
        scope.scenario === 'fresh_registration'
          ? 'CONTROLLED_INBOX_ONLY'
          : 'NONE',
    };
    freeze(result);
    return result;
  } catch {
    return reject();
  }
};
