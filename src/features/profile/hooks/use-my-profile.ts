import {
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { useAuth } from '../../auth/context/auth-context';
import { parsePublicEnv } from '../../../lib/config/public-env';
import { getBrowserSupabaseClient } from '../../../lib/supabase/browser-client';
import { createProfileRepository } from '../api/profile-repository';
import { ProfileRepositoryError, type SafeProfile } from '../types';

export const myProfileQueryKey = ['profile', 'me'] as const;

export type MyProfileQuery = Pick<
  UseQueryResult<SafeProfile, ProfileRepositoryError>,
  'data' | 'error' | 'isError' | 'isPending' | 'refetch'
>;

export function useMyProfile(): MyProfileQuery {
  const auth = useAuth();
  const authenticatedUserId =
    auth.status === 'authenticated' ? auth.session?.userId : undefined;
  const queryClient = useQueryClient();
  const previousUserId = useRef(authenticatedUserId);
  const query = useQuery<SafeProfile, ProfileRepositoryError>({
    enabled: auth.status === 'authenticated',
    queryFn: () =>
      createProfileRepository(
        getBrowserSupabaseClient(parsePublicEnv(import.meta.env)),
      ).getMyProfile(),
    queryKey: myProfileQueryKey,
    retry: (failureCount, error) =>
      error.code !== 'PROFILE_AUTHORIZATION' && failureCount < 2,
  });

  useEffect(() => {
    if (previousUserId.current !== authenticatedUserId) {
      previousUserId.current = authenticatedUserId;
      void queryClient.resetQueries({
        exact: true,
        queryKey: myProfileQueryKey,
      });
    }
  }, [authenticatedUserId, queryClient]);

  const data =
    authenticatedUserId !== undefined && query.data?.id === authenticatedUserId
      ? query.data
      : undefined;

  return {
    data,
    error: query.error,
    isError: query.isError,
    isPending:
      query.isPending ||
      (auth.status === 'authenticated' && query.data !== undefined && !data),
    refetch: query.refetch,
  };
}
