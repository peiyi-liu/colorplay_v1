import { expect, test, type Page, type Response } from '@playwright/test';

import { OWN_PROFILE_SELECT } from '../../src/features/profile/api/own-profile-select';
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
    if (message.type() !== 'error') return;
    const text = message.text();
    // 導航取消字體子集下載時，firefox 會發出 console error；屬取消豁免類。
    if (
      text.includes('downloadable font: download failed') &&
      text.includes('/assets/noto-sans-tc')
    ) {
      return;
    }
    health.consoleErrors.push(text);
  });
  page.on('pageerror', (error) => {
    // webkit 會把導航取消中的本機「只讀」請求記成 access control
    // pageerror；與 browser-health 共用 helper 的豁免同類（僅 rest/v1
    // 的 select 讀取與 get_/list_ RPC，mutation 與 auth 不豁免）。
    if (
      error.message.includes('due to access control checks') &&
      /127\.0\.0\.1:54321\/rest\/v1\/(?:[a-z_]+\?select=|rpc\/(?:get_|list_))/u.test(
        error.message,
      )
    ) {
      return;
    }
    health.pageErrors.push(error.message);
  });
  page.on('requestfailed', (request) => {
    const errorText = request.failure()?.errorText ?? 'failed';
    // 頁面跳轉會取消進行中的請求；瀏覽器的取消訊號不是伺服器錯誤。
    if (/ERR_ABORTED|NS_BINDING_ABORTED|cancelled/u.test(errorText)) return;
    health.failedRequests.push(errorText);
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
  await page.getByLabel('帳號').fill(credentials.email);
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
  // 鍵清單由 OWN_PROFILE_SELECT 導出：select 欄位變更時本斷言自動同步。
  expect(Object.keys(profilePayload).sort()).toEqual(
    [...OWN_PROFILE_SELECT.split(',')].sort(),
  );
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
  await studentPage.goto('/app/profile');

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
