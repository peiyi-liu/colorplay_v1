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
import {
  attachBrowserHealth,
  declareExpectedBrowserFailure,
  expectedBrowserFailures,
  unexpectedBrowserHealth,
} from './browser-health';
import { classroomLeaderboardExpectedFailureDeclarations } from './classroom-leaderboard-expected-failures';
import {
  createClassroom,
  findClassroomIdByName,
  joinClassroomByCode,
} from './helpers/classrooms';

const challenge = CONTENT_MANIFEST.find(
  ({ questionCount }) => questionCount >= 10,
);
if (!challenge) throw new Error('CLASSROOM_LEADERBOARD_CHALLENGE_MISSING');

const classroomIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const teacherClassroomUrlPattern =
  /\/teacher\/classes\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const requiredEnvironment = (name: 'SUPABASE_ANON_KEY' | 'SUPABASE_URL') => {
  const value = process.env[name];
  if (!value) throw new Error(`CLASSROOM_LEADERBOARD_${name}_MISSING`);
  return value;
};

// 教師／學生共用登入表單（email 橋接一律導向 /app），但 app-shell.tsx 的導覽列
// 是依帳號角色（isTeacher）擇一渲染，不是依路徑：教師帳號登入後即使停在
// /app 也只會看到「教師導覽」，看不到「主要導覽」——舊版共用同一支 signIn
// 斷言「主要導覽」，對教師帳號必定逾時失敗，拆成兩支各自斷言正確的導覽列。
const signInStudent = async (
  page: Page,
  credentials: Readonly<{ email: string; password: string }>,
) => {
  await page.goto('/login');
  await page.getByRole('textbox', { name: '帳號' }).fill(credentials.email);
  await page.getByLabel('密碼').fill(credentials.password);
  await page.getByRole('button', { name: '登入' }).click();
  await expect(page).toHaveURL(/\/app$/u);
  await expect(
    page.getByRole('navigation', { name: '主要導覽' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: '色彩任務選擇大廳' }),
  ).toBeVisible();
};

