export type Role = 'HOST' | 'STUDENT';
export type Topic = 'SHARED' | 'HOST_PROGRESS' | 'UNKNOWN';
export type Operation = 'STATE' | 'JOIN' | 'CREATE' | 'OTHER';
export type Event =
  | 'REQUEST'
  | 'RESPONSE'
  | 'FAILED'
  | 'JOIN_SENT'
  | 'ACK_OK'
  | 'ACK_ERROR'
  | 'CHANNEL_ERROR'
  | 'CLOSED'
  | 'BINARY_BROADCAST'
  | 'UNKNOWN';
export type Row = [
  number | null,
  Event,
  Operation | Topic,
  number | null,
  readonly [number, number] | null,
];
import { types } from 'node:util';
import { captureLiveReconcileProjection } from '../../../src/features/live/lib/live-reconcile-diagnostics';
const phases = [
  'draft',
  'lobby',
  'question_open',
  'question_feedback',
  'paused',
  'completed',
  'cancelled',
];
export const own = (raw: unknown): Record<string, unknown> => {
  if (
    !raw ||
    typeof raw !== 'object' ||
    types.isProxy(raw) ||
    Array.isArray(raw)
  )
    throw Error();
  const proto: unknown = Object.getPrototypeOf(raw);
  if (proto !== Object.prototype && proto !== null) throw Error();
  const out: Record<string, unknown> = Object.create(null) as Record<
    string,
    unknown
  >;
  for (const [key, descriptor] of Object.entries(
    Object.getOwnPropertyDescriptors(raw),
  )) {
    if (!('value' in descriptor)) throw Error();
    out[key] = descriptor.value;
  }
  return out;
};
export const numeric = (raw: unknown, max = 1_000_000): number => {
  if (
    typeof raw !== 'number' ||
    !Number.isSafeInteger(raw) ||
    raw < 0 ||
    raw > max ||
    Object.is(raw, -0)
  )
    throw Error();
  return raw;
};
export function publicState(raw: unknown, session: string | undefined) {
  const value = own(raw);
  if (
    !session ||
    value.session_id !== session ||
    typeof value.state !== 'string' ||
    !phases.includes(value.state) ||
    typeof value.is_host !== 'boolean'
  )
    throw Error();
  let rosterLength: number | null = null;
  if (value.participants !== undefined) {
    if (types.isProxy(value.participants) || !Array.isArray(value.participants))
      throw Error();
    rosterLength = numeric(
      Object.getOwnPropertyDescriptor(value.participants, 'length')?.value,
      1000,
    );
  }
  return {
    phase: value.state,
    version: numeric(value.state_version),
    position: numeric(value.current_position, 20),
    isHost: value.is_host,
    participantCount: numeric(value.participant_count, 1000),
    rosterLength,
  };
}

export const binaryTopic = (
  raw: Buffer,
  expected: string,
): 'SHARED' | 'HOST_PROGRESS' | null => {
  if (
    raw.length < 5 ||
    raw.length > 65536 ||
    raw[0] !== 4 ||
    ![0, 1].includes(raw[4] ?? -1)
  )
    throw Error();
  const topicEnd = 5 + (raw[1] ?? 0),
    eventEnd = topicEnd + (raw[2] ?? 0);
  if (eventEnd + (raw[3] ?? 0) > raw.length) throw Error();
  const name = raw.subarray(5, topicEnd).toString('utf8');
  const event = raw.subarray(topicEnd, eventEnd).toString('utf8');
  const match = /^(?:realtime:)?(live-session|live-host-progress):(.+)$/u.exec(
    name,
  );
  return event === 'live_state' && match?.[2] === expected
    ? match[1] === 'live-session'
      ? 'SHARED'
      : 'HOST_PROGRESS'
    : null;
};
export const projectLiveSmokeUi = (raw: unknown) => {
  const v = own(raw);
  const phase =
    typeof v.phase === 'string' &&
    [
      'draft',
      'lobby',
      'question',
      'paused',
      'reveal',
      'completed',
      'cancelled',
      'UNKNOWN',
    ].includes(v.phase)
      ? v.phase
      : 'UNKNOWN';
  for (const key of [
    'presenter',
    'presenterVisible',
    'header',
    'headerVisible',
    'countVisible',
    'error',
  ])
    if (typeof v[key] !== 'boolean') throw Error();
  const connection =
    typeof v.connection === 'string' &&
    ['connected', 'connecting', 'disconnected'].includes(v.connection)
      ? v.connection
      : 'UNKNOWN';
  const view = {
    presenter: v.presenter as boolean,
    presenterVisible: v.presenterVisible as boolean,
    phase,
    header: v.header as boolean,
    headerVisible: v.headerVisible as boolean,
    countVisible: v.countVisible as boolean,
    count: v.count === null ? null : numeric(v.count, 1000),
    connection,
    error: v.error as boolean,
  };
  const values = captureLiveReconcileProjection(v.trace, types.isProxy);
  const trace =
    values.length === 79
      ? {
          clock: 'BROWSER_ORDER_ONLY',
          collection: values[1] === 1 ? 'OBSERVED' : 'PARTIAL',
          counters: values.slice(4, 36),
          last: Array.from({ length: 6 }, (_, i) =>
            values.slice(36 + i * 5, 40 + i * 5),
          ),
          pendingOrdinals: [values[66], values[68], values[70], values[72]],
          firstFailure: values.slice(74, 78),
        }
      : { collection: values[1] === 0 ? 'UNOBSERVED' : 'UNAVAILABLE' };
  return { view, trace };
};

