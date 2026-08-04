import { expect, test } from '@playwright/test';

import { TEST_USERS } from '../fixtures/users';
import { signInStudent } from './helpers/auth';

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
