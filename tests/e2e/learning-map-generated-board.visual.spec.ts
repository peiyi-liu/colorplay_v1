import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const viewports = [
  { height: 720, label: '1280', width: 1280 },
  { height: 852, label: '393', width: 393 },
] as const;

const screenshotRoot = 'artifacts/design-audit/jrpg-learning-map';

test.describe('JRPG continuous-world learning map', () => {
  for (const viewport of viewports) {
    test(`matches generated board 05 at ${viewport.label}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto('/dev-harness/learning-map.html');

      const map = page.getByRole('region', { name: '村莊地圖探索區' });
      const buildings = page.locator('.chapter-map__building');
      const primary = page.getByRole('link', { name: '繼續第三章' });

      await expect(
        page.getByRole('heading', { name: '學習地圖' }),
      ).toBeVisible();
      await expect(map).toBeVisible();
      await expect(buildings).toHaveCount(6);
      await expect(page.getByText('已完成')).toHaveCount(2);
      await expect(page.getByText('進行中')).toHaveCount(1);
      await expect(page.getByText('未解鎖')).toHaveCount(3);
      await expect(primary).toBeVisible();

      const desktopBase = page.locator('.chapter-map__base--desktop');
      const mobileBase = page.locator('.chapter-map__base--mobile');
      await expect(
        viewport.width === 1280 ? desktopBase : mobileBase,
      ).toBeVisible();
      await expect(
        viewport.width === 1280 ? mobileBase : desktopBase,
      ).toBeHidden();

      const metrics = await page.evaluate(() => {
        const world = document.querySelector<HTMLElement>(
          '.chapter-map__world',
        );
        const hud = document.querySelector<HTMLElement>('.hud-top--student');
        const main = document.querySelector<HTMLElement>('#main-content');
        if (!world || !hud || !main) throw new Error('MAP_FRAME_MISSING');

        const worldRect = world.getBoundingClientRect();
        const buildingMetrics = Array.from(
          document.querySelectorAll<HTMLElement>('.chapter-map__building'),
        ).map((building) => {
          const art = building.querySelector<HTMLElement>(
            '.chapter-map__building-art',
          );
          const label = building.querySelector<HTMLElement>(
            '.chapter-map__building-label',
          );
          const status = building.querySelector<HTMLElement>(
            '.chapter-map__status-medal',
          );
          if (!art || !label || !status) throw new Error('MAP_NODE_MISSING');

          const artRect = art.getBoundingClientRect();
          const labelRect = label.getBoundingClientRect();
          const statusRect = status.getBoundingClientRect();
          const style = getComputedStyle(building);
          const anchorX = worldRect.left + Number.parseFloat(style.left);
          const anchorY = worldRect.top + Number.parseFloat(style.top);

          return {
            anchorError: {
              x: Math.abs(artRect.left + artRect.width / 2 - anchorX),
              y: Math.abs(artRect.bottom - anchorY),
            },
            labelClipped: label.scrollWidth > label.clientWidth + 1,
            labelRightOfBuilding: labelRect.left >= artRect.right - 1,
            labelRect: {
              bottom: labelRect.bottom,
              left: labelRect.left,
              right: labelRect.right,
              top: labelRect.top,
            },
            statusClipped: status.scrollWidth > status.clientWidth + 1,
            statusRightOfBuilding: statusRect.left >= artRect.right - 1,
            statusRect: {
              bottom: statusRect.bottom,
              left: statusRect.left,
              right: statusRect.right,
              top: statusRect.top,
            },
          };
        });

        const importantText = Array.from(
          document.querySelectorAll<HTMLElement>(
            '.chapter-map-title h1, .chapter-map__building-label, .chapter-map__status-medal, .chapter-map__entry-action',
          ),
        ).map((element, index) => {
          const rect = element.getBoundingClientRect();
          return {
            id: `${element.className || element.tagName}-${String(index)}`,
            rect,
          };
        });
        const textOverlaps: string[] = [];
        for (let first = 0; first < importantText.length; first += 1) {
          for (
            let second = first + 1;
            second < importantText.length;
            second += 1
          ) {
            const left = importantText[first];
            const right = importantText[second];
            if (!left || !right) continue;
            const intersects = !(
              left.rect.right <= right.rect.left + 1 ||
              right.rect.right <= left.rect.left + 1 ||
              left.rect.bottom <= right.rect.top + 1 ||
              right.rect.bottom <= left.rect.top + 1
            );
            if (intersects) textOverlaps.push(`${left.id}:${right.id}`);
          }
        }

        return {
          buildingMetrics,
          documentOverflow:
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
          hudBottom: hud.getBoundingClientRect().bottom,
          mainTop: main.getBoundingClientRect().top,
          textOverlaps,
        };
      });

      expect(metrics.documentOverflow).toBeLessThanOrEqual(1);
      expect(metrics.mainTop).toBeCloseTo(metrics.hudBottom, 0);
      expect(metrics.textOverlaps).toEqual([]);
      for (const building of metrics.buildingMetrics) {
        expect(building.anchorError.x).toBeLessThanOrEqual(1.5);
        expect(building.anchorError.y).toBeLessThanOrEqual(1.5);
        expect(building.labelClipped).toBe(false);
        expect(building.statusClipped).toBe(false);
        if (viewport.width === 393) {
          expect(building.labelRightOfBuilding).toBe(true);
          expect(building.statusRightOfBuilding).toBe(true);
        }
      }

      const visibleTargets = page.locator(
        '.chapter-map button:visible, .chapter-map a:visible',
      );
      for (let index = 0; index < (await visibleTargets.count()); index += 1) {
        const box = await visibleTargets.nth(index).boundingBox();
        expect(box?.width).toBeGreaterThanOrEqual(44);
        expect(box?.height).toBeGreaterThanOrEqual(44);
      }

      await mkdir(`${screenshotRoot}/${viewport.label}`, { recursive: true });
      await page.screenshot({
        animations: 'disabled',
        path: `${screenshotRoot}/${viewport.label}/learning-map.png`,
      });
    });
  }
});
