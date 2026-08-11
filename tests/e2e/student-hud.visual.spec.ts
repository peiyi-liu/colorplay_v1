import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const viewports = [
  { height: 720, label: '1280', width: 1280 },
  { height: 852, label: '393', width: 393 },
] as const;

const screenshotRoot = 'artifacts/design-audit/jrpg-student-hud';

test.describe('JRPG stable student HUD', () => {
  for (const viewport of viewports) {
    test(`matches the stable HUD contract at ${viewport.label}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto('/dev-harness/student-hud.html');

      const hud = page.locator('.hud-top--student');
      const identity = page.getByRole('group', { name: '學生身分' });
      const menu = page.getByRole('button', { name: 'MENU' });
      await expect(hud).toBeVisible();
      await expect(identity).toContainText('彩虹森林冒險家');
      await expect(page.getByLabel('1250 Token')).toBeVisible();
      await expect(menu).toBeVisible();

      if (viewport.width === 1280) {
        const primary = page.getByRole('navigation', { name: '主要導覽' });
        await expect(primary).toBeVisible();
        await expect(primary.getByRole('link')).toHaveCount(3);
        await expect(
          primary.getByRole('link', { name: '商店' }),
        ).toHaveAttribute('href', '/app/shop');
      } else {
        await expect(
          page.getByRole('navigation', { name: '主要導覽' }),
        ).toHaveCount(0);
      }

      const metrics = await page.evaluate(() => {
        const selectors = [
          '.hud-top--student',
          '.hud-identity',
          '.hud-avatar',
          '.hud-identity__name',
          '.economy-summary__hud-level',
          '.economy-summary__hud-xp',
          '.economy-summary__tokens',
          '.hud-command',
          '.hud-menu__toggle',
        ];
        const entries = selectors.map((selector) => {
          const element = document.querySelector<HTMLElement>(selector);
          if (!element) throw new Error(`HUD_ELEMENT_MISSING:${selector}`);
          const rect = element.getBoundingClientRect();
          return {
            clientWidth: element.clientWidth,
            rect: {
              bottom: rect.bottom,
              height: rect.height,
              left: rect.left,
              right: rect.right,
              top: rect.top,
              width: rect.width,
            },
            scrollWidth: element.scrollWidth,
            selector,
          };
        });
        return {
          documentOverflow:
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
          entries,
          hudHeight:
            document
              .querySelector<HTMLElement>('.hud-top--student')
              ?.getBoundingClientRect().height ?? 0,
          mainTop:
            document
              .querySelector<HTMLElement>('#main-content')
              ?.getBoundingClientRect().top ?? -1,
        };
      });

      expect(metrics.documentOverflow).toBeLessThanOrEqual(1);
      expect(
        metrics.entries
          .filter(
            ({ clientWidth, scrollWidth }) => scrollWidth > clientWidth + 1,
          )
          .map(({ clientWidth, scrollWidth, selector }) => ({
            clientWidth,
            scrollWidth,
            selector,
          })),
      ).toEqual([]);
      expect(metrics.mainTop).toBeCloseTo(metrics.hudHeight, 0);
      expect(metrics.hudHeight).toBeCloseTo(
        viewport.width === 1280 ? 92 : 146,
        0,
      );

      const boxes = Object.fromEntries(
        metrics.entries.map(({ rect, selector }) => [selector, rect]),
      );
      const overlaps = (firstSelector: string, secondSelector: string) => {
        const first = boxes[firstSelector];
        const second = boxes[secondSelector];
        if (!first || !second) throw new Error('HUD_OVERLAP_METRIC_MISSING');
        return !(
          first.right <= second.left ||
          second.right <= first.left ||
          first.bottom <= second.top ||
          second.bottom <= first.top
        );
      };
      expect(overlaps('.hud-avatar', '.hud-identity__name')).toBe(false);
      expect(
        overlaps('.hud-identity__name', '.economy-summary__hud-level'),
      ).toBe(false);
      expect(
        overlaps('.economy-summary__hud-level', '.economy-summary__hud-xp'),
      ).toBe(false);
      expect(boxes['.economy-summary__hud-xp']?.left).toBeGreaterThanOrEqual(
        Math.max(
          boxes['.hud-identity__name']?.right ?? 0,
          boxes['.economy-summary__hud-level']?.right ?? 0,
        ) - 1,
      );
      if (viewport.width === 1280) {
        expect(
          overlaps('.economy-summary__hud-xp', '.economy-summary__tokens'),
        ).toBe(false);
        expect(overlaps('.economy-summary__tokens', '.hud-command')).toBe(
          false,
        );
      } else {
        expect(
          overlaps('.economy-summary__tokens', '.hud-identity__name'),
        ).toBe(false);
        expect(
          overlaps('.economy-summary__hud-xp', '.economy-summary__tokens'),
        ).toBe(false);
        expect(overlaps('.economy-summary__hud-xp', '.hud-menu__toggle')).toBe(
          false,
        );
      }

      const visibleTargets = page.locator(
        '.hud-top--student a:visible, .hud-top--student button:visible',
      );
      for (let index = 0; index < (await visibleTargets.count()); index += 1) {
        const box = await visibleTargets.nth(index).boundingBox();
        expect(box?.width).toBeGreaterThanOrEqual(44);
        expect(box?.height).toBeGreaterThanOrEqual(44);
      }

      await mkdir(`${screenshotRoot}/${viewport.label}`, { recursive: true });
      await page.screenshot({
        animations: 'disabled',
        path: `${screenshotRoot}/${viewport.label}/hud.png`,
      });

      await menu.click();
      const panel = page.locator('#hud-menu-panel');
      await expect(panel).toBeVisible();
      if (viewport.width === 393) {
        const compactPrimary = panel.getByRole('navigation', {
          name: '主要導覽',
        });
        await expect(compactPrimary.getByRole('link')).toHaveCount(3);
      }
      await page.screenshot({
        animations: 'disabled',
        path: `${screenshotRoot}/${viewport.label}/hud-menu.png`,
      });
    });
  }
});
