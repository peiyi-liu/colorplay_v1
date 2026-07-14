import { expect, test, type Page } from '@playwright/test';

import { TEST_USERS } from '../fixtures/users';
import { readLocalProfileEnvironment } from './profile-e2e-boundary';

test.use({ screenshot: 'off', trace: 'off', video: 'off' });

type BrowserHealth = Readonly<{
  consoleErrors: string[];
  failedRequests: string[];
  pageErrors: string[];
  serverErrors: string[];
}>;

const attachHealthCollection = (page: Page): BrowserHealth => {
  const health: BrowserHealth = {
    consoleErrors: [],
    failedRequests: [],
    pageErrors: [],
    serverErrors: [],
  };

  page.on('console', (message) => {
    if (message.type() === 'error') health.consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => health.pageErrors.push(error.message));
  page.on('requestfailed', (request) => {
    health.failedRequests.push(
      `${request.failure()?.errorText ?? 'failed'} ${request.url()}`,
    );
  });
  page.on('response', (response) => {
    if (response.status() >= 500) health.serverErrors.push(response.url());
  });

  return health;
};

const unexpectedHealth = (health: BrowserHealth): BrowserHealth => ({
  ...health,
  failedRequests: health.failedRequests.filter(
    (failure) =>
      failure !==
      'net::ERR_ABORTED http://127.0.0.1:54321/auth/v1/logout?scope=local',
  ),
});

const signIn = async (
  page: Page,
  credentials: (typeof TEST_USERS)['studentOne' | 'studentTwo'],
) => {
  await page.getByLabel('Email').fill(credentials.email);
  await page.getByLabel('密碼').fill(credentials.password);
  await page.getByRole('button', { name: '登入' }).click();
};

test('isolates two accounts that use the same browser page in sequence', async ({
  page,
}) => {
  readLocalProfileEnvironment(process.env);
  const health = attachHealthCollection(page);

  await page.goto('/login');
  await signIn(page, TEST_USERS.studentOne);
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
  expect(unexpectedHealth(health)).toEqual({
    consoleErrors: [],
    failedRequests: [],
    pageErrors: [],
    serverErrors: [],
  });
});
