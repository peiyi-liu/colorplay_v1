import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

import { TEST_USERS } from '../fixtures/users';

// 三 viewport：mobile / tablet / desktop（spec/08 慣例）。
const VIEWPORTS = [
  { height: 812, label: 'mobile', width: 375 },
  { height: 1024, label: 'tablet', width: 768 },
  { height: 900, label: 'desktop', width: 1440 },
] as const;

const GGAME_REFERENCE = pathToFileURL(
  resolve('legacy/ggame-ui-reference-2026-07-18.html'),
).href;

const evidenceRoot = process.env.PLAYWRIGHT_EVIDENCE_ROOT ?? 'test-results';

const settleFadeIn = async (page: Page) => {
  const animated = page.locator('.animate-fade-in');
  if ((await animated.count()) > 0) {
    await expect(animated.first()).toHaveCSS('opacity', '1');
  }
};

const shot = async (page: Page, name: string) => {
  await page.screenshot({
    animations: 'disabled',
    fullPage: true,
    path: `${evidenceRoot}/playwright/ui-restyle-${name}.png`,
  });
};

const signIn = async (
  page: Page,
  user: Readonly<{ email: string; password: string }>,
) => {
  await page.goto('/login');
  await page.getByLabel('帳號').fill(user.email);
  await page.getByLabel('密碼').fill(user.password);
  await page.getByRole('button', { name: '登入' }).click();
  await expect(page).toHaveURL(/\/(app|teacher)/u);
};

test('UI Restyle phase gate', async ({ page }) => {
  test.setTimeout(300_000);
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (
      text.includes('downloadable font: download failed') &&
      text.includes('/assets/noto-sans-tc')
    ) {
      return;
    }
    consoleErrors.push(text);
  });

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({
      height: viewport.height,
      width: viewport.width,
    });

    // 1. 認證入口
    await page.goto('/login');
    await expect(page.getByText('ColorPlay 認證入口')).toBeVisible();
    await shot(page, `login-${viewport.label}`);

    // 2. 大廳（樞紐）
    await signIn(page, TEST_USERS.studentOne);
    await page.goto('/app');
    await expect(
      page.getByRole('heading', { name: '色彩任務選擇大廳' }),
    ).toBeVisible();
    await shot(page, `lobby-${viewport.label}`);

    // 3. 課後任務實戰（5 階精熟）
    await page.goto('/app/missions');
    await expect(
      page.getByRole('button', { name: '展開小節任務' }).first(),
    ).toBeVisible();
    await page.getByRole('button', { name: '展開小節任務' }).first().click();
    await expect(page).toHaveURL(/\/app\/missions\/[0-9a-f-]{36}$/u);
    await expect(
      page.getByText('🗺️ 精熟學習地圖（未通過上一關前不可跳關）'),
    ).toBeVisible();
    await shot(page, `mission-${viewport.label}`);

    // 4. 商店（Blook＋邊框）
    await page.goto('/app/shop');
    await expect(
      page.getByRole('heading', { name: '尊絕外顯邊框' }),
    ).toBeVisible();
    await shot(page, `shop-${viewport.label}`);

    // 登出，回復乾淨狀態（sessionStorage 政策下換頁籤即失效，此處顯式登出）
    await page.getByRole('button', { name: '登出' }).click();
    await expect(page).toHaveURL(/\/login$/u);
  }

  // 教師端（desktop）
  await page.setViewportSize({ height: 900, width: 1440 });
  await signIn(page, TEST_USERS.teacher);
  await page.goto('/teacher');
  await expect(
    page.getByRole('heading', {
      name: /課堂即時競賽（Live）廣播控制台/u,
    }),
  ).toBeVisible();
  await shot(page, 'teacher-workspace-desktop');
  await page.goto('/teacher/analytics');
  await expect(
    page.getByRole('heading', { name: '班級高頻錯誤概念' }),
  ).toBeVisible();
  await shot(page, 'teacher-analytics-desktop');
  await page.getByRole('button', { name: '登出' }).click();

  // GGAME 參考稿並列截圖（唯讀快照；不進入產品流程）
  await page.setViewportSize({ height: 900, width: 1440 });
  await page.goto(GGAME_REFERENCE);
  await shot(page, 'reference-auth-desktop');
  await page.locator('#student-id').fill('CP999');
  await page.locator('#student-name').fill('參考擷取');
  await page.getByRole('button', { name: /確認登入 ColorPlay/u }).click();
  await shot(page, 'reference-lobby-desktop');
  await page.locator('#tab-btn-mission').click();
  await shot(page, 'reference-mission-desktop');
  await page.locator('#tab-btn-shop').click();
  await shot(page, 'reference-shop-desktop');

  // axe：登入與大廳不得有 critical/serious（desktop）
  await page.goto('/login');
  await settleFadeIn(page);
  const loginScan = await new AxeBuilder({ page }).analyze();
  expect(
    loginScan.violations.filter((violation) =>
      ['critical', 'serious'].includes(violation.impact ?? ''),
    ),
  ).toEqual([]);
  await signIn(page, TEST_USERS.studentOne);
  await page.goto('/app');
  await expect(
    page.getByRole('heading', { name: '色彩任務選擇大廳' }),
  ).toBeVisible();
  await settleFadeIn(page);
  const lobbyScan = await new AxeBuilder({ page }).analyze();
  expect(
    lobbyScan.violations.filter((violation) =>
      ['critical', 'serious'].includes(violation.impact ?? ''),
    ),
  ).toEqual([]);

  expect(consoleErrors).toEqual([]);
});
