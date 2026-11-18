import { performance } from 'node:perf_hooks';
import { z } from 'zod';
import type { CapacityOperation } from './capacity-manifest';

const operations = [
  'published_content',
  'submit_answer',
  'finalize_quiz',
  'leaderboard',
  'teacher_dashboard',
] as const;
const stage = z.enum([
  'BEFORE_ACTIVE',
  'GOTO',
  'HEADING',
  'MEASURE',
  'AFTER_ACTIVE',
]);
const errorClass = z.enum([
  'ERROR',
  'TYPE_ERROR',
  'RANGE_ERROR',
  'NON_ERROR',
  'UNKNOWN',
]);
const eventSchema = z.strictObject({
  kind: z.enum(['TEACHER', 'STUDENT', 'WINDOW', 'STOP']),
  stage: stage.nullable(),
  state: z.enum(['ENTERED', 'RETURNED', 'FAILED']),
  actorIndex: z.number().int().min(0).max(59).nullable(),
  iteration: z.number().int().min(0).max(29).nullable(),
  source: z
    .enum([
      'STUDENT_FAILURE',
      'TEACHER_FAILURE',
      'NO_PHYSICAL_WINDOW',
      'SETTLE_FAILURE',
    ])
    .nullable(),
  active: z.number().int().min(0).max(59).nullable(),
  completed: z.number().int().min(0).max(59).nullable(),
  observed: z.number().int().min(0).max(59).nullable(),
  signalAborted: z.boolean(),
  errorClass: errorClass.nullable(),
});
export type GameEvent = z.infer<typeof eventSchema>;
export type GameObservation = Pick<
  GameEvent,
  'kind' | 'state' | 'signalAborted'
> &
  Partial<GameEvent>;
export type GameObserver = (event: GameObservation) => void;
export const gameErrorClass = (error: unknown): z.infer<typeof errorClass> => {
  try {
    if (error instanceof TypeError) return 'TYPE_ERROR';
    if (error instanceof RangeError) return 'RANGE_ERROR';
    return error instanceof Error ? 'ERROR' : 'NON_ERROR';
  } catch {
    return 'UNKNOWN';
  }
};
export const gameObserve = (
  observer: GameObserver | undefined,
  event: GameObservation,
) => {
  try {
    observer?.(event);
  } catch {
    /* Passive observation cannot change work. */
  }
};
const timedEvent = eventSchema.extend({
  atNodeMs: z.number().nonnegative().nullable(),
});
export const capacityGameDiagnosticsSchema = z.strictObject({
  schemaVersion: z.literal(1),
  authority: z.literal('NON_AUTHORITY'),
  collection: z.enum(['UNOBSERVED', 'OBSERVED', 'UNAVAILABLE']),
  clock: z.literal('NODE_MONOTONIC'),
  sealed: z.boolean(),
  overflow: z.boolean(),
  firstStop: timedEvent.nullable(),
  events: z.array(timedEvent).max(2048),
});
const immutable = <T>(value: T): T => {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) immutable(child);
    Object.freeze(value);
  }
  return value;
};
export const createCapacityGameDiagnostics = (
  now = () => performance.now(),
) => {
  let sealed = false,
    unavailable = false,
    overflow = false,
    last = 0;
  const events: z.infer<typeof timedEvent>[] = [];
  let firstStop: z.infer<typeof timedEvent> | null = null;
  return {
    observe: (input: GameObservation) => {
      try {
        if (sealed) {
          unavailable = true;
          return;
        }
        const value = eventSchema.parse({
          stage: null,
          actorIndex: null,
          iteration: null,
          source: null,
          active: null,
          completed: null,
          observed: null,
          errorClass: null,
          ...input,
        });
        let atNodeMs: number | null = null;
        try {
          const at = now();
          if (Number.isFinite(at) && at >= last && at >= 0) {
            atNodeMs = at;
            last = at;
          } else unavailable = true;
        } catch {
          unavailable = true;
        }
        const row = { ...value, atNodeMs };
        if (row.kind === 'STOP' && firstStop === null) firstStop = row;
        if (events.length === 2048) {
          unavailable = true;
          overflow = true;
          return;
        }
        events.push(row);
      } catch {
        unavailable = true;
      }
    },
    seal: () => {
      sealed = true;
      return immutable(
        capacityGameDiagnosticsSchema.parse({
          schemaVersion: 1,
          authority: 'NON_AUTHORITY',
          collection: unavailable
            ? 'UNAVAILABLE'
            : events.length
              ? 'OBSERVED'
              : 'UNOBSERVED',
          clock: 'NODE_MONOTONIC',
          sealed,
          overflow,
          firstStop,
          events,
        }),
      );
    },
  };
};
const count = z.number().int().nonnegative().max(1000000);
const operationRow = z.strictObject({
  operation: z.enum(operations),
  total: count,
  attributed: count,
  unattributed: count,
  active: z
    .array(
      z.strictObject({ operation: z.enum([...operations, 'NONE']), count }),
    )
    .length(6),
});
export const capacityOperationAccountingSchema = z
  .strictObject({
    actorIndex: z.number().int().min(0).max(59).nullable(),
    schemaVersion: z.literal(1),
    authority: z.literal('NON_AUTHORITY'),
    collection: z.enum(['UNOBSERVED', 'OBSERVED', 'UNAVAILABLE']),
    sealed: z.boolean(),
    overflow: z.boolean(),
    rows: z.array(operationRow).length(5),
  })
  .superRefine((value, context) => {
    const valid =
      new Set(value.rows.map((row) => row.operation)).size === 5 &&
      value.rows.every((row) => {
        const own = row.active.find(
          (cell) => cell.operation === row.operation,
        )?.count;
        const other = row.active
          .filter((cell) => cell.operation !== row.operation)
          .reduce((sum, cell) => sum + cell.count, 0);
        return (
          new Set(row.active.map((cell) => cell.operation)).size === 6 &&
          row.total === row.attributed + row.unattributed &&
          row.total === row.active.reduce((sum, cell) => sum + cell.count, 0) &&
          row.attributed === own &&
          row.unattributed === other
        );
      });
    if (!valid)
      context.addIssue({ code: 'custom', message: 'COUNTER_INVARIANT' });
  });
