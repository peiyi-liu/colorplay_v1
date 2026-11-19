import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { Database } from '../../../types/database';
import {
  LiveRepositoryError,
  type LiveRepository,
  type LiveSessionState,
} from '../types';
import { liveKeys, useLiveSession } from './use-live-session';

const session = 'synthetic-session';
const lobby: LiveSessionState = {
  sessionId: session,
  state: 'lobby',
  stateVersion: 2,
  currentPosition: 0,
  questionCount: 3,
  participantCount: 1,
  rulesVersion: 'synthetic',
  questionDisplay: 'device',
  serverTime: '2026-11-14T00:00:00Z',
  isHost: true,
};
const clients: QueryClient[] = [];
const deferred = () => {
  let resolve: (value: LiveSessionState) => void = () => {
    throw new Error('READ_NOT_READY');
  };
  let reject: (error: unknown) => void = () => {
    throw new Error('READ_NOT_READY');
  };
  const promise = new Promise<LiveSessionState>((done, failed) => {
    resolve = done;
    reject = failed;
  });
  return {
    promise,
    resolve: (value: LiveSessionState) => {
      resolve(value);
    },
    reject: (error: unknown) => {
      reject(error);
    },
  };
};
const flush = async (ms = 0) => {
  await act(() => vi.advanceTimersByTimeAsync(ms));
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0);
});
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const mount = (shared?: {
  queryClient: QueryClient;
  repository: LiveRepository;
}) => {
  let broadcast: ((message: { payload: unknown }) => void) | undefined;
  let status: ((value: string) => void) | undefined;
  const channel = {
    on: (
      _type: string,
      _filter: unknown,
      callback: (message: { payload: unknown }) => void,
    ) => {
      broadcast = callback;
      return channel;
    },
    subscribe: (callback: (value: string) => void) => {
      status = callback;
      return channel;
    },
  };
  const client = {
    channel: () => channel,
    removeChannel: () => Promise.resolve('ok'),
  } as unknown as SupabaseClient<Database>;
  const reads: ReturnType<typeof deferred>[] = [];
  let active = 0;
  let maxActive = 0;
  const getState = vi.fn(() => {
    const read = deferred();
    reads.push(read);
    active += 1;
    maxActive = Math.max(maxActive, active);
    return read.promise.finally(() => {
      active -= 1;
    });
  });
  const repository =
    shared?.repository ?? ({ getState } as unknown as LiveRepository);
  const queryClient =
    shared?.queryClient ??
    new QueryClient({
      defaultOptions: { queries: { retryDelay: 0 } },
    });
  if (!clients.includes(queryClient)) clients.push(queryClient);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const hook = renderHook(
    () => useLiveSession(session, { client, repository }),
    { wrapper },
  );
  return {
    ...hook,
    queryClient,
    repository,
    getState,
    reads,
    maxActive: () => maxActive,
    broadcast: (payload: unknown) => {
      act(() => broadcast?.({ payload }));
    },
    status: (value: string) => {
      act(() => status?.(value));
    },
  };
};
const ready = async (probe: ReturnType<typeof mount>) => {
  await flush();
  probe.reads[0]?.resolve(lobby);
  await flush();
  probe.status('SUBSCRIBED');
  await flush();
  probe.reads[1]?.resolve(lobby);
  await flush();
};

it('coalesces 39 same-version roster notifications into one actual fetch after the fixed 200ms window', async () => {
  const probe = mount();
  await ready(probe);
  const before = probe.getState.mock.calls.length;
  for (let index = 0; index < 39; index += 1)
    probe.broadcast({
      state_version: 2,
      joined_display_name: 'synthetic',
      participant_count: index + 2,
    });
  expect(probe.getState).toHaveBeenCalledTimes(before);
  await flush(199);
  expect(probe.getState).toHaveBeenCalledTimes(before);
  await flush(1);
  expect(probe.getState).toHaveBeenCalledTimes(before + 1);
  expect(probe.maxActive()).toBe(1);
  probe.reads.at(-1)?.resolve({ ...lobby, participantCount: 40 });
  await flush();
  expect(
    probe.queryClient.getQueryData(liveKeys.session(session)),
  ).toMatchObject({ participantCount: 40 });
});

