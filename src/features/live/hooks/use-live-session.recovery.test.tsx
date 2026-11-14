import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

import type { Database } from '../../../types/database';
import {
  baseState,
  repositoryWith,
  SESSION_ID,
} from '../pages/live-pages.test-fixtures';
import { useLiveSession } from './use-live-session';

const setup = (removal: () => Promise<unknown>) => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0);
  const callbacks: ((status: string, error?: Error) => void)[] = [];
  const broadcasts: ((message: { payload: unknown }) => void)[] = [];
  const client = {
    channel: vi.fn(() => {
      const channel = {
        on: vi.fn(
          (
            _event: string,
            _filter: unknown,
            callback: (message: { payload: unknown }) => void,
          ) => {
            broadcasts.push(callback);
            return channel;
          },
        ),
        subscribe: vi.fn(
          (callback: (status: string, error?: Error) => void) => {
            callbacks.push(callback);
            return channel;
          },
        ),
      };
      return channel;
    }),
    removeChannel: vi.fn(removal),
  };
  const repository = repositoryWith({
    getState: vi.fn().mockResolvedValue(baseState),
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const hook = renderHook(
    () =>
      useLiveSession(SESSION_ID, {
        client: client as unknown as SupabaseClient<Database>,
        repository,
      }),
    { wrapper },
  );
  return { ...hook, callbacks, broadcasts, client, repository, queryClient };
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it.each(['error', 'timed out'])(
  'does not replace an owned channel after removeChannel resolves %s',
  async (outcome) => {
    const test = setup(() => Promise.resolve(outcome));
    await act(() => vi.advanceTimersByTimeAsync(0));
    act(() => test.callbacks[0]?.('CHANNEL_ERROR'));
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(test.client.channel).toHaveBeenCalledTimes(1);
    test.unmount();
  },
);

it('refreshes authoritative state after transport recovery and ignores retired callbacks without mutations', async () => {
  const test = setup(() => Promise.resolve('ok'));
  await act(() => vi.advanceTimersByTimeAsync(1));
  act(() => test.callbacks[0]?.('SUBSCRIBED'));
  await act(() => vi.advanceTimersByTimeAsync(1));
  const before = vi.mocked(test.repository.getState).mock.calls.length;
  act(() => test.callbacks[0]?.('CHANNEL_ERROR'));
  act(() =>
    test.broadcasts[0]?.({
      payload: {
        state_version: baseState.stateVersion,
        participant_count: 999,
      },
    }),
  );
  expect(test.result.current.data?.participantCount).toBe(
    baseState.participantCount,
  );
  await act(() => vi.advanceTimersByTimeAsync(500));
  const fresh = { ...baseState, participantCount: 4 };
  vi.mocked(test.repository.getState).mockResolvedValue(fresh);
  act(() => test.callbacks[1]?.('SUBSCRIBED'));
  await act(() => vi.advanceTimersByTimeAsync(1));
  expect(test.repository.getState).toHaveBeenCalledTimes(before + 1);
  expect(test.result.current.data).toEqual(fresh);
  expect(test.result.current.connectionStatus).toBe('connected');
  expect(test.result.current.reconnecting).toBe(false);
  act(() => test.callbacks[0]?.('CLOSED'));
  expect(test.result.current.connectionStatus).toBe('connected');
  expect(test.repository.join).not.toHaveBeenCalled();
  expect(test.repository.submitAnswer).not.toHaveBeenCalled();
  expect(test.repository.finalize).not.toHaveBeenCalled();
  test.unmount();
  test.queryClient.clear();
});

it('lets manual recovery retry a failed removal once and awaits it before creating a replacement', async () => {
  const test = setup(() => Promise.resolve('error'));
  await act(() => vi.advanceTimersByTimeAsync(1));
  act(() => test.callbacks[0]?.('CHANNEL_ERROR'));
  await act(() => vi.advanceTimersByTimeAsync(1));
  let finish!: (outcome: string) => void;
  test.client.removeChannel.mockImplementationOnce(
    () =>
      new Promise<string>((done) => {
        finish = done;
      }),
  );
  act(() => {
    test.result.current.reconnect();
    test.result.current.reconnect();
  });
  await act(() => vi.advanceTimersByTimeAsync(5000));
  expect(test.result.current.reconnecting).toBe(true);
  expect(test.client.channel).toHaveBeenCalledTimes(1);
  expect(test.client.removeChannel).toHaveBeenCalledTimes(2);
  await act(async () => {
    finish('ok');
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(test.client.channel).toHaveBeenCalledTimes(2);
  test.unmount();
  test.queryClient.clear();
});
