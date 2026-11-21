import { performance } from 'node:perf_hooks';
export const transportBoundaries = [
  'CLIENT_CHANNEL_SEND',
  'SERVER_FRAME_GOTO_ENTER',
  'CDP_NAVIGATE_SEND',
  'CDP_RESPONSE_CALLBACK',
] as const;
export type TransportBoundary = (typeof transportBoundaries)[number];
interface Event {
  kind: TransportBoundary;
  atNodeMs: number;
}
interface Row {
  actorIndex: number;
  ordinal: 1;
  events: Event[];
}
export interface TransportSnapshot {
  authority: 'NONE';
  clock: 'NODE_PERFORMANCE';
  qualification: 'CALLBACK_BOUNDARIES_NOT_WIRE_OR_BROWSER_RECEIVE';
  collection: 'OBSERVED' | 'PARTIAL' | 'UNAVAILABLE';
  sealed: boolean;
  overflow: boolean;
  actors: Row[];
}
export const createTransportDiagnostics = (
  actorsExpected: number,
  ports: {
    now?: () => number;
    sink?: (event: Event & { actorIndex: number; ordinal: 1 }) => void;
  } = {},
) => {
  if (
    !Number.isInteger(actorsExpected) ||
    actorsExpected < 1 ||
    actorsExpected > 60
  )
    throw Error('TRANSPORT_ACTORS_INVALID');
  const rows = new Map<number, Row>();
  let bad = false,
    sealed = false,
    overflow = false,
    last = -Infinity;
  let packet: TransportSnapshot | undefined;
  const fail = () => {
    if (!sealed) bad = true;
  };
  const stamp = () => {
    const value = (ports.now ?? (() => performance.now()))();
    if (!Number.isFinite(value) || value < 0 || value < last)
      throw Error('TRANSPORT_CLOCK_INVALID');
    last = value;
    return value;
  };
  const snapshot = (): TransportSnapshot =>
    packet ?? {
      authority: 'NONE',
      clock: 'NODE_PERFORMANCE',
      qualification: 'CALLBACK_BOUNDARIES_NOT_WIRE_OR_BROWSER_RECEIVE',
      collection: bad
        ? 'PARTIAL'
        : rows.size === actorsExpected &&
            [...rows.values()].every((r) => r.events.length === 4)
          ? 'OBSERVED'
          : [...rows.values()].some((r) => r.events.length > 0)
            ? 'PARTIAL'
            : 'UNAVAILABLE',
      sealed,
      overflow,
      actors: [...rows.values()].map((r) => ({
        ...r,
        events: r.events.map((e) => ({ ...e })),
      })),
    };
  return {
    fail,
    stamp,
    snapshot,
    register: (actorIndex: number) => {
      if (sealed) return false;
      if (
        !Number.isInteger(actorIndex) ||
        actorIndex < 0 ||
        actorIndex >= actorsExpected ||
        rows.has(actorIndex) ||
        rows.size >= 60
      ) {
        fail();
        return false;
      }
      rows.set(actorIndex, { actorIndex, ordinal: 1, events: [] });
      return true;
    },
    record: (actorIndex: number, kind: TransportBoundary, atNodeMs: number) => {
      if (sealed) return;
      const row = rows.get(actorIndex);
      if (
        !row ||
        row.events.length >= 4 ||
        transportBoundaries[row.events.length] !== kind ||
        !Number.isFinite(atNodeMs) ||
        atNodeMs < 0 ||
        row.events.some((e) => e.atNodeMs > atNodeMs)
      ) {
        if (row && row.events.length >= 4) overflow = true;
        fail();
        return;
      }
      row.events.push({ kind, atNodeMs });
      try {
        ports.sink?.({ actorIndex, ordinal: 1, kind, atNodeMs });
      } catch {
        fail();
      }
    },
    seal: () => {
      if (packet) return packet;
      sealed = true;
      packet = snapshot();
      if (Buffer.byteLength(JSON.stringify(packet)) > 65536)
        packet = {
          ...packet,
          collection: 'PARTIAL',
          overflow: true,
          actors: [],
        };
      for (const row of packet.actors) {
        row.events.forEach(Object.freeze);
        Object.freeze(row.events);
        Object.freeze(row);
      }
      Object.freeze(packet.actors);
      Object.freeze(packet);
      return packet;
    },
  };
};
export type TransportDiagnostics = ReturnType<
  typeof createTransportDiagnostics
