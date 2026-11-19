import { beginCapacityLiveStateRead } from '../../../scripts/concurrency/capacity-live-question-observation';
import { performance } from 'node:perf_hooks';

import type { Page, Request } from '@playwright/test';

import { stateSchema } from '../../../src/features/live/api/live-repository-schemas';

export type LiveDiagnosticReason =
  | 'auth'
  | 'permission'
  | 'rate_limit'
  | 'connection_limit'
  | 'join_limit'
  | 'transport'
  | 'timeout'
  | 'unknown';
export interface LiveDiagnosticEvent {
  actorIndex: number;
  stage:
    | 'ws_open'
    | 'channel_join'
    | 'channel_ack'
    | 'snapshot'
    | 'ui_ready'
    | 'closed';
  outcome: 'ok' | 'error' | 'timeout';
  elapsedMs: number;
  reason?: LiveDiagnosticReason;
}

type SafeRealtimeFrame = Readonly<{
  event: 'phx_close' | 'phx_error' | 'phx_join' | 'phx_reply';
  isLiveTopic: boolean;
  ref: string | null;
  replyStatus: 'error' | 'ok' | null;
}>;

export const decodeSafeRealtimeFrame = (
  raw: string | Buffer,
): SafeRealtimeFrame | null => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(typeof raw === 'string' ? raw : raw.toString('utf8'));
  } catch {
    return null;
  }
  const objectFrame =
    typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  const arrayFrame: readonly unknown[] | undefined = Array.isArray(parsed)
    ? (parsed as readonly unknown[])
    : undefined;
  const event: unknown = objectFrame?.event ?? arrayFrame?.[3];
  if (
    event !== 'phx_join' &&
    event !== 'phx_reply' &&
    event !== 'phx_error' &&
    event !== 'phx_close'
  ) {
    return null;
  }
  const topic: unknown = objectFrame?.topic ?? arrayFrame?.[2];
  const ref: unknown = objectFrame?.ref ?? arrayFrame?.[1];
  const payload: unknown = objectFrame?.payload ?? arrayFrame?.[4];
  const replyStatus =
    typeof payload === 'object' &&
    payload !== null &&
    !Array.isArray(payload) &&
    ((payload as Record<string, unknown>).status === 'ok' ||
      (payload as Record<string, unknown>).status === 'error')
      ? ((payload as Record<string, unknown>).status as 'error' | 'ok')
      : null;
  return {
    event,
    isLiveTopic: typeof topic === 'string' && topic.includes('live-session:'),
    ref: typeof ref === 'string' ? ref : null,
    replyStatus,
  };
};

const recordObject = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

export const classifyLiveDiagnosticReason = (
  value: unknown,
): LiveDiagnosticReason => {
  if (typeof value !== 'string') return 'unknown';
  switch (value.toLowerCase()) {
    case 'auth':
    case 'token has expired':
    case 'invalid token':
    case 'jwt expired':
      return 'auth';
    case 'permission':
    case 'unauthorized':
    case 'forbidden':
      return 'permission';
    case 'rate_limit':
    case 'too many requests':
      return 'rate_limit';
    case 'connection_limit':
    case 'too_many_connections':
      return 'connection_limit';
    case 'join_limit':
    case 'too_many_joins':
      return 'join_limit';
    case 'transport':
      return 'transport';
    case 'timeout':
      return 'timeout';
    default:
      return 'unknown';
  }
};

const frameReason = (raw: string | Buffer): LiveDiagnosticReason => {
  try {
    const parsed: unknown = JSON.parse(
      typeof raw === 'string' ? raw : raw.toString('utf8'),
    );
    const payload = recordObject(
      recordObject(parsed)?.payload ??
        (Array.isArray(parsed) ? parsed[4] : undefined),
    );
    return classifyLiveDiagnosticReason(
      recordObject(payload?.response)?.reason ?? payload?.reason,
    );
  } catch {
    return 'unknown';
  }
};

