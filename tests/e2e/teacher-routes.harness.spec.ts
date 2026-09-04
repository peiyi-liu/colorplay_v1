import { expect, test } from '@playwright/test';
import {
  observeRuntimeErrors,
  ROUTE_SCENARIOS,
  verifyDrillDownComposition,
  verifyLiveReportComposition,
  WIDTHS,
} from './teacher-routes.harness-support';

for (const viewport of [
  { height: 900, label: '1280 desktop', width: 1280 },
  { height: 900, label: '1440 desktop', width: 1440 },
  { height: 852, label: '320 mobile', width: 320 },
  { height: 852, label: '375 mobile', width: 375 },
  { height: 852, label: '393 mobile', width: 393 },
] as const) {
  test(`JRPG teacher workspace is consistent at ${viewport.label} viewport`, async ({
    page,
  }) => {
    const runtimeErrors = observeRuntimeErrors(page);
    await page.setViewportSize({
      height: viewport.height,
      width: viewport.width,
    });
    await page.goto('/dev-harness/teacher-routes.html?scenario=analytics');
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByRole('heading', { name: '教學分析', level: 1 }),
    ).toBeVisible();
    await expect(page.getByText('點此上傳')).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: '教師導覽' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: '登出' })).toBeVisible();
    await expect(page.getByRole('link', { name: '教學分析' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    const overflow = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);

    const undersizedTargets = await page
      .locator('.teacher-menu a, .teacher-menu button, .teacher-menu__avatar')
      .evaluateAll((elements) =>
        elements
          .map((element) => {
            const rect = element.getBoundingClientRect();
            return { height: rect.height, width: rect.width };
          })
          .filter(({ height, width }) => height < 44 || width < 44),
      );
    expect(undersizedTargets).toEqual([]);

    await page.goto(
      '/dev-harness/teacher-routes.html?scenario=classroom-detail',
    );
    await page.waitForLoadState('networkidle');
    const composition = await page.evaluate(() => {
      const menu = document.querySelector<HTMLElement>('.teacher-menu');
      const surface = document.querySelector<HTMLElement>(
        '.teacher-work-surface',
      );
      const header = document.querySelector<HTMLElement>(
        '.teacher-work-surface__header',
      );
      const toolbar = document.querySelector<HTMLElement>(
        '.teacher-work-surface__toolbar',
      );
      const title = document.querySelector<HTMLElement>(
        '.teacher-work-surface__header h1',
      );
      const navigation = document.querySelector<HTMLElement>(
        '.teacher-menu__navigation',
      );
      if (!menu || !surface || !header || !title || !navigation) {
        throw new Error('missing teacher workspace composition');
      }
      const menuBounds = menu.getBoundingClientRect();
      const surfaceBounds = surface.getBoundingClientRect();
      const headerBounds = header.getBoundingClientRect();
      const toolbarBounds = toolbar?.getBoundingClientRect();
      const titleBounds = title.getBoundingClientRect();
      const navigationBounds = navigation.getBoundingClientRect();
      return {
        headerHeight: headerBounds.height,
        menuBottom: menuBounds.bottom,
        menuPosition: getComputedStyle(menu).position,
        menuTop: menuBounds.top,
        menuWidth: menuBounds.width,
        navigationBottom: navigationBounds.bottom,
        navigationHeight: navigationBounds.height,
        surfaceLeft: surfaceBounds.left,
        toolbarBelowTitle:
          toolbarBounds === undefined ||
          toolbarBounds.top >= titleBounds.bottom,
        toolbarTargetsSized:
          toolbar === null ||
          Array.from(toolbar.querySelectorAll<HTMLElement>('a, button')).every(
            (control) => {
              const bounds = control.getBoundingClientRect();
              return bounds.width >= 44 && bounds.height >= 44;
            },
          ),
      };
    });
    expect(composition.menuPosition).toBe('fixed');
    expect(composition.toolbarTargetsSized).toBe(true);
    if (viewport.width >= 768) {
      expect(composition.menuWidth).toBe(240);
      expect(composition.surfaceLeft).toBe(240);
      expect(composition.headerHeight).toBeGreaterThanOrEqual(164);
      expect(composition.headerHeight).toBeLessThanOrEqual(200);
    } else {
      expect(composition.menuTop).toBe(0);
      expect(composition.menuBottom).toBe(72);
      expect(composition.navigationBottom).toBe(viewport.height);
      expect(composition.navigationHeight).toBe(72);
      expect(composition.headerHeight).toBeGreaterThanOrEqual(116);
      expect(composition.headerHeight).toBeLessThanOrEqual(180);
      expect(composition.toolbarBelowTitle).toBe(true);
    }
    expect(runtimeErrors.consoleErrors).toEqual([]);
    expect(runtimeErrors.pageErrors).toEqual([]);
  });
}

