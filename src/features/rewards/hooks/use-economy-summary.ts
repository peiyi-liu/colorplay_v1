import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { parsePublicEnv } from '../../../lib/config/public-env';
import { getBrowserSupabaseClient } from '../../../lib/supabase/browser-client';
import { createEconomyRepository } from '../api/economy-repository';
import {
  type EconomyRepository,
  EconomyRepositoryError,
  type EconomySummary,
} from '../types';

export const economyQueryKey = ['economy', 'summary'] as const;

export function useEconomySummary(
  repository?: EconomyRepository,
): UseQueryResult<EconomySummary, EconomyRepositoryError> {
  const resolvedRepository =
    repository ??
    createEconomyRepository(
      getBrowserSupabaseClient(parsePublicEnv(import.meta.env)),
    );

  return useQuery<EconomySummary, EconomyRepositoryError>({
    queryFn: () => resolvedRepository.getSummary(),
    queryKey: economyQueryKey,
    retry: (failureCount, error) =>
      error.code === 'UNAVAILABLE' && failureCount < 2,
  });
}
