import type { SupabaseClient } from '@supabase/supabase-js';
import {
  useQuery,
  useQueryClient,
  CancelledError,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { Database } from '../../../types/database';
import { parsePublicEnv } from '../../../lib/config/public-env';
import { getBrowserSupabaseClient } from '../../../lib/supabase/browser-client';
import { createLiveRepository } from '../api/live-repository';
import {
  createLiveReconcileDiagnostics,
  emitLiveTrace,
} from '../lib/live-reconcile-diagnostics';
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

import { createLiveSessionTopics } from '../lib/live-session-topics';
import {
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
  const trace = useMemo(
    () => createLiveReconcileDiagnostics(),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Restart document trace generation for the exact query owner/key.
    [queryClient, sessionId],
  );
  const lifecycleRef = useRef<ReturnType<
    typeof createLiveSessionTopics
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
    queryFn: () => {
      emitLiveTrace(trace, 'QUERY_REQUEST');
      return readLiveState(
        queryClient,
        sessionId,
        () => repository.getState(sessionId),
        trace,
      );
    },
    queryKey: liveKeys.session(sessionId),
    retry: (failureCount, error) =>
      error.code === 'UNAVAILABLE' && failureCount < 2,
  });

  useEffect(() => {
    if (sessionId.length === 0) return;
    const key = liveKeys.session(sessionId);
    let disposed = false;
    const unobserve = trace
      ? queryClient.getQueryCache().subscribe((event) => {
          try {
            const observedKey: unknown = event.query.queryKey;
            if (
              !Array.isArray(observedKey) ||
              observedKey.length !== key.length ||
              !observedKey.every(
                (part: unknown, index: number) => part === key[index],
              )
            )
              return;
            if (event.type === 'updated')
              emitLiveTrace(
                trace,
                event.action.type === 'success'
                  ? 'CACHE_UPDATE'
                  : 'CACHE_OTHER',
                event.query.state.data,
              );
            else if (event.type === 'removed')
              emitLiveTrace(trace, 'CACHE_REMOVED');
          } catch {
            emitLiveTrace(trace, 'TRACE_UNAVAILABLE');
          }
        })
      : undefined;
    const scheduler = createLiveReconcileScheduler({
      trace,
      reconcile: async () => {
        const current = queryClient
          .getQueryCache()
          .find({ queryKey: key, exact: true });
        // Joining an initial/in-flight read is not a fresh reconciliation.
        try {
          if (current && current.state.fetchStatus !== 'idle') {
            emitLiveTrace(trace, 'WAIT_QUERY');
            await current.promise;
          }
        } catch (error) {
          if (!(error instanceof CancelledError)) throw error;
        } finally {
          const physical = pendingLiveStateReads(queryClient, sessionId);
          if (physical) {
            emitLiveTrace(trace, 'WAIT_PHYSICAL');
            await physical;
          }
        }
        if (disposed) {
          emitLiveTrace(trace, 'RECONCILE_DISPOSED');
          return;
        }
        emitLiveTrace(trace, 'REFETCH');
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
          if (physical) {
            emitLiveTrace(trace, 'WAIT_PHYSICAL');
            await physical;
          }
        }
        emitLiveTrace(trace, 'RECONCILE_RETURN');
      },
    });
    const handleBroadcast = (message: { payload: unknown }) => {
      if (disposed) {
        emitLiveTrace(trace, 'HANDLER_INACTIVE');
        return;
      }
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
        if (payload.state_version < cached.stateVersion) {
          emitLiveTrace(trace, 'HANDLER_OLDER', payload);
          return;
        }
        if (payload.state_version === cached.stateVersion) {
          emitLiveTrace(trace, 'HANDLER_EQUAL', payload);
          if (typeof payload.joined_display_name === 'string') {
            // A join changes the lobby roster, so take the authoritative
            // fetch instead of a count-only patch.
            emitLiveTrace(trace, 'HANDLER_ROSTER', payload);
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
      emitLiveTrace(trace, 'HANDLER_AUTHORITATIVE', payload);
      scheduler.request('authoritative');
    };
    const lifecycle = createLiveSessionTopics({
      sessionId,
      createChannel: (topic) =>
        client.channel(
          `${topic === 'SHARED' ? 'live-session' : 'live-host-progress'}:${sessionId}`,
          {
            config: { broadcast: { self: true }, private: true },
          },
        ),
      attach: (channel, _topic, broadcast, status) => {
        channel
          .on(
            'broadcast',
            { event: 'live_state' },
            (message: { payload: unknown }) => {
              emitLiveTrace(trace, 'SDK_CALLBACK', message);
              broadcast(message);
            },
          )
          .subscribe((value, error) => {
            emitLiveTrace(trace, 'SDK_STATUS');
            status(value, error);
          });
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
      emitLiveTrace(trace, 'GENERATION_CLOSE');
      unobserve?.();
      disposed = true;
      scheduler.dispose();
      void lifecycle.dispose();
      if (lifecycleRef.current === lifecycle) lifecycleRef.current = null;
    };
  }, [client, queryClient, sessionId, trace]);

  useEffect(() => {
    lifecycleRef.current?.setRole(
      !query.isError && query.data?.sessionId === sessionId
        ? query.data.isHost
        : undefined,
    );
  }, [
    client,
    queryClient,
    sessionId,
    trace,
    query.data?.sessionId,
    query.data?.isHost,
    query.isError,
  ]);

  return {
    ...query,
    connectionStatus: currentConnection.status,
    connectionBlocked: currentConnection.blocked,
    reconnecting: currentConnection.reconnecting,
    reconnect: () => lifecycleRef.current?.reconnect(),
  };
}
