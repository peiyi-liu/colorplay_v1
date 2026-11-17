import { EventEmitter } from 'node:events';
import type { Server } from 'node:http';
import type { Browser, BrowserServer } from '@playwright/test';
import { describe, it, expect, vi } from 'vitest';
import {
  createNativeCapacityBrowser,
  getNativeCapacitySendBinding,
  type NativeCapacityBrowserPorts,
} from '../../scripts/concurrency/capacity-browser-runtime';
import { createCapacityProxy } from '../../scripts/concurrency/capacity-network';
import { parseCapacityScope } from '../../scripts/concurrency/capacity-scope';
import { capacityFixture } from './helpers/whole-site-capacity';
const setup = async () => {
  const h = await capacityFixture(),
    scope = parseCapacityScope(h.input, h.proof);
  const server = Object.assign(new EventEmitter(), {
    listening: false,
    listen: (_p: number, _h: string, done: () => void) => {
      server.listening = true;
      queueMicrotask(done);
      return server;
    },
    address: () => ({ address: '127.0.0.1', family: 'IPv4', port: 61234 }),
    close: (done: () => void) => {
      server.listening = false;
      done();
      return server;
    },
  });
  const cdp = Object.assign(new EventEmitter(), {
    send: vi.fn(() => Promise.resolve()),
    detach: vi.fn(() => Promise.resolve()),
  });
  const page = Object.assign(new EventEmitter(), {
    close: vi.fn(() => Promise.resolve()),
    isClosed: () => false,
  });
  const context = Object.assign(new EventEmitter(), {
    pages: () => [page],
    newPage: vi.fn(() => {
      context.emit('page', page);
      return Promise.resolve(page);
    }),
    close: vi.fn(() => Promise.resolve()),
    grantPermissions: vi.fn(() => Promise.resolve()),
    setDefaultTimeout: vi.fn(),
    newCDPSession: vi.fn(() => Promise.resolve(cdp)),
    route: vi.fn(() => {
      throw new Error('ROUTING_FORBIDDEN');
    }),
    routeWebSocket: vi.fn(() => {
      throw new Error('ROUTING_FORBIDDEN');
    }),
  });
  const browser = {
      newContext: vi.fn(() => Promise.resolve(context)),
      close: vi.fn(() => Promise.resolve()),
    },
    browserServer = {
      process: () => ({ pid: 123 }),
      wsEndpoint: () => 'ws://127.0.0.1:61235/PRIVATE_ENDPOINT',
      close: vi.fn(() => Promise.resolve()),
    };
  const ports = {
    proxy: (signal: AbortSignal) =>
      createCapacityProxy(scope, signal, () => server as unknown as Server),
    launchServer: vi.fn<NativeCapacityBrowserPorts['launchServer']>(() =>
      Promise.resolve(browserServer as unknown as BrowserServer),
    ),
    connect: vi.fn(() => Promise.resolve(browser as unknown as Browser)),
  };
  return { scope, ports, context, browser, browserServer };
};
describe('owned native launchServer/context/page lifecycle', () => {
  it('awaits exact scoped permission before page, uses launchServer host and never installs Playwright routes', async () => {
    const h = await setup();
    const runtime = createNativeCapacityBrowser(
      h.scope,
      new AbortController().signal,
      h.ports,
    );
    await runtime.start();
    const actor = await runtime.createActor(0);
    expect(actor.actorIndex).toBe(0);
    expect(getNativeCapacitySendBinding(actor)).toBeUndefined();
    expect(getNativeCapacitySendBinding({ ...actor })).toBeUndefined();
    expect(h.ports.launchServer.mock.calls[0]?.[0].host).toBe('127.0.0.1');
    expect(h.ports.launchServer.mock.calls[0]?.[0].args).toContain(
      '--proxy-bypass-list=<-loopback>;127.0.0.1:58373;127.0.0.1:58321;127.0.0.1:58324',
    );
    expect(h.context.grantPermissions).toHaveBeenCalledWith(
      ['local-network-access'],
      { origin: h.scope.appUrl },
    );
    expect(h.context.route).not.toHaveBeenCalled();
    expect(h.context.routeWebSocket).not.toHaveBeenCalled();
    await runtime.close();
    expect(runtime.snapshot().resourcesClosed).toBe(true);
    expect(h.browserServer.close).toHaveBeenCalledTimes(1);
  });
  it('closes a late launched owned server after abort, without connecting or creating contexts', async () => {
    const h = await setup();
    let finish: (value: BrowserServer) => void = () => undefined;
    h.ports.launchServer.mockReturnValueOnce(
      new Promise<BrowserServer>((resolve) => {
        finish = resolve;
      }),
    );
    const signal = new AbortController(),
      runtime = createNativeCapacityBrowser(h.scope, signal.signal, h.ports),
      started = runtime.start();
    const rejected = expect(started).rejects.toThrow();
    await vi.waitFor(() => {
      expect(h.ports.launchServer).toHaveBeenCalledTimes(1);
    });
    signal.abort();
    const closed = runtime.close();
    finish(h.browserServer as unknown as BrowserServer);
    await rejected;
    await closed;
    expect(h.ports.connect).not.toHaveBeenCalled();
    expect(h.browserServer.close).toHaveBeenCalledTimes(1);
  });
  it('refuses unsupported permissions and close failure rather than returning resourcesClosed true', async () => {
    const h = await setup();
    h.context.grantPermissions.mockRejectedValueOnce(
      new Error('PRIVATE_SECRET'),
    );
    const runtime = createNativeCapacityBrowser(
      h.scope,
      new AbortController().signal,
      h.ports,
    );
    await runtime.start();
    await expect(runtime.createActor(0)).rejects.toThrow(
      'CAPACITY_EVIDENCE_INVALID',
    );
    expect(h.context.newPage).not.toHaveBeenCalled();
    h.browser.close.mockRejectedValueOnce(new Error('PRIVATE_CLOSE'));
    await expect(runtime.close()).rejects.toThrow();
    expect(runtime.snapshot().resourcesClosed).toBe(false);
  });
});