test('Live waiting lobby honors reduced motion without hiding status', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ height: 720, width: 1280 });
  await page.goto('/dev-harness/teacher-routes.html?scenario=live-lobby');
  await page.waitForLoadState('networkidle');

  await expect(page.getByText('等待開始')).toBeVisible();
  await expect(page.getByText('40 人已加入')).toBeVisible();
  await page.evaluate(() => {
    window.dispatchEvent(new Event('colorplay-live-harness-join'));
  });
  const newcomer = page.getByLabel('新加入同學41已加入');
  await expect(newcomer).toBeVisible();
  expect(
    await newcomer.evaluate(
      (element) => getComputedStyle(element).animationName,
    ),
  ).toBe('none');
});

test('only a newly joined participant grows and floats into the avatar arena', async ({
  page,
}) => {
  await page.setViewportSize({ height: 720, width: 1280 });
  await page.goto('/dev-harness/teacher-routes.html?scenario=live-lobby');
  await page.waitForLoadState('networkidle');

  const settledPortrait = page.getByLabel('測試參與者01已加入');
  expect(
    await settledPortrait.evaluate(
      (element) => getComputedStyle(element).animationName,
    ),
  ).toBe('none');

  await page.evaluate(() => {
    window.dispatchEvent(new Event('colorplay-live-harness-join'));
  });
  const newcomer = page.getByLabel('新加入同學41已加入');
  await expect(newcomer).toHaveAttribute('data-joining', 'true');
  expect(
    await newcomer.evaluate(
      (element) => getComputedStyle(element).animationName,
    ),
  ).toBe('live-avatar-bubble-rise');

  const bubbleMotion = await newcomer.evaluate(async (element) => {
    const animation = element.getAnimations()[0];
    if (!animation) throw new Error('missing participant join animation');
    await animation.ready;
    animation.pause();
    const duration = Number(animation.effect?.getTiming().duration);
    if (!Number.isFinite(duration))
      throw new Error('invalid animation duration');

    const samples: Readonly<{
      centerY: number;
      opacity: number;
      width: number;
    }>[] = [];
    for (const progress of [0, 0.35, 0.65, 1] as const) {
      animation.currentTime = duration * progress;
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
      const bounds = element.getBoundingClientRect();
      samples.push({
        centerY: bounds.y + bounds.height / 2,
        opacity: Number(getComputedStyle(element).opacity),
        width: bounds.width,
      });
    }
    return samples;
  });
  const firstBubbleFrame = bubbleMotion[0];
  const settledBubbleFrame = bubbleMotion.at(-1);
  if (!firstBubbleFrame || !settledBubbleFrame) {
    throw new Error('missing bubble animation samples');
  }
  expect(firstBubbleFrame.width).toBeLessThan(settledBubbleFrame.width * 0.3);
  expect(firstBubbleFrame.centerY).toBeGreaterThan(
    settledBubbleFrame.centerY + 40,
  );
  expect(settledBubbleFrame.opacity).toBe(1);
  await expect(newcomer).toBeVisible();
  await expect(page.getByText('41 人已加入')).toBeVisible();
});

