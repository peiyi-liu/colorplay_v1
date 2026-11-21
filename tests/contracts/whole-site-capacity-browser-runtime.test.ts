import * as nativeTransport from '../../scripts/concurrency/capacity-native-transport';
import * as network from '../../scripts/concurrency/capacity-network';
import { syntheticLinuxRuntime } from './helpers/whole-site-linux-runtime';
import { linuxScopeHelperNames } from '../../scripts/concurrency/root-helper-contracts';
import { sha256 } from '../../scripts/concurrency/local-runtime';
import { readRegistrationSnapshotDiagnostics } from '../../scripts/concurrency/capacity-registration-final-diagnostics';
import { EventEmitter } from 'node:events';
import type { Server } from 'node:http';
import { chromium, type Browser, type BrowserServer } from '@playwright/test';
import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  createNativeCapacityBrowser,
  getNativeCapacitySendBinding,
  type NativeCapacityBrowserPorts,
} from '../../scripts/concurrency/capacity-browser-runtime';
import { createCapacityProxy } from '../../scripts/concurrency/capacity-network';
import { parseCapacityScope } from '../../scripts/concurrency/capacity-scope';
import { capacityFixture } from './helpers/whole-site-capacity';
afterEach(() => vi.restoreAllMocks());
const setup = async (linux = false) => {
  const h = await capacityFixture();
  let scope = parseCapacityScope(h.input, h.proof);
  if (linux) {
    const profile = syntheticLinuxRuntime(h.input.databaseIdentitySha256);
    const receiptBytes = JSON.stringify({
      ...h.receipt,
      executionProfileSha256: profile.profileSha,
    });
    const processCloseBytes = JSON.stringify({
      ...h.processClose,
      functionalResultSha256: sha256(receiptBytes),
      executionProfileSha256: profile.profileSha,
    });
    scope = parseCapacityScope(
      {
        ...h.input,
        functionalResultSha256: sha256(receiptBytes),
        functionalProcessCloseSha256: sha256(processCloseBytes),
        executionProfileSha256: profile.profileSha,
        helpers: Object.fromEntries(
          linuxScopeHelperNames.map((n) => [n, profile.hashes[n]]),
        ),
      },
      {
        receiptBytes,
        processCloseBytes,
        executionProfileAuthority: profile.authority,
      },
    );
  }
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
  return { scope, ports, context, browser, browserServer, server };
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

it('captures startup and actor failures before stop without exposing original error text', async () => {
  for (const reason of ['STARTUP', 'CREATE_ACTOR'] as const) {
    const h = await setup(),
      runtime = createNativeCapacityBrowser(
        h.scope,
        new AbortController().signal,
        h.ports,
      );
    if (reason === 'STARTUP') {
      h.ports.launchServer.mockRejectedValueOnce(Error('PRIVATE_START'));
      await expect(runtime.start()).rejects.toThrow();
    } else {
      await runtime.start();
      h.context.grantPermissions.mockRejectedValueOnce(Error('PRIVATE_ACTOR'));
      await expect(runtime.createActor(0)).rejects.toThrow();
    }
    const before = readRegistrationSnapshotDiagnostics(runtime.snapshot());
    expect(before.firstReason?.reason).toBe(reason);
    await runtime.close();
    expect(
      readRegistrationSnapshotDiagnostics(runtime.snapshot()).firstReason
        ?.reason,
    ).toBe(reason);
    expect(JSON.stringify(before)).not.toContain('PRIVATE');
  }
});
it('records proxy error at its event before final snapshots and keeps abort distinct from stop', async () => {
  const h = await setup(),
    controller = new AbortController(),
    runtime = createNativeCapacityBrowser(h.scope, controller.signal, h.ports);
  await runtime.start();
  h.server.emit('error', Error('PRIVATE_PROXY'));
  expect(runtime.snapshot().available).toBe(false);
  expect(
    readRegistrationSnapshotDiagnostics(runtime.snapshot()).proxy?.firstReason
      ?.reason,
  ).toBe('PROXY_ERROR');
  controller.abort();
  await runtime.close();
  expect(
    readRegistrationSnapshotDiagnostics(runtime.snapshot()).firstReason?.reason,
  ).toBe('ABORT');
});
it('preserves popup count and once-latches its actual cause ahead of explicit stop', async () => {
  const h = await setup(),
    runtime = createNativeCapacityBrowser(
      h.scope,
      new AbortController().signal,
      h.ports,
    );
  await runtime.start();
  const actor = await runtime.createActor(0);
  h.context.pages = () =>
    [actor.page, actor.page] as unknown as ReturnType<typeof h.context.pages>;
  h.context.emit('page', actor.page);
  expect(runtime.snapshot()).toMatchObject({
    available: false,
    unexpectedPopups: 1,
  });
  await runtime.close();
  expect(
    readRegistrationSnapshotDiagnostics(runtime.snapshot()).firstReason?.reason,
  ).toBe('POPUP');
});

it.each(['normal', 'abort-launch', 'close-fails'] as const)(
  'default factory lease seals before %s APIs and retains real resource/error state',
  async (mode) => {
    const h = await setup(true),
      controller = new AbortController(),
      trace: string[] = [];
    let detached = false;
    const lease = {
      browserType: {
        launchServer: (...args: Parameters<typeof chromium.launchServer>) =>
          h.ports.launchServer(args[0] ?? {}),
        connect: h.ports.connect,
      },
      bind: vi.fn(),
      beforeClose: vi.fn(() => {
        if (!detached) {
          detached = true;
          trace.push('DETACH');
        }
      }),
      closed: vi.fn(),
      finish: vi.fn(
        async (
          journal: { write(name: string, value: unknown): Promise<unknown> },
          resourcesClosed: boolean,
        ) => {
          await journal.write('native-transport-diagnostics', {
            resourcesClosed,
          });
        },
      ),
    };
    const factory = vi
      .spyOn(nativeTransport, 'createNativeTransport')
      .mockReturnValue(lease);
    const proxy = network.createCapacityProxy;
    vi.spyOn(network, 'createCapacityProxy').mockImplementation(
      (scope, signal) =>
        proxy(scope, signal, () => h.server as unknown as Server),
    );
    h.browser.close.mockImplementation(() => {
      trace.push('API_CLOSE');
      return mode === 'close-fails'
        ? Promise.reject(Error('PRIVATE_CLOSE'))
        : Promise.resolve();
    });
    let launched: (server: BrowserServer) => void = () => undefined;
    if (mode === 'abort-launch')
      h.ports.launchServer.mockReturnValueOnce(
        new Promise((resolve) => {
          launched = resolve;
        }),
      );
    const runtime = createNativeCapacityBrowser(
      h.scope,
      controller.signal,
      undefined,
      undefined,
      3,
      'fresh_registration-native_browser-3',
    );
    const started = runtime.start();
    if (mode === 'abort-launch') {
      const failure = expect(started).rejects.toThrow(
        'CAPACITY_EVIDENCE_INVALID',
      );
      await vi.waitFor(() => {
        expect(h.ports.launchServer).toHaveBeenCalledTimes(1);
      });
      controller.abort();
      const closing = runtime.close();
      launched(h.browserServer as unknown as BrowserServer);
      await failure;
      await closing;
      expect(h.ports.connect).not.toHaveBeenCalled();
      expect(lease.bind).not.toHaveBeenCalled();
    } else {
      await started;
      const actor = await runtime.createActor(0);
      expect(getNativeCapacitySendBinding(actor)).toBeDefined();
      expect(lease.bind).toHaveBeenCalledWith(0, actor.page);
      if (mode === 'close-fails')
        await expect(runtime.close()).rejects.toThrow(
          'CAPACITY_EVIDENCE_INVALID',
        );
      else await runtime.close();
      expect(trace.indexOf('DETACH')).toBeLessThan(trace.indexOf('API_CLOSE'));
    }
    expect(factory).toHaveBeenCalledExactlyOnceWith(
      h.scope,
      controller.signal,
      3,
      'fresh_registration-native_browser-3',
    );
    expect(trace.filter((v) => v === 'DETACH')).toHaveLength(1);
    expect(runtime.snapshot().resourcesClosed).toBe(mode !== 'close-fails');
    const journal = { write: vi.fn(() => Promise.resolve()) };
    await runtime.finishTransportDiagnostics(journal);
    expect(journal.write).toHaveBeenCalledWith('native-transport-diagnostics', {
      resourcesClosed: mode !== 'close-fails',
    });
  },
);
