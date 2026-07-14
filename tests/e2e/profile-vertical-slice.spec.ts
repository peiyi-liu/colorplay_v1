import { expect, test, type Page, type Response } from '@playwright/test';

import { TEST_USERS } from '../fixtures/users';
import {
  isLocalOwnProfileResponseUrl,
  readLocalProfileEnvironment,
} from './profile-e2e-boundary';

test.use({ screenshot: 'off', trace: 'off', video: 'off' });

type BrowserHealth = Readonly<{
  consoleErrors: string[];
  failedRequests: string[];
  pageErrors: string[];
}>;

const attachHealthCollection = (page: Page): BrowserHealth => {
  const health: BrowserHealth = {
    consoleErrors: [],
    failedRequests: [],
    pageErrors: [],
  };

  page.on('console', (message) => {
    if (message.type() === 'error') health.consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => health.pageErrors.push(error.message));
  page.on('requestfailed', (request) => {
    health.failedRequests.push(request.failure()?.errorText ?? 'failed');
  });

  return health;
};

const isOwnProfileResponse = (response: Response) => {
  return isLocalOwnProfileResponseUrl(response.url());
};

const signInAndReadProfile = async (
  page: Page,
  credentials: (typeof TEST_USERS)[keyof typeof TEST_USERS],
) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(credentials.email);
  await page.getByLabel('密碼').fill(credentials.password);

  const responsePromise = page.waitForResponse(isOwnProfileResponse);
  await page.getByRole('button', { name: '登入' }).click();
  const profileResponse = await responsePromise;
  expect(profileResponse.status()).toBe(200);

  const payload: unknown = await profileResponse.json();
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('TASK_14_PROFILE_PAYLOAD_INVALID');
  }
  const profilePayload = payload as Record<string, unknown>;
  expect(typeof profilePayload.display_name).toBe('string');
  expect(typeof profilePayload.id).toBe('string');
  expect(profilePayload.role).toMatch(/^(student|teacher|admin)$/u);
  expect(profilePayload.timezone).toBe('Asia/Taipei');
  expect(Object.keys(profilePayload).sort()).toEqual([
    'display_name',
    'id',
    'role',
    'timezone',
  ]);
  return profilePayload as Readonly<{
    display_name: string;
    id: string;
    role: 'student' | 'teacher' | 'admin';
    timezone: string;
  }>;
};

test('renders only the real safe profile and derives role navigation from PostgreSQL', async ({
  browser,
}, testInfo) => {
  readLocalProfileEnvironment(process.env);
  const baseURL = testInfo.project.use.baseURL;
  if (typeof baseURL !== 'string') throw new Error('TASK_14_BASE_URL_MISSING');

  const studentContext = await browser.newContext({ baseURL });
  const studentPage = await studentContext.newPage();
  const studentHealth = attachHealthCollection(studentPage);
  await studentPage.goto('/login');
  await studentPage.evaluate(() => {
    localStorage.setItem('colorplay-role', 'teacher');
  });
  const studentProfile = await signInAndReadProfile(
    studentPage,
    TEST_USERS.studentOne,
  );

  expect(studentProfile).toMatchObject({
    display_name: 'student.one',
    role: 'student',
  });
  await expect(
    studentPage.getByRole('heading', { name: 'student.one' }),
  ).toBeVisible();
  await expect(studentPage.getByText('角色：學生')).toBeVisible();
  await expect(studentPage.locator('body')).not.toContainText(
    TEST_USERS.studentOne.email,
  );
  await expect(
    studentPage.getByRole('link', { name: '教師工作區' }),
  ).toHaveCount(0);

  await studentPage.goto('/teacher');
  await expect(studentPage).toHaveURL(/\/unauthorized$/u);
  await expect(
    studentPage.getByRole('heading', { name: '沒有權限' }),
  ).toBeVisible();
  expect(studentHealth).toEqual({
    consoleErrors: [],
    failedRequests: [],
    pageErrors: [],
  });
  await studentContext.close();

  const teacherContext = await browser.newContext({ baseURL });
  const teacherPage = await teacherContext.newPage();
  const teacherHealth = attachHealthCollection(teacherPage);
  const teacherProfile = await signInAndReadProfile(
    teacherPage,
    TEST_USERS.teacher,
  );

  expect(teacherProfile).toMatchObject({
    display_name: 'teacher',
    role: 'teacher',
  });
  await teacherPage.getByRole('link', { name: '教師工作區' }).click();
  await expect(teacherPage).toHaveURL(/\/teacher$/u);
  await expect(
    teacherPage.getByRole('heading', { name: '教師工作區' }),
  ).toBeVisible();
  await expect(teacherPage.locator('body')).not.toContainText(
    TEST_USERS.teacher.email,
  );
  expect(teacherHealth).toEqual({
    consoleErrors: [],
    failedRequests: [],
    pageErrors: [],
  });
  await teacherContext.close();
});
