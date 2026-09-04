import { randomUUID } from 'node:crypto';

import {
  createClient,
  type SupabaseClient,
  type User,
} from '@supabase/supabase-js';

import type { Database } from '../../src/types/database';
import {
  TEST_USER_ACCOUNTS,
  TEST_USER_ROLES,
  TEST_USERS,
  CLASSROOM_FIXTURES,
  type TestUserLabel,
} from '../../tests/fixtures/users';
import {
  findPresentAdminFixtureEmails,
  isStrictlyLocalAdminUrl,
  readLocalAdminEnvironment,
} from './local-environment';

const fixtureLabels = [
  'authLifecycleOne',
  'authLifecycleTwo',
  'learningTeacher',
  'learningStudent',
  'sequenceStudent',
  'teacher',
  'teacherTwo',
  'classroomRepositoryTeacher',
  'classroomRepositoryStudent',
  'assignmentTeacher',
  'assignmentStudentOne',
  'assignmentStudentTwo',
  'liveHostTeacher',
  'liveStudentOne',
  'liveStudentTwo',
  'economyStudentOne',
  'economyStudentTwo',
  'inventoryStudentOne',
  'inventoryStudentTwo',
  'studentOne',
  'studentTwo',
  'contentTeacher',
  'contentStudent',
  'outsider',
  'adminPrimary',
  'adminSecondary',
] as const satisfies readonly TestUserLabel[];
// Task 14:role='admin' 只能由 svc_admin_bootstrap_identity 提升(spec §12、
// Task 15 runbook 前置條件一致)——reconcileProfileRole 對這兩個 fixture
// 完全跳過 role 欄位,role 由 reconcileAdminBootstrapFixtures 獨佔提升。
const adminBootstrapLabels = [
  'adminPrimary',
  'adminSecondary',
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

// role='admin' 只能由 svc_admin_bootstrap_identity 提升(spec §12、Task 15
// runbook 前置條件一致)，且它是冪等的:已有 identity 時直接短路回
// {outcome:'ok', idempotent:true},不會重跑 `update profiles set role='admin'`。
// 若這裡照樣把 adminBootstrapLabels 的 role 寫回 TEST_USER_ROLES 的值(僅供
// 型別使用的佔位 'teacher'),第二次執行 seed-auth.ts 就會把已提升的 admin
// 覆寫回 teacher、且 bootstrap 的冪等短路不會補救——因此這兩個 label 完全
// 跳過 role 欄位,把它交給 reconcileAdminBootstrapFixtures 獨佔。
const isAdminBootstrapLabel = (label: TestUserLabel): boolean =>
  (adminBootstrapLabels as readonly TestUserLabel[]).includes(label);

const reconcileProfileRole = async (
  admin: SupabaseClient<Database>,
  user: User,
  label: TestUserLabel,
) => {
  const skipRole = isAdminBootstrapLabel(label);
  const expectedRole = TEST_USER_ROLES[label];
  const accountFixture =
    label in TEST_USER_ACCOUNTS
      ? TEST_USER_ACCOUNTS[label as keyof typeof TEST_USER_ACCOUNTS]
      : undefined;
  // db reset 後 PostgREST schema cache 需要片刻重載；新欄位在快取重建前
  // 會回 PGRST204／權限錯誤，這裡以短暫重試消除競態。
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { data, error } = await admin
      .from('profiles')
      .update({
        ...(skipRole ? {} : { role: expectedRole }),
        ...(accountFixture
          ? {
              full_name: accountFixture.fullName,
              login_account: accountFixture.account,
            }
          : {}),
      })
      .eq('id', user.id)
      .select('id, role')
      .single();
    if (
      !error &&
      data.id === user.id &&
      (skipRole || data.role === expectedRole)
    ) {
      return;
    }
    lastError = error;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  failIfError(lastError, 'AUTH_FIXTURE_ROLE_RECONCILE_FAILED');
  throw new Error('AUTH_FIXTURE_ROLE_RECONCILE_FAILED');
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
  // classroomRepositoryStudent stays unassigned so the repository integration
  // can exercise a first join without violating ADR 0008's one-active-class rule.
  const clients = [teacherOne, teacherTwo, studentOne, studentTwo];

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

    await ensureOwnedClassroom(
      teacherTwo,
      CLASSROOM_FIXTURES.teacherTwoClassroom.name,
    );
  } finally {
    await Promise.all(
      clients.map((client) => client.auth.signOut({ scope: 'local' })),
    );
  }
};

