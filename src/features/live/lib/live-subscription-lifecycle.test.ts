import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createLiveSubscriptionLifecycle } from './live-subscription-lifecycle';

interface Channel {
  index: number;
}
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const setup = (random = 0) => {
  const callbacks: ((status: string, error?: Error) => void)[] = [];
  const broadcasts: ((message: { payload: unknown }) => void)[] = [];
  const channels: Channel[] = [];
  const remove = vi
    .fn<(_: Channel) => Promise<unknown>>()
    .mockResolvedValue('ok');
  const onChange = vi.fn();
  const onSubscribed = vi.fn();
  const onBroadcast = vi.fn();
  const lifecycle = createLiveSubscriptionLifecycle({
    createChannel: vi.fn(() => {
      const channel = { index: channels.length };
      channels.push(channel);
      return channel;
    }),
    attach: (_channel, broadcast, status) => {
      broadcasts.push(broadcast);
      callbacks.push(status);
    },
    removeChannel: remove,
    onChange,
    onSubscribed,
    onBroadcast,
    random: () => random,
  });
  return {
    lifecycle,
    callbacks,
    broadcasts,
    channels,
    remove,
    onChange,
    onSubscribed,
    onBroadcast,
  };
};
const tick = (ms = 0) => vi.advanceTimersByTimeAsync(ms);
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

it('waits the bounded initial jitter and includes reconnect jitter', async () => {
  const test = setup(1);
  await tick(1499);
  expect(test.channels).toHaveLength(0);
  await tick(1);
  test.callbacks[0]?.('TIMED_OUT');
  await tick(749);
  expect(test.channels).toHaveLength(1);
  await tick(1);
  expect(test.channels).toHaveLength(2);
  test.lifecycle.dispose();
});

it('keeps two automatic attempts across SUBSCRIBED and starts one manual cycle', async () => {
  const test = setup();
  await tick();
  for (const [index, backoff] of [500, 1000].entries()) {
    test.callbacks[index]?.('SUBSCRIBED');
    test.callbacks[index]?.('CHANNEL_ERROR');
    await tick(backoff);
  }
  test.callbacks[2]?.('SUBSCRIBED');
  test.callbacks[2]?.('CLOSED');
  await tick(10_000);
  expect(test.channels).toHaveLength(3);
  expect(test.onChange).toHaveBeenLastCalledWith({
    status: 'disconnected',
    reconnecting: false,
    blocked: false,
  });
  test.lifecycle.reconnect();
  test.lifecycle.reconnect();
  test.lifecycle.reconnect();
  await tick();
  expect(test.channels).toHaveLength(4);
  test.callbacks[3]?.('SUBSCRIBED');
  test.callbacks[3]?.('CHANNEL_ERROR');
  await tick(500);
  expect(test.channels).toHaveLength(5);
  test.lifecycle.dispose();
});

it.each(['error', 'timed out', 'reject'])(
  'retains stale ownership after %s and manual retries that channel',
  async (result) => {
    const test = setup();
    await tick();
    if (result === 'reject')
      test.remove.mockRejectedValueOnce(new Error('synthetic-private-marker'));
    else test.remove.mockResolvedValueOnce(result);
    test.callbacks[0]?.('CHANNEL_ERROR');
    await tick(10_000);
    expect(test.channels).toHaveLength(1);
    expect(test.onChange).toHaveBeenLastCalledWith({
      status: 'disconnected',
      reconnecting: false,
      blocked: false,
    });
    test.lifecycle.reconnect();
    test.lifecycle.reconnect();
    await tick();
    expect(test.remove).toHaveBeenCalledTimes(2);
    expect(test.remove.mock.calls[0]?.[0]).toBe(test.channels[0]);
    expect(test.remove.mock.calls[1]?.[0]).toBe(test.channels[0]);
    expect(test.channels).toHaveLength(2);
    test.lifecycle.dispose();
  },
);

it('awaits confirmed removal and fences all old callbacks during cleanup', async () => {
  const test = setup();
  const pending = deferred<unknown>();
  await tick();
  test.remove.mockReturnValueOnce(pending.promise);
  test.callbacks[0]?.('CHANNEL_ERROR');
  test.callbacks[0]?.('SUBSCRIBED');
  test.broadcasts[0]?.({ payload: { state_version: 99 } });
  await tick(5000);
  expect(test.channels).toHaveLength(1);
  expect(test.onSubscribed).not.toHaveBeenCalled();
  expect(test.onBroadcast).not.toHaveBeenCalled();
  pending.resolve('ok');
  await tick(500);
  test.callbacks[1]?.('SUBSCRIBED');
  test.callbacks[0]?.('CLOSED');
  test.broadcasts[1]?.({ payload: { state_version: 3 } });
  expect(test.onSubscribed).toHaveBeenCalledTimes(1);
  expect(test.onBroadcast).toHaveBeenCalledTimes(1);
  expect(test.onChange).toHaveBeenLastCalledWith({
    status: 'connected',
    reconnecting: false,
    blocked: false,
  });
  test.lifecycle.dispose();
});

