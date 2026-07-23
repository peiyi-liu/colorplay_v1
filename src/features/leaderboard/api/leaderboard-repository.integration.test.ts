import { afterAll, describe, expect, it } from 'vitest';

import {
  CLASSROOM_FIXTURES,
  TEST_USERS,
} from '../../../../tests/fixtures/users';
import { signedInClient } from '../../../../tests/helpers/signed-in-client';
import { createClassroomRepository } from '../../classrooms/api/classroom-repository';
import { LeaderboardRepositoryError } from '../types';
import { createLeaderboardRepository } from './leaderboard-repository';

describe('LeaderboardRepository with local Supabase', () => {
  const clients: Awaited<ReturnType<typeof signedInClient>>[] = [];
  afterAll(async () => {
    await Promise.all(
      clients.map((client) => client.auth.signOut({ scope: 'local' })),
    );
  });

  it('allows only the owner and active member to read the safe projection', async () => {
    const teacherClient = await signedInClient(TEST_USERS.teacher);
    const memberClient = await signedInClient(TEST_USERS.studentOne);
    const teacherBClient = await signedInClient(TEST_USERS.teacherTwo);
    const outsiderClient = await signedInClient(TEST_USERS.outsider);
    clients.push(teacherClient, memberClient, teacherBClient, outsiderClient);
    const owned = await createClassroomRepository(teacherClient).listOwned();
    const classroom = owned.find(
      ({ classroomName }) =>
        classroomName === CLASSROOM_FIXTURES.teacherOneClassroom.name,
    );
    if (!classroom) throw new Error('CLASSROOM_FIXTURE_MISSING');

    const ownerBoard = await createLeaderboardRepository(
      teacherClient,
    ).getClassroomLeaderboard(classroom.classroomId);
    const memberBoard = await createLeaderboardRepository(
      memberClient,
    ).getClassroomLeaderboard(classroom.classroomId);

    expect(ownerBoard.classroomId).toBe(memberBoard.classroomId);
    expect(ownerBoard.classroomName).toBe(memberBoard.classroomName);
    const withoutSelfFlag = ({
      activeBlookId,
      displayName,
      rank,
      totalXp,
    }: (typeof ownerBoard.topEntries)[number]) => ({
      activeBlookId,
      displayName,
      rank,
      totalXp,
    });
    expect(ownerBoard.topEntries.map(withoutSelfFlag)).toEqual(
      memberBoard.topEntries.map(withoutSelfFlag),
    );
    expect(ownerBoard.topEntries.every((entry) => !entry.isSelf)).toBe(true);
    expect(memberBoard.topEntries.filter((entry) => entry.isSelf)).toHaveLength(
      1,
    );
    expect(ownerBoard.selfEntry).toBeNull();
    expect(memberBoard.selfEntry).toEqual(
      expect.objectContaining({ isSelf: true }),
    );
    expect(Object.keys(ownerBoard).sort()).toEqual([
      'classroomId',
      'classroomName',
      'generatedAt',
      'memberCount',
      'selfEntry',
      'topEntries',
    ]);
    expect(ownerBoard.topEntries).toHaveLength(2);
    expect(
      ownerBoard.topEntries.every((entry) => Object.keys(entry).length === 7),
    ).toBe(true);
    await expect(
      createLeaderboardRepository(teacherBClient).getClassroomLeaderboard(
        classroom.classroomId,
      ),
    ).rejects.toEqual(new LeaderboardRepositoryError('NOT_AVAILABLE'));
    await expect(
      createLeaderboardRepository(outsiderClient).getClassroomLeaderboard(
        classroom.classroomId,
      ),
    ).rejects.toEqual(new LeaderboardRepositoryError('NOT_AVAILABLE'));
  });
});
