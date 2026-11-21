import { EventEmitter } from 'node:events';
import { types } from 'node:util';
import { runInNewContext } from 'node:vm';
import { afterEach, expect, it, vi } from 'vitest';
import { chromium, type Browser, type BrowserServer } from '@playwright/test';
import type { Server } from 'node:http';
import type { LiveSessionState } from '../../src/features/live/types';
import {
  captureLiveReconcileProjection,
  createLiveReconcileDiagnostics,
  emitLiveTrace,
} from '../../src/features/live/lib/live-reconcile-diagnostics';
import {
  createCapacityLiveQuestionObservation,
  readCapacityLiveQuestionUi,
} from '../../scripts/concurrency/capacity-live-question-observation';
import * as native from '../../scripts/concurrency/capacity-browser-runtime';
import * as network from '../../scripts/concurrency/capacity-network';
import { parseCapacityScope } from '../../scripts/concurrency/capacity-scope';
import { capacityFixture } from './helpers/whole-site-capacity';

const session = '11000000-0000-4000-8000-000000000001';
const state = {
  state: 'question_open',
  stateVersion: 11,
  currentPosition: 5,
  questionCount: 20,
  questionDisplay: 'screen_only',
  isHost: false,
} as LiveSessionState;
const view = {
  counter: { collection: 'UNOBSERVED', position: null, total: null },
  counterVisible: 'HIDDEN',
  screenHint: 'HIDDEN',
  sending: 'HIDDEN',
  answered: 'HIDDEN',
  feedback: 'VISIBLE',
  error: 'HIDDEN',
  waiting: 'HIDDEN',
  loading: 'HIDDEN',
  connection: 'connected',
};
const install = () => {
  const slot = { v: 1, q: '' };
  Object.defineProperty(window, '__colorplayCapacityRealtime', {
    configurable: true,
    value: { liveTrace: slot },
  });
  const trace = createLiveReconcileDiagnostics();
  emitLiveTrace(trace, 'SDK_CALLBACK', { payload: { state_version: 11 } });
  emitLiveTrace(trace, 'HANDLER_AUTHORITATIVE', { state_version: 11 });
  emitLiveTrace(trace, 'READ_START');
  return slot;
};
afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(window, '__colorplayCapacityRealtime');
});
const browserView = (root: unknown) =>
  JSON.parse(
    JSON.stringify(
      runInNewContext(`(${readCapacityLiveQuestionUi.toString()})()`, {
        window: root,
        document: { querySelector: () => null, querySelectorAll: () => [] },
      }),
    ),
  ) as unknown;

it('serializes the actual callback without Node helpers and reads only the existing bounded trace primitive', () => {
  const slot = install();
  const raw = browserView({
    __colorplayCapacityRealtime: { liveTrace: slot },
  }) as { reconcile: unknown };
  expect(
    captureLiveReconcileProjection(raw.reconcile, types.isProxy),
  ).toHaveLength(79);
  expect(Buffer.byteLength(slot.q)).toBeLessThanOrEqual(768);
  expect(
    captureLiveReconcileProjection(
      (browserView({}) as { reconcile: unknown }).reconcile,
      types.isProxy,
    ),
  ).toEqual([1, 0]);
});

it('does not invoke browser trace accessors or execute string data', () => {
  let calls = 0;
  const slot = {
    get q() {
      calls += 1;
      return 'PRIVATE';
    },
  };
  const root = { __colorplayCapacityRealtime: { liveTrace: slot } };
  const raw = browserView(root) as { reconcile: unknown };
  expect(raw.reconcile).toEqual([1, 0]);
  expect(calls).toBe(0);
  for (const q of ['globalThis.PRIVATE=1', '[1,0e0]', 'x'.repeat(769)]) {
    const value = browserView({
      __colorplayCapacityRealtime: { liveTrace: { q } },
    }) as { reconcile: unknown };
    expect(
      captureLiveReconcileProjection(value.reconcile, types.isProxy),
    ).toEqual([1, 3]);
  }
});

const setup = async () => {
  const f = await capacityFixture();
  const scope = parseCapacityScope(f.input, f.proof);
  const stop = new AbortController(),
    page = new EventEmitter(),
    frame = {},
    cdp = new EventEmitter();
  const evaluate = vi.fn<() => Promise<unknown>>(() =>
    Promise.resolve({ ...view, reconcile: install().q }),
  );
  Object.assign(page, {
    url: () => scope.appUrl + '/app/live/' + session,
    mainFrame: () => frame,
    isClosed: () => false,
    evaluate,
  });
  Object.assign(cdp, {
    send: () => Promise.resolve({}),
    detach: () => Promise.resolve(),
  });
  const context = new EventEmitter();
  Object.assign(context, {
    pages: () => [page],
    newPage: () => Promise.resolve(page),
    newCDPSession: () => Promise.resolve(cdp),
    grantPermissions: () => Promise.resolve(),
    setDefaultTimeout: () => undefined,
    close: () => Promise.resolve(),
  });
  const server = new EventEmitter();
  Object.assign(server, {
    listening: false,
    address: () => ({ address: '127.0.0.1', port: 12345 }),
    listen: (_port: number, _host: string, done: () => void) => {
      Reflect.set(server, 'listening', true);
      done();
    },
    close: (done: () => void) => {
      Reflect.set(server, 'listening', false);
      done();
    },
  });
  const proxy = network.createCapacityProxy;
  vi.spyOn(network, 'createCapacityProxy').mockImplementation((s, signal) =>
    proxy(s, signal, () => server as unknown as Server),
  );
  vi.spyOn(chromium, 'launchServer').mockResolvedValue({
    process: () => ({ pid: 777 }),
    wsEndpoint: () => 'ws://127.0.0.1:12345/synthetic',
    close: () => Promise.resolve(),
  } as unknown as BrowserServer);
  vi.spyOn(chromium, 'connect').mockResolvedValue({
    newContext: () => Promise.resolve(context),
    close: () => {
      page.emit('close');
      return Promise.resolve();
    },
  } as unknown as Browser);
  const browser = native.createNativeCapacityBrowser(scope, stop.signal);
  await browser.start();
  const actor = await browser.createActor(1);
  const owner = createCapacityLiveQuestionObservation(scope, stop.signal);
  owner.register(actor);
  owner.bind(actor.page, 1, session);
  return { owner, actor, browser, evaluate, scope };
};

