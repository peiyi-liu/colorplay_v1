import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';

import { createClassroomRepository } from '../../src/features/classrooms/api/classroom-repository';
import { createLeaderboardRepository } from '../../src/features/leaderboard/api/leaderboard-repository';
import type { Database } from '../../src/types/database';
import { CONTENT_MANIFEST } from '../fixtures/content-manifest.generated';
import { GENERATED_CORRECT_ANSWERS } from '../fixtures/question-answers.generated';
import { TEST_USERS } from '../fixtures/users';
import { attachBrowserHealth, unexpectedBrowserHealth } from './browser-health';

const challenge = CONTENT_MANIFEST.find(
  ({ questionCount }) => questionCount >= 10,
);
if (!challenge) throw new Error('CLASSROOM_LEADERBOARD_CHALLENGE_MISSING');

const requiredEnvironment = (name: 'SUPABASE_ANON_KEY' | 'SUPABASE_URL') => {
  const value = process.env[name];
  if (!value) throw new Error(`CLASSROOM_LEADERBOARD_${name}_MISSING`);
  return value;
};

const signIn = async (
  page: Page,
  credentials: Readonly<{ email: string; password: string }>,
) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(credentials.email);
  await page.getByLabel('密碼').fill(credentials.password);
  await page.getByRole('button', { name: '登入' }).click();
  await expect(page).toHaveURL(/\/app$/u);
};

const completeQuiz = async (page: Page) => {
  await page.goto('/app');
  await page
    .locator(`a[href="/app/quiz/new?template=${challenge.templateId}"]`)
    .click();
  for (let position = 1; position <= 10; position += 1) {
    await expect(page.getByLabel('挑戰進度')).toContainText(
      `第 ${String(position)} / 10 題`,
    );
    const prompt = await page.locator('.question-card legend').innerText();
    const answer = GENERATED_CORRECT_ANSWERS.get(prompt);
    if (!answer) throw new Error('CLASSROOM_LEADERBOARD_ANSWER_MISSING');
    await page.getByRole('radio', { name: answer }).check();
    await page.getByRole('button', { name: '送出答案' }).click();
    await expect(page.getByRole('heading', { name: '✓ 答對了' })).toBeVisible();
    await page
      .getByRole('button', {
        name: position === 10 ? '結算並查看結果' : '我理解了，下一題',
      })
      .click();
  }
  await expect(page.getByRole('heading', { name: '挑戰完成' })).toBeVisible();
};

