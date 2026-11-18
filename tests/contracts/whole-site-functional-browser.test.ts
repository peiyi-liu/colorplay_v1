import * as documents from '../../scripts/concurrency/functional-document-observation';
import type { Page, Request } from '@playwright/test';
import { describe, expect, it, vi } from 'vitest';
import type { BrowserContext, Route, WebSocketRoute } from '@playwright/test';
import { restrictFunctionalBrowser } from '../../scripts/concurrency/browser-runtime';
import { syntheticScope } from './helpers/whole-site-functional';
const harness = () => {
  let http: ((route: Route) => Promise<void>) | undefined;
  let ws: ((route: WebSocketRoute) => void) | undefined;
  const grantPermissions = vi.fn(() => Promise.resolve(undefined));
  const route = vi.fn(
    (_glob: string, callback: (route: Route) => Promise<void>) =>
      Promise.resolve().then(() => {
        http = callback;
      }),
  );
  const routeWebSocket = vi.fn(
    (_glob: string, callback: (route: WebSocketRoute) => void) =>
      Promise.resolve().then(() => {
        ws = callback;
      }),
  );
  const context = {
    grantPermissions,
    route,
    routeWebSocket,
  } as unknown as BrowserContext;
  return {
    context,
    grantPermissions,
    route,
    routeWebSocket,
    http: () => {
      if (!http) throw new Error('SYNTHETIC_HANDLER_MISSING');
      return http;
    },
    ws: () => {
      if (!ws) throw new Error('SYNTHETIC_HANDLER_MISSING');
      return ws;
    },
  };
};
describe('functional browser scope before navigation', () => {
  it('grants only the App origin and installs guards before any page is created', async () => {
    const h = harness();
    await restrictFunctionalBrowser(h.context, syntheticScope());
    expect(h.grantPermissions).toHaveBeenCalledExactlyOnceWith(
      ['local-network-access'],
      { origin: 'http://127.0.0.1:58373' },
    );
    expect(h.grantPermissions.mock.invocationCallOrder[0]).toBeLessThan(
      h.route.mock.invocationCallOrder[0] ?? 0,
    );
  });
  it('wrong-target and unsupported permission are fail closed', async () => {
    const h = harness();
    await expect(
      restrictFunctionalBrowser(h.context, {
        ...syntheticScope(),
        supabaseUrl: 'https://remote.invalid',
      }),
    ).rejects.toThrow('FUNCTIONAL_SCOPE_INVALID');
    expect(h.grantPermissions).not.toHaveBeenCalled();
    h.grantPermissions.mockRejectedValueOnce(new Error('SYNTHETIC_SECRET'));
    await expect(
      restrictFunctionalBrowser(h.context, syntheticScope()),
    ).rejects.toThrow('FUNCTIONAL_BROWSER_FAILED');
    expect(h.route).not.toHaveBeenCalled();
  });
  it.each(['http://localhost:4173/data', 'https://remote.invalid/data'])(
    'does not forward forbidden HTTP %#',
    async (url) => {
      const h = harness();
      await restrictFunctionalBrowser(h.context, syntheticScope());
      const route = {
        request: () => ({ url: () => url }),
        abort: vi.fn(() => Promise.resolve(undefined)),
        fetch: vi.fn(),
      };
      await h.http()(route as unknown as Route);
      expect(route.fetch).not.toHaveBeenCalled();
      expect(route.abort).toHaveBeenCalledWith('blockedbyclient');
    },
  );
  it('does not follow or hand back HTTP redirects', async () => {
    const h = harness();
    await restrictFunctionalBrowser(h.context, syntheticScope());
    const route = {
      request: () => ({
        url: () => 'http://127.0.0.1:58373/data',
        resourceType: () => 'other',
        method: () => 'GET',
      }),
      abort: vi.fn(() => Promise.resolve(undefined)),
      fetch: vi.fn(() =>
        Promise.resolve({
          status: () => 303,
          dispose: () => Promise.resolve(),
        }),
      ),
      fulfill: vi.fn(),
    };
    await h.http()(route as unknown as Route);
    expect(route.fetch).toHaveBeenCalledWith({
      maxRedirects: 0,
      maxRetries: 0,
    });
    expect(route.fulfill).not.toHaveBeenCalled();
    expect(route.abort).toHaveBeenCalledWith('blockedbyclient');
  });
  it.each([
    'ws://127.0.0.1:58321/realtime/v1/websocket?apikey=SYNTHETIC_SECRET',
    'ws://127.0.0.1:58322/realtime/v1/websocket',
    'wss://remote.invalid/realtime/v1/websocket',
  ])('allows only the exact local API WebSocket route %#', async (url) => {
    const h = harness();
    await restrictFunctionalBrowser(h.context, syntheticScope());
    const socket = { url: () => url, connectToServer: vi.fn(), close: vi.fn() };
    h.ws()(socket as unknown as WebSocketRoute);
    expect(socket.connectToServer).toHaveBeenCalledTimes(
      url.includes(':58321/') ? 1 : 0,
    );
    expect(socket.close).toHaveBeenCalledTimes(url.includes(':58321/') ? 0 : 1);
  });
});

