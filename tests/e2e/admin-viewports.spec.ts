import { expect, test } from '@playwright/test';

import { TEST_USERS } from '../fixtures/users';
import {
  challengeAdmin,
  readAdminTotpSecret,
  signInAdmin,
} from './helpers/admin';

// admin-security.spec.ts 必須先跑過一次：這裡重用它留下的 adminPrimary
// TOTP secret（見 tests/e2e/helpers/admin.ts 的說明——app 用 sessionStorage
// 存 session，Playwright 的 storageState 機制抓不到，跨 spec 檔唯一能
// 重用的是綁定當下才會出現一次的 secret，之後每次都走 challenge）。
test.describe.configure({ mode: 'serial' });

const VIEWPORTS = [
  { height: 720, label: '1280x720', wide: true, width: 1280 },
  { height: 375, label: '812x375', wide: false, width: 812 },
  { height: 812, label: '375x812', wide: false, width: 375 },
] as const;

const NAV_GROUP_LABELS = [
  '總覽',
  '身分與存取',
  '資料瀏覽',
  '稽核',
  '系統健康',
] as const;

for (const viewport of VIEWPORTS) {
  test(`admin shell layout/a11y gates at ${viewport.label}`, async ({
    page,
  }) => {
    await page.setViewportSize({
      height: viewport.height,
      width: viewport.width,
    });

    const secret = await readAdminTotpSecret('adminPrimary');
    await signInAdmin(page, TEST_USERS.adminPrimary);
    // factor 已在 admin-security.spec.ts 綁定過：這裡應該直接落地 challenge，
    // 不會、也不能回到 enrollment（同一 factor 只能綁一次）。
    await expect(page).toHaveURL(/\/admin\/mfa\/challenge$/u);
    await challengeAdmin(page, secret);
    await expect(page).toHaveURL(/\/admin$/u);

    // (b) 頁面本體不水平捲動——總覽頁
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(viewport.width);

    const nav = page.locator('#admin-shell-nav');
    if (viewport.wide) {
      // ≥1024px：nav 常駐，沒有 MENU 切換鈕
      await expect(page.getByRole('button', { name: 'MENU' })).toHaveCount(0);
      await expect(nav).toBeVisible();
      for (const label of NAV_GROUP_LABELS) {
        await expect(nav.getByText(label, { exact: true })).toBeVisible();
      }
    } else {
      // (a) 小視口：MENU drawer 可開合，開啟後五群導覽皆可達
      const toggle = page.getByRole('button', { name: 'MENU' });
      await expect(toggle).toBeVisible();
      await expect(nav).toBeHidden();

      // (c) MENU 本身也是觸控目標，一併驗證 ≥44px
      const toggleBox = await toggle.boundingBox();
      expect(toggleBox?.width).toBeGreaterThanOrEqual(44);
      expect(toggleBox?.height).toBeGreaterThanOrEqual(44);

      await toggle.click();
      await expect(nav).toBeVisible();
      for (const label of NAV_GROUP_LABELS) {
        await expect(nav.getByText(label, { exact: true })).toBeVisible();
      }
      await toggle.click();
      await expect(nav).toBeHidden();
    }

    // browser 頁：不水平捲動、揭露按鈕 44px 觸控目標、reveal dialog 的
    // aria-live 狀態區存在、dialog 關閉後 focus 回到觸發鈕
    await page.goto('/admin/data/users/profiles');
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(viewport.width);

    await page.getByRole('combobox', { name: '篩選欄位' }).selectOption('role');
    await page.getByLabel('篩選值').fill('admin');
    await page.getByRole('button', { name: '套用' }).click();

    const revealButton = page
      .getByRole('button', { name: '揭露 full_name' })
      .first();
    await expect(revealButton).toBeVisible();
    const revealBox = await revealButton.boundingBox();
    expect(revealBox?.width).toBeGreaterThanOrEqual(44);
    expect(revealBox?.height).toBeGreaterThanOrEqual(44);

    await revealButton.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('揭露目的').fill('E2E 視口測試驗證揭露流程');
    await dialog.getByRole('button', { name: '揭露' }).click();

    // (d) aria-live 狀態區：揭露成功後的訊息就是 role="status"
    await expect(page.locator('[role="status"]').first()).toBeVisible();

    await dialog.getByRole('button', { name: '關閉' }).click();
    await expect(dialog).toBeHidden();
    // (e) dialog 關閉後 focus 回到觸發鈕
    await expect(revealButton).toBeFocused();
  });
}
