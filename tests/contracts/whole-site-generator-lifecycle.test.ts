const required = <T>(value: T | null | undefined): T => {
  if (value === null || value === undefined) throw Error('SYNTHETIC_REQUIRED');
  return value;
};
import { EventEmitter } from 'node:events';
import type { Server } from 'node:http';
import type { Browser, BrowserServer } from '@playwright/test';
import { it, expect, vi } from 'vitest';
import {
  createNativeCapacityBrowser,
  type NativeCapacityBrowserPorts,
} from '../../scripts/concurrency/capacity-browser-runtime';
import { createCapacityProxy } from '../../scripts/concurrency/capacity-network';
import { parseCapacityScope } from '../../scripts/concurrency/capacity-scope';
import { runCapacityEntryBarrier } from '../../scripts/concurrency/capacity-browser-entry';
import { createCapacityManifest } from '../../scripts/concurrency/capacity-manifest';
import type { NativeCapacityActor } from '../../scripts/concurrency/capacity-browser-runtime';
import type { GeneratorEvent } from '../../scripts/concurrency/capacity-generator-diagnostics';
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
it('actual native start reports proxy/launch/connect without changing operations', async () => {
  const h = await setup(),
    events: unknown[] = [];
  const runtime = Reflect.apply(createNativeCapacityBrowser, undefined, [
    h.scope,
    new AbortController().signal,
    h.ports,
    (e: unknown) => events.push(e),
  ]);
  await runtime.start();
  await runtime.close();
  expect(events).toContainEqual({
    phase: 'PROXY',
    state: 'ENTERED',
    actorOrdinal: null,
  });
  expect(events).toContainEqual({
    phase: 'CONNECT',
    state: 'COMPLETED',
    actorOrdinal: null,
  });
});