it('waits for the actual initial fetch then obtains a fresh response rather than merely joining it', async () => {
  const probe = mount();
  await flush();
  probe.status('SUBSCRIBED');
  await flush(200);
  expect(probe.getState).toHaveBeenCalledOnce();
  probe.reads[0]?.resolve(lobby);
  await flush();
  expect(probe.getState).toHaveBeenCalledTimes(2);
  expect(probe.maxActive()).toBe(1);
  probe.reads[1]?.resolve({ ...lobby, stateVersion: 3 });
  await flush();
  expect(probe.result.current.data?.stateVersion).toBe(3);
});

it('waits for an external in-flight fetch without canceling or restarting the underlying read', async () => {
  const probe = mount();
  await ready(probe);
  const external = probe.queryClient.refetchQueries(
    { queryKey: liveKeys.session(session), exact: true },
    { cancelRefetch: false },
  );
  probe.broadcast({ state_version: 3 });
  await flush(1000);
  expect(probe.getState).toHaveBeenCalledTimes(3);
  probe.reads[2]?.resolve(lobby);
  await external;
  await flush();
  expect(probe.getState).toHaveBeenCalledTimes(4);
  expect(probe.maxActive()).toBe(1);
  probe.reads[3]?.resolve({ ...lobby, stateVersion: 3 });
  await flush();
  expect(probe.result.current.data?.stateVersion).toBe(3);
});

it('does not mistake an externally canceled query promise for a completed physical read', async () => {
  const probe = mount();
  await ready(probe);
  probe.broadcast({ state_version: 3 });
  const external = probe.queryClient.invalidateQueries({
    queryKey: liveKeys.session(session),
    exact: true,
  });
  probe.broadcast({ state_version: 4 });
  await flush();
  expect(probe.getState).toHaveBeenCalledTimes(3);
  expect(probe.maxActive()).toBe(1);
  probe.reads[2]?.resolve({ ...lobby, stateVersion: 3 });
  await flush();
  expect(probe.getState).toHaveBeenCalledTimes(4);
  probe.reads[3]?.resolve({ ...lobby, stateVersion: 4 });
  await external;
  await flush();
  expect(probe.getState).toHaveBeenCalledTimes(5);
  probe.reads[4]?.resolve({ ...lobby, stateVersion: 5 });
  await flush();
  expect(probe.result.current.data?.stateVersion).toBe(5);
  expect(probe.maxActive()).toBe(1);
});

it('shares physical read tracking across observers and coalesces a cancel/refetch burst', async () => {
  const first = mount();
  await ready(first);
  const second = mount(first);
  await flush();
  expect(first.getState).toHaveBeenCalledTimes(3);
  const external = Array.from({ length: 39 }, () =>
    first.queryClient.invalidateQueries({
      queryKey: liveKeys.session(session),
      exact: true,
    }),
  );
  await flush();
  expect(first.getState).toHaveBeenCalledTimes(3);
  first.reads[2]?.resolve({ ...lobby, stateVersion: 3 });
  await flush();
  expect(first.getState).toHaveBeenCalledTimes(4);
  first.reads[3]?.resolve({ ...lobby, stateVersion: 4 });
  await Promise.all(external);
  await flush();
  expect(first.getState).toHaveBeenCalledTimes(4);
  expect(first.maxActive()).toBe(1);
  expect(first.result.current.data?.stateVersion).toBe(4);
  expect(second.result.current.data?.stateVersion).toBe(4);
});

it.each([
  ['AUTH_REQUIRED', 1],
  ['UNAVAILABLE', 3],
] as const)(
  'preserves %s error/retry policy after external cancellation',
  async (code, attempts) => {
    const probe = mount();
    await ready(probe);
    probe.broadcast({ state_version: 3 });
    const external = probe.queryClient.invalidateQueries({
      queryKey: liveKeys.session(session),
      exact: true,
    });
    await flush();
    expect(probe.getState).toHaveBeenCalledTimes(3);
    probe.reads[2]?.resolve(lobby);
    await flush();
    for (let index = 0; index < attempts; index += 1) {
      probe.reads[3 + index]?.reject(new LiveRepositoryError(code));
      await flush(1);
    }
    await external;
    await flush(1000);
    expect(probe.getState).toHaveBeenCalledTimes(3 + attempts);
    expect(probe.result.current.error?.code).toBe(code);
    expect(probe.maxActive()).toBe(1);
  },
);

