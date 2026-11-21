import { z } from 'zod';

// NON_AUTHORITY, document-local namespace. Indexes are stable wire enums, not SDK versions.
export const liveTraceEvents = [
  'SDK_CALLBACK',
  'HANDLER_INACTIVE',
  'HANDLER_OLDER',
  'HANDLER_EQUAL',
  'HANDLER_ROSTER',
  'HANDLER_AUTHORITATIVE',
  'SCHED_AUTH',
  'SCHED_ROSTER',
  'SCHED_COALESCE',
  'SCHED_START',
  'SCHED_RETURN',
  'SCHED_FAIL',
  'SCHED_DISPOSE',
  'COORD_ACTIVE',
  'COORD_QUEUE',
  'COORD_COALESCE',
  'READ_START',
  'READ_RETURN',
  'READ_FAIL',
  'READ_THROW',
  'CACHE_UPDATE',
  'WAIT_QUERY',
  'WAIT_PHYSICAL',
  'REFETCH',
  'RECONCILE_RETURN',
  'RECONCILE_DISPOSED',
  'SDK_STATUS',
  'GENERATION_CLOSE',
  'CACHE_REMOVED',
  'QUERY_REQUEST',
  'TRACE_UNAVAILABLE',
  'CACHE_OTHER',
] as const;
type Event = (typeof liveTraceEvents)[number];
export interface LiveTrace {
  event: (event: Event, value?: unknown) => void;
}
interface TraceData {
  v: number;
  g: number;
  o: number;
  c: number[];
  l: number[][];
  p: number[][];
  h: number[][];
  t: number[][];
  f: number[];
  x: boolean;
  q: string;
}
const limit = 1_000_000;
const timeLimit = 86_400_000;
const empty = () => [-1, -1, -1, -1, -1];
const plain = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw Error();
  const proto: unknown = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) throw Error();
  const result = Object.create(null) as Record<string, unknown>;
  for (const [key, descriptor] of Object.entries(
    Object.getOwnPropertyDescriptors(value),
  )) {
    if (!('value' in descriptor)) throw Error();
    result[key] = descriptor.value;
  }
  return result;
};
const number = (value: unknown, max = limit) =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= 0 &&
  value <= max
    ? value
    : -1;
const group = (index: number) =>
  index === 0 || index === 26
    ? 0
    : index <= 5 || index === 30
      ? 1
      : index <= 12
        ? 2
        : index <= 19 || index === 29
          ? 3
          : index === 20 || index >= 28
            ? 4
            : 5;

export const createLiveReconcileDiagnostics = (): LiveTrace | undefined => {
  try {
    if (typeof window === 'undefined') return;
    const parent = Object.getOwnPropertyDescriptor(
      window,
      '__colorplayCapacityRealtime',
    );
    if (!parent || !('value' in parent)) return;
    const slot = plain(plain(parent.value).liveTrace);
    if (slot.v !== 1) return;
    // This is controlled Native data, not an executable global or platform proof.
    const target = Object.getOwnPropertyDescriptor(parent.value, 'liveTrace')
      ?.value as TraceData;
    const generation = number(slot.g ?? 0, 9998) + 1;
    if (generation <= 0) return;
    Object.assign(target, {
      v: 1,
      g: generation,
      o: 0,
      c: Array<number>(32).fill(0),
      l: Array.from({ length: 6 }, empty),
      p: Array.from({ length: 4 }, () => [-1, -1]),
      h: [],
      t: [],
      f: empty(),
      x: false,
      q: '[1,0]',
    });
    const origin = performance.now();
    const event: LiveTrace['event'] = (kind, value) => {
      try {
        if (target.g !== generation) return;
        const index = liveTraceEvents.indexOf(kind);
        if (index < 0 || index === 30 || target.o >= limit) {
          target.x = true;
          target.q = '[1,3]';
          return;
        }
        target.o += 1;
        target.c[index] = Math.min(limit, (target.c[index] ?? 0) + 1);
        const data =
          index === 0
            ? plain(plain(value).payload)
            : value === undefined
              ? {}
              : plain(value);
        const wire = index === 0 || (index >= 2 && index <= 5);
        const version = number(wire ? data.state_version : data.stateVersion);
        if (index === 0 && version < 0) throw Error();
        const position = number(
          wire ? data.current_position : data.currentPosition,
          20,
        );
        const time = number(Math.floor(performance.now() - origin), timeLimit);
        if (time < 0) {
          target.x = true;
          target.q = '[1,3]';
          return;
        }
        const row = [target.o, index, version, position, time];
        if (index !== 26) target.l[group(index)] = row;
        if (target.h.length < 4) target.h.push(row);
        else {
          target.t.push(row);
          if (target.t.length > 12) {
            target.t.shift();
            target.x = true;
          }
        }
        if ([11, 18, 19].includes(index) && target.f[0] === -1) target.f = row;
        const begin = (at: number) => {
          if (target.p[at]?.[0] === -1) target.p[at] = [target.o, time];
        };
        if (index === 6 || index === 7) begin(1);
        if (index === 9) {
          begin(0);
          target.p[1] = [-1, -1];
        }
        if (index === 10 || index === 11) target.p[0] = [-1, -1];
        if (index === 12) target.p[1] = [-1, -1];
        if (index === 14) begin(3);
        if (index === 16) {
          begin(2);
          target.p[3] = [-1, -1];
        }
        if (index >= 17 && index <= 19) target.p[2] = [-1, -1];
        // 79 fixed numbers: header, 32 counters, six last-stage rows,
        // four active/queued start pairs, first failure. No raw payloads.
        target.q = JSON.stringify([
          1,
          target.x ? 2 : 1,
          generation,
          target.o,
          ...target.c,
          ...target.l.flat(),
          ...target.p.flat(),
          ...target.f,
        ]);
      } catch {
        target.x = true;
        target.q = '[1,3]';
      }
    };
    return Object.freeze({ event });
  } catch {
    return;
  }
};

