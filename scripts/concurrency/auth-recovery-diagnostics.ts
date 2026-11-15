import { performance } from 'node:perf_hooks';
import { z } from 'zod';
import { fail, functionalFailureCode } from './config';
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
