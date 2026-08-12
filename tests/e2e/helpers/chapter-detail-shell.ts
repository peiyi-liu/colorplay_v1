import { expect, type Page } from '@playwright/test';

export async function expectSingleBackButtonInHud(
  page: Page,
  accessibleName: string,
) {
  const hud = page.locator('.hud-top--student');
  const backButton = hud.getByRole('button', { name: accessibleName });
  await expect(hud).toBeVisible();
  await expect(backButton).toBeVisible();
  await expect(
    page.getByRole('button', { name: accessibleName }),
  ).toHaveCount(1);

  const backBox = await backButton.boundingBox();
  const hudBox = await hud.boundingBox();
  expect(backBox?.x ?? Infinity).toBeLessThanOrEqual(24);
  expect(backBox?.y ?? -1).toBeGreaterThanOrEqual(hudBox?.y ?? 0);
  expect(
    (backBox?.y ?? Infinity) + (backBox?.height ?? Infinity),
  ).toBeLessThanOrEqual(
    (hudBox?.y ?? -Infinity) + (hudBox?.height ?? -Infinity),
  );
}
