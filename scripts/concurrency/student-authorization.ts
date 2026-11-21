import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../src/types/database';
import {
  createClassroomRepository,
  ClassroomRepositoryError,
} from '../../src/features/classrooms/api/classroom-repository';
import {
  createLeaderboardRepository,
  LeaderboardRepositoryError,
} from '../../src/features/leaderboard/api/leaderboard-repository';
import { fail, safely } from './config';
export const assertFunctionalDenied = async (
  operation: () => Promise<unknown>,
  denied: (error: unknown) => boolean,
) => {
  let rejection: unknown;
  try {
    await operation();
  } catch (error) {
    rejection = error;
  }
  if (!denied(rejection)) return fail('FUNCTIONAL_STUDENT_FAILED');
};
export const studentAuthorizationFunctional = async (
  student: SupabaseClient<Database>,
  outsider: SupabaseClient<Database>,
  classroom1: string,
  classroom2: string,
) =>
  safely(async () => {
    await assertFunctionalDenied(
      () => createClassroomRepository(student).getOwnedMembers(classroom1),
      (error) =>
        error instanceof ClassroomRepositoryError &&
        error.code === 'NOT_AVAILABLE',
    );
    await assertFunctionalDenied(
      () =>
        createLeaderboardRepository(student).getClassroomLeaderboard(
          classroom2,
        ),
      (error) =>
        error instanceof LeaderboardRepositoryError &&
        ['PERMISSION_DENIED', 'NOT_AVAILABLE'].includes(error.code),
    );
    await assertFunctionalDenied(
      () =>
        createLeaderboardRepository(outsider).getClassroomLeaderboard(
          classroom1,
        ),
      (error) =>
        error instanceof LeaderboardRepositoryError &&
        ['PERMISSION_DENIED', 'NOT_AVAILABLE'].includes(error.code),
    );
    return {
      studentTeacherReadDenied: true,
      crossClassroomReadDenied: true,
      outsiderReadDenied: true,
    };
  }, 'FUNCTIONAL_STUDENT_FAILED');
