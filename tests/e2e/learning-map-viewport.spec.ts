import { mkdir } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

import { TEST_USERS } from '../fixtures/users';
import { signInStudent } from './helpers/auth';
import {
  dragMapBackground,
  expectPointerReachable,
  expectVisibleFocusRing,
  readMapScrollGap,
  readRenderedContrast,
  readWorldAnchorError,
} from './helpers/learning-map';

const SCREENSHOT_ROOT = '/tmp/colorplay-learning-map';
const MINIMUM_GAP = 8;
const MINIMUM_TARGET = 44;
const MINIMUM_CONTRAST = 4.5;

type RuntimeErrors = Readonly<{
  consoleErrors: string[];
  pageErrors: string[];
}>;

const observeRuntimeErrors = (
  page: Parameters<typeof signInStudent>[0],
): RuntimeErrors => {
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

const expectGoldGlow = (filter: string): void => {
  const colors = [...filter.matchAll(/rgb\((\d+), (\d+), (\d+)\)/gu)].map(
    (match) => match.slice(1).map(Number),
  );
  expect(
    colors.some(
      ([red, green, blue]) =>
        (red ?? 0) >= 245 && (green ?? 0) >= 190 && (blue ?? 255) <= 200,
    ),
    `Expected a gold glow in computed filter: ${filter}`,
  ).toBe(true);
};

const viewports = [
  { height: 720, name: 'desktop landscape', width: 1280 },
  { height: 375, name: 'phone landscape', width: 812 },
  { height: 812, name: 'phone portrait', width: 375 },
] as const;
for (const viewport of viewports) {
  test(`closes the fullscreen village-map browser viewport gate at ${viewport.name}`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const viewportLabel = `${String(viewport.width)}x${String(viewport.height)}`;
    const runtimeErrors = observeRuntimeErrors(page);
    await page.setViewportSize(viewport);
    await signInStudent(page, TEST_USERS.learningStudent);

    if (viewport.name === 'phone portrait') {
      const rotateHint = page.getByRole('status').filter({
        hasText: '轉橫可看完整森林王國村',
      });
      await expect(rotateHint).toBeVisible();
      const closeHint = page.getByRole('button', { name: '關閉轉向提示' });
      const closeBox = await closeHint.boundingBox();
      expect(closeBox?.width).toBeGreaterThanOrEqual(MINIMUM_TARGET);
      expect(closeBox?.height).toBeGreaterThanOrEqual(MINIMUM_TARGET);
      await expectPointerReachable(closeHint);
      await expect(rotateHint).toHaveCount(0);
    }

    await expect(
      page.getByRole('heading', { level: 1, name: '學習地圖' }),
    ).toBeVisible();
    await expect(page.locator('.game-stage')).toHaveClass(
      /game-stage--learning-map/u,
    );
    await expect(page.locator('.hud-bar')).toHaveCount(0);
    await expect(page.locator('.lobby--map-fullscreen .card')).toHaveCount(0);

    const layout = await page.evaluate(() => {
      const stage = document.querySelector<HTMLElement>(
        '.game-stage--learning-map',
      );
      const main = document.querySelector<HTMLElement>('#main-content');
      const lobby = document.querySelector<HTMLElement>(
        '.lobby--map-fullscreen',
      );
      const shell = document.querySelector<HTMLElement>('.chapter-map-shell');
      if (!stage || !main || !lobby || !shell) {
        throw new Error('Fullscreen learning-map layout is incomplete');
      }
      const stageRect = stage.getBoundingClientRect();
      const mainRect = main.getBoundingClientRect();
      const lobbyRect = lobby.getBoundingClientRect();
      const shellStyle = getComputedStyle(shell);
      return {
        documentScrollWidth: document.documentElement.scrollWidth,
        lobbyLeft: lobbyRect.left,
        lobbyRight: lobbyRect.right,
        mainLeft: mainRect.left,
        mainRight: mainRect.right,
        shellBorderLeft: Number.parseFloat(shellStyle.borderLeftWidth),
        shellBorderRight: Number.parseFloat(shellStyle.borderRightWidth),
        shellBoxShadow: shellStyle.boxShadow,
        shellRadius: shellStyle.borderRadius,
        stageLeft: stageRect.left,
        stageRight: stageRect.right,
        stageTop: stageRect.top,
        viewportWidth: window.innerWidth,
      };
    });
    expect(layout.documentScrollWidth).toBeLessThanOrEqual(
      layout.viewportWidth,
    );
    expect(layout.stageLeft).toBeCloseTo(0, 0);
    expect(layout.stageRight).toBeCloseTo(layout.viewportWidth, 0);
    expect(layout.stageTop).toBeCloseTo(0, 0);
    expect(layout.mainLeft).toBeCloseTo(layout.lobbyLeft, 0);
    expect(layout.mainRight).toBeCloseTo(layout.lobbyRight, 0);
    expect(layout.shellBorderLeft).toBe(0);
    expect(layout.shellBorderRight).toBe(0);
    expect(layout.shellBoxShadow).toBe('none');
    expect(layout.shellRadius).toBe('0px');

    const gap = await readMapScrollGap(page);
    console.log(
      `learning-map ${viewportLabel} nearest-gap=${gap.nearest.toFixed(2)} pairs=${gap.pairs.join(',')}`,
    );
    const worldGeometry = await page.evaluate(() => {
      const selectors = [
        '.chapter-map-scroll',
        '.chapter-map-shell',
        '.chapter-map',
        '.chapter-map__viewport',
        '.chapter-map__world',
        '.chapter-map__dialogue-lane',
        '.chapter-map__panel',
      ];
      return Object.fromEntries(
        selectors.map((selector) => {
          const element = document.querySelector<HTMLElement>(selector);
          if (!element) throw new Error(`Missing geometry target: ${selector}`);
          const rect = element.getBoundingClientRect();
          return [
            selector,
            {
              bottom: rect.bottom,
              height: rect.height,
              top: rect.top,
              width: rect.width,
            },
          ];
        }),
      );
    });
    console.log(
      `learning-map ${viewportLabel} world=${JSON.stringify(worldGeometry)}`,
    );
    expect
      .soft(gap.nearest, gap.pairs.join(', '))
      .toBeGreaterThanOrEqual(MINIMUM_GAP);

    const buildings = page.locator('.chapter-map__building');
    await expect(buildings).toHaveCount(6);
    const anchorErrors: Readonly<{
      chapter: number;
      x: number;
      y: number;
    }>[] = [];
    for (let index = 0; index < 6; index += 1) {
      const error = await readWorldAnchorError(buildings.nth(index));
      anchorErrors.push({ chapter: index + 1, ...error });
      expect(error.x).toBeLessThanOrEqual(8);
      expect(error.y).toBeLessThanOrEqual(8);
    }
    console.log(
      `learning-map ${viewportLabel} anchors=${JSON.stringify(anchorErrors)}`,
    );

    const selectedButton = page.locator(
      '.chapter-map__building-button[aria-pressed="true"]',
    );
    await expect(selectedButton).toHaveCount(1);
    const selectedArt = selectedButton.locator('.chapter-map__building-art');
    const selectedImage = await selectedArt.evaluate((element) => ({
      naturalHeight: (element as HTMLImageElement).naturalHeight,
      naturalWidth: (element as HTMLImageElement).naturalWidth,
      source: (element as HTMLImageElement).src,
    }));
    expect(selectedImage.naturalWidth).toBeGreaterThan(0);
    expect(selectedImage.naturalHeight).toBeGreaterThan(0);
    expect(selectedImage.source).toMatch(/\.png$/u);
    const selectedStyle = await Promise.all([
      selectedArt.evaluate((element) => {
        const style = getComputedStyle(element);
        return { animationName: style.animationName, filter: style.filter };
      }),
      selectedButton.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      ),
    ]);
    expect(selectedStyle[0].animationName).toContain('chapter-building-glow');
    expectGoldGlow(selectedStyle[0].filter);
    expect(selectedStyle[1]).toBe('rgba(0, 0, 0, 0)');

    const hoverCandidates = page
      .locator('.chapter-map__building-button:not([aria-pressed="true"])')
      .filter({ has: page.locator('.chapter-map__building-art') });
    const hoverIndex = await hoverCandidates.evaluateAll((buttons) =>
      buttons.findIndex((button) => {
        const art = button.querySelector<HTMLElement>(
          '.chapter-map__building-art',
        );
        const mapViewport = button.closest<HTMLElement>(
          '.chapter-map__viewport',
        );
        if (!art || !mapViewport) return false;
        const artRect = art.getBoundingClientRect();
        const mapRect = mapViewport.getBoundingClientRect();
        const left = Math.max(artRect.left, mapRect.left, 0);
        const right = Math.min(artRect.right, mapRect.right, window.innerWidth);
        const top = Math.max(artRect.top, mapRect.top, 0);
        const bottom = Math.min(
          artRect.bottom,
          mapRect.bottom,
          window.innerHeight,
        );
        if (right <= left || bottom <= top) return false;
        return button.contains(
          document.elementFromPoint((left + right) / 2, (top + bottom) / 2),
        );
      }),
    );
    expect(hoverIndex).toBeGreaterThanOrEqual(0);
    const hoverButton = hoverCandidates.nth(hoverIndex);
    const hoverArt = hoverButton.locator('.chapter-map__building-art');
    const beforeHover = await hoverArt.evaluate(
      (element) => getComputedStyle(element).filter,
    );
    const hoverPoint = await hoverArt.evaluate((element) => {
      const mapViewport = element.closest<HTMLElement>(
        '.chapter-map__viewport',
      );
      if (!mapViewport) throw new Error('Hover art has no map viewport');
      const art = element.getBoundingClientRect();
      const map = mapViewport.getBoundingClientRect();
      return {
        x:
          (Math.max(art.left, map.left, 0) +
            Math.min(art.right, map.right, window.innerWidth)) /
          2,
        y:
          (Math.max(art.top, map.top, 0) +
            Math.min(art.bottom, map.bottom, window.innerHeight)) /
          2,
      };
    });
    await page.mouse.move(hoverPoint.x, hoverPoint.y);
    expect(
      await hoverButton.evaluate((element) => element.matches(':hover')),
    ).toBe(true);
    const afterHover = await hoverArt.evaluate(
      (element) => getComputedStyle(element).filter,
    );
    expect(afterHover).not.toBe(beforeHover);
    expect(afterHover).toContain('drop-shadow');
    await expect(hoverButton).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(selectedArt).toHaveCSS('animation-name', 'none');
    const staticGlow = await selectedArt.evaluate(
      (element) => getComputedStyle(element).filter,
    );
    expectGoldGlow(staticGlow);
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    const singleContrastLocators = {
      dialogue: page.locator('.chapter-map__panel-heading h2'),
      hud: page.locator('.economy-summary__tokens'),
      scroll: page.locator('.chapter-map-scroll h1'),
    } as const;
    const contrasts: Record<string, number> = {};
    for (const [name, locator] of Object.entries(singleContrastLocators)) {
      const contrast = await readRenderedContrast(locator);
      contrasts[name] = contrast;
      expect(contrast, name).toBeGreaterThanOrEqual(MINIMUM_CONTRAST);
    }
    for (const [name, locator] of [
      ['medal', page.locator('.chapter-map__status-medal')],
      ['woodSign', page.locator('.chapter-map__building-label strong')],
    ] as const) {
      await expect(locator).toHaveCount(6);
      for (let index = 0; index < 6; index += 1) {
        const key = `${name}-${String(index + 1)}`;
        const contrast = await readRenderedContrast(locator.nth(index));
        contrasts[key] = contrast;
        expect(contrast, key).toBeGreaterThanOrEqual(MINIMUM_CONTRAST);
      }
    }
    console.log(
      `learning-map ${viewportLabel} contrast=${JSON.stringify(contrasts)}`,
    );

    const hudAvatar = page.locator('.hud-avatar:not(.hud-avatar--hero)');
    const hudAvatarArt = hudAvatar.locator('.blook-art');
    const companionArt = page.locator('.chapter-map__companion .blook-art');
    await expect(hudAvatarArt).toBeVisible();
    await expect(companionArt).toBeVisible();
    expect(await hudAvatarArt.getAttribute('src')).toBe(
      await companionArt.getAttribute('src'),
    );
    const avatarGeometry = await hudAvatar.evaluate((element) => {
      const image = element.querySelector<HTMLElement>('.blook-art');
      if (!image) throw new Error('Equipped HUD art is missing');
      const container = element.getBoundingClientRect();
      const art = image.getBoundingClientRect();
      return {
        art: {
          height: art.height,
          left: art.left,
          width: art.width,
        },
        container: {
          height: container.height,
          left: container.left,
          width: container.width,
        },
        error: Math.abs(
          art.left + art.width / 2 - (container.left + container.width / 2),
        ),
      };
    });
    console.log(
      `learning-map ${viewportLabel} avatar=${JSON.stringify(avatarGeometry)}`,
    );
    expect.soft(avatarGeometry.error).toBeLessThanOrEqual(1);

    const mapViewport = page.getByRole('region', {
      name: '村莊地圖探索區',
    });
    if (viewport.name === 'phone portrait') {
      const initial = await Promise.all([
        mapViewport.boundingBox(),
        selectedButton.boundingBox(),
        selectedButton
          .locator(
            'xpath=ancestor::*[contains(@class, "chapter-map__building")][1]',
          )
          .getAttribute('data-access-state'),
      ]);
      const [mapBox, selectedBox, accessState] = initial;
      if (!mapBox || !selectedBox) {
        throw new Error('Initial portrait camera geometry is missing');
      }
      expect(['available', 'completed']).toContain(accessState);
      expect(
        Math.abs(
          selectedBox.x + selectedBox.width / 2 - (mapBox.x + mapBox.width / 2),
        ),
      ).toBeLessThanOrEqual(8);

      const beforeDrag = await mapViewport.evaluate(
        (element) => element.scrollLeft,
      );
      const maximumScroll = await mapViewport.evaluate(
        (element) => element.scrollWidth - element.clientWidth,
      );
      const dragDelta = beforeDrag > maximumScroll / 2 ? 120 : -120;
      await dragMapBackground(
        mapViewport,
        dragDelta > 0 ? 1 : -1,
        Math.abs(dragDelta),
      );
      await expect
        .poll(async () =>
          Math.abs(
            (await mapViewport.evaluate((element) => element.scrollLeft)) -
              beforeDrag,
          ),
        )
        .toBeGreaterThan(80);

      await expectVisibleFocusRing(mapViewport);
      await mapViewport.press('Home');
      const beforeKeyboardPan = await mapViewport.evaluate(
        (element) => element.scrollLeft,
      );
      await mapViewport.press('ArrowRight');
      await expect
        .poll(() => mapViewport.evaluate((element) => element.scrollLeft))
        .toBeGreaterThan(beforeKeyboardPan);
      expect(
        await page.locator('html').evaluate((element) => element.scrollWidth),
      ).toBeLessThanOrEqual(viewport.width);
    }

    if (viewport.name === 'phone landscape') {
      const main = page.locator('#main-content');
      const beforeWheel = await main.evaluate((element) => element.scrollTop);
      await page.mouse.move(viewport.width / 2, viewport.height - 12);
      await page.mouse.wheel(0, viewport.height);
      await expect
        .poll(() => main.evaluate((element) => element.scrollTop))
        .toBeGreaterThan(beforeWheel);
    }

    const buildingButtons = page.locator('.chapter-map__building-button');
    for (let index = 0; index < 6; index += 1) {
      const button = buildingButtons.nth(index);
      await expectPointerReachable(button);
      await expect(button).toHaveAttribute('aria-pressed', 'true');
      const box = await button.boundingBox();
      expect(
        box?.width,
        `Chapter ${String(index + 1)} width`,
      ).toBeGreaterThanOrEqual(MINIMUM_TARGET);
      expect(
        box?.height,
        `Chapter ${String(index + 1)} height`,
      ).toBeGreaterThanOrEqual(MINIMUM_TARGET);
      await expectVisibleFocusRing(button);

      const accessState = await buildings
        .nth(index)
        .getAttribute('data-access-state');
      if (accessState === 'locked' || accessState === 'content_unavailable') {
        await expect(
          page
            .locator('.chapter-map__panel')
            .getByRole('link', { name: '進入複習與進度' }),
        ).toHaveCount(0);
      }
    }

    const menuToggle = page.getByRole('button', { name: 'MENU' });
    const menuPanel = page.locator('#hud-menu-panel');
    const menuBox = await menuToggle.boundingBox();
    expect(menuBox?.width).toBeGreaterThanOrEqual(MINIMUM_TARGET);
    expect(menuBox?.height).toBeGreaterThanOrEqual(MINIMUM_TARGET);
    await expectPointerReachable(menuToggle);
    await expect(menuPanel).toBeVisible();
    await page.mouse.click(viewport.width / 2, viewport.height - 2);
    await expect(menuPanel).toBeHidden();
    await expect(menuToggle).toHaveAttribute('aria-expanded', 'false');
    await expectPointerReachable(menuToggle);
    await expect(menuPanel).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menuPanel).toBeHidden();
    await expect(menuToggle).toBeFocused();
    await expectVisibleFocusRing(menuToggle);

    const accessible = buildings
      .filter({ has: page.locator('[data-access-state="available"]') })
      .first();
    const accessibleButton = page
      .locator(
        '.chapter-map__building[data-access-state="available"] .chapter-map__building-button, .chapter-map__building[data-access-state="completed"] .chapter-map__building-button',
      )
      .first();
    await expect(accessible.or(buildings.first())).toBeAttached();
    await expectPointerReachable(accessibleButton);
    const action = page
      .locator('.chapter-map__panel')
      .getByRole('link', { name: '進入複習與進度' });
    const actionBox = await action.boundingBox();
    expect(actionBox?.width).toBeGreaterThanOrEqual(MINIMUM_TARGET);
    expect(actionBox?.height).toBeGreaterThanOrEqual(MINIMUM_TARGET);
    await expectVisibleFocusRing(action);

    await mkdir(SCREENSHOT_ROOT, { recursive: true });
    await page.screenshot({
      animations: 'disabled',
      path: `${SCREENSHOT_ROOT}/${viewportLabel}.png`,
    });

    const actionHref = await action.getAttribute('href');
    if (!actionHref) throw new Error('Accessible chapter action has no href');
    await expectPointerReachable(action);
    await expect(page).toHaveURL(
      new RegExp(`${actionHref.replaceAll('/', '\\/')}$`, 'u'),
    );
    await expect(
      page.getByRole('heading', { name: /^Chapter \d+：/u }),
    ).toBeVisible();

    expect(runtimeErrors.consoleErrors).toEqual([]);
    expect(runtimeErrors.pageErrors).toEqual([]);
  });
}
