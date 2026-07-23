import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useRef } from 'react';

import { parsePublicEnv } from '../../../lib/config/public-env';
import { getBrowserSupabaseClient } from '../../../lib/supabase/browser-client';
import { createClassroomRepository } from '../api/classroom-repository';
import {
  type ClassroomCodeReceipt,
  type ClassroomMember,
  type ClassroomRepository,
  ClassroomRepositoryError,
  type JoinedClassroom,
  type OwnedClassroom,
  type StudentClassroom,
} from '../types';

export const classroomKeys = {
  mine: ['classrooms', 'mine'] as const,
  owned: ['classrooms', 'owned'] as const,
  ownedMembers: (classroomId: string) =>
    ['classrooms', 'owned', classroomId, 'members'] as const,
};

const resolveRepository = (repository?: ClassroomRepository) =>
  repository ??
  createClassroomRepository(
    getBrowserSupabaseClient(parsePublicEnv(import.meta.env)),
  );
const retryRead = (failureCount: number, error: ClassroomRepositoryError) =>
  error.code === 'UNAVAILABLE' && failureCount < 2;

export function useMyClassrooms(
  repository?: ClassroomRepository,
): UseQueryResult<readonly StudentClassroom[], ClassroomRepositoryError> {
  const resolved = resolveRepository(repository);
  return useQuery({
    queryFn: () => resolved.listMine(),
    queryKey: classroomKeys.mine,
    retry: retryRead,
  });
}

export function useOwnedClassrooms(
  repository?: ClassroomRepository,
): UseQueryResult<readonly OwnedClassroom[], ClassroomRepositoryError> {
  const resolved = resolveRepository(repository);
  return useQuery({
    queryFn: () => resolved.listOwned(),
    queryKey: classroomKeys.owned,
    retry: retryRead,
  });
}

export function useOwnedClassroomMembers(
  classroomId: string,
  repository?: ClassroomRepository,
): UseQueryResult<readonly ClassroomMember[], ClassroomRepositoryError> {
  const resolved = resolveRepository(repository);
  return useQuery({
    enabled: classroomId.length > 0,
    queryFn: () => resolved.getOwnedMembers(classroomId),
    queryKey: classroomKeys.ownedMembers(classroomId),
    retry: retryRead,
  });
}

type CreateMutation = UseMutationResult<
  ClassroomCodeReceipt,
  ClassroomRepositoryError,
  Readonly<{ name: string }>
>;

export function useCreateClassroom(
  repository?: ClassroomRepository,
): CreateMutation {
  const queryClient = useQueryClient();
  const resolved = resolveRepository(repository);
  return useMutation({
    mutationFn: (input) => resolved.createClassroom(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: classroomKeys.owned });
    },
    retry: false,
  });
}

export function useRotateClassroomJoinCode(
  repository?: ClassroomRepository,
): UseMutationResult<ClassroomCodeReceipt, ClassroomRepositoryError, string> {
  const queryClient = useQueryClient();
  const resolved = resolveRepository(repository);
  return useMutation({
    mutationFn: (classroomId) => resolved.rotateJoinCode(classroomId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: classroomKeys.owned });
    },
    retry: false,
  });
}

export function useJoinClassroom(
  repository?: ClassroomRepository,
): UseMutationResult<JoinedClassroom, ClassroomRepositoryError, string> {
  const queryClient = useQueryClient();
  const resolved = resolveRepository(repository);
  const requestId = useRef<string | null>(null);
  return useMutation({
    mutationFn: (joinCode) => {
      if (!requestId.current) throw new ClassroomRepositoryError('UNAVAILABLE');
      return resolved.joinClassroom({ joinCode, requestId: requestId.current });
    },
    onMutate: () => {
      requestId.current = crypto.randomUUID();
    },
    onSettled: () => {
      requestId.current = null;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: classroomKeys.mine });
    },
    retry: (failureCount, error) =>
      error.code === 'UNAVAILABLE' && failureCount < 1,
  });
}
