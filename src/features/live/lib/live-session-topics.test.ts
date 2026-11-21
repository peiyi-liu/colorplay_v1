import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createLiveSessionTopics,
  type LiveSessionTopic,
} from './live-session-topics';

const session = '11000000-0000-4000-8000-000000000001';
const setup = () => {
  interface Channel {
    topic: LiveSessionTopic;
    status: (value: string, error?: Error) => void;
    broadcast: (message: { payload: unknown }) => void;
  }
  const channels: Channel[] = [];
  let fault: { stage: 'create' | 'attach'; error: Error } | undefined;
  const remove = vi.fn((channel: Channel): Promise<unknown> => {
    void channel;
    return Promise.resolve('ok');
  });
  const changes = vi.fn(),
    subscribed = vi.fn(),
    broadcast = vi.fn();
  const controller = createLiveSessionTopics({
    sessionId: session,
    random: () => 0,
    createChannel: (topic) => {
      if (topic === 'HOST_PROGRESS' && fault?.stage === 'create')
        throw fault.error;
      const channel: Channel = {
        topic,
        status: () => undefined,
        broadcast: () => undefined,
      };
      channels.push(channel);
      return channel;
    },
    attach: (channel, _topic, onBroadcast, onStatus) => {
      if (channel.topic === 'HOST_PROGRESS' && fault?.stage === 'attach')
        throw fault.error;
      channel.broadcast = onBroadcast;
      channel.status = onStatus;
    },
    removeChannel: remove,
    onChange: changes,
    onSubscribed: subscribed,
    onBroadcast: broadcast,
  });
  return {
    controller,
    channels,
    remove,
    changes,
    subscribed,
    broadcast,
    armFault: (stage: 'create' | 'attach', error: Error) => {
      fault = { stage, error };
    },
  };
};
const flush = (ms = 0) => vi.advanceTimersByTimeAsync(ms);
const payload = (version = 2) => ({
  session_id: session,
  state: 'question_open',
  state_version: version,
  answered_count: 1,
});
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

