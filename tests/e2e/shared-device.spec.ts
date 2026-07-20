import { expect, test, type Page } from '@playwright/test';

import { TEST_USERS } from '../fixtures/users';
import { attachBrowserHealth, unexpectedBrowserHealth } from './browser-health';
import { readLocalProfileEnvironment } from './profile-e2e-boundary';

test.use({ screenshot: 'off', trace: 'off', video: 'off' });

const signIn = async (
  page: Page,
  credentials: (typeof TEST_USERS)['studentOne' | 'studentTwo'],
) => {
  await page.getByLabel('帳號').fill(credentials.email);
  await page.getByLabel('密碼').fill(credentials.password);
  await page.getByRole('button', { name: '登入' }).click();
};

test('isolates two accounts that use the same browser page in sequence', async ({
  browserName,
  page,
}) => {
  readLocalProfileEnvironment(process.env);
  const health = attachBrowserHealth(page);

  await page.goto('/login');
  await signIn(page, TEST_USERS.studentOne);
  await expect(
    page.getByRole('heading', { name: '色彩任務選擇大廳' }),
  ).toBeVisible();
  await page.getByRole('link', { name: '個人資料' }).click();
  await expect(
    page.getByRole('heading', { name: 'student.one' }),
  ).toBeVisible();

  const logoutResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/auth/v1/logout' &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '登出' }).click();
  expect((await logoutResponsePromise).status()).toBeLessThan(400);
  await expect(page).toHaveURL(/\/login$/u);
  await expect(page.locator('body')).not.toContainText('student.one');
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).some((key) =>
        /student\.one|student\.one@colorplay\.test/u.test(
          localStorage.getItem(key) ?? '',
        ),
      ),
    ),
  ).toBe(false);

  await page.evaluate(() => {
    const runtimeWindow = window as Window & {
      __studentOneObservedAfterLogout?: boolean;
    };
    runtimeWindow.__studentOneObservedAfterLogout = false;
    const observer = new MutationObserver(() => {
      if (document.body.textContent?.includes('student.one')) {
        runtimeWindow.__studentOneObservedAfterLogout = true;
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });

  await signIn(page, TEST_USERS.studentTwo);
  await page.getByRole('link', { name: '個人資料' }).click();
  await expect(
    page.getByRole('heading', { name: 'student.two' }),
  ).toBeVisible();
  await expect(page.locator('body')).not.toContainText('student.one');
  expect(
    await page.evaluate(
      () =>
        (
          window as Window & {
            __studentOneObservedAfterLogout?: boolean;
          }
        ).__studentOneObservedAfterLogout,
    ),
  ).toBe(false);
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).some((key) =>
        /student\.one|student\.one@colorplay\.test/u.test(
          localStorage.getItem(key) ?? '',
        ),
      ),
    ),
  ).toBe(false);
  expect(unexpectedBrowserHealth(health, browserName)).toEqual({
    consoleErrors: [],
    failedRequests: [],
    pageErrors: [],
    serverErrors: [],
  });
});