const validProjection = (value: number[]) => {
  if (value.some((v) => !Number.isSafeInteger(v) || Object.is(v, -0)))
    return false;
  if (value.length === 2)
    return value[0] === 1 && [0, 3].includes(value[1] ?? -1);
  if (value.length !== 79 || value[0] !== 1 || ![1, 2].includes(value[1] ?? -1))
    return false;
  if (number(value[2], 9999) < 1 || number(value[3]) < 1) return false;
  if (value.slice(4, 36).reduce((sum, v) => sum + v, 0) !== value[3])
    return false;
  if (value.slice(4, 36).some((v) => number(v) < 0)) return false;
  const validRow = (row: number[]) =>
    row.every((v) => v === -1) ||
    (number(row[0]) >= 0 &&
      number(row[1], 31) >= 0 &&
      (row[2] === -1 || number(row[2]) >= 0) &&
      (row[3] === -1 || number(row[3], 20) >= 0) &&
      number(row[4], timeLimit) >= 0);
  for (let i = 36; i < 66; i += 5)
    if (!validRow(value.slice(i, i + 5))) return false;
  for (let i = 66; i < 74; i += 2)
    if (
      !(value[i] === -1 && value[i + 1] === -1) &&
      !(number(value[i]) >= 0 && number(value[i + 1], timeLimit) >= 0)
    )
      return false;
  return validRow(value.slice(74));
};
export const liveReconcileProjectionSchema = z
  .array(z.number().int())
  .refine(validProjection);

// Node must supply its native Proxy predicate BEFORE any reflection/schema read.
export const captureLiveReconcileProjection = (
  raw: unknown,
  isProxy: (value: object) => boolean,
): number[] => {
  try {
    if (typeof raw === 'string') {
      if (
        raw.length > 768 ||
        !/^\[(?:0|[1-9]\d*|-1)(?:,(?:0|[1-9]\d*|-1))*\]$/u.test(raw)
      )
        throw Error();
      raw = JSON.parse(raw) as unknown;
    }
    if (
      typeof raw !== 'object' ||
      raw === null ||
      isProxy(raw) ||
      !Array.isArray(raw)
    )
      throw Error();
    if (Object.getPrototypeOf(raw) !== Array.prototype) throw Error();
    const descriptors = Object.getOwnPropertyDescriptors(raw);
    const length: unknown = Object.getOwnPropertyDescriptor(
      raw,
      'length',
    )?.value;
    if (
      typeof length !== 'number' ||
      length > 79 ||
      Object.keys(descriptors).length !== length + 1
    )
      throw Error();
    const values = Array.from({ length }, (_, index) => {
      const descriptor = descriptors[String(index)];
      if (
        !descriptor ||
        !('value' in descriptor) ||
        typeof descriptor.value !== 'number'
      )
        throw Error();
      return descriptor.value;
    });
    const value = liveReconcileProjectionSchema.parse(values);
    if (new TextEncoder().encode(JSON.stringify(value)).length > 768)
      throw Error();
    return value;
  } catch {
    return [1, 3];
  }
};

export const emitLiveTrace = (
  trace: LiveTrace | undefined,
  kind: Event,
  value?: unknown,
) => {
  try {
    trace?.event(kind, value);
  } catch {
    /* Observation never owns the operation. */
  }
};
