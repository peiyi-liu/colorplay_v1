import { afterAll, describe, expect, it } from 'vitest';

import { TEST_USERS } from '../../../../tests/fixtures/users';
import { signedInClient } from '../../../../tests/helpers/signed-in-client';
import { createProfileRepository } from './profile-repository';

describe('ProfileRepository with RLS', () => {
  const clients: Awaited<ReturnType<typeof signedInClient>>[] = [];

  const clientFor = async (
    user: (typeof TEST_USERS)[keyof typeof TEST_USERS],
  ) => {
    const client = await signedInClient(user);
    clients.push(client);
    return client;
  };

  afterAll(async () => {
    await Promise.all(
      clients.map((client) => client.auth.signOut({ scope: 'local' })),
    );
  });

  it('returns only the safe signed-in profile projection', async () => {
    const client = await clientFor(TEST_USERS.studentOne);

    const profile = await createProfileRepository(client).getMyProfile();

    expect(profile).toMatchObject({
      displayName: 'student.one',
      role: 'student',
      timezone: 'Asia/Taipei',
    });
    expect(Object.keys(profile).sort()).toEqual([
      'displayName',
      'id',
      'role',
      'timezone',
    ]);
  });

  it('cannot select or update another profile', async () => {
    const studentOne = await clientFor(TEST_USERS.studentOne);
    const studentTwo = await clientFor(TEST_USERS.studentTwo);
    const studentTwoId = (await studentTwo.auth.getUser()).data.user?.id;
    if (!studentTwoId) throw new Error('STUDENT_TWO_ID_MISSING');

    const selected = await studentOne
      .from('profiles')
      .select('id')
      .eq('id', studentTwoId);
    expect(selected.error).toBeNull();
    expect(selected.data).toEqual([]);

    const updated = await studentOne
      .from('profiles')
      .update({ display_name: '越權修改' })
      .eq('id', studentTwoId)
      .select('id');
    expect(updated.error).toBeNull();
    expect(updated.data).toEqual([]);
  });

  it('permits an own safe-column update but denies delete and role escalation', async () => {
    const client = await clientFor(TEST_USERS.studentOne);
    const userId = (await client.auth.getUser()).data.user?.id;
    if (!userId) throw new Error('STUDENT_ONE_ID_MISSING');

    const ownUpdate = await client
      .from('profiles')
      .update({ timezone: 'Asia/Taipei' })
      .eq('id', userId)
      .select('id');
    expect(ownUpdate.error).toBeNull();
    expect(ownUpdate.data).toEqual([{ id: userId }]);

    const roleUpdate = await client
      .from('profiles')
      .update({ role: 'teacher' })
      .eq('id', userId);
    expect(roleUpdate.error).not.toBeNull();

    const deletion = await client.from('profiles').delete().eq('id', userId);
    expect(deletion.error).not.toBeNull();
  });
});
