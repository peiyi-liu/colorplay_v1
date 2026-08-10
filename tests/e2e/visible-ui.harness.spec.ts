import { expect, test, type Locator, type Page } from '@playwright/test';

const VIEWPORTS = [
  { height: 568, width: 320 },
  { height: 812, width: 375 },
  { height: 852, width: 393 },
  { height: 900, width: 1440 },
] as const;

const expectNoDocumentXOverflow = async (page: Page) => {
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    ),
  ).toBe(0);
};

const expectTextNotClipped = async (locator: Locator) => {
  const clipping = await locator.evaluate((element) => ({
    clientHeight: element.clientHeight,
    clientWidth: element.clientWidth,
    overflowX: getComputedStyle(element).overflowX,
    overflowY: getComputedStyle(element).overflowY,
    scrollHeight: element.scrollHeight,
    scrollWidth: element.scrollWidth,
    textOverflow: getComputedStyle(element).textOverflow,
  }));
  const clipsX = ['clip', 'hidden'].includes(clipping.overflowX);
  const clipsY = ['clip', 'hidden'].includes(clipping.overflowY);
  if (clipsX) {
    expect(clipping.scrollWidth).toBeLessThanOrEqual(clipping.clientWidth + 1);
  }
  if (clipsY) {
    expect(clipping.scrollHeight).toBeLessThanOrEqual(
      clipping.clientHeight + 1,
    );
  }
  expect(clipping.textOverflow).not.toBe('ellipsis');
};

for (const viewport of VIEWPORTS) {
  for (const scenario of ['title', 'login', 'learning-map'] as const) {
    test(`${scenario} keeps readable text at ${String(viewport.width)}x${String(viewport.height)}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto(`/dev-harness/visible-ui.html?scenario=${scenario}`);
      await page.waitForLoadState('networkidle');
      await expectNoDocumentXOverflow(page);

      const textTargets =
        scenario === 'title'
          ? page.locator('.title-screen__logo, .title-screen__subtitle, .title-screen__start')
          : scenario === 'login'
            ? page.locator('.auth-portal h1, .auth-portal p, .auth-portal label, .auth-portal a, .auth-portal button')
            : page.locator('.chapter-map-scroll__copy > *, .chapter-map__building-label strong, .chapter-map__status-medal');
      for (const target of await textTargets.all()) {
        if (await target.isVisible()) await expectTextNotClipped(target);
      }

      if (scenario === 'login' && viewport.width === 1440) {
        const portal = page.locator('.auth-portal');
        const box = await portal.boundingBox();
        expect(box).not.toBeNull();
        if (box) expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
      }
    });
  }
}

test('title uses the village scene background', async ({ page }) => {
  await page.setViewportSize({ height: 900, width: 1440 });
  await page.goto('/dev-harness/visible-ui.html?scenario=title');
  const background = await page.locator('.title-screen').evaluate((element) => ({
    root: getComputedStyle(element).backgroundImage,
    after: getComputedStyle(element, '::after').backgroundImage,
  }));
  expect(`${background.root} ${background.after}`).toContain(
    'village-silhouette',
  );
});

test('learning-map captions wrap without colliding with status medals', async ({
  page,
}) => {
  await page.setViewportSize({ height: 852, width: 393 });
  await page.goto('/dev-harness/visible-ui.html?scenario=learning-map');
  const labels = page.locator('.chapter-map__building-label');
  const medals = page.locator('.chapter-map__status-medal');
  await expect(labels).toHaveCount(6);
  for (let index = 0; index < 6; index += 1) {
    const label = await labels.nth(index).boundingBox();
    const medal = await medals.nth(index).boundingBox();
    expect(label).not.toBeNull();
    expect(medal).not.toBeNull();
    if (label && medal) {
      expect(label.y + label.height).toBeLessThanOrEqual(medal.y + 0.5);
    }
  }
});
