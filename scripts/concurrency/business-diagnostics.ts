import { performance } from 'node:perf_hooks';
import { z } from 'zod';
import { fail, functionalFailureCode } from './config';
import type { PrivateJournal } from './private-journal';
import { functionalStages, type FunctionalStage } from './functional-receipt';
import { captureFunctionalHealth } from './auth-recovery-diagnostics';
const steps = z.enum([
  'chapter',
  'review',
  'formal_quiz',
  'remediation',
  'mastery',
  'purchase',
  'achievements',
  'ledger',
]);
const codes = z.enum([
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
const count = z.number().int().nonnegative();
const healthSchema = z.strictObject({
  collection: z.enum(['OBSERVED', 'UNAVAILABLE']),
  available: z.boolean().nullable(),
  expectedMediaDrops: count.nullable(),
  expectedRefreshRejections: count.nullable(),
  unexpectedErrors: count.nullable(),
});
const authSchema = z.strictObject({
  approvedPopupStaticGaps: count,
  expectedLogoutAborts: count,
  expectedRevokedLogouts: count,
  unresolvedLogoutDeclarations: count,
});
const observationSchema = z.strictObject({
  settled: z.boolean(),
  health: healthSchema,
  auth: authSchema.nullable(),
});
export const businessCheckpointSchema = z.strictObject({
  schemaVersion: z.literal(1),
  step: steps,
  status: z.enum(['started', 'confirmed', 'failed']),
  sequence: z.number().int().min(1).max(16),
  elapsedMs: z.number().nonnegative().nullable(),
  code: codes.nullable(),
  observation: observationSchema.nullable(),
});
export const businessStageHealthSchema = z.strictObject({
  schemaVersion: z.literal(1),
  stage: z.enum(functionalStages),
  outcome: z.enum(['confirmed', 'failed']),
  code: codes.nullable(),
  settled: z.boolean(),
  health: healthSchema,
  auth: authSchema.nullable(),
});
export const createBusinessDiagnostics = (
  journal: PrivateJournal,
  signal?: AbortSignal,
  now: () => number = () => performance.now(),
  health?: BusinessHealthPort,
) => {
  const seen = new Set<string>();
  let sequence = 0;
  const aborted = () => signal?.aborted === true;
  return {
    step: async <T>(
      step: z.infer<typeof steps>,
      operation: () => Promise<T>,
    ): Promise<T> => {
      if (aborted()) return fail('FUNCTIONAL_ABORTED');
      if (!steps.safeParse(step).success || seen.has(step))
        return fail('FUNCTIONAL_OWNERSHIP_INVALID');
      seen.add(step);
      const started = now();
      let elapsedMs: number | null = null;
      let observation: z.infer<typeof observationSchema> | null = null;
      const collect = async () => {
        if (health)
          observation = await collectHealth(
            health,
            signal ?? new AbortController().signal,
          );
      };
      const write = async (
        status: 'started' | 'confirmed' | 'failed',
        code: z.infer<typeof codes> | null = null,
      ) => {
        await journal.write(
          `business-${step.replaceAll('_', '-')}-${status}`,
          businessCheckpointSchema.parse({
            schemaVersion: 1,
            step,
            status,
            sequence: ++sequence,
            elapsedMs: status === 'started' ? null : elapsedMs,
            code,
            observation,
          }),
        );
      };
      await write('started').catch(() => fail('FUNCTIONAL_OWNERSHIP_INVALID'));
      let value: T;
      try {
        if (aborted()) return fail('FUNCTIONAL_ABORTED');
        value = await operation();
        elapsedMs = Math.max(0, now() - started);
        if (aborted()) return fail('FUNCTIONAL_ABORTED');
      } catch (error) {
        elapsedMs ??= Math.max(0, now() - started);
        await collect();
        await write('failed', functionalFailureCode(error)).catch(
          () => undefined,
        );
        throw error;
      }
      await collect();
      if (aborted()) {
        await write('failed', 'FUNCTIONAL_ABORTED').catch(() => undefined);
        return fail('FUNCTIONAL_ABORTED');
      }
      await write('confirmed').catch(() =>
        fail('FUNCTIONAL_OWNERSHIP_INVALID'),
      );
      if (aborted()) return fail('FUNCTIONAL_ABORTED');
      return value;
    },
  };
};
export interface BusinessHealthPort {
  settle(): Promise<void>;
  snapshot(): unknown;
  authDiagnostics(): unknown;
}
const settleHealth = async (
  health: BusinessHealthPort,
  signal: AbortSignal,
) => {
  let cancel: () => void = () => undefined;
  const cancelled = new Promise<false>((resolve) => {
    cancel = () => {
      resolve(false);
    };
  });
  signal.addEventListener('abort', cancel, { once: true });
  if (signal.aborted) cancel();
  try {
    return await Promise.race([
      Promise.resolve()
        .then(() => health.settle())
        .then(
          () => true,
          () => false,
        ),
      cancelled,
    ]);
  } finally {
    signal.removeEventListener('abort', cancel);
  }
};
const collectHealth = async (
  health: BusinessHealthPort,
  signal: AbortSignal,
) => {
  const settled = await settleHealth(health, signal);
  let snapshot = captureFunctionalHealth({
    snapshot: () => {
      if (!settled) throw Error('UNAVAILABLE');
      return health.snapshot();
    },
  });
  let auth: z.infer<typeof authSchema> | null = null;
  try {
    auth = authSchema.parse(health.authDiagnostics());
  } catch {
    snapshot = captureFunctionalHealth({
      snapshot: () => {
        throw Error('UNAVAILABLE');
      },
    });
  }
  return { settled, health: snapshot, auth };
};
export const createBusinessStageObserver =
  (
    journal: PrivateJournal,
    health: BusinessHealthPort,
    operation: (
      stage: FunctionalStage,
      signal: AbortSignal,
    ) => Promise<unknown>,
  ) =>
  async (stage: FunctionalStage, signal: AbortSignal) => {
    const aborted = () => signal.aborted;
    if (aborted()) return fail('FUNCTIONAL_ABORTED');
    let failed = false,
      error: unknown,
      result: unknown;
    try {
      result = await operation(stage, signal);
    } catch (caught) {
      failed = true;
      error = caught;
    }
    const observation = await collectHealth(health, signal);
    try {
      await journal.write(
        `business-stage-${stage.replaceAll('_', '-')}`,
        businessStageHealthSchema.parse({
          schemaVersion: 1,
          stage,
          outcome: failed ? 'failed' : 'confirmed',
          code: failed ? functionalFailureCode(error) : null,
          ...observation,
        }),
      );
    } catch {
      if (!failed) return fail('FUNCTIONAL_OWNERSHIP_INVALID');
    }
    if (failed) throw error;
    if (aborted()) return fail('FUNCTIONAL_ABORTED');
    if (observation.health.collection === 'UNAVAILABLE')
      return fail('FUNCTIONAL_BROWSER_FAILED');
    return result;
  };
