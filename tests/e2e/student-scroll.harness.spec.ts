import { expect, test, type Locator, type Page } from '@playwright/test';

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

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 393, height: 852 },
]) {
  test(`six buildings touch their terrain anchors at ${String(viewport.width)}x${String(viewport.height)}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/dev-harness/learning-map.html');
    await expect(page.locator('.chapter-map__building-art')).toHaveCount(6);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const world = document.querySelector('.chapter-map__world');
          if (!world) throw new Error('CHAPTER_MAP_WORLD_MISSING');
          const bounds = world.getBoundingClientRect();
          const mobile = innerWidth < 768;
          return Array.from(
            document.querySelectorAll<HTMLElement>('.chapter-map__building'),
          )
            .map((building) => {
              const art = building.querySelector('.chapter-map__building-art');
              if (!art) throw new Error('CHAPTER_MAP_ART_MISSING');
              const rect = art.getBoundingClientRect();
              const x = Number(
                mobile
                  ? building.dataset.mobileGroundX
                  : building.dataset.groundX,
              );
              const y = Number(
                mobile
                  ? building.dataset.mobileGroundY
                  : building.dataset.groundY,
              );
              return Math.max(
                Math.abs(
                  rect.left +
                    rect.width / 2 -
                    (bounds.left + (x / (mobile ? 941 : 1672)) * bounds.width),
                ),
                Math.abs(
                  rect.bottom -
                    (bounds.top + (y / (mobile ? 1672 : 941)) * bounds.height),
                ),
              );
            })
            .every((error) => error <= 1);
        }),
      )
      .toBe(true);
  });
}
