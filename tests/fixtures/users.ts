export const TEST_USERS = {
  authLifecycleOne: {
    email: 'auth.lifecycle.one@colorplay.test',
    password: 'LocalOnly-AuthLifecycle1!',
  },
  authLifecycleTwo: {
    email: 'auth.lifecycle.two@colorplay.test',
    password: 'LocalOnly-AuthLifecycle2!',
  },
  learningTeacher: {
    email: 'learning.teacher@colorplay.test',
    password: 'LocalOnly-LearningTeacher1!',
  },
  learningStudent: {
    email: 'learning.student@colorplay.test',
    password: 'LocalOnly-LearningStudent1!',
  },
  sequenceStudent: {
    email: 'sequence.student@colorplay.test',
    password: 'LocalOnly-SequenceStudent1!',
  },
  teacher: {
    email: 'teacher@colorplay.test',
    password: 'LocalOnly-Teacher1!',
  },
  teacherTwo: {
    email: 'teacher.two@colorplay.test',
    password: 'LocalOnly-Teacher2!',
  },
  classroomRepositoryTeacher: {
    email: 'classroom.repository.teacher@colorplay.test',
    password: 'LocalOnly-ClassroomRepositoryTeacher1!',
  },
  classroomRepositoryStudent: {
    email: 'classroom.repository.student@colorplay.test',
    password: 'LocalOnly-ClassroomRepositoryStudent1!',
  },
  assignmentTeacher: {
    email: 'assignment.teacher@colorplay.test',
    password: 'LocalOnly-AssignmentTeacher1!',
  },
  assignmentStudentOne: {
    email: 'assignment.student.one@colorplay.test',
    password: 'LocalOnly-AssignmentStudent1!',
  },
  assignmentStudentTwo: {
    email: 'assignment.student.two@colorplay.test',
    password: 'LocalOnly-AssignmentStudent2!',
  },
  liveHostTeacher: {
    email: 'live.host.teacher@colorplay.test',
    password: 'LocalOnly-LiveHost1!',
  },
  liveStudentOne: {
    email: 'live.student.one@colorplay.test',
    password: 'LocalOnly-LiveStudent1!',
  },
  liveStudentTwo: {
    email: 'live.student.two@colorplay.test',
    password: 'LocalOnly-LiveStudent2!',
  },
  economyStudentOne: {
    email: 'economy.student.one@colorplay.test',
    password: 'LocalOnly-EconomyStudent1!',
  },
  economyStudentTwo: {
    email: 'economy.student.two@colorplay.test',
    password: 'LocalOnly-EconomyStudent2!',
  },
  inventoryStudentOne: {
    email: 'inventory.student.one@colorplay.test',
    password: 'LocalOnly-InventoryStudent1!',
  },
  inventoryStudentTwo: {
    email: 'inventory.student.two@colorplay.test',
    password: 'LocalOnly-InventoryStudent2!',
  },
  studentOne: {
    email: 'student.one@colorplay.test',
    password: 'LocalOnly-Student1!',
  },
  studentTwo: {
    email: 'student.two@colorplay.test',
    password: 'LocalOnly-Student2!',
  },
  contentTeacher: {
    email: 'content.gate.teacher@colorplay.test',
    password: 'LocalOnly-ContentTeacher1!',
  },
  contentStudent: {
    email: 'content.gate.student@colorplay.test',
    password: 'LocalOnly-ContentStudent1!',
  },
  outsider: {
    email: 'outsider@colorplay.test',
    password: 'LocalOnly-Outsider1!',
  },
  // Phase 1 admin security E2E(Task 14)。role 提升唯一經
  // svc_admin_bootstrap_identity,不在這裡或 seed-auth.ts 的一般路徑直接
  // 改 role——見 scripts/supabase/seed-auth.ts 的 reconcileAdminBootstrapFixtures。
  adminPrimary: {
    email: 'admin.primary@colorplay.test',
    password: 'LocalOnly-AdminPrimary1!',
  },
  adminSecondary: {
    email: 'admin.secondary@colorplay.test',
    password: 'LocalOnly-AdminSecondary1!',
  },
} as const;

export type TestUserLabel = keyof typeof TEST_USERS;

export const TEST_USER_ROLES = {
  authLifecycleOne: 'student',
  authLifecycleTwo: 'student',
  learningTeacher: 'teacher',
  learningStudent: 'student',
  sequenceStudent: 'student',
  teacher: 'teacher',
  teacherTwo: 'teacher',
  classroomRepositoryTeacher: 'teacher',
  classroomRepositoryStudent: 'student',
  assignmentTeacher: 'teacher',
  assignmentStudentOne: 'student',
  assignmentStudentTwo: 'student',
  liveHostTeacher: 'teacher',
  liveStudentOne: 'student',
  liveStudentTwo: 'student',
  economyStudentOne: 'student',
  economyStudentTwo: 'student',
  inventoryStudentOne: 'student',
  inventoryStudentTwo: 'student',
  studentOne: 'student',
  studentTwo: 'student',
  contentTeacher: 'teacher',
  contentStudent: 'student',
  outsider: 'student',
  // 'admin' 不在這個型別的值域裡:seed-auth.ts 只用 'teacher' 當中繼值,
  // 真正的 role='admin' 提升由 svc_admin_bootstrap_identity 覆寫。
  adminPrimary: 'teacher',
  adminSecondary: 'teacher',
} as const satisfies Readonly<Record<TestUserLabel, 'student' | 'teacher'>>;

export const CLASSROOM_FIXTURES = {
  teacherOneClassroom: {
    name: 'Fixture Classroom One',
  },
  teacherTwoClassroom: {
    name: 'Fixture Classroom Two',
  },
} as const;

// 帳號制認證（ADR 0003）：部分 fixture 使用者具備登入帳號（學號），
// 供帳號登入路徑的 E2E 與 staging 展示使用；其餘沿用 Email 橋接。
export const TEST_USER_ACCOUNTS = {
  studentOne: { account: 'student01', fullName: '學生 一號' },
  studentTwo: { account: 'student02', fullName: '學生 二號' },
  teacher: { account: 'teacher01', fullName: '教師 一號' },
  // Task 14:給一個已知、非空的 full_name,讓 admin browser 的 reveal E2E
  // 能斷言明文內容,而不只是「非遮罩格式」這種弱斷言。
  adminPrimary: { account: 'admin01', fullName: '管理員 一號' },
  adminSecondary: { account: 'admin02', fullName: '管理員 二號' },
} as const satisfies Partial<
  Readonly<
    Record<TestUserLabel, Readonly<{ account: string; fullName: string }>>
  >
>;
