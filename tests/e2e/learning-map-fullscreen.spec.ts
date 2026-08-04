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
    await expect(firstBuilding).toBeInViewport();
    await firstBuilding.click();
    await expect(firstBuilding).toHaveAttribute('aria-pressed', 'true');
  });
}
