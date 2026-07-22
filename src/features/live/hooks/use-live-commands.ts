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
  type LiveDistribution,
  type LiveStandings,
  type LiveJoinResult,
  type LiveMyStanding,
  type LiveQuestionDisplay,
  type LiveRepository,
  LiveRepositoryError,
  type LiveSessionDetail,
  type LiveSessionMode,
  type LiveSessionReceipt,
  type LiveTeamTotal,
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
  {
    title: string;
    quizTemplateId: string;
    questionTimeLimitSeconds: number;
    questionDisplay?: LiveQuestionDisplay;
  }
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
  {
    activityId: string;
    classroomId: string;
    assignmentId: string | null;
    mode?: LiveSessionMode;
    teamCount?: number | null;
  }
> {
  const resolved = resolveRepository(repository);
  return useMutation({
    mutationFn: (input) => resolved.createSession(input),
    retry: false,
  });
}

export function useScheduleLiveActivity(
  repository?: LiveRepository,
): UseMutationResult<
  void,
  LiveRepositoryError,
  { activityId: string; scheduledFor: string | null }
> {
  const resolved = resolveRepository(repository);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input) =>
      resolved.scheduleActivity(input.activityId, input.scheduledFor),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: liveActivityKeys.mine });
    },
    retry: false,
  });
}

export function useLiveDistribution(
  sessionId: string,
  input: Readonly<{ answeredCount: number; enabled: boolean }>,
  repository?: LiveRepository,
): UseQueryResult<LiveDistribution, LiveRepositoryError> {
  const resolved = resolveRepository(repository);
  return useQuery({
    enabled: input.enabled && sessionId.length > 0,
    // The answered count arrives with every broadcast, so keying on it
    // refreshes the host distribution exactly when a new answer lands.
    queryFn: () => resolved.getDistribution(sessionId),
    queryKey: ['live', 'distribution', sessionId, input.answeredCount] as const,
    retry: false,
  });
}

export function useLiveStandings(
  sessionId: string,
  input: Readonly<{ enabled: boolean; stateVersion: number }>,
  repository?: LiveRepository,
): UseQueryResult<LiveStandings, LiveRepositoryError> {
  const resolved = resolveRepository(repository);
  return useQuery({
    enabled: input.enabled && sessionId.length > 0,
    queryFn: () => resolved.getStandings(sessionId),
    queryKey: ['live', 'standings', sessionId, input.stateVersion] as const,
    retry: false,
  });
}

export function useLiveMyStanding(
  sessionId: string,
  input: Readonly<{ enabled: boolean; stateVersion: number }>,
  repository?: LiveRepository,
): UseQueryResult<LiveMyStanding, LiveRepositoryError> {
  const resolved = resolveRepository(repository);
  return useQuery({
    enabled: input.enabled && sessionId.length > 0,
    queryFn: () => resolved.getMyStanding(sessionId),
    queryKey: ['live', 'my-standing', sessionId, input.stateVersion] as const,
    retry: false,
  });
}

export function useLiveTeamTotals(
  sessionId: string,
  input: Readonly<{ enabled: boolean; stateVersion: number }>,
  repository?: LiveRepository,
): UseQueryResult<readonly LiveTeamTotal[], LiveRepositoryError> {
  const resolved = resolveRepository(repository);
  return useQuery({
    enabled: input.enabled && sessionId.length > 0,
    queryFn: () => resolved.getTeamTotals(sessionId),
    queryKey: ['live', 'team-totals', sessionId, input.stateVersion] as const,
    retry: false,
  });
}

export function useLiveSessionDetail(
  sessionId: string,
  repository?: LiveRepository,
): UseQueryResult<LiveSessionDetail, LiveRepositoryError> {
  const resolved = resolveRepository(repository);
  return useQuery({
    enabled: sessionId.length > 0,
    queryFn: () => resolved.getSessionDetail(sessionId),
    queryKey: ['live', 'session-detail', sessionId] as const,
    retry: (failureCount, error) =>
      error.code === 'UNAVAILABLE' && failureCount < 2,
  });
}

export type LiveTransitionName =
  | 'advance'
  | 'cancel'
  | 'closeQuestion'
  | 'finalize'
  | 'openQuestion'
  | 'pauseSession'
  | 'resumeSession'
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
  Readonly<{ streak: number }>,
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
