import { z } from 'zod';
import { capacityFailure } from './capacity-scope';
import type { CapacityScope } from './capacity-scope';
export interface CapacityPrivateRegistrationActor {
  actorIndex: number;
  alias: string;
  email: string;
  account: string;
  password: string;
  fullName: string;
  nickname: string;
}
export interface CapacityRegistrationOwnershipInput {
  scope: CapacityScope;
  legId: string;
  cohortSize: 40 | 60;
  classroomId: string;
  freshProofSha256: string;
  checkedAtDatabaseUtc: string;
  actor: CapacityPrivateRegistrationActor;
  sendIntentName: string | null;
  sendIntentAtUtc: string | null;
  verifiedSubject: string | null;
  stage: 'before_send' | 'after_verify' | 'completed' | 'partial_failure';
}
export interface CapacityRegistrationOwnershipProof {
  ownership: 'NO_AUTH' | 'OWNED_BY_OTP_INTENT' | 'UNKNOWN';
  authUserId: string | null;
  authCreatedAtUtc: string | null;
  role: 'student' | null;
  loginAccount: string | null;
  registrationComplete: boolean | null;
  membershipConfirmed: boolean | null;
  databaseIdentitySha256: string;
  readOnlyProofSha256: string;
}
export interface CapacityRegistrationOracle {
  fresh: (input: {
    scope: CapacityScope;
    legId: string;
    cohortSize: 40 | 60;
    classroomId: string;
    actors: readonly CapacityPrivateRegistrationActor[];
  }) => Promise<{
    existingAliases: string[];
    unownedAuthCount: 0;
    cohortAbsent: true;
    checkedAtDatabaseUtc: string;
    databaseIdentitySha256: string;
    readOnlyProofSha256: string;
  }>;
  capture: (
    input: CapacityRegistrationOwnershipInput,
  ) => Promise<CapacityRegistrationOwnershipProof>;
}

const digest = z.string().regex(/^[a-f0-9]{64}$/u),
  utc = z.iso.datetime({ offset: true });
export const capacityRegistrationActorSchema = z.strictObject({
  actorIndex: z.number().int().min(0).max(59),
  alias: z.string().regex(/^REG(40|60)_[0-9]{2}$/u),
  email: z
    .string()
    .max(254)
    .regex(/^[a-z0-9.-]+@colorplay\.test$/u),
  account: z.string().regex(/^[a-z0-9]{3,20}$/u),
  password: z.string().min(6).max(12).regex(/[A-Z]/u).regex(/[a-z]/u),
  fullName: z.string().min(1).max(40),
  nickname: z.string().min(2).max(16),
});
export const capacityRegistrationFreshSchema = z.strictObject({
  existingAliases: z.array(z.string().max(30)).max(106),
  unownedAuthCount: z.literal(0),
  cohortAbsent: z.literal(true),
  checkedAtDatabaseUtc: utc,
  databaseIdentitySha256: digest,
  readOnlyProofSha256: digest,
});
export const capacityRegistrationOwnershipSchema = z.strictObject({
  ownership: z.enum(['NO_AUTH', 'OWNED_BY_OTP_INTENT', 'UNKNOWN']),
  authUserId: z.uuid().nullable(),
  authCreatedAtUtc: utc.nullable(),
  role: z.literal('student').nullable(),
  loginAccount: z
    .string()
    .regex(/^[a-z0-9]{3,20}$/u)
    .nullable(),
  registrationComplete: z.boolean().nullable(),
  membershipConfirmed: z.boolean().nullable(),
  databaseIdentitySha256: digest,
  readOnlyProofSha256: digest,
});
export const validateCapacityRegistrationOwnership = (
  input: CapacityRegistrationOwnershipInput,
  raw: unknown,
): CapacityRegistrationOwnershipProof => {
  const proof = capacityRegistrationOwnershipSchema.parse(raw);
  if (proof.databaseIdentitySha256 !== input.scope.databaseIdentitySha256)
    return capacityFailure();
  if (proof.ownership === 'UNKNOWN') {
    if (input.stage !== 'partial_failure') return capacityFailure();
    return proof;
  }
  if (proof.ownership === 'NO_AUTH') {
    if (
      !['before_send', 'partial_failure'].includes(input.stage) ||
      proof.authUserId !== null ||
      proof.authCreatedAtUtc !== null ||
      proof.role !== null ||
      proof.loginAccount !== null ||
      proof.registrationComplete === true ||
      proof.membershipConfirmed === true
    )
      return capacityFailure();
    return proof;
  }
  if (
    input.stage === 'before_send' ||
    !input.sendIntentName ||
    !input.sendIntentAtUtc ||
    !digest.safeParse(input.freshProofSha256).success ||
    !proof.authUserId ||
    !proof.authCreatedAtUtc ||
    proof.role !== 'student' ||
    Date.parse(proof.authCreatedAtUtc) <
      Date.parse(input.checkedAtDatabaseUtc) ||
    (input.verifiedSubject !== null &&
      proof.authUserId !== input.verifiedSubject)
  )
    return capacityFailure();
  if (
    input.stage === 'completed' &&
    (!input.verifiedSubject ||
      proof.registrationComplete !== true ||
      proof.membershipConfirmed !== true ||
      proof.loginAccount !== input.actor.account)
  )
    return capacityFailure();
  return proof;
};
// Root SQL/normal-subject readback only. This queue never schedules UI mutation.
export const createCapacityReadbackQueue = () => {
  let active = 0;
  const waiting: (() => void)[] = [];
  const pending = new Set<Promise<unknown>>();
  const run = <T>(operation: () => Promise<T>): Promise<T> => {
    let start: () => void = () => undefined;
    const task = new Promise<T>((resolve, reject) => {
      start = () => {
        active++;
        void Promise.resolve()
          .then(operation)
          .then(
            (value) => {
              active--;
              waiting.shift()?.();
              resolve(value);
            },
            () => {
              active--;
              waiting.shift()?.();
              reject(new Error('CAPACITY_EVIDENCE_INVALID'));
            },
          );
      };
    });
    pending.add(task);
    void task.then(
      () => {
        pending.delete(task);
      },
      () => {
        pending.delete(task);
      },
    );
    if (active < 4) start();
    else waiting.push(start);
    return task;
  };
  return {
    run,
    settle: () => Promise.allSettled([...pending]),
    snapshot: () => ({ active, queued: waiting.length, pending: pending.size }),
  };
};
