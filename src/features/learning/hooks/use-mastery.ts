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
  createMasteryRepository,
  MasteryError,
  type MasteryAttemptResult,
  type MasteryRepository,
  type MasteryState,
} from '../api/mastery-repository';

export const masteryKeys = {
  state: (sessionId: string) => ['mastery', 'state', sessionId] as const,
};

const resolveRepository = (
  supplied: MasteryRepository | undefined,
): MasteryRepository =>
  supplied ??
  createMasteryRepository(
    getBrowserSupabaseClient(parsePublicEnv(import.meta.env)),
  );

export function useMasteryState(
  sessionId: string,
  repository?: MasteryRepository,
): UseQueryResult<MasteryState, MasteryError> {
  const resolved = resolveRepository(repository);
  return useQuery<MasteryState, MasteryError>({
    enabled: sessionId.length > 0,
    queryFn: () => resolved.getState(sessionId),
    queryKey: masteryKeys.state(sessionId),
    retry: (failureCount, error) =>
      error.code === 'UNAVAILABLE' && failureCount < 2,
  });
}

export function useStartMastery(
  repository?: MasteryRepository,
): UseMutationResult<string, MasteryError, string> {
  const resolved = resolveRepository(repository);
  return useMutation<string, MasteryError, string>({
    mutationFn: (chapterId) => resolved.startSession(chapterId),
    retry: false,
  });
}

export function useSubmitMasteryAttempt(
  sessionId: string,
  repository?: MasteryRepository,
): UseMutationResult<MasteryAttemptResult, MasteryError, string> {
  const queryClient = useQueryClient();
  const resolved = resolveRepository(repository);
  return useMutation<MasteryAttemptResult, MasteryError, string>({
    mutationFn: (optionId) => resolved.submitAttempt(sessionId, optionId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: masteryKeys.state(sessionId),
      });
    },
    retry: false,
  });
}

export function useMasteryHint(
  sessionId: string,
  repository?: MasteryRepository,
): UseMutationResult<
  Readonly<{ content: string; hintLevel: number }>,
  MasteryError,
  number
> {
  const resolved = resolveRepository(repository);
  return useMutation<
    Readonly<{ content: string; hintLevel: number }>,
    MasteryError,
    number
  >({
    mutationFn: (hintLevel) => resolved.getHint(sessionId, hintLevel),
    retry: false,
  });
}
