import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const evidenceRoot = 'artifacts/acceptance/phase-1a-task-05';

const viewports = [
  { height: 812, label: '320x812', width: 320 },
  { height: 812, label: '375x812', width: 375 },
  { height: 1024, label: '768x1024', width: 768 },
  { height: 900, label: '1440x900', width: 1440 },
] as const;

const routes = [
  { action: '前往登入', path: '/' },
  { action: '進入學習大廳', path: '/login' },
  { action: '開始探索課程', path: '/app' },
  { action: '返回登入', path: '/unauthorized' },
  { action: '返回首頁', path: '/missing-route' },
] as const;

test.describe('flat-design application shell', () => {
  for (const viewport of viewports) {
    test(`renders the approved login reference at ${viewport.label}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto('/login');

      await expect(page.getByRole('banner')).toBeVisible();
      await expect(page.getByRole('main')).toHaveAttribute(
        'id',
        'main-content',
      );
      await expect(page.getByRole('heading', { name: '登入' })).toBeVisible();

      const primaryTargets = page.locator('[data-acceptance-target]');
      await expect(primaryTargets).toHaveCount(1);
      await expect(primaryTargets).toHaveAttribute(
        'data-primary-action',
        'true',
      );
      await expect(primaryTargets).toHaveAttribute(
        'data-acceptance-interactive',
        'true',
      );
      await expect(primaryTargets).toHaveRole('link');

      const targetBoxes = await primaryTargets.evaluateAll((elements) =>
        elements.map((element) => {
          const box = element.getBoundingClientRect();
          return { height: box.height, width: box.width };
        }),
      );
      expect(
        targetBoxes.every(({ height, width }) => height >= 44 && width >= 44),
      ).toBe(true);

      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth + 1,
        ),
      ).toBe(true);

      const forbiddenFlatStyles = await page
        .locator('.app-shell *')
        .evaluateAll((elements) =>
          elements.flatMap((element) => {
            const styles = getComputedStyle(element);
            const isForbidden =
              styles.backgroundImage.includes('gradient') ||
              styles.boxShadow !== 'none' ||
              styles.perspective !== 'none' ||
              styles.textShadow !== 'none';
            return isForbidden
              ? [
                  {
                    backgroundImage: styles.backgroundImage,
                    boxShadow: styles.boxShadow,
                    node: element.tagName,
                    perspective: styles.perspective,
                    textShadow: styles.textShadow,
                  },
                ]
              : [];
          }),
        );
      expect(forbiddenFlatStyles).toEqual([]);

      await mkdir(`${evidenceRoot}/screenshots`, { recursive: true });
      await page.screenshot({
        animations: 'disabled',
        fullPage: true,
        path: `${evidenceRoot}/screenshots/login-${viewport.label}.png`,
      });
      await expect(page).toHaveScreenshot(`login-${viewport.label}.png`, {
        animations: 'disabled',
        fullPage: true,
        maxDiffPixelRatio: 0.01,
      });
    });
  }

  test('every foundation route has one clearly labelled primary CTA', async ({
    page,
  }) => {
    await page.setViewportSize({ height: 812, width: 320 });

    for (const route of routes) {
      await page.goto(route.path);
      const target = page.locator('[data-acceptance-target]');
      await expect(target).toHaveCount(1);
      await expect(target).toHaveAccessibleName(route.action);
      await expect(target).toBeVisible();
      expect(
        await target.evaluate((element) => {
          const box = element.getBoundingClientRect();
          return box.height >= 44 && box.width >= 44;
        }),
      ).toBe(true);
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth + 1,
        ),
      ).toBe(true);
    }
  });

  test('offers keyboard users a visible skip link before navigation', async ({
    page,
  }) => {
    await page.setViewportSize({ height: 812, width: 320 });
    await page.goto('/login');

    await page.keyboard.press('Tab');
    const skipLink = page.getByRole('link', { name: '跳到主要內容' });
    await expect(skipLink).toBeFocused();
    await expect(skipLink).toBeVisible();
    await expect(skipLink).toHaveAttribute('href', '#main-content');
    expect(
      await skipLink.evaluate((element) => {
        const styles = getComputedStyle(element);
        return {
          outlineColor: styles.outlineColor,
          outlineStyle: styles.outlineStyle,
          outlineWidth: styles.outlineWidth,
        };
      }),
    ).toEqual({
      outlineColor: 'rgb(37, 99, 235)',
      outlineStyle: 'solid',
      outlineWidth: '3px',
    });
    expect(
      await skipLink.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return box.height >= 44 && box.width >= 44;
      }),
    ).toBe(true);
  });

  test('removes non-essential motion when reduced motion is requested', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/login');

    const motionStyles = await page
      .locator('[data-acceptance-target]')
      .evaluate((element) => {
        const styles = getComputedStyle(element);
        return {
          animationDurationSeconds: Number.parseFloat(styles.animationDuration),
          animationIterationCount: styles.animationIterationCount,
          scrollBehavior: getComputedStyle(document.documentElement)
            .scrollBehavior,
          transitionDurationSeconds: Number.parseFloat(
            styles.transitionDuration,
          ),
        };
      });

    expect(motionStyles.animationDurationSeconds).toBeLessThanOrEqual(0.001);
    expect(motionStyles.animationIterationCount).toBe('1');
    expect(motionStyles.scrollBehavior).toBe('auto');
    expect(motionStyles.transitionDurationSeconds).toBeLessThanOrEqual(0.001);
  });
});
