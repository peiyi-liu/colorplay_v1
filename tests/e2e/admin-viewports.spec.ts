import { expect, test } from '@playwright/test';

import { TEST_USERS } from '../fixtures/users';
import { challengeAdmin, readAdminTotpSecret } from './helpers/admin';

async function signInAdmin(
  page: import('@playwright/test').Page,
  credentials: Readonly<{ email: string; password: string }>,
) {
  await page.goto('/login');
  await page.getByText('教師端登入').click();
  await page.getByRole('textbox', { name: '帳號' }).fill(credentials.email);
  await page.getByLabel('密碼', { exact: true }).fill(credentials.password);
  await page.getByRole('button', { name: '登入' }).click();
  await page.waitForURL(/\/admin/u);
}

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
  '日常營運',
  '身分與存取',
  '資料查核',
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
      await expect(page.getByRole('button', { name: '開啟導覽' })).toHaveCount(0);
      await expect(nav).toBeVisible();
      for (const label of NAV_GROUP_LABELS) {
        await expect(
          nav.locator('.admin-shell__group-label').filter({ hasText: label }),
        ).toHaveText(label);
      }
    } else {
      // (a) 小視口：MENU drawer 可開合，開啟後五群導覽皆可達
      const toggle = page.getByRole('button', { name: '開啟導覽' });
      await expect(toggle).toBeVisible();
      await expect(nav).toBeHidden();

      // (c) MENU 本身也是觸控目標，一併驗證 ≥44px
      const toggleBox = await toggle.boundingBox();
      expect(toggleBox?.width).toBeGreaterThanOrEqual(44);
      expect(toggleBox?.height).toBeGreaterThanOrEqual(44);

      await toggle.click();
      await expect(nav).toBeVisible();
      for (const label of NAV_GROUP_LABELS) {
        await expect(
          nav.locator('.admin-shell__group-label').filter({ hasText: label }),
        ).toHaveText(label);
      }
      await toggle.click();
      await expect(nav).toBeHidden();
    }

    // sessions 頁：command control（非 reveal 類，AdminCommandDialog 走
    // §3.1/§8.2 的共用命令確認框）的觸發鈕與框內「確認」鈕都要達 44px。
    // 只測尺寸/可達性，不真的送出撤銷——真的撤銷會讓當前 session 立刻被
    // RequirePrivilegedSession 導去 challenge，打斷同一個 test 剩下的步驟，
    // 也沒必要（reveal 那組已經驗證過送出/成功路徑）；改用「取消」關閉。
    await page.goto('/admin/access/sessions');
    const revokeButton = page.getByRole('button', { name: '撤銷' }).first();
    await expect(revokeButton).toBeVisible();
    const revokeBox = await revokeButton.boundingBox();
    expect(revokeBox?.width).toBeGreaterThanOrEqual(44);
    expect(revokeBox?.height).toBeGreaterThanOrEqual(44);

    await revokeButton.click();
    const revokeDialog = page.getByRole('dialog');
    await expect(revokeDialog).toBeVisible();
    const revokeConfirmButton = revokeDialog.getByRole('button', {
      name: '確認',
    });
    const revokeConfirmBox = await revokeConfirmButton.boundingBox();
    expect(revokeConfirmBox?.width).toBeGreaterThanOrEqual(44);
    expect(revokeConfirmBox?.height).toBeGreaterThanOrEqual(44);
    await revokeDialog.getByRole('button', { name: '取消' }).click();
    await expect(revokeDialog).toBeHidden();

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

    // Task 6：教師帳號 list/detail/form/receipt 的主要操作面在三個 Admin
    // 視口都不得造成頁面水平溢位；表單的 primary action 維持 44px。
    await page.goto('/admin/teachers');
    await expect(page.getByRole('heading', { name: '教師帳號' })).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(viewport.width);

    const createTeacherButton = page.getByRole('button', {
      name: '新增教師',
    });
    const createTeacherBox = await createTeacherButton.boundingBox();
    expect(createTeacherBox?.width).toBeGreaterThanOrEqual(44);
    expect(createTeacherBox?.height).toBeGreaterThanOrEqual(44);
    await createTeacherButton.click();
    const teacherForm = page.getByRole('dialog', { name: '新增教師帳號' });
    await expect(teacherForm).toBeVisible();
    const createConfirm = teacherForm.getByRole('button', {
      name: '確認新增',
    });
    const createConfirmBox = await createConfirm.boundingBox();
    expect(createConfirmBox?.width).toBeGreaterThanOrEqual(44);
    expect(createConfirmBox?.height).toBeGreaterThanOrEqual(44);
    await teacherForm.getByRole('button', { name: '取消' }).click();
    await expect(teacherForm).toBeHidden();

    const detailLink = page.getByRole('link', { name: '查看教師' }).first();
    await expect(detailLink).toBeVisible();
    await detailLink.click();
    await expect(page).toHaveURL(/\/admin\/teachers\/[0-9a-f-]+$/u);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(viewport.width);
  });
}
