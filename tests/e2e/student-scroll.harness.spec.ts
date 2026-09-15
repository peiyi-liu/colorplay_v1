import { expect, test, type Locator, type Page } from '@playwright/test';
import { LEARNING_MAP_PLATFORMS } from '../fixtures/learning-map-platforms';

// Frontend regression only: this is not Android/Samsung real-device evidence.
// Do not use scrollIntoView or click's auto-scroll to mask a scroll-chain trap.
async function scrollContent(page: Page) {
  const main = page.locator('#main-content');
  const box = await main.boundingBox();
  if (!box) throw new Error('STUDENT_SCROLL_MAIN_MISSING');
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('STUDENT_SCROLL_VIEWPORT_MISSING');
  await page.mouse.move(
    viewport.width / 2,
    Math.min(box.y + 160, viewport.height - 30),
  );
  await page.mouse.wheel(0, 2000);
}

async function expectReachable(action: Locator) {
  await expect
    .poll(() =>
      action.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const x = box.left + box.width / 2;
        const y = box.top + box.height / 2;
        const hit = document.elementFromPoint(x, y);
        return (
          box.top >= 0 &&
          box.bottom <= innerHeight &&
          box.left >= 0 &&
          box.right <= innerWidth &&
          (hit === element || (hit !== null && element.contains(hit)))
        );
      }),
    )
    .toBe(true);
}

for (const viewport of [
  { width: 375, height: 812 },
  { width: 320, height: 568 },
  { width: 812, height: 375 },
]) {
  for (const scenario of ['correct', 'incorrect']) {
    test(`quiz ${scenario} action reachable by scrolling at ${String(viewport.width)}x${String(viewport.height)}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto(`/dev-harness/quiz-session.html?scenario=${scenario}`);
      const next = page.getByRole('button', { name: /下一題/u });
      await expect(next).toBeVisible();
      await scrollContent(page);
      await expectReachable(next);
      await next.click();
      await expect(
        page.getByRole('heading', { name: /色彩表示/u }),
      ).toBeVisible();
    });
  }

  test(`learning map stays full bleed and its action remains reachable at ${String(viewport.width)}x${String(viewport.height)}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/dev-harness/learning-map.html');
    const action = page.getByRole('link', { name: '繼續第三章' });
    await expect(action).toBeVisible();
    await scrollContent(page);
    await expectReachable(action);
    const frame = await page.locator('.game-stage').boundingBox();
    expect(frame?.x).toBe(0);
    expect(frame?.width).toBe(viewport.width);
  });
}

test('Live join action remains reachable in a reduced-height phone viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 400 });
  await page.goto('/dev-harness/live-join.html');
  const input = page.getByLabel('輸入 6 位加入代碼');
  await input.fill('123456');
  const join = page.getByRole('button', { name: '加入課堂', exact: true });
  await scrollContent(page);
  await expectReachable(join);
  await join.click();
  await expect(page.getByRole('alert')).toContainText('代碼無效或課堂尚未開放');
});

// Compare visible footprint centers to independently calibrated artwork pads.
// Reading data-ground-* here would only prove agreement with the implementation.
async function readMapFeet(page: Page) {
  return page.evaluate(() => {
    const mobile = innerWidth < 768;
    const base = document.querySelector<HTMLImageElement>(
      mobile ? '.chapter-map__base--mobile' : '.chapter-map__base--desktop',
    );
    if (!base) throw new Error('CHAPTER_MAP_BASE_MISSING');
    const bounds = base.getBoundingClientRect();
    return Array.from(
      document.querySelectorAll<HTMLImageElement>('.chapter-map__building-art'),
    ).map((art) => {
      const rect = art.getBoundingClientRect();
      return {
        x:
          ((rect.left + rect.width / 2 - bounds.left) / bounds.width) *
          (mobile ? 941 : 1672),
        y:
          ((rect.top + rect.height * (336 / 384) - bounds.top) /
            bounds.height) *
          (mobile ? 1672 : 941),
        width: rect.width,
        height: rect.height,
      };
    });
  });
}

async function expectCenteredFeet(page: Page) {
  const mobile = (page.viewportSize()?.width ?? 0) < 768;
  const feet = await readMapFeet(page);
  expect(feet).toHaveLength(6);
  for (const [index, foot] of feet.entries()) {
    const pad = LEARNING_MAP_PLATFORMS[mobile ? 'mobile' : 'desktop'][index];
    if (!pad) throw new Error('CHAPTER_MAP_REFERENCE_PAD_MISSING');
    expect(
      Math.abs(foot.x - pad.x),
      `chapter ${String(index + 1)} x`,
    ).toBeLessThan(1);
    expect(
      Math.abs(foot.y - pad.y),
      `chapter ${String(index + 1)} y`,
    ).toBeLessThan(1);
  }
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 393, height: 852 },
  { width: 812, height: 375 },
]) {
  const label = `${String(viewport.width)}x${String(viewport.height)}`;
  test(`six footprint centers stay on artwork pads at ${label}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/dev-harness/learning-map.html');
    await expect(page.locator('.chapter-map__building-art')).toHaveCount(6);
    await expectCenteredFeet(page);
    await page.reload();
    await expect(page.locator('.chapter-map__building-art')).toHaveCount(6);
    await expectCenteredFeet(page);
  });

  test(`delayed first-entry artwork does not shift feet at ${label}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    let releaseImages!: () => void;
    const imagesReady = new Promise<void>((resolve) => {
      releaseImages = resolve;
    });
    await page.route('**/src/assets/learning-map/*', async (route) => {
      if (route.request().resourceType() === 'image') await imagesReady;
      await route.continue();
    });
    try {
      await page.goto('/dev-harness/learning-map.html', {
        waitUntil: 'domcontentloaded',
      });
      const art = page.locator('.chapter-map__building-art');
      await expect(art).toHaveCount(6);
      expect(
        await art.evaluateAll((images) =>
          images.every(
            (image) => (image as HTMLImageElement).naturalWidth === 0,
          ),
        ),
      ).toBe(true);
      const before = await readMapFeet(page);
      releaseImages();
      await expect
        .poll(() =>
          art.evaluateAll((images) =>
            images.every(
              (image) =>
                (image as HTMLImageElement).complete &&
                (image as HTMLImageElement).naturalWidth > 0,
            ),
          ),
        )
        .toBe(true);
      const after = await readMapFeet(page);
      for (const [index, foot] of before.entries()) {
        const loaded = after[index];
        if (!loaded) throw new Error('CHAPTER_MAP_LOADED_ART_MISSING');
        expect(Math.abs(foot.width - loaded.width)).toBeLessThan(0.5);
        expect(Math.abs(foot.height - loaded.height)).toBeLessThan(0.5);
        expect(Math.abs(foot.x - loaded.x)).toBeLessThan(0.1);
        expect(Math.abs(foot.y - loaded.y)).toBeLessThan(0.1);
      }
      await expectCenteredFeet(page);
    } finally {
      releaseImages();
      await page.unrouteAll({ behavior: 'wait' });
    }
  });
}

test('portrait-landscape-portrait switch keeps all six feet centered', async ({
  page,
}) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto('/dev-harness/learning-map.html');
  await expect(page.locator('.chapter-map__building-art')).toHaveCount(6);
  for (const viewport of [
    { width: 393, height: 852 },
    { width: 852, height: 393 },
    { width: 393, height: 852 },
  ]) {
    await page.setViewportSize(viewport);
    await expectCenteredFeet(page);
  }
});
