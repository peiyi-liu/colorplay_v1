import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, describe, expect, it } from 'vitest';

import type { Database } from '../../src/types/database';
import { CLASSROOM_FIXTURES, TEST_USERS } from '../fixtures/users';

const clients: SupabaseClient<Database>[] = [];

const localEnvironment = () => {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error('LOCAL_PUBLIC_ENV_MISSING');
  return { anonKey, url };
};

const signedInClient = async (
  fixture: (typeof TEST_USERS)[keyof typeof TEST_USERS],
) => {
  const { anonKey, url } = localEnvironment();
  const client = createClient<Database>(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword(fixture);
  if (error) throw error;
  clients.push(client);
  return client;
};

afterAll(async () => {
  await Promise.all(
    clients.map((client) => client.auth.signOut({ scope: 'local' })),
  );
});

describe('classroom seed fixtures', () => {
  it('creates two owner-separated classrooms and scoped memberships', async () => {
    const teacherOne = await signedInClient(TEST_USERS.teacher);
    const teacherTwo = await signedInClient(TEST_USERS.teacherTwo);
    const studentOne = await signedInClient(TEST_USERS.studentOne);
    const outsider = await signedInClient(TEST_USERS.outsider);

    const [
      teacherOneClasses,
      teacherTwoClasses,
      studentClasses,
      outsiderClasses,
    ] = await Promise.all([
      teacherOne.rpc('list_owned_classrooms'),
      teacherTwo.rpc('list_owned_classrooms'),
      studentOne.rpc('list_my_classrooms'),
      outsider.rpc('list_my_classrooms'),
    ]);

    expect(teacherOneClasses.error).toBeNull();
    expect(teacherTwoClasses.error).toBeNull();
    expect(studentClasses.error).toBeNull();
    expect(outsiderClasses.error).toBeNull();
    const teacherOneClassroom = teacherOneClasses.data?.find(
      ({ classroom_name }) =>
        classroom_name === CLASSROOM_FIXTURES.teacherOneClassroom.name,
    );
    const teacherTwoClassroom = teacherTwoClasses.data?.find(
      ({ classroom_name }) =>
        classroom_name === CLASSROOM_FIXTURES.teacherTwoClassroom.name,
    );
    expect(teacherOneClassroom).toBeDefined();
    expect(teacherTwoClassroom).toBeDefined();
    expect(teacherOneClassroom?.classroom_id).not.toBe(
      teacherTwoClassroom?.classroom_id,
    );
    expect(teacherOneClasses.data).not.toContainEqual(teacherTwoClassroom);
    expect(
      studentClasses.data?.map(({ classroom_id }) => classroom_id),
    ).toContain(teacherOneClassroom?.classroom_id);
    expect(outsiderClasses.data).toEqual([]);
  });

  it('seeds at least two active students and does not expose a join hash', async () => {
    const teacher = await signedInClient(TEST_USERS.teacher);
    const { data: classrooms, error: classroomsError } = await teacher.rpc(
      'list_owned_classrooms',
    );
    const classroom = classrooms?.find(
      ({ classroom_name }) =>
        classroom_name === CLASSROOM_FIXTURES.teacherOneClassroom.name,
    );
    expect(classroomsError).toBeNull();
    expect(classroom).toBeDefined();
    if (!classroom) throw new Error('CLASSROOM_FIXTURE_MISSING');
    const { data: members, error: membersError } = await teacher.rpc(
      'list_owned_classroom_members',
      { p_classroom_id: classroom.classroom_id },
    );
    const { data: hashes, error: hashError } = await teacher
      .from('classrooms')
      .select('join_code_hash')
      .eq('id', classroom.classroom_id);

    expect(membersError).toBeNull();
    expect(
      members?.filter(
        ({ membership_status }) => membership_status === 'active',
      ),
    ).toHaveLength(2);
    expect(hashError).not.toBeNull();
    expect(hashes).toBeNull();
  });
});
