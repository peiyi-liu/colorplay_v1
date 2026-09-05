import { expect, test, type Page } from '@playwright/test';
import { ADMIN_UI_ID, adminUiRpc } from './helpers/admin-console-fixtures';
const routes = [
  '/admin',
  '/admin/teachers',
  '/admin/teachers/' + ADMIN_UI_ID,
  '/admin/access/admins',
  '/admin/access/invitations',
  '/admin/access/sessions',
  '/admin/health',
  '/admin/monitoring',
  '/admin/audit',
  '/admin/data',
  '/admin/data/users/profiles',
  '/admin/data/users/profiles/' + ADMIN_UI_ID,
  '/admin/mfa/enroll',
  '/admin/mfa/challenge',
  '/admin/invitations/accept',
];
async function fixture(page: Page) {
  await page.addInitScript((id) => {
    const user = {
      id,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'ui@example.test',
      factors: [
        {
          id,
          factor_type: 'totp',
          status: 'verified',
          created_at: '2026-09-05T00:00:00Z',
          updated_at: '2026-09-05T00:00:00Z',
        },
      ],
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-09-05T00:00:00Z',
    };
    sessionStorage.setItem(
      'sb-127-auth-token',
      JSON.stringify({
        access_token: 'synthetic-ui-session',
        refresh_token: 'synthetic-ui-refresh',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        expires_in: 3600,
        token_type: 'bearer',
        user,
      }),
    );
  }, ADMIN_UI_ID);
  await page.route('http://127.0.0.1:54321/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/auth/v1/user'))
      return route.fulfill({
        json: {
          id: ADMIN_UI_ID,
          factors: [
            { id: ADMIN_UI_ID, factor_type: 'totp', status: 'verified' },
          ],
        },
      });
    if (url.pathname.includes('/rpc/'))
      return route.fulfill({
        json: adminUiRpc(url.pathname.split('/').at(-1) ?? ''),
      });
    if (url.pathname.endsWith('/admin-mfa'))
      return route.fulfill({
        json: {
          outcome: 'ok',
          factorId: ADMIN_UI_ID,
          qrUri:
            'otpauth://totp/UI%20fixture?secret=JBSWY3DPEHPK3PXP&issuer=UIFixture',
          totpSecret: 'JBSWY3DPEHPK3PXP',
        },
      });
    return route.fulfill({
      json: {
        outcome: 'denied',
        code: 'TARGET_STATE_INVALID',
        retryable: false,
      },
    });
  });
}
for (const viewport of [
  { width: 320, height: 568 },
  { width: 393, height: 852 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
]) {
  test(`15 routes fit ${String(viewport.width)}x${String(viewport.height)}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await fixture(page);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    for (const route of routes) {
      await page.goto(
        '/dev-harness/admin-console.html?route=' + encodeURIComponent(route),
      );
      await expect(page.locator('h1')).toBeVisible();
      await expect(
        page.getByRole('status', { name: '頁面載入中' }),
      ).toHaveCount(0);
      await expect(page.locator('main')).toHaveCount(1);
      if (route === '/admin')
        await expect(
          page.getByRole('heading', { name: '需要注意' }),
        ).toBeVisible();
      else if (route.includes('/mfa/'))
        await expect(page.getByLabel('驗證碼')).toBeVisible();
      else if (route.includes('/invitations/accept'))
        await expect(page.getByLabel('邀請 token')).toBeVisible();
      else if (route === '/admin/teachers')
        await expect(
          page.getByRole('cell', { name: 'teacher01' }),
        ).toBeVisible();
      else if (route.startsWith('/admin/teachers/'))
        await expect(
          page.getByRole('button', { name: '更新教師資料' }),
        ).toBeVisible();
      else if (route === '/admin/data')
        await expect(
          page.getByRole('link', { name: '課程', exact: true }).first(),
        ).toBeVisible();
      else if (route.startsWith('/admin/data/'))
        await expect(
          page.getByRole('button', { name: '揭露 full_name', exact: true }),
        ).toBeVisible();
      else if (route === '/admin/health')
        await expect(
          page.getByRole('button', { name: '授權一次人工重試' }),
        ).toBeVisible();
      else if (route === '/admin/access/invitations')
        await expect(
          page.getByRole('cell', { name: 'a***@example.test' }),
        ).toBeVisible();
      else if (route === '/admin/access/admins')
        await expect(
          page.getByRole('button', { name: '停用', exact: true }),
        ).toBeVisible();
      else if (route === '/admin/access/sessions')
        await expect(
          page.getByRole('cell', { name: '測試裝置 · Chromium' }),
        ).toBeVisible();
      else if (route === '/admin/audit')
        await expect(
          page.getByRole('cell', { name: 'reset_admin_mfa', exact: true }),
        ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        route,
      ).toBe(true);
      expect(
        await page
          .locator('h1')
          .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
        route,
      ).toBe(true);
      expect(errors, route).toEqual([]);
    }
  });
}
test('dialog focus, long wait, delayed acceptance and no duplicate command', async ({
  page,
}) => {
  await fixture(page);
  let calls = 0;
  let release: () => void = () => {
    throw new Error('Response latch not initialized');
  };
  const responseReady = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/functions/v1/admin-command', async (route) => {
    calls++;
    await responseReady;
    await route.fulfill({
      json: {
        outcome: 'ok',
        result: 'reconcile_requested',
        operation_id: ADMIN_UI_ID,
      },
    });
  });
  await page.goto('/dev-harness/admin-console.html?route=/admin/health');
  const invoker = page.getByRole('button', { name: '授權一次人工重試' });
  await invoker.click();
  await expect(page.getByLabel('原因')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(
    page.getByRole('button', { name: '確認', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('原因')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(invoker).toBeFocused();
  await invoker.click();
  await page.getByLabel('原因').fill('確認安全作業目前狀態後授權重試');
  await page.getByRole('button', { name: '確認', exact: true }).click();
  await expect(page.getByText(/尚未收到最終結果。關閉視窗/)).toBeVisible({
    timeout: 12_000,
  });
  await page.getByRole('button', { name: '關閉視窗，稍後查看' }).click();
  await expect(invoker).toBeFocused();
  release();
  await expect(page.getByText(/請求已受理，作業仍待處理/)).toBeVisible();
  expect(calls).toBe(1);
});
test('refresh failure retains safe rows; reduced motion at 200 percent CSS zoom', async ({
  page,
}) => {
  await fixture(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/dev-harness/admin-console.html?route=/admin/teachers');
  await page.evaluate(() => {
    document.documentElement.style.zoom = '2';
  });
  await expect(page.getByRole('cell', { name: 'teacher01' })).toBeVisible();
  await page.route('**/rpc/admin_list_teachers', (route) => route.abort());
  await page.getByRole('button', { name: '重新整理' }).click();
  await expect(page.getByText(/更新失敗，目前顯示上次/)).toBeVisible();
  await expect(page.getByRole('cell', { name: 'teacher01' })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});

test('narrow navigation supports keyboard open, Escape and return focus', async ({
  page,
}) => {
  await fixture(page);
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto('/dev-harness/admin-console.html?route=/admin');
  const toggle = page.getByRole('button', { name: '開啟導覽' });
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('navigation', { name: '管理主控台導覽' }),
  ).toBeVisible();
  const drawer = page.getByRole('dialog', { name: '管理導覽' });
  await expect(drawer).toBeVisible();
  const close = drawer.getByRole('button', { name: '關閉導覽' });
  await expect(close).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(drawer.getByRole('link', { name: '健康狀態' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(toggle).toBeFocused();
  await expect(
    page.getByRole('navigation', { name: '管理主控台導覽' }),
  ).toBeHidden();
});

for (const viewport of [
  { width: 393, height: 852 },
  { width: 1440, height: 900 },
]) {
  test(
    'operational page boundaries remain aligned at ' + String(viewport.width),
    async ({ page }) => {
      await page.setViewportSize(viewport);
      await fixture(page);
      let baseline: { x: number; width: number } | null = null;
      for (const route of routes.filter(
        (path) =>
          !path.includes('/mfa/') && !path.includes('/invitations/accept'),
      )) {
        await page.goto(
          '/dev-harness/admin-console.html?route=' + encodeURIComponent(route),
        );
        await expect(page.locator('h1')).toBeVisible();
        await expect(
          page.getByRole('status', { name: '頁面載入中' }),
        ).toHaveCount(0);
        const box = await page
          .locator('.admin-shell__main > section')
          .boundingBox();
        expect(box).not.toBeNull();
        if (!box) throw new Error('PAGE_GEOMETRY_MISSING');
        baseline ??= box;
        expect(Math.abs(box.x - baseline.x), route).toBeLessThanOrEqual(1);
        expect(Math.abs(box.width - baseline.width), route).toBeLessThanOrEqual(
          1,
        );
      }
    },
  );
}