// Task 14:svc_admin_bootstrap_identity 是 role='admin' 提升的唯一入口
// (spec §4.2、§12)——它自己會覆寫 profiles.role、建 admin_audit_principals／
// admin_security_identities 列、寫 owner_bootstrap audit。若改由
// reconcileProfileRole 直接把 role 設成 'admin'，會漏建這些列，
// /admin/mfa/enroll 之後的每個授權查詢都會落空。函式本身是 idempotent
// (已有 identity 時直接回 outcome:'ok', idempotent:true)，可安全重跑。
const reconcileAdminBootstrapFixtures = async (
  admin: SupabaseClient<Database>,
  usersByLabel: ReadonlyMap<TestUserLabel, User>,
) => {
  for (const label of adminBootstrapLabels) {
    const user = usersByLabel.get(label);
    if (!user) throw new Error('ADMIN_FIXTURE_BOOTSTRAP_USER_MISSING');
    const { data, error } = await admin.rpc('svc_admin_bootstrap_identity', {
      p_runbook_operation_id: randomUUID(),
      p_user_id: user.id,
    });
    failIfError(error, 'ADMIN_FIXTURE_BOOTSTRAP_FAILED');
    const outcome = (data as { outcome?: string } | null)?.outcome;
    if (outcome !== 'ok') throw new Error('ADMIN_FIXTURE_BOOTSTRAP_FAILED');
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
  // Admin fixtures 的風險等級跟其餘 demo teacher/student fixture 不同:
  // 提升後即持有 role='admin' 且能自行完成 TOTP enrollment。上面的
  // readLocalAdminEnvironment 對其餘 fixture 開放 SEED_REMOTE_CONFIRM
  // 例外(供 hosted rebuild 用),但 spec §12 明確排除 Admin fixture——這裡
  // 用嚴格的 loopback URL 檢查,不吃那個例外,確保 hosted rebuild 永遠不會
  // 建立/提升這兩個帳號,同時仍讓其餘 fixture 正常跑完。
  const strictlyLocal = isStrictlyLocalAdminUrl(url);
  if (!strictlyLocal) {
    // Task 14 review round 2 Finding 1(Critical):只排除「這次執行」不建立
    // /提升 admin fixture 還不夠——如果這個 hosted project 曾經被舊版腳本
    // (或任何行為相同的變體)seed 過,已知密碼的 admin 帳號、role='admin'、
    // 可自助 enroll 的 TOTP 都還在,新版腳本卻只印一句 warning 就成功結束,
    // 讓操作者誤以為環境已經安全。這裡改成 fail closed:偵測到既有 fixture
    // 就整支腳本中止,不靜默繼續、也不自動刪除——清除已污染的帳號需要
    // owner-approved 的 OOB runbook(撤銷 session/factor、移除
    // identity/account),不是一般 seed 腳本該做的事。
    const presentAdminFixtureEmails = findPresentAdminFixtureEmails(
      existingUsersByEmail,
      adminBootstrapLabels.map((label) => TEST_USERS[label].email),
    );
    if (presentAdminFixtureEmails.length > 0) {
      throw new Error(
        `ADMIN_FIXTURE_PRESENT_ON_NON_LOCAL_URL: ${presentAdminFixtureEmails.join(', ')} already exist on this non-local project — a prior seed run may have left known-password Admin fixtures live. Revoke their sessions/factors and remove the identity/account through the owner-approved OOB runbook before re-seeding.`,
      );
    }
    console.warn(
      'ADMIN_FIXTURE_SKIPPED_NON_LOCAL_URL: seeding against a confirmed remote URL — adminPrimary/adminSecondary are excluded (spec §12 local-only boundary).',
    );
  }
  const activeFixtureLabels = strictlyLocal
    ? fixtureLabels
    : fixtureLabels.filter((label) => !isAdminBootstrapLabel(label));
  const usersByLabel = new Map<TestUserLabel, User>();
  for (const label of activeFixtureLabels) {
    const user = await reconcileAuthUser(admin, existingUsersByEmail, label);
    await reconcileProfileRole(admin, user, label);
    usersByLabel.set(label, user);
  }
  if (strictlyLocal) {
    await reconcileAdminBootstrapFixtures(admin, usersByLabel);
  }

  await reconcileClassroomFixtures(url, serviceRoleKey);
};

await seedAuthUsers();
