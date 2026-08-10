import { expect, test, type Page } from '@playwright/test';

const observeRuntimeErrors = (page: Page) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });
  return { consoleErrors, pageErrors };
};

const WIDTHS = [320, 375, 768, 1024, 1440] as const;
const ROUTE_SCENARIOS = [
  'dashboard',
  'analytics',
  'classes',
  'classroom-detail',
  'live',
  'live-report',
  'student-progress',
] as const;

for (const width of WIDTHS) {
  test(`teacher routes render without layout/console defects at ${String(width)}px`, async ({
    page,
  }) => {
    const runtimeErrors = observeRuntimeErrors(page);
    await page.setViewportSize({ height: 900, width });

    for (const scenario of ROUTE_SCENARIOS) {
      await page.goto(`/dev-harness/teacher-routes.html?scenario=${scenario}`);
      await page.waitForLoadState('networkidle');

      const overflow = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(overflow.scrollWidth, scenario).toBeLessThanOrEqual(
        overflow.clientWidth,
      );
      await expect(page.getByRole('heading').first()).toBeVisible();
    }

    expect(
      runtimeErrors.consoleErrors,
      `console errors at ${String(width)}px`,
    ).toEqual([]);
    expect(
      runtimeErrors.pageErrors,
      `page errors at ${String(width)}px`,
    ).toEqual([]);
  });
}

test('all 7 teacher routes are reachable and injected-repository harness isolated (no real Supabase/RequireAuth)', async ({
  page,
}) => {
  const runtimeErrors = observeRuntimeErrors(page);
  for (const scenario of ROUTE_SCENARIOS) {
    await page.goto(`/dev-harness/teacher-routes.html?scenario=${scenario}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading').first()).toBeVisible();
  }
  expect(runtimeErrors.consoleErrors).toEqual([]);
  expect(runtimeErrors.pageErrors).toEqual([]);
});

test('HUD highlights the active top tab for the current route', async ({
  page,
}) => {
  await page.goto(
    '/dev-harness/teacher-routes.html?scenario=hud&route=%2Fteacher',
  );
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('link', { name: '教師工作區' })).toHaveClass(
    /hud-command__tab--active/u,
  );
  await expect(page.getByRole('link', { name: 'Live 主持' })).not.toHaveClass(
    /hud-command__tab--active/u,
  );

  await page.goto(
    '/dev-harness/teacher-routes.html?scenario=hud&route=%2Fteacher%2Flive',
  );
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('link', { name: 'Live 主持' })).toHaveClass(
    /hud-command__tab--active/u,
  );
  await expect(page.getByRole('link', { name: '教師工作區' })).not.toHaveClass(
    /hud-command__tab--active/u,
  );
});

test('MENU opens with focus inside the panel and Tab/Shift+Tab trap within it', async ({
  page,
}) => {
  await page.goto('/dev-harness/teacher-routes.html?scenario=hud');
  await page.waitForLoadState('networkidle');
  const panel = page.locator('#hud-menu-panel');
  const classesLink = page.getByRole('link', { name: '班級管理' });
  const logoutButton = page.getByRole('button', { name: '登出' });

  await page.getByRole('button', { name: 'MENU' }).click();
  await expect(panel).toBeVisible();
  // Task 1 TDD contract：開啟時焦點先落在面板本身（tabIndex=-1），比照既有
  // hud-command-bar.test.tsx 的 panel.contains(activeElement) 斷言。
  await expect(panel).toBeFocused();

  await logoutButton.focus();
  await page.keyboard.press('Tab');
  await expect(classesLink).toBeFocused();

  await classesLink.focus();
  await page.keyboard.press('Shift+Tab');
  await expect(logoutButton).toBeFocused();
});

test('Escape closes the MENU panel and restores focus to the toggle', async ({
  page,
}) => {
  await page.goto('/dev-harness/teacher-routes.html?scenario=hud');
  await page.waitForLoadState('networkidle');
  const toggle = page.getByRole('button', { name: 'MENU' });
  const panel = page.locator('#hud-menu-panel');

  await toggle.click();
  await expect(panel).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(toggle).toBeFocused();
});

test('clicking outside the MENU panel closes it', async ({ page }) => {
  await page.goto('/dev-harness/teacher-routes.html?scenario=hud');
  await page.waitForLoadState('networkidle');
  const panel = page.locator('#hud-menu-panel');

  await page.getByRole('button', { name: 'MENU' }).click();
  await expect(panel).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(panel).toBeHidden();
});
