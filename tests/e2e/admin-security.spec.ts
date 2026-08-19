import { expect, test, type Page } from '@playwright/test';

import { TEST_USERS } from '../fixtures/users';
import {
  challengeAdmin,
  enrollAdminTotp,
  saveAdminTotpSecret,
  signInAdmin,
} from './helpers/admin';
import { signInTeacher } from './helpers/auth';

// 篩到只剩 adminPrimary／adminSecondary 兩列：full_name 是這兩個 fixture
// 唯一可預期、非空的已知值（tests/fixtures/users.ts 的 TEST_USER_ACCOUNTS），
// 之後才能斷言明文內容而不只是「格式不是遮罩」這種弱斷言。**filter 是
// client 端 React state，不隨網址走**——重新整理會被重置回未篩選，
// 因此每次要用 fullNameCell() 之前都要重新呼叫這個函式，不能只在第一次
// 套用就假設之後還在。
async function filterProfilesToAdminRole(page: Page): Promise<void> {
  await page.getByRole('combobox', { name: '篩選欄位' }).selectOption('role');
  await page.getByLabel('篩選值').fill('admin');
  await page.getByRole('button', { name: '套用' }).click();
}

function adminFullNameCell(page: Page) {
  return page
    .locator('table[aria-label="users/profiles"] tbody tr')
    .first()
    .locator('td')
    .filter({ has: page.getByRole('button', { name: '揭露 full_name' }) });
}

// 單一 privileged session（Task 14 plan：admin E2E 以 workers:1 串行；
// 這裡額外用 describe.configure 標明這個檔案本身的旅程也是有狀態、
// 循序依賴的，不可平行拆開）。
test.describe.configure({ mode: 'serial' });

// primary/secondary 各自的 device_summary 來源就是 User-Agent（見
// supabase/functions/admin-mfa/index.ts 的 svc_admin_create_session 呼叫），
// 用可辨識的自訂 UA 讓 step 6 能在 session 清單裡精準指認「哪一列是
// primary」——sessions 頁除了 device_summary 之外沒有任何顯示 admin
// 身分的欄位。
const PRIMARY_USER_AGENT = 'ColorPlayE2E-AdminPrimary';
const SECONDARY_USER_AGENT = 'ColorPlayE2E-AdminSecondary';

