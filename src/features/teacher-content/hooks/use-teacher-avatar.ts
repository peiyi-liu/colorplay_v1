import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { parsePublicEnv } from '../../../lib/config/public-env';
import { getBrowserSupabaseClient } from '../../../lib/supabase/browser-client';
import {
  createTeacherAvatarRepository,
  type TeacherAvatarRepository,
  TeacherAvatarRepositoryError,
} from '../api/teacher-avatar-repository';

export const teacherAvatarQueryKey = ['teacher', 'avatar'] as const;

const browserRepository = () =>
  createTeacherAvatarRepository(
    getBrowserSupabaseClient(parsePublicEnv(import.meta.env)),
  );

export function useTeacherAvatar(
  repository?: TeacherAvatarRepository,
): Pick<
  UseQueryResult<string | null, TeacherAvatarRepositoryError>,
  'data' | 'error' | 'isError' | 'isPending'
> {
  return useQuery({
    queryFn: () => (repository ?? browserRepository()).getAvatarUrl(),
    queryKey: teacherAvatarQueryKey,
    retry: (failureCount, error) =>
      error?.code !== 'AVATAR_AUTHORIZATION' && failureCount < 2,
  });
}

export function useUploadTeacherAvatar(
  repository?: TeacherAvatarRepository,
): UseMutationResult<string, TeacherAvatarRepositoryError, File> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file) =>
      (repository ?? browserRepository()).uploadAvatar(file),
    onSuccess: (signedUrl) => {
      queryClient.setQueryData(teacherAvatarQueryKey, signedUrl);
    },
    retry: false,
  });
}
