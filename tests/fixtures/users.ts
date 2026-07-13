export const TEST_USERS = {
  teacher: {
    email: 'teacher@colorplay.test',
    password: 'LocalOnly-Teacher1!',
  },
  studentOne: {
    email: 'student.one@colorplay.test',
    password: 'LocalOnly-Student1!',
  },
  studentTwo: {
    email: 'student.two@colorplay.test',
    password: 'LocalOnly-Student2!',
  },
  outsider: {
    email: 'outsider@colorplay.test',
    password: 'LocalOnly-Outsider1!',
  },
} as const;

export type TestUserLabel = keyof typeof TEST_USERS;

export const TEST_USER_ROLES = {
  teacher: 'teacher',
  studentOne: 'student',
  studentTwo: 'student',
  outsider: 'student',
} as const satisfies Readonly<Record<TestUserLabel, 'student' | 'teacher'>>;
