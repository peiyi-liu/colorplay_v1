import { expect, test, type Locator, type Page } from '@playwright/test';

import { TEST_USERS } from '../fixtures/users';
import { attachBrowserHealth, unexpectedBrowserHealth } from './browser-health';
import { readLocalProfileEnvironment } from './profile-e2e-boundary';

test.use({ screenshot: 'off', trace: 'off', video: 'off' });

const signIn = async (page: Page) => {
  await page
    .getByRole('textbox', { name: '帳號' })
    .fill(TEST_USERS.studentOne.email);
  await page.getByLabel('密碼').fill(TEST_USERS.studentOne.password);
  await page.getByRole('button', { name: '登入' }).click();
};

test('restores the session and intended route, then protects it after keyboard logout and Back', async ({
  browserName,
  page,
}) => {
  readLocalProfileEnvironment(process.env);
  const health = attachBrowserHealth(page);

  await page.goto('/app?chapter=color-theory#checkpoint');
  await expect(page).toHaveURL(/\/login$/u);
  await signIn(page);
  await expect(page).toHaveURL(/\/app\?chapter=color-theory#checkpoint$/u);
  await expect(
    page.getByRole('heading', { name: '色彩任務選擇大廳' }),
  ).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/\/app\?chapter=color-theory#checkpoint$/u);
  await expect(
    page.getByRole('heading', { name: '色彩任務選擇大廳' }),
  ).toBeVisible();

  await page.getByRole('link', { name: '個人資料' }).click();
  await expect(page).toHaveURL(/\/app\/profile$/u);
  await expect(
    page.getByRole('heading', { name: 'student.one' }),
  ).toBeVisible();

  // GameStage Shell（2026-08-01）：登出鈕收進底部 HUD 的 MENU 面板，鍵盤路
  // 徑改三段——先聚焦 MENU 鈕開面板，再聚焦登出鈕，最後於確認框送出。
  const focusViaKeyboard = async (target: Locator) => {
    if (browserName === 'firefox') {
      // macOS Firefox 預設 Tab 僅在表單控制間移動（按鈕/連結不入焦點環，
      // 與下方 webkit 需 Alt+Tab 同屬平台差異）；程式聚焦後仍以鍵盤送出。
      await target.evaluate((element) => {
        element.focus({ focusVisible: true } as FocusOptions);
      });
    } else {
      const nextFocusKey = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
      for (let index = 0; index < 25; index += 1) {
        if (
          await target.evaluate((element) => document.activeElement === element)
        ) {
          break;
        }
        await page.keyboard.press(nextFocusKey);
      }
    }
    await expect(target).toBeFocused();
    expect(
      await target.evaluate((element) => element.matches(':focus-visible')),
    ).toBe(true);
  };

  const menuButton = page.getByRole('button', { name: 'MENU' });
  await expect(menuButton).toBeVisible();
  await focusViaKeyboard(menuButton);
  await page.keyboard.press('Enter');

  const logout = page.getByRole('button', { name: '登出' });
  await expect(logout).toBeVisible();
  await focusViaKeyboard(logout);
  const logoutResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/auth/v1/logout' &&
      response.request().method() === 'POST',
  );
  await page.keyboard.press('Enter');
  const confirmLogout = page.getByRole('button', { name: '確認登出' });
  await expect(page.getByRole('dialog', { name: '確認登出' })).toBeVisible();
  await expect(page.getByRole('button', { name: '取消' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(confirmLogout).toBeFocused();
  await page.keyboard.press('Enter');
  expect((await logoutResponsePromise).status()).toBeLessThan(400);

  await expect(page).toHaveURL(/\/login$/u);
  await expect(page.getByRole('heading', { name: '登入' })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('student.one');

  await page.goBack();
  await expect(page).toHaveURL(/\/login$/u);
  await expect(page.getByRole('heading', { name: '登入' })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('student.one');
  expect(unexpectedBrowserHealth(health, browserName)).toEqual({
    consoleErrors: [],
    failedRequests: [],
    pageErrors: [],
    serverErrors: [],
  });
});
