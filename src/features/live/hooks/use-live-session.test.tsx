import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { renderHook, waitFor } from '@testing-library/react';
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
  serverTime: '2026-07-17T15:00:00+00:00',
  isHost: false,
};

type BroadcastHandler = (message: { payload: unknown }) => void;

const stubChannel = () => {
  const handlers: BroadcastHandler[] = [];
  const channel = {
    on: vi.fn((_type: string, _filter: unknown, handler: BroadcastHandler) => {
      handlers.push(handler);
      return channel;
    }),
    subscribe: vi.fn((callback?: (status: string) => void) => {
      callback?.('SUBSCRIBED');
      return channel;
    }),
  };
  return { channel, handlers };
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

    const callsBeforeBroadcast = getState.mock.calls.length;
    handlers[0]?.({ payload: { state: 'question_open', state_version: 3 } });
    await waitFor(() => {
      expect(getState.mock.calls.length).toBeGreaterThan(callsBeforeBroadcast);
    });

    unmount();
    expect(removeChannelSpy).toHaveBeenCalledWith(channel);
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
});