it('keeps one shared subscription while authority arrives, and joins progress only for Host with both ACKs', async () => {
  const x = setup();
  await flush();
  expect(x.channels.map((c) => c.topic)).toEqual(['SHARED']);
  x.channels[0]?.status('SUBSCRIBED');
  expect(x.subscribed).not.toHaveBeenCalled();
  x.controller.setRole(true);
  expect(x.channels.map((c) => c.topic)).toEqual(['SHARED', 'HOST_PROGRESS']);
  expect(x.changes).not.toHaveBeenLastCalledWith(
    expect.objectContaining({ status: 'connected' }),
  );
  x.channels[1]?.status('SUBSCRIBED');
  x.channels[1]?.status('SUBSCRIBED');
  expect(x.subscribed).toHaveBeenCalledOnce();
  expect(x.changes).toHaveBeenLastCalledWith({
    status: 'connected',
    reconnecting: false,
    blocked: false,
  });
  await x.controller.dispose();
  expect(x.remove).toHaveBeenCalledTimes(2);
});
it('student role owns only shared and preserves roster, phase, and original message identity', async () => {
  const x = setup();
  x.controller.setRole(false);
  await flush();
  x.channels[0]?.status('SUBSCRIBED');
  const message = { payload: { state_version: 4, participant_count: 60 } };
  x.channels[0]?.broadcast(message);
  expect(x.broadcast).toHaveBeenCalledWith(message);
  expect(x.channels).toHaveLength(1);
  expect(x.subscribed).toHaveBeenCalledOnce();
  await x.controller.dispose();
});
it('forwards twenty questions and crossed versions to one original scheduler without transforming them', async () => {
  const x = setup();
  x.controller.setRole(true);
  await flush();
  x.channels.forEach((c) => {
    c.status('SUBSCRIBED');
  });
  const messages = [];
  for (let index = 1; index <= 20; index += 1) {
    const answer = { payload: payload(index) },
      phase = {
        payload: { state_version: index + 1, state: 'question_feedback' },
      };
    messages.push(answer, phase);
    x.channels[1]?.broadcast(answer);
    x.channels[0]?.broadcast(phase);
  }
  const older = { payload: payload(1) };
  x.channels[1]?.broadcast(older);
  expect(x.broadcast.mock.calls.flat()).toEqual([...messages, older]);
  expect(x.subscribed).toHaveBeenCalledOnce();
  await x.controller.dispose();
});
it.each(['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'])(
  'either topic %s fences both and consumes the same two-retry budget',
  async (status) => {
    const x = setup();
    x.controller.setRole(true);
    await flush();
    const retired = x.channels[0];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      x.channels.at(-2)?.status('SUBSCRIBED');
      expect(x.subscribed).not.toHaveBeenCalled();
      x.channels.at(-1)?.status(status);
      await flush(attempt === 0 ? 500 : 1000);
    }
    expect(x.channels).toHaveLength(6);
    expect(x.remove).toHaveBeenCalledTimes(6);
    retired?.status('SUBSCRIBED');
    retired?.broadcast({ payload: payload() });
    expect(x.broadcast).not.toHaveBeenCalled();
    expect(x.changes).toHaveBeenLastCalledWith({
      status: 'disconnected',
      reconnecting: false,
      blocked: false,
    });
    await x.controller.dispose();
  },
);
it('preserves permission error identity into the original blocked/manual-reconnect decision', async () => {
  const x = setup();
  x.controller.setRole(true);
  await flush();
  const denied = new Error('Unauthorized');
  x.channels[1]?.status('CHANNEL_ERROR', denied);
  await flush(5000);
  x.controller.reconnect();
  await flush(5000);
  expect(x.channels).toHaveLength(2);
  expect(x.changes).toHaveBeenLastCalledWith({
    status: 'disconnected',
    reconnecting: false,
    blocked: true,
  });
  await x.controller.dispose();
});
it('downgrade removes progress before readiness, fences its stale callbacks, and never rebuilds shared', async () => {
  const x = setup();
  x.controller.setRole(true);
  await flush();
  x.channels.forEach((c) => {
    c.status('SUBSCRIBED');
  });
  let finish!: (result: string) => void;
  x.remove.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const old = x.channels[1];
  x.controller.setRole(false);
  old?.broadcast({ payload: payload() });
  old?.status('CHANNEL_ERROR');
  expect(x.broadcast).not.toHaveBeenCalled();
  expect(x.channels).toHaveLength(2);
  x.controller.setRole(true);
  expect(x.channels).toHaveLength(2);
  finish('ok');
  await flush();
  expect(x.channels.map((c) => c.topic)).toEqual([
    'SHARED',
    'HOST_PROGRESS',
    'HOST_PROGRESS',
  ]);
  x.channels[2]?.status('SUBSCRIBED');
  expect(x.subscribed).toHaveBeenCalledTimes(2);
  await x.controller.dispose();
});
it('failed downgrade cleanup is fail closed and cannot create a replacement until original manual recovery', async () => {
  const x = setup();
  x.controller.setRole(true);
  await flush();
  x.remove.mockResolvedValue('error');
  x.controller.setRole(false);
  await flush(5000);
  expect(x.channels).toHaveLength(2);
  expect(x.changes).toHaveBeenLastCalledWith(
    expect.objectContaining({ status: 'disconnected', reconnecting: false }),
  );
  x.remove.mockResolvedValue('ok');
  x.controller.reconnect();
  await flush();
  expect(x.channels).toHaveLength(3);
  await x.controller.dispose();
});
it.each([
  { ...payload(), session_id: 'foreign' },
  { ...payload(), state: 'lobby' },
  { ...payload(), state_version: -1 },
  { ...payload(), state_version: 1.5 },
  { ...payload(), answered_count: -1 },
  { ...payload(), extra: true },
])(
  'rejects malformed or foreign progress without forwarding it',
  async (value) => {
    const x = setup();
    x.controller.setRole(true);
    await flush();
    x.channels[1]?.broadcast({ payload: value });
    expect(x.broadcast).not.toHaveBeenCalled();
    await x.controller.dispose();
  },
);
it('does not invoke an inherited or own progress getter and ignores callbacks after dispose', async () => {
  const x = setup();
  x.controller.setRole(true);
  await flush();
  let calls = 0;
  const value = Object.create({
    get state_version() {
      calls += 1;
      return 2;
    },
  }) as unknown;
  x.channels[1]?.broadcast({ payload: value });
  expect(calls).toBe(0);
  expect(x.broadcast).not.toHaveBeenCalled();
  await x.controller.dispose();
  x.channels[0]?.broadcast({ payload: payload() });
  expect(x.broadcast).not.toHaveBeenCalled();
});
it('dispose waits for all owned removals, including an in-flight role removal', async () => {
  const x = setup();
  x.controller.setRole(true);
  await flush();
  let finish!: (result: string) => void;
  x.remove.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  x.controller.setRole(false);
  let closed = false;
  const closing = x.controller.dispose().then(() => {
    closed = true;
  });
  await flush();
  expect(closed).toBe(false);
  finish('ok');
  await closing;
  expect(closed).toBe(true);
  expect(x.remove).toHaveBeenCalledTimes(2);
});

