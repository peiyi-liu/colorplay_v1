import { types } from 'node:util';
import { performance } from 'node:perf_hooks';
import type { PrivateJournal } from './private-journal';

export interface CapacityOperationTiming {
  request: (attempt: object, cdpAtMs: number) => void;
  response: (attempt: object, raw: unknown) => void;
  finished: (attempt: object, cdpAtMs: number) => void;
  failed: (attempt: object, cdpAtMs: number) => void;
  dispose: () => void;
}
export const captureOperationTiming = (action: () => void): void => {
  try {
    action();
  } catch {
    /* Optional diagnostics cannot change the original operation. */
  }
};
const fields = [
  'requestTime',
  'sendStart',
  'sendEnd',
  'receiveHeadersStart',
  'receiveHeadersEnd',
] as const;
type Field = (typeof fields)[number];
type Code =
  | 'MISSING_TIMING'
  | 'MISSING_VALUE'
  | 'UNAVAILABLE_VALUE'
  | 'INVALID_VALUE'
  | 'TIMING_ORDER'
  | 'CDP_ORDER'
  | 'NODE_CLOCK'
  | 'HTTP_FAILED'
  | 'CANCELLED'
  | 'MISSING_RESPONSE'
  | 'MISSING_TERMINAL'
  | 'INVALID_PAYLOAD';