>;

import { types } from 'node:util';
type Call = (this: unknown, ...args: unknown[]) => unknown;
export type TransportClasses = Readonly<
  Record<'Connection' | 'Frame' | 'FrameDispatcher' | 'CRConnection', unknown>
>;
const object = (v: unknown): v is object =>
  v !== null &&
  (typeof v === 'object' || typeof v === 'function') &&
  !types.isProxy(v);
const callable = (v: unknown): v is Call => typeof v === 'function';
export const transportData = (v: unknown, key: PropertyKey): unknown => {
  if (!object(v)) throw Error('TRANSPORT_SHAPE_INVALID');
  const d = Object.getOwnPropertyDescriptor(v, key);
  if (!d || !Object.hasOwn(d, 'value')) throw Error('TRANSPORT_SHAPE_INVALID');
  const value: unknown = d.value;
  return value;
};
export const transportInstance = (v: unknown, constructor: unknown) =>
  callable(constructor) && v instanceof constructor;
const same = (a: PropertyDescriptor | undefined, b: PropertyDescriptor) =>
  !!a &&
  Object.hasOwn(a, 'value') &&
  ['value', 'writable', 'enumerable', 'configurable'].every(
    (k) => Reflect.get(a, k) === Reflect.get(b, k),
  );
interface Link {
  actorIndex: number;
  connection: object;
  server: boolean;
  sent: boolean;
  done: boolean;
}
interface Change {
  object: object;
  key: PropertyKey;
  original: PropertyDescriptor;
  installed: PropertyDescriptor;
}
const owners = new WeakSet<object>();
const baselines = new WeakMap<
  object,
  { object: object; key: string; descriptor: PropertyDescriptor }[]
