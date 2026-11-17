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
