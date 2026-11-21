import { performance } from 'node:perf_hooks';
import { z } from 'zod';
import { capacityHealthSchema } from './capacity-health';
const time = z.number().nonnegative();
const source = z.enum([
  'PARENT_SIGNAL',
  'COLLECTOR_INVALID',
  'BUSINESS_DEADLINE',
  'FINALLY',
  'UNKNOWN',
]);
export type CapacityStopSource = z.infer<typeof source>;
const subphase = z.enum([
  'LANDING_CTA',
  'LOGIN_ROUTE',
  'REGISTER_CTA',
  'REGISTER_ROUTE',
  'NAME',
  'NICKNAME',
  'CLASS',
  'NEXT',
  'EMAIL',
  'SEND_BUTTON_VISIBLE',
  'TEACHER_PORTAL',
  'ACCOUNT',
  'PASSWORD',
  'LOGIN_BUTTON_VISIBLE',
]);
export type CapacityReadySubphase = z.infer<typeof subphase>;
const errorName = z.enum([
  'Error',
  'TypeError',
  'RangeError',
  'SyntaxError',
  'AbortError',
  'TimeoutError',
  'TargetClosedError',
  'UNKNOWN',
]);
const reasons = z.enum([
  'collector_unavailable',
  'host_stale',
  'vm_stale',
  'loop_stale',
  'tree_or_identity_changed',
  'node_rss',
  'browser_footprint',
  'host_critical',
  'host_warning',
  'event_loop',
  'host_swap',
  'identity_changed',
  'backend_stale',
  'backend_limits_changed',
  'backend_oom',
  'browser_pss',
  'host_psi',
  'host_oom',
]);
const event = z.strictObject({ atNodeMs: time, source });
const actor = z.number().int().min(0).max(59);
const readyState = z.strictObject({
  actorIndex: actor,
  subphase: subphase.nullable(),
  atNodeMs: time,
  state: z.enum(['ACTIVE', 'COMPLETE', 'FAILED', 'UNOBSERVED']),
});
export const capacityRunDiagnosticsSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    collection: z.enum(['OBSERVED', 'UNAVAILABLE']),
    clock: z.literal('NODE_MONOTONIC'),
    sealed: z.boolean(),
    actorsExpected: z.number().int().min(1).max(60).nullable(),
    firstCollectorInvalid: z
      .strictObject({
        atNodeMs: time,
        status: z.enum(['UNKNOWN', 'GENERATOR_LIMITED']),
        reasons: z.array(reasons).max(18),
        hostAgeMs: time.nullable(),
        resourceAgeMs: time.nullable(),
      })
      .nullable(),
    firstReadyFailure: z
      .strictObject({
        atNodeMs: time,
        actorIndex: actor,
        subphase: subphase.nullable(),
        subphaseObservation: z.enum(['OBSERVED', 'UNOBSERVED']),
        errorName,
        signalAborted: z.boolean(),
      })
      .nullable(),
    firstAbortRequest: event.nullable(),
    firstStopRequest: event.nullable(),
    firstSignal: z
      .strictObject({
        observation: z.enum(['OBSERVED', 'ALREADY_ABORTED']),
        atNodeMs: time.nullable(),
        source,
      })
      .nullable(),
    firstJourneyFailure: z
      .strictObject({ atNodeMs: time, errorName, signalAborted: z.boolean() })
      .nullable(),
    finallyEnteredAtNodeMs: time.nullable(),
    stopCompleted: z
      .strictObject({
        atNodeMs: time,
        result: z.enum(['FULFILLED', 'UNKNOWN']),
      })
      .nullable(),
    actors: z.array(readyState).max(60),
  })
  .refine(
    (v) =>
      v.firstSignal === null ||
      (v.firstSignal.observation === 'ALREADY_ABORTED'
        ? v.firstSignal.atNodeMs === null
        : v.firstSignal.atNodeMs !== null),
  )
  .refine(
    (v) =>
      v.collection !== 'OBSERVED' ||
      (v.actorsExpected !== null &&
        (!v.sealed ||
          !!(
            v.firstAbortRequest &&
            v.firstStopRequest &&
            v.firstSignal &&
            v.finallyEnteredAtNodeMs !== null &&
            v.stopCompleted
          ))),
  );
