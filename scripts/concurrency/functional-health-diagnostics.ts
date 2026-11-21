import {
  browserDiagnosticSchema,
  emptyBrowserDiagnostic,
  readBrowserDiagnostic,
  imageContextSchema,
  emptyImageContext,
  imageFailureCode,
  imageAsset,
} from './functional-image-diagnostics';
import {
  functionalMediaContextSchema,
  emptyFunctionalMediaContext,
} from './functional-media-observation';
import { z } from 'zod';
import type { FunctionalScope } from './config';
import { functionalStages, type FunctionalStage } from './functional-receipt';
import type { NetworkRecord } from './functional-network-event';
import { resourceCode } from './functional-network-event';
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const unavailableBranches = [
  'IMAGE_PROOF_UNAVAILABLE',
  'WORK_LIMIT',
  'WORK_REJECTED',
  'REQUEST_LIMIT',
  'POST_DATA_UNAVAILABLE',
  'REQUEST_PARSE',
  'RESPONSE_GAP',
  'RESPONSE_PARSE',
  'FAILURE_PARSE',
  'FINISH_GAP',
  'LOG_PARSE',
  'CDP_ATTACH',
  'READY_REJECTED',
  'CDP_DETACH',
  'LATE_EVENT',
] as const;
const availability = new Set<string>(unavailableBranches);
const branches = [
  'CONSOLE_UNCLASSIFIED',
  'CONSOLE_READ_ERROR',
  'PAGE_ERROR',
  'UNDECLARED_LOGOUT',
  'HTTP_5XX',
  'IMAGE_PROOF_REJECTED',
  'UNAPPROVED_FAILURE',
  'HTTP_4XX',
  'REFRESH_CODE_REJECTED',
  'LOG_UNMATCHED',
  'LOG_UNAPPROVED',
  'UNMATCHED_CONSOLE',
  'UNPROVEN_NETWORK_LOG',
  'PENDING_ERROR',
  ...unavailableBranches,
] as const;
export type HealthDiagnosticBranch = (typeof branches)[number];
const names = [
  'Error',
  'TypeError',
  'ReferenceError',
  'SyntaxError',
  'RangeError',
  'OTHER',
] as const;
const codes = [
  'ERR_FAILED',
  'ERR_ABORTED',
  'ERR_CONNECTION_REFUSED',
  'ERR_CONNECTION_CLOSED',
  'ERR_NAME_NOT_RESOLVED',
  'ERR_TIMED_OUT',
  'ERR_BLOCKED_BY_CLIENT',
] as const;
const endpoint = z.enum([
  'MEDIA',
  'REFRESH',
  'LOGOUT',
  'AUTH',
  'RPC',
  'FUNCTION',
  'APP_DOCUMENT',
  'APP_ASSET',
  'APP_IMAGE',
  'OTHER_LOCAL',
  'FOREIGN_OR_INVALID',
  'UNKNOWN',
]);
const phaseSchema = z.enum(functionalStages).nullable();
const componentsSchema = z.strictObject({
  unexpected: count,
  pageErrors: count,
  unmatchedConsole: count,
  unprovenNetworkLogs: count,
  pendingErrors: count,
});
const eventSchema = z.strictObject({
  seq: count.positive(),
  eventPhase: phaseSchema,
  currentPhase: phaseSchema,
  pageOrdinal: count.positive().nullable(),
  requestOrdinal: count.positive().nullable(),
  closedBranch: z.enum(branches),
  endpoint: endpoint,
  httpStatus: z.number().int().min(100).max(599).nullable(),
  networkCode: z.enum(['NONE', ...codes, 'HTTP_DENIED', 'OTHER']),
  errorName: z.enum(names),
  assetOrdinal: count.positive().max(1000).nullable(),
  line: count.positive().max(10000000).nullable(),
  column: count.positive().max(10000000).nullable(),
  occurrences: count.positive(),
  mediaContext: functionalMediaContextSchema,
  imageContext: imageContextSchema.default(emptyImageContext),
});
export const functionalHealthDetailsSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    browser: browserDiagnosticSchema.default(emptyBrowserDiagnostic),
    collection: z.enum(['OBSERVED', 'UNAVAILABLE']),
    components: componentsSchema.nullable(),
    events: z.array(eventSchema).max(256),
    droppedCount: count,
  })
  .refine(
    (value) => value.collection !== 'OBSERVED' || value.components !== null,
    { message: 'HEALTH_DETAILS_COMPONENTS_REQUIRED' },
  );
