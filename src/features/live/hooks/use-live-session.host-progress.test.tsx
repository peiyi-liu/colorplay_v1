import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Database } from '../../../types/database';
import type { LiveRepository, LiveSessionState } from '../types';
import { useLiveSession } from './use-live-session';
const session = '11000000-0000-4000-8000-000000000001';
const state: LiveSessionState = {
  sessionId: session,
  state: 'lobby',
  stateVersion: 2,
  currentPosition: 0,
  questionCount: 20,
  participantCount: 1,
  rulesVersion: 'synthetic',
  questionDisplay: 'screen_only',
  serverTime: '2026-11-19T00:00:00Z',
  isHost: true,
};
const clients: QueryClient[] = [];
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0);
});
afterEach(() => {
  cleanup();
  for (const c of clients.splice(0)) c.clear();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const flush = async () => {
  await act(() => vi.advanceTimersByTimeAsync(0));
};
const setup = () => {
  let currentSession = session;
  type Callback = (status: string, error?: Error) => void;
  const channels = new Map<
    string,
    { status: Callback; broadcast: (message: { payload: unknown }) => void }
  >();
  const client = {
    channel: vi.fn((topic: string) => {
      const callbacks = {
        status: () => undefined,
        broadcast: () => undefined,
      } as {
        status: Callback;
        broadcast: (message: { payload: unknown }) => void;
      };
      channels.set(topic, callbacks);
      const channel = {
        on: (
          _kind: string,
          _filter: unknown,
          fn: typeof callbacks.broadcast,
        ) => {
          callbacks.broadcast = fn;
          return channel;
        },
        subscribe: (fn: Callback) => {
          callbacks.status = fn;
          return channel;
        },
      };
      return channel;
    }),
    removeChannel: vi.fn(() => Promise.resolve('ok')),
  };
  let resolve!: (value: LiveSessionState) => void;
  const initial = new Promise<LiveSessionState>((done) => {
    resolve = done;
  });
  const getState = vi
    .fn()
    .mockReturnValueOnce(initial)
    .mockResolvedValue(state);
  const cache = new QueryClient();
  clients.push(cache);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={cache}>{children}</QueryClientProvider>
  );
  const hook = renderHook(
    () =>
      useLiveSession(currentSession, {
        client: client as unknown as SupabaseClient<Database>,
        repository: { getState } as unknown as LiveRepository,
      }),
    { wrapper },
  );
  return {
    ...hook,
    client,
    channels,
    getState,
    resolve,
    switchSession: (next: string) => {
      currentSession = next;
      hook.rerender();
    },
  };
};
it('adds the owning Host progress topic after authoritative role without rebuilding shared, and requires both ACKs', async () => {
  const x = setup();
  await flush();
  const shared = 'live-session:' + session,
    progress = 'live-host-progress:' + session;
  expect(x.channels.has(shared)).toBe(true);
  act(() => x.channels.get(shared)?.status('SUBSCRIBED'));
  x.resolve(state);
  await flush();
  expect(
    x.client.channel.mock.calls.filter(([topic]) => topic === shared),
  ).toHaveLength(1);
  expect(x.channels.has(progress)).toBe(true);
  expect(x.result.current.connectionStatus).toBe('connecting');
  act(() => x.channels.get(progress)?.status('SUBSCRIBED'));
  await flush();
  expect(x.result.current.connectionStatus).toBe('connected');
});

it('cross-topic newer/older notifications share the actual coordinator and cannot overwrite newer cache', async () => {
  const x = setup();
  await flush();
  x.resolve(state);
  await flush();
  act(() => {
    x.channels.get('live-session:' + session)?.status('SUBSCRIBED');
    x.channels.get('live-host-progress:' + session)?.status('SUBSCRIBED');
  });
  await flush();
  const before = x.getState.mock.calls.length;
  let finish!: (value: LiveSessionState) => void;
  x.getState.mockResolvedValue({ ...state, stateVersion: 4 });
  x.getState.mockImplementationOnce(
    () =>
      new Promise<LiveSessionState>((resolve) => {
        finish = resolve;
      }),
  );
  act(() => {
    x.channels.get('live-host-progress:' + session)?.broadcast({
      payload: {
        session_id: session,
        state: 'question_open',
        state_version: 3,
        answered_count: 1,
      },
    });
    x.channels.get('live-session:' + session)?.broadcast({
      payload: { state_version: 4, state: 'question_feedback' },
    });
    x.channels.get('live-host-progress:' + session)?.broadcast({
      payload: {
        session_id: session,
        state: 'question_open',
        state_version: 1,
        answered_count: 1,
      },
    });
  });
  await flush();
  expect(x.getState).toHaveBeenCalledTimes(before + 1);
  finish({ ...state, stateVersion: 4 });
  await act(() => vi.advanceTimersByTimeAsync(1));
  expect(x.result.current.data?.stateVersion).toBe(4);
  expect(x.getState).toHaveBeenCalledTimes(before + 2);
});

it('fences both old session callbacks, owns both removals, and requires the fresh session ACK pair', async () => {
  const x = setup();
  await flush();
  x.resolve(state);
  await act(() => vi.advanceTimersByTimeAsync(1));
  const old = [
    x.channels.get('live-session:' + session),
    x.channels.get('live-host-progress:' + session),
  ];
  act(() => {
    old.forEach((channel) => {
      channel?.status('SUBSCRIBED');
    });
  });
  await flush();
  const next = '11000000-0000-4000-8000-000000000002';
  x.getState.mockResolvedValue({ ...state, sessionId: next });
  act(() => {
    x.switchSession(next);
  });
  await act(() => vi.advanceTimersByTimeAsync(1));
  expect(x.client.removeChannel).toHaveBeenCalledTimes(2);
  const before = x.getState.mock.calls.length;
  act(() => {
    old[0]?.broadcast({ payload: { state_version: 99 } });
    old[1]?.status('SUBSCRIBED');
  });
  await flush();
  expect(x.getState).toHaveBeenCalledTimes(before);
  expect(x.result.current.connectionStatus).toBe('connecting');
  act(() => x.channels.get('live-session:' + next)?.status('SUBSCRIBED'));
  expect(x.result.current.connectionStatus).toBe('connecting');
  act(() => x.channels.get('live-host-progress:' + next)?.status('SUBSCRIBED'));
  await flush();
  expect(x.result.current.connectionStatus).toBe('connected');
});
