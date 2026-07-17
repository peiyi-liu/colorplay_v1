import { afterAll, describe, expect, it } from 'vitest';

import { TEST_USERS } from '../../../../tests/fixtures/users';
import { signedInClient } from '../../../../tests/helpers/signed-in-client';
import { ClassroomRepositoryError } from '../types';
import { createClassroomRepository } from './classroom-repository';

describe('ClassroomRepository with local Supabase', () => {
  const clients: Awaited<ReturnType<typeof signedInClient>>[] = [];

  afterAll(async () => {
    await Promise.all(
      clients.map((client) => client.auth.signOut({ scope: 'local' })),
    );
  });

  it('creates, joins idempotently, and enforces owner/member projections', async () => {
    const teacherClient = await signedInClient(
      TEST_USERS.classroomRepositoryTeacher,
    );
    const studentClient = await signedInClient(
      TEST_USERS.classroomRepositoryStudent,
    );
    const teacherBClient = await signedInClient(TEST_USERS.teacherTwo);
    const outsiderClient = await signedInClient(TEST_USERS.outsider);
    clients.push(teacherClient, studentClient, teacherBClient, outsiderClient);
    const teacher = createClassroomRepository(teacherClient);
    const student = createClassroomRepository(studentClient);
    const teacherB = createClassroomRepository(teacherBClient);
    const outsider = createClassroomRepository(outsiderClient);
    const name = `Repository ${crypto.randomUUID()}`.slice(0, 80);

    const created = await teacher.createClassroom({ name });
    const requestId = crypto.randomUUID();
    const receipts = await Promise.all(
      Array.from({ length: 10 }, () =>
        student.joinClassroom({ joinCode: created.joinCode, requestId }),
      ),
    );

    expect(new Set(receipts.map((receipt) => receipt.joinedAt))).toHaveLength(
      1,
    );
    await expect(teacher.listOwned()).resolves.toContainEqual(
      expect.objectContaining({
        classroomId: created.classroomId,
        memberCount: 1,
      }),
    );
    await expect(student.listMine()).resolves.toContainEqual(
      expect.objectContaining({ classroomId: created.classroomId }),
    );
    await expect(
      teacher.getOwnedMembers(created.classroomId),
    ).resolves.toHaveLength(1);
    await expect(teacherB.getOwnedMembers(created.classroomId)).rejects.toEqual(
      new ClassroomRepositoryError('NOT_AVAILABLE'),
    );
    await expect(outsider.getOwnedMembers(created.classroomId)).rejects.toEqual(
      new ClassroomRepositoryError('NOT_AVAILABLE'),
    );

    const rotated = await teacher.rotateJoinCode(created.classroomId);
    expect(rotated.joinCode).not.toBe(created.joinCode);
    expect(rotated.joinCodeVersion).toBe(created.joinCodeVersion + 1);
  });
});
