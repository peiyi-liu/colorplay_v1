import { expect, test, type Page } from '@playwright/test';

import { TEST_USERS } from '../fixtures/users';

test.use({ screenshot: 'off', trace: 'off', video: 'off' });

type BrowserHealth = Readonly<{
  consoleErrors: string[];
  failedRequests: string[];
  httpErrors: { status: number; url: string }[];
  pageErrors: string[];
}>;

const intendedUrl = '/app?chapter=color-theory#checkpoint';
const invalidCredentials = {
  email: 'invalid.credentials@colorplay.test',
  password: 'LocalOnly-Invalid1!',
} as const;

const readLocalPublicEnvironment = () => {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error('TASK_13_LOCAL_PUBLIC_ENV_MISSING');
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('TASK_13_SERVICE_ROLE_MUST_BE_UNSET');
  }

  const parsedUrl = new URL(url);
  if (
    parsedUrl.protocol !== 'http:' ||
    parsedUrl.hostname !== '127.0.0.1' ||
    parsedUrl.port !== '54321'
  ) {
    throw new Error('TASK_13_LOCAL_PUBLIC_ENV_INVALID');
  }
};

const attachHealthCollection = (page: Page): BrowserHealth => {
  const health: BrowserHealth = {
    consoleErrors: [],
    failedRequests: [],
    httpErrors: [],
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
  page.on('pageerror', (error) => health.pageErrors.push(error.message));
  page.on('requestfailed', (request) => {
    health.failedRequests.push(request.failure()?.errorText ?? 'failed');
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      health.httpErrors.push({
        status: response.status(),
        url: response.url(),
      });
    }
  });

  return health;
};

const unexpectedHealth = (health: BrowserHealth) => ({
  consoleErrors: health.consoleErrors.filter(
    (message) =>
      !message.startsWith(
        'Failed to load resource: the server responded with a status of 400',
      ),
  ),
  failedRequests: health.failedRequests,
  httpErrors: health.httpErrors.filter(
    ({ status, url }) =>
      !(status === 400 && new URL(url).pathname === '/auth/v1/token'),
  ),
  pageErrors: health.pageErrors,
});

test('invalid credentials stay anonymous and keyboard-only valid login restores the intended route', async ({
  page,
}) => {
  readLocalPublicEnvironment();
  const health = attachHealthCollection(page);
  let passwordRequests = 0;
  await page.route('**/auth/v1/token?grant_type=password', async (route) => {
    passwordRequests += 1;
    await new Promise((resolve) => setTimeout(resolve, 250));
    await route.continue();
  });

  await page.setViewportSize({ height: 500, width: 375 });
  await page.goto(intendedUrl);
  await expect(page).toHaveURL(/\/login$/u);
  await expect(page.getByLabel('帳號')).toBeVisible();
  await expect(page.getByLabel('密碼')).toBeVisible();
  await expect(page.locator('[data-primary-action="true"]')).toHaveCount(1);

  const emailControl = page.getByLabel('帳號');
  const passwordControl = page.getByLabel('密碼');
  await expect(emailControl).toHaveAttribute('aria-invalid', 'false');
  expect((await emailControl.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  expect((await passwordControl.boundingBox())?.height).toBeGreaterThanOrEqual(
    44,
  );

  await emailControl.fill(invalidCredentials.email);
  await passwordControl.fill(invalidCredentials.password);
  await passwordControl.press('Enter');
  await expect(page.getByRole('button', { name: '登入中…' })).toBeDisabled();
  await passwordControl.press('Enter');
  await expect(page.getByRole('alert')).toHaveText('帳號或密碼不正確');
  expect(passwordRequests).toBe(1);
  await expect(page).toHaveURL(/\/login$/u);
  await expect(page.locator('body')).not.toContainText(
    invalidCredentials.email,
  );
  await expect(page.locator('body')).not.toContainText(
    'Invalid login credentials',
  );

  await page.reload();
  await expect(page.getByRole('heading', { name: '登入' })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: '跳到主要內容' })).toBeFocused();
  // 結構性斷言：skip-link 必為首個聚焦點；其後 shell 可聚焦元素數量會隨
  // phase 演進，改為有界 Tab 迴圈直到表單起點，不釘死絕對順位。
  const emailInput = page.getByLabel('帳號');
  let emailFocused = false;
  for (let tabPress = 0; tabPress < 10; tabPress += 1) {
    await page.keyboard.press('Tab');
    if (await emailInput.evaluate((el) => el === document.activeElement)) {
      emailFocused = true;
      break;
    }
  }
  expect(emailFocused).toBe(true);
  await page.keyboard.type(TEST_USERS.studentOne.email);
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('密碼')).toBeFocused();
  await page.keyboard.type(TEST_USERS.studentOne.password);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: '登入' })).toBeFocused();

  const keyboardSafeLayout = await page
    .locator('[data-interaction-group="login"]')
    .evaluate((form) => {
      const password = form.querySelector<HTMLInputElement>(
        'input[type="password"]',
      );
      const button = form.querySelector<HTMLButtonElement>(
        'button[type="submit"]',
      );
      if (!password || !button) return null;
      const passwordRect = password.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
      return {
        buttonBottom: buttonRect.bottom,
        buttonHeight: buttonRect.height,
        buttonWidth: buttonRect.width,
        passwordTop: passwordRect.top,
        viewportHeight: window.innerHeight,
      };
    });
  expect(keyboardSafeLayout).not.toBeNull();
  expect(keyboardSafeLayout?.passwordTop).toBeGreaterThanOrEqual(0);
  expect(keyboardSafeLayout?.buttonBottom).toBeLessThanOrEqual(
    keyboardSafeLayout?.viewportHeight ?? 0,
  );
  expect(keyboardSafeLayout?.buttonWidth).toBeGreaterThanOrEqual(44);
  expect(keyboardSafeLayout?.buttonHeight).toBeGreaterThanOrEqual(44);

  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(
    new RegExp('/app\\?chapter=color-theory#checkpoint$', 'u'),
  );
  await expect(
    page.getByRole('heading', { name: '色彩任務選擇大廳' }),
  ).toBeVisible();
  expect(passwordRequests).toBe(2);
  expect(unexpectedHealth(health)).toEqual({
    consoleErrors: [],
    failedRequests: [],
    httpErrors: [],
    pageErrors: [],
  });
});
