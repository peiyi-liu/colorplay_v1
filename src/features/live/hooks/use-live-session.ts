import {
  REALTIME_SUBSCRIBE_STATES,
  type SupabaseClient,
} from '@supabase/supabase-js';
import {
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import type { Database } from '../../../types/database';
import { parsePublicEnv } from '../../../lib/config/public-env';
import { getBrowserSupabaseClient } from '../../../lib/supabase/browser-client';
import { createLiveRepository } from '../api/live-repository';
import {
  type LiveRepository,
  LiveRepositoryError,
  type LiveSessionState,
} from '../types';

export const liveKeys = {
  session: (sessionId: string) => ['live', 'session', sessionId] as const,
};

export type LiveConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'disconnected';

export type LiveSessionQueryResult = UseQueryResult<
  LiveSessionState,
  LiveRepositoryError
> &
  Readonly<{ connectionStatus: LiveConnectionStatus }>;

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
  const [connection, setConnection] = useState<Readonly<{
    sessionId: string;
    status: LiveConnectionStatus;
  }>>({ sessionId, status: 'connecting' });
  const connectionStatus =
    connection.sessionId === sessionId ? connection.status : 'connecting';

  const query = useQuery<LiveSessionState, LiveRepositoryError>({
    enabled: sessionId.length > 0,
    queryFn: () => repository.getState(sessionId),
    queryKey: liveKeys.session(sessionId),
    retry: (failureCount, error) =>
      error.code === 'UNAVAILABLE' && failureCount < 2,
  });

  useEffect(() => {
    if (sessionId.length === 0) return;
    const key = liveKeys.session(sessionId);
    const reconcile = () => {
      void queryClient.invalidateQueries({ queryKey: key });
    };
    const channel = client
      .channel(`live-session:${sessionId}`, {
        config: { broadcast: { self: true }, private: true },
      })
      .on('broadcast', { event: 'live_state' }, (message) => {
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
              reconcile();
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
        reconcile();
      })
      .subscribe((status) => {
        if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
          setConnection({ sessionId, status: 'connected' });
          reconcile();
          return;
        }
        setConnection({ sessionId, status: 'disconnected' });
      });

    return () => {
      void client.removeChannel(channel);
    };
  }, [client, queryClient, sessionId]);

  return { ...query, connectionStatus };
}