it('uses one original evaluate and drains it after close before the same single writer', async () => {
  const x = await setup();
  let settle!: (value: typeof view & { reconcile: string }) => void;
  const read = new Promise<typeof view & { reconcile: string }>((done) => {
    settle = done;
  });
  x.evaluate.mockReturnValue(read);
  const watch = x.owner.watch(x.actor.page, 1, 5, state);
  watch({ wait: 'COUNTER', state: 'FAILED' });
  expect(x.evaluate).toHaveBeenCalledOnce();
  const writer = vi.fn(() => Promise.resolve());
  x.owner.handoff(writer);
  expect(x.owner.pending()).toBe(1);
  x.owner.stopAccepting();
  await x.browser.close();
  const finish = x.owner.finish();
  await Promise.resolve();
  expect(writer).not.toHaveBeenCalled();
  settle({ ...view, reconcile: install().q });
  await finish;
  expect(writer).toHaveBeenCalledOnce();
  expect(x.owner.snapshot()).toMatchObject({ closed: true, pending: 0 });
  // M80 deliberately drops values after stop; drain success is not retained-UI proof.
  expect(x.owner.snapshot().rows[0]?.ui.collection).toBe('UNAVAILABLE');
});

it('captures a genuine failure trace before stop with unchanged 2048/128KiB/512KiB guards', async () => {
  const x = await setup();
  const watch = x.owner.watch(x.actor.page, 1, 5, state);
  watch({ wait: 'COUNTER', state: 'FAILED' });
  while (x.owner.pending()) await Promise.resolve();
  const row = x.owner.snapshot().rows[0];
  expect(row?.ui.collection).toBe('OBSERVED');
  expect(row?.ui.view?.reconcile).toHaveLength(79);
  expect(x.evaluate).toHaveBeenCalledOnce();
  if (!row) throw Error('ROW_NOT_OBSERVED');
  const worst = structuredClone(row);
  worst.node = { ...state, stateVersion: 1000000, waitingForNext: true };
  worst.browser = {
    collection: 'OBSERVED',
    ordinal: 1000000,
    atNodeMs: 86400000,
    state: worst.node,
  };
  worst.ui.beforeNodeMs = 86400000;
  worst.ui.afterNodeMs = 86400000;
  const numbers = [
    1,
    2,
    9999,
    1000000,
    ...Array<number>(32).fill(31250),
    ...Array.from({ length: 6 }, () => [
      1000000, 31, 1000000, 20, 86400000,
    ]).flat(),
    ...Array.from({ length: 4 }, () => [1000000, 86400000]).flat(),
    1000000,
    19,
    1000000,
    20,
    86400000,
  ];
  expect(captureLiveReconcileProjection(numbers, types.isProxy)).toHaveLength(
    79,
  );
  if (!worst.ui.view) throw Error('VIEW_NOT_OBSERVED');
  worst.ui.view.reconcile = numbers;
  const rowBytes = Buffer.byteLength(JSON.stringify(worst));
  expect(rowBytes).toBeLessThanOrEqual(2048);
  const value = {
    ...x.owner.snapshot(),
    rows: Array.from({ length: 60 }, (_, actorIndex) => ({
      ...worst,
      actorIndex,
    })),
  };
  expect(Buffer.byteLength(JSON.stringify(value))).toBeLessThanOrEqual(
    128 * 1024,
  );
  expect(
    Buffer.byteLength(JSON.stringify({ questionObservation: value })),
  ).toBeLessThanOrEqual(512 * 1024);
  x.owner.stopAccepting();
  await x.browser.close();
  await x.owner.finish();
});

it.each(['getter', 'proxy', 'function', 'prototype'] as const)(
  'does not invoke a Node %s trace while preserving the observed fixed UI',
  async (kind) => {
    const x = await setup();
    let calls = 0;
    const hostile: unknown =
      kind === 'getter'
        ? Object.defineProperty([1, 0], '1', {
            get: () => {
              calls += 1;
              return 0;
            },
          })
        : kind === 'proxy'
          ? new Proxy([1, 0], {
              get: () => {
                calls += 1;
                throw Error();
              },
            })
          : kind === 'function'
            ? () => {
                calls += 1;
              }
            : Object.setPrototypeOf([1, 0], {});
    x.evaluate.mockResolvedValue({
      ...view,
      reconcile: hostile,
    });
    x.owner.watch(
      x.actor.page,
      1,
      5,
      state,
    )({ wait: 'COUNTER', state: 'FAILED' });
    while (x.owner.pending()) await Promise.resolve();
    expect(calls).toBe(0);
    expect(x.owner.snapshot().rows[0]?.ui).toMatchObject({
      collection: 'OBSERVED',
      view: { reconcile: [1, 3] },
    });
    x.owner.stopAccepting();
    await x.browser.close();
    await x.owner.finish();
  },
);
