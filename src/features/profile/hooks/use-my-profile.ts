import { readQueryRetryDelay } from '../../../lib/query/read-retry';
import {
  useMutation,
  type UseMutationResult,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import { useAuth } from '../../auth/context/auth-context';
import { parsePublicEnv } from '../../../lib/config/public-env';
import { getBrowserSupabaseClient } from '../../../lib/supabase/browser-client';
import { createProfileRepository } from '../api/profile-repository';
import {
  type ProfileRepository,
  ProfileRepositoryError,
  type SafeProfile,
} from '../types';

export const myProfileQueryKey = ['profile', 'me'] as const;
export const myProfileUserQueryKey = (userId: string | undefined) =>
  [...myProfileQueryKey, userId] as const;

export type MyProfileQuery = Pick<
  UseQueryResult<SafeProfile, ProfileRepositoryError>,
  'data' | 'error' | 'isError' | 'isPending' | 'refetch'
>;

export function useMyProfile(): MyProfileQuery {
  const auth = useAuth();
  const authenticatedUserId =
    auth.status === 'authenticated' ? auth.session?.userId : undefined;
  const query = useQuery<SafeProfile, ProfileRepositoryError>({
    enabled: auth.status === 'authenticated',
    queryFn: () =>
      createProfileRepository(
        getBrowserSupabaseClient(parsePublicEnv(import.meta.env)),
      ).getMyProfile(),
    queryKey: myProfileUserQueryKey(authenticatedUserId),
    retry: (failureCount, error) =>
      error instanceof ProfileRepositoryError &&
      error.code === 'PROFILE_UNAVAILABLE' &&
      failureCount < 2,
    retryDelay: readQueryRetryDelay,
  });

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

export function useSetReducedMotion(
  repository?: ProfileRepository,
): UseMutationResult<void, ProfileRepositoryError, boolean> {
  const resolved =
    repository ??
    createProfileRepository(
      getBrowserSupabaseClient(parsePublicEnv(import.meta.env)),
    );
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (enabled) => resolved.setReducedMotion(enabled),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: myProfileQueryKey });
    },
    retry: false,
  });
}
