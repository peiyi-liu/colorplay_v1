import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { parsePublicEnv } from '../../../lib/config/public-env';
import { getBrowserSupabaseClient } from '../../../lib/supabase/browser-client';
import { createAchievementRepository } from '../api/achievement-repository';
import {
  type AchievementCatalog,
  type AchievementRepository,
  AchievementRepositoryError,
} from '../types';

export const achievementQueryKey = ['achievements', 'catalog'] as const;

export function useAchievements(
  repository?: AchievementRepository,
): UseQueryResult<AchievementCatalog, AchievementRepositoryError> {
  const resolvedRepository =
    repository ??
    createAchievementRepository(
      getBrowserSupabaseClient(parsePublicEnv(import.meta.env)),
    );

  return useQuery<AchievementCatalog, AchievementRepositoryError>({
    queryFn: () => resolvedRepository.getCatalog(),
    queryKey: achievementQueryKey,
    retry: (failureCount, error) =>
      error.code === 'UNAVAILABLE' && failureCount < 2,
  });
}
