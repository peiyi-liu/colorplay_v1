import { capacityLiveQuestionObservationSchema } from './capacity-live-question-observation';
import {
  classifyCapacityLiveError as safeError,
  assertCapacityLiveObservationData as dataOnly,
  type LiveGateObservation,
} from './capacity-live-gate';
import { performance } from 'node:perf_hooks';
import { types } from 'node:util';
import { z } from 'zod';
import { browserJoinSnapshotSchema } from '../../tests/e2e/helpers/live-browser-join-diagnostics';
import type { PageDiagnostics } from '../../tests/e2e/helpers/staging-capacity-browser';

export const capacityLiveStages = [
  'UNOBSERVED',
  'ATTACH_DIAGNOSTICS',
  'SELECT_OPTIONS',
  'SELECT_TEMPLATE',
  'CREATE_INTENT',
  'HOST_NAVIGATE',
  'HOST_CLASSROOM',
  'HOST_TEMPLATE',
  'HOST_CREATE',
  'HOST_READY',
  'HOST_SESSION_ROUTE',
  'HOST_CODE',
  'HOST_ACK',
  'CREATE_ACTIVITY',
  'CREATE_SESSION',
  'START_SESSION',
  'HOST_SUBSCRIBE',
  'CREATED_WRITE',
  'JOIN_BATCH',
  'STUDENT_JOIN',
  'STUDENT_ACK',
  'STUDENT_API_JOIN',
  'STUDENT_SUBSCRIBE',
  'OUTSIDER_JOIN',
  'OUTSIDER_STATE',
  'OUTSIDER_REFUSAL',
  'LOBBY_STATE',
  'BIND_SESSION',
  'PARTICIPANT_COUNT',
  'START_CLICK',
  'START_CONFIRM',
  'OPEN_QUESTION',
  'QUESTION_INTENT',
  'QUESTION_BATCH',
  'QUESTION_STATE',
  'QUESTION_COUNT',
  'QUESTION_OPTIONS',
  'ANSWER_MEASURE',
  'PROMPT_VISIBLE',
  'OPTIONS_VISIBLE',
  'ANSWER_RESPONSE',
  'ANSWER_SETTLE',
  'ANSWER_FINISHED',
  'ANSWER_API',
  'FEEDBACK_STATE',
  'QUESTION_CONFIRMED',
  'FEEDBACK_VISIBLE',
  'RANKING_CLICK',
  'NEXT_CLICK',
  'ADVANCE_STATE',
  'ADVANCE_API',
  'FINALIZE_API',
  'COMPLETED_STATE',
  'REPORT_RPC',
  'REPORT_VALIDATE',
  'REPORT_NAVIGATE',
  'REPORT_VISIBLE',
  'BROWSER_ERRORS',
  'WEBSOCKET_OFF',
  'GATE_CLOSE',
  'SUBSCRIBE_START',
  'CHANNEL_STATUS',
  'REMOVE_CHANNEL',
  'GATE_READ',
  'GATE_WAKE',
  'GATE_TIMEOUT',
] as const;
export type CapacityLiveStage = (typeof capacityLiveStages)[number];
const stage = z.enum(capacityLiveStages),
  nullableCount = z.number().int().nonnegative().nullable();
const errorCode = z
  .enum([
    'AUTH_REQUIRED',
    'NOT_FOUND',
    'STATE_CONFLICT',
    'INVALID_TRANSITION',
    'JOIN_INVALID_CODE',
    'RATE_LIMITED',
    'JOIN_RATE_LIMITED',
    'ANSWER_CLOSED',
    'ANSWER_ALREADY_SUBMITTED',
    'VALIDATION',
    'INVALID_RESPONSE',
    'UNAVAILABLE',
  ])
  .nullable();
const errorClass = z
  .enum([
    'ERROR',
    'TYPE_ERROR',
    'RANGE_ERROR',
    'TIMEOUT_ERROR',
    'LIVE_REPOSITORY_ERROR',
    'NON_ERROR',
    'UNKNOWN',
  ])
  .nullable();
const status = z
  .enum([
    'SUBSCRIBED',
    'CHANNEL_ERROR',
    'TIMED_OUT',
    'CLOSED',
    'SOCKET_ERROR',
    'SOCKET_CLOSED',
    'UNKNOWN',
  ])
  .nullable();
