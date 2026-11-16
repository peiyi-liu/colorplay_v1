import { performance } from 'node:perf_hooks';
import { z } from 'zod';
import { errors } from '@playwright/test';
import { fail, FunctionalError, functionalFailureCode } from './config';
import { mailboxDiagnosticSchema } from './mailpit';
import type { PrivateJournal } from './private-journal';
const phaseSchema = z.enum([
  'mailbox_baseline',
  'hud_signout',
  'recovery_request',
  'recovery_mail',
  'verify_handoff',
  'reset_form',
  'password_update',
  'new_login',
]);
type RecoveryPhase = z.infer<typeof phaseSchema>;
const codeSchema = z.enum([
  'FUNCTIONAL_SCOPE_INVALID',
  'FUNCTIONAL_OWNERSHIP_INVALID',
  'FUNCTIONAL_PREFLIGHT_FAILED',
  'FUNCTIONAL_OPERATION_FAILED',
  'FUNCTIONAL_AUTH_FAILED',
  'FUNCTIONAL_MAIL_FAILED',
  'FUNCTIONAL_RECOVERY_INVALID',
  'FUNCTIONAL_BROWSER_FAILED',
  'FUNCTIONAL_STUDENT_FAILED',
  'FUNCTIONAL_FIXTURE_FAILED',
  'FUNCTIONAL_ABORTED',
]);
export const recoveryCheckpointSchema = z.strictObject({
  schemaVersion: z.literal(1),
  phase: phaseSchema,
  status: z.enum(['started', 'confirmed', 'failed']),
  sequence: z.number().int().min(1).max(16),
  elapsedMs: z.number().nonnegative().nullable(),
  code: codeSchema.nullable(),
});
export const createRecoveryDiagnostics = (
  journal: PrivateJournal,
  signal: AbortSignal,
  now: () => number = () => performance.now(),
) => {
  const isAborted = () => signal.aborted;
  const seen = new Set<RecoveryPhase>();
  let sequence = 0;
  return {
    step: async <T>(
      phase: RecoveryPhase,
      operation: () => Promise<T>,
    ): Promise<T> => {
      if (isAborted()) return fail('FUNCTIONAL_ABORTED');
      if (!phaseSchema.safeParse(phase).success || seen.has(phase))
        return fail('FUNCTIONAL_OWNERSHIP_INVALID');
      seen.add(phase);
      const started = now();
      const write = async (
        status: 'started' | 'confirmed' | 'failed',
        code: z.infer<typeof codeSchema> | null = null,
      ) => {
        const value = recoveryCheckpointSchema.parse({
          schemaVersion: 1,
          phase,
          status,
          sequence: ++sequence,
          elapsedMs: status === 'started' ? null : Math.max(0, now() - started),
          code,
        });
        await journal.write(
          `recovery-${phase.replaceAll('_', '-')}-${status}`,
          value,
        );
      };
      await write('started').catch(() => fail('FUNCTIONAL_OWNERSHIP_INVALID'));
      let result: T;
      try {
        if (isAborted()) return fail('FUNCTIONAL_ABORTED');
        result = await operation();
        if (isAborted()) return fail('FUNCTIONAL_ABORTED');
      } catch (error) {
        const code = isAborted()
          ? 'FUNCTIONAL_ABORTED'
          : functionalFailureCode(error);
        await write('failed', code).catch(() => undefined);
        return fail(code);
      }
      await write('confirmed').catch(() =>
        fail('FUNCTIONAL_OWNERSHIP_INVALID'),
      );
      if (isAborted()) return fail('FUNCTIONAL_ABORTED');
      return result;
    },
  };
};
const healthSchema = z.strictObject({
  available: z.boolean(),
  expectedMediaDrops: z.number().int().nonnegative(),
  expectedRefreshRejections: z.number().int().nonnegative(),
  unexpectedErrors: z.number().int().nonnegative(),
});
export const captureFunctionalHealth = (health: {
  snapshot: () => unknown;
}) => {
  try {
    return {
      collection: 'OBSERVED' as const,
      ...healthSchema.parse(health.snapshot()),
    };
  } catch {
    return {
      collection: 'UNAVAILABLE' as const,
      available: null,
      expectedMediaDrops: null,
      expectedRefreshRejections: null,
      unexpectedErrors: null,
    };
  }
};