it('failed attachment still belongs to the group and is removed without escaping the original failure boundary', async () => {
  const remove = vi.fn(() => Promise.resolve('ok')),
    changed = vi.fn();
  const x = createLiveSessionTopics({
    sessionId: session,
    random: () => 0,
    createChannel: (topic) => topic,
    attach: () => {
      throw new Error('synthetic');
    },
    removeChannel: remove,
    onChange: changed,
    onSubscribed: vi.fn(),
    onBroadcast: vi.fn(),
  });
  await flush(1500);
  expect(remove).toHaveBeenCalledTimes(3);
  expect(changed).toHaveBeenLastCalledWith({
    status: 'disconnected',
    reconnecting: false,
    blocked: false,
  });
  await x.dispose();
});

it.each(['create', 'attach'] as const)(
  'keeps the original denial boundary for late Host %s throws',
  async (stage) => {
    const x = setup();
    await flush();
    x.channels[0]?.status('SUBSCRIBED');
    x.armFault(stage, new Error('Unauthorized'));
    x.controller.setRole(true);
    await flush(5000);
    expect(x.changes).toHaveBeenLastCalledWith({
      status: 'disconnected',
      reconnecting: false,
      blocked: true,
    });
    const count = x.channels.length;
    x.controller.reconnect();
    await flush(5000);
    expect(x.channels).toHaveLength(count);
    await x.controller.dispose();
  },
);
it.each(['create', 'attach'] as const)(
  'retires the original group when %s throws after in-flight downgrade cleanup',
  async (stage) => {
    const x = setup();
    x.controller.setRole(true);
    await flush();
    x.channels.forEach((c) => {
      c.status('SUBSCRIBED');
    });
    let finish!: (value: string) => void;
    x.remove.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    x.controller.setRole(false);
    x.controller.setRole(true);
    x.armFault(stage, new Error('Unauthorized'));
    finish('ok');
    await flush(5000);
    expect(x.changes).toHaveBeenLastCalledWith({
      status: 'disconnected',
      reconnecting: false,
      blocked: true,
    });
    await x.controller.dispose();
  },
);
it.each(['create', 'attach'] as const)(
  'spends only the original two retries for generic late Host %s throws',
  async (stage) => {
    const x = setup();
    await flush();
    x.armFault(stage, new Error('synthetic transport'));
    x.controller.setRole(true);
    await flush(5000);
    expect(x.changes).toHaveBeenLastCalledWith({
      status: 'disconnected',
      reconnecting: false,
      blocked: false,
    });
    expect(x.channels.filter((c) => c.topic === 'SHARED')).toHaveLength(3);
    await x.controller.dispose();
  },
);

it.each([false, true])(
  'accepts twenty original progress messages with optional generated UUID id=%s',
  async (wire) => {
    const x = setup();
    x.controller.setRole(true);
    await flush();
    x.channels.forEach((c) => {
      c.status('SUBSCRIBED');
    });
    const messages = [];
    for (let question = 1; question <= 20; question += 1) {
      const message = {
        payload: {
          ...payload(question),
          ...(wire ? { id: 'c920f7ad-47df-4a14-9359-d091a7a4309c' } : {}),
        },
      };
      messages.push(message);
      x.channels[1]?.broadcast(message);
    }
    expect(x.broadcast.mock.calls.flat()).toEqual(messages);
    expect(x.changes).toHaveBeenLastCalledWith({
      status: 'connected',
      reconnecting: false,
      blocked: false,
    });
    expect(x.subscribed).toHaveBeenCalledOnce();
    await x.controller.dispose();
  },
);
it.each([
  null,
  undefined,
  123,
  '',
  'not-a-uuid',
  'c920f7ad47df4a149359d091a7a4309c',
  'c920f7ad-47df-4a14-9359-d091a7a4309z',
])(
  'rejects a present malformed transport id %s without discounting the original boundary',
  async (id) => {
    const x = setup();
    x.controller.setRole(true);
    await flush();
    x.channels[1]?.broadcast({ payload: { ...payload(), id } });
    expect(x.broadcast).not.toHaveBeenCalled();
    expect(x.changes).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'disconnected' }),
    );
    await x.controller.dispose();
  },
);
it('rejects unknown wire fields and an id getter without invoking it', async () => {
  const getter = vi.fn(() => 'c920f7ad-47df-4a14-9359-d091a7a4309c');
  for (const value of [
    { ...payload(), id: 'c920f7ad-47df-4a14-9359-d091a7a4309c', other: true },
    Object.defineProperty({ ...payload() }, 'id', {
      enumerable: true,
      get: getter,
    }),
  ]) {
    const x = setup();
    x.controller.setRole(true);
    await flush();
    x.channels[1]?.broadcast({ payload: value });
    expect(x.broadcast).not.toHaveBeenCalled();
    expect(x.changes).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'disconnected' }),
    );
    await x.controller.dispose();
  }
  expect(getter).not.toHaveBeenCalled();
});
