import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { Database } from '../../../types/database';
import type { LiveRepository, LiveSessionState } from '../types';
import { liveKeys, useLiveSession } from './use-live-session';

const SESSION_ID = '18400000-0000-0000-0000-000000000001';

const lobbyState: LiveSessionState = {
  sessionId: SESSION_ID,
  state: 'lobby',
  stateVersion: 2,
  currentPosition: 0,
  questionCount: 10,
  participantCount: 1,
  rulesVersion: '2026-07-live-1',
  questionDisplay: 'device',
  serverTime: '2026-07-17T15:00:00+00:00',
  isHost: false,
};

type BroadcastHandler = (message: { payload: unknown }) => void;

const stubChannel = () => {
  const handlers: BroadcastHandler[] = [];
  let subscriptionHandler: ((status: string) => void) | undefined;
  const channel = {
    on: vi.fn((_type: string, _filter: unknown, handler: BroadcastHandler) => {
      handlers.push(handler);
      return channel;
    }),
    subscribe: vi.fn((callback?: (status: string) => void) => {
      subscriptionHandler = callback;
      callback?.('SUBSCRIBED');
      return channel;
    }),
  };
  return {
    channel,
    handlers,
    notifySubscription: (status: string) => subscriptionHandler?.(status),
  };
};

describe('useLiveSession', () => {
  it('subscribes to the private topic and reconciles on every broadcast', async () => {
    const { channel, handlers } = stubChannel();
    const channelSpy = vi.fn(() => channel);
    const removeChannelSpy = vi.fn();
    const client = {
      channel: channelSpy,
      removeChannel: removeChannelSpy,
    } as unknown as SupabaseClient<Database>;
    const getState = vi.fn().mockResolvedValue(lobbyState);
    const repository = { getState } as unknown as LiveRepository;
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result, unmount } = renderHook(
      () => useLiveSession(SESSION_ID, { client, repository }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(channelSpy).toHaveBeenCalledWith(`live-session:${SESSION_ID}`, {
      config: { broadcast: { self: true }, private: true },
    });
    expect(queryClient.getQueryData(liveKeys.session(SESSION_ID))).toEqual(
      lobbyState,
    );
    expect(result.current.connectionStatus).toBe('connected');

    const callsBeforeBroadcast = getState.mock.calls.length;
    handlers[0]?.({ payload: { state: 'question_open', state_version: 3 } });
    await waitFor(() => {
      expect(getState.mock.calls.length).toBeGreaterThan(callsBeforeBroadcast);
    });

    unmount();
    expect(removeChannelSpy).toHaveBeenCalledWith(channel);
  });

  it('reports a lost realtime connection without changing server state', async () => {
    const { channel, notifySubscription } = stubChannel();
    const client = {
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
    } as unknown as SupabaseClient<Database>;
    const repository = {
      getState: vi.fn().mockResolvedValue(lobbyState),
    } as unknown as LiveRepository;
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(
      () => useLiveSession(SESSION_ID, { client, repository }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.connectionStatus).toBe('connected');
    });
    act(() => {
      notifySubscription('CHANNEL_ERROR');
    });

    expect(result.current.connectionStatus).toBe('disconnected');
    expect(result.current.data).toEqual(lobbyState);
  });

  it('patches same-version progress counts without refetching', async () => {
    const { channel, handlers } = stubChannel();
    const client = {
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
    } as unknown as SupabaseClient<Database>;
    const getState = vi.fn().mockResolvedValue(lobbyState);
    const repository = { getState } as unknown as LiveRepository;
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result, unmount } = renderHook(
      () => useLiveSession(SESSION_ID, { client, repository }),
      { wrapper },
    );
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const callsBeforePatch = getState.mock.calls.length;
    handlers[0]?.({
      payload: { participant_count: 2, state: 'lobby', state_version: 2 },
    });
    handlers[0]?.({
      payload: { answered_count: 1, state: 'lobby', state_version: 2 },
    });

    expect(
      queryClient.getQueryData<LiveSessionState>(liveKeys.session(SESSION_ID)),
    ).toMatchObject({ answeredCount: 1, participantCount: 2 });
    expect(getState.mock.calls.length).toBe(callsBeforePatch);

    unmount();
  });

  it('refetches the authoritative participant roster on a same-version join event', async () => {
    const { channel, handlers } = stubChannel();
    const client = {
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
    } as unknown as SupabaseClient<Database>;
    const joinedState: LiveSessionState = {
      ...lobbyState,
      participantCount: 2,
      participants: [{ displayName: '小彩' }, { displayName: '新同學' }],
    };
    const getState = vi
      .fn()
      .mockResolvedValueOnce(lobbyState)
      .mockResolvedValue(joinedState);
    const repository = { getState } as unknown as LiveRepository;
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(
      () => useLiveSession(SESSION_ID, { client, repository }),
      { wrapper },
    );
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    handlers[0]?.({
      payload: {
        joined_display_name: '新同學',
        participant_count: 2,
        state_version: 2,
      },
    });

    await waitFor(() => {
      expect(result.current.data?.participants).toEqual([
        { displayName: '小彩' },
        { displayName: '新同學' },
      ]);
    });
    expect(getState).toHaveBeenCalledTimes(2);
  });
});
