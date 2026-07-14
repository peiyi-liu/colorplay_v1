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

const signIn = async (page: Page) => {
  await page.getByLabel('Email').fill(TEST_USERS.studentOne.email);
  await page.getByLabel('密碼').fill(TEST_USERS.studentOne.password);
  await page.getByRole('button', { name: '登入' }).click();
};

test('restores the session and intended route, then protects it after keyboard logout and Back', async ({
  browserName,
  page,
}) => {
  readLocalProfileEnvironment(process.env);
  const health = attachHealthCollection(page);

  await page.goto('/app?chapter=color-theory#checkpoint');
  await expect(page).toHaveURL(/\/login$/u);
  await signIn(page);
  await expect(page).toHaveURL(/\/app\?chapter=color-theory#checkpoint$/u);
  await expect(
    page.getByRole('heading', { name: 'student.one' }),
  ).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/\/app\?chapter=color-theory#checkpoint$/u);
  await expect(
    page.getByRole('heading', { name: 'student.one' }),
  ).toBeVisible();

  await page.getByRole('link', { name: '個人資料' }).click();
  await expect(page).toHaveURL(/\/app$/u);
  await expect(
    page.getByRole('heading', { name: 'student.one' }),
  ).toBeVisible();

  const logout = page.getByRole('button', { name: '登出' });
  await expect(logout).toBeVisible();
  const nextFocusKey = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
  for (let index = 0; index < 8; index += 1) {
    if (
      await logout.evaluate((element) => document.activeElement === element)
    ) {
      break;
    }
    await page.keyboard.press(nextFocusKey);
  }
  await expect(logout).toBeFocused();
  expect(
    await logout.evaluate((element) => element.matches(':focus-visible')),
  ).toBe(true);
  const logoutResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/auth/v1/logout' &&
      response.request().method() === 'POST',
  );
  await page.keyboard.press('Enter');
  expect((await logoutResponsePromise).status()).toBeLessThan(400);

  await expect(page).toHaveURL(/\/login$/u);
  await expect(page.getByRole('heading', { name: '登入' })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('student.one');

  await page.goBack();
  await expect(page).toHaveURL(/\/login$/u);
  await expect(page.getByRole('heading', { name: '登入' })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('student.one');
  expect(unexpectedHealth(health)).toEqual({
    consoleErrors: [],
    failedRequests: [],
    pageErrors: [],
    serverErrors: [],
  });
});
