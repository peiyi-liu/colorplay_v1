import { expect, test, type Locator, type Page } from '@playwright/test';

const VIEWPORTS = [
  { height: 568, width: 320 },
  { height: 812, width: 375 },
  { height: 852, width: 393 },
  { height: 900, width: 1280 },
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
  expect(clipping.scrollWidth).toBeLessThanOrEqual(clipping.clientWidth + 1);
  if (['clip', 'hidden'].includes(clipping.overflowY)) {
    expect(clipping.scrollHeight).toBeLessThanOrEqual(
      clipping.clientHeight + 1,
    );
  }
  expect(clipping.textOverflow).not.toBe('ellipsis');
};

const expectNoTextOverlap = async (page: Page, rootSelector: string) => {
  const overlaps = await page.locator(rootSelector).evaluate((root) => {
    const candidates = Array.from(
      root.querySelectorAll<HTMLElement>(
        'h1, h2, h3, p, a, button, label, strong',
      ),
    ).filter((element) => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        box.width > 1 &&
        box.height > 1 &&
        (element.textContent?.trim().length ?? 0) > 0
      );
    });
    const collisions: string[] = [];
    for (let left = 0; left < candidates.length; left += 1) {
      for (let right = left + 1; right < candidates.length; right += 1) {
        const a = candidates[left];
        const b = candidates[right];
        if (!a || !b || a.contains(b) || b.contains(a)) continue;
        const first = a.getBoundingClientRect();
        const second = b.getBoundingClientRect();
        const overlapWidth =
          Math.min(first.right, second.right) -
          Math.max(first.left, second.left);
        const overlapHeight =
          Math.min(first.bottom, second.bottom) -
          Math.max(first.top, second.top);
        if (overlapWidth > 1 && overlapHeight > 1) {
          collisions.push(
            `${a.tagName}:${(a.textContent ?? '').trim().slice(0, 24)} <> ${b.tagName}:${(b.textContent ?? '').trim().slice(0, 24)}`,
          );
        }
      }
    }
    return collisions;
  });
  expect(overlaps).toEqual([]);
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
          ? page.locator(
              '.title-screen__logo, .title-screen__subtitle, .title-screen__start',
            )
          : scenario === 'login'
            ? page.locator(
                '.auth-portal h1, .auth-portal p, .auth-portal label, .auth-portal a, .auth-portal button',
              )
            : page.locator(
                '.chapter-map-scroll__copy > *, .chapter-map__building-label strong, .chapter-map__status-medal',
              );
      for (const target of await textTargets.all()) {
        if (await target.isVisible()) await expectTextNotClipped(target);
      }
      await expectNoTextOverlap(
        page,
        scenario === 'title'
          ? '.title-screen'
          : scenario === 'login'
            ? '.auth-portal'
            : '.chapter-map-scroll',
      );

      if (scenario === 'login' && viewport.width >= 1280) {
        const portal = page.locator('.auth-portal');
        const box = await portal.boundingBox();
        expect(box).not.toBeNull();
        if (box)
          expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
      }
    });
  }
}

test('title uses the village scene background', async ({ page }) => {
  await page.setViewportSize({ height: 900, width: 1440 });
  await page.goto('/dev-harness/visible-ui.html?scenario=title');
  const background = await page
    .locator('.title-screen')
    .evaluate((element) => ({
      root: getComputedStyle(element).backgroundImage,
      after: getComputedStyle(element, '::after').backgroundImage,
    }));
  expect(`${background.root} ${background.after}`).toContain(
    'village-silhouette',
  );
});

for (const scenario of ['title', 'login', 'learning-map'] as const) {
  for (const viewport of [
    { height: 900, width: 1280 },
    { height: 852, width: 393 },
  ] as const) {
    test(`captures ${scenario} design audit at ${String(viewport.width)}px`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto(`/dev-harness/visible-ui.html?scenario=${scenario}`);
      await page.waitForLoadState('networkidle');
      await page.screenshot({
        fullPage: true,
        path: `artifacts/design-audit/ui-content-correction/${scenario}/${String(viewport.width)}.png`,
      });
    });
  }
}

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
