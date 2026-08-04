import { mkdir } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

import { TEST_USERS } from '../fixtures/users';
import { signInStudent } from './helpers/auth';
import {
  expectPointerReachable,
  expectVisibleFocusRing,
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

const viewports = [
  { height: 720, name: 'desktop landscape', width: 1280 },
  { height: 375, name: 'phone landscape', width: 812 },
  { height: 812, name: 'phone portrait', width: 375 },
] as const;

for (const viewport of viewports) {
  test(`student learning map fills the viewport below the HUD at ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await signInStudent(page, TEST_USERS.learningStudent);

    await expect(
      page.getByRole('heading', { level: 1, name: '學習地圖' }),
    ).toBeVisible();

    const layout = await page.locator('#main-content').evaluate((main) => {
      const lobby = main.querySelector<HTMLElement>('.lobby');
      const mapShell = main.querySelector<HTMLElement>('.chapter-map-shell');

      if (!lobby || !mapShell) {
        throw new Error('Learning map layout was not rendered');
      }

      const mainRect = main.getBoundingClientRect();
      const lobbyRect = lobby.getBoundingClientRect();
      const mapShellRect = mapShell.getBoundingClientRect();

      return {
        documentScrollWidth: document.documentElement.scrollWidth,
        lobbyBottom: lobbyRect.bottom,
        lobbyLeft: lobbyRect.left,
        lobbyRight: lobbyRect.right,
        lobbyTop: lobbyRect.top,
        mainBottom: mainRect.bottom,
        mainLeft: mainRect.left,
        mainRight: mainRect.right,
        mainTop: mainRect.top,
        mapShellWidth: mapShellRect.width,
        viewportWidth: window.innerWidth,
      };
    });

    expect(layout.documentScrollWidth).toBeLessThanOrEqual(
      layout.viewportWidth,
    );
    expect(Math.abs(layout.lobbyLeft - layout.mainLeft)).toBeLessThanOrEqual(1);
    expect(Math.abs(layout.lobbyRight - layout.mainRight)).toBeLessThanOrEqual(
      1,
    );
    expect(Math.abs(layout.lobbyTop - layout.mainTop)).toBeLessThanOrEqual(1);
    expect(layout.lobbyBottom).toBeGreaterThanOrEqual(layout.mainBottom - 1);
    expect(layout.mapShellWidth).toBeGreaterThanOrEqual(
      layout.viewportWidth - 1,
    );

    const firstBuilding = page.locator('.chapter-map__building-button').first();
    const buildingBox = await firstBuilding.boundingBox();
    if (
      buildingBox &&
      (buildingBox.y < 0 ||
        buildingBox.y + buildingBox.height > viewport.height)
    ) {
      await page.mouse.move(viewport.width / 2, viewport.height - 12);
      await page.mouse.wheel(0, viewport.height);
    }
    const mapViewport = page.getByRole('region', {
      name: '村莊地圖探索區',
    });
    await mapViewport.press('Home');
    await expect(firstBuilding).toBeInViewport();
    await firstBuilding.click();
    await expect(firstBuilding).toHaveAttribute('aria-pressed', 'true');
  });
}

test('keeps the lower chapter row operable beside a wrapped dialogue at 812 by 375', async ({
  page,
}) => {
  await page.setViewportSize({ height: 375, width: 812 });
  await signInStudent(page, TEST_USERS.learningStudent);

  const mapViewport = page.locator('.chapter-map__viewport');
  const dialogueLane = page.locator('.chapter-map__dialogue-lane');
  const panel = page.locator('.chapter-map__panel');
  const map = page.getByRole('list', { name: '六章學習地圖' });

  await expect(mapViewport).toBeVisible();
  await expect(dialogueLane).toBeVisible();

  const initialViewportBox = await mapViewport.boundingBox();
  if (
    initialViewportBox &&
    initialViewportBox.y + initialViewportBox.height > 375
  ) {
    await page.mouse.move(406, 363);
    await page.mouse.wheel(
      0,
      initialViewportBox.y + initialViewportBox.height - 363,
    );
  }

  for (const chapterNumber of [4, 5, 6]) {
    const button = map.getByRole('button', {
      name: new RegExp(`^Chapter ${String(chapterNumber)} `, 'u'),
    });
    await expect(button).toBeInViewport();
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');

    const geometry = await page.evaluate(() => {
      const viewport = document.querySelector<HTMLElement>(
        '.chapter-map__viewport',
      );
      const lane = document.querySelector<HTMLElement>(
        '.chapter-map__dialogue-lane',
      );
      const dialogue = document.querySelector<HTMLElement>(
        '.chapter-map__panel',
      );
      const heading = dialogue?.querySelector<HTMLElement>(
        '.chapter-map__panel-heading',
      );
      const progress = dialogue?.querySelector<HTMLElement>(
        '.chapter-map__progress',
      );
      const outcome = dialogue?.querySelector<HTMLElement>(
        '.chapter-map__panel-outcome',
      );
      const lowerBuildings = Array.from(
        document.querySelectorAll<HTMLElement>(
          '.chapter-map__building:nth-child(n + 4)',
        ),
      );

      if (
        !viewport ||
        !lane ||
        !dialogue ||
        !heading ||
        !progress ||
        !outcome
      ) {
        throw new Error('Chapter map geometry targets are missing');
      }

      const viewportRect = viewport.getBoundingClientRect();
      const laneRect = lane.getBoundingClientRect();
      const dialogueRect = dialogue.getBoundingClientRect();
      const headingRect = heading.getBoundingClientRect();
      const progressRect = progress.getBoundingClientRect();
      const outcomeRect = outcome.getBoundingClientRect();

      return {
        dialogueTop: dialogueRect.top,
        laneTop: laneRect.top,
        lowerBuildingBottoms: lowerBuildings.map((building) => {
          const button = building.querySelector<HTMLElement>(
            '.chapter-map__building-button',
          );
          const label = building.querySelector<HTMLElement>(
            '.chapter-map__building-label',
          );
          const medal = building.querySelector<HTMLElement>(
            '.chapter-map__status-medal',
          );
          if (!button || !label || !medal) {
            throw new Error('Lower chapter pointer target is incomplete');
          }
          return Math.max(
            button.getBoundingClientRect().bottom,
            label.getBoundingClientRect().bottom,
            medal.getBoundingClientRect().bottom,
          );
        }),
        outcomeTop: outcomeRect.top,
        summaryBottom: Math.max(headingRect.bottom, progressRect.bottom),
        viewportBottom: viewportRect.bottom,
      };
    });

    expect(geometry.laneTop).toBeGreaterThanOrEqual(
      geometry.viewportBottom - 1,
    );
    expect(geometry.dialogueTop).toBeGreaterThanOrEqual(
      geometry.viewportBottom - 1,
    );
    expect(geometry.outcomeTop).toBeGreaterThanOrEqual(
      geometry.summaryBottom - 1,
    );
    for (const buildingBottom of geometry.lowerBuildingBottoms) {
      expect(buildingBottom).toBeLessThanOrEqual(geometry.viewportBottom + 1);
      expect(buildingBottom).toBeLessThanOrEqual(geometry.dialogueTop + 1);
    }
  }

  const accessibleChapter = map
    .getByRole('button', { name: /可進入|已完成/u })
    .first();
  await accessibleChapter.click();

  const action = panel.getByRole('link', { name: '進入複習與進度' });
  await expect(action).toBeVisible();
  const actionMetrics = await action.evaluate((element) => ({
    height: element.getBoundingClientRect().height,
    minHeight: Number.parseFloat(getComputedStyle(element).minHeight),
  }));
  expect(actionMetrics.minHeight).toBeGreaterThanOrEqual(44);
  expect(actionMetrics.height).toBeGreaterThanOrEqual(44);
  const actionHref = await action.getAttribute('href');
  if (!actionHref) throw new Error('Chapter dialogue action is missing href');

  await action.click();
  await expect(page).toHaveURL(
    new RegExp(`${actionHref.replaceAll('/', '\\/')}$`, 'u'),
  );
  await expect(
    page.getByRole('heading', { name: /^Chapter \d+：/u }),
  ).toBeVisible();
});

test('recenters after portrait resize and drags from the real village background image', async ({
  page,
}) => {
  await page.setViewportSize({ height: 375, width: 812 });
  await signInStudent(page, TEST_USERS.learningStudent);

  const viewport = page.getByRole('region', { name: '村莊地圖探索區' });
  const map = page.getByRole('list', { name: '六章學習地圖' });
  const sixth = map.getByRole('button', { name: /^Chapter 6 /u });
  await sixth.click();
  await expect(sixth).toBeFocused();

  await page.setViewportSize({ height: 812, width: 375 });
  await expect
    .poll(() => viewport.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(0);
  await expect(sixth).toBeFocused();
  await expect(sixth).toBeInViewport();

  const centered = await Promise.all([
    viewport.boundingBox(),
    sixth.boundingBox(),
  ]);
  const [viewportBox, sixthBox] = centered;
  if (!viewportBox || !sixthBox) {
    throw new Error('Portrait camera geometry is unavailable');
  }
  expect(
    Math.abs(
      sixthBox.x + sixthBox.width / 2 - (viewportBox.x + viewportBox.width / 2),
    ),
  ).toBeLessThanOrEqual(8);

  const first = map.getByRole('button', { name: /^Chapter 1 /u });
  await first.click();
  await expect(first).toBeFocused();
  await expect
    .poll(() => viewport.evaluate((element) => element.scrollLeft))
    .toBe(0);

  await expect(page.locator('.chapter-map__base')).toHaveAttribute(
    'draggable',
    'false',
  );
  const backgroundPoint = await viewport.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const xRatios = [0.8, 0.7, 0.6, 0.5];
    const yRatios = [0.5, 0.18, 0.82, 0.65, 0.35];
    const hits = new Set<string>();

    for (const xRatio of xRatios) {
      for (const yRatio of yRatios) {
        const x = rect.left + rect.width * xRatio;
        const y = rect.top + rect.height * yRatio;
        const hit = document.elementFromPoint(x, y);
        if (hit?.classList.contains('chapter-map__base')) return { x, y };
        hits.add(
          `${hit?.tagName ?? 'none'}.${
            hit instanceof HTMLElement ? hit.className : ''
          }`,
        );
      }
    }

    throw new Error(
      `No visible blank point resolves to the village base image; hits=${[
        ...hits,
      ].join(',')}`,
    );
  });
  const beforeDrag = await viewport.evaluate((element) => element.scrollLeft);
  await page.mouse.move(backgroundPoint.x, backgroundPoint.y);
  await page.mouse.down();
  await page.mouse.move(backgroundPoint.x - 120, backgroundPoint.y, {
    steps: 12,
  });
  await page.mouse.up();

  await expect
    .poll(() => viewport.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(beforeDrag + 80);
});

const rectangleGap = async (
  page: Parameters<typeof signInStudent>[0],
): Promise<Readonly<{ nearest: number; pairs: string[] }>> =>
  page.evaluate(() => {
    const scroll = document
      .querySelector<HTMLElement>('.chapter-map-scroll')
      ?.getBoundingClientRect();
    if (!scroll) throw new Error('Learning-map scroll heading is missing');

    const candidates = Array.from(
      document.querySelectorAll<HTMLElement>(
        '.hud-top, .hud-command, .chapter-map__building-visual, .chapter-map__status-medal',
      ),
    )
      .map((element) => ({
        label: element.className,
        rect: element.getBoundingClientRect(),
      }))
      .filter(
        ({ rect }) =>
          rect.width > 0 &&
          rect.height > 0 &&
          rect.right > 0 &&
          rect.bottom > 0 &&
          rect.left < window.innerWidth &&
          rect.top < window.innerHeight,
      );
    const gaps = candidates.map(({ label, rect }) => {
      const horizontal = Math.max(
        rect.left - scroll.right,
        scroll.left - rect.right,
        0,
      );
      const vertical = Math.max(
        rect.top - scroll.bottom,
        scroll.top - rect.bottom,
        0,
      );
      return {
        gap: Math.hypot(horizontal, vertical),
        label: `${label}[${rect.left.toFixed(1)},${rect.top.toFixed(1)},${rect.right.toFixed(1)},${rect.bottom.toFixed(1)}] scroll[${scroll.left.toFixed(1)},${scroll.top.toFixed(1)},${scroll.right.toFixed(1)},${scroll.bottom.toFixed(1)}]`,
      };
    });
    const nearest = Math.min(...gaps.map(({ gap }) => gap));
    return {
      nearest,
      pairs: gaps
        .filter(({ gap }) => Math.abs(gap - nearest) < 0.01)
        .map(({ gap, label }) => `${label}:${gap.toFixed(2)}`),
    };
  });

for (const viewport of viewports) {
  test(`closes the complete fullscreen village-map acceptance at ${viewport.name}`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
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

    const gap = await rectangleGap(page);
    console.log(
      `learning-map ${viewport.width}x${viewport.height} nearest-gap=${gap.nearest.toFixed(2)} pairs=${gap.pairs.join(',')}`,
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
      `learning-map ${viewport.width}x${viewport.height} world=${JSON.stringify(worldGeometry)}`,
    );
    expect
      .soft(gap.nearest, gap.pairs.join(', '))
      .toBeGreaterThanOrEqual(MINIMUM_GAP);

    const buildings = page.locator('.chapter-map__building');
    await expect(buildings).toHaveCount(6);
    const anchorErrors: Array<
      Readonly<{ chapter: number; x: number; y: number }>
    > = [];
    for (let index = 0; index < 6; index += 1) {
      const error = await readWorldAnchorError(buildings.nth(index));
      anchorErrors.push({ chapter: index + 1, ...error });
      expect(error.x).toBeLessThanOrEqual(8);
      expect(error.y).toBeLessThanOrEqual(8);
    }
    console.log(
      `learning-map ${viewport.width}x${viewport.height} anchors=${JSON.stringify(anchorErrors)}`,
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
    expect(selectedStyle[0].filter).not.toBe('none');
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
    expect(staticGlow).toContain('drop-shadow');
    expect(staticGlow).not.toBe('none');
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    const contrastLocators = {
      dialogue: page.locator('.chapter-map__panel-heading h2'),
      hud: page.locator('.economy-summary__tokens'),
      medal: page.locator('.chapter-map__status-medal').first(),
      scroll: page.locator('.chapter-map-scroll h1'),
      woodSign: page.locator('.chapter-map__building-label strong').first(),
    } as const;
    const contrasts: Record<string, number> = {};
    for (const [name, locator] of Object.entries(contrastLocators)) {
      const contrast = await readRenderedContrast(locator);
      contrasts[name] = contrast;
      expect(contrast, name).toBeGreaterThanOrEqual(MINIMUM_CONTRAST);
    }
    console.log(
      `learning-map ${viewport.width}x${viewport.height} contrast=${JSON.stringify(contrasts)}`,
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
      `learning-map ${viewport.width}x${viewport.height} avatar=${JSON.stringify(avatarGeometry)}`,
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

      const backgroundPoint = await mapViewport.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        for (const xRatio of [0.8, 0.7, 0.6]) {
          for (const yRatio of [0.5, 0.2, 0.8, 0.65, 0.35]) {
            const x = rect.left + rect.width * xRatio;
            const y = rect.top + rect.height * yRatio;
            if (
              document
                .elementFromPoint(x, y)
                ?.classList.contains('chapter-map__base')
            ) {
              return { x, y };
            }
          }
        }
        throw new Error('Portrait map has no real background drag origin');
      });
      const beforeDrag = await mapViewport.evaluate(
        (element) => element.scrollLeft,
      );
      const maximumScroll = await mapViewport.evaluate(
        (element) => element.scrollWidth - element.clientWidth,
      );
      const dragDelta = beforeDrag > maximumScroll / 2 ? 120 : -120;
      await page.mouse.move(backgroundPoint.x, backgroundPoint.y);
      await page.mouse.down();
      await page.mouse.move(backgroundPoint.x + dragDelta, backgroundPoint.y, {
        steps: 12,
      });
      await page.mouse.up();
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
      path: `${SCREENSHOT_ROOT}/${viewport.width}x${viewport.height}.png`,
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

test('uses a static gold outline for the profile reduced-motion projection', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.route('**/rest/v1/profiles?*', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    const payload = (await response.json()) as
      Array<Record<string, unknown>> | Record<string, unknown>;
    await route.fulfill({
      json: Array.isArray(payload)
        ? payload.map((profile) => ({ ...profile, reduced_motion: true }))
        : { ...payload, reduced_motion: true },
      response,
    });
  });
  await page.setViewportSize({ height: 720, width: 1280 });
  await signInStudent(page, TEST_USERS.learningStudent);

  await expect(page.locator('html')).toHaveAttribute(
    'data-reduced-motion',
    'true',
  );
  const selectedArt = page.locator(
    '.chapter-map__building-button[aria-pressed="true"] .chapter-map__building-art',
  );
  await expect(selectedArt).toHaveCSS('animation-name', 'none');
  const filter = await selectedArt.evaluate(
    (element) => getComputedStyle(element).filter,
  );
  expect(filter).toContain('drop-shadow');
  expect(filter).not.toBe('none');
});

test('keeps the learning map presentable when only the inventory snapshot fails', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.route('**/rest/v1/rpc/get_my_blook_inventory', async (route) => {
    await route.fulfill({
      body: JSON.stringify({ message: 'TASK5_PRESENTATION_FALLBACK' }),
      contentType: 'application/json',
      status: 503,
    });
  });
  await page.setViewportSize({ height: 720, width: 1280 });
  await signInStudent(page, TEST_USERS.learningStudent);

  await expect(
    page.getByRole('heading', { level: 1, name: '學習地圖' }),
  ).toBeVisible();
  await expect(page.locator('.hud-avatar--hero')).toBeVisible();
  const fallbackArt = page.locator('.chapter-map__companion .blook-art');
  await expect(fallbackArt).toHaveAttribute(
    'src',
    '/assets/blooks/little_fox.png',
  );
  const resilience = await fallbackArt.evaluate((element) => {
    const container = element.parentElement;
    if (!container) throw new Error('Fallback art has no centering container');
    const containerStyle = getComputedStyle(container);
    const artStyle = getComputedStyle(element);
    return {
      display: containerStyle.display,
      objectFit: artStyle.objectFit,
      placeItems: containerStyle.placeItems,
    };
  });
  expect(resilience).toEqual({
    display: 'grid',
    objectFit: 'contain',
    placeItems: 'center',
  });
});
