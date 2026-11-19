import { performance } from 'node:perf_hooks';
import type { Page, Request, Response } from '@playwright/test';
import type { CapacityScope } from './capacity-scope';

type Activity =
  | 'FROM_PAGE'
  | 'SESSION_TOKENS'
  | 'AUTH_SET_SESSION'
  | 'AUTH_GET_USER'
  | 'PROFILE'
  | 'MEMBERSHIP'
  | 'SUBJECT_PROOF';
type Endpoint =
  | 'CHAPTER_MAP'
  | 'TEACHER_OVERVIEW'
  | 'AUTH'
  | 'PROFILE'
  | 'MEMBERSHIP'
  | 'REST_OTHER'
  | 'APP'
  | 'OTHER';
interface Row {
  actorIndex: number;
  endpoint: Endpoint;
  method: 'GET' | 'POST' | 'OTHER';
  requestAtMs: number | null;
  headersAtMs: number | null;
  terminalAtMs: number | null;
  status: number | null;
  terminal: 'PENDING' | 'FINISHED' | 'FAILED';
  canceled: 'UNKNOWN';
  redirected: boolean | null;
  censored: boolean;
  invalid: boolean;
}
interface Group {
  actorIndex: number;
  activity: Activity;
  startAtMs: number | null;
  endAtMs: number | null;
  settlement: 'INCOMPLETE' | 'RESOLVED' | 'REJECTED';
}
const limits = Object.freeze({
  actors: 60,
  perActor: 256,
  page: 8192,
  groups: 512,
  bytes: 4 * 1024 * 1024,
});

