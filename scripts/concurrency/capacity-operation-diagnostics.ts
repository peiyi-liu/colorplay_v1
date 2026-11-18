import { Buffer } from 'node:buffer';
import { types } from 'node:util';
import { z } from 'zod';
import type { CapacityOperation } from './capacity-manifest';
const operation = z.enum([
  'published_content',
  'submit_answer',
  'finalize_quiz',
  'leaderboard',
  'teacher_dashboard',
]);
const reason = z.enum([
  'NONE',
  'REQUEST_SCHEMA',
  'REQUEST_CALLBACK',
  'RESPONSE_CALLBACK',
  'FINISH_CALLBACK',
  'FAILED_CALLBACK',
  'RESPONSE_SCHEMA',
  'FINISH_SCHEMA',
  'FAILED_SCHEMA',
  'REQUEST_CAP',
  'ATTEMPT_CAP',
  'REQUEST_DUPLICATE',
  'SERVICE_WORKER',
  'FINISH_BEFORE_START',
  'ABORT',
  'NETWORK_ENABLE',
  'SETTLE_DEADLINE',
]);
const kind = z.enum([
  'REQUEST',
  'UNATTRIBUTED',
  'RESPONSE',
  'FINISH',
  'FAILED',
  'INVALID',
  'RUN_ENTERED',
  'RUN_REFUSED',
  'ACTION_RETURNED',
  'ACTION_FAILED',
  'SETTLE_ENTERED',
  'SETTLE_DONE',
  'SAMPLE',
  'SAMPLE_ENTERED',
  'DISPOSE',
]);
export const operationFailureCodes = [
  'ERR_ABORTED',
  'ERR_FAILED',
  'ERR_CONNECTION_RESET',
  'ERR_CONNECTION_CLOSED',
  'ERR_CONNECTION_REFUSED',
  'ERR_TIMED_OUT',
  'ERR_NETWORK_CHANGED',
  'ERR_BLOCKED_BY_CLIENT',
  'OTHER',
] as const;
const failure = z.enum(operationFailureCodes);
const time = z.number().nonnegative().nullable();
const pendingAttempt = z.strictObject({
  ordinal: z.number().int().min(1).max(4096),
  operation,
  startCdpMs: time,
  endCdpMs: time,
  status: z.number().int().min(0).max(599).nullable(),
  cached: z.boolean(),
});
const point = z.strictObject({
  ordinal: z.number().int().min(1).max(1000000),
  kind,
  reason,
  nodeAtMs: time,
  cdpAtMs: time,
  available: z.boolean(),
  disposed: z.boolean(),
  pending: z.number().int().min(0).max(4096),
  activeOperation: operation.nullable(),
  cache: z.enum(['cold', 'warm', 'hit', 'unavailable']).nullable(),
  during: z.boolean().nullable(),
  attemptOrdinal: z.number().int().min(1).max(4096).nullable(),
  status: z.number().int().min(0).max(599).nullable(),
  endPresent: z.boolean().nullable(),
  cached: z.boolean().nullable(),
  failureCode: failure.nullable(),
});
export const capacityOperationLifecycleSchema = z.strictObject({
  schemaVersion: z.literal(1),
  kind: z.literal('CAPACITY_OPERATION_LIFECYCLE_V1'),
  executionAuthority: z.literal('NONE'),
  collection: z.enum(['OBSERVED', 'UNOBSERVED', 'UNAVAILABLE']),
  sealed: z.literal(true),
  overflow: z.boolean(),
  eventCount: z.number().int().min(0).max(1000000),
  events: z.array(point).max(32),
  firstInvalid: point.nullable(),
  firstSettleDeadline: point.nullable(),
  pendingAtFirstInvalid: z.array(pendingAttempt).max(64),
  pendingCaptured: z.number().int().min(0).max(64),
  pendingTotal: z.number().int().min(0).max(4096),
});
export interface OperationDiagnosticAttempt {
  start: number;
  end: number | null;
  status: number | null;
  cached: boolean;
}
export interface OperationDiagnosticState {
  available: boolean;
  disposed: boolean;
  pending: number;
  activeOperation: CapacityOperation | null;
  cache: 'cold' | 'warm' | 'hit' | 'unavailable' | null;
  during: boolean | null;
}
type Snapshot = z.infer<typeof capacityOperationLifecycleSchema>;
const empty = (collection: Snapshot['collection']): Snapshot => ({
  schemaVersion: 1,
  kind: 'CAPACITY_OPERATION_LIFECYCLE_V1',
  executionAuthority: 'NONE',
  collection,
  sealed: true,
  overflow: false,
  eventCount: 0,
  events: [],
  firstInvalid: null,
  firstSettleDeadline: null,
  pendingAtFirstInvalid: [],
  pendingCaptured: 0,
  pendingTotal: 0,
});
const immutable = <T>(value: T): T => {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) immutable(child);
    Object.freeze(value);
  }
  return value;
};
/** Projection only: no raw CDP payload, request identity, IO or authority. */
export const createCapacityOperationLifecycle = (now: () => number) => {
  const value = empty('OBSERVED'),
    attempts = new WeakMap<
      object,
      { ordinal: number; operation: CapacityOperation }
    >();
  let attemptCount = 0,
    sealed: Snapshot | null = null;
  const safe = (fn: () => void) => {
    if (sealed) return;
    try {
      fn();
    } catch {
      value.collection = 'UNAVAILABLE';
    }
  };
  const track = (
    attempt: OperationDiagnosticAttempt,
    op: CapacityOperation,
  ) => {
    safe(() => {
      if (++attemptCount > 4096) {
        value.collection = 'UNAVAILABLE';
        value.overflow = true;
        return;
      }
      attempts.set(attempt, { ordinal: attemptCount, operation: op });
    });
  };
  const record = (
    event: z.infer<typeof kind>,
    state: OperationDiagnosticState,
    attempt?: OperationDiagnosticAttempt,
    cdpAtMs: number | null = null,
    invalid: z.infer<typeof reason> = 'NONE',
    pending?: Iterable<OperationDiagnosticAttempt>,
    failureCode: z.infer<typeof failure> | null = null,
  ) => {
    safe(() => {
      if (value.eventCount >= 1000000) {
        value.collection = 'UNAVAILABLE';
        value.overflow = true;
        return;
      }
      let nodeAtMs: number | null = null;
      try {
        nodeAtMs = time.parse(now());
      } catch {
        value.collection = 'UNAVAILABLE';
      }
      const row = point.parse({
        ordinal: ++value.eventCount,
        kind: event,
        reason: invalid,
        nodeAtMs,
        cdpAtMs,
        ...state,
        attemptOrdinal: attempt
          ? (attempts.get(attempt)?.ordinal ?? null)
          : null,
        status: attempt?.status ?? null,
        endPresent: attempt ? attempt.end !== null : null,
        cached: attempt?.cached ?? null,
        failureCode,
      });
      if (value.events.length === 32) {
        value.events.splice(16, 1);
        value.overflow = true;
        value.collection = 'UNAVAILABLE';
      }
      value.events.push(row);
      if (invalid === 'SETTLE_DEADLINE' && !value.firstSettleDeadline)
        value.firstSettleDeadline = row;
      if (invalid !== 'NONE' && !value.firstInvalid) {
        value.firstInvalid = row;
        value.pendingTotal = state.pending;
        for (const a of pending ?? []) {
          if (value.pendingAtFirstInvalid.length === 64) break;
          const meta = attempts.get(a);
          if (!meta) {
            value.collection = 'UNAVAILABLE';
            continue;
          }
          value.pendingAtFirstInvalid.push(
            pendingAttempt.parse({
              ordinal: meta.ordinal,
              operation: meta.operation,
              startCdpMs: a.start,
              endCdpMs: a.end,
              status: a.status,
              cached: a.cached,
            }),
          );
        }
        value.pendingCaptured = value.pendingAtFirstInvalid.length;
        if (state.pending > value.pendingCaptured) {
          value.collection = 'UNAVAILABLE';
          value.overflow = true;
        }
      }
    });
  };
  return {
    track,
    record,
    seal: (): Snapshot => {
      if (!sealed) {
        try {
          const snapshot = capacityOperationLifecycleSchema.parse(value);
          while (
            Buffer.byteLength(JSON.stringify(snapshot)) > 16384 &&
            snapshot.events.length
          ) {
            snapshot.events.pop();
            snapshot.collection = 'UNAVAILABLE';
            snapshot.overflow = true;
          }
          if (Buffer.byteLength(JSON.stringify(snapshot)) > 16384)
            throw Error('DIAGNOSTIC_BOUND');
          sealed = immutable(snapshot);
        } catch {
          sealed = immutable(empty('UNAVAILABLE'));
        }
      }
      return sealed;
    },
  };
};
export const captureCapacityOperationLifecycle = (port: unknown): Snapshot => {
  try {
    if (!port || typeof port !== 'object' || types.isProxy(port))
      return immutable(empty('UNAVAILABLE'));
    const method: unknown = (port as { operationLifecycle?: unknown })
      .operationLifecycle;
    if (method === undefined) return immutable(empty('UNOBSERVED'));
    if (typeof method !== 'function') return immutable(empty('UNAVAILABLE'));
    const raw: unknown = Reflect.apply(method, port, []);
    if (raw && typeof raw === 'object' && types.isProxy(raw))
      return immutable(empty('UNAVAILABLE'));
    const parsed = capacityOperationLifecycleSchema.parse(raw);
    if (Buffer.byteLength(JSON.stringify(parsed)) > 16384)
      return immutable(empty('UNAVAILABLE'));
    return immutable(parsed);
  } catch {
    return immutable(empty('UNAVAILABLE'));
  }
};