const flush = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};
const entryFixture = async () => {
  const f = await capacityFixture(),
    scope = parseCapacityScope(f.input, f.proof),
    plan = createCapacityManifest(scope),
    events: GeneratorEvent[] = [];
  const actors = Array.from({ length: 3 }, (_, actorIndex) => ({
    actorIndex,
    page: {},
    observer: {
      arm: (phase: string) => ({
        finished: Promise.resolve({
          actorIndex,
          phase,
          clock: 'CHROMIUM_NETWORK_MONOTONIC',
          requestAtMs: actorIndex * 10,
          durationMs: 10,
          status: 200,
          physicalRequests: 1,
        }),
        cancel: vi.fn(),
      }),
      snapshot: () => ({
        available: true,
        unexpectedHttpErrors: 0,
        unexpectedNetworkFailures: 0,
        pendingAction: false,
      }),
    },
  })) as unknown as NativeCapacityActor[];
  const runtime = {
    generator: (e: GeneratorEvent) => events.push(e),
    start: vi.fn(() => Promise.resolve()),
    createActor: vi.fn((i: number) => Promise.resolve(required(actors[i]))),
    snapshot: () => ({ available: true }),
  };
  const ui = {
    landing: vi.fn(() => Promise.resolve()),
    ready: vi.fn(() => Promise.resolve()),
    submit: vi.fn(() => Promise.resolve()),
    confirmed: vi.fn(() => Promise.resolve()),
  };
  const readback = vi.fn(() =>
    Promise.resolve({
      anonymousNoAuthOrMail: true,
      bootstrapComplete: true,
      subject: null,
      role: null,
      account: null,
      proofSha256: 'a'.repeat(64),
    }),
  );
  return {
    scope,
    plan,
    runtime,
    ui,
    readback,
    actors,
    events,
    journal: {
      directory: 'SYNTHETIC_ONLY',
      write: vi.fn(() => Promise.resolve()),
    },
    legId: 'anonymous_entry_prepare-native_browser-3',
    predecessors: [],
  };
};
it('actual native actor records context/permission/page/observer and closes owned resources', async () => {
  const h = await setup(),
    events: GeneratorEvent[] = [],
    runtime = createNativeCapacityBrowser(
      h.scope,
      new AbortController().signal,
      h.ports,
      (e) => events.push(e),
    );
  await runtime.start();
  await runtime.createActor(0);
  await runtime.close();
  expect(
    events.filter((e) => e.state === 'COMPLETED').map((e) => e.phase),
  ).toEqual([
    'PROXY',
    'LAUNCH',
    'CONNECT',
    'CONTEXT',
    'PERMISSION',
    'PAGE',
    'REQUEST_OBSERVER',
  ]);
  expect(
    events.filter((e) => e.phase === 'PAGE').every((e) => e.actorOrdinal === 0),
  ).toBe(true);
  expect(runtime.snapshot().resourcesClosed).toBe(true);
});
it('actual entry retains full-set setup/dispatch and distinguishes invoked landing from settled', async () => {
  const f = await entryFixture(),
    baseline = Promise.withResolvers<undefined>(),
    gates = Array.from({ length: 3 }, () =>
      Promise.withResolvers<NativeCapacityActor>(),
    ),
    landing = Promise.withResolvers<undefined>(),
    signal = new AbortController();
  f.runtime.start.mockReturnValue(baseline.promise);
  f.runtime.createActor.mockImplementation((i) => required(gates[i]).promise);
  f.ui.landing.mockReturnValue(landing.promise);
  const task = runCapacityEntryBarrier({ ...f, signal: signal.signal });
  await flush();
  expect(f.runtime.createActor).not.toHaveBeenCalled();
  baseline.resolve(undefined);
  await flush();
  expect(f.runtime.createActor).toHaveBeenCalledTimes(3);
  expect(f.ui.landing).not.toHaveBeenCalled();
  required(gates[0]).resolve(required(f.actors[0]));
  required(gates[1]).resolve(required(f.actors[1]));
  await flush();
  expect(f.ui.landing).not.toHaveBeenCalled();
  required(gates[2]).resolve(required(f.actors[2]));
  await flush();
  expect(f.ui.landing).toHaveBeenCalledTimes(3);
  expect(
    f.events.filter((e) => e.phase === 'LANDING' && e.state === 'ENTERED'),
  ).toHaveLength(3);
  expect(
    f.events.filter((e) => e.phase === 'LANDING' && e.state === 'COMPLETED'),
  ).toHaveLength(0);
  signal.abort();
  landing.resolve(undefined);
  const result = await task;
  expect(result.report).toMatchObject({
    result: 'FAIL',
    phase: 'entry',
    actorsCompleted: 0,
    entry: null,
    observations: [],
  });
});
it('actual full-set success retains CDP barrier and ready operations even if observer throws', async () => {
  const f = await entryFixture();
  f.runtime.generator = () => {
    throw Error('PRIVATE_OBSERVER');
  };
  const result = await runCapacityEntryBarrier({
    ...f,
    signal: new AbortController().signal,
  });
  expect(result.report.result).toBe('PASS');
  expect(result.report.entry?.skewMs).toBe(20);
  expect(f.ui.ready).toHaveBeenCalledTimes(3);
  expect(f.ui.submit).not.toHaveBeenCalled();
});
it.each(['sync', 'async'] as const)(
  'actual ready %s failure keeps original kickoff semantics',
  async (kind) => {
    const f = await entryFixture(),
      error = Error('PRIVATE_OPERATION');
    f.ui.ready.mockImplementationOnce(() => {
      if (kind === 'sync') throw error;
      return Promise.reject(error);
    });
    const result = await runCapacityEntryBarrier({
      ...f,
      signal: new AbortController().signal,
    });
    expect(result.report.result).toBe('FAIL');
    expect(f.ui.ready).toHaveBeenCalledTimes(kind === 'sync' ? 1 : 3);
    expect(f.events).toContainEqual({
      phase: 'READY',
      state: 'FAILED',
      actorOrdinal: 0,
    });
    expect(JSON.stringify(f.events)).not.toContain('PRIVATE');
  },
);
it('native original failure and owned close remain failclosed when diagnostic observer throws', async () => {
  const f = await setup();
  f.context.grantPermissions.mockRejectedValueOnce(Error('PRIVATE'));
  const runtime = createNativeCapacityBrowser(
    f.scope,
    new AbortController().signal,
    f.ports,
    () => {
      throw Error('OBSERVER');
    },
  );
  await runtime.start();
  await expect(runtime.createActor(0)).rejects.toThrow(
    'CAPACITY_EVIDENCE_INVALID',
  );
  expect(f.context.newPage).not.toHaveBeenCalled();
  await runtime.close();
  expect(runtime.snapshot().resourcesClosed).toBe(true);
});
