import type { Page } from '@playwright/test';
import { expect, it, vi } from 'vitest';
import { waitCapacityLiveStudentPrompt } from '../../scripts/concurrency/capacity-live-student-question';
const h = vi.hoisted(() => ({
  fail: '',
  error: new Error('PRIVATE_SENTINEL'),
  calls: [] as { text: string; timeout: number }[],
}));
vi.mock('@playwright/test', async (load) => ({
  ...(await load<typeof import('@playwright/test')>()),
  expect: (target: { text: string }) => ({
    toBeVisible: ({ timeout }: { timeout: number }) => {
      h.calls.push({ text: target.text, timeout });
      return target.text === h.fail
        ? Promise.reject(h.error)
        : Promise.resolve();
    },
  }),
}));
it('actual exported prompt wait classifies a counter failure without replacing its error or visiting the mode wait', async () => {
  h.calls = [];
  h.fail = '第 5 / 20 題';
  const page = {
    getByText: (text: string) => ({ first: () => ({ text }) }),
  } as unknown as Page;
  const events: unknown[] = [];
  await expect(
    Reflect.apply(waitCapacityLiveStudentPrompt, undefined, [
      page,
      { counterText: h.fail, displayText: '請看投影幕作答' },
      new AbortController().signal,
      () => 10,
      (event: unknown) => events.push(event),
    ]),
  ).rejects.toBe(h.error);
  expect(h.calls).toEqual([{ text: h.fail, timeout: 20000 }]);
  expect(events).toEqual([
    { wait: 'COUNTER', state: 'ENTERED' },
    { wait: 'COUNTER', state: 'FAILED' },
  ]);
});