// spec §14.4 旅程斷言逐條（步驟 1-6 共用同一個 privileged session，拆成
// 獨立 test() 只會強迫每步重建前置狀態——TOTP enrollment 甚至做不到
// 「重建」，一個 factor 只能綁一次——所以寫成一個 test() 內的 test.step()）。
test('admin security journey: enroll, challenge, browse, reveal, audit, and session restore', async ({
  browser,
}) => {
  const primaryContext = await browser.newContext({
    userAgent: PRIMARY_USER_AGENT,
  });
  const primaryPage = await primaryContext.newPage();
  let primarySecret = '';

  try {
    await test.step('1. 教師端登入 adminPrimary（免班級碼）→ 導向 enrollment', async () => {
      await signInAdmin(primaryPage, TEST_USERS.adminPrimary);
      await expect(primaryPage).toHaveURL(/\/admin\/mfa\/enroll$/u);
    });

    await test.step('2. Enroll → 自動轉場 challenge → /admin 總覽渲染', async () => {
      primarySecret = await enrollAdminTotp(primaryPage);
      await saveAdminTotpSecret('adminPrimary', primarySecret);
      await challengeAdmin(primaryPage, primarySecret);
      await expect(primaryPage).toHaveURL(/\/admin$/u);
      await expect(
        primaryPage.getByRole('heading', { name: '安全總覽' }),
      ).toBeVisible();
    });

    await test.step('3. Browser：列表出現，personal 欄（full_name）遮罩', async () => {
      await primaryPage.goto('/admin/data/users/profiles');
      await filterProfilesToAdminRole(primaryPage);
      await expect(
        primaryPage.locator('table[aria-label="users/profiles"] tbody tr'),
      ).not.toHaveCount(0);
      await expect(adminFullNameCell(primaryPage)).toContainText('＊');
    });

    await test.step('4. Reveal：輸入 10+ 字 purpose 後明文出現，重新整理回遮罩', async () => {
      const row = primaryPage
        .locator('table[aria-label="users/profiles"] tbody tr')
        .first();
      await row.getByRole('button', { name: '揭露 full_name' }).click();

      const dialog = primaryPage.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await dialog
        .getByLabel('揭露目的')
        .fill('E2E 測試驗證揭露流程是否正確運作');
      await dialog.getByRole('button', { name: '揭露' }).click();

      const plaintext = dialog.getByTestId('reveal-plaintext');
      await expect(plaintext).toBeVisible();
      // 已知值：TEST_USER_ACCOUNTS 為 adminPrimary／adminSecondary 各自
      // 設定的 full_name，篩選後只會是這兩者之一。
      await expect(plaintext).toHaveText(/^管理員 [一二]號$/u);
      await dialog.getByRole('button', { name: '關閉' }).click();
      await expect(dialog).toBeHidden();

      // filter 是 client 端 state，重新整理會被重置：不重新套用的話
      // .first() 會落在整份未篩選列表的第一列，那一列的 full_name 很可能
      // 是真的 NULL（顯示「—」而不是遮罩），跟「reveal 後有沒有回到遮罩」
      // 完全是兩件事，斷言會失去意義。
      await primaryPage.reload();
      await filterProfilesToAdminRole(primaryPage);
      await expect(adminFullNameCell(primaryPage)).toContainText('＊');
    });

    await test.step('5. Audit：出現 admin_reveal_field 事件列，頁面無「匯出」文字', async () => {
      await primaryPage.goto('/admin/audit');
      await expect(
        primaryPage.getByRole('cell', { name: 'admin_reveal_field' }).first(),
      ).toBeVisible();
      // spec §7、§10：Phase 1 全表 export=false，稽核頁不得有匯出/下載
      // 控制項；連文字都不該出現（避免將來加了功能卻忘了同步刪掉本測試）。
      await expect(primaryPage.getByText('匯出')).toHaveCount(0);
      await expect(primaryPage.getByText('下載')).toHaveCount(0);
    });

    await test.step('6. Timeout/restore：secondary 撤銷 primary，primary 被導去 challenge，challenge 後回到原頁', async () => {
      const secondaryContext = await browser.newContext({
        userAgent: SECONDARY_USER_AGENT,
      });
      const secondaryPage = await secondaryContext.newPage();
      try {
        await signInAdmin(secondaryPage, TEST_USERS.adminSecondary);
        await expect(secondaryPage).toHaveURL(/\/admin\/mfa\/enroll$/u);
        const secondarySecret = await enrollAdminTotp(secondaryPage);
        await saveAdminTotpSecret('adminSecondary', secondarySecret);
        await challengeAdmin(secondaryPage, secondarySecret);
        await expect(secondaryPage).toHaveURL(/\/admin$/u);

        await secondaryPage.goto('/admin/access/sessions');
        const primaryRow = secondaryPage
          .locator('table[aria-label="特權連線"] tbody tr')
          .filter({ hasText: PRIMARY_USER_AGENT });
        await expect(primaryRow).toHaveCount(1);
        await primaryRow.getByRole('button', { name: '撤銷' }).click();

        const dialog = secondaryPage.getByRole('dialog');
        await expect(dialog).toBeVisible();
        await dialog
          .getByLabel('原因')
          .fill('E2E 測試驗證 session timeout/restore 流程');
        await dialog.getByRole('button', { name: '確認' }).click();
        await expect(dialog).toBeHidden();
      } finally {
        await secondaryContext.close();
      }

      // 撤銷發生在 primary 頁面「背後」——sessionStorage 60 秒輪詢太慢，
      // 用整頁重新整理強制 useAdminSessionState 重新掛載並立刻 refetch
      // （staleTime 預設 0），才會在同一次導覽判定裡就被 RequirePrivilegedSession
      // 導去 challenge，而不必等到下一次輪詢視窗。
      const returnToPath = new URL(primaryPage.url()).pathname;
      await primaryPage.reload();
      await primaryPage.waitForURL(/\/admin\/mfa\/challenge$/u);
      await challengeAdmin(primaryPage, primarySecret);
      await primaryPage.waitForURL(
        new RegExp(`${returnToPath.replaceAll('/', String.raw`\/`)}$`, 'u'),
      );
    });
  } finally {
    await primaryContext.close();
  }
});

// 獨立於上面的旅程，不需要任何前置 admin 狀態：一般教師直接開 /admin
// 應該被前端 guard（RequireAdminIdentity）擋下，即使伺服端授權權威
// （RLS/RPC/Edge）本來就會拒絕，這裡驗證的是 UX 層沒有繞過的破口。
test('non-admin session is redirected away from /admin', async ({ page }) => {
  await signInTeacher(page, TEST_USERS.teacher);
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/unauthorized$/u);
});
