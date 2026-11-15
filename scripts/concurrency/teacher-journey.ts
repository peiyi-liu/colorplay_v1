import { expect, type Page } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../src/types/database';
import {
  createClassroomRepository,
  ClassroomRepositoryError,
} from '../../src/features/classrooms/api/classroom-repository';
import { createTeacherContentRepository } from '../../src/features/teacher-content/api/teacher-content-repository';
import { loginFunctionalPage, pageClient } from './auth-journey';
import {
  requireFunctionalReady,
  type FunctionalSecrets,
} from './local-runtime';
import type { FunctionalIdentity } from './owned-fixtures';
import type { PrivateJournal } from './private-journal';
import { assertFunctionalDenied } from './student-authorization';
import { fail, safely, type FunctionalScope } from './config';

interface CreatedTeacherClass {
  classroomId: string;
  classroomName: string;
}
export const createTeacherClassThroughUi = async (
  scope: FunctionalScope,
  journal: PrivateJournal,
  actions: {
    create(name: string): Promise<void>;
    owned(): Promise<readonly CreatedTeacherClass[]>;
    assertOneCard(name: string): Promise<void>;
  },
) => {
  requireFunctionalReady(scope);
  const name = `全站UI班 ${scope.runId}`;
  await journal.write('teacher-c3-intent', {
    name,
    method: 'TEACHER_UI',
    retention: 'RETAINED',
  });
  try {
    if ((await actions.owned()).some((row) => row.classroomName === name))
      return fail('FUNCTIONAL_OWNERSHIP_INVALID');
    await actions.create(name);
    await actions.assertOneCard(name);
    const rows = (await actions.owned()).filter(
      (row) => row.classroomName === name,
    );
    if (rows.length !== 1 || !rows[0])
      return fail('FUNCTIONAL_OPERATION_FAILED');
    await journal.write('teacher-c3-confirmed', {
      classroomId: rows[0].classroomId,
      name,
    });
    return rows[0];
  } catch {
    await journal.write('teacher-c3-unknown', {
      name,
      result: 'UNKNOWN_RETAINED_NO_RETRY',
    });
    return fail('FUNCTIONAL_OPERATION_FAILED');
  }
};
export const teacherCrossTenantDenials = async (
  t1: SupabaseClient<Database>,
  t2: SupabaseClient<Database>,
  r1: SupabaseClient<Database>,
  c1: string,
  c2: string,
  s1MemberRef: string,
) =>
  safely(async () => {
    const denied = (error: unknown) =>
      error instanceof ClassroomRepositoryError &&
      error.code === 'NOT_AVAILABLE';
    await assertFunctionalDenied(
      () => createClassroomRepository(t2).getOwnedMembers(c1),
      denied,
    );
    await assertFunctionalDenied(
      () => createClassroomRepository(t1).getOwnedMembers(c2),
      denied,
    );
    await assertFunctionalDenied(
      () => createClassroomRepository(r1).getOwnedMembers(c1),
      denied,
    );
    await assertFunctionalDenied(
      () => createClassroomRepository(t2).getStudentProgress(c1, s1MemberRef),
      denied,
    );
    return {
      ownerIsolation: true,
      outsiderTeacherReadDenied: true,
      memberRefIsolation: true,
    };
  });
export const runTeacherReadJourney = async (
  page: Page,
  scope: FunctionalScope,
  secrets: FunctionalSecrets,
  signal: AbortSignal,
  journal: PrivateJournal,
  teacher: FunctionalIdentity,
  student: FunctionalIdentity,
  classroomId: string,
) =>
  safely(async () => {
    if (teacher.label !== 'T1' || !teacher.userId || student.label !== 'S1')
      return fail('FUNCTIONAL_SCOPE_INVALID');
    await loginFunctionalPage(page, teacher);
    const client = await pageClient(page, scope, secrets, signal, teacher);
    const repository = createClassroomRepository(client);
    const c3 = await createTeacherClassThroughUi(scope, journal, {
      create: async (name) => {
        await page.goto('/teacher/classes');
        await page
          .getByRole('textbox', { name: '新班級名稱', exact: true })
          .fill(name);
        await page
          .getByRole('button', { name: '建立班級', exact: true })
          .click();
      },
      owned: () => repository.listOwned(),
      assertOneCard: async (name) => {
        await expect(
          page
            .locator('ul[aria-label="教師班級列表"] li article')
            .filter({ has: page.getByRole('heading', { name, exact: true }) }),
        ).toHaveCount(1);
      },
    });
    const members = await repository.getOwnedMembers(classroomId);
    const member = members.find(
      (row) =>
        row.loginAccount === student.account &&
        row.displayName === student.displayName,
    );
    if (members.length !== 2 || !member)
      return fail('FUNCTIONAL_OPERATION_FAILED');
    await page.goto(`/teacher/classes/${classroomId}`);
    await expect(
      page.getByRole('heading', { name: '班級成員', exact: true }),
    ).toBeVisible();
    const row = page.getByRole('row').filter({ hasText: student.account });
    await row.getByRole('link', { name: '查看細節 ›', exact: true }).click();
    const progress = await repository.getStudentProgress(
      classroomId,
      member.memberRef,
    );
    if (
      progress.stats.classXp <= 0 ||
      !progress.chapters.some(
        (chapter) =>
          chapter.reviewCompleted > 0 && chapter.assessmentAccuracy !== null,
      )
    )
      return fail('FUNCTIONAL_OPERATION_FAILED');
    await expect(
      page.getByRole('heading', { name: '各章節學習進度', exact: true }),
    ).toBeVisible();
    const analytics = createTeacherContentRepository(client);
    const overview = await analytics.getClassroomOverview(classroomId, {});
    const questions = await analytics.getAssessmentQuestions(
      classroomId,
      {},
      'chapter_quiz',
    );
    if (overview?.totalStudents !== 2 || !questions.length)
      return fail('FUNCTIONAL_OPERATION_FAILED');
    await page.goto(`/teacher?classroomId=${classroomId}`);
    await expect(
      page.getByRole('heading', { name: '教學分析', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('group', { name: '題目來源' })
      .getByRole('button', { name: '章節總測驗', exact: true })
      .click();
    await page.goto(`/teacher/questions?classroomId=${classroomId}`);
    await expect(
      page.getByRole('heading', { name: '題目分析', exact: true }),
    ).toBeVisible();
    return {
      client,
      c3,
      s1MemberRef: member.memberRef,
      evidence: {
        uiClassroomCreated: true,
        memberCount: members.length,
        studentProgress: true,
        assessmentQuestionCount: questions.length,
        analytics: true,
        questionPage: true,
      },
    };
  });