it('retains one trailing authoritative update while the real response is pending', async () => {
  const probe = mount();
  await ready(probe);
  probe.broadcast({ state_version: 3 });
  expect(probe.getState).toHaveBeenCalledTimes(3);
  for (let index = 0; index < 39; index += 1)
    probe.broadcast({ state_version: 2, joined_display_name: 'synthetic' });
  await flush(200);
  probe.broadcast({ state_version: 4 });
  expect(probe.getState).toHaveBeenCalledTimes(3);
  probe.reads[2]?.resolve({ ...lobby, stateVersion: 3 });
  await flush();
  expect(probe.getState).toHaveBeenCalledTimes(4);
  expect(probe.maxActive()).toBe(1);
  probe.reads[3]?.resolve({ ...lobby, stateVersion: 4 });
  await flush(1000);
  expect(probe.getState).toHaveBeenCalledTimes(4);
  expect(probe.result.current.data?.stateVersion).toBe(4);
});

it('promotes new versions immediately, ignores older versions and does not leave a roster timer behind', async () => {
  const probe = mount();
  await ready(probe);
  probe.broadcast({ state_version: 2, joined_display_name: 'synthetic' });
  await flush(50);
  probe.broadcast({ state_version: 3 });
  expect(probe.getState).toHaveBeenCalledTimes(3);
  probe.broadcast({ state_version: 1, joined_display_name: 'stale' });
  probe.reads[2]?.resolve({ ...lobby, stateVersion: 3 });
  await flush(1000);
  expect(probe.getState).toHaveBeenCalledTimes(3);
  expect(probe.result.current.data?.stateVersion).toBe(3);
});

it('requests an immediate real refetch when a subscription recovers', async () => {
  const probe = mount();
  await ready(probe);
  probe.status('CHANNEL_ERROR');
  await flush(500);
  probe.status('SUBSCRIBED');
  expect(probe.getState).toHaveBeenCalledTimes(3);
  probe.reads[2]?.resolve({ ...lobby, stateVersion: 3 });
  await flush();
  expect(probe.result.current.connectionStatus).toBe('connected');
  expect(probe.result.current.data?.stateVersion).toBe(3);
});

it('does not fetch after disposal even when an initial shared read completes later', async () => {
  const probe = mount();
  await flush();
  probe.status('SUBSCRIBED');
  probe.unmount();
  probe.reads[0]?.resolve(lobby);
  await flush(1000);
  expect(probe.getState).toHaveBeenCalledOnce();
  expect(probe.queryClient.getQueryData(liveKeys.session(session))).toEqual(
    lobby,
  );
});

it('disposes queued roster work and ignores late broadcasts', async () => {
  const probe = mount();
  await ready(probe);
  probe.broadcast({ state_version: 2, joined_display_name: 'synthetic' });
  probe.unmount();
  probe.broadcast({ state_version: 3 });
  await flush(1000);
  expect(probe.getState).toHaveBeenCalledTimes(2);
});

it('preserves query errors, without retrying auth failures, and can reconcile a later event', async () => {
  const probe = mount();
  await ready(probe);
  probe.broadcast({ state_version: 3 });
  probe.reads[2]?.reject(new LiveRepositoryError('AUTH_REQUIRED'));
  await flush(1000);
  expect(probe.getState).toHaveBeenCalledTimes(3);
  expect(probe.result.current.error?.code).toBe('AUTH_REQUIRED');
  probe.broadcast({ state_version: 3 });
  probe.reads[3]?.resolve({ ...lobby, stateVersion: 3 });
  await flush();
  expect(probe.result.current.isSuccess).toBe(true);
  expect(probe.result.current.error).toBeNull();
});

it('preserves the original two-UNAVAILABLE-retry budget and exposes the terminal error', async () => {
  const probe = mount();
  await ready(probe);
  probe.broadcast({ state_version: 3 });
  for (let index = 2; index < 5; index += 1) {
    probe.reads[index]?.reject(new LiveRepositoryError('UNAVAILABLE'));
    await flush(1);
  }
  await flush(1000);
  expect(probe.getState).toHaveBeenCalledTimes(5);
  expect(probe.maxActive()).toBe(1);
  expect(probe.result.current.isError).toBe(true);
  expect(probe.result.current.error?.code).toBe('UNAVAILABLE');
});