/** Callback-clock diagnostics only. Never a CDP SLO or an HTTP/SQL authority. */
export const createCapacityColdNetworkObserver = (
  scope: Pick<CapacityScope, 'appUrl' | 'supabaseUrl'>,
  now: () => number = () => performance.now(),
) => {
  const origins = [
    new URL(scope.appUrl).origin,
    new URL(scope.supabaseUrl).origin,
  ];
  const rows: Row[] = [],
    groups: Group[] = [];
  const actors = new Map<
    number,
    { count: number; anchors: number; anchor: Row | null; detach: () => void }
  >();
  let seen = new WeakMap<Request, Row>();
  const active = new Map<Request, Row>();
  let accepting = true,
    sealed = false,
    written = false,
    fault = false;
  let droppedPageRecords = 0,
    droppedGroups = 0,
    unmatchedEvents = 0;
  let lastClock = -Infinity,
    beginAtMs: number | null = null,
    endAtMs: number | null = null;
  let windowEnd: 'COHORT_READBACK' | 'EARLY_STOP' | null = null;
  let snapshot: ReturnType<typeof project> | undefined;
  const clock = () => {
    const value = now();
    if (!Number.isFinite(value) || value < 0 || value < lastClock) {
      fault = true;
      return null;
    }
    lastClock = value;
    return value;
  };
  const safe = (action: () => void) => {
    if (sealed) return;
    try {
      action();
    } catch {
      fault = true;
    }
  };
  const classify = (raw: string): Endpoint | null => {
    if (raw.length > 8192) {
      fault = true;
      return null;
    }
    const url = new URL(raw);
    if (!origins.includes(url.origin)) return null;
    if (url.origin === origins[1]) {
      if (url.pathname === '/rest/v1/rpc/get_student_chapter_map')
        return 'CHAPTER_MAP';
      if (url.pathname === '/rest/v1/rpc/teacher_classroom_overview')
        return 'TEACHER_OVERVIEW';
      if (url.pathname.startsWith('/auth/v1/')) return 'AUTH';
      if (url.pathname === '/rest/v1/profiles') return 'PROFILE';
      if (url.pathname === '/rest/v1/classroom_memberships')
        return 'MEMBERSHIP';
      if (url.pathname.startsWith('/rest/v1/')) return 'REST_OTHER';
    }
    return url.origin === origins[0] ? 'APP' : 'OTHER';
  };
  const attach = (actor: { actorIndex: number; page: Page }) => {
    safe(() => {
      if (
        !accepting ||
        !Number.isInteger(actor.actorIndex) ||
        actor.actorIndex < 0 ||
        actor.actorIndex >= limits.actors ||
        actors.has(actor.actorIndex)
      ) {
        fault = true;
        return;
      }
      const { actorIndex, page } = actor;
      const state = {
        count: 0,
        anchors: 0,
        anchor: null as Row | null,
        detach: (): void => undefined,
      };
      const request = (req: Request) => {
        safe(() => {
          if (!accepting) return;
          const previous = seen.get(req);
          if (previous) {
            previous.invalid = true;
            fault = true;
            return;
          }
          const endpoint = classify(req.url());
          if (!endpoint) return;
          if (rows.length >= limits.page || state.count >= limits.perActor) {
            droppedPageRecords++;
            fault = true;
            return;
          }
          const method = req.method(),
            at = clock();
          const row: Row = {
            actorIndex,
            endpoint,
            method: method === 'POST' || method === 'GET' ? method : 'OTHER',
            requestAtMs: at,
            headersAtMs: null,
            terminalAtMs: null,
            status: null,
            terminal: 'PENDING',
            canceled: 'UNKNOWN',
            redirected: req.redirectedFrom() !== null,
            censored: false,
            invalid: at === null,
          };
          beginAtMs ??= at;
          state.count++;
          rows.push(row);
          seen.set(req, row);
          active.set(req, row);
          if (
            (endpoint === 'CHAPTER_MAP' || endpoint === 'TEACHER_OVERVIEW') &&
            !state.anchor
          )
            state.anchor = row;
        });
      };
      const response = (res: Response) => {
        safe(() => {
          const row = seen.get(res.request());
          if (!row) {
            if (accepting && classify(res.request().url())) {
              unmatchedEvents++;
              fault = true;
            }
            return;
          }
          if (row.headersAtMs !== null || row.terminal !== 'PENDING') {
            row.invalid = true;
            fault = true;
            return;
          }
          const status = res.status();
          if (!Number.isInteger(status) || status < 100 || status > 599) {
            row.invalid = true;
            fault = true;
            return;
          }
          row.status = status;
          row.headersAtMs = clock();
        });
      };
      const terminal = (req: Request, kind: Row['terminal']) => {
        safe(() => {
          const row = seen.get(req);
          if (!row) {
            if (accepting && classify(req.url())) {
              unmatchedEvents++;
              fault = true;
            }
            return;
          }
          if (row.terminal !== 'PENDING') {
            row.invalid = true;
            fault = true;
            return;
          }
          row.terminal = kind;
          row.terminalAtMs = clock();
          active.delete(req);
          if (kind === 'FINISHED' && row.headersAtMs === null) {
            row.invalid = true;
            fault = true;
          }
          if (
            row.endpoint === 'CHAPTER_MAP' ||
            row.endpoint === 'TEACHER_OVERVIEW'
          ) {
            state.anchors++;
            if (kind !== 'FINISHED' || row.status !== 200 || state.anchors > 1)
              fault = true;
          }
        });
      };
      const finished = (req: Request) => {
        terminal(req, 'FINISHED');
      };
      const failed = (req: Request) => {
        terminal(req, 'FAILED');
      };
      state.detach = () => {
        page.off('request', request);
        page.off('response', response);
        page.off('requestfinished', finished);
        page.off('requestfailed', failed);
      };
      actors.set(actorIndex, state);
      page.on('request', request);
      page.on('response', response);
      page.on('requestfinished', finished);
      page.on('requestfailed', failed);
    });
  };
  const stopAdmission = (
    reason: 'COHORT_READBACK' | 'EARLY_STOP' = 'COHORT_READBACK',
  ) => {
    safe(() => {
      if (!accepting) return;
      accepting = false;
      windowEnd = reason;
      if (reason === 'EARLY_STOP') fault = true;
      endAtMs = clock();
      for (const row of active.values()) row.censored = true;
    });
  };
  const activity = async <T>(
    actorIndex: number,
    kind: Activity,
    action: () => Promise<T>,
  ): Promise<T> => {
    let group: Group | undefined;
    safe(() => {
      if (!accepting || !actors.has(actorIndex)) return;
      if (groups.length >= limits.groups) {
        droppedGroups++;
        fault = true;
        return;
      }
      group = {
        actorIndex,
        activity: kind,
        startAtMs: clock(),
        endAtMs: null,
        settlement: 'INCOMPLETE',
      };
      groups.push(group);
    });
    try {
      const value = await action();
      safe(() => {
        if (group) {
          group.endAtMs = clock();
          group.settlement = 'RESOLVED';
        }
      });
      return value;
    } catch (error) {
      safe(() => {
        if (group) {
          group.endAtMs = clock();
          group.settlement = 'REJECTED';
        }
      });
      throw error;
    }
  };
  function project() {
    const delta = (a: number | null, b: number | null, invalid: boolean) =>
      !invalid && a !== null && b !== null && b >= a ? b - a : null;
    return {
      schemaVersion: 1,
      authority: 'NONE',
      clock: 'NODE_PERFORMANCE_CALLBACK',
      coverage: ['PAGE_FIRSTPARTY_HTTP', 'HARNESS_ACTIVITY_GROUPS'],
      internalHttpSqlTime: 'UNOBSERVED',
      collection:
        actors.size === 0
          ? 'UNOBSERVED'
          : fault ||
              [...actors.values()].some((a) => a.anchors !== 1) ||
              rows.some(
                (r) => r.invalid || r.censored || r.terminal === 'PENDING',
              ) ||
              groups.some((g) => g.settlement === 'INCOMPLETE')
            ? 'PARTIAL'
            : 'OBSERVED',
      limits,
      admissionClosed: !accepting,
      windowEnd,
      beginAtMs,
      endAtMs,
      droppedPageRecords,
      droppedGroups,
      unmatchedEvents,
      pendingAtSeal: active.size,
      actors: [...actors].map(([actorIndex, a]) => ({
        actorIndex,
        anchorCount: a.anchors,
        firstAnchorAtMs: a.anchor?.requestAtMs ?? null,
        firstAnchorTerminalAtMs: a.anchor?.terminalAtMs ?? null,
      })),
      pageRecords: rows.map((row) => ({
        ...row,
        callbackSpans: {
          totalMs: delta(row.requestAtMs, row.terminalAtMs, row.invalid),
          headersMs: delta(row.requestAtMs, row.headersAtMs, row.invalid),
          bodyMs: delta(row.headersAtMs, row.terminalAtMs, row.invalid),
        },
      })),
      harnessGroups: groups.map((g) => ({
        ...g,
        callbackSpanMs: delta(g.startAtMs, g.endAtMs, false),
      })),
    };
  }
  const seal = () => {
    if (snapshot) return snapshot;
    stopAdmission('EARLY_STOP');
    for (const actor of actors.values()) {
      try {
        actor.detach();
      } catch {
        fault = true;
      }
    }
    const value = project();
    sealed = true;
    active.clear();
    seen = new WeakMap();
    actors.clear();
    // JSON roundtrip detaches every mutable row; recursively freeze the closed data projection.
    const freeze = (v: unknown): void => {
      if (v && typeof v === 'object') {
        for (const item of Object.values(v)) freeze(item);
        Object.freeze(v);
      }
    };
    const bytes = JSON.stringify(value);
    snapshot =
      Buffer.byteLength(bytes) <= limits.bytes
        ? (JSON.parse(bytes) as typeof value)
        : {
            ...value,
            collection: 'PARTIAL',
            pageRecords: [],
            harnessGroups: [],
            droppedPageRecords: droppedPageRecords + rows.length,
            droppedGroups: droppedGroups + groups.length,
          };
    rows.length = 0;
    groups.length = 0;
    freeze(snapshot);
    return snapshot;
  };
  const finish = async (journal: {
    write: (name: string, value: unknown) => Promise<unknown>;
  }) => {
    if (written) return;
    written = true;
    try {
      await journal.write('cold-entry-network-diagnostics', seal());
    } catch {
      /* NON_AUTHORITY: retain original stop result/error. */
    }
  };
  return { attach, activity, stopAdmission, seal, finish };
};