export const classifyLiveSmokeRequest = (
  raw: string,
  method: string,
  origins: readonly string[],
): Operation | null => {
  if (raw.length > 8192) throw Error();
  const url = new URL(raw);
  if (!origins.includes(url.origin) || method !== 'POST') return null;
  const endpoints: Record<string, Operation> = {
    '/rest/v1/rpc/get_live_session_state': 'STATE',
    '/rest/v1/rpc/join_live_session': 'JOIN',
    '/rest/v1/rpc/create_live_session': 'CREATE',
  };
  return endpoints[url.pathname] ?? null;
};

export const callbackHeaderSpan = (start: number | null, end: number | null) =>
  [
    start,
    end,
    start !== null && end !== null && end >= start ? end - start : null,
  ] as const;
export const createLiveSmokeAck = () => {
  let group = 0,
    failed = false;
  const seen = new Set<string>(),
    pending = new Map<string, { topic: Topic; group: number }>(),
    attempted = new Set<Topic>();
  return {
    observe(
      sent: boolean,
      event: string,
      ref: string | null,
      joinRef: string | null,
      topic: Topic,
      status: 'ok' | 'error' | null,
    ): { event: Event; group: number } | null {
      if (sent && event === 'phx_join') {
        if (!ref || seen.has(ref) || seen.size >= 64)
          return { event: 'UNKNOWN', group };
        seen.add(ref);
        if (topic === 'SHARED') {
          group++;
          failed = false;
          pending.clear();
          attempted.clear();
        }
        if (!group || failed || attempted.has(topic))
          return { event: 'UNKNOWN', group };
        attempted.add(topic);
        pending.set(ref, { topic, group });
        return { event: 'JOIN_SENT', group };
      }
      if (!sent && event === 'phx_reply') {
        const item = ref ? pending.get(ref) : undefined;
        if (
          failed ||
          !ref ||
          item?.topic !== topic ||
          item.group !== group ||
          (joinRef !== null && joinRef !== ref)
        )
          return { event: 'UNKNOWN', group };
        pending.delete(ref);
        if (status !== 'ok') failed = true;
        return {
          event:
            status === 'ok'
              ? 'ACK_OK'
              : status === 'error'
                ? 'ACK_ERROR'
                : 'UNKNOWN',
          group,
        };
      }
      if (!sent && (event === 'phx_error' || event === 'phx_close')) {
        failed = true;
        return {
          event: event === 'phx_error' ? 'CHANNEL_ERROR' : 'CLOSED',
          group,
        };
      }
      return null;
    },
    close() {
      failed = true;
      return group;
    },
    clear() {
      seen.clear();
      pending.clear();
      attempted.clear();
    },
  };
};

export interface SmokeObservationData<RequestKey> {
  rows: Row[];
  headerCallbackSpans: ReturnType<typeof callbackHeaderSpan>[];
  drops: number;
  sockets: number;
  stateEpoch: number;
  requests: Map<
    RequestKey,
    { op: Operation; started: number | null; responded: boolean }
  >;
  state: ReturnType<typeof publicState> | null;
}