const point = z.strictObject({
  ordinal: z.number().int().min(1).max(1000000),
  stage,
  state: z.enum(['ENTERED', 'RETURNED', 'FAILED', 'NOTE']),
  actorIndex: z.number().int().min(0).max(60).nullable(),
  position: z.number().int().min(1).max(20).nullable(),
  kind: z.enum(['OPERATION', 'CLEANUP', 'SDK']),
  atNodeMs: z.number().nonnegative().nullable(),
  signalAborted: z.boolean(),
  errorClass,
  errorCode,
  predicate: z.boolean().nullable(),
  status,
  refusal: z.boolean().nullable(),
  explicit: z.boolean().nullable(),
  removal: z.enum(['ok', 'error', 'timed out', 'UNKNOWN']).nullable(),
});
type Point = z.infer<typeof point>;
const realtime = z.strictObject({
  collection: z.enum(['OBSERVED', 'UNOBSERVED', 'PARTIAL']),
  counts: browserJoinSnapshotSchema.shape.counts,
  generation: nullableCount,
  events: browserJoinSnapshotSchema.shape.events,
  statusSequence: z.array(status.unwrap()).max(16),
  socketCount: nullableCount,
  errorCount: nullableCount,
  closeCount: nullableCount,
  truncated: z.boolean(),
});
const missingRealtime = () => ({
  collection: 'UNOBSERVED' as const,
  generation: null,
  counts: {
    consoleErrors: 'unavailable' as const,
    pageErrors: 'unavailable' as const,
    serverErrors: 'unavailable' as const,
  },
  events: [],
  statusSequence: [],
  socketCount: null,
  errorCount: null,
  closeCount: null,
  truncated: false,
});
const freeze = <T>(v: T): T => {
  if (v && typeof v === 'object') {
    Object.freeze(v);
    for (const x of Object.values(v)) freeze(x);
  }
  return v;
};
export const createCapacityLiveDiagnostics = (
  signal: AbortSignal,
  now: () => number = () => performance.now(),
) => {
  const head: Point[] = [],
    tail: Point[] = [],
    actors = new Map<
      number,
      {
        actorIndex: number;
        lastOperation: Point | null;
        lastSdk: Point | null;
        join: z.infer<typeof browserJoinSnapshotSchema> | null;
        realtime:
          z.infer<typeof realtime> | { collection: 'UNAVAILABLE' } | null;
      }
    >();
  const counters: Partial<
    Record<
      CapacityLiveStage,
      { entered: number; returned: number; failed: number; notes: number }
    >
  > = {};
  let count = 0,
    poison = false,
    sealed = false,
    late = false,
    lastTime = 0,
    firstFailure: Point | null = null,
    firstCleanupFailure: Point | null = null,
    firstCallbackError: Point | null = null;
  let saved: ReturnType<typeof build> | null = null;
  let questionObservation:
    z.infer<typeof capacityLiveQuestionObservationSchema> | undefined;
  const actor = (index: number) => {
    if (!Number.isInteger(index) || index < 0 || index > 60) throw Error();
    let row = actors.get(index);
    if (!row) {
      row = {
        actorIndex: index,
        lastOperation: null,
        lastSdk: null,
        join: null,
        realtime: null,
      };
      actors.set(index, row);
    }
    return row;
  };
  const guard = (action: () => void) => {
    try {
      if (sealed) {
        late = true;
        return;
      }
      action();
    } catch {
      poison = true;
    }
  };
  const record = (
    s: CapacityLiveStage,
    state: Point['state'],
    index: number | null,
    position: number | null,
    kind: Point['kind'],
    error?: { value: unknown },
    extra: Partial<
      Pick<Point, 'predicate' | 'status' | 'refusal' | 'explicit' | 'removal'>
    > = {},
  ) => {
    guard(() => {
      const time = now();
      if (!Number.isFinite(time) || time < lastTime) throw Error();
      lastTime = time;
      if (count >= 1000000) {
        poison = true;
        return;
      }
      const row = point.parse({
        ordinal: ++count,
        stage: s,
        state,
        actorIndex: index,
        position,
        kind,
        atNodeMs: time,
        signalAborted: signal.aborted,
        predicate: null,
        status: null,
        refusal: null,
        explicit: null,
        removal: null,
        ...(error
          ? safeError(error.value)
          : { errorClass: null, errorCode: null }),
        ...extra,
      });
      const total = counters[s] ?? {
        entered: 0,
        returned: 0,
        failed: 0,
        notes: 0,
      };
      counters[s] = total;
      if (state === 'ENTERED') total.entered++;
      else if (state === 'RETURNED') total.returned++;
      else if (state === 'FAILED') total.failed++;
      else total.notes++;
      if (head.length < 32) head.push(row);
      else {
        tail.push(row);
        if (tail.length > 32) tail.shift();
      }
      if (index !== null) {
        const a = actor(index);
        if (kind === 'SDK') a.lastSdk = row;
        else a.lastOperation = row;
      }
      if (state === 'FAILED') {
        if (kind === 'CLEANUP') firstCleanupFailure ??= row;
        else firstFailure ??= row;
      }
      if (kind === 'SDK' && error) firstCallbackError ??= row;
    });
  };
  const context = (index: number | null = null, cleanup = false) => {
    const stack: { stage: CapacityLiveStage; position: number | null }[] = [];
    const kind = cleanup ? 'CLEANUP' : 'OPERATION';
    return {
      enter: (s: CapacityLiveStage, position: number | null = null) => {
        guard(() => {
          if (stack.length >= 16) throw Error();
          stack.push({ stage: s, position });
        });
        record(s, 'ENTERED', index, position, kind);
      },
      returned: (until?: CapacityLiveStage) => {
        if (sealed) {
          late = true;
          return;
        }
        if (!stack.length) {
          poison = true;
          return;
        }
        if (until && !stack.some((x) => x.stage === until)) {
          guard(() => {
            throw Error();
          });
          return;
        }
        do {
          const top = stack.pop();
          if (!top) break;
          record(top.stage, 'RETURNED', index, top.position, kind);
          if (!until || top.stage === until) break;
        } while (stack.length);
      },
      rejected: (fallback: CapacityLiveStage) => {
        const top = stack.pop();
        stack.length = 0;
        record(
          top?.stage ?? fallback,
          'FAILED',
          index,
          top?.position ?? null,
          kind,
          undefined,
          { predicate: false },
        );
      },
      failed: (error: unknown) => {
        const top = stack.pop();
        stack.length = 0;
        record(
          top?.stage ?? 'UNOBSERVED',
          'FAILED',
          index,
          top?.position ?? null,
          kind,
          { value: error },
        );
      },
      caught: (error: unknown) => {
        const top = stack.at(-1);
        record(
          top?.stage ?? 'UNOBSERVED',
          'NOTE',
          index,
          top?.position ?? null,
          kind,
          { value: error },
        );
      },
      predicate: (s: CapacityLiveStage, ok: boolean) => {
        record(s, ok ? 'RETURNED' : 'FAILED', index, null, kind, undefined, {
          predicate: ok,
        });
      },
    };
  };
  const build = () => ({
    schemaVersion: 1 as const,
    authority: 'NON_AUTHORITY' as const,
    executionAuthority: 'NONE' as const,
    clock: 'NODE_PERFORMANCE' as const,
    sealed: true as const,
    collection:
      poison || late
        ? ('UNAVAILABLE' as const)
        : count > 64 ||
            [...actors.values()].some(
              (a) =>
                (a.join?.eventsTruncated ?? false) ||
                (a.realtime !== null && a.realtime.collection !== 'OBSERVED'),
            )
          ? ('PARTIAL' as const)
          : count
            ? ('OBSERVED' as const)
            : ('UNOBSERVED' as const),
    lateDiscarded: late,
    eventCount: count,
    droppedEvents: Math.max(0, count - head.length - tail.length),
    counters,
    firstFailure,
    firstCleanupFailure,
    firstCallbackError,
    head,
    tail,
    ...(questionObservation ? { questionObservation } : {}),
    actors: [...actors.values()].sort((a, b) => a.actorIndex - b.actorIndex),
  });
  return {
    context,
    question: (value: unknown) => {
      guard(() => {
        dataOnly(value);
        questionObservation =
          capacityLiveQuestionObservationSchema.parse(value);
      });
    },
    sdk: (index: number, event: LiveGateObservation) => {
      try {
        if (
          types.isProxy(event) ||
          Object.values(Object.getOwnPropertyDescriptors(event)).some(
            (d) => !('value' in d),
          )
        )
          throw Error();
        const parsedStatus = status.safeParse(event.status ?? null);
        record(
          event.stage,
          'NOTE',
          index,
          null,
          'SDK',
          event.error === undefined ? undefined : { value: event.error },
          {
            status: parsedStatus.success ? parsedStatus.data : 'UNKNOWN',
            refusal: event.refusal ?? null,
            explicit: event.explicit ?? null,
            removal:
              event.removal === undefined
                ? null
                : event.removal === 'ok' ||
                    event.removal === 'error' ||
                    event.removal === 'timed out'
                  ? event.removal
                  : 'UNKNOWN',
          },
        );
      } catch {
        guard(() => {
          throw Error();
        });
      }
    },
    join: (index: number, value: unknown) => {
      guard(() => {
        dataOnly(value);
        const parsed = browserJoinSnapshotSchema.parse(value);
        if (parsed.actorIndex !== index) throw Error();
        actor(index).join = parsed;
      });
    },
    captureRealtime: (index: number, value: PageDiagnostics) => {
      guard(() => {
        try {
          if (types.isProxy(value)) throw Error();
          const method = value.safeRealtimeSnapshot;
          if (method === undefined) {
            actor(index).realtime = missingRealtime();
            return;
          }
          const raw: unknown = method.call(value);
          dataOnly(raw);
          actor(index).realtime = realtime.parse(raw);
        } catch {
          poison = true;
          actor(index).realtime = { collection: 'UNAVAILABLE' };
        }
      });
    },
    seal: () => {
      if (saved && !late) return saved;
      try {
        const value = build();
        const raw = JSON.stringify(value);
        if (Buffer.byteLength(raw) > 512 * 1024) throw Error();
        saved = freeze(JSON.parse(raw) as ReturnType<typeof build>);
        sealed = true;
        return saved;
      } catch {
        poison = true;
        sealed = true;
        return freeze({
          ...build(),
          collection: 'UNAVAILABLE' as const,
          head: [],
          tail: [],
          droppedEvents: count,
          actors: [...actors.values()].map((a) => ({
            ...a,
            join: null,
            realtime: null,
          })),
        });
      }
    },
  };
};