export const createCapacityOperationAccounting = (
  actorIndex: number | null = null,
) => {
  const rows = operations.map((operation) => ({
    operation,
    total: 0,
    attributed: 0,
    unattributed: 0,
    active: [...operations, 'NONE' as const].map((operation) => ({
      operation,
      count: 0,
    })),
  }));
  let sealed = false,
    unavailable = false,
    overflow = false,
    seen = false;
  return {
    note: (operation: CapacityOperation, active: CapacityOperation | null) => {
      if (sealed) {
        unavailable = true;
        return;
      }
      const row = rows.find((r) => r.operation === operation),
        cross = row?.active.find((r) => r.operation === (active ?? 'NONE'));
      if (!row || !cross) {
        unavailable = true;
        return;
      }
      if (row.total === 1000000) {
        unavailable = true;
        overflow = true;
        return;
      }
      seen = true;
      row.total++;
      cross.count++;
      if (operation === active) row.attributed++;
      else row.unattributed++;
    },
    unavailable: () => {
      unavailable = true;
    },
    seal: () => {
      sealed = true;
      return immutable(
        capacityOperationAccountingSchema.parse({
          actorIndex,
          schemaVersion: 1,
          authority: 'NON_AUTHORITY',
          collection: unavailable
            ? 'UNAVAILABLE'
            : seen
              ? 'OBSERVED'
              : 'UNOBSERVED',
          sealed,
          overflow,
          rows,
        }),
      );
    },
  };
};

export const captureCapacityOperationAccounting = (port: {
  diagnostics?: () => unknown;
}) => {
  const fallback = createCapacityOperationAccounting();
  try {
    if (typeof port.diagnostics !== 'function') return fallback.seal();
    const observed = capacityOperationAccountingSchema.safeParse(
      port.diagnostics(),
    );
    if (observed.success) return immutable(observed.data);
  } catch {
    /* A broken diagnostic must never replace the original close. */
  }
  fallback.unavailable();
  return fallback.seal();
};