test('Classroom and Leaderboard v2 phase gate', async ({
  browser,
  browserName,
  page: studentAPage,
}, testInfo) => {
  if (process.env.PLAYWRIGHT_ACCEPTANCE !== 'on') {
    throw new Error('CLASSROOM_LEADERBOARD_ACCEPTANCE_MODE_REQUIRED');
  }
  const evidenceRoot = process.env.PLAYWRIGHT_EVIDENCE_ROOT;
  if (!evidenceRoot) {
    throw new Error('CLASSROOM_LEADERBOARD_EVIDENCE_ROOT_MISSING');
  }

  const teacherContext = await browser.newContext();
  const studentBContext = await browser.newContext();
  const outsiderContext = await browser.newContext();
  const teacherBContext = await browser.newContext();
  const teacherPage = await teacherContext.newPage();
  const studentBPage = await studentBContext.newPage();
  const outsiderPage = await outsiderContext.newPage();
  const teacherBPage = await teacherBContext.newPage();
  const trackedPages = [
    { health: attachBrowserHealth(studentAPage), page: studentAPage },
    { health: attachBrowserHealth(teacherPage), page: teacherPage },
    { health: attachBrowserHealth(studentBPage), page: studentBPage },
    { health: attachBrowserHealth(outsiderPage), page: outsiderPage },
    { health: attachBrowserHealth(teacherBPage), page: teacherBPage },
  ];

  await signIn(studentAPage, TEST_USERS.studentOne);
  await studentAPage.goto('/teacher/classes');
  await expect(studentAPage).toHaveURL(/\/unauthorized$/u);
  await expect(
    studentAPage.getByRole('heading', { name: '沒有權限' }),
  ).toBeVisible();

  await signIn(teacherPage, TEST_USERS.classroomRepositoryTeacher);
  await teacherPage.goto('/teacher/classes');
  const classroomName = `Phase 3 ${Date.now().toString(36)}`;
  await teacherPage
    .getByRole('textbox', { name: '班級名稱' })
    .fill(classroomName);
  await teacherPage.getByRole('button', { name: '建立班級' }).click();
  const createReceipt = teacherPage.getByLabel('一次性班級加入碼');
  await expect(createReceipt).toBeVisible();
  const oldCode = (await createReceipt.locator('strong').innerText()).trim();
  await teacherPage.getByRole('link', { name: '管理班級' }).click();
  const classroomId = new URL(teacherPage.url()).pathname.split('/').at(-1);
  if (!classroomId)
    throw new Error('CLASSROOM_LEADERBOARD_CLASSROOM_ID_MISSING');
  await teacherPage.getByRole('button', { name: '輪替加入碼' }).click();
  await expect(teacherPage.getByRole('dialog')).toContainText(
    '舊加入碼會立即失效',
  );
  await teacherPage.getByRole('button', { name: '確認輪替' }).click();
  const rotateReceipt = teacherPage.getByLabel('一次性班級加入碼');
  await expect(rotateReceipt).toBeVisible();
  const newCode = (await rotateReceipt.locator('strong').innerText()).trim();
  expect(newCode).not.toBe(oldCode);

  await studentAPage.goto(`/join/${oldCode}`);
  await studentAPage.getByRole('button', { name: '加入班級' }).click();
  await expect(studentAPage.getByRole('alert')).toContainText(
    '加入碼無效或已失效',
  );
  const joinCodeInput = studentAPage.getByRole('textbox', {
    name: '班級加入碼',
  });
  await joinCodeInput.fill(newCode);
  await studentAPage.setViewportSize({ width: 375, height: 812 });
  await studentAPage.screenshot({
    fullPage: true,
    path: testInfo.outputPath('classroom-join-375x812.png'),
  });
  await studentAPage.getByRole('button', { name: '加入班級' }).dblclick();
  await expect(studentAPage).toHaveURL(
    new RegExp(`/app/leaderboard/${classroomId}$`, 'u'),
  );

  await signIn(studentBPage, TEST_USERS.studentTwo);
  await studentBPage.goto(`/join/${newCode}`);
  await studentBPage.getByRole('button', { name: '加入班級' }).click();
  await expect(studentBPage).toHaveURL(
    new RegExp(`/app/leaderboard/${classroomId}$`, 'u'),
  );

  await signIn(outsiderPage, TEST_USERS.outsider);
  await outsiderPage.goto(`/app/leaderboard/${classroomId}`);
  await expect(outsiderPage.getByRole('alert')).toContainText('無法顯示排行榜');

  await signIn(teacherBPage, TEST_USERS.teacherTwo);
  await teacherBPage.goto(`/teacher/classes/${classroomId}`);
  await expect(teacherBPage.getByRole('alert')).toContainText('沒有管理權限');

  await completeQuiz(studentAPage);
  await completeQuiz(studentBPage);

  const studentClient = createClient<Database>(
    requiredEnvironment('SUPABASE_URL'),
    requiredEnvironment('SUPABASE_ANON_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const studentSignIn = await studentClient.auth.signInWithPassword(
    TEST_USERS.studentOne,
  );
  expect(studentSignIn.error).toBeNull();
  const authoritative =
    await createLeaderboardRepository(studentClient).getClassroomLeaderboard(
      classroomId,
    );

  await studentAPage.goto(`/app/leaderboard/${classroomId}`);
  await expect(
    studentAPage.getByRole('heading', { name: `${classroomName}排行榜` }),
  ).toBeVisible({ timeout: 5_000 });
  const rows = studentAPage
    .getByRole('table', { name: `${classroomName} Top 10` })
    .getByRole('row');
  await expect(rows).toHaveCount(authoritative.topEntries.length + 1, {
    timeout: 5_000,
  });
  for (const [index, entry] of authoritative.topEntries.entries()) {
    const row = rows.nth(index + 1);
    await expect(row).toContainText(`第 ${String(entry.rank)} 名`);
    await expect(row).toContainText(entry.displayName);
    await expect(row).toContainText(`${String(entry.totalXp)} XP`);
  }
  await expect(studentAPage.getByText('這是你')).toBeVisible();
  await expect(studentAPage.locator('body')).not.toContainText(
    TEST_USERS.studentOne.email,
  );
  await expect(studentAPage.locator('body')).not.toContainText(
    TEST_USERS.studentTwo.email,
  );
  const studentUserId = studentSignIn.data.user?.id;
  if (!studentUserId) throw new Error('CLASSROOM_LEADERBOARD_USER_ID_MISSING');
  await expect(studentAPage.locator('body')).not.toContainText(studentUserId);
  await studentAPage.setViewportSize({ width: 768, height: 1024 });
  await studentAPage.screenshot({
    fullPage: true,
    path: testInfo.outputPath('classroom-leaderboard-768x1024.png'),
  });

  await teacherPage.goto(`/teacher/classes/${classroomId}`);
  await expect(teacherPage.getByText('student.one')).toBeVisible();
  await expect(teacherPage.getByText('student.two')).toBeVisible();
  await expect(teacherPage.getByRole('row')).toHaveCount(3);
  await teacherPage.setViewportSize({ width: 1440, height: 900 });
  await teacherPage.screenshot({
    fullPage: true,
    path: testInfo.outputPath('classroom-teacher-management-1440x900.png'),
  });

  const teacherClient = createClient<Database>(
    requiredEnvironment('SUPABASE_URL'),
    requiredEnvironment('SUPABASE_ANON_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const teacherSignIn = await teacherClient.auth.signInWithPassword(
    TEST_USERS.classroomRepositoryTeacher,
  );
  expect(teacherSignIn.error).toBeNull();
  await createClassroomRepository(teacherClient).rotateJoinCode(classroomId);
  await teacherClient.auth.signOut({ scope: 'local' });
  await studentClient.auth.signOut({ scope: 'local' });

  const healthResults = trackedPages.map(({ health }) =>
    unexpectedBrowserHealth(health, browserName),
  );
  for (const health of healthResults) {
    expect(health).toEqual({
      consoleErrors: [],
      failedRequests: [],
      pageErrors: [],
      serverErrors: [],
    });
  }
  await mkdir(join(evidenceRoot, 'reports'), { recursive: true });
  await writeFile(
    join(evidenceRoot, 'reports/browser-health.json'),
    `${JSON.stringify({
      console_errors: healthResults.flatMap((health) => health.consoleErrors)
        .length,
      failed_requests: healthResults.flatMap((health) => health.failedRequests)
        .length,
      page_errors: healthResults.flatMap((health) => health.pageErrors).length,
      server_errors: healthResults.flatMap((health) => health.serverErrors)
        .length,
    })}\n`,
  );

  await Promise.all([
    teacherContext.close(),
    studentBContext.close(),
    outsiderContext.close(),
    teacherBContext.close(),
  ]);
});