it('does not add a fresh retry cycle when an initial read fails while reconciliation waits for it', async () => {
  const probe = mount();
  await flush();
  probe.status('SUBSCRIBED');
  probe.reads[0]?.reject(new LiveRepositoryError('AUTH_REQUIRED'));
  await flush(1000);
  expect(probe.getState).toHaveBeenCalledOnce();
  expect(probe.result.current.error?.code).toBe('AUTH_REQUIRED');
});

it('captures the actual v11 callback through physical read and adopted cache without adding reads', async () => {
  const trace = {
    v: 1,
    g: 0,
    o: 0,
    c: Array(32).fill(0),
    l: [] as number[][],
    p: [],
    h: [],
    t: [],
    x: false,
  };
  Object.defineProperty(window, '__colorplayCapacityRealtime', {
    configurable: true,
    value: { liveTrace: trace },
  });
  try {
    const probe = mount();
    await ready(probe);
    probe.broadcast({ state_version: 11 });
    expect(probe.getState).toHaveBeenCalledTimes(3);
    probe.reads[2]?.resolve({ ...lobby, stateVersion: 11 });
    await flush();
    expect(probe.result.current.data?.stateVersion).toBe(11);
    expect(trace.o).toBeGreaterThan(0);
    expect(trace.c[0]).toBe(1);
    for (const index of [5, 6, 9, 16, 17, 20])
      expect(trace.c[index]).toBeGreaterThan(0);
    probe.status('CHANNEL_ERROR');
    expect(trace.l[0]?.[2]).toBe(11);
    expect(trace.l.flat()).toContain(11);
    const cache = probe.queryClient.getQueryCache();
    const query = cache.find({
      queryKey: liveKeys.session(session),
      exact: true,
    });
    if (!query) throw Error('QUERY_NOT_FOUND');
    const queryKey = query.queryKey;
    Object.defineProperty(query, 'queryKey', {
      configurable: true,
      get: () => {
        throw Error('PRIVATE');
      },
    });
    try {
      expect(() => {
        cache.notify({
          type: 'updated',
          query,
          action: { type: 'fetch' },
        });
      }).not.toThrow();
      expect(trace).toHaveProperty('q', '[1,3]');
    } finally {
      Object.defineProperty(query, 'queryKey', {
        configurable: true,
        value: queryKey,
      });
    }
  } finally {
    Reflect.deleteProperty(window, '__colorplayCapacityRealtime');
  }
});

it('records twenty real version waves and ignores unrelated cache updates without changing RPC counts', async () => {
  const trace = { v: 1, c: [] as number[], l: [] as number[][], q: '' };
  Object.defineProperty(window, '__colorplayCapacityRealtime', {
    configurable: true,
    value: { liveTrace: trace },
  });
  try {
    const probe = mount();
    await ready(probe);
    for (let position = 1; position <= 20; position += 1) {
      const version = position + 2;
      probe.broadcast({ state_version: version });
      probe.reads.at(-1)?.resolve({
        ...lobby,
        stateVersion: version,
        currentPosition: position,
      });
      await flush();
      expect(probe.result.current.data?.stateVersion).toBe(version);
    }
    expect(probe.getState).toHaveBeenCalledTimes(22);
    expect(trace.c[0]).toBe(20);
    const before = trace.q;
    probe.queryClient.setQueryData(['foreign', session], {
      stateVersion: 999,
      secret: 'PRIVATE',
    });
    expect(trace.q).toBe(before);
    probe.broadcast({ state_version: 1 });
    probe.broadcast({ state_version: 22, answered_count: 1 });
    probe.broadcast({ state_version: 22, joined_display_name: 'PRIVATE' });
    await flush(200);
    probe.reads.at(-1)?.resolve({ ...lobby, stateVersion: 22 });
    await flush();
    expect(probe.getState).toHaveBeenCalledTimes(23);
    for (const index of [2, 3, 4]) expect(trace.c[index]).toBeGreaterThan(0);
    probe.unmount();
    const closed = trace.q;
    probe.queryClient.setQueryData(liveKeys.session(session), {
      ...lobby,
      stateVersion: 99,
    });
    expect(trace.q).toBe(closed);
    expect(trace.q).not.toContain('PRIVATE');
  } finally {
    Reflect.deleteProperty(window, '__colorplayCapacityRealtime');
  }
});