describe('same-round document correlation boundaries', () => {
  const setup = () => {
    const frame = { page: (): Page => page };
    const page = { mainFrame: () => frame } as unknown as Page;
    const scope = syntheticScope(),
      id = '10000000-0000-4000-8000-000000000001';
    const url = `${scope.appUrl}/teacher/live/${id}/report`;
    const request = () =>
      ({
        frame: () => frame,
        url: () => url,
        method: () => 'GET',
        resourceType: () => 'document',
      }) as unknown as Request;
    const lease = documents.bindLiveDocuments(scope, [page]);
    lease.session(id);
    documents.observeDocumentFrame(page, {
      frame: { id: 'MAIN', loaderId: 'LOADER', url },
    });
    const emit = (key: string, frameId = 'MAIN') => {
      documents.observeDocumentCdp(page, 'request', {
        requestId: key,
        type: 'Document',
        frameId,
        loaderId: 'LOADER',
        request: { method: 'GET', url },
      });
    };
    return { page, request, lease, emit };
  };
  it('new document after returned intent is unknown while original terminals remain allowed', async () => {
    const h = setup();
    await h.lease.intent(h.page, 'LIVE_REPORT', () => {
      const r = documents.observeDocumentRoute(h.request());
      h.emit('A');
      r?.close();
      documents.observeDocumentCdp(h.page, 'finished', { requestId: 'A' });
      return Promise.resolve();
    });
    expect(h.lease.snapshot().records[0]?.collection).toBe('OBSERVED');
    const r = documents.observeDocumentRoute(h.request());
    h.emit('B');
    r?.close();
    documents.observeDocumentCdp(h.page, 'finished', { requestId: 'B' });
    h.lease.close();
    expect(h.lease.snapshot().collection).toBe('UNKNOWN');
  });
  it('CDP foreign iframe cannot attest the Root main-frame request', async () => {
    const h = setup();
    await h.lease.intent(h.page, 'LIVE_REPORT', () => {
      const r = documents.observeDocumentRoute(h.request());
      h.emit('A', 'FOREIGN_IFRAME');
      r?.close();
      documents.observeDocumentCdp(h.page, 'finished', { requestId: 'A' });
      return Promise.resolve();
    });
    h.lease.close();
    expect(h.lease.snapshot().collection).toBe('UNKNOWN');
  });
  it('allows already-created matching request terminal after intent returned', async () => {
    const h = setup();
    await h.lease.intent(h.page, 'LIVE_REPORT', () => {
      const r = documents.observeDocumentRoute(h.request());
      h.emit('A');
      r?.close();
      return Promise.resolve();
    });
    documents.observeDocumentCdp(h.page, 'finished', { requestId: 'A' });
    h.lease.close();
    expect(h.lease.snapshot().collection).toBe('OBSERVED');
  });
  it.each(['response', 'main-navigation'] as const)(
    'rejects actual loader contradiction %s',
    async (mode) => {
      const h = setup();
      await h.lease.intent(h.page, 'LIVE_REPORT', () => {
        const r = documents.observeDocumentRoute(h.request());
        h.emit('A');
        r?.close();
        if (mode === 'response')
          documents.observeDocumentCdp(h.page, 'response', {
            requestId: 'A',
            frameId: 'MAIN',
            loaderId: 'OTHER',
            response: { status: 200 },
          });
        else
          documents.observeDocumentFrame(h.page, {
            frame: { id: 'MAIN', loaderId: 'OTHER', url: h.request().url() },
          });
        documents.observeDocumentCdp(h.page, 'finished', { requestId: 'A' });
        return Promise.resolve();
      });
      h.lease.close();
      expect(h.lease.snapshot().collection).toBe('UNKNOWN');
    },
  );
  it.each([
    'cdp-terminal-after-intent',
    'route-closed-after-intent',
    'cdp-terminal-active',
  ] as const)(
    'cannot join a new side to nonpending candidate %s',
    async (mode) => {
      const h = setup();
      const first = () => {
        if (mode === 'route-closed-after-intent')
          documents.observeDocumentRoute(h.request())?.close();
        else {
          h.emit('A');
          documents.observeDocumentCdp(h.page, 'finished', { requestId: 'A' });
        }
      };
      const second = () => {
        if (mode === 'route-closed-after-intent') h.emit('B');
        else documents.observeDocumentRoute(h.request())?.close();
      };
      await h.lease.intent(h.page, 'LIVE_REPORT', () => {
        first();
        if (mode === 'cdp-terminal-active') second();
        return Promise.resolve();
      });
      if (mode !== 'cdp-terminal-active') second();
      h.lease.close();
      expect(h.lease.snapshot().collection).toBe('UNKNOWN');
    },
  );
});