for (const width of WIDTHS) {
  test(`teacher routes including classroom-detail, student-progress, and live-report render without layout/console defects at ${String(width)}px`, async ({
    page,
  }) => {
    const runtimeErrors = observeRuntimeErrors(page);
    await page.setViewportSize({ height: width <= 393 ? 852 : 900, width });

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
      if (scenario === 'classes' && width === 393) {
        const classroom = page.getByTestId('classroom-disclosure').first();
        await expect(classroom).not.toHaveAttribute('open', '');
        await classroom.locator('summary').click();
        await expect(classroom).toHaveAttribute('open', '');
        await expect(
          page.getByRole('textbox', { name: '新班級名稱' }),
        ).toBeVisible();
      }
      await verifyDrillDownComposition(page, scenario, width);
      await verifyLiveReportComposition(page, scenario, width);
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

test('all teacher routes are reachable and injected-repository harness isolated (no real Supabase/RequireAuth)', async ({
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

for (const viewport of [
  { height: 768, width: 1024 },
  { height: 720, width: 1280 },
  { height: 768, width: 1366 },
  { height: 1080, width: 1920 },
] as const) {
  test(`Live waiting lobby owns the projector at ${String(viewport.width)}x${String(viewport.height)}`, async ({
    page,
  }) => {
    const runtimeErrors = observeRuntimeErrors(page);
    await page.setViewportSize(viewport);
    await page.goto('/dev-harness/teacher-routes.html?scenario=live-lobby');
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByRole('region', { name: 'Live 投影模式' }),
    ).toBeVisible();
    await expect(page.getByText('482731')).toBeVisible();
    await expect(page.getByText('40 人已加入')).toBeVisible();
    await expect(page.getByRole('button', { name: '開始遊戲' })).toBeVisible();
    await expect(page.getByRole('button', { name: '音效' })).toBeVisible();
    await expect(page.getByRole('button', { name: '退出' })).toBeVisible();
    await expect(page.locator('.teacher-menu')).toHaveCount(0);
    await expect(page.locator('.hud-command')).toHaveCount(0);

    const portraits = page
      .getByLabel('已加入同學')
      .locator('.live-presenter__wall-chip');
    await expect(portraits).toHaveCount(40);

    const firstPortrait = page
      .getByLabel('已加入同學')
      .locator('.live-presenter__wall-chip')
      .first();
    await expect(firstPortrait).toBeVisible();
    expect(
      await firstPortrait.evaluate((element) => {
        const imageBounds = element
          .querySelector('img')
          ?.getBoundingClientRect();
        const portraitBounds = element.getBoundingClientRect();
        return {
          borderRadius: getComputedStyle(element).borderRadius,
          clipPath: getComputedStyle(element).clipPath,
          imageFits:
            imageBounds !== undefined &&
            imageBounds.width > 0 &&
            imageBounds.height > 0 &&
            imageBounds.left >= portraitBounds.left &&
            imageBounds.top >= portraitBounds.top &&
            imageBounds.right <= portraitBounds.right &&
            imageBounds.bottom <= portraitBounds.bottom,
        };
      }),
    ).toMatchObject({
      borderRadius: expect.stringMatching(/^(50%|[3-9][0-9]px)$/u),
      clipPath: 'none',
      imageFits: true,
    });

    const geometry = await page.evaluate(() => {
      const root = document.querySelector<HTMLElement>('.live-presenter');
      const arena = document.querySelector<HTMLElement>(
        '.live-presenter__wall',
      );
      const footer = document.querySelector<HTMLElement>(
        '.live-projector__controls',
      );
      const portraits = Array.from(
        document.querySelectorAll<HTMLElement>('.live-presenter__wall-chip'),
      );
      const controls = Array.from(
        document.querySelectorAll<HTMLElement>('.live-projector__control'),
      ).map((control) => {
        const rect = control.getBoundingClientRect();
        return { height: rect.height, width: rect.width };
      });
      if (!root || !arena || !footer) throw new Error('missing Live projector');
      const arenaBounds = arena.getBoundingClientRect();
      const footerBounds = footer.getBoundingClientRect();
      const rootBounds = root.getBoundingClientRect();
      return {
        arenaDoesNotScroll:
          arena.scrollHeight <= arena.clientHeight &&
          arena.scrollWidth <= arena.clientWidth,
        controls,
        documentHeight: document.documentElement.scrollHeight,
        documentWidth: document.documentElement.scrollWidth,
        rootHeight: root.scrollHeight,
        rootBounds: {
          bottom: rootBounds.bottom,
          left: rootBounds.left,
          right: rootBounds.right,
          top: rootBounds.top,
        },
        rootWidth: root.scrollWidth,
        portraitsFit: portraits.every((portrait) => {
          const bounds = portrait.getBoundingClientRect();
          return (
            bounds.left >= arenaBounds.left - 1 &&
            bounds.right <= arenaBounds.right + 1 &&
            bounds.top >= arenaBounds.top - 1 &&
            bounds.bottom <= arenaBounds.bottom + 1 &&
            bounds.bottom <= footerBounds.top + 1
          );
        }),
        viewportHeight: document.documentElement.clientHeight,
        viewportWidth: document.documentElement.clientWidth,
      };
    });
    expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth);
    expect(geometry.documentHeight).toBeLessThanOrEqual(
      geometry.viewportHeight,
    );
    expect(geometry.rootWidth).toBeLessThanOrEqual(geometry.viewportWidth);
    expect(geometry.rootHeight).toBeLessThanOrEqual(geometry.viewportHeight);
    expect(geometry.rootBounds).toEqual({
      bottom: geometry.viewportHeight,
      left: 0,
      right: geometry.viewportWidth,
      top: 0,
    });
    expect(geometry.arenaDoesNotScroll).toBe(true);
    expect(geometry.portraitsFit).toBe(true);
    expect(
      geometry.controls.every(
        ({ height, width }) => height >= 44 && width >= 44,
      ),
    ).toBe(true);
    expect(runtimeErrors.consoleErrors).toEqual([]);
    expect(runtimeErrors.pageErrors).toEqual([]);
  });
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