type Snapshot = z.infer<typeof capacityRunDiagnosticsSchema>;
export const createCapacityRunDiagnostics = (
  actors: number,
  now: () => number = () => performance.now(),
) => {
  let bad = !Number.isInteger(actors) || actors < 1 || actors > 60,
    sealed = false,
    last = -1;
  const value: Snapshot = {
    schemaVersion: 1,
    collection: 'OBSERVED',
    clock: 'NODE_MONOTONIC',
    sealed: false,
    actorsExpected: bad ? null : actors,
    firstCollectorInvalid: null,
    firstReadyFailure: null,
    firstAbortRequest: null,
    firstStopRequest: null,
    firstSignal: null,
    firstJourneyFailure: null,
    finallyEnteredAtNodeMs: null,
    stopCompleted: null,
    actors: [],
  };
  const touch = () => {
    if (sealed) bad = true;
    return !sealed;
  };
  const at = () => {
    try {
      const n = time.parse(now());
      if (n < last) throw Error();
      last = n;
      return n;
    } catch {
      bad = true;
      return null;
    }
  };
  const name = (error: unknown): z.infer<typeof errorName> => {
    try {
      const raw = (error as { name?: unknown } | null)?.name;
      const parsed = errorName.safeParse(raw);
      return parsed.success ? parsed.data : 'UNKNOWN';
    } catch {
      bad = true;
      return 'UNKNOWN';
    }
  };
  const attempt = (fn: () => void) => {
    if (!touch()) return;
    try {
      fn();
    } catch {
      bad = true;
    }
  };
  const validActor = (index: number) => {
    if (actor.parse(index) >= actors) throw Error();
  };
  const request = (
    field: 'firstAbortRequest' | 'firstStopRequest',
    raw: CapacityStopSource,
  ) => {
    attempt(() => {
      if (value[field]) return;
      const parsed = source.parse(raw),
        stamp = at();
      if (stamp !== null) value[field] = { atNodeMs: stamp, source: parsed };
    });
  };
  return {
    collectorInvalid(raw: unknown) {
      attempt(() => {
        if (value.firstCollectorInvalid) return;
        const health = capacityHealthSchema.parse(raw),
          stamp = at();
        if (health.validity === 'VALID' || stamp === null) {
          bad = true;
          return;
        }
        value.firstCollectorInvalid = {
          atNodeMs: stamp,
          status: health.validity,
          reasons: health.reasons,
          hostAgeMs: health.lastHostAgeMs,
          resourceAgeMs:
            'lastBackendAgeMs' in health
              ? health.lastBackendAgeMs
              : health.lastVmAgeMs,
        };
      });
    },
    readyStep(index: number, phase: CapacityReadySubphase) {
      attempt(() => {
        validActor(index);
        const parsed = subphase.parse(phase),
          stamp = at();
        if (stamp === null) return;
        const row = value.actors.find((v) => v.actorIndex === index);
        if (row?.state === 'FAILED') {
          bad = true;
          return;
        }
        if (row)
          Object.assign(row, {
            subphase: parsed,
            atNodeMs: stamp,
            state: 'ACTIVE',
          });
        else
          value.actors.push({
            actorIndex: index,
            subphase: parsed,
            atNodeMs: stamp,
            state: 'ACTIVE',
          });
      });
    },
    readyComplete(index: number) {
      attempt(() => {
        validActor(index);
        const row = value.actors.find((v) => v.actorIndex === index);
        if (row?.state === 'FAILED') bad = true;
        else if (row) row.state = 'COMPLETE';
      });
    },
    readyFailure(index: number, error: unknown, signal: AbortSignal) {
      attempt(() => {
        validActor(index);
        const row = value.actors.find((v) => v.actorIndex === index);
        if (row) row.state = 'FAILED';
        if (value.firstReadyFailure) return;
        const stamp = at();
        if (stamp === null) return;
        value.firstReadyFailure = {
          atNodeMs: stamp,
          actorIndex: index,
          subphase: row?.subphase ?? null,
          subphaseObservation: row ? 'OBSERVED' : 'UNOBSERVED',
          errorName: name(error),
          signalAborted: signal.aborted,
        };
      });
    },
    abortRequest(raw: CapacityStopSource) {
      request('firstAbortRequest', raw);
    },
    stopRequest(raw: CapacityStopSource) {
      request('firstStopRequest', raw);
    },
    signal(raw: CapacityStopSource, already = false) {
      attempt(() => {
        if (value.firstSignal) return;
        const parsed = source.parse(raw),
          stamp = already ? null : at();
        if (!already && stamp === null) return;
        value.firstSignal = {
          observation: already ? 'ALREADY_ABORTED' : 'OBSERVED',
          atNodeMs: stamp,
          source: parsed,
        };
      });
    },
    journeyFailure(error: unknown, signal: AbortSignal) {
      attempt(() => {
        if (value.firstJourneyFailure) return;
        const stamp = at();
        if (stamp !== null)
          value.firstJourneyFailure = {
            atNodeMs: stamp,
            errorName: name(error),
            signalAborted: signal.aborted,
          };
      });
    },
    finallyEnter() {
      attempt(() => {
        value.finallyEnteredAtNodeMs ??= at();
      });
    },
    stopComplete(result: 'FULFILLED' | 'UNKNOWN') {
      attempt(() => {
        if (value.stopCompleted) return;
        const stamp = at();
        if (stamp !== null)
          value.stopCompleted = {
            atNodeMs: stamp,
            result: z.enum(['FULFILLED', 'UNKNOWN']).parse(result),
          };
      });
    },
    seal() {
      sealed = true;
      value.sealed = true;
    },
    snapshot(): Snapshot {
      const parsed = capacityRunDiagnosticsSchema.safeParse({
        ...value,
        collection: bad ? 'UNAVAILABLE' : 'OBSERVED',
      });
      if (parsed.success) return parsed.data;
      bad = true;
      return capacityRunDiagnosticsSchema.parse({
        ...value,
        collection: 'UNAVAILABLE',
      });
    },
  };
};
export type CapacityRunDiagnostics = ReturnType<
  typeof createCapacityRunDiagnostics
>;
