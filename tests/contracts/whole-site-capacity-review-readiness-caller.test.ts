import { expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { Server } from 'node:http';
import type { Browser, BrowserServer } from '@playwright/test';
import {
  createNativeCapacityBrowser,
  type NativeCapacityBrowserPorts,
} from '../../scripts/concurrency/capacity-browser-runtime';
import { createCapacityProxy } from '../../scripts/concurrency/capacity-network';
import { parseCapacityScope } from '../../scripts/concurrency/capacity-scope';
import { capacityFixture } from './helpers/whole-site-capacity';
import { installReviewReadinessSlot } from '../../src/features/learning/lib/review-readiness-diagnostics';

import { createReviewTrace } from '../../scripts/concurrency/capacity-student-review-diagnostics';
it('the existing failure caller retains an explicit unavailable matcher witness before sentinel replacement', () => {
  const events: unknown[] = [];
  const trace = createReviewTrace((event) => events.push(event));
  trace.enter('SECTION_COUNT');
  const original = new Error('synthetic private matcher');
  trace.failed(original);
  expect(events[1]).toMatchObject({
    phase: 'SECTION_COUNT',
    state: 'FAILED',
    matcher: { collection: 'UNOBSERVED', actual: null, expected: null },
  });
});

const nativeSetup = async () => {
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
    addInitScript: vi.fn(() => Promise.resolve()),
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
it('true Native factory installs the exact pure-data initializer before creating any page', async () => {
  const h = await nativeSetup();
  const runtime = createNativeCapacityBrowser(
    h.scope,
    new AbortController().signal,
    h.ports,
  );
  await runtime.start();
  await runtime.createActor(1);
  expect(h.context.addInitScript).toHaveBeenCalledExactlyOnceWith(
    installReviewReadinessSlot,
  );
  expect(h.context.addInitScript.mock.invocationCallOrder[0]).toBeLessThan(
    h.context.newPage.mock.invocationCallOrder[0] ?? -1,
  );
  await runtime.close();
  expect(runtime.snapshot().resourcesClosed).toBe(true);
});
it('passive installer rejection cannot become a new browser admission failure', async () => {
  const h = await nativeSetup();
  h.context.addInitScript.mockRejectedValueOnce(
    new Error('synthetic setup unavailable'),
  );
  const runtime = createNativeCapacityBrowser(
    h.scope,
    new AbortController().signal,
    h.ports,
  );
  await runtime.start();
  expect((await runtime.createActor(1)).actorIndex).toBe(1);
  await runtime.close();
});

import { createCapacityReviewReadinessObservation } from '../../scripts/concurrency/capacity-review-readiness-observation';
it('true Native abort closes independently of the diagnostic opportunity and cancellation drains honestly', async () => {
  const h = await nativeSetup(),
    signal = new AbortController();
  const runtime = createNativeCapacityBrowser(h.scope, signal.signal, h.ports);
  await runtime.start();
  const actor = await runtime.createActor(1);
  let cancel!: (error: Error) => void;
  const evaluate = vi.fn(
    () =>
      new Promise((_, reject) => {
        cancel = reject;
      }),
  );
  Object.assign(actor.page, {
    evaluate,
    url: () =>
      h.scope.appUrl + '/app/chapters/21000000-0000-0000-0000-000000000003',
  });
  h.browser.close.mockImplementationOnce(() => {
    cancel(new Error('synthetic Native cancellation'));
    return Promise.resolve();
  });
  const owner = createCapacityReviewReadinessObservation(
    h.scope,
    signal.signal,
  );
  owner.register(actor);
  owner.observe(1, {
    phase: 'SECTION_COUNT',
    state: 'FAILED',
    sectionOrdinal: 0,
  });
  signal.abort();
  expect(h.browser.close).toHaveBeenCalledTimes(1);
  owner.stopAccepting();
  await owner.beforeClose();
  await runtime.close();
  await owner.finish(
    { directory: 'synthetic', write: () => Promise.resolve() },
    runtime.snapshot().resourcesClosed,
  );
  expect(owner.snapshot()).toMatchObject({
    ui: { collection: 'UNAVAILABLE' },
    drained: true,
    pendingAtSeal: 0,
    closed: true,
  });
});
