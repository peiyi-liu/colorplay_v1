import type { SupabaseClient } from '@supabase/supabase-js';
import {
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useEffect } from 'react';

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

export function useLiveSession(
  sessionId: string,
  dependencies?: Readonly<{
    client?: SupabaseClient<Database>;
    repository?: LiveRepository;
  }>,
): UseQueryResult<LiveSessionState, LiveRepositoryError> {
  const client =
    dependencies?.client ??
    getBrowserSupabaseClient(parsePublicEnv(import.meta.env));
  const repository = dependencies?.repository ?? createLiveRepository(client);
  const queryClient = useQueryClient();

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
      .on('broadcast', { event: 'live_state' }, () => {
        // Realtime is transport only: every message, whether it is the next
        // version or a gap after a missed broadcast, triggers one fetch of
        // the authoritative server state keyed by state_version.
        reconcile();
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') reconcile();
      });

    return () => {
      void client.removeChannel(channel);
    };
  }, [client, queryClient, sessionId]);

  return query;
}
