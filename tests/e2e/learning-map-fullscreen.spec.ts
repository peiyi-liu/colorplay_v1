import { expect, test } from '@playwright/test';

import { TEST_USERS } from '../fixtures/users';
import { signInStudent } from './helpers/auth';
import {
  dragMapBackground,
  findReachableBackgroundPoint,
} from './helpers/learning-map';

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

test('desktop village imagery covers the usable learning stage beneath its overlays', async ({
  page,
}) => {
  await page.setViewportSize({ height: 720, width: 1280 });
  await signInStudent(page, TEST_USERS.learningStudent);
  await expect(
    page.getByRole('heading', { level: 1, name: '學習地圖' }),
  ).toBeVisible();

  const geometry = await page.evaluate(() => {
    type MeasuredRect = Readonly<{
      bottom: number;
      height: number;
      left: number;
      right: number;
      top: number;
      width: number;
    }>;
    const selectors = {
      lobby: '.lobby--map-fullscreen',
      panel: '.chapter-map__panel',
      scroll: '.chapter-map-scroll',
      viewport: '.chapter-map__viewport',
      world: '.chapter-map__world',
    } as const;
    const rectangles = Object.fromEntries(
      Object.entries(selectors).map(([name, selector]) => {
        const element = document.querySelector<HTMLElement>(selector);
        if (!element) throw new Error(`Missing map geometry: ${selector}`);
        const rect = element.getBoundingClientRect();
        return [
          name,
          {
            bottom: rect.bottom,
            height: rect.height,
            left: rect.left,
            right: rect.right,
            top: rect.top,
            width: rect.width,
          },
        ];
      }),
    ) as Record<keyof typeof selectors, MeasuredRect>;
    const { lobby, panel, scroll, viewport, world } = rectangles;
    return {
      dialogueInsideMap:
        panel.top >= viewport.top + 8 && panel.bottom <= viewport.bottom - 8,
      lobby,
      mapStageGaps: {
        bottom: lobby.bottom - viewport.bottom,
        left: viewport.left - lobby.left,
        right: lobby.right - viewport.right,
        top: viewport.top - lobby.top,
      },
      panel,
      scroll,
      scrollInsideMap:
        scroll.top >= viewport.top + 8 && scroll.bottom <= viewport.bottom - 8,
      viewport,
      world,
      worldGutters: {
        bottom: viewport.bottom - world.bottom,
        left: world.left - viewport.left,
        right: viewport.right - world.right,
        top: world.top - viewport.top,
      },
    };
  });
  console.log(`learning-map desktop-cover=${JSON.stringify(geometry)}`);

  const screenshotPath = process.env.LEARNING_MAP_GEOMETRY_SCREENSHOT;
  if (screenshotPath) {
    await page.screenshot({ animations: 'disabled', path: screenshotPath });
  }

  for (const [edge, gap] of Object.entries(geometry.mapStageGaps)) {
    expect.soft(gap, `map-to-stage ${edge} gap`).toBeLessThanOrEqual(1);
  }
  for (const [edge, gutter] of Object.entries(geometry.worldGutters)) {
    expect.soft(gutter, `world-to-map ${edge} gutter`).toBeLessThanOrEqual(4);
  }
  expect.soft(geometry.scrollInsideMap, 'scroll must overlay map').toBe(true);
  expect
    .soft(geometry.dialogueInsideMap, 'dialogue must overlay map')
    .toBe(true);

  const buildingButtons = page.locator('.chapter-map__building-button');
  await expect(buildingButtons).toHaveCount(6);
  for (let index = 0; index < 6; index += 1) {
    await expect(buildingButtons.nth(index)).toBeInViewport();
  }
  await expect(
    page.getByRole('link', { name: '進入複習與進度' }),
  ).toBeInViewport();
});

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
  await findReachableBackgroundPoint(viewport, -1);
  const beforeDrag = await viewport.evaluate((element) => element.scrollLeft);
  await dragMapBackground(viewport, -1, 120);

  await expect
    .poll(() => viewport.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(beforeDrag + 80);
});

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
      Record<string, unknown>[] | Record<string, unknown>;
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
  expectGoldGlow(filter);
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
