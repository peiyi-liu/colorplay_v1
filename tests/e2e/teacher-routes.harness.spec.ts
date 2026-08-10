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

const WIDTHS = [320, 375, 393, 768, 1024, 1280, 1440] as const;
const WORKSHOP_ROUTE_SCENARIOS = [
  'dashboard',
  'analytics',
  'classes',
  'classroom-detail',
  'live',
  'live-report',
  'student-progress',
] as const;
const ROUTE_SCENARIOS = [...WORKSHOP_ROUTE_SCENARIOS, 'live-session'] as const;

const expectNoClippedOrOverlappingText = async (
  page: Page,
  scenario: string,
) => {
  const root = page.locator(
    scenario === 'live-session' ? '.live-presenter' : '.teacher-workshop-page',
  );
  const result = await root.evaluate((element) => {
    const candidates = Array.from(
      element.querySelectorAll<HTMLElement>(
        'h1, h2, h3, p, a, button, label, th, td',
      ),
    ).filter((target) => {
      const style = getComputedStyle(target);
      const box = target.getBoundingClientRect();
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        box.width > 1 &&
        box.height > 1 &&
        (target.textContent?.trim().length ?? 0) > 0
      );
    });
    const clipped = candidates
      .filter(
        (target) =>
          target.scrollWidth > target.clientWidth + 1 ||
          target.scrollHeight > target.clientHeight + 1 ||
          getComputedStyle(target).textOverflow === 'ellipsis',
      )
      .map(
        (target) =>
          `${target.tagName}:${(target.textContent ?? '').trim().slice(0, 24)}`,
      );
    const overlaps: string[] = [];
    for (let left = 0; left < candidates.length; left += 1) {
      for (let right = left + 1; right < candidates.length; right += 1) {
        const a = candidates[left];
        const b = candidates[right];
        if (!a || !b || a.contains(b) || b.contains(a)) continue;
        const first = a.getBoundingClientRect();
        const second = b.getBoundingClientRect();
        const overlapWidth =
          Math.min(first.right, second.right) -
          Math.max(first.left, second.left);
        const overlapHeight =
          Math.min(first.bottom, second.bottom) -
          Math.max(first.top, second.top);
        if (overlapWidth > 1 && overlapHeight > 1) {
          overlaps.push(
            `${a.tagName}:${(a.textContent ?? '').trim().slice(0, 24)} <> ${b.tagName}:${(b.textContent ?? '').trim().slice(0, 24)}`,
          );
        }
      }
    }
    return { clipped, overlaps };
  });
  expect(result.clipped, `${scenario} clipped text`).toEqual([]);
  expect(result.overlaps, `${scenario} overlapping text`).toEqual([]);
};

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
      if (scenario === 'live-session' && width < 1024) {
        await expect(page.getByRole('alert')).toHaveText('投影視窗過小');
      } else {
        await expect(page.getByRole('heading').first()).toBeVisible();
      }
      await expectNoClippedOrOverlappingText(page, scenario);
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

test('all 8 teacher routes are reachable and injected-repository harness isolated (no real Supabase/RequireAuth)', async ({
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

test('all 7 workshop routes expose the shared sage-workshop visual surface', async ({
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 1440 });
  for (const scenario of WORKSHOP_ROUTE_SCENARIOS) {
    await page.goto(`/dev-harness/teacher-routes.html?scenario=${scenario}`);
    await page.waitForLoadState('networkidle');

    const surface = page.locator('.teacher-workshop-page');
    await expect(surface, scenario).toHaveCount(1);
    const visual = await surface.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        backgroundImage: style.backgroundImage,
        borderTopWidth: Number.parseFloat(style.borderTopWidth),
        boxShadow: style.boxShadow,
      };
    });
    expect(visual.backgroundImage, scenario).not.toBe('none');
    expect(visual.borderTopWidth, scenario).toBeGreaterThanOrEqual(2);
    expect(visual.boxShadow, scenario).not.toBe('none');

    const title = surface.getByRole('heading', { level: 1 }).first();
    await expect(title, scenario).toBeVisible();
    expect(
      await title.evaluate((element) => getComputedStyle(element).fontFamily),
      scenario,
    ).toContain('Cubic 11');
  }
});

for (const scenario of [
  'classes',
  'student-progress',
  'live-report',
  'live-session',
] as const) {
  for (const viewport of [
    { height: 900, width: 1280 },
    { height: 852, width: 393 },
  ] as const) {
    test(`captures ${scenario} design audit at ${String(viewport.width)}px`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto(`/dev-harness/teacher-routes.html?scenario=${scenario}`);
      await page.waitForLoadState('networkidle');
      await page.screenshot({
        fullPage: true,
        path: `artifacts/design-audit/ui-content-correction/${scenario}/${String(viewport.width)}.png`,
      });
    });
  }
}

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
