import { EventEmitter } from 'node:events';

import type { Page } from '@playwright/test';
import { afterEach, expect, it, vi } from 'vitest';

import { attachDiagnostics } from '../e2e/helpers/staging-capacity-browser';

afterEach(() => vi.useRealTimers());
const setup = async () => {
  const pageEvents = new EventEmitter();
  let closed = false;
  let installHook: (() => void) | undefined;
  const page = {
    on: (name: string, callback: (...args: unknown[]) => void) => {
      pageEvents.on(name, callback);
      if (name === 'close') installHook?.();
    },
    off: (name: string, callback: (...args: unknown[]) => void) =>
      pageEvents.off(name, callback),
    isClosed: () => closed,
    url: () => 'http://127.0.0.1/app/live/11000000-0000-4000-8000-000000000001',
    addInitScript: () => Promise.resolve(),
  } as unknown as Page;
  const diagnostics = await attachDiagnostics(page);
  const socketEvents = new EventEmitter();
  pageEvents.emit('websocket', {
    url: () => 'ws://127.0.0.1/realtime/v1/websocket',
    on: (name: string, callback: (...args: unknown[]) => void) =>
      socketEvents.on(name, callback),
  });
  const ack = (
    topic = 'realtime:live-session:11000000-0000-4000-8000-000000000001',
    status = 'ok',
  ) => {
    socketEvents.emit('framesent', {
      payload: JSON.stringify({
        topic,
        event: 'phx_join',
        ref: 'synthetic-ref',
        payload: {},
      }),
    });
    socketEvents.emit('framereceived', {
      payload: JSON.stringify({
        topic,
        event: 'phx_reply',
        ref: 'synthetic-ref',
        payload: { status },
      }),
    });
  };
  return {
    diagnostics,
    pageEvents,
    ack,
    socketEvents,
    onInstall: (callback: () => void) => {
      installHook = callback;
    },
    close: () => {
      closed = true;
      pageEvents.emit('close');
    },
  };
};

it('waits for a later private ACK within the existing remaining budget and clears its resources', async () => {
  vi.useFakeTimers();
  const { diagnostics, pageEvents, ack } = await setup();
  const pending = diagnostics.waitForSubscriptionAck(500);
  await vi.advanceTimersByTimeAsync(200);
  expect(pageEvents.listenerCount('close')).toBe(1);
  ack();
  await expect(pending).resolves.toBe(true);
  expect(vi.getTimerCount()).toBe(0);
  expect(pageEvents.listenerCount('close')).toBe(0);
});

it.each(['timeout', 'abort', 'close'] as const)(
  'rejects an unobserved ACK on %s and removes all wait resources',
  async (outcome) => {
    vi.useFakeTimers();
    const { diagnostics, pageEvents, ack, close } = await setup();
    const controller = new AbortController();
    const added = vi.spyOn(controller.signal, 'addEventListener');
    const removed = vi.spyOn(controller.signal, 'removeEventListener');
    const pending = diagnostics.waitForSubscriptionAck(100, controller.signal);
    if (outcome === 'timeout') await vi.advanceTimersByTimeAsync(100);
    else if (outcome === 'abort') controller.abort();
    else close();
    await expect(pending).resolves.toBe(false);
    expect(added).toHaveBeenCalledWith('abort', expect.any(Function), {
      once: true,
    });
    expect(removed).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(pageEvents.listenerCount('close')).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    ack();
    expect(vi.getTimerCount()).toBe(0);
  },
);

it('uses an already observed ACK without installing new listeners or timers', async () => {
  vi.useFakeTimers();
  const { diagnostics, pageEvents, ack } = await setup();
  ack();
  await expect(diagnostics.waitForSubscriptionAck(100)).resolves.toBe(true);
  expect(pageEvents.listenerCount('close')).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
});

it('rechecks the sequence after installation so an ACK during registration cannot be lost', async () => {
  vi.useFakeTimers();
  const { diagnostics, pageEvents, ack, onInstall } = await setup();
  onInstall(ack);
  await expect(diagnostics.waitForSubscriptionAck(100)).resolves.toBe(true);
  expect(pageEvents.listenerCount('close')).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
});

it.each([
  ['realtime:other-channel', 'ok'],
  ['realtime:live-session:11000000-0000-4000-8000-000000000001', 'error'],
  ['realtime:live-session:11000000-0000-4000-8000-000000000001', 'unknown'],
])(
  'does not treat unrelated or unsuccessful replies as a private SUBSCRIBED ACK',
  async (topic, status) => {
    vi.useFakeTimers();
    const { diagnostics, ack } = await setup();
    const pending = diagnostics.waitForSubscriptionAck(100);
    ack(topic, status);
    await vi.advanceTimersByTimeAsync(100);
    await expect(pending).resolves.toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  },
);

