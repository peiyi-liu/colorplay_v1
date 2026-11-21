export const coldEntryMarkers = [
  'ARM',
  'GOTO_ENTER',
  'GOTO_FULFILLED',
  'GOTO_REJECTED',
  'HEADING_FULFILLED',
  'HEADING_REJECTED',
  'FRAME_COMMITTED',
  'DOM_CONTENT_LOADED',
  'LOAD',
  'DOCUMENT_REQUEST',
  'DOCUMENT_RESPONSE',
  'DOCUMENT_FINISHED',
  'CANCELLED',
] as const;
export type ColdEntryMarker = (typeof coldEntryMarkers)[number];
export interface ColdEntryActor {
  arm(): void;
  note(
    kind: ColdEntryMarker,
    data?: { cdpAtMs?: number; status?: number },
  ): void;
  interrupt(): void;
  seal(): void;
}
import { performance } from 'node:perf_hooks';
import { types } from 'node:util';
const required: readonly ColdEntryMarker[] = [
  'ARM',
  'GOTO_ENTER',
  'GOTO_FULFILLED',
  'HEADING_FULFILLED',
  'DOCUMENT_REQUEST',
  'DOCUMENT_RESPONSE',
  'DOCUMENT_FINISHED',
];
const lifecycle: readonly ColdEntryMarker[] = [
  'FRAME_COMMITTED',
  'DOM_CONTENT_LOADED',
  'LOAD',
];
interface Event {
  kind: ColdEntryMarker;
  atNodeMs: number;
  atCdpMs: number | null;
  status: number | null;
}
interface Row {
  actorIndex: number;
  active: boolean;
  sealed: boolean;
  bad: boolean;
  events: Event[];
}
interface Ports {
  now(): number;
  cpu(): NodeJS.CpuUsage;
  elu(): { active: number; idle: number };
}
export const createCapacityColdEntryDiagnostics = (
  actorsExpected: number,
  ports: Ports = {
    now: () => performance.now(),
    cpu: () => process.cpuUsage(),
    elu: () => performance.eventLoopUtilization(),
  },
) => {
  const rows = new Map<number, Row>();
  let sealed = false,
    overflow = false,
    bad =
      !Number.isInteger(actorsExpected) ||
      actorsExpected < 1 ||
      actorsExpected > 60;
  let writing: Promise<void> | undefined;
  let start:
    | { at: number; cpu: NodeJS.CpuUsage; active: number; idle: number }
    | undefined;
  let end: typeof start;
  let boundary: 'LAST_DOCUMENT_CALLBACK' | 'ENTRY_INTERRUPTED' | null = null;
  const safe = (action: () => void) => {
    try {
      action();
    } catch {
      bad = true;
    }
  };
  const stamp = () => {
    const n = ports.now();
    if (!Number.isFinite(n) || n < 0) throw Error();
    return n;
  };
  const usage = () => {
    const at = stamp(),
      cpu = ports.cpu(),
      elu = ports.elu();
    if (
      ![cpu.user, cpu.system, elu.active, elu.idle].every(
        (v) => Number.isFinite(v) && v >= 0,
      )
    )
      throw Error();
    return {
      at,
      cpu: { user: cpu.user, system: cpu.system },
      active: elu.active,
      idle: elu.idle,
    };
  };
  const stopCpu = (kind: NonNullable<typeof boundary>) => {
    if (start && !end) {
      end = usage();
      boundary = kind;
    }
  };
  const seen = (r: Row, kind: ColdEntryMarker) =>
    r.events.some((e) => e.kind === kind);
  const add = (
    r: Row,
    kind: ColdEntryMarker,
    data?: Parameters<ColdEntryActor['note']>[1],
  ) => {
    if (sealed || r.sealed || !r.active) return;
    if (!coldEntryMarkers.includes(kind) || r.events.length >= 12) {
      r.bad = true;
      overflow = true;
      r.active = false;
      r.sealed = true;
      stopCpu('ENTRY_INTERRUPTED');
      return;
    }
    let cdp: number | null = null,
      status: number | null = null;
    if (data !== undefined) {
      const input: unknown = data;
      if (typeof input !== 'object' || input === null || types.isProxy(input))
        throw Error();
      const prototype: unknown = Object.getPrototypeOf(input);
      if (prototype !== Object.prototype && prototype !== null) throw Error();
      for (const key of ['cdpAtMs', 'status'] as const) {
        const d = Object.getOwnPropertyDescriptor(input, key);
        if (d && !('value' in d)) throw Error();
        const value: unknown = d?.value;
        if (value === undefined) continue;
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
          throw Error();
        if (key === 'cdpAtMs') cdp = value;
        else {
          if (!Number.isInteger(value) || value < 100 || value > 599)
            throw Error();
          status = value;
        }
      }
    }
    const at = stamp();
    if (r.events.some((e) => e.atNodeMs > at)) throw Error();
    r.events.push({ kind, atNodeMs: at, atCdpMs: cdp, status });
    if (kind === 'GOTO_ENTER' && !start) start = usage();
    if (
      kind === 'DOCUMENT_REQUEST' &&
      rows.size === actorsExpected &&
      [...rows.values()].every((v) => seen(v, kind))
    )
      stopCpu('LAST_DOCUMENT_CALLBACK');
    if (
      kind === 'GOTO_REJECTED' ||
      kind === 'HEADING_REJECTED' ||
      kind === 'CANCELLED'
    ) {
      r.bad = true;
      r.active = false;
      r.sealed = true;
      stopCpu('ENTRY_INTERRUPTED');
    } else if (required.every((k) => seen(r, k))) {
      r.active = false;
      r.sealed = true;
    }
  };
  const register = (actorIndex: number): ColdEntryActor | undefined => {
    if (
      sealed ||
      !Number.isInteger(actorIndex) ||
      actorIndex < 0 ||
      actorIndex >= actorsExpected ||
      rows.has(actorIndex) ||
      rows.size >= 60
    ) {
      bad = true;
      return undefined;
    }
    const r: Row = {
      actorIndex,
      active: false,
      sealed: false,
      bad: false,
      events: [],
    };
    rows.set(actorIndex, r);
    const interrupt = () => {
      safe(() => {
        if (r.active && !r.sealed) add(r, 'CANCELLED');
      });
    };
    return {
      arm: () => {
        safe(() => {
          if (sealed || r.sealed || r.active) return;
          r.active = true;
          add(r, 'ARM');
        });
      },
      note: (kind, data) => {
        safe(() => {
          add(r, kind, data);
        });
      },
      interrupt,
      seal: () => {
        interrupt();
        r.sealed = true;
        r.active = false;
      },
    };
  };
  const snapshot = (resourcesClosed: boolean) => {
    const actors = [...rows.values()]
      .sort((a, b) => a.actorIndex - b.actorIndex)
      .map((r) => {
        const started = seen(r, 'ARM');
        const request = r.events.find(
            (e) => e.kind === 'DOCUMENT_REQUEST',
          )?.atCdpMs,
          finished = r.events.find(
            (e) => e.kind === 'DOCUMENT_FINISHED',
          )?.atCdpMs;
        const complete =
          request !== null &&
          request !== undefined &&
          finished !== null &&
          finished !== undefined &&
          finished >= request &&
          !r.bad &&
          [...required, ...lifecycle].every((k) => seen(r, k)) &&
          r.events.filter((e) => e.kind === 'DOCUMENT_REQUEST').length === 1 &&
          r.events.some(
            (e) =>
              e.kind === 'DOCUMENT_RESPONSE' &&
              e.status !== null &&
              e.status >= 200 &&
              e.status < 300,
          );
        return {
          actorIndex: r.actorIndex,
          collection: !started
            ? ('UNOBSERVED' as const)
            : complete
              ? ('OBSERVED' as const)
              : ('PARTIAL' as const),
          sealed: r.sealed,
          events: r.events.map((e) => ({ ...e })),
          lifecycle: Object.fromEntries(
            lifecycle.map((k) => [k, seen(r, k) ? 'OBSERVED' : 'UNOBSERVED']),
          ),
        };
      });
    const cpu =
      start &&
      end &&
      end.at >= start.at &&
      end.cpu.user >= start.cpu.user &&
      end.cpu.system >= start.cpu.system &&
      end.active >= start.active &&
      end.idle >= start.idle
        ? {
            collection: 'OBSERVED' as const,
            boundary,
            startAtNodeMs: start.at,
            endAtNodeMs: end.at,
            ownUserCpuMs: (end.cpu.user - start.cpu.user) / 1000,
            ownSystemCpuMs: (end.cpu.system - start.cpu.system) / 1000,
            eluActiveMs: end.active - start.active,
            eluIdleMs: end.idle - start.idle,
          }
        : { collection: 'UNOBSERVED' as const };
    const packet = {
      schemaVersion: 1,
      authority: 'NON_AUTHORITY',
      clocks: ['NODE_MONOTONIC', 'CHROMIUM_NETWORK_MONOTONIC'],
      navigationAck: 'UNOBSERVED',
      browserAndServerShortWindowCpu: 'UNAVAILABLE',
      collection: !actors.some((r) => r.collection !== 'UNOBSERVED')
        ? 'UNOBSERVED'
        : !bad &&
            !overflow &&
            actors.length === actorsExpected &&
            actors.every((r) => r.collection === 'OBSERVED')
          ? 'OBSERVED'
          : 'PARTIAL',
      actorsExpected,
      sealed,
      resourcesClosed,
      overflow,
      cpu,
      actors,
    };
    if (Buffer.byteLength(JSON.stringify(packet)) > 128 * 1024)
      return { ...packet, collection: 'PARTIAL', overflow: true, actors: [] };
    return packet;
  };
  return {
    register,
    snapshot,
    finish: (
      journal: { write(name: string, value: unknown): Promise<unknown> },
      resourcesClosed: boolean,
    ) => {
      if (writing) return writing;
      for (const r of rows.values())
        safe(() => {
          if (r.active) add(r, 'CANCELLED');
          r.sealed = true;
        });
      sealed = true;
      writing = (async () => {
        try {
          await journal.write(
            'cold-entry-diagnostics',
            snapshot(resourcesClosed),
          );
        } catch {
          /* Original result wins. */
        }
      })();
      return writing;
    },
  };
};
export interface ColdEntryJournal {
  write(name: string, value: unknown): Promise<unknown>;
}
export type CapacityColdEntryDiagnostics = ReturnType<
  typeof createCapacityColdEntryDiagnostics
>;