const signInTeacher = async (
  page: Page,
  credentials: Readonly<{ email: string; password: string }>,
) => {
  await page.goto('/login');
  await page.getByRole('textbox', { name: '帳號' }).fill(credentials.email);
  await page.getByLabel('密碼').fill(credentials.password);
  await page.getByRole('button', { name: '登入' }).click();
  await expect(page).toHaveURL(/\/app$/u);
  await expect(
    page.getByRole('navigation', { name: '教師導覽' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: '色彩任務選擇大廳' }),
  ).toBeVisible();
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
  baseURL,
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
  if (!baseURL) {
    throw new Error('CLASSROOM_LEADERBOARD_BASE_URL_MISSING');
  }

  const teacherContext = await browser.newContext({ baseURL });
  const studentBContext = await browser.newContext({ baseURL });
  const outsiderContext = await browser.newContext({ baseURL });
  const teacherBContext = await browser.newContext({ baseURL });
  const teacherPage = await teacherContext.newPage();
  const studentBPage = await studentBContext.newPage();
  const outsiderPage = await outsiderContext.newPage();
  const teacherBPage = await teacherBContext.newPage();
  const studentAHealth = attachBrowserHealth(studentAPage);
  const outsiderHealth = attachBrowserHealth(outsiderPage);
  const teacherBHealth = attachBrowserHealth(teacherBPage);
  const trackedPages = [
    { health: studentAHealth, page: studentAPage },
    { health: attachBrowserHealth(teacherPage), page: teacherPage },
    { health: attachBrowserHealth(studentBPage), page: studentBPage },
    { health: outsiderHealth, page: outsiderPage },
    { health: teacherBHealth, page: teacherBPage },
  ];

  await signInStudent(studentAPage, TEST_USERS.studentOne);
  await studentAPage.goto('/teacher/classes');
  await expect(studentAPage).toHaveURL(/\/unauthorized$/u);
  await expect(
    studentAPage.getByRole('heading', { name: '沒有權限' }),
  ).toBeVisible();

  await signInTeacher(teacherPage, TEST_USERS.classroomRepositoryTeacher);
  await teacherPage.goto('/teacher/classes');
  const classroomName = `Phase 3 ${Date.now().toString(36)}`;
  const { joinCode: oldCode } = await createClassroom(
    teacherPage,
    classroomName,
  );
  const classroomId = await findClassroomIdByName(teacherPage, classroomName);
  if (!classroomId || !classroomIdPattern.test(classroomId)) {
    throw new Error('CLASSROOM_LEADERBOARD_CLASSROOM_ID_MISSING');
  }
  await teacherPage.goto(`/teacher/classes/${classroomId}`);
  await expect(teacherPage).toHaveURL(teacherClassroomUrlPattern);

  // 加入碼輪替＋舊碼失效驗收：教師班級頁的「輪替加入碼／確認輪替」按鈕與
  // 一次性加入碼 modal 已隨 07-27/07-30 owner 裁定移除（見
  // helpers/classrooms.ts 檔頭說明），輪替能力仍留在 repository 層
  // （classroom-repository.ts 的 rotateJoinCode——本檔 268 行已有同一模式的
  // 前例），改直接呼叫該層驗證舊碼失效、新碼可用；學生端也已無「加入班級」
  // UI 入口，改用 helpers/classrooms.ts 的 joinClassroomByCode 直接呼叫
  // join_classroom RPC。
  const rotationClient = createClient<Database>(
    requiredEnvironment('SUPABASE_URL'),
    requiredEnvironment('SUPABASE_ANON_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const rotationSignIn = await rotationClient.auth.signInWithPassword(
    TEST_USERS.classroomRepositoryTeacher,
  );
  expect(rotationSignIn.error).toBeNull();
  const rotated =
    await createClassroomRepository(rotationClient).rotateJoinCode(classroomId);
  await rotationClient.auth.signOut({ scope: 'local' });
  const newCode = rotated.joinCode;
  expect(newCode).not.toBe(oldCode);

  await expect(
    joinClassroomByCode(TEST_USERS.studentOne, oldCode),
  ).rejects.toThrow(/INVALID_CLASSROOM_CODE/u);

  await joinClassroomByCode(TEST_USERS.studentOne, newCode);
  await teacherPage.reload();
  await expect(teacherPage.getByRole('row')).toHaveCount(2);

  await signInStudent(studentBPage, TEST_USERS.studentTwo);
  await joinClassroomByCode(TEST_USERS.studentTwo, newCode);

  declareExpectedBrowserFailure(
    outsiderHealth,
    classroomLeaderboardExpectedFailureDeclarations.outsiderLeaderboard,
  );
  await signInStudent(outsiderPage, TEST_USERS.outsider);
  await outsiderPage.goto(`/app/leaderboard/${classroomId}`);
  await expect(outsiderPage.getByRole('alert')).toContainText('無法顯示排行榜');

  declareExpectedBrowserFailure(
    teacherBHealth,
    classroomLeaderboardExpectedFailureDeclarations.teacherBMembers,
  );
  await signInTeacher(teacherBPage, TEST_USERS.teacherTwo);
  await teacherBPage.goto(`/teacher/classes/${classroomId}`);
  await expect(teacherBPage.getByRole('alert')).toContainText('沒有管理權限');

  // Negative-path windows must close as soon as their denial is asserted:
  // in headed mode, later window focus/visibility churn makes TanStack Query
  // refetch their errored queries, emitting denials beyond the declared count.
  // Their health recordings stay available for the final assertions.
  await Promise.all([outsiderContext.close(), teacherBContext.close()]);

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
  // owner 0728 裁定：排行榜標題不帶班名（學生本來就只看得到自己班），見
  // classroom-leaderboard-page.tsx 的 h1，固定文案「排行榜」。
  await expect(
    studentAPage.getByRole('heading', { name: '排行榜' }),
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
  const declaredFailures = trackedPages.flatMap(({ health }) =>
    expectedBrowserFailures(health),
  );
  expect(declaredFailures).toEqual(
    Object.values(classroomLeaderboardExpectedFailureDeclarations).map(
      ({ count, status, urlPattern }) => ({
        expected_count: count,
        observed_count: count,
        status,
        url_pattern: urlPattern.source,
      }),
    ),
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
      expected_failures: declaredFailures,
      failed_requests: healthResults.flatMap((health) => health.failedRequests)
        .length,
      page_errors: healthResults.flatMap((health) => health.pageErrors).length,
      server_errors: healthResults.flatMap((health) => health.serverErrors)
        .length,
    })}\n`,
  );

  await Promise.all([teacherContext.close(), studentBContext.close()]);
});
