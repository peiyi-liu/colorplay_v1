import type { SupabaseClient } from '@supabase/supabase-js';
import {
  useQuery,
  useQueryClient,
  CancelledError,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import type { Database } from '../../../types/database';
import { parsePublicEnv } from '../../../lib/config/public-env';
import { getBrowserSupabaseClient } from '../../../lib/supabase/browser-client';
import { createLiveRepository } from '../api/live-repository';
import { createLiveReconcileScheduler } from '../lib/live-reconcile-scheduler';
import {
  pendingLiveStateReads,
  readLiveState,
} from '../lib/live-state-read-coordinator';
import {
  type LiveRepository,
  LiveRepositoryError,
  type LiveSessionState,
} from '../types';

import {
  createLiveSubscriptionLifecycle,
  type LiveConnectionStatus,
  type LiveSubscriptionState,
} from '../lib/live-subscription-lifecycle';

export type { LiveConnectionStatus } from '../lib/live-subscription-lifecycle';

export const liveKeys = {
  session: (sessionId: string) => ['live', 'session', sessionId] as const,
};

export type LiveSessionQueryResult = UseQueryResult<
  LiveSessionState,
  LiveRepositoryError
> &
  Readonly<{
    connectionStatus: LiveConnectionStatus;
    connectionBlocked: boolean;
    reconnecting: boolean;
    reconnect: () => void;
  }>;

export function useLiveSession(
  sessionId: string,
  dependencies?: Readonly<{
    client?: SupabaseClient<Database>;
    repository?: LiveRepository;
  }>,
): LiveSessionQueryResult {
  const client =
    dependencies?.client ??
    getBrowserSupabaseClient(parsePublicEnv(import.meta.env));
  const repository = dependencies?.repository ?? createLiveRepository(client);
  const queryClient = useQueryClient();
  const lifecycleRef = useRef<ReturnType<
    typeof createLiveSubscriptionLifecycle
  > | null>(null);
  const [connection, setConnection] = useState<
    LiveSubscriptionState & { sessionId: string }
  >({
    sessionId,
    status: 'connecting',
    reconnecting: false,
    blocked: false,
  });
  const currentConnection =
    connection.sessionId === sessionId
      ? connection
      : {
          status: 'connecting' as const,
          reconnecting: false,
          blocked: false,
        };

  const query = useQuery<LiveSessionState, LiveRepositoryError>({
    enabled: sessionId.length > 0,
    queryFn: () =>
      readLiveState(queryClient, sessionId, () =>
        repository.getState(sessionId),
      ),
    queryKey: liveKeys.session(sessionId),
    retry: (failureCount, error) =>
      error.code === 'UNAVAILABLE' && failureCount < 2,
  });

  useEffect(() => {
    if (sessionId.length === 0) return;
    const key = liveKeys.session(sessionId);
    let disposed = false;
    const scheduler = createLiveReconcileScheduler({
      reconcile: async () => {
        const current = queryClient
          .getQueryCache()
          .find({ queryKey: key, exact: true });
        // Joining an initial/in-flight read is not a fresh reconciliation.
        try {
          if (current && current.state.fetchStatus !== 'idle')
            await current.promise;
        } catch (error) {
          if (!(error instanceof CancelledError)) throw error;
        } finally {
          const physical = pendingLiveStateReads(queryClient, sessionId);
          if (physical) await physical;
        }
        if (disposed) return;
        const refetch = queryClient.refetchQueries(
          { queryKey: key, exact: true, type: 'active' },
          { cancelRefetch: false, throwOnError: true },
        );
        // refetchQueries may resolve while paused; await the real read as well.
        try {
          await Promise.all([
            refetch,
            queryClient.getQueryCache().find({ queryKey: key, exact: true })
              ?.promise,
          ]);
        } finally {
          const physical = pendingLiveStateReads(queryClient, sessionId);
          if (physical) await physical;
        }
      },
    });
    const handleBroadcast = (message: { payload: unknown }) => {
      if (disposed) return;
      // Realtime is transport only. Messages below the cached version are
      // echoes we already reconciled; an equal-version message carries live
      // progress within the same state (answered or participant counts) and
      // patches the cache directly; anything newer (or unparseable)
      // triggers one authoritative fetch.
      const payload = message.payload as {
        answered_count?: unknown;
        joined_display_name?: unknown;
        participant_count?: unknown;
        state_version?: unknown;
      };
      const cached = queryClient.getQueryData<LiveSessionState>(key);
      if (typeof payload.state_version === 'number' && cached) {
        if (payload.state_version < cached.stateVersion) return;
        if (payload.state_version === cached.stateVersion) {
          if (typeof payload.joined_display_name === 'string') {
            // A join changes the lobby roster, so take the authoritative
            // fetch instead of a count-only patch.
            scheduler.request('roster');
            return;
          }
          const answeredPatch =
            typeof payload.answered_count === 'number'
              ? { answeredCount: payload.answered_count }
              : {};
          const participantPatch =
            typeof payload.participant_count === 'number'
              ? { participantCount: payload.participant_count }
              : {};
          if (
            Object.keys(answeredPatch).length > 0 ||
            Object.keys(participantPatch).length > 0
          ) {
            queryClient.setQueryData<LiveSessionState>(key, {
              ...cached,
              ...answeredPatch,
              ...participantPatch,
            });
          }
          return;
        }
      }
      scheduler.request('authoritative');
    };
    const lifecycle = createLiveSubscriptionLifecycle({
      createChannel: () =>
        client.channel(`live-session:${sessionId}`, {
          config: { broadcast: { self: true }, private: true },
        }),
      attach: (channel, broadcast, status) => {
        channel
          .on('broadcast', { event: 'live_state' }, broadcast)
          .subscribe(status);
      },
      removeChannel: (channel) => client.removeChannel(channel),
      onChange: (state) => {
        setConnection({ sessionId, ...state });
      },
      onSubscribed: () => {
        scheduler.request('authoritative');
      },
      onBroadcast: handleBroadcast,
    });
    lifecycleRef.current = lifecycle;
    return () => {
      disposed = true;
      scheduler.dispose();
      lifecycle.dispose();
      if (lifecycleRef.current === lifecycle) lifecycleRef.current = null;
    };
  }, [client, queryClient, sessionId]);

  return {
    ...query,
    connectionStatus: currentConnection.status,
    connectionBlocked: currentConnection.blocked,
    reconnecting: currentConnection.reconnecting,
    reconnect: () => lifecycleRef.current?.reconnect(),
  };
}
