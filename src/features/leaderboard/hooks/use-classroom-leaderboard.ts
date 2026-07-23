import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { parsePublicEnv } from '../../../lib/config/public-env';
import { getBrowserSupabaseClient } from '../../../lib/supabase/browser-client';
import { createLeaderboardRepository } from '../api/leaderboard-repository';
import {
  type ClassroomLeaderboard,
  type LeaderboardRepository,
  LeaderboardRepositoryError,
  isDatabaseUuid,
} from '../types';

export const leaderboardKeys = {
  classroom: (classroomId: string) =>
    ['leaderboard', 'classroom', classroomId] as const,
};

export function useClassroomLeaderboard(
  classroomId: string,
  repository?: LeaderboardRepository,
): UseQueryResult<ClassroomLeaderboard, LeaderboardRepositoryError> {
  const resolved =
    repository ??
    createLeaderboardRepository(
      getBrowserSupabaseClient(parsePublicEnv(import.meta.env)),
    );
  return useQuery({
    enabled: isDatabaseUuid(classroomId),
    queryFn: () => resolved.getClassroomLeaderboard(classroomId),
    queryKey: leaderboardKeys.classroom(classroomId),
    retry: (failureCount, error) =>
      error.code === 'UNAVAILABLE' && failureCount < 2,
  });
}
