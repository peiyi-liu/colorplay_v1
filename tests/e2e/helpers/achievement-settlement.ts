import type { Page, Request, Response } from '@playwright/test';

type ErrorCode = 'ABORTED' | 'TRANSPORT_ERROR' | 'HTTP_ERROR' | 'INVALID_BODY';
type WaitError = ErrorCode | 'DOCUMENT_CHANGED' | 'WAIT_TIMEOUT';
interface CatalogRead {
  id: number;
  document: number;
  started_ms: number;
  finished_ms: number | null;
  status: number | null;
  state: 'pending' | 'success' | 'failed';
  error: ErrorCode | null;
}
interface Transition {
  at_ms: number;
  kind: 'document' | 'close';
  pending_request_ids: number[];
  route: 'quiz-result' | 'mistakes' | 'login' | 'app' | 'other';
}
const catalogPath = '/rest/v1/rpc/get_my_achievement_catalog';

// A test-only completion barrier. It never filters browser-health failures.
// Reports are constructed from an allowlist: no URL/query/body/header/error text.
export function attachAchievementSettlement(
  page: Page,
  supabaseUrl: string,
  timeoutMs = 15_000,
) {
  let configured: URL;
  try {
    configured = new URL(supabaseUrl);
  } catch {
    throw new Error('ACHIEVEMENT_CATALOG_CONFIG_INVALID');
  }
  if (
    !/^https?:$/u.test(configured.protocol) ||
    configured.username ||
    configured.password ||
    configured.pathname !== '/' ||
    configured.search ||
    configured.hash ||
    !Number.isFinite(timeoutMs) ||
    timeoutMs <= 0
  )
    throw new Error('ACHIEVEMENT_CATALOG_CONFIG_INVALID');
  const start = performance.now();
  const elapsed = () => Math.round(performance.now() - start);
  let document = 0;
  let closed = false;
  const reads = new Map<
    Request,
    { report: CatalogRead; response?: Response }
  >();
  const transitions: Transition[] = [];
  const waits: {
    document: number;
    at_ms: number;
    outcome: 'success' | WaitError;
  }[] = [];
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
  };
  const matches = (request: Request) => {
    try {
      const url = new URL(request.url());
      return (
        request.method() === 'POST' &&
        url.origin === configured.origin &&
        url.pathname === catalogPath &&
        !url.username &&
        !url.password
      );
    } catch {
      return false;
    }
  };
  const transition = (kind: Transition['kind'], rawUrl: string) => {
    let route: Transition['route'] = 'other';
    try {
      const path = new URL(rawUrl).pathname;
      route = /^\/app\/quiz\/[0-9a-f-]+\/result$/u.test(path)
        ? 'quiz-result'
        : path === '/app/mistakes'
          ? 'mistakes'
          : path === '/login'
            ? 'login'
            : path === '/app'
              ? 'app'
              : 'other';
    } catch {
      /* Only the fixed category is recorded. */
    }
    transitions.push({
      at_ms: elapsed(),
      kind,
      pending_request_ids: [...reads.values()]
        .filter(({ report }) => report.state === 'pending')
        .map(({ report }) => report.id),
      route,
    });
  };
  const fail = (read: { report: CatalogRead }, error: ErrorCode) => {
    if (read.report.state === 'failed') return;
    read.report.state = 'failed';
    read.report.error = error;
    read.report.finished_ms = elapsed();
    notify();
  };
  page.on('request', (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      transition('document', request.url());
      document += 1;
      notify();
    }
    if (!matches(request)) return;
    reads.set(request, {
      report: {
        id: reads.size + 1,
        document,
        started_ms: elapsed(),
        finished_ms: null,
        status: null,
        state: 'pending',
        error: null,
      },
    });
    notify();
  });
  page.on('response', (response) => {
    const read = reads.get(response.request());
    if (!read) return;
    read.response = response;
    read.report.status = response.status();
    if (response.status() < 200 || response.status() >= 300)
      fail(read, 'HTTP_ERROR');
  });
  page.on('requestfailed', (request) => {
    const read = reads.get(request);
    if (!read) return;
    const error = request.failure()?.errorText ?? '';
    fail(
      read,
      /^(?:net::ERR_ABORTED|cancelled|NS_BINDING_ABORTED)(?:\s|$)/u.test(error)
        ? 'ABORTED'
        : 'TRANSPORT_ERROR',
    );
  });
  page.on('requestfinished', async (request) => {
    const read = reads.get(request);
    if (read?.report.state !== 'pending') return;
    try {
      if (!read.response) throw new Error('missing response');
      await read.response.json();
      if (reads.get(request)?.report.state !== 'pending') return;
      read.report.state = 'success';
      read.report.finished_ms = elapsed();
      notify();
    } catch {
      if (reads.get(request)?.report.state === 'pending')
        fail(read, 'INVALID_BODY');
    }
  });
  page.on('close', () => {
    closed = true;
    transition('close', page.url());
    notify();
  });

  return {
    waitBeforeLeavingResult: () =>
      new Promise<void>((resolve, reject) => {
        const expectedDocument = document;
        const finish = (error?: WaitError) => {
          clearTimeout(timer);
          listeners.delete(check);
          waits.push({
            document: expectedDocument,
            at_ms: elapsed(),
            outcome: error ?? 'success',
          });
          if (error) reject(new Error(`ACHIEVEMENT_CATALOG_${error}`));
          else resolve();
        };
        const check = () => {
          if (closed || document !== expectedDocument) {
            finish('DOCUMENT_CHANGED');
            return;
          }
          const current = [...reads.values()]
            .map(({ report }) => report)
            .filter((read) => read.document === expectedDocument);
          const failed = current.find((read) => read.state === 'failed');
          if (failed) {
            finish(failed.error ?? 'TRANSPORT_ERROR');
            return;
          }
          if (
            current.length > 0 &&
            current.every((read) => read.state === 'success')
          )
            finish();
        };
        const timer = setTimeout(() => {
          finish('WAIT_TIMEOUT');
        }, timeoutMs);
        listeners.add(check);
        check();
      }),
    report: () => ({
      schema_version: 1,
      role: 'student',
      requests: [...reads.values()].map(({ report }) => ({ ...report })),
      transitions: transitions.map((event) => ({
        ...event,
        pending_request_ids: [...event.pending_request_ids],
      })),
      waits: waits.map((wait) => ({ ...wait })),
    }),
  };
}