export const registrationPhases = [
  'mailbox_baseline',
  'registration_intent',
  'register_form',
  'basic_details',
  'otp_send_action',
  'otp_mail',
  'otp_verify',
  'credential_fields',
  'completion_observation',
  'complete_submit',
  'post_registration_login',
  'session_readback',
  'profile_membership',
  'registration_publication',
] as const;
const registrationPhase = z.enum(registrationPhases);
const errorType = (value: unknown, aborted: boolean) => {
  try {
    if (aborted) return 'ABORTED' as const;
    if (value instanceof FunctionalError) return 'FUNCTIONAL' as const;
    if (value instanceof errors.TimeoutError)
      return 'PLAYWRIGHT_TIMEOUT' as const;
    if (value instanceof z.ZodError) return 'SCHEMA' as const;
    if (value instanceof Error) return 'ERROR' as const;
    return value === null ||
      (typeof value !== 'object' && typeof value !== 'function')
      ? ('NON_ERROR' as const)
      : ('UNKNOWN' as const);
  } catch {
    return 'UNKNOWN' as const;
  }
};
export const registrationCheckpointSchema = z.strictObject({
  schemaVersion: z.literal(1),
  phase: registrationPhase,
  status: z.enum(['started', 'confirmed', 'failed']),
  sequence: z.number().int().min(1).max(28),
  elapsedMs: z.number().nonnegative().nullable(),
  code: codeSchema.nullable(),
  errorType: z
    .enum([
      'FUNCTIONAL',
      'PLAYWRIGHT_TIMEOUT',
      'SCHEMA',
      'ABORTED',
      'ERROR',
      'NON_ERROR',
      'UNKNOWN',
    ])
    .nullable(),
  mail: mailboxDiagnosticSchema.nullable(),
});
export const createRegistrationDiagnostics = (
  journal: PrivateJournal,
  signal: AbortSignal,
  options: { now?: () => number; mail?: () => unknown } = {},
) => {
  const now = options.now ?? (() => performance.now());
  const isAborted = () => signal.aborted;
  const check = () => {
    signal.throwIfAborted();
  };
  const action = async <T>(operation: () => Promise<T>): Promise<T> => {
    check();
    const result = await operation();
    check();
    return result;
  };
  const seen = new Set<z.infer<typeof registrationPhase>>();
  let sequence = 0;
  const mail = () => {
    try {
      const value: unknown = options.mail?.();
      if (typeof value !== 'object' || value === null) return null;
      const descriptors = Object.getOwnPropertyDescriptors(value);
      if (Object.values(descriptors).some((row) => !('value' in row)))
        return null;
      const fields = Object.fromEntries(
        Object.entries(descriptors).map(([key, row]) => [key, row.value]),
      );
      if (
        Object.values(fields).some(
          (value) =>
            value !== null &&
            (typeof value === 'object' || typeof value === 'function'),
        )
      )
        return null;
      return mailboxDiagnosticSchema.parse(fields);
    } catch {
      return null;
    }
  };
  return {
    check,
    action,
    step: async <T>(
      phase: z.infer<typeof registrationPhase>,
      operation: () => Promise<T>,
    ): Promise<T> => {
      if (isAborted()) return fail('FUNCTIONAL_ABORTED');
      if (!registrationPhase.safeParse(phase).success || seen.has(phase))
        return fail('FUNCTIONAL_OWNERSHIP_INVALID');
      seen.add(phase);
      const began = now();
      const write = async (
        status: 'started' | 'confirmed' | 'failed',
        error?: unknown,
      ) => {
        await journal.write(
          `registration-${phase.replaceAll('_', '-')}-${status}`,
          registrationCheckpointSchema.parse({
            schemaVersion: 1,
            phase,
            status,
            sequence: ++sequence,
            elapsedMs: status === 'started' ? null : Math.max(0, now() - began),
            code:
              status === 'failed'
                ? signal.aborted
                  ? 'FUNCTIONAL_ABORTED'
                  : functionalFailureCode(error)
                : null,
            errorType:
              status === 'failed' ? errorType(error, signal.aborted) : null,
            mail: status === 'started' ? null : mail(),
          }),
        );
      };
      await write('started').catch(() => fail('FUNCTIONAL_OWNERSHIP_INVALID'));
      let result: T;
      try {
        signal.throwIfAborted();
        result = await operation();
        signal.throwIfAborted();
      } catch (error) {
        await write('failed', error).catch(() => undefined);
        throw error;
      }
      await write('confirmed').catch(() =>
        fail('FUNCTIONAL_OWNERSHIP_INVALID'),
      );
      if (isAborted()) return fail('FUNCTIONAL_ABORTED');
      return result;
    },
  };
};