it.each([
  'Unauthorized',
  'Forbidden',
  'JWT expired',
  'AUTH_REQUIRED',
  'Unauthorized: You do not have permissions to read from this Channel topic: synthetic-topic',
])('blocks access denial %s without retry or raw output', async (message) => {
  const test = setup();
  await tick();
  test.callbacks[0]?.('CHANNEL_ERROR', new Error(message));
  await tick(10_000);
  test.lifecycle.reconnect();
  await tick();
  expect(test.channels).toHaveLength(1);
  expect(test.onChange).toHaveBeenLastCalledWith({
    status: 'disconnected',
    reconnecting: false,
    blocked: true,
  });
  expect(JSON.stringify(test.onChange.mock.calls)).not.toContain(message);
  test.lifecycle.dispose();
});

it('keeps unknown CHANNEL_ERROR retryable without invoking an error getter', async () => {
  const test = setup();
  await tick();
  const getter = vi.fn(() => 'Unauthorized');
  const error = new Error();
  Object.defineProperty(error, 'message', { get: getter });
  test.callbacks[0]?.('CHANNEL_ERROR', error);
  await tick(500);
  expect(getter).not.toHaveBeenCalled();
  expect(test.channels).toHaveLength(2);
  test.lifecycle.dispose();
});

it('does not treat an Unauthorized substring as an access denial', async () => {
  const test = setup();
  await tick();
  test.callbacks[0]?.(
    'CHANNEL_ERROR',
    new Error('connection dropped before Unauthorized response'),
  );
  await tick(500);
  expect(test.channels).toHaveLength(2);
  test.lifecycle.dispose();
});

it.each(['initial', 'backoff', 'pending-remove'])(
  'disposes safely during %s without successors or live timers',
  async (phase) => {
    const test = setup();
    const pending = deferred<unknown>();
    if (phase !== 'initial') {
      await tick();
      if (phase === 'pending-remove')
        test.remove.mockReturnValueOnce(pending.promise);
      test.callbacks[0]?.('CHANNEL_ERROR');
      if (phase === 'backoff') await tick();
    }
    test.lifecycle.dispose();
    test.lifecycle.dispose();
    pending.resolve('ok');
    await tick(10000);
    expect(test.channels).toHaveLength(phase === 'initial' ? 0 : 1);
    expect(test.remove).toHaveBeenCalledTimes(phase === 'initial' ? 0 : 1);
    expect(vi.getTimerCount()).toBe(0);
  },
);

it('handles rejected disposal without an unhandled rejection', async () => {
  const test = setup();
  await tick();
  test.remove.mockRejectedValueOnce(new Error('synthetic-private-marker'));
  test.lifecycle.dispose();
  await tick();
  expect(test.remove).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it('keeps the manual cycle busy when it joins the exhausted automatic removal', async () => {
  const test = setup(1);
  await tick(1500);
  for (const [index, delay] of [750, 1250].entries()) {
    test.callbacks[index]?.('SUBSCRIBED');
    test.callbacks[index]?.('CHANNEL_ERROR');
    await tick(delay);
  }
  const pending = deferred<unknown>();
  test.remove.mockReturnValueOnce(pending.promise);
  test.callbacks[2]?.('SUBSCRIBED');
  test.callbacks[2]?.('CHANNEL_ERROR');
  test.lifecycle.reconnect();
  test.lifecycle.reconnect();
  expect(test.remove).toHaveBeenCalledTimes(3);
  pending.resolve('ok');
  await tick();
  expect(test.onChange).toHaveBeenLastCalledWith({
    status: 'disconnected',
    reconnecting: true,
    blocked: false,
  });
  test.lifecycle.reconnect();
  await tick(1499);
  expect(test.channels).toHaveLength(3);
  await tick(1);
  expect(test.channels).toHaveLength(4);
  // The replacement exists but its private SUBSCRIBED ACK is still pending.
  test.lifecycle.reconnect();
  test.lifecycle.reconnect();
  await tick(2000);
  expect(test.onChange).toHaveBeenLastCalledWith({
    status: 'disconnected',
    reconnecting: true,
    blocked: false,
  });
  expect(test.channels).toHaveLength(4);
  expect(test.remove).toHaveBeenCalledTimes(3);
  test.callbacks[3]?.('SUBSCRIBED');
  expect(test.onChange).toHaveBeenLastCalledWith({
    status: 'connected',
    reconnecting: false,
    blocked: false,
  });
  test.lifecycle.dispose();
});