>();
export const registerTransportClasses = (classes: TransportClasses) => {
  const key = transportData(classes.FrameDispatcher, 'prototype');
  if (!object(key)) throw Error('TRANSPORT_SHAPE_INVALID');
  if (!baselines.has(key))
    baselines.set(
      key,
      [
        [key, 'goto'],
        [transportData(classes.CRConnection, 'prototype'), '_rawSend'],
        [transportData(classes.CRConnection, 'prototype'), '_onMessage'],
      ].map(([value, name]) => {
        if (!object(value) || typeof name !== 'string')
          throw Error('TRANSPORT_SHAPE_INVALID');
        const descriptor = Object.getOwnPropertyDescriptor(value, name);
        if (
          !descriptor?.configurable ||
          !descriptor.writable ||
          !callable(descriptor.value)
        )
          throw Error('TRANSPORT_SHAPE_INVALID');
        return { object: value, key: name, descriptor };
      }),
    );
  return key;
};
export const installTransportHooks = (
  classes: TransportClasses,
  projection: TransportDiagnostics,
  target: string,
) => {
  const ownerKey = registerTransportClasses(classes);
  if (owners.has(ownerKey)) throw Error('TRANSPORT_OWNER_EXISTS');
  for (const row of baselines.get(ownerKey) ?? [])
    if (
      !same(
        Object.getOwnPropertyDescriptor(row.object, row.key),
        row.descriptor,
      )
    )
      throw Error('TRANSPORT_DESCRIPTOR_CHANGED');
  const rows = new Map<string, Link>(),
    clients = new Set<object>();
  const links = new Map<object, Map<string, Link>>();
  const pending = new Map<
    object,
    Map<number, { row: Link; session: string }>
  >();
  const responses = new Set<object>(),
    changes: Change[] = [];
  let active = true;
  const fail = () => {
    try {
      projection.fail();
    } catch {
      /* Passive. */
    }
  };
  const safe = (action: () => unknown) => {
    if (!active) return;
    try {
      return action();
    } catch {
      fail();
      return;
    }
  };
  const url = (v: unknown) => {
    if (
      typeof v !== 'string' ||
      v.length > 4096 ||
      new URL(v).href !== new URL(target).href
    )
      throw Error('TRANSPORT_TARGET_INVALID');
  };
  const emit = (row: Link, kind: TransportBoundary) => {
    projection.record(row.actorIndex, kind, projection.stamp());
  };
  const replace = (
    value: unknown,
    key: PropertyKey,
    before: (self: unknown, args: unknown[]) => unknown,
    after?: (self: unknown, result: unknown, observed: unknown) => void,
  ) => {
    if (!object(value)) throw Error('TRANSPORT_DESCRIPTOR_INVALID');
    const original = Object.getOwnPropertyDescriptor(value, key),
      fn: unknown = original?.value;
    if (!original?.configurable || !original.writable || !callable(fn))
      throw Error('TRANSPORT_DESCRIPTOR_INVALID');
    const installed = {
      ...original,
      value: function (this: unknown, ...args: unknown[]) {
        const observed = safe(() => before(this, args));
        const result: unknown = Reflect.apply(fn, this, args);
        if (after)
          safe(() => {
            after(this, result, observed);
          });
        return result;
      },
    };
    Object.defineProperty(value, key, installed);
    changes.push({ object: value, key, original, installed });
  };
  const restore = (change: Change) => {
    try {
      if (
        same(
          Object.getOwnPropertyDescriptor(change.object, change.key),
          change.installed,
        )
      )
        Object.defineProperty(change.object, change.key, change.original);
      else fail();
    } catch {
      fail();
    }
  };
  const linkResponse = (connection: object) => {
    if (responses.has(connection)) return;
    replace(
      transportData(connection, '_transport'),
      'onmessage',
      (_self, args) => {
        const message = args[0],
          map = pending.get(connection);
        if (!map || !object(message)) return;
        const d = Object.getOwnPropertyDescriptor(message, 'id');
        if (!d) return;
        if (!Object.hasOwn(d, 'value'))
          throw Error('TRANSPORT_MESSAGE_INVALID');
        const id: unknown = d.value;
        if (typeof id !== 'number') return;
        const observed = map.get(id);
        if (!observed) return;
        if (transportData(message, 'sessionId') !== observed.session)
          throw Error('TRANSPORT_JOIN_INVALID');
        map.delete(id);
        emit(observed.row, 'CDP_RESPONSE_CALLBACK');
        observed.row.done = true;
      },
    );
    responses.add(connection);
  };
  try {
    replace(
      transportData(classes.FrameDispatcher, 'prototype'),
      'goto',
      (self, args) => {
        const guid = transportData(self, '_guid'),
          row = typeof guid === 'string' ? rows.get(guid) : undefined;
        if (!row || row.done) return;
        if (row.server) throw Error('TRANSPORT_JOIN_INVALID');
        url(transportData(args[0], 'url'));
        const frame = transportData(self, '_frame'),
          page = transportData(frame, '_page');
        const main = transportData(page, 'mainFrame');
        if (!callable(main) || Reflect.apply(main, page, []) !== frame)
          throw Error('TRANSPORT_FRAME_INVALID');
        const session = transportData(
          transportData(transportData(page, 'delegate'), '_mainFrameSession'),
          '_client',
        );
        const connection = transportData(session, '_connection'),
          sid = transportData(session, '_sessionId'),
          fid = transportData(frame, '_id');
        if (
          !object(connection) ||
          !transportInstance(connection, classes.CRConnection) ||
          typeof sid !== 'string' ||
          !sid ||
          sid.length > 200 ||
          typeof fid !== 'string' ||
          !fid ||
          fid.length > 200
        )
          throw Error('TRANSPORT_JOIN_INVALID');
        if (!links.has(connection)) links.set(connection, new Map());
        const map = links.get(connection),
          key = JSON.stringify([sid, fid]);
        if (
          !map ||
          map.has(key) ||
          [...links.values()].reduce((n, m) => n + m.size, 0) >= 60
        )
          throw Error('TRANSPORT_JOIN_INVALID');
        map.set(key, row);
        linkResponse(connection);
        row.server = true;
        emit(row, 'SERVER_FRAME_GOTO_ENTER');
      },
    );
    replace(
      transportData(classes.CRConnection, 'prototype'),
      '_rawSend',
      (self, args) => {
        if (args[1] !== 'Page.navigate' || !object(self)) return;
        const row = links
          .get(self)
          ?.get(JSON.stringify([args[0], transportData(args[2], 'frameId')]));
        if (!row || row.done) return;
        if (row.sent) throw Error('TRANSPORT_JOIN_INVALID');
        url(transportData(args[2], 'url'));
        row.sent = true;
        emit(row, 'CDP_NAVIGATE_SEND');
        return { row, session: args[0] };
      },
      (self, result, observed) => {
        if (!observed || !object(self)) return;
        const row = transportData(observed, 'row'),
          session = transportData(observed, 'session');
        if (
          !object(row) ||
          typeof session !== 'string' ||
          typeof result !== 'number' ||
          !Number.isInteger(result) ||
          result <= 0 ||
          [...pending.values()].reduce((n, m) => n + m.size, 0) >= 60
        )
          throw Error('TRANSPORT_PENDING_INVALID');
        // observed is created by the paired hook; recover the original link by identity, never by serialized private IDs.
        const link = [...rows.values()].find((r) => r === row);
        if (!link) throw Error('TRANSPORT_JOIN_INVALID');
        if (!pending.has(self)) pending.set(self, new Map());
        const map = pending.get(self);
        if (!map || map.has(result)) throw Error('TRANSPORT_JOIN_INVALID');
        map.set(result, { row: link, session });
      },
    );
  } catch {
    changes.reverse().forEach(restore);
    throw Error('TRANSPORT_HOOK_UNAVAILABLE');
  }
  owners.add(ownerKey);
  return {
    bind: (actorIndex: number, frame: unknown) =>
      safe(() => {
        if (!transportInstance(frame, classes.Frame))
          throw Error('TRANSPORT_FRAME_INVALID');
        const guid = transportData(frame, '_guid'),
          connection = transportData(frame, '_connection');
        if (
          typeof guid !== 'string' ||
          !guid ||
          guid.length > 200 ||
          !object(connection) ||
          !transportInstance(connection, classes.Connection) ||
          rows.has(guid) ||
          [...rows.values()].some((r) => r.actorIndex === actorIndex) ||
          rows.size >= 60 ||
          !projection.register(actorIndex)
        )
          throw Error('TRANSPORT_JOIN_INVALID');
        rows.set(guid, {
          actorIndex,
          connection,
          server: false,
          sent: false,
          done: false,
        });
        if (!clients.has(connection)) {
          replace(connection, 'onmessage', (_self, args) => {
            if (transportData(args[0], 'method') !== 'goto') return;
            const id = transportData(args[0], 'guid'),
              row = typeof id === 'string' ? rows.get(id) : undefined;
            if (!row || row.done || row.connection !== connection) return;
            url(transportData(transportData(args[0], 'params'), 'url'));
            emit(row, 'CLIENT_CHANNEL_SEND');
          });
          clients.add(connection);
        }
      }),
    uninstall: () => {
      if (!active) return projection.snapshot();
      active = false;
      changes.reverse().forEach(restore);
      rows.clear();
      clients.clear();
      links.clear();
      pending.clear();
      responses.clear();
      owners.delete(ownerKey);
      return projection.seal();
    },
  };
};
