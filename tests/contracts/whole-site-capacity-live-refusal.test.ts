import { afterEach, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../src/types/database';
import {
  createCapacityLiveGate,
  type LiveGateObservation,
} from '../../scripts/concurrency/capacity-live-gate';
const denial = () =>
  new Error(
    'Unauthorized: You do not have permissions to read from this Channel topic: synthetic',
  );
const fixture = () => {
  let callback: (status: string, error?: Error) => void = () => undefined;
  const channel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn((fn: typeof callback) => {
      callback = fn;
    }),
  };
  const remove = vi.fn<() => Promise<string>>(() => Promise.resolve('ok'));
  const rpc = vi.fn(() => Promise.reject(Error('SYNTHETIC_NO_READ')));
  const client = {
    channel: vi.fn(() => channel),
    removeChannel: remove,
    rpc,
  } as unknown as SupabaseClient<Database>;
  const stop = new AbortController(),
    events: LiveGateObservation[] = [];
  const observe = vi.fn((event: LiveGateObservation) => {
    events.push(event);
  });
  const gate = createCapacityLiveGate(client, stop.signal, observe);
  return {
    gate,
    stop,
    events,
    observe,
    remove,
    channel,
    client,
    rpc,
    emit: (status: string, error?: Error) => {
      callback(status, error);
    },
  };
};
afterEach(() => {
  vi.useRealTimers();
});
it.each(['sync', 'microtask'] as const)(
  'actual factory retains explicit denial when its remove emits %s CLOSED',
  async (mode) => {
    const h = fixture();
    h.remove.mockImplementation(async () => {
      if (mode === 'microtask') await Promise.resolve();
      h.emit('CLOSED');
      return 'ok';
    });
    const operation = h.gate.subscribe('synthetic', true);
    h.emit('CHANNEL_ERROR', denial());
    await expect(operation).resolves.toBeUndefined();
    expect(h.remove).toHaveBeenCalledOnce();
    expect(
      h.events.filter((e) => e.stage === 'CHANNEL_STATUS').map((e) => e.status),
    ).toEqual(['CHANNEL_ERROR', 'CLOSED']);
    expect(
      h.events
        .filter((e) => e.stage === 'CHANNEL_STATUS')
        .map((e) => e.explicit),
    ).toEqual([true, true]);
    h.gate.close();
  },
);
it.each([
  'same-stack',
  'microtask',
  'remove-sync',
  'remove-microtask',
  'remove-resolution',
  'observer-reentry',
] as const)(
  'sticky unauthorized SUBSCRIBED rejects after denial at %s',
  async (mode) => {
    const h = fixture();
    if (mode === 'remove-sync')
      h.remove.mockImplementation(() => {
        h.emit('SUBSCRIBED');
        h.emit('CLOSED');
        return Promise.resolve('ok');
      });
    if (mode === 'remove-microtask')
      h.remove.mockImplementation(async () => {
        await Promise.resolve();
        h.emit('SUBSCRIBED');
        return 'ok';
      });
    if (mode === 'remove-resolution')
      h.remove.mockImplementation(() =>
        Promise.resolve('ok').then((value) => {
          h.emit('SUBSCRIBED');
          return value;
        }),
      );
    if (mode === 'observer-reentry')
      h.observe.mockImplementation((event) => {
        h.events.push(event);
        if (event.stage === 'REMOVE_CHANNEL') h.emit('SUBSCRIBED');
      });
    const operation = h.gate.subscribe('synthetic', true);
    const rejected = expect(operation).rejects.toThrow(
      'CAPACITY_EVIDENCE_INVALID',
    );
    h.emit('CHANNEL_ERROR', denial());
    if (mode === 'same-stack') h.emit('SUBSCRIBED');
    if (mode === 'microtask')
      queueMicrotask(() => {
        h.emit('SUBSCRIBED');
      });
    await rejected;
    expect(h.remove).toHaveBeenCalledOnce();
    expect(h.events.some((e) => e.status === 'SUBSCRIBED')).toBe(true);
    h.gate.close();
  },
);
it.each(['CLOSED', 'TIMED_OUT', 'UNKNOWN', 'CHANNEL_ERROR', 'SUBSCRIBED'])(
  'first terminal %s cannot be washed into refusal by later explicit denial',
  async (first) => {
    const h = fixture(),
      operation = h.gate.subscribe('synthetic', true);
    const rejected = expect(operation).rejects.toThrow(
      'CAPACITY_EVIDENCE_INVALID',
    );
    h.emit(
      first,
      first === 'CHANNEL_ERROR' ? Error('SYNTHETIC_UNKNOWN') : undefined,
    );
    h.emit('CHANNEL_ERROR', denial());
    await rejected;
    expect(h.remove).toHaveBeenCalledOnce();
    h.gate.close();
  },
);
it('CLOSED before our removal begins is contradictory even after explicit denial', async () => {
  const h = fixture(),
    operation = h.gate.subscribe('synthetic', true);
  const rejected = expect(operation).rejects.toThrow();
  h.emit('CHANNEL_ERROR', denial());
  h.emit('CLOSED');
  await rejected;
  expect(h.remove).toHaveBeenCalledOnce();
  h.gate.close();
});
it.each(['TIMED_OUT', 'UNKNOWN', 'CHANNEL_ERROR', 'ERROR'])(
  'unknown or contradictory %s during removal remains fail closed',
  async (status) => {
    const h = fixture();
    h.remove.mockImplementation(() => {
      h.emit(status, Error('SYNTHETIC_UNKNOWN'));
      return Promise.resolve('ok');
    });
    const operation = h.gate.subscribe('synthetic', true),
      rejected = expect(operation).rejects.toThrow();
    h.emit('CHANNEL_ERROR', denial());
    await rejected;
    expect(h.remove).toHaveBeenCalledOnce();
    h.gate.close();
  },
);
it('repeated identical explicit denials are idempotent; ordinary removal CLOSED is recorded without replacing evidence', async () => {
  const h = fixture();
  h.remove.mockImplementation(() => {
    h.emit('CLOSED');
    h.emit('CHANNEL_ERROR', denial());
    return Promise.resolve('ok');
  });
  const operation = h.gate.subscribe('synthetic', true);
  h.emit('CHANNEL_ERROR', denial());
  h.emit('CHANNEL_ERROR', denial());
  await expect(operation).resolves.toBeUndefined();
  expect(h.remove).toHaveBeenCalledOnce();
  expect(
    h.events
      .filter((e) => e.stage === 'CHANNEL_STATUS')
      .every((e) => e.explicit),
  ).toBe(true);
  h.gate.close();
});
it.each(['error', 'timed out', 'unknown'])(
  'bad removal %s cannot authorize refusal',
  async (value) => {
    const h = fixture();
    h.remove.mockResolvedValue(value);
    const operation = h.gate.subscribe('synthetic', true),
      rejected = expect(operation).rejects.toThrow();
    h.emit('CHANNEL_ERROR', denial());
    await rejected;
    expect(h.remove).toHaveBeenCalledOnce();
    h.gate.close();
  },
);
it('removal rejection preserves original exception identity and still runs only once', async () => {
  const h = fixture(),
    sentinel = Error('SYNTHETIC_REMOVE');
  h.remove.mockRejectedValue(sentinel);
  const operation = h.gate.subscribe('synthetic', true),
    rejected = expect(operation).rejects.toBe(sentinel);
  h.emit('CHANNEL_ERROR', denial());
  await rejected;
  expect(h.remove).toHaveBeenCalledOnce();
  h.gate.close();
});
it.each(['root-abort', 'gate-close'] as const)(
  '%s during removal cannot finish as accepted denial',
  async (mode) => {
    const h = fixture();
    h.remove.mockImplementation(() => {
      if (mode === 'root-abort') h.stop.abort();
      else h.gate.close();
      return Promise.resolve('ok');
    });
    const operation = h.gate.subscribe('synthetic', true),
      rejected = expect(operation).rejects.toThrow();
    h.emit('CHANNEL_ERROR', denial());
    await rejected;
    expect(h.remove).toHaveBeenCalledOnce();
    h.gate.close();
  },
);
it.each(['pending-ack', 'pending-remove'] as const)(
  'the original20s bound applies to %s with no grace or retry',
  async (mode) => {
    vi.useFakeTimers();
    const h = fixture();
    let finish: () => void = () => undefined;
    h.remove.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => {
            resolve('ok');
          };
        }),
    );
    const operation = h.gate.subscribe('synthetic', true),
      rejected = expect(operation).rejects.toThrow();
    if (mode === 'pending-remove') {
      h.emit('CHANNEL_ERROR', denial());
      await Promise.resolve();
    }
    await vi.advanceTimersByTimeAsync(20000);
    await rejected;
    expect(h.events.filter((e) => e.stage === 'GATE_TIMEOUT')).toHaveLength(1);
    finish();
    await Promise.resolve();
    await Promise.resolve();
    expect(h.remove).toHaveBeenCalledOnce();
    h.gate.close();
    expect(vi.getTimerCount()).toBe(0);
  },
);
it.each(['CLOSED', 'TIMED_OUT', 'CHANNEL_ERROR', 'UNKNOWN'])(
  'positive subscription still faults on later %s before another read',
  async (status) => {
    const h = fixture(),
      operation = h.gate.subscribe('synthetic');
    h.emit('SUBSCRIBED');
    await operation;
    h.emit(status, Error('SYNTHETIC_FAILURE'));
    await expect(h.gate.wait('synthetic', () => true)).rejects.toThrow(
      'CAPACITY_EVIDENCE_INVALID',
    );
    expect(h.rpc).not.toHaveBeenCalled();
    expect(h.remove).not.toHaveBeenCalled();
    h.gate.close();
  },
);
it('duplicate positive ACK does not fault or remove the positive subscription', async () => {
  const h = fixture(),
    operation = h.gate.subscribe('synthetic');
  h.emit('SUBSCRIBED');
  await operation;
  h.emit('SUBSCRIBED');
  await expect(h.gate.wait('synthetic', () => true)).rejects.toThrow(
    'SYNTHETIC_NO_READ',
  );
  expect(h.rpc).toHaveBeenCalledOnce();
  expect(h.remove).not.toHaveBeenCalled();
  h.gate.close();
});
it('completed removal is a closed scope; arbitrary later SDK callbacks cannot rewrite saved evidence', async () => {
  const h = fixture(),
    operation = h.gate.subscribe('synthetic', true);
  h.emit('CHANNEL_ERROR', denial());
  await operation;
  const snapshot = h.events.map((e) => ({ ...e }));
  h.emit('SUBSCRIBED');
  h.emit('CLOSED');
  h.emit('CHANNEL_ERROR', denial());
  expect(h.events).toEqual(snapshot);
  expect(h.remove).toHaveBeenCalledOnce();
  h.gate.close();
});
it('diagnostic callback throwing cannot change authorization or cleanup decisions', async () => {
  const h = fixture();
  h.observe.mockImplementation(() => {
    throw Error('SYNTHETIC_OBSERVER');
  });
  h.remove.mockImplementation(() => {
    h.emit('CLOSED');
    return Promise.resolve('ok');
  });
  const operation = h.gate.subscribe('synthetic', true);
  h.emit('CHANNEL_ERROR', denial());
  await expect(operation).resolves.toBeUndefined();
  expect(h.remove).toHaveBeenCalledOnce();
  h.gate.close();
});
it.each(['plain-object', 'getter', 'proxy', 'inherited', 'unknown'] as const)(
  'permission classification stays strict for %s without reading arbitrary error text',
  async (mode) => {
    let calls = 0;
    let error: unknown = Error('SYNTHETIC_UNKNOWN');
    if (mode === 'plain-object') error = { message: 'Unauthorized' };
    if (mode === 'getter')
      error = Object.defineProperty(Error(), 'message', {
        get() {
          calls++;
          return 'Unauthorized';
        },
      });
    if (mode === 'proxy')
      error = new Proxy(Error(), {
        getOwnPropertyDescriptor() {
          calls++;
          throw Error('SYNTHETIC_PROXY');
        },
      });
    if (mode === 'inherited') {
      const proto: object = Object.create(Error.prototype) as object;
      Object.defineProperty(proto, 'message', {
        get() {
          calls++;
          return 'Unauthorized';
        },
      });
      error = Object.create(proto) as object;
    }
    const h = fixture(),
      operation = h.gate.subscribe('synthetic', true),
      rejected = expect(operation).rejects.toThrow();
    h.emit('CHANNEL_ERROR', error as Error);
    await rejected;
    expect(calls).toBe(mode === 'proxy' ? 1 : 0);
    expect(h.remove).toHaveBeenCalledOnce();
    h.gate.close();
  },
);
it('an already aborted gate creates no channel or removal', async () => {
  const h = fixture();
  h.stop.abort();
  await expect(h.gate.subscribe('synthetic', true)).rejects.toThrow();
  expect(h.channel.subscribe).not.toHaveBeenCalled();
  expect(h.remove).not.toHaveBeenCalled();
  h.gate.close();
});
it('root abort before ACK rejects, removes exactly once, and cannot be revived by later denial', async () => {
  const h = fixture(),
    operation = h.gate.subscribe('synthetic', true),
    rejected = expect(operation).rejects.toThrow();
  h.stop.abort();
  h.emit('CHANNEL_ERROR', denial());
  await rejected;
  expect(h.remove).toHaveBeenCalledOnce();
  h.gate.close();
});
