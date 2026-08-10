import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const viewports = [
  { height: 720, label: '1280', width: 1280 },
  { height: 852, label: '393', width: 393 },
] as const;

const rectanglesOverlap = (
  first: { bottom: number; left: number; right: number; top: number },
  second: { bottom: number; left: number; right: number; top: number },
) =>
  first.left < second.right &&
  first.right > second.left &&
  first.top < second.bottom &&
  first.bottom > second.top;

test.describe('JRPG home world entrance', () => {
  for (const viewport of viewports) {
    test(`matches the adopted world-entrance composition at ${viewport.label}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto('/');

      const world = page.locator('.home-world');
      await expect(world).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'ColorPlay' }),
      ).toBeVisible();
      await expect(page.getByText('色彩王國的冒險旅程')).toBeVisible();

      const start = page.getByRole('link', { name: '開始冒險' });
      const login = page.getByRole('link', { name: '已有帳號？登入' });
      await expect(start).toHaveAttribute('href', '/register');
      await expect(login).toHaveAttribute('href', '/login');

      const metrics = await page.evaluate(() => {
        const required = [
          '.home-world__brand-bar',
          '.home-world__story',
          '.home-world__actions',
          '.home-world__title',
          '.home-world__subtitle',
          '.home-world__start',
          '.home-world__login',
        ].map((selector) => {
          const element = document.querySelector<HTMLElement>(selector);
          if (!element) throw new Error(`HOME_ELEMENT_MISSING:${selector}`);
          const box = element.getBoundingClientRect();
          return {
            box: {
              bottom: box.bottom,
              left: box.left,
              right: box.right,
              top: box.top,
            },
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
            selector,
          };
        });

        return {
          documentOverflow:
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
          required,
        };
      });

      expect(metrics.documentOverflow).toBeLessThanOrEqual(1);
      expect(
        metrics.required.every(
          ({ clientWidth, scrollWidth }) => scrollWidth <= clientWidth + 1,
        ),
      ).toBe(true);

      const boxes = Object.fromEntries(
        metrics.required.map(({ box, selector }) => [selector, box]),
      );
      const brand = boxes['.home-world__brand-bar'];
      const story = boxes['.home-world__story'];
      const actions = boxes['.home-world__actions'];
      const startBox = boxes['.home-world__start'];
      const loginBox = boxes['.home-world__login'];
      if (!brand || !story || !actions || !startBox || !loginBox) {
        throw new Error('HOME_METRIC_MISSING');
      }

      expect(rectanglesOverlap(brand, story)).toBe(false);
      expect(rectanglesOverlap(story, actions)).toBe(false);
      expect(rectanglesOverlap(startBox, loginBox)).toBe(false);
      expect(startBox.right - startBox.left).toBeGreaterThanOrEqual(44);
      expect(startBox.bottom - startBox.top).toBeGreaterThanOrEqual(44);
      expect(loginBox.right - loginBox.left).toBeGreaterThanOrEqual(44);
      expect(loginBox.bottom - loginBox.top).toBeGreaterThanOrEqual(44);

      if (viewport.width === 1280) {
        expect(actions.left).toBeGreaterThan(viewport.width * 0.6);
        expect(actions.top).toBeGreaterThan(viewport.height * 0.55);
      }

      const screenshotDirectory = `artifacts/design-audit/jrpg-home-world/${viewport.label}`;
      await mkdir(screenshotDirectory, { recursive: true });
      await page.screenshot({
        animations: 'disabled',
        fullPage: true,
        path: `${screenshotDirectory}/home.png`,
      });
    });
  }
});
