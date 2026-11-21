import { performance } from 'node:perf_hooks';
import { errors, type Page, type Request } from '@playwright/test';
import {
  imageBlockedReason,
  imageCorsReason,
  imageFailureCode,
} from './functional-image-diagnostics';
import type { FunctionalScope } from './config';
import type * as Doc from './functional-document-observation-types';
const frames = new WeakMap<Page, Doc.FramePin>();
const owners = new WeakMap<Page, Doc.Owner>();
const routeKind = (o: Doc.Owner, raw: string): Doc.RouteKind => {
  const url = new URL(raw);
  if (
    url.origin !== o.origin ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  )
    return 'OTHER';
  if (url.pathname === '/teacher/live') return 'LIVE_PRESENTER';
  if (
    o.session &&
    (url.pathname === `/teacher/live/${o.session}` ||
      url.pathname === `/app/live/${o.session}`)
  )
    return 'LIVE_SESSION';
  if (o.session && url.pathname === `/teacher/live/${o.session}/report`)
    return 'LIVE_REPORT';
  if (o.classroom && url.pathname === `/teacher/classes/${o.classroom}`)
    return 'CLASSROOM';
  return 'OTHER';
};
const unknown = (o: Doc.Owner, row?: Doc.Row) => {
  o.unavailable = true;
  if (row) row.value.collection = 'UNKNOWN';
};
const passive = (o: Doc.Owner | undefined, action: () => void) => {
  if (!o) return;
  try {
    if (o.closed) {
      unknown(o);
      return;
    }
    action();
  } catch {
    unknown(o);
  }
};
const claim = (
  o: Doc.Owner,
  url: string,
  side: 'route' | 'cdp',
): Doc.Row | undefined => {
  const candidates = o.rows.filter(
    (r) =>
      r.url === url &&
      r.value.generation === o.generation &&
      (side === 'route' ? !r.request : !r.cdp),
  );
  if (candidates.length > 1) {
    for (const r of candidates) unknown(o, r);
    return;
  }
  const row = candidates[0];
  if (row) {
    if (
      o.intent?.state !== 'BEGIN' ||
      row.value.terminal !== 'UNOBSERVED' ||
      row.value.routeClosed
    ) {
      unknown(o, row);
      return;
    }
    return row;
  }
  if (o.rows.length >= 256) {
    unknown(o);
    return;
  }
  const overlapping = o.rows.filter(
    (r) => !r.value.routeClosed || r.value.terminal === 'UNOBSERVED',
  );
  const route = routeKind(o, url);
  const made: Doc.Row = {
    url,
    value: {
      ordinal: o.rows.length + 1,
      actor: o.actor,
      pageOrdinal: o.index,
      generation: o.generation,
      route,
      collection: 'OBSERVED',
      intent: o.intent ? { ...o.intent } : null,
      routeMatched: false,
      routeClosed: false,
      continue: 'NOT_CALLED',
      fallback: 'NOT_CALLED',
      stages: [],
      branch: 'UNOBSERVED',
      routeError: null,
      status: null,
      terminal: 'UNOBSERVED',
      failureCode: 'NONE',
      blockedReason: 'NONE',
      corsReason: 'NONE',
      canceled: null,
      redirect: false,
      frameIdPresent: null,
      frameMatched: null,
      loaderConsistent: null,
      loaderIdPresent: null,
      requestAtNodeMs: null,
      responseAtNodeMs: null,
      terminalAtNodeMs: null,
    },
  };
  o.rows.push(made);
  if (
    overlapping.length ||
    route === 'OTHER' ||
    o.intent?.state !== 'BEGIN' ||
    route !== o.intent.route
  ) {
    unknown(o, made);
    for (const r of overlapping) unknown(o, r);
  }
  return made;
};
export const bindLiveDocuments = (
  scope: FunctionalScope,
  pages: readonly Page[],
) => {
  const bound = pages.map((page, i): Doc.Owner => {
    const old = owners.get(page);
    if (old && !old.closed) unknown(old);
    const o: Doc.Owner = {
      page,
      actor: i === 0 ? 'T1' : i === 1 ? 'S1' : 'S2',
      index: i + 1,
      origin: new URL(scope.appUrl).origin,
      session: null,
      classroom: null,
      generation: 0,
      intent: null,
      rows: [],
      ids: new Map(),
      requests: new WeakMap(),
      closed: false,
      unavailable: !!old && !old.closed,
    };
    owners.set(page, o);
    return o;
  });
  return {
    session: (id: string, classroom?: string) => {
      for (const o of bound)
        passive(o, () => {
          if (!/^[a-f0-9-]{36}$/u.test(id)) unknown(o);
          else {
            o.session = id;
            o.classroom = classroom ?? null;
          }
        });
    },
    intent: async <T>(
      page: Page,
      route: Doc.RouteKind,
      operation: () => Promise<T>,
    ): Promise<T> => {
      const o = bound.find((v) => v.page === page);
      if (!o) for (const owner of bound) unknown(owner);
      let intent: Doc.Intent | null = null;
      passive(o, () => {
        if (!o) return;
        if (
          o.intent?.state === 'BEGIN' ||
          ![
            'LIVE_PRESENTER',
            'LIVE_SESSION',
            'LIVE_REPORT',
            'CLASSROOM',
            'OTHER',
          ].includes(route)
        ) {
          unknown(o);
          return;
        }
        intent = {
          ordinal: ++o.generation,
          route,
          state: 'BEGIN',
          atNodeMs: performance.now(),
        };
        o.intent = intent;
      });
      const end = (state: 'RETURNED' | 'FAILED') => {
        passive(o, () => {
          if (!o || !intent || o.intent !== intent) {
            if (o) unknown(o);
            return;
          }
          intent.state = state;
          for (const row of o.rows)
            if (row.value.intent?.ordinal === intent.ordinal)
              row.value.intent.state = state;
        });
      };
      try {
        const value = await operation();
        end('RETURNED');
        return value;
      } catch (error) {
        end('FAILED');
        throw error;
      }
    },
    close: () => {
      for (const o of bound) {
        for (const r of o.rows)
          if (
            !r.request ||
            !r.cdp ||
            !r.value.routeClosed ||
            r.value.terminal === 'UNOBSERVED'
          )
            unknown(o, r);
        o.closed = true;
        o.ids.clear();
        o.requests = new WeakMap();
        o.session = o.classroom = null;
        for (const r of o.rows) {
          r.url = '';
          delete r.request;
          delete r.cdp;
          delete r.frame;
          delete r.loader;
        }
      }
    },
    snapshot: () => ({
      collection: bound.some((o) => o.unavailable) ? 'UNKNOWN' : 'OBSERVED',
      pageOrdinalDomain: 'LIVE_LEASE',
      records: bound.flatMap((o) => o.rows.map((r) => r.value)),
    }),
  };
};
export const observeDocumentRoute = (request: Request) => {
  let o: Doc.Owner | undefined, row: Doc.Row | undefined;
  try {
    if (request.resourceType() !== 'document' || request.method() !== 'GET')
      return null;
    o = owners.get(request.frame().page());
    if (!o || o.closed) return null;
    if (request.frame() !== o.page.mainFrame()) {
      unknown(o);
      return null;
    }
    const old = o.requests.get(request);
    if (old) {
      unknown(o, old);
      return null;
    }
    row = claim(o, request.url(), 'route');
    if (!row) return null;
    row.request = request;
    o.requests.set(request, row);
    row.value.routeMatched = true;
  } catch {
    if (o) unknown(o);
    return null;
  }
  const owner = o,
    record = row;
  const stage = (name: Doc.Stage, state: 'BEGIN' | 'RETURNED' | 'FAILED') => {
    passive(owner, () => {
      if (
        ![
          'MATCHED',
          'FETCH',
          'PARSE',
          'HOOK',
          'FULFILL',
          'DISPOSE',
          'ABORT',
        ].includes(name) ||
        record.value.stages.length >= 32
      ) {
        unknown(owner, record);
        return;
      }
      record.value.stages.push({
        stage: name,
        state,
        atNodeMs: performance.now(),
      });
    });
  };
  stage('MATCHED', 'RETURNED');
  const failed = (name: Doc.Stage | 'CATCH', error: unknown) => {
    passive(owner, () => {
      record.value.routeError ??= {
        stage: name,
        errorClass:
          error instanceof errors.TimeoutError
            ? 'PLAYWRIGHT_TIMEOUT'
            : error instanceof Error
              ? 'ERROR'
              : 'OTHER',
      };
    });
  };
  return {
    caught: (error: unknown) => {
      failed('CATCH', error);
    },
    run: async <T>(
      name: Doc.Stage,
      operation: () => Promise<T>,
    ): Promise<T> => {
      stage(name, 'BEGIN');
      try {
        const value = await operation();
        stage(name, 'RETURNED');
        return value;
      } catch (error) {
        stage(name, 'FAILED');
        failed(name, error);
        throw error;
      }
    },
    branch: (name: Doc.Row['value']['branch']) => {
      passive(owner, () => {
        if (
          [
            'UNOBSERVED',
            'ORIGIN_BLOCK',
            'POLICY_DROP',
            'REDIRECT_BLOCK',
            'CATCH_ABORT',
          ].includes(name)
        )
          record.value.branch = name;
        else unknown(owner, record);
      });
    },
    status: (status: number) => {
      passive(owner, () => {
        if (Number.isInteger(status) && status >= 100 && status <= 599)
          record.value.status = status;
        else unknown(owner, record);
      });
    },
    close: () => {
      passive(owner, () => {
        record.value.routeClosed = true;
      });
    },
  };
};
export const observeDocumentFrame = (page: Page, raw: unknown) => {
  try {
    if (!raw || typeof raw !== 'object') return;
    const frame = (raw as Record<string, unknown>).frame as
      Record<string, unknown> | undefined;
    if (!frame || frame.parentId !== undefined) return;
    const owner = owners.get(page);
    if (typeof frame.id !== 'string' || !frame.id || frame.id.length > 180) {
      frames.delete(page);
      if (owner) unknown(owner);
      return;
    }
    const loader =
      typeof frame.loaderId === 'string' && frame.loaderId.length <= 180
        ? frame.loaderId
        : null;
    const url =
      typeof frame.url === 'string' && frame.url.length <= 32768
        ? frame.url
        : null;
    frames.set(page, { id: frame.id, loader, url });
    if (owner && !owner.closed)
      for (const row of owner.rows) {
        if (!row.cdp || row.value.terminal !== 'UNOBSERVED') continue;
        if (row.frame !== frame.id) unknown(owner, row);
        if (row.url === url && row.loader && loader) {
          row.value.loaderConsistent = row.loader === loader;
          if (!row.value.loaderConsistent) unknown(owner, row);
        }
      }
  } catch {
    const owner = owners.get(page);
    if (owner) unknown(owner);
  }
};
export const observeDocumentCdp = (
  page: Page,
  kind: 'request' | 'response' | 'failed' | 'finished',
  raw: unknown,
) => {
  const o = owners.get(page);
  passive(o, () => {
    if (!o) return;
    if (typeof raw !== 'object' || raw === null) {
      unknown(o);
      return;
    }
    const event = raw as Record<string, unknown>;
    if (typeof event.requestId !== 'string' || event.requestId.length > 180) {
      unknown(o);
      return;
    }
    if (kind === 'request') {
      if (event.type !== 'Document') return;
      const body = event.request as Record<string, unknown> | undefined;
      if (
        body?.method !== 'GET' ||
        typeof body.url !== 'string' ||
        body.url.length > 32768
      ) {
        unknown(o);
        return;
      }
      const previous = o.ids.get(event.requestId);
      if (previous) {
        previous.value.redirect ||= event.redirectResponse !== undefined;
        unknown(o, previous);
        return;
      }
      const row = claim(o, body.url, 'cdp');
      if (!row) return;
      row.cdp = event.requestId;
      o.ids.set(event.requestId, row);
      row.value.requestAtNodeMs = performance.now();
      row.value.frameIdPresent = typeof event.frameId === 'string';
      const pin = frames.get(page);
      row.frame =
        typeof event.frameId === 'string' && event.frameId.length <= 180
          ? event.frameId
          : undefined;
      row.loader =
        typeof event.loaderId === 'string' && event.loaderId.length <= 180
          ? event.loaderId
          : undefined;
      row.value.frameMatched = !!pin && row.frame === pin.id;
      if (!row.value.frameMatched) unknown(o, row);
      if (pin?.url === row.url && pin.loader && row.loader) {
        row.value.loaderConsistent = pin.loader === row.loader;
        if (!row.value.loaderConsistent) unknown(o, row);
      }

      row.value.loaderIdPresent = typeof event.loaderId === 'string';
      if (event.redirectResponse !== undefined) {
        row.value.redirect = true;
        unknown(o, row);
      }
      return;
    }
    const row = o.ids.get(event.requestId);
    if (!row) return;
    if (row.value.terminal !== 'UNOBSERVED') {
      unknown(o, row);
      return;
    }
    if (event.loaderId !== undefined && event.loaderId !== row.loader)
      unknown(o, row);
    if (event.frameId !== undefined && event.frameId !== row.frame)
      unknown(o, row);
    if (kind === 'response') {
      const status = (event.response as Record<string, unknown> | undefined)
        ?.status;
      if (
        row.value.responseAtNodeMs !== null ||
        typeof status !== 'number' ||
        !Number.isInteger(status) ||
        status < 100 ||
        status > 599
      ) {
        unknown(o, row);
        return;
      }
      row.value.status = status;
      row.value.responseAtNodeMs = performance.now();
    } else {
      row.value.terminal = kind === 'failed' ? 'FAILED' : 'FINISHED';
      row.value.terminalAtNodeMs = performance.now();
      if (kind === 'failed') {
        row.value.failureCode = imageFailureCode(event.errorText);
        row.value.blockedReason = imageBlockedReason(event.blockedReason);
        row.value.corsReason = imageCorsReason(
          event.corsErrorStatus === undefined
            ? undefined
            : typeof event.corsErrorStatus === 'object' &&
                event.corsErrorStatus !== null
              ? (event.corsErrorStatus as Record<string, unknown>).corsError
              : 'UNKNOWN',
        );
        row.value.canceled =
          typeof event.canceled === 'boolean' ? event.canceled : null;
      }
    }
  });
};
