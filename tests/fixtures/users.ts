export const TEST_USERS = {
  authLifecycleOne: {
    email: 'auth.lifecycle.one@colorplay.test',
    password: 'LocalOnly-AuthLifecycle1!',
  },
  authLifecycleTwo: {
    email: 'auth.lifecycle.two@colorplay.test',
    password: 'LocalOnly-AuthLifecycle2!',
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
  outsider: {
    email: 'outsider@colorplay.test',
    password: 'LocalOnly-Outsider1!',
  },
} as const;

export type TestUserLabel = keyof typeof TEST_USERS;

export const TEST_USER_ROLES = {
  authLifecycleOne: 'student',
  authLifecycleTwo: 'student',
  teacher: 'teacher',
  teacherTwo: 'teacher',
  classroomRepositoryTeacher: 'teacher',
  classroomRepositoryStudent: 'student',
  economyStudentOne: 'student',
  economyStudentTwo: 'student',
  inventoryStudentOne: 'student',
  inventoryStudentTwo: 'student',
  studentOne: 'student',
  studentTwo: 'student',
  outsider: 'student',
} as const satisfies Readonly<Record<TestUserLabel, 'student' | 'teacher'>>;

export const CLASSROOM_FIXTURES = {
  teacherOneClassroom: {
    name: 'Fixture Classroom One',
  },
  teacherTwoClassroom: {
    name: 'Fixture Classroom Two',
  },
} as const;
