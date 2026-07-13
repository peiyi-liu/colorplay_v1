import {
  createClient,
  type SupabaseClient,
  type User,
} from '@supabase/supabase-js';

import type { Database } from '../../src/types/database';
import {
  TEST_USER_ROLES,
  TEST_USERS,
  type TestUserLabel,
} from '../../tests/fixtures/users';
import { readLocalAdminEnvironment } from './local-environment';

const fixtureLabels = [
  'teacher',
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
};

await seedAuthUsers();
