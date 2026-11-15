import { z } from 'zod';
import { capacityFailure } from './capacity-scope';
import {
  capacityOperations,
  capacityEngineeringGuards,
  type CapacityOperation,
} from './capacity-manifest';
export const operationBudgetsMs: Record<CapacityOperation, number> = {
  published_content: 500,
  submit_answer: 800,
  finalize_quiz: 1000,
  leaderboard: 700,
  teacher_dashboard: 1500,
};
const ms = z.number().nonnegative();
const ordinal = z.string().regex(/^op-[0-9]{6,9}$/u);
export const operationSampleSchema = z.strictObject({
  id: ordinal,
  actorIndex: z.number().int().min(0).max(59),
  operation: z.enum(capacityOperations),
  startedAtMs: ms,
  finishedAtMs: ms,
  status: z.enum(['success', 'error', 'timeout']),
  reason: z
    .enum([
      'auth',
      'permission',
      'rate_limited',
      'validation',
      'unavailable',
      'timeout',
      'unknown',
    ])
    .nullable(),
  attempts: z
    .array(z.strictObject({ startedAtMs: ms, finishedAtMs: ms.nullable() }))
    .max(64),
  cache: z.enum(['cold', 'warm', 'hit', 'unavailable']),
  replayOf: ordinal.nullable(),
  duringStudentBusinessLoad: z.boolean().optional(),
});
export type OperationSample = z.infer<typeof operationSampleSchema>;
const metricResult = z.enum([
  'PASS',
  'FAIL',
  'NOT_EVALUATED_INSUFFICIENT_SAMPLES',
  'NOT_EVALUATED_UNAVAILABLE_TIMING',
  'NOT_EVALUATED_MISSING_COLD_SAMPLE',
  'NOT_EVALUATED_NO_CONCURRENT_TEACHER_READS',
]);
export const operationMetricsSchema = z.strictObject({
  budgetMs: ms,
  operationsStarted: z.number().int().nonnegative(),
  independentSamples: z.number().int().nonnegative(),
  replays: z.number().int().nonnegative(),
  physicalAttempts: z.number().int().nonnegative(),
  errorCount: z.number().int().nonnegative(),
  coldSamples: z.number().int().nonnegative(),
  concurrentSamples: z.number().int().nonnegative(),
  warmSamples: z.number().int().nonnegative(),
  cacheHits: z.number().int().nonnegative(),
  unavailableTimings: z.number().int().nonnegative(),
  p50Ms: ms.nullable(),
  p95Ms: ms.nullable(),
  maxMs: ms.nullable(),
  result: metricResult,
});
const operationShape = {
  published_content: operationMetricsSchema,
  submit_answer: operationMetricsSchema,
  finalize_quiz: operationMetricsSchema,
  leaderboard: operationMetricsSchema,
  teacher_dashboard: operationMetricsSchema,
};
export const capacityMetricsSchema = z.strictObject({
  actorsStarted: z.number().int().min(1).max(60),
  actorsCompleted: z.number().int().min(0).max(60),
  actorCompletionRate: z.number().min(0).max(1),
  operations: z.strictObject(operationShape),
  perActor: z
    .array(
      z.strictObject({
        actorIndex: z.number().int().min(0).max(59),
        operationsStarted: z.number().int().nonnegative(),
        physicalAttempts: z.number().int().nonnegative(),
        cacheHits: z.number().int().nonnegative(),
        errors: z.number().int().nonnegative(),
      }),
    )
    .max(60),
});
export type CapacityMetrics = z.infer<typeof capacityMetricsSchema>;
export const nearestRank = (
  values: readonly number[],
  quantile: number,
): number | null => {
  if (
    quantile <= 0 ||
    quantile > 1 ||
    values.some((value) => !Number.isFinite(value) || value < 0)
  )
    return capacityFailure();
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * quantile) - 1] ?? capacityFailure();
};
const duration = (sample: OperationSample): number | null => {
  if (
    sample.finishedAtMs < sample.startedAtMs ||
    (sample.status === 'success') !== (sample.reason === null) ||
    (sample.cache === 'hit' && sample.attempts.length !== 0)
  )
    return capacityFailure();
  let previous = sample.startedAtMs;
  for (const [index, attempt] of sample.attempts.entries()) {
    if (
      attempt.startedAtMs < previous ||
      attempt.startedAtMs > sample.finishedAtMs ||
      (attempt.finishedAtMs !== null &&
        (attempt.finishedAtMs < attempt.startedAtMs ||
          attempt.finishedAtMs > sample.finishedAtMs)) ||
      (attempt.finishedAtMs === null &&
        (index !== sample.attempts.length - 1 || sample.status !== 'timeout'))
    )
      return capacityFailure();
    previous = attempt.finishedAtMs ?? sample.finishedAtMs;
  }
  const first = sample.attempts[0],
    last = sample.attempts.at(-1);
  if (!first || !last) return null;
  return (last.finishedAtMs ?? sample.finishedAtMs) - first.startedAtMs;
};
export const summarizeOperations = (
  input: unknown,
  actorsStarted: number,
  completedActors: readonly number[],
): CapacityMetrics => {
  const samples = z.array(operationSampleSchema).max(20000).parse(input);
  if (
    !Number.isInteger(actorsStarted) ||
    actorsStarted < 1 ||
    actorsStarted > 60 ||
    new Set(samples.map((row) => row.id)).size !== samples.length ||
    new Set(completedActors).size !== completedActors.length ||
    completedActors.some(
      (actor) =>
        !Number.isInteger(actor) || actor < 0 || actor >= actorsStarted,
    ) ||
    samples.some((row) => row.actorIndex >= actorsStarted)
  )
    return capacityFailure();
  const ids = new Map(samples.map((row) => [row.id, row]));
  for (const row of samples)
    if (row.replayOf !== null) {
      const original = ids.get(row.replayOf);
      if (
        !original ||
        original.id === row.id ||
        original.replayOf !== null ||
        original.operation !== row.operation ||
        original.actorIndex !== row.actorIndex ||
        original.status !== 'success'
      )
        return capacityFailure();
    }
  const durations = new Map(samples.map((row) => [row.id, duration(row)]));
  const operations = Object.fromEntries(
    capacityOperations.map((operation) => {
      const rows = samples.filter((row) => row.operation === operation),
        independent = rows.filter((row) => row.replayOf === null),
        physical = independent.filter((row) => row.attempts.length > 0);
      const values = physical.flatMap((row) => {
        const value = durations.get(row.id);
        return value === null || value === undefined ? [] : [value];
      });
      const p95Ms = nearestRank(values, 0.95),
        coldSamples = physical.filter((row) => row.cache === 'cold').length,
        errorCount = independent.filter(
          (row) => row.status !== 'success',
        ).length;
      const unavailableTimings = independent.filter(
        (row) => row.cache !== 'hit' && durations.get(row.id) === null,
      ).length;
      const concurrent = physical.filter(
        (row) => row.duringStudentBusinessLoad === true,
      ).length;
      const result =
        errorCount > 0
          ? 'FAIL'
          : physical.length < 30
            ? 'NOT_EVALUATED_INSUFFICIENT_SAMPLES'
            : unavailableTimings > 0
              ? 'NOT_EVALUATED_UNAVAILABLE_TIMING'
              : operation === 'published_content' && coldSamples === 0
                ? 'NOT_EVALUATED_MISSING_COLD_SAMPLE'
                : operation === 'teacher_dashboard' && concurrent < 30
                  ? 'NOT_EVALUATED_NO_CONCURRENT_TEACHER_READS'
                  : p95Ms !== null && p95Ms <= operationBudgetsMs[operation]
                    ? 'PASS'
                    : 'FAIL';
      return [
        operation,
        {
          budgetMs: operationBudgetsMs[operation],
          operationsStarted: rows.length,
          independentSamples: physical.length,
          replays: rows.length - independent.length,
          physicalAttempts: rows.reduce((n, row) => n + row.attempts.length, 0),
          errorCount,
          coldSamples,
          concurrentSamples: concurrent,
          warmSamples: physical.filter((row) => row.cache === 'warm').length,
          cacheHits: rows.filter((row) => row.cache === 'hit').length,
          unavailableTimings,
          p50Ms: nearestRank(values, 0.5),
          p95Ms,
          maxMs: values.length ? Math.max(...values) : null,
          result,
        },
      ];
    }),
  );
  const perActor = Array.from({ length: actorsStarted }, (_, actorIndex) => {
    const rows = samples.filter((row) => row.actorIndex === actorIndex);
    return {
      actorIndex,
      operationsStarted: rows.length,
      physicalAttempts: rows.reduce((n, row) => n + row.attempts.length, 0),
      cacheHits: rows.filter((row) => row.cache === 'hit').length,
      errors: rows.filter((row) => row.status !== 'success').length,
    };
  });
  return capacityMetricsSchema.parse({
    actorsStarted,
    actorsCompleted: completedActors.length,
    actorCompletionRate: completedActors.length / actorsStarted,
    operations,
    perActor,
  });
};
export const barrierResultSchema = z.strictObject({
  result: z.enum(['VALID', 'GENERATOR_LIMITED', 'UNKNOWN']),
  actorsExpected: z.number().int().min(1).max(60),
  requestsObserved: z.number().int().nonnegative().max(60),
  skewMs: ms.nullable(),
});
export const evaluateBarrier = (
  input: unknown,
  actorsExpected: number,
): z.infer<typeof barrierResultSchema> => {
  const expected = z.number().int().min(1).max(60).parse(actorsExpected);
  const parsed = z
    .array(
      z.strictObject({
        actorIndex: z.number().int().min(0).max(59),
        requestAtMs: ms,
        clock: z.enum(['CHROMIUM_NETWORK_MONOTONIC', 'NODE_PERFORMANCE']),
      }),
    )
    .max(60)
    .safeParse(input);
  if (!parsed.success)
    return {
      result: 'UNKNOWN',
      actorsExpected: expected,
      requestsObserved: 0,
      skewMs: null,
    };
  const rows = parsed.data;
  if (
    rows.length !== expected ||
    new Set(rows.map((row) => row.actorIndex)).size !== expected ||
    rows.some((row) => row.actorIndex >= expected) ||
    new Set(rows.map((row) => row.clock)).size !== 1
  )
    return {
      result: 'UNKNOWN',
      actorsExpected: expected,
      requestsObserved: rows.length,
      skewMs: null,
    };
  const times = rows.map((row) => row.requestAtMs),
    skewMs = Math.max(...times) - Math.min(...times);
  return {
    result:
      skewMs <= capacityEngineeringGuards.barrierSkewMaxMs
        ? 'VALID'
        : 'GENERATOR_LIMITED',
    actorsExpected: expected,
    requestsObserved: rows.length,
    skewMs,
  };
};