it.each([0, -1, NaN, Infinity])(
  'fails closed without a usable remaining budget',
  async (timeout) => {
    vi.useFakeTimers();
    const { diagnostics, pageEvents } = await setup();
    await expect(diagnostics.waitForSubscriptionAck(timeout)).resolves.toBe(
      false,
    );
    expect(pageEvents.listenerCount('close')).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  },
);

it('Host needs two exact owned topic ACKs, while a Student needs only shared', async () => {
  vi.useFakeTimers();
  const x = await setup();
  const wait = x.diagnostics.waitForSubscriptionAck(
    500,
    undefined,
    'HOST_PROGRESS',
  );
  x.ack();
  let done = false;
  void wait.then(() => {
    done = true;
  });
  await vi.advanceTimersByTimeAsync(0);
  expect(done).toBe(false);
  const topic =
    'realtime:live-host-progress:11000000-0000-4000-8000-000000000001';
  x.socketEvents.emit('framesent', {
    payload: JSON.stringify({
      topic,
      event: 'phx_join',
      ref: 'progress',
      payload: {},
    }),
  });
  x.socketEvents.emit('framereceived', {
    payload: JSON.stringify({
      topic,
      event: 'phx_reply',
      ref: 'progress',
      join_ref: 'progress',
      payload: { status: 'ok' },
    }),
  });
  await expect(wait).resolves.toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});
it.each([
  'foreign-session',
  'wrong-ref',
  'foreign-join-ref',
  'progress-only',
  'disconnect',
  'duplicate-ref',
])('does not promote %s to combined Host authority', async (kind) => {
  vi.useFakeTimers();
  const x = await setup();
  const wait = x.diagnostics.waitForSubscriptionAck(
    100,
    undefined,
    'HOST_PROGRESS',
  );
  if (kind !== 'progress-only') x.ack();
  const topic =
    'realtime:live-host-progress:' +
    (kind === 'foreign-session'
      ? '11000000-0000-4000-8000-000000000099'
      : '11000000-0000-4000-8000-000000000001');
  const ref = kind === 'duplicate-ref' ? 'synthetic-ref' : 'progress';
  x.socketEvents.emit('framesent', {
    payload: JSON.stringify({ topic, event: 'phx_join', ref, payload: {} }),
  });
  if (kind === 'disconnect') x.socketEvents.emit('close');
  x.socketEvents.emit('framereceived', {
    payload: JSON.stringify({
      topic,
      event: 'phx_reply',
      ref: kind === 'wrong-ref' ? 'other' : ref,
      join_ref: kind === 'foreign-join-ref' ? 'old' : ref,
      payload: { status: 'ok' },
    }),
  });
  await vi.advanceTimersByTimeAsync(100);
  await expect(wait).resolves.toBe(false);
  expect(vi.getTimerCount()).toBe(0);
});

it.each([
  'uppercase-shared',
  'uppercase-progress',
  'numeric-join-ref',
  'object-join-ref',
  'array-join-ref',
])('refuses false Host proof from %s', async (kind) => {
  vi.useFakeTimers();
  const x = await setup();
  const wait = x.diagnostics.waitForSubscriptionAck(
    100,
    undefined,
    'HOST_PROGRESS',
  );
  const session = '11000000-0000-4000-8000-000000000001';
  const topics =
    kind === 'uppercase-shared'
      ? ['live-session', 'LIVE-SESSION']
      : [
          'live-session',
          kind === 'uppercase-progress'
            ? 'LIVE-HOST-PROGRESS'
            : 'live-host-progress',
        ];
  for (const [index, family] of topics.entries()) {
    const topic = 'realtime:' + family + ':' + session,
      ref = String(index + 1);
    const joinRef =
      kind === 'numeric-join-ref'
        ? 123
        : kind === 'object-join-ref'
          ? {}
          : kind === 'array-join-ref'
            ? []
            : null;
    x.socketEvents.emit('framesent', {
      payload: JSON.stringify({
        event: 'phx_join',
        topic,
        ref,
        join_ref: joinRef,
        payload: {},
      }),
    });
    x.socketEvents.emit('framereceived', {
      payload: JSON.stringify({
        event: 'phx_reply',
        topic,
        ref,
        join_ref: joinRef,
        payload: { status: 'ok' },
      }),
    });
  }
  await vi.advanceTimersByTimeAsync(100);
  await expect(wait).resolves.toBe(false);
  expect(vi.getTimerCount()).toBe(0);
});
