import { expect, type Page } from '@playwright/test';

export async function expectSingleBackButtonBelowHud(
  page: Page,
  accessibleName: string,
) {
  const hud = page.locator('.hud-top--student');
  const scene = page.locator('#main-content');
  const backButton = scene.getByRole('button', { name: accessibleName });
  await expect(hud).toBeVisible();
  await expect(backButton).toBeVisible();
  await expect(hud.getByRole('button', { name: accessibleName })).toHaveCount(
    0,
  );
  await expect(page.getByRole('button', { name: accessibleName })).toHaveCount(
    1,
  );

  const backBox = await backButton.boundingBox();
  const hudBox = await hud.boundingBox();
  const avatarBox = await hud.locator('.hud-avatar').boundingBox();
  const pageHeading = page
    .locator('.chapter-archive__title-group')
    .or(page.locator('.chapter-review-reader__heading-group'));
  await expect(pageHeading).toBeVisible();
  const pageHeadingBox = await pageHeading.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { bottom: box.bottom, left: box.left, top: box.top };
  });
  expect(backBox?.x).toBeCloseTo(avatarBox?.x ?? -1, 0);
  expect(backBox?.y ?? -1).toBeGreaterThanOrEqual(hudBox?.height ?? Infinity);
  expect(backBox?.y ?? Infinity).toBeLessThan(pageHeadingBox.bottom);
  expect((backBox?.y ?? -1) + (backBox?.height ?? 0)).toBeGreaterThan(
    pageHeadingBox.top,
  );
  expect(
    (backBox?.x ?? Infinity) + (backBox?.width ?? Infinity),
  ).toBeLessThanOrEqual(pageHeadingBox.left + 1);
}