import { EventEmitter } from 'node:events';
import { afterEach } from 'vitest';
import { runInNewContext } from 'node:vm';
import { capacityFixture } from './helpers/whole-site-capacity';
import { parseCapacityScope } from '../../scripts/concurrency/capacity-scope';
import * as native from '../../scripts/concurrency/capacity-browser-runtime';
import * as network from '../../scripts/concurrency/capacity-network';
import { chromium } from '@playwright/test';
import type { Browser, BrowserServer } from '@playwright/test';
import type { Server } from 'node:http';
import type { LiveSessionState } from '../../src/features/live/types';
import {
  beginCapacityLiveStateRead,
  createCapacityLiveQuestionObservation,
  readCapacityLiveQuestionUi,
} from '../../scripts/concurrency/capacity-live-question-observation';
const session = '11000000-0000-4000-8000-000000000001';
const nodeState = {
  state: 'question_open',
  stateVersion: 9,
  currentPosition: 5,
  questionCount: 20,
  questionDisplay: 'screen_only',
  isHost: false,
} as LiveSessionState;
const wire = {
  session_id: session,
  state: 'question_open',
  state_version: 8,
  current_position: 4,
  question_count: 20,
  question_display: 'screen_only',
  is_host: false,
};
const view = {
  counter: { collection: 'OBSERVED', position: 4, total: 20 },
  counterVisible: 'VISIBLE',
  screenHint: 'VISIBLE',
  sending: 'HIDDEN',
  answered: 'HIDDEN',
  feedback: 'VISIBLE',
  error: 'HIDDEN',
  waiting: 'HIDDEN',
  loading: 'HIDDEN',
  connection: 'connected',
};
afterEach(() => {
  vi.restoreAllMocks();
  h.fail = '';
  h.calls = [];
});
const setup = async () => {
  const f = await capacityFixture(),
    scope = parseCapacityScope(f.input, f.proof),
    stop = new AbortController();
  const page = new EventEmitter(),
    frame = {},
    cdp = new EventEmitter();
  let url = scope.appUrl + '/app/live/' + session,
    closed = false,
    rejectRead: (reason: unknown) => void = () => undefined;
  const evaluate = vi.fn(() => Promise.resolve(view));
  Object.assign(page, {
    url: () => url,
    mainFrame: () => frame,
    isClosed: () => closed,
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
  const originalProxy = network.createCapacityProxy;
  vi.spyOn(network, 'createCapacityProxy').mockImplementation((s, signal) =>
    originalProxy(s, signal, () => server as unknown as Server),
  );
  vi.spyOn(chromium, 'launchServer').mockResolvedValue({
    process: () => ({ pid: 777 }),
    wsEndpoint: () => 'ws://127.0.0.1:12345/synthetic',
    close: () => Promise.resolve(),
  } as unknown as BrowserServer);
  vi.spyOn(chromium, 'connect').mockResolvedValue({
    newContext: () => Promise.resolve(context),
    close: () => {
      closed = true;
      page.emit('close');
      rejectRead(h.error);
      return Promise.resolve();
    },
  } as unknown as Browser);
  const browser = native.createNativeCapacityBrowser(scope, stop.signal);
  await browser.start();
  const actor = await browser.createActor(1);
  expect(native.getNativeCapacitySendBinding(actor)).toBeDefined();
  const owner = createCapacityLiveQuestionObservation(scope, stop.signal);
  owner.register(actor);
  owner.bind(actor.page, 1, session);
  const watch = () => owner.watch(actor.page, 1, 5, nodeState);
  const request = (origin: string = scope.supabaseUrl) =>
    ({
      method: () => 'POST',
      url: () => origin + '/rest/v1/rpc/get_live_session_state',
    }) as import('@playwright/test').Request;
  const clean = async () => {
    owner.stopAccepting();
    await browser.close();
    await owner.finish();
  };
  return {
    owner,
    actor,
    scope,
    watch,
    request,
    stop,
    evaluate,
    clean,
    browser,
    navigate: () => {
      url = scope.appUrl + '/app/live/other';
      page.emit('framenavigated', frame);
    },
    pendingRead: () => {
      evaluate.mockImplementation(
        () =>
          new Promise((_done, failed) => {
            rejectRead = failed;
          }),
      );
    },
  };
};
it.each(['COUNTER', 'MODE_TEXT'] as const)(
  'captures %s failure once with distinct Node, received and readonly UI views through genuine default factory bindings',
  async (wait) => {
    const x = await setup();
    const read = beginCapacityLiveStateRead(x.actor.page, x.request(), 1);
    read?.complete(wire);
    const observe = x.watch();
    observe({ wait, state: 'FAILED' });
    observe({ wait, state: 'FAILED' });
    await vi.waitFor(() => {
      expect(x.owner.pending()).toBe(0);
    });
    const row = x.owner.snapshot().rows[0];
    expect(row).toMatchObject({
      failedWait: wait,
      node: { currentPosition: 5, stateVersion: 9 },
      browser: {
        collection: 'OBSERVED',
        ordinal: 1,
        state: { currentPosition: 4, stateVersion: 8 },
      },
      ui: { collection: 'OBSERVED', view },
    });
    expect(x.evaluate).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(row)).not.toContain(session);
    await x.clean();
  },
);
it('a pending failure read does not delay the original error, but closure drains it after browser cancellation before the sole writer', async () => {
  const x = await setup();
  x.pendingRead();
  x.watch()({ wait: 'COUNTER', state: 'FAILED' });
  expect(x.owner.pending()).toBe(1);
  const write = vi.fn(() => {
    expect(x.owner.pending()).toBe(0);
    expect(x.owner.snapshot().closed).toBe(true);
    return Promise.resolve();
  });
  x.owner.handoff(write);
  x.owner.stopAccepting();
  const finishing = x.owner.finish();
  await Promise.resolve();
  expect(write).not.toHaveBeenCalled();
  await x.browser.close();
  await finishing;
  await x.owner.finish();
  expect(write).toHaveBeenCalledTimes(1);
  expect(x.owner.snapshot()).toMatchObject({
    closed: true,
    pending: 0,
    rows: [{ ui: { collection: 'UNAVAILABLE' } }],
  });
});
it.each(['foreign', 'session', 'generation', 'navigation', 'closed'] as const)(
  'does not attribute %s received state to this page lease',
  async (mode) => {
    const x = await setup();
    const read = beginCapacityLiveStateRead(
      x.actor.page,
      x.request(mode === 'foreign' ? 'https://foreign.invalid' : undefined),
      1,
    );
    if (mode === 'generation')
      beginCapacityLiveStateRead(x.actor.page, x.request(), 2);
    if (mode === 'navigation') x.navigate();
    if (mode === 'closed') x.owner.stopAccepting();
    read?.complete({
      ...wire,
      ...(mode === 'session' ? { session_id: 'OTHER' } : {}),
    });
    x.watch()({ wait: 'COUNTER', state: 'FAILED' });
    expect(
      x.owner.snapshot().rows.every((r) => r.browser.collection !== 'OBSERVED'),
    ).toBe(true);
    await x.clean();
  },
);
it('request order prevents an older response from overwriting the newest received version', async () => {
  const x = await setup(),
    a = beginCapacityLiveStateRead(x.actor.page, x.request(), 1),
    b = beginCapacityLiveStateRead(x.actor.page, x.request(), 1);
  b?.complete(wire);
  a?.complete({ ...wire, state_version: 1 });
  x.watch()({ wait: 'MODE_TEXT', state: 'ENTERED' });
  expect(x.owner.snapshot().rows[0]?.browser).toMatchObject({
    ordinal: 2,
    state: { stateVersion: 8 },
  });
  await x.clean();
});
it('cloned or replaced actor tuples cannot acquire diagnostic native page ownership', async () => {
  const x = await setup(),
    f = createCapacityLiveQuestionObservation(x.scope, x.stop.signal);
  f.register({ ...x.actor });
  f.bind(x.actor.page, 1, session);
  f.watch(
    x.actor.page,
    1,
    5,
    nodeState,
  )({ wait: 'MODE_TEXT', state: 'FAILED' });
  expect(x.evaluate).not.toHaveBeenCalled();
  f.stopAccepting();
  await f.finish();
  await x.clean();
});
it.each([
  'throw',
  'proxy',
  'getter',
  'secret',
  'nested-getter',
  'prototype',
  'counter-prototype',
] as const)(
  'keeps %s UI capture unavailable and never persists sensitive input',
  async (mode) => {
    const x = await setup();
    let callbacks = 0;
    const withoutConnection = { ...view };
    Reflect.deleteProperty(withoutConnection, 'connection');
    const bad =
      mode === 'prototype'
        ? Object.assign(
            Object.create({
              get connection() {
                callbacks++;
                return 'PRIVATE_SENTINEL';
              },
            }) as object,
            withoutConnection,
          )
        : mode === 'counter-prototype'
          ? {
              ...view,
              counter: Object.assign(
                Object.create({
                  get position() {
                    callbacks++;
                    return 4;
                  },
                }) as object,
                { collection: 'OBSERVED', total: 20 },
              ),
            }
          : mode === 'proxy'
            ? new Proxy(
                {},
                {
                  get(_target, key) {
                    if (key === 'then') return undefined;
                    callbacks++;
                    throw h.error;
                  },
                },
              )
            : mode === 'getter'
              ? Object.defineProperty({}, 'counter', {
                  get() {
                    callbacks++;
                    throw h.error;
                  },
                })
              : mode === 'nested-getter'
                ? {
                    ...view,
                    counter: Object.defineProperty({}, 'position', {
                      get() {
                        callbacks++;
                        throw h.error;
                      },
                    }),
                  }
                : { ...view, connection: 'PRIVATE_SENTINEL' };
    x.evaluate.mockImplementation(() =>
      mode === 'throw'
        ? Promise.reject(h.error)
        : Promise.resolve(bad as typeof view),
    );
    x.watch()({ wait: 'COUNTER', state: 'FAILED' });
    await vi.waitFor(() => {
      expect(x.owner.pending()).toBe(0);
    });
    expect(x.owner.snapshot().rows[0]?.ui.collection).toBe('UNAVAILABLE');
    expect(callbacks).toBe(0);
    expect(JSON.stringify(x.owner.snapshot())).not.toContain(
      'PRIVATE_SENTINEL',
    );
    await x.clean();
  },
);
it('serialized readonly callback is self-contained and reads only fixed UI selectors, not question text or storage', () => {
  const queried: string[] = [];
  const result: unknown = runInNewContext(
    '(' + readCapacityLiveQuestionUi.toString() + ')()',
    {
      document: {
        querySelector: (selector: string) => {
          queried.push(selector);
          return null;
        },
        querySelectorAll: (selector: string) => {
          queried.push(selector);
          return [];
        },
      },
    },
  );
  expect(result).toMatchObject({
    counter: { collection: 'UNOBSERVED', position: null },
    connection: 'UNOBSERVED',
    error: 'HIDDEN',
  });
  expect(
    queried.every((s) => !/input|question.*prompt|option|body|html/iu.test(s)),
  ).toBe(true);
});
it('normal and mode-failed waits preserve the shared original budget, target order and callback exception isolation', async () => {
  const page = {
    getByText: (text: string) => ({ first: () => ({ text }) }),
  } as unknown as Page;
  const target = { counterText: '第 5 / 20 題', displayText: '請看投影幕作答' };
  let ticks = [0, 0, 19999, 19999];
  h.fail = '';
  await Reflect.apply(waitCapacityLiveStudentPrompt, undefined, [
    page,
    target,
    new AbortController().signal,
    () => ticks.shift() ?? 19999,
    () => {
      throw h.error;
    },
  ]);
  expect(h.calls).toEqual([
    { text: target.counterText, timeout: 20000 },
    { text: target.displayText, timeout: 1 },
  ]);
  h.calls = [];
  ticks = [0, 0, 19999];
  h.fail = target.displayText;
  const events: unknown[] = [];
  await expect(
    Reflect.apply(waitCapacityLiveStudentPrompt, undefined, [
      page,
      target,
      new AbortController().signal,
      () => ticks.shift() ?? 19999,
      (e: unknown) => events.push(e),
    ]),
  ).rejects.toBe(h.error);
  expect(events).toEqual([
    { wait: 'COUNTER', state: 'ENTERED' },
    { wait: 'COUNTER', state: 'RETURNED' },
    { wait: 'MODE_TEXT', state: 'ENTERED' },
    { wait: 'MODE_TEXT', state: 'FAILED' },
  ]);
});

it.each(['abort', 'navigation', 'tuple'] as const)(
  'drains a %s-invalidated UI read without attributing its late result',
  async (mode) => {
    const x = await setup();
    let deliver: (value: typeof view) => void = () => undefined;
    x.evaluate.mockImplementation(
      () =>
        new Promise((resolve) => {
          deliver = resolve;
        }),
    );
    x.watch()({ wait: 'COUNTER', state: 'FAILED' });
    if (mode === 'abort') x.stop.abort();
    else if (mode === 'navigation') x.navigate();
    else x.actor.observer = {} as typeof x.actor.observer;
    deliver(view);
    await vi.waitFor(() => {
      expect(x.owner.pending()).toBe(0);
    });
    expect(x.owner.snapshot().rows[0]?.ui.collection).toBe('UNAVAILABLE');
    await x.clean();
  },
);
it('sixty fixed rows remain bounded and a sixty-first is explicit overflow, without admitting another UI read', async () => {
  const x = await setup();
  for (let actor = 0; actor < 61; actor++)
    x.owner.watch(
      x.actor.page,
      actor,
      5,
      nodeState,
    )({ wait: 'COUNTER', state: 'ENTERED' });
  const snapshot = x.owner.snapshot();
  expect(snapshot).toMatchObject({ collection: 'UNAVAILABLE', overflow: true });
  expect(snapshot.rows).toHaveLength(60);
  expect(
    snapshot.rows.every(
      (row) => Buffer.byteLength(JSON.stringify(row)) <= 2048,
    ),
  ).toBe(true);
  expect(Buffer.byteLength(JSON.stringify(snapshot))).toBeLessThanOrEqual(
    128 * 1024,
  );
  expect(x.evaluate).not.toHaveBeenCalled();
  await x.clean();
});
