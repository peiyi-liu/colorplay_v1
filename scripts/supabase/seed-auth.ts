import { randomUUID } from 'node:crypto';

import {
  createClient,
  type SupabaseClient,
  type User,
} from '@supabase/supabase-js';

import type { Database } from '../../src/types/database';
import {
  TEST_USER_ROLES,
  TEST_USERS,
  CLASSROOM_FIXTURES,
  type TestUserLabel,
} from '../../tests/fixtures/users';
import { readLocalAdminEnvironment } from './local-environment';

const fixtureLabels = [
  'authLifecycleOne',
  'authLifecycleTwo',
  'teacher',
  'teacherTwo',
  'classroomRepositoryTeacher',
  'classroomRepositoryStudent',
  'assignmentTeacher',
  'assignmentStudentOne',
  'assignmentStudentTwo',
  'economyStudentOne',
  'economyStudentTwo',
  'inventoryStudentOne',
  'inventoryStudentTwo',
  'studentOne',
  'studentTwo',
  'outsider',
] as const satisfies readonly TestUserLabel[];
const usersPerPage = 100;
const maximumUserPages = 100;

const failIfError = (error: unknown, code: string) => {
  if (error) throw new Error(code);
};

const listAuthUsers = async (
  admin: SupabaseClient<Database>,
): Promise<readonly User[]> => {
  const users: User[] = [];

  for (let page = 1; page <= maximumUserPages; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: usersPerPage,
    });

    failIfError(error, 'AUTH_FIXTURE_LIST_FAILED');
    users.push(...data.users);

    if (data.users.length < usersPerPage) return users;
  }

  throw new Error('AUTH_FIXTURE_LIST_LIMIT_EXCEEDED');
};

const reconcileAuthUser = async (
  admin: SupabaseClient<Database>,
  existingUsersByEmail: ReadonlyMap<string, User>,
  label: TestUserLabel,
): Promise<User> => {
  const fixture = TEST_USERS[label];
  const existingUser = existingUsersByEmail.get(fixture.email);

  if (existingUser) {
    const { data, error } = await admin.auth.admin.updateUserById(
      existingUser.id,
      {
        email_confirm: true,
        password: fixture.password,
      },
    );

    failIfError(error, 'AUTH_FIXTURE_UPDATE_FAILED');
    if (!data.user) throw new Error('AUTH_FIXTURE_UPDATE_FAILED');
    return data.user;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: fixture.email,
    email_confirm: true,
    password: fixture.password,
  });

  failIfError(error, 'AUTH_FIXTURE_CREATE_FAILED');
  if (!data.user) throw new Error('AUTH_FIXTURE_CREATE_FAILED');
  return data.user;
};

const reconcileProfileRole = async (
  admin: SupabaseClient<Database>,
  user: User,
  label: TestUserLabel,
) => {
  const expectedRole = TEST_USER_ROLES[label];
  const { data, error } = await admin
    .from('profiles')
    .update({ role: expectedRole })
    .eq('id', user.id)
    .select('id, role')
    .single();

  failIfError(error, 'AUTH_FIXTURE_ROLE_RECONCILE_FAILED');
  if (data?.id !== user.id || data.role !== expectedRole) {
    throw new Error('AUTH_FIXTURE_ROLE_RECONCILE_FAILED');
  }
};

const signedInFixtureClient = async (
  url: string,
  serviceRoleKey: string,
  label: TestUserLabel,
) => {
  const client = createClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword(TEST_USERS[label]);
  failIfError(error, 'CLASSROOM_FIXTURE_SIGN_IN_FAILED');
  return client;
};

