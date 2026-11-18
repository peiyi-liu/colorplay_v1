import { types } from 'node:util';
import { z } from 'zod';
import {
  admissionSha,
  admissionUtc,
  deploymentWitnessSchema,
  localWitnessSchema,
  mergeWitnessSchema,
  type ReservationBinding,
  type RootAdmissionPorts,
} from './hosted-admission-contracts';
import { hostedTargetSchema } from './hosted-provenance';
import { parsePrivateEvidenceJson } from './hosted-private-evidence';

export const nonceRecordBytes = 131072;
const marker = z.string().regex(/^[a-z][a-z0-9-]{7,79}$/u);
const actor = z.strictObject({
  alias: z.string().regex(/^[A-Z][A-Z0-9_]{0,23}$/u),
  role: z.enum(['anonymous', 'student', 'teacher']),
});
// Exact storage shape of the existing ReservationBinding; no authority validator.
const scope = hostedTargetSchema
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
    registrationCoordinator: actor
      .extend({ role: z.literal('teacher') })
      .nullable(),
    outsider: actor.extend({ role: z.literal('student') }).nullable(),
    plannedNewIdentities: z.number().int().min(0).max(1000),
    cumulativeFixtureCount: z.number().int().min(0).max(1000),
  })
  .strict();
export const nonceBindingSchema = z.strictObject({
  approvalSha256: admissionSha,
  nonceSha256: admissionSha,
  expiresAt: admissionUtc,
  scope,
  deployment: z.strictObject({
    target: hostedTargetSchema,
    edgeManifestSha256: admissionSha,
    migrationManifestSha256: admissionSha,
    evidenceSha256: admissionSha,
    runIdentity: deploymentWitnessSchema.shape.runIdentity.omit({
      state: true,
    }),
    controlledMail: deploymentWitnessSchema.shape.controlledMail
      .unwrap()
      .omit({ checkedAtUtc: true })
      .nullable(),
    sourceProofSha256: admissionSha.nullable(),
  }),
  predecessor: localWitnessSchema.omit({ checkedAtUtc: true }),
  sourceProof: mergeWitnessSchema.omit({ checkedAtUtc: true }).nullable(),
}) satisfies z.ZodType<ReservationBinding>;
export const nonceInputSchema = z.strictObject({
  storeRoot: z.string().min(1).max(4096),
  nonceSha256: admissionSha,
  approvalSha256: admissionSha,
});
export type RootNonceInput = z.infer<typeof nonceInputSchema>;
export type RootNonceOpen =
  | {
      status: 'READY';
      executionAuthority: 'NONE';
      reserveOnce: RootAdmissionPorts['reserveOnce'];
    }
  | { status: 'UNKNOWN' | 'ALREADY_RESERVED'; executionAuthority: 'NONE' };
export const nonceArmSchema = z.strictObject({
  schemaVersion: z.literal(1),
  kind: z.literal('ROOT_NONCE_ATTEMPT'),
  authority: z.literal('NON_AUTHORITY'),
  nonceSha256: admissionSha,
  approvalSha256: admissionSha,
});
export const nonceReservationSchema = z.strictObject({
  schemaVersion: z.literal(1),
  kind: z.literal('ROOT_NONCE_RESERVATION'),
  authority: z.literal('NON_AUTHORITY'),
  binding: nonceBindingSchema,
});
const invalid = (): never => {
  throw Error('ROOT_NONCE_INVALID');
};
/** Check descriptors before parsers/serialization, never invoke a getter or Proxy. */
export const assertNonceData = (value: unknown): void => {
  let nodes = 0;
  const seen = new Set<object>();
  const visit = (v: unknown, depth: number): void => {
    if (++nodes > 20000 || depth > 48) invalid();
    if (typeof v === 'string' && Buffer.byteLength(v) > nonceRecordBytes)
      invalid();
    if (v === null) return;
    if (typeof v !== 'object') {
      if (
        typeof v === 'string' ||
        typeof v === 'boolean' ||
        (typeof v === 'number' && Number.isFinite(v))
      )
        return;
      return invalid();
    }
    if (types.isProxy(v) || seen.has(v)) invalid();
    seen.add(v);
    const proto: unknown = Object.getPrototypeOf(v);
    if (
      proto !== null &&
      proto !== Object.prototype &&
      proto !== Array.prototype
    )
      invalid();
    for (const key of Reflect.ownKeys(v)) {
      if (Array.isArray(v) && key === 'length') continue;
      const d = Object.getOwnPropertyDescriptor(v, key);
      if (typeof key !== 'string' || !d || !('value' in d) || !d.enumerable)
        return invalid();
      visit(d.value, depth + 1);
    }
    seen.delete(v);
  };
  visit(value, 0);
};
export const encodeNonceRecord = (value: unknown): Buffer => {
  assertNonceData(value);
  const raw = Buffer.from(JSON.stringify(value) + '\n');
  if (raw.length > nonceRecordBytes) invalid();
  return raw;
};
export const decodeNonceRecord = (raw: Buffer): unknown => {
  if (raw.length === 0 || raw.length > nonceRecordBytes) invalid();
  const text = raw.toString('utf8');
  if (!Buffer.from(text).equals(raw)) invalid();
  return parsePrivateEvidenceJson(text);
};
