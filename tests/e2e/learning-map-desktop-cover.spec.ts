import { expect, test } from '@playwright/test';

import { TEST_USERS } from '../fixtures/users';
import { signInStudent } from './helpers/auth';
import { readMapScrollGap } from './helpers/learning-map';

const SCROLL_INSTRUCTION = '選擇一棟建築，查看章節的複習、精熟度與解鎖條件。';
const MINIMUM_CLEARANCE = 8;
const MINIMUM_TARGET = 44;

const desktopViewports = [
  { height: 720, label: '1280x720', width: 1280 },
  { height: 768, label: '1024x768', width: 1024 },
] as const;

for (const viewport of desktopViewports) {
  test(`keeps all three scroll lines clear of desktop overlays at ${viewport.label}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await signInStudent(page, TEST_USERS.learningStudent);

    await expect(
      page.getByRole('heading', { level: 1, name: '學習地圖' }),
    ).toBeVisible();
    await expect(
      page.getByText(SCROLL_INSTRUCTION, { exact: true }),
    ).toBeVisible();

    const gap = await readMapScrollGap(page);
    console.log(
      `learning-map desktop-scroll ${viewport.label} nearest=${gap.nearest.toFixed(2)} pairs=${gap.pairs.join(',')}`,
    );
    expect
      .soft(gap.nearest, gap.pairs.join(', '))
      .toBeGreaterThanOrEqual(MINIMUM_CLEARANCE);
  });

  test(`keeps the full desktop map cover and every action operable at ${viewport.label}`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(viewport);
    await signInStudent(page, TEST_USERS.learningStudent);

    const heading = page.getByRole('heading', {
      level: 1,
      name: '學習地圖',
    });
    await expect(heading).toBeVisible();

    const geometry = await page.evaluate(() => {
      type Rect = Readonly<{
        bottom: number;
        height: number;
        left: number;
        right: number;
        top: number;
        width: number;
      }>;
      const readRect = (selector: string): Rect => {
        const element = document.querySelector<HTMLElement>(selector);
        if (!element) throw new Error(`Missing desktop geometry: ${selector}`);
        const rect = element.getBoundingClientRect();
        return {
          bottom: rect.bottom,
          height: rect.height,
          left: rect.left,
          right: rect.right,
          top: rect.top,
          width: rect.width,
        };
      };
      const distance = (a: Rect, b: Rect): number => {
        const horizontal = Math.max(b.left - a.right, a.left - b.right, 0);
        const vertical = Math.max(b.top - a.bottom, a.top - b.bottom, 0);
        return Math.hypot(horizontal, vertical);
      };
      const minimumDistance = (source: Rect, selector: string): number => {
        const targets = Array.from(
          document.querySelectorAll<HTMLElement>(selector),
        )
          .map((element) => {
            const rect = element.getBoundingClientRect();
            return {
              bottom: rect.bottom,
              height: rect.height,
              left: rect.left,
              right: rect.right,
              top: rect.top,
              width: rect.width,
            };
          })
          .filter(
            (rect) =>
              rect.width > 0 &&
              rect.height > 0 &&
              rect.right > 0 &&
              rect.bottom > 0 &&
              rect.left < window.innerWidth &&
              rect.top < window.innerHeight,
          );
        if (targets.length === 0) {
          throw new Error(`Missing clearance targets: ${selector}`);
        }
        return Math.min(...targets.map((target) => distance(source, target)));
      };

      const lobby = readRect('.lobby--map-fullscreen');
      const panel = readRect('.chapter-map__panel');
      const scroll = readRect('.chapter-map-scroll');
      const viewportRect = readRect('.chapter-map__viewport');
      const world = readRect('.chapter-map__world');
      const viewportElement = document.querySelector<HTMLElement>(
        '.chapter-map__viewport',
      );
      if (!viewportElement) throw new Error('Missing desktop map viewport');
      const viewportStyle = getComputedStyle(viewportElement);
      const border = {
        bottom: Number.parseFloat(viewportStyle.borderBottomWidth),
        color: viewportStyle.borderTopColor,
        left: Number.parseFloat(viewportStyle.borderLeftWidth),
        right: Number.parseFloat(viewportStyle.borderRightWidth),
        top: Number.parseFloat(viewportStyle.borderTopWidth),
      };
      const content = {
        bottom: viewportRect.bottom - border.bottom,
        left: viewportRect.left + border.left,
        right: viewportRect.right - border.right,
        top: viewportRect.top + border.top,
      };

      return {
        border,
        clearances: {
          buildings: minimumDistance(
            scroll,
            '.chapter-map__building-visual, .chapter-map__status-medal',
          ),
          hud: minimumDistance(scroll, '.hud-top'),
          navigation: minimumDistance(scroll, '.hud-command'),
        },
        content,
        dialogueInsideMap:
          panel.top >= viewportRect.top + 8 &&
          panel.bottom <= viewportRect.bottom - 8,
        innerGutters: {
          bottom: content.bottom - world.bottom,
          left: world.left - content.left,
          right: content.right - world.right,
          top: world.top - content.top,
        },
        mapStageGaps: {
          bottom: lobby.bottom - viewportRect.bottom,
          left: viewportRect.left - lobby.left,
          right: lobby.right - viewportRect.right,
          top: viewportRect.top - lobby.top,
        },
        panel,
        scroll,
        scrollInsideMap:
          scroll.top >= viewportRect.top + 8 &&
          scroll.bottom <= viewportRect.bottom - 8,
        viewport: viewportRect,
        world,
        worldAspectRatio: world.width / world.height,
      };
    });
    console.log(
      `learning-map desktop-cover ${viewport.label}=${JSON.stringify(geometry)}`,
    );

    for (const [edge, gap] of Object.entries(geometry.mapStageGaps)) {
      expect.soft(gap, `map-to-stage ${edge}`).toBeLessThanOrEqual(1);
    }
    for (const [edge, gutter] of Object.entries(geometry.innerGutters)) {
      expect.soft(gutter, `world-to-content ${edge}`).toBeLessThanOrEqual(1);
    }
    expect.soft(geometry.worldAspectRatio).toBeCloseTo(1.5, 3);
    expect.soft(geometry.border.color).toBe('rgb(138, 101, 31)');
    for (const [edge, width] of Object.entries(geometry.border).filter(
      ([edge]) => edge !== 'color',
    )) {
      expect.soft(width, `${edge} gold border`).toBe(3);
    }
    for (const [surface, clearance] of Object.entries(geometry.clearances)) {
      expect
        .soft(clearance, `scroll-to-${surface} clearance`)
        .toBeGreaterThanOrEqual(MINIMUM_CLEARANCE);
    }
    expect.soft(geometry.scrollInsideMap).toBe(true);
    expect.soft(geometry.dialogueInsideMap).toBe(true);

    const screenshotPrefix = process.env.LEARNING_MAP_DESKTOP_SCREENSHOT_PREFIX;
    if (screenshotPrefix) {
      await page.screenshot({
        animations: 'disabled',
        path: `${screenshotPrefix}-${viewport.label}.png`,
      });
    }

    const action = page.getByRole('link', { name: '進入複習與進度' });
    const actionBox = await action.boundingBox();
    expect(actionBox?.width).toBeGreaterThanOrEqual(MINIMUM_TARGET);
    expect(actionBox?.height).toBeGreaterThanOrEqual(MINIMUM_TARGET);
    const actionPath = await action.getAttribute('href');
    expect(actionPath).toMatch(/^\/app\/chapters\//u);
    await action.click();
    await page.waitForURL((url) => url.pathname === actionPath);
    await page.goBack();
    await expect(heading).toBeVisible();

    const mapViewport = page.getByRole('region', {
      name: '村莊地圖探索區',
    });
    const buildingButtons = page.locator('.chapter-map__building-button');
    await expect(buildingButtons).toHaveCount(6);
    for (let index = 0; index < 6; index += 1) {
      const button = buildingButtons.nth(index);
      const box = await button.boundingBox();
      expect(
        box?.width,
        `Chapter ${String(index + 1)} width`,
      ).toBeGreaterThanOrEqual(MINIMUM_TARGET);
      expect(
        box?.height,
        `Chapter ${String(index + 1)} height`,
      ).toBeGreaterThanOrEqual(MINIMUM_TARGET);
      await button.click();
      await expect(button).toHaveAttribute('aria-pressed', 'true');
    }

    await mapViewport.focus();
    for (let index = 0; index < 6; index += 1) {
      await page.keyboard.press('Tab');
      const button = buildingButtons.nth(index);
      await expect(button).toBeFocused();
      const focusStyle = await button.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          focusVisible: element.matches(':focus-visible'),
          outlineStyle: style.outlineStyle,
          outlineWidth: Number.parseFloat(style.outlineWidth),
        };
      });
      expect(focusStyle.focusVisible).toBe(true);
      expect(focusStyle.outlineStyle).not.toBe('none');
      expect(focusStyle.outlineWidth).toBeGreaterThanOrEqual(3);
      await page.keyboard.press(index % 2 === 0 ? 'Enter' : 'Space');
      await expect(button).toHaveAttribute('aria-pressed', 'true');
    }
  });
}

test('selects every chapter from the rendered center of its wood sign and state medal', async ({
  page,
}) => {
  await page.setViewportSize({ height: 720, width: 1280 });
  await signInStudent(page, TEST_USERS.learningStudent);

  const buttons = page.locator('.chapter-map__building-button');
  await expect(buttons).toHaveCount(6);
  await buttons.nth(5).click();
  await expect(buttons.nth(5)).toHaveAttribute('aria-pressed', 'true');

  for (const selector of [
    '.chapter-map__building-label',
    '.chapter-map__status-medal',
  ]) {
    const surfaces = page.locator(selector);
    await expect(surfaces).toHaveCount(6);

    for (let index = 0; index < 6; index += 1) {
      const button = buttons.nth(index);
      const surface = surfaces.nth(index);
      const center = await surface.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const parentButton = element.closest('button');
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        return {
          hitWithinButton:
            parentButton?.contains(document.elementFromPoint(x, y)) === true,
          position: getComputedStyle(element).position,
          x,
          y,
        };
      });

      expect(center.position).toBe('absolute');
      expect(center.hitWithinButton).toBe(true);
      await page.mouse.click(center.x, center.y);
      await expect(button).toHaveAttribute('aria-pressed', 'true');
    }
  }
});