const ensureOwnedClassroom = async (
  owner: SupabaseClient<Database>,
  name: string,
) => {
  const { data: existing, error: listError } = await owner.rpc(
    'list_owned_classrooms',
  );
  failIfError(listError, 'CLASSROOM_FIXTURE_LIST_FAILED');
  const match = existing?.find(
    (classroom) => classroom.classroom_name === name,
  );
  if (match) return { classroomId: match.classroom_id, joinCode: null };

  const { data: created, error: createError } = await owner.rpc(
    'create_classroom',
    { p_name: name },
  );
  failIfError(createError, 'CLASSROOM_FIXTURE_CREATE_FAILED');
  const receipt = created?.[0];
  if (!receipt) throw new Error('CLASSROOM_FIXTURE_CREATE_FAILED');
  return {
    classroomId: receipt.classroom_id,
    joinCode: receipt.join_code,
  };
};

const ensureStudentMemberships = async (
  owner: SupabaseClient<Database>,
  classroomId: string,
  initialJoinCode: string | null,
  students: readonly SupabaseClient<Database>[],
) => {
  let joinCode = initialJoinCode;

  for (const student of students) {
    const { data: memberships, error: listError } =
      await student.rpc('list_my_classrooms');
    failIfError(listError, 'CLASSROOM_MEMBERSHIP_FIXTURE_LIST_FAILED');
    if (
      memberships?.some((membership) => membership.classroom_id === classroomId)
    ) {
      continue;
    }

    if (!joinCode) {
      const { data: rotated, error: rotateError } = await owner.rpc(
        'rotate_classroom_join_code',
        { p_classroom_id: classroomId },
      );
      failIfError(rotateError, 'CLASSROOM_FIXTURE_ROTATE_FAILED');
      joinCode = rotated?.[0]?.join_code ?? null;
    }
    if (!joinCode) throw new Error('CLASSROOM_FIXTURE_JOIN_CODE_MISSING');

    const { error: joinError } = await student.rpc('join_classroom', {
      p_join_code: joinCode,
      p_request_id: randomUUID(),
    });
    failIfError(joinError, 'CLASSROOM_MEMBERSHIP_FIXTURE_JOIN_FAILED');
  }
};

const reconcileClassroomFixtures = async (
  url: string,
  serviceRoleKey: string,
) => {
  const teacherOne = await signedInFixtureClient(
    url,
    serviceRoleKey,
    'teacher',
  );
  const teacherTwo = await signedInFixtureClient(
    url,
    serviceRoleKey,
    'teacherTwo',
  );
  const studentOne = await signedInFixtureClient(
    url,
    serviceRoleKey,
    'studentOne',
  );
  const studentTwo = await signedInFixtureClient(
    url,
    serviceRoleKey,
    'studentTwo',
  );
  const repositoryStudent = await signedInFixtureClient(
    url,
    serviceRoleKey,
    'classroomRepositoryStudent',
  );
  const clients = [
    teacherOne,
    teacherTwo,
    studentOne,
    studentTwo,
    repositoryStudent,
  ];

  try {
    const first = await ensureOwnedClassroom(
      teacherOne,
      CLASSROOM_FIXTURES.teacherOneClassroom.name,
    );
    await ensureStudentMemberships(
      teacherOne,
      first.classroomId,
      first.joinCode,
      [studentOne, studentTwo],
    );

    const second = await ensureOwnedClassroom(
      teacherTwo,
      CLASSROOM_FIXTURES.teacherTwoClassroom.name,
    );
    await ensureStudentMemberships(
      teacherTwo,
      second.classroomId,
      second.joinCode,
      [repositoryStudent],
    );
  } finally {
    await Promise.all(
      clients.map((client) => client.auth.signOut({ scope: 'local' })),
    );
  }
};

export const seedAuthUsers = async (): Promise<void> => {
  const { serviceRoleKey, url } = readLocalAdminEnvironment(process.env);
  const admin = createClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const listedUsers = await listAuthUsers(admin);
  const existingUsersByEmail = new Map(
    listedUsers.flatMap((user) =>
      user.email ? ([[user.email, user]] as const) : [],
    ),
  );
  for (const label of fixtureLabels) {
    const user = await reconcileAuthUser(admin, existingUsersByEmail, label);
    await reconcileProfileRole(admin, user, label);
  }

  await reconcileClassroomFixtures(url, serviceRoleKey);
};

await seedAuthUsers();