interface Row {
  actorIndex: number;
  ordinal: number;
  operation: 'published_content';
  requestAtCdpMs: number | null;
  finishedAtCdpMs: number | null;
  requestCallbackAtNodeMs: number | null;
  responseCallbackAtNodeMs: number | null;
  terminalCallbackAtNodeMs: number | null;
  timing: Record<Field, number | null>;
  status: number | null;
  terminal: 'PENDING' | 'FINISHED' | 'FAILED' | 'CANCELLED';
  codes: Code[];
}
const own = (value: unknown, key: string): unknown => {
  if (!value || typeof value !== 'object' || types.isProxy(value))
    return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && 'value' in descriptor ? descriptor.value : undefined;
};
const finite = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= Number.MAX_SAFE_INTEGER;
const code = (row: Row, value: Code) => {
  if (!row.codes.includes(value)) row.codes.push(value);
};
export const createCapacityOperationTimingDiagnostics = (
  now: () => number = () => performance.now(),
) => {
  const limits = {
    actors: 60,
    perActorAttempts: 8,
    bytes: 256 * 1024,
  } as const;
  const rows: Row[] = [],
    counts = new Map<number, number>();
  const lookup = new WeakMap<object, Row>();
  let sealed = false,
    written = false,
    overflow = false,
    droppedAttempts = 0;
  let snapshot: ReturnType<typeof project> | undefined;
  const clock = (row: Row): number | null => {
    try {
      const at = now();
      if (finite(at)) return at;
    } catch {
      /* Unavailable, not zero. */
    }
    code(row, 'NODE_CLOCK');
    return null;
  };
  const nodeOrder = (row: Row) => {
    const times = [
      row.requestCallbackAtNodeMs,
      row.responseCallbackAtNodeMs,
      row.terminalCallbackAtNodeMs,
    ].filter((v): v is number => v !== null);
    if (times.some((v, i) => i > 0 && v < (times[i - 1] ?? v)))
      code(row, 'NODE_CLOCK');
  };
  const actor = (actorIndex: number): CapacityOperationTiming => {
    const read = (attempt: object) =>
      !sealed ? lookup.get(attempt) : undefined;
    const terminal = (attempt: object, at: number, failed: boolean) => {
      const row = read(attempt);
      if (!row) return;
      if (row.terminal !== 'PENDING') {
        code(row, 'CDP_ORDER');
        return;
      }
      row.terminalCallbackAtNodeMs = clock(row);
      row.finishedAtCdpMs = finite(at) ? at : null;
      row.terminal = failed ? 'FAILED' : 'FINISHED';
      if (failed) code(row, 'HTTP_FAILED');
      if (!finite(at) || row.requestAtCdpMs === null || at < row.requestAtCdpMs)
        code(row, 'CDP_ORDER');
      const { requestTime, receiveHeadersEnd } = row.timing;
      if (
        requestTime !== null &&
        receiveHeadersEnd !== null &&
        requestTime * 1000 + receiveHeadersEnd > at
      )
        code(row, 'TIMING_ORDER');
      nodeOrder(row);
    };
    return {
      request: (attempt, at) => {
        if (sealed) return;
        const ordinal = (counts.get(actorIndex) ?? 0) + 1;
        if (
          !Number.isInteger(actorIndex) ||
          actorIndex < 0 ||
          actorIndex >= limits.actors ||
          ordinal > limits.perActorAttempts
        ) {
          overflow = true;
          droppedAttempts++;
          return;
        }
        counts.set(actorIndex, ordinal);
        const row: Row = {
          actorIndex,
          ordinal,
          operation: 'published_content',
          requestAtCdpMs: finite(at) ? at : null,
          finishedAtCdpMs: null,
          requestCallbackAtNodeMs: null,
          responseCallbackAtNodeMs: null,
          terminalCallbackAtNodeMs: null,
          timing: {
            requestTime: null,
            sendStart: null,
            sendEnd: null,
            receiveHeadersStart: null,
            receiveHeadersEnd: null,
          },
          status: null,
          terminal: 'PENDING',
          codes: [],
        };
        if (!finite(at)) code(row, 'CDP_ORDER');
        row.requestCallbackAtNodeMs = clock(row);
        rows.push(row);
        lookup.set(attempt, row);
      },
      response: (attempt, raw) => {
        const row = read(attempt);
        if (!row) return;
        if (
          row.responseCallbackAtNodeMs !== null ||
          row.terminal !== 'PENDING'
        ) {
          code(row, 'CDP_ORDER');
          return;
        }
        row.responseCallbackAtNodeMs = clock(row);
        const response = own(raw, 'response'),
          status = own(response, 'status');
        if (
          finite(status) &&
          Number.isInteger(status) &&
          status >= 100 &&
          status <= 599
        )
          row.status = status;
        else code(row, 'INVALID_PAYLOAD');
        const timing = own(response, 'timing');
        if (!timing || typeof timing !== 'object' || types.isProxy(timing))
          code(row, 'MISSING_TIMING');
        for (const field of fields) {
          const value = own(timing, field);
          if (finite(value)) row.timing[field] = value;
          else
            code(
              row,
              value === undefined
                ? 'MISSING_VALUE'
                : value === -1
                  ? 'UNAVAILABLE_VALUE'
                  : 'INVALID_VALUE',
            );
        }
        const offsets = fields.slice(1).map((field) => row.timing[field]);
        if (
          offsets.some(
            (v, i) =>
              v !== null &&
              i > 0 &&
              offsets[i - 1] !== null &&
              v < (offsets[i - 1] ?? v),
          )
        )
          code(row, 'TIMING_ORDER');
        nodeOrder(row);
      },
      finished: (attempt, at) => {
        terminal(attempt, at, false);
      },
      failed: (attempt, at) => {
        terminal(attempt, at, true);
      },
      dispose: () => {
        if (sealed) return;
        for (const row of rows)
          if (row.actorIndex === actorIndex && row.terminal === 'PENDING') {
            row.terminal = 'CANCELLED';
            code(row, 'CANCELLED');
          }
      },
    };
  };
  function project(resourcesClosed: boolean) {
    return {
      schemaVersion: 1,
      authority: 'NONE',
      operation: 'published_content',
      clocks: {
        cdp: 'CHROMIUM_NETWORK_MONOTONIC',
        callback: 'NODE_MONOTONIC_HOOK',
      },
      timingUnits: { requestTime: 'CDP_SECONDS', offsets: 'MILLISECONDS' },
      qualification: 'PASSIVE_NETWORK_TIMING_NOT_DB_POOL_OR_TTFB_AUTHORITY',
      collection:
        rows.length === 0
          ? overflow
            ? 'PARTIAL'
            : 'UNOBSERVED'
          : overflow || rows.some((r) => r.codes.length > 0)
            ? 'PARTIAL'
            : 'OBSERVED',
      sealed: true,
      resourcesClosed,
      limits,
      overflow,
      droppedAttempts,
      actorsObserved: counts.size,
      attempts: rows.map((r) => ({
        ...r,
        timing: { ...r.timing },
        codes: [...r.codes],
      })),
    };
  }
  const seal = (resourcesClosed: boolean) => {
    if (snapshot) return snapshot;
    for (const row of rows) {
      if (row.status === null) code(row, 'MISSING_RESPONSE');
      if (row.terminal === 'PENDING' || row.terminal === 'CANCELLED')
        code(row, 'MISSING_TERMINAL');
    }
    sealed = true;
    const value = project(resourcesClosed);
    if (Buffer.byteLength(JSON.stringify(value)) > limits.bytes) {
      value.collection = 'PARTIAL';
      value.overflow = true;
      value.droppedAttempts += value.attempts.length;
      value.attempts = [];
    }
    for (const row of value.attempts) {
      Object.freeze(row.timing);
      Object.freeze(row.codes);
      Object.freeze(row);
    }
    Object.freeze(value.attempts);
    Object.freeze(value.clocks);
    Object.freeze(value.timingUnits);
    Object.freeze(value.limits);
    snapshot = Object.freeze(value);
    return snapshot;
  };
  return {
    actor,
    seal,
    finish: async (journal: PrivateJournal, resourcesClosed: boolean) => {
      if (written) return;
      written = true;
      try {
        await journal.write(
          'published-content-timing-diagnostics',
          seal(resourcesClosed),
        );
      } catch {
        /* Original stop result has priority. */
      }
    },
  };
};
