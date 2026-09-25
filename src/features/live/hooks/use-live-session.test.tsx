import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

const stubChannel = (subscribeImmediately = true) => {
  const handlers: BroadcastHandler[] = [];
  let subscriptionHandler: ((status: string) => void) | undefined;
  const channel = {
    on: vi.fn((_type: string, _filter: unknown, handler: BroadcastHandler) => {
      handlers.push(handler);
      return channel;
    }),
    subscribe: vi.fn((callback?: (status: string) => void) => {
      subscriptionHandler = callback;
      if (subscribeImmediately) callback?.('SUBSCRIBED');
      return channel;
    }),
  };
  return {
    channel,
    handlers,
    notifySubscription: (status: string) => subscriptionHandler?.(status),
  };
};

beforeEach(() => {
  vi.spyOn(Math, 'random').mockReturnValue(0);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useLiveSession', () => {
  it('spreads the initial Realtime subscription across a bounded jitter window', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(1);
    const { channel } = stubChannel();
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

    renderHook(() => useLiveSession(SESSION_ID, { client, repository }), {
      wrapper,
    });

    expect(channel.subscribe).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1_499));
    expect(channel.subscribe).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(channel.subscribe).toHaveBeenCalledTimes(1);
  });

  it('makes at most two bounded reconnect attempts after transient subscription failures', async () => {
    vi.useFakeTimers();
    const channels = [
      stubChannel(false),
      stubChannel(false),
      stubChannel(false),
      stubChannel(false),
    ];
    let channelIndex = 0;
    const channelSpy = vi.fn(() => channels[channelIndex++]?.channel);
    const removeChannelSpy = vi.fn().mockResolvedValue('ok');
    const client = {
      channel: channelSpy,
      removeChannel: removeChannelSpy,
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

    renderHook(() => useLiveSession(SESSION_ID, { client, repository }), {
      wrapper,
    });
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(channels[0]?.channel.subscribe).toHaveBeenCalledTimes(1);

    act(() => channels[0]?.notifySubscription('TIMED_OUT'));
    await act(() => vi.advanceTimersByTimeAsync(499));
    expect(channelSpy).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(channels[1]?.channel.subscribe).toHaveBeenCalledTimes(1);

    act(() => channels[1]?.notifySubscription('CHANNEL_ERROR'));
    await act(() => vi.advanceTimersByTimeAsync(999));
    expect(channelSpy).toHaveBeenCalledTimes(2);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(channels[2]?.channel.subscribe).toHaveBeenCalledTimes(1);

    act(() => channels[2]?.notifySubscription('CLOSED'));
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(channelSpy).toHaveBeenCalledTimes(3);
    expect(channels[3]?.channel.subscribe).not.toHaveBeenCalled();
    expect(removeChannelSpy).toHaveBeenCalledWith(channels[2]?.channel);
  });

  it('spends at most two reconnect attempts across the hook lifetime', async () => {
    vi.useFakeTimers();
    const channels = [
      stubChannel(false),
      stubChannel(false),
      stubChannel(false),
      stubChannel(false),
    ];
    let channelIndex = 0;
    const channelSpy = vi.fn(() => channels[channelIndex++]?.channel);
    const removeChannelSpy = vi.fn().mockResolvedValue('ok');
    const client = {
      channel: channelSpy,
      removeChannel: removeChannelSpy,
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

    renderHook(() => useLiveSession(SESSION_ID, { client, repository }), {
      wrapper,
    });
    await act(() => vi.advanceTimersByTimeAsync(0));

    act(() => channels[0]?.notifySubscription('TIMED_OUT'));
    await act(() => vi.advanceTimersByTimeAsync(500));
    act(() => channels[1]?.notifySubscription('SUBSCRIBED'));
    act(() => channels[1]?.notifySubscription('CHANNEL_ERROR'));
    await act(() => vi.advanceTimersByTimeAsync(1_000));
    act(() => channels[2]?.notifySubscription('SUBSCRIBED'));
    act(() => channels[2]?.notifySubscription('CLOSED'));
    await act(() => vi.advanceTimersByTimeAsync(10_000));

    expect(channelSpy).toHaveBeenCalledTimes(3);
    expect(channels[3]?.channel.subscribe).not.toHaveBeenCalled();
    expect(removeChannelSpy).toHaveBeenCalledWith(channels[2]?.channel);
  });

  it('reconciles authoritative state after a reconnect succeeds', async () => {
    vi.useFakeTimers();
    const channels = [stubChannel(false), stubChannel(false)];
    let channelIndex = 0;
    const client = {
      channel: vi.fn(() => channels[channelIndex++]?.channel),
      removeChannel: vi.fn().mockResolvedValue('ok'),
    } as unknown as SupabaseClient<Database>;
    const getState = vi.fn().mockResolvedValue(lobbyState);
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

    await act(() => vi.advanceTimersByTimeAsync(0));
    act(() => channels[0]?.notifySubscription('TIMED_OUT'));
    await act(() => vi.advanceTimersByTimeAsync(500));
    const callsBeforeReconnect = getState.mock.calls.length;
    act(() => channels[1]?.notifySubscription('SUBSCRIBED'));
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(result.current.connectionStatus).toBe('connected');
    expect(getState.mock.calls.length).toBeGreaterThan(callsBeforeReconnect);
  });

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
      removeChannel: vi.fn().mockResolvedValue('ok'),
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
    await waitFor(() => {
      expect(getState).toHaveBeenCalledTimes(2);
    });
    const callsBeforeJoin = getState.mock.calls.length;

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
    expect(getState).toHaveBeenCalledTimes(callsBeforeJoin + 1);
  });
});
