import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';

import { parsePublicEnv } from '../../../lib/config/public-env';
import { getBrowserSupabaseClient } from '../../../lib/supabase/browser-client';
import type { Database } from '../../../types/database';
import {
  fetchStudentChapterMap,
  type StudentChapterMap,
} from '../api/chapter-map';
import type { LearningError } from '../api/learning-repository';

export const studentChapterMapKey = ['learning', 'chapter-map'] as const;

export function useStudentChapterMap(
  suppliedClient?: SupabaseClient<Database>,
  enabled = true,
): UseQueryResult<StudentChapterMap, LearningError> {
  return useQuery<StudentChapterMap, LearningError>({
    enabled,
    queryFn: () =>
      fetchStudentChapterMap(
        suppliedClient ??
          getBrowserSupabaseClient(parsePublicEnv(import.meta.env)),
      ),
    queryKey: studentChapterMapKey,
    retry: (failureCount, error) =>
      error.code === 'UNAVAILABLE' && failureCount < 2,
  });
}