export const createLiveConnectionDiagnostics = (
  now: () => number = () => performance.now(),
) => {
  let generation = 0;
  let actorIndex = 0;
  let startedAt = 0;
  const events: LiveDiagnosticEvent[] = [];
  const pending = new Set<string>();
  const record = (
    sourceGeneration: number,
    stage: LiveDiagnosticEvent['stage'],
    outcome: LiveDiagnosticEvent['outcome'],
    reason?: unknown,
  ) => {
    if (
      generation === 0 ||
      sourceGeneration !== generation ||
      events.length >= 128
    )
      return;
    const elapsed = now() - startedAt;
    if (!Number.isFinite(elapsed)) return;
    events.push({
      actorIndex,
      stage,
      outcome,
      elapsedMs: Math.max(0, elapsed),
      ...(reason === undefined
        ? {}
        : { reason: classifyLiveDiagnosticReason(reason) }),
    });
  };
  return {
    beginGeneration: (index: number) => {
      if (!Number.isSafeInteger(index) || index < 1)
        throw new Error('LIVE_DIAGNOSTIC_ACTOR_INVALID');
      actorIndex = index;
      startedAt = now();
      generation += 1;
      pending.clear();
      events.length = 0;
      return generation;
    },
    generation: () => generation,
    record,
    frame: (
      sourceGeneration: number,
      direction: 'sent' | 'received',
      raw: string | Buffer,
    ) => {
      if (sourceGeneration !== generation || generation === 0) return;
      const frame = decodeSafeRealtimeFrame(raw);
      if (!frame?.isLiveTopic) return;
      if (
        direction === 'sent' &&
        frame.event === 'phx_join' &&
        frame.ref &&
        pending.size < 16
      ) {
        pending.add(frame.ref);
        record(sourceGeneration, 'channel_join', 'ok');
      } else if (
        direction === 'received' &&
        frame.event === 'phx_reply' &&
        frame.ref &&
        pending.delete(frame.ref)
      ) {
        record(
          sourceGeneration,
          'channel_ack',
          frame.replyStatus === 'ok' ? 'ok' : 'error',
          frame.replyStatus === 'ok' ? undefined : frameReason(raw),
        );
      } else if (
        direction === 'received' &&
        (frame.event === 'phx_error' || frame.event === 'phx_close')
      ) {
        record(
          sourceGeneration,
          'closed',
          'error',
          frame.event === 'phx_error' ? frameReason(raw) : 'transport',
        );
      }
    },
    events: () => events.map((event) => ({ ...event })),
  };
};

export type LiveConnectionDiagnostics = ReturnType<
  typeof createLiveConnectionDiagnostics
>;
export const liveDiagnosticsForPage = new WeakMap<
  Page,
  LiveConnectionDiagnostics
>();

// Only the actual state RPC response with a valid production schema is a snapshot.
// Request generation is captured before the response can arrive late.
export const observeLiveSnapshots = (
  page: Page,
  diagnostics: LiveConnectionDiagnostics,
) => {
  const generations = new WeakMap<Request, number>();
  const reads = new WeakMap<
    Request,
    ReturnType<typeof beginCapacityLiveStateRead>
  >();
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      new URL(request.url()).pathname === '/rest/v1/rpc/get_live_session_state'
    ) {
      generations.set(request, diagnostics.generation());
      reads.set(
        request,
        beginCapacityLiveStateRead(page, request, diagnostics.generation()),
      );
    }
  });
  page.on('response', (response) => {
    const generation = generations.get(response.request());
    if (generation === undefined) return;
    if (!response.ok()) {
      diagnostics.record(
        generation,
        'snapshot',
        'error',
        response.status() === 401
          ? 'auth'
          : response.status() === 403
            ? 'permission'
            : response.status() === 429
              ? 'rate_limit'
              : 'unknown',
      );
      return;
    }
    const task = response
      .json()
      .then((body: unknown) => {
        const parsed = stateSchema.safeParse(body);
        diagnostics.record(
          generation,
          'snapshot',
          parsed.success ? 'ok' : 'error',
        );
        try {
          if (parsed.success && diagnostics.generation() === generation)
            reads.get(response.request())?.complete(parsed.data);
        } catch {
          /* Optional passive projection cannot alter the original event. */
        }
      })
      .catch(() => {
        diagnostics.record(generation, 'snapshot', 'error', 'transport');
      });
    try {
      reads.get(response.request())?.track(task);
    } catch {
      /* Passive only. */
    }
  });
};

export const liveDiagnosticStageTimings = (
  events: readonly LiveDiagnosticEvent[],
) => {
  const elapsed = (stage: LiveDiagnosticEvent['stage']) =>
    events.find((event) => event.stage === stage && event.outcome === 'ok')
      ?.elapsedMs ?? null;
  return {
    ws_open: elapsed('ws_open'),
    channel_join: elapsed('channel_join'),
    channel_ack: elapsed('channel_ack'),
    snapshot: elapsed('snapshot'),
    ui_ready: elapsed('ui_ready'),
    closed: elapsed('closed'),
  };
};