export type FunctionalHealthDetails = z.infer<
  typeof functionalHealthDetailsSchema
>;
type LogEntry = Record<'text', string> &
  Partial<Record<'url' | 'networkRequestId', string | undefined>>;
type Meta = Omit<
  z.infer<typeof eventSchema>,
  'seq' | 'currentPhase' | 'closedBranch' | 'occurrences'
>;
const unknownPosition = () => ({
  assetOrdinal: null,
  line: null,
  column: null,
});
const networkCode = (text: string): Meta['networkCode'] => {
  if (text.length > 4096) return 'OTHER';
  for (const code of codes)
    if (
      text === `net::${code}` ||
      text === `Failed to load resource: net::${code}`
    )
      return code;
  return resourceCode(text) === 'denied' ? 'HTTP_DENIED' : 'OTHER';
};
export const createFunctionalHealthDiagnostics = (
  scope: FunctionalScope,
  phase: () => FunctionalStage | null,
  approved: readonly string[],
) => {
  const app = new URL(scope.appUrl).origin,
    api = new URL(scope.supabaseUrl).origin;
  let bad = false,
    sealed = false,
    sequence = 0,
    ordinal = 0,
    dropped = 0;
  const events: z.infer<typeof eventSchema>[] = [],
    metadata = new Map<string, Meta>(),
    candidates = new Map<string, Meta>();
  const consoles = new Map<number, Meta>(),
    logs = new Map<number, Meta>(),
    derivedIds = new Map<string, number>();
  let derived: z.infer<typeof eventSchema>[] = [];
  let components: z.infer<typeof componentsSchema> = {
    unexpected: 0,
    pageErrors: 0,
    unmatchedConsole: 0,
    unprovenNetworkLogs: 0,
    pendingErrors: 0,
  };
  const paths = [...approved];
  let browser = readBrowserDiagnostic(null);
  if (
    paths.length > 1000 ||
    new Set(paths).size !== paths.length ||
    paths.some(
      (p) =>
        !/^\/assets\/[A-Za-z0-9_./-]+\.(js|css)$/u.test(p) ||
        new URL(p, app).pathname !== p,
    )
  )
    bad = true;
  const current = () => {
    try {
      return phaseSchema.parse(phase());
    } catch {
      bad = true;
      return null;
    }
  };
  const family = (raw: string): z.infer<typeof endpoint> => {
    try {
      const u = new URL(raw);
      if (u.origin === api) {
        if (u.pathname === '/functions/v1/content-media') return 'MEDIA';
        if (u.pathname === '/auth/v1/logout') return 'LOGOUT';
        if (
          u.pathname === '/auth/v1/token' &&
          u.search === '?grant_type=refresh_token'
        )
          return 'REFRESH';
        if (u.pathname.startsWith('/auth/v1/')) return 'AUTH';
        if (u.pathname.startsWith('/rest/v1/rpc/')) return 'RPC';
        if (u.pathname.startsWith('/functions/v1/')) return 'FUNCTION';
        return 'OTHER_LOCAL';
      }
      if (u.origin !== app || !['http:', 'https:'].includes(u.protocol))
        return 'FOREIGN_OR_INVALID';
      return /\.(js|css)$/u.test(u.pathname)
        ? 'APP_ASSET'
        : /\.(webp|png|jpg|svg)$/u.test(u.pathname)
          ? 'APP_IMAGE'
          : 'APP_DOCUMENT';
    } catch {
      return 'FOREIGN_OR_INVALID';
    }
  };
  const position = (input: unknown) => {
    if (!input || typeof input !== 'object') return unknownPosition();
    const loc = input as {
      url?: unknown;
      lineNumber?: unknown;
      columnNumber?: unknown;
    };
    if (typeof loc.url !== 'string' || loc.url.length > 32768)
      return unknownPosition();
    try {
      const u = new URL(loc.url),
        index = paths.indexOf(u.pathname);
      if (
        u.origin !== app ||
        loc.url !== app + u.pathname ||
        index < 0 ||
        u.search ||
        u.hash ||
        !['http:', 'https:'].includes(u.protocol) ||
        !Number.isInteger(loc.lineNumber) ||
        !Number.isInteger(loc.columnNumber)
      )
        return unknownPosition();
      const line = Number(loc.lineNumber) + 1,
        column = Number(loc.columnNumber) + 1;
      return line > 0 && line <= 10000000 && column > 0 && column <= 10000000
        ? { assetOrdinal: index + 1, line, column }
        : unknownPosition();
    } catch {
      return unknownPosition();
    }
  };
  const stackPosition = (raw: unknown) => {
    if (typeof raw !== 'string' || Buffer.byteLength(raw) > 16384)
      return unknownPosition();
    const found = new Map<string, ReturnType<typeof position>>();
    for (const line of raw.split('\n').slice(1, 129)) {
      const match =
        /^\s*at (?:[^()]{1,256}\s\()?((?:https?:\/\/)[^\s()]+):([0-9]{1,8}):([0-9]{1,8})\)?\s*$/u.exec(
          line,
        );
      if (!match) continue;
      const item = position({
        url: match[1],
        lineNumber: Number(match[2]) - 1,
        columnNumber: Number(match[3]) - 1,
      });
      if (item.assetOrdinal !== null) found.set(JSON.stringify(item), item);
    }
    return found.size === 1 ? [...found.values()][0] : unknownPosition();
  };
  const empty = (page: number | null = null): Meta => ({
    eventPhase: current(),
    pageOrdinal: page,
    requestOrdinal: null,
    endpoint: 'UNKNOWN',
    httpStatus: null,
    networkCode: 'NONE',
    errorName: 'OTHER',
    ...unknownPosition(),
    mediaContext: emptyFunctionalMediaContext(),
    imageContext: emptyImageContext(),
  });
  const key = (page: number, id: string) => `${String(page)}:${id}`;
  const make = (
    branch: HealthDiagnosticBranch,
    meta: Meta,
    occurrences = 1,
    seq = ++sequence,
  ) =>
    eventSchema.parse({
      ...meta,
      seq,
      currentPhase: current(),
      closedBranch: branch,
      occurrences,
    });
  const append = (branch: HealthDiagnosticBranch, meta: Meta) => {
    try {
      if (events.length >= 256) {
        dropped++;
        bad = true;
        return;
      }
      const event = make(branch, meta);
      event.mediaContext = meta.mediaContext;
      event.imageContext = meta.imageContext;
      events.push(event);
    } catch {
      bad = true;
    }
  };
  const note = (
    branch: HealthDiagnosticBranch,
    page: number | null = null,
    id?: string,
    error?: unknown,
  ) => {
    try {
      if (sealed) {
        bad = true;
        append('LATE_EVENT', empty(page));
        return;
      }
      if (availability.has(branch)) bad = true;
      let meta =
        id && page !== null
          ? (metadata.get(key(page, id)) ?? empty(page))
          : empty(page);
      if (branch.startsWith('CONSOLE')) meta = consoles.get(page ?? -1) ?? meta;
      if (branch.startsWith('LOG_') && meta.requestOrdinal === null)
        meta = logs.get(page ?? -1) ?? meta;
      if (branch === 'PAGE_ERROR') {
        const value = error as { name?: unknown; stack?: unknown } | null;
        const name = value?.name;
        meta = {
          ...meta,
          errorName: names.some((n) => n === name)
            ? (name as Meta['errorName'])
            : 'OTHER',
          ...stackPosition(value?.stack),
        };
      }
      append(branch, meta);
    } catch {
      bad = true;
    }
  };
  const touch = () => {
    if (!sealed) return !bad;
    note('LATE_EVENT');
    return false;
  };
  const amend = (page: number, id: string, values: Partial<Meta>) => {
    if (!touch()) return;
    const meta = metadata.get(key(page, id));
    return meta ? Object.assign(meta, values) : undefined;
  };
  return {
    note,
    browser(raw: unknown) {
      if (!touch()) return;
      browser = readBrowserDiagnostic(raw);
    },
    browserAvailable: () => browser.collection === 'OBSERVED',
    available: () => !bad,
    invalidate: () => {
      bad = true;
    },
    seal: () => {
      sealed = true;
    },
    request: (
      page: number,
      event: { requestId: string; request: { url: string } },
      mediaContext = emptyFunctionalMediaContext(),
      imageContext = emptyImageContext(),
    ) => {
      try {
        if (!touch()) return;
        const k = key(page, event.requestId);
        if (!metadata.has(k) && metadata.size >= 2000) {
          bad = true;
          return;
        }
        metadata.set(k, {
          ...empty(page),
          requestOrdinal: metadata.get(k)?.requestOrdinal ?? ++ordinal,
          endpoint: family(event.request.url),
          mediaContext,
          imageContext,
        });
      } catch {
        bad = true;
      }
    },
    response: (page: number, id: string, status: number) =>
      amend(page, id, {
        httpStatus:
          Number.isInteger(status) && status >= 100 && status <= 599
            ? status
            : null,
      }),
    failure: (page: number, id: string, text: string) =>
      amend(page, id, { networkCode: networkCode(text) }),
    forget: (page: number, id: string) => {
      if (!touch()) return false;
      return metadata.delete(key(page, id));
    },
    console: (page: number, text: string, location: unknown) => {
      try {
        if (!touch()) return;
        const url = (location as { url?: unknown } | null)?.url;
        consoles.set(page, {
          ...empty(page),
          endpoint: typeof url === 'string' ? family(url) : 'UNKNOWN',
          networkCode: networkCode(text),
          ...position(location),
          imageContext: {
            ...emptyImageContext(),
            ...imageAsset(app, [], url),
            consoleCode: imageFailureCode(text),
          },
        });
      } catch {
        bad = true;
      }
    },
    candidate: (fingerprint: string, page: number) => {
      if (!touch()) return;
      if (!candidates.has(fingerprint) && candidates.size >= 2000) {
        bad = true;
        return;
      }
      const meta = { ...(consoles.get(page) ?? empty(page)) };
      if (candidates.has(fingerprint))
        Object.assign(meta, { eventPhase: null, ...unknownPosition() });
      candidates.set(fingerprint, meta);
    },
    log: (page: number, entry: LogEntry) => {
      if (!touch()) return;
      const meta = entry.networkRequestId
        ? metadata.get(key(page, entry.networkRequestId))
        : null;
      if (meta) {
        meta.networkCode = networkCode(entry.text);
        meta.imageContext.logCode = imageFailureCode(entry.text);
      }
      logs.set(page, {
        ...empty(page),
        ...meta,
        endpoint: meta?.endpoint ?? (entry.url ? family(entry.url) : 'UNKNOWN'),
        networkCode: networkCode(entry.text),
      });
    },
    reconcile: (
      unexpected: number,
      pageErrors: number,
      records: ReadonlyMap<string, NetworkRecord>,
      pw: ReadonlyMap<string, number>,
      proven: ReadonlyMap<string, number>,
      network: ReadonlyMap<string, string>,
      approved: ReadonlySet<string>,
    ) => {
      try {
        const rows = new Map<string, z.infer<typeof eventSchema>>();
        let omitted = 0;
        const add = (
          key: string,
          branch: HealthDiagnosticBranch,
          meta: Meta,
          count = 1,
        ) => {
          if (rows.size >= 256) {
            omitted++;
            return;
          }
          if (!derivedIds.has(key)) derivedIds.set(key, ++sequence);
          rows.set(key, make(branch, meta, count, derivedIds.get(key)));
        };
        let unmatched = 0,
          unproven = 0,
          pending = 0;
        for (const [k, count] of pw) {
          const missing = Math.max(0, count - (proven.get(k) ?? 0));
          if (missing) {
            unmatched += missing;
            add(
              'c:' + k,
              'UNMATCHED_CONSOLE',
              candidates.get(k) ?? empty(),
              missing,
            );
          }
        }
        for (const [k] of network)
          if (!approved.has(k)) {
            unproven++;
            add('n:' + k, 'UNPROVEN_NETWORK_LOG', metadata.get(k) ?? empty());
          }
        for (const [k, record] of records)
          if (
            record.status !== null &&
            record.status >= 400 &&
            !record.finished &&
            !record.failed
          ) {
            pending++;
            add(
              'p:' + k,
              'PENDING_ERROR',
              metadata.get(k) ?? {
                ...empty(record.page),
                eventPhase: record.phase,
              },
            );
          }
        components = componentsSchema.parse({
          unexpected,
          pageErrors,
          unmatchedConsole: unmatched,
          unprovenNetworkLogs: unproven,
          pendingErrors: pending,
        });
        for (const k of derivedIds.keys())
          if (!rows.has(k)) derivedIds.delete(k);
        derived = [...rows.values()];
        omitted += Math.max(0, events.length + rows.size - 256);
        if (omitted) {
          bad = true;
          dropped = Math.max(dropped, omitted);
        }
      } catch {
        bad = true;
      }
    },
    snapshot: (): FunctionalHealthDetails =>
      functionalHealthDetailsSchema.parse({
        schemaVersion: 1,
        browser,
        collection: bad ? 'UNAVAILABLE' : 'OBSERVED',
        components,
        events: [...events, ...derived]
          .sort((a, b) => a.seq - b.seq)
          .slice(0, 256),
        droppedCount: dropped,
      }),
  };
};
