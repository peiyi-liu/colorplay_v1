import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import {
  capacityFailure,
  requireCapacityScope,
  type CapacityScope,
} from './capacity-scope';
import {
  capacityManifestHash,
  validateCapacityManifest,
  type CapacityManifest,
} from './capacity-manifest';
const registrationEmail = (planId: string, alias: string, account: string) => {
  const cohort = /^REG(40|60)_[0-9]{2}$/u.exec(alias)?.[1] ?? capacityFailure();
  return `${planId}.reg${cohort}.${account}@colorplay.test`;
};
export const capacityPrivateActorSchema = z.strictObject({
  alias: z.string().regex(/^(T1|T2|S1|S2|A1|R1|REG(?:40|60)_[0-9]{2})$/u),
  account: z.string().regex(/^[a-z0-9]{3,20}$/u),
  email: z.email().max(254).endsWith('@colorplay.test'),
  password: z.string().min(6).max(128),
  displayName: z.string().min(2).max(40),
  userId: z.uuid().nullable(),
  role: z.enum(['student', 'teacher', 'admin']),
});
export type CapacityPrivateActor = z.infer<typeof capacityPrivateActorSchema>;
export const capacityPrivatePlanSchema = z.strictObject({
  schemaVersion: z.literal(1),
  planId: z.string(),
  sourceRevision: z.string().regex(/^[a-f0-9]{40}$/u),
  manifestSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  functionalRunId: z.string(),
  actors: z.array(capacityPrivateActorSchema).length(106),
  registrationCreation: z.literal('TRUE_UI_OTP_ONLY'),
  retention: z.literal('ALL_OWNED_AUTH_PROFILE_LEDGER_MEDIA_AUDIT_RETAINED'),
});
export type CapacityPrivatePlan = z.infer<typeof capacityPrivatePlanSchema>;
export const validateCapacityPrivatePlan = (
  input: unknown,
  scope: CapacityScope,
  manifest: CapacityManifest,
): CapacityPrivatePlan => {
  try {
    requireCapacityScope(scope);
    validateCapacityManifest(manifest, scope);
    const p = capacityPrivatePlanSchema.parse(input);
    if (
      p.planId !== scope.planId ||
      p.sourceRevision !== scope.sourceRevision ||
      p.functionalRunId !== scope.functionalRunId ||
      p.manifestSha256 !== capacityManifestHash(manifest) ||
      JSON.stringify(p.actors.map((a) => a.alias)) !==
        JSON.stringify(manifest.identities)
    )
      return capacityFailure();
    for (const field of ['account', 'email'] as const)
      if (new Set(p.actors.map((a) => a[field])).size !== 106)
        return capacityFailure();
    const ids = p.actors.slice(0, 6).map((a) => a.userId);
    if (ids.some((id) => id === null) || new Set(ids).size !== 6)
      return capacityFailure();
    for (const [i, a] of p.actors.entries()) {
      const role =
        a.alias === 'A1'
          ? 'admin'
          : a.alias.startsWith('T')
            ? 'teacher'
            : 'student';
      if (
        a.role !== role ||
        (i >= 6 &&
          (a.userId !== null ||
            a.email !== registrationEmail(scope.planId, a.alias, a.account) ||
            !/(?=.*[A-Z])(?=.*[a-z])^[A-Za-z0-9_-]{6,12}$/u.test(a.password)))
      )
        return capacityFailure();
    }
    return p;
  } catch {
    return capacityFailure();
  }
};
export const createCapacityPrivatePlan = (
  scope: CapacityScope,
  manifest: CapacityManifest,
  functional: readonly unknown[],
): CapacityPrivatePlan => {
  try {
    requireCapacityScope(scope);
    validateCapacityManifest(manifest, scope);
    if (functional.length !== 6) return capacityFailure();
    const original = functional.map((a) => capacityPrivateActorSchema.parse(a));
    const actors = [
      ...original,
      ...manifest.identities.slice(6).map((alias) => {
        const account = `wb${randomBytes(8).toString('hex')}`;
        return {
          alias,
          account,
          email: registrationEmail(scope.planId, alias, account),
          password: `Aa1${randomBytes(6).toString('base64url')}`,
          displayName: `負載${alias}`,
          userId: null,
          role: 'student' as const,
        };
      }),
    ];
    return validateCapacityPrivatePlan(
      {
        schemaVersion: 1,
        planId: scope.planId,
        sourceRevision: scope.sourceRevision,
        manifestSha256: capacityManifestHash(manifest),
        functionalRunId: scope.functionalRunId,
        actors,
        registrationCreation: 'TRUE_UI_OTP_ONLY',
        retention: manifest.retention,
      },
      scope,
      manifest,
    );
  } catch {
    return capacityFailure();
  }
};

export const resolveCapacitySubjects = (
  plan: CapacityPrivatePlan,
  aliases: readonly string[],
  subjects: readonly {
    alias: string;
    userId: string;
    role: 'student' | 'teacher' | 'admin';
    loginAccount: string;
  }[],
) =>
  aliases.map((alias) => {
    const planned = plan.actors.find((actor) => actor.alias === alias),
      actual = subjects.find((actor) => actor.alias === alias);
    if (
      !planned ||
      planned.role !== actual?.role ||
      planned.account !== actual.loginAccount ||
      (planned.userId !== null && planned.userId !== actual.userId)
    )
      return capacityFailure();
    try {
      return {
        ...capacityPrivateActorSchema.parse({
          ...planned,
          userId: actual.userId,
        }),
        userId: actual.userId,
      };
    } catch {
      return capacityFailure();
    }
  });
