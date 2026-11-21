import { EventEmitter } from 'node:events';
import { createFunctionalHealth } from '../../scripts/concurrency/functional-health';
import { describe, expect, it, vi } from 'vitest';
import type { BrowserContext, Page, Request, Route } from '@playwright/test';
import {
  bindLiveDocuments,
  observeDocumentCdp,
  observeDocumentFrame,
  observeDocumentRoute,
} from '../../scripts/concurrency/functional-document-observation';
import { restrictFunctionalBrowser } from '../../scripts/concurrency/browser-runtime';
import { syntheticScope } from './helpers/whole-site-functional';
const scope = syntheticScope();
const id = '10000000-0000-4000-8000-000000000001';
const url = `${scope.appUrl}/teacher/live/${id}/report`;
const pageFixture = () => {
  const frame = { page: (): Page => page };
  const page = { mainFrame: () => frame } as unknown as Page;
  return {
    page,
    request: (target = url) =>
      ({
        frame: () => frame,
        url: () => target,
        method: () => 'GET',
        resourceType: () => 'document',
      }) as unknown as Request,
  };
};
const event = (key = 'PRIVATE_REQUEST', target = url) => ({
  requestId: key,
  type: 'Document',
  frameId: 'PRIVATE_FRAME',
  loaderId: 'PRIVATE_LOADER',
  request: { method: 'GET', url: target },
});
const start = () => {
  const h = pageFixture();
  const lease = bindLiveDocuments(scope, [h.page]);
  observeDocumentFrame(h.page, {
    frame: { id: 'PRIVATE_FRAME', loaderId: 'PRIVATE_LOADER', url },
  });
  lease.session(id);
  return { ...h, lease };
};
const finish = (page: Page, key = 'PRIVATE_REQUEST') => {
  observeDocumentCdp(page, 'finished', { requestId: key });
};
describe('owned same-request document observation', () => {
  it.each(['route-first', 'cdp-first'])(
    'pairs either arrival order without exposing identity %s',
    async (order) => {
      const h = start();
      await h.lease.intent(h.page, 'LIVE_REPORT', async () => {
        const request = h.request();
        if (order === 'cdp-first')
          observeDocumentCdp(h.page, 'request', event());
        const route = observeDocumentRoute(request);
        expect(route).not.toBeNull();
        if (order === 'route-first')
          observeDocumentCdp(h.page, 'request', event());
        await route?.run('FETCH', async () => await Promise.resolve(1));
        route?.status(200);
        observeDocumentCdp(h.page, 'response', {
          requestId: 'PRIVATE_REQUEST',
          response: { status: 200 },
        });
        route?.close();
        finish(h.page);
      });
      h.lease.close();
      const value = h.lease.snapshot();
      expect(value.collection).toBe('OBSERVED');
      expect(value.records[0]).toMatchObject({
        actor: 'T1',
        route: 'LIVE_REPORT',
        routeMatched: true,
        routeClosed: true,
        status: 200,
        terminal: 'FINISHED',
        continue: 'NOT_CALLED',
        fallback: 'NOT_CALLED',
      });
      expect(JSON.stringify(value)).not.toMatch(
        /PRIVATE_|127\.0\.0\.1|teacher\/live|10000000/u,
      );
    },
  );
  it('keeps safe original CDP failure fields distinct from Root branch', async () => {
    const h = start();
    await h.lease.intent(h.page, 'LIVE_REPORT', async () => {
      await Promise.resolve();
      const route = observeDocumentRoute(h.request());
      observeDocumentCdp(h.page, 'request', event());
      route?.branch('CATCH_ABORT');
      route?.close();
      observeDocumentCdp(h.page, 'failed', {
        requestId: 'PRIVATE_REQUEST',
        errorText: 'net::ERR_FAILED',
        blockedReason: 'inspector',
        corsErrorStatus: { corsError: 'MissingAllowOriginHeader' },
        canceled: false,
      });
    });
    h.lease.close();
    expect(h.lease.snapshot().records[0]).toMatchObject({
      failureCode: 'ERR_FAILED',
      blockedReason: 'inspector',
      corsReason: 'MissingAllowOriginHeader',
      canceled: false,
      branch: 'CATCH_ABORT',
      terminal: 'FAILED',
    });
  });
  it.each([
    'duplicate-request',
    'duplicate-response',
    'duplicate-terminal',
    'redirect',
    'parallel',
    'query',
    'foreign-origin',
    'unknown-error',
    'late',
  ])(
    'rejects incomplete or ambiguous diagnostic provenance %s',
    async (mode) => {
      const h = start();
      const target =
        mode === 'query'
          ? `${url}?PRIVATE_SECRET`
          : mode === 'foreign-origin'
            ? 'https://foreign.invalid/PRIVATE_PATH'
            : url;
      await h.lease.intent(h.page, 'LIVE_REPORT', async () => {
        const route = observeDocumentRoute(h.request(target));
        if (mode === 'parallel') observeDocumentRoute(h.request(target));
        observeDocumentCdp(h.page, 'request', event('PRIVATE_REQUEST', target));
        if (mode === 'duplicate-request' || mode === 'redirect')
          observeDocumentCdp(h.page, 'request', {
            ...event('PRIVATE_REQUEST', target),
            ...(mode === 'redirect' ? { redirectResponse: {} } : {}),
          });
        observeDocumentCdp(h.page, 'response', {
          requestId: 'PRIVATE_REQUEST',
          response: { status: 200 },
        });
        if (mode === 'duplicate-response')
          observeDocumentCdp(h.page, 'response', {
            requestId: 'PRIVATE_REQUEST',
            response: { status: 200 },
          });
        route?.close();
        if (mode === 'unknown-error')
          observeDocumentCdp(h.page, 'failed', {
            requestId: 'PRIVATE_REQUEST',
            errorText: 'PRIVATE_UNKNOWN_ERROR',
            blockedReason: 'constructor',
          });
        else finish(h.page);
        if (mode === 'duplicate-terminal') finish(h.page);
        if (mode === 'late') {
          h.lease.close();
          await route?.run('FETCH', async () => {
            await Promise.resolve(undefined);
          });
        }
      });
      h.lease.close();
      const value = h.lease.snapshot();
      if (mode === 'unknown-error')
        expect(value.records[0]).toMatchObject({
          failureCode: 'UNKNOWN',
          blockedReason: 'UNKNOWN',
        });
      else expect(value.collection).toBe('UNKNOWN');
      expect(JSON.stringify(value)).not.toMatch(/PRIVATE_|foreign\.invalid/u);
    },
  );
  it('separates sequential repeated paths by exact completed generation, not nearest clock', async () => {
    const h = start();
    for (const key of ['PRIVATE_1', 'PRIVATE_2'])
      await h.lease.intent(h.page, 'LIVE_REPORT', async () => {
        await Promise.resolve();
        const route = observeDocumentRoute(h.request());
        observeDocumentCdp(h.page, 'request', event(key));
        route?.close();
        finish(h.page, key);
      });
    h.lease.close();
    expect(h.lease.snapshot().collection).toBe('OBSERVED');
    expect(h.lease.snapshot().records.map((v) => v.generation)).toEqual([1, 2]);
  });
  it('does not join foreign page events, reused IDs or non-target metadata', async () => {
    const h = start(),
      foreign = pageFixture();
    await h.lease.intent(h.page, 'LIVE_REPORT', async () => {
      await Promise.resolve();
      const request = h.request();
      const route = observeDocumentRoute(request);
      expect(observeDocumentRoute(request)).toBeNull();
      observeDocumentCdp(foreign.page, 'request', event());
      observeDocumentCdp(h.page, 'request', event());
      route?.close();
      finish(h.page);
      observeDocumentCdp(h.page, 'request', event());
    });
    h.lease.close();
    expect(h.lease.snapshot().collection).toBe('UNKNOWN');
    expect(
      observeDocumentRoute({ resourceType: () => 'image' } as Request),
    ).toBeNull();
  });
  it('bounds memory and preserves first observations without persisting raw fields', async () => {
    const h = start();
    await h.lease.intent(h.page, 'LIVE_REPORT', async () => {
      await Promise.resolve();
      for (let n = 0; n < 260; n++)
        observeDocumentCdp(
          h.page,
          'request',
          event(`PRIVATE_${String(n)}`, `${url}?n=${String(n)}`),
        );
    });
    h.lease.close();
    const value = h.lease.snapshot();
    expect(value.records).toHaveLength(256);
    expect(value.collection).toBe('UNKNOWN');
    expect(JSON.stringify(value)).not.toContain('PRIVATE_');
  });
  it('marks missing route/CDP/intent unavailable, and observer failure preserves original exception identity', async () => {
    const h = start();
    observeDocumentCdp(h.page, 'request', event());
    const sentinel = new Error('PRIVATE_ERROR');
    await expect(
      h.lease.intent(h.page, 'LIVE_REPORT', async () => {
        await Promise.resolve();
        throw sentinel;
      }),
    ).rejects.toBe(sentinel);
    h.lease.close();
    expect(h.lease.snapshot().records[0]?.collection).toBe('UNKNOWN');
  });
  it.each(['LIVE_PRESENTER', 'LIVE_SESSION', 'CLASSROOM'] as const)(
    'classifies only exact owned Source route %s',
    async (kind) => {
      const h = start();
      h.lease.session(id, id);
      const target = `${scope.appUrl}${kind === 'LIVE_PRESENTER' ? '/teacher/live' : kind === 'LIVE_SESSION' ? `/app/live/${id}` : `/teacher/classes/${id}`}`;
      await h.lease.intent(h.page, kind, async () => {
        await Promise.resolve();
        const route = observeDocumentRoute(h.request(target));
        observeDocumentCdp(h.page, 'request', event('PRIVATE_REQUEST', target));
        route?.close();
        finish(h.page);
      });
      h.lease.close();
      expect(h.lease.snapshot().records[0]?.route).toBe(kind);
    },
  );
});
describe('actual functional health forwards existing CDP without changing health authority', () => {
  it('retains one document failure as three original unexpected events, with same request diagnostic', async () => {
    await Promise.resolve();
    const cdp = new EventEmitter();
    const emitted = new EventEmitter();
    const send = vi.fn(
      async (method: string) =>
        await Promise.resolve(
          method === 'Browser.getVersion'
            ? {
                product: 'Chrome/159.0.8154.6',
                protocolVersion: '1.3',
                revision: '@' + 'a'.repeat(40),
              }
            : {},
        ),
    );
    const frame = { page: (): Page => page };
    const page = Object.assign(emitted, {
      mainFrame: () => frame,
      isClosed: () => false,
      opener: () => Promise.resolve(null),
      url: () => scope.appUrl,
    }) as unknown as Page;
    const context = {
      newCDPSession: async () =>
        await Promise.resolve(
          Object.assign(cdp, { send, detach: () => Promise.resolve() }),
        ),
    } as unknown as BrowserContext;
    const health = createFunctionalHealth(scope, () => 'live_finalized');
    await health.attach(context, page);
    health.identify(page, 'T1');
    cdp.emit('Page.frameNavigated', {
      frame: { id: 'PRIVATE_FRAME', loaderId: 'PRIVATE_LOADER', url },
    });
    const lease = bindLiveDocuments(scope, [page]);
    lease.session(id);
    await lease.intent(page, 'LIVE_REPORT', async () => {
      await Promise.resolve();
      const route = observeDocumentRoute({
        frame: () => frame,
        url: () => url,
        method: () => 'GET',
        resourceType: () => 'document',
      } as unknown as Request);
      cdp.emit('Network.requestWillBeSent', event());
      route?.branch('CATCH_ABORT');
      route?.close();
      emitted.emit('console', {
        type: () => 'error',
        text: () => 'Failed to load resource: net::ERR_FAILED',
        location: () => ({ url }),
      });
      cdp.emit('Network.loadingFailed', {
        requestId: 'PRIVATE_REQUEST',
        errorText: 'net::ERR_FAILED',
        canceled: false,
        blockedReason: 'inspector',
      });
      cdp.emit('Log.entryAdded', {
        entry: {
          level: 'error',
          source: 'network',
          text: 'Failed to load resource: net::ERR_FAILED',
          url,
          networkRequestId: 'PRIVATE_REQUEST',
        },
      });
    });
    await health.settle();
    lease.close();
    expect(health.snapshot().unexpectedErrors).toBe(3);
    expect(lease.snapshot().records[0]).toMatchObject({
      actor: 'T1',
      branch: 'CATCH_ABORT',
      failureCode: 'ERR_FAILED',
      blockedReason: 'inspector',
      canceled: false,
    });
    expect(send.mock.calls.map(([method]) => method)).not.toContain(
      'Network.getResponseBody',
    );
    await health.dispose();
  });
});
describe('actual unchanged Root route factory with passive document observer', () => {
  it.each([
    'ok',
    'redirect',
    'fetch-error',
    'fulfill-error',
    'dispose-error',
    'status-error',
    'foreign',
  ])(
    'preserves original exact operations and safe branch: %s',
    async (mode) => {
      await Promise.resolve();
      const h = start();
      const trace: string[] = [];
      let handler: (route: Route) => Promise<void> = () => Promise.resolve();
      const context = {
        grantPermissions: () => Promise.resolve(),
        route: (_glob: string, run: typeof handler) => {
          handler = run;
          return Promise.resolve();
        },
        routeWebSocket: () => Promise.resolve(),
      } as unknown as BrowserContext;
      await restrictFunctionalBrowser(context, scope);
      const response = {
        status: () => {
          trace.push('STATUS');
          if (mode === 'status-error') throw new Error('PRIVATE');
          return mode === 'redirect' ? 303 : 200;
        },
        dispose: () => {
          trace.push('DISPOSE');
          return mode === 'dispose-error'
            ? Promise.reject(new Error('PRIVATE'))
            : Promise.resolve();
        },
      };
      const route = {
        request: () =>
          h.request(mode === 'foreign' ? 'https://foreign.invalid/path' : url),
        fetch: vi.fn(async () => {
          await Promise.resolve();
          trace.push('FETCH');
          if (mode === 'fetch-error') throw new Error('PRIVATE');
          return response;
        }),
        fulfill: () => {
          trace.push('FULFILL');
          return mode === 'fulfill-error'
            ? Promise.reject(new Error('PRIVATE'))
            : Promise.resolve();
        },
        abort: (reason: string) => {
          trace.push(`ABORT_${reason}`);
          return Promise.resolve();
        },
      } as unknown as Route;
      await h.lease.intent(h.page, 'LIVE_REPORT', async () => {
        observeDocumentCdp(
          h.page,
          'request',
          event(
            'PRIVATE_REQUEST',
            mode === 'foreign' ? 'https://foreign.invalid/path' : url,
          ),
        );
        await handler(route);
        observeDocumentCdp(h.page, 'failed', {
          requestId: 'PRIVATE_REQUEST',
          errorText: 'net::ERR_FAILED',
          canceled: false,
        });
      });
      h.lease.close();
      const expected =
        mode === 'foreign'
          ? ['ABORT_blockedbyclient']
          : mode === 'fetch-error'
            ? ['FETCH', 'ABORT_failed']
            : mode === 'status-error'
              ? ['FETCH', 'STATUS', 'DISPOSE', 'ABORT_failed']
              : mode === 'redirect'
                ? [
                    'FETCH',
                    'STATUS',
                    'STATUS',
                    'ABORT_blockedbyclient',
                    'DISPOSE',
                  ]
                : [
                    'FETCH',
                    'STATUS',
                    'FULFILL',
                    'DISPOSE',
                    ...(mode === 'ok' ? [] : ['ABORT_failed']),
                  ];
      expect(trace).toEqual(expected);
      const row = h.lease.snapshot().records[0];
      expect(row?.branch).toBe(
        mode === 'foreign'
          ? 'ORIGIN_BLOCK'
          : mode === 'redirect'
            ? 'REDIRECT_BLOCK'
            : mode === 'ok'
              ? 'UNOBSERVED'
              : 'CATCH_ABORT',
      );
      expect(row).toMatchObject({
        continue: 'NOT_CALLED',
        fallback: 'NOT_CALLED',
      });
      expect(JSON.stringify(h.lease.snapshot())).not.toContain('PRIVATE');
    },
  );
});
