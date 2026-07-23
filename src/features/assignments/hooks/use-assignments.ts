import {
  useMutation,
  type UseMutationResult,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import { parsePublicEnv } from '../../../lib/config/public-env';
import { getBrowserSupabaseClient } from '../../../lib/supabase/browser-client';
import { createAssignmentRepository } from '../api/assignment-repository';
import {
  type AssignmentRepository,
  AssignmentRepositoryError,
  type AssignmentStatus,
  type AssignmentStatusUpdate,
  type ClassroomAssignment,
  type CreateAssignmentInput,
  type CreatedAssignment,
  type StartedAssignmentAttempt,
  type StudentAssignment,
} from '../types';

export const assignmentKeys = {
  classroom: (classroomId: string) =>
    ['assignments', 'classroom', classroomId] as const,
  mine: ['assignments', 'mine'] as const,
};

const resolveRepository = (
  repository?: AssignmentRepository,
): AssignmentRepository =>
  repository ??
  createAssignmentRepository(
    getBrowserSupabaseClient(parsePublicEnv(import.meta.env)),
  );

export function useMyAssignments(
  repository?: AssignmentRepository,
): UseQueryResult<readonly StudentAssignment[], AssignmentRepositoryError> {
  const resolved = resolveRepository(repository);
  return useQuery<readonly StudentAssignment[], AssignmentRepositoryError>({
    queryFn: () => resolved.listMine(),
    queryKey: assignmentKeys.mine,
    retry: (failureCount, error) =>
      error.code === 'UNAVAILABLE' && failureCount < 2,
  });
}

export function useClassroomAssignments(
  classroomId: string,
  repository?: AssignmentRepository,
): UseQueryResult<readonly ClassroomAssignment[], AssignmentRepositoryError> {
  const resolved = resolveRepository(repository);
  return useQuery<readonly ClassroomAssignment[], AssignmentRepositoryError>({
    enabled: classroomId.length > 0,
    queryFn: () => resolved.listClassroom(classroomId),
    queryKey: assignmentKeys.classroom(classroomId),
    retry: (failureCount, error) =>
      error.code === 'UNAVAILABLE' && failureCount < 2,
  });
}

export function useCreateAssignment(
  classroomId: string,
  repository?: AssignmentRepository,
): UseMutationResult<
  CreatedAssignment,
  AssignmentRepositoryError,
  CreateAssignmentInput
> {
  const resolved = resolveRepository(repository);
  const queryClient = useQueryClient();
  return useMutation<
    CreatedAssignment,
    AssignmentRepositoryError,
    CreateAssignmentInput
  >({
    mutationFn: (input) => resolved.createAssignment(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: assignmentKeys.classroom(classroomId),
      });
    },
    retry: false,
  });
}

export function useUpdateAssignmentStatus(
  classroomId: string,
  repository?: AssignmentRepository,
): UseMutationResult<
  AssignmentStatusUpdate,
  AssignmentRepositoryError,
  {
    assignmentId: string;
    status: AssignmentStatus;
    expectedUpdatedAt: string | null;
  }
> {
  const resolved = resolveRepository(repository);
  const queryClient = useQueryClient();
  return useMutation<
    AssignmentStatusUpdate,
    AssignmentRepositoryError,
    {
      assignmentId: string;
      status: AssignmentStatus;
      expectedUpdatedAt: string | null;
    }
  >({
    mutationFn: (input) => resolved.updateStatus(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: assignmentKeys.classroom(classroomId),
      });
    },
    retry: false,
  });
}

export function useStartAssignmentAttempt(
  repository?: AssignmentRepository,
): UseMutationResult<
  StartedAssignmentAttempt,
  AssignmentRepositoryError,
  { assignmentId: string; requestId: string }
> {
  const resolved = resolveRepository(repository);
  const queryClient = useQueryClient();
  return useMutation<
    StartedAssignmentAttempt,
    AssignmentRepositoryError,
    { assignmentId: string; requestId: string }
  >({
    mutationFn: (input) => resolved.startAttempt(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: assignmentKeys.mine });
    },
    retry: false,
  });
}
