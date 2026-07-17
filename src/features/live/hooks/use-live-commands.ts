import {
  useMutation,
  type UseMutationResult,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import { parsePublicEnv } from '../../../lib/config/public-env';
import { getBrowserSupabaseClient } from '../../../lib/supabase/browser-client';
import { createLiveRepository } from '../api/live-repository';
import {
  type LiveActivity,
  type LiveJoinResult,
  type LiveRepository,
  LiveRepositoryError,
  type LiveSessionReceipt,
} from '../types';
import { liveKeys } from './use-live-session';

export const liveActivityKeys = {
  mine: ['live', 'activities'] as const,
};

const resolveRepository = (repository?: LiveRepository): LiveRepository =>
  repository ??
  createLiveRepository(
    getBrowserSupabaseClient(parsePublicEnv(import.meta.env)),
  );

export function useLiveActivities(
  repository?: LiveRepository,
): UseQueryResult<readonly LiveActivity[], LiveRepositoryError> {
  const resolved = resolveRepository(repository);
  return useQuery<readonly LiveActivity[], LiveRepositoryError>({
    queryFn: () => resolved.listMyActivities(),
    queryKey: liveActivityKeys.mine,
    retry: (failureCount, error) =>
      error.code === 'UNAVAILABLE' && failureCount < 2,
  });
}

export function useCreateLiveActivity(
  repository?: LiveRepository,
): UseMutationResult<
  LiveActivity,
  LiveRepositoryError,
  { title: string; quizTemplateId: string; questionTimeLimitSeconds: number }
> {
  const resolved = resolveRepository(repository);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input) => resolved.createActivity(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: liveActivityKeys.mine });
    },
    retry: false,
  });
}

export function useCreateLiveSession(
  repository?: LiveRepository,
): UseMutationResult<
  LiveSessionReceipt,
  LiveRepositoryError,
  { activityId: string; classroomId: string; assignmentId: string | null }
> {
  const resolved = resolveRepository(repository);
  return useMutation({
    mutationFn: (input) => resolved.createSession(input),
    retry: false,
  });
}

export type LiveTransitionName =
  | 'advance'
  | 'cancel'
  | 'closeQuestion'
  | 'finalize'
  | 'openQuestion'
  | 'startSession';

export function useLiveTransition(
  sessionId: string,
  repository?: LiveRepository,
): UseMutationResult<
  void,
  LiveRepositoryError,
  { transition: LiveTransitionName; expectedVersion: number }
> {
  const resolved = resolveRepository(repository);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ expectedVersion, transition }) =>
      resolved[transition](sessionId, expectedVersion),
    onSettled: async () => {
      // Success and conflict alike resolve by refetching authoritative state.
      await queryClient.invalidateQueries({
        queryKey: liveKeys.session(sessionId),
      });
    },
    retry: false,
  });
}

export function useJoinLive(
  repository?: LiveRepository,
): UseMutationResult<
  LiveJoinResult,
  LiveRepositoryError,
  { joinCode: string; requestId: string }
> {
  const resolved = resolveRepository(repository);
  return useMutation({
    mutationFn: (input) => resolved.join(input),
    retry: false,
  });
}

export function useSubmitLiveAnswer(
  sessionId: string,
  repository?: LiveRepository,
): UseMutationResult<
  void,
  LiveRepositoryError,
  {
    sessionQuestionId: string;
    selectedOptionId: string;
    idempotencyKey: string;
  }
> {
  const resolved = resolveRepository(repository);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input) => resolved.submitAnswer(input),
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: liveKeys.session(sessionId),
      });
    },
    retry: false,
  });
}
