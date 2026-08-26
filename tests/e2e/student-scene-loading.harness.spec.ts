import { expect, test } from '@playwright/test';

const sceneRoutes = [
  '/dev-harness/chapter-detail.html?scenario=in-progress',
  '/dev-harness/live-join.html',
  '/dev-harness/live-session.html?scenario=question',
  '/dev-harness/quiz-session.html?scenario=idle',
  '/dev-harness/quiz-result.html?scenario=section',
  '/dev-harness/shop.html',
  '/dev-harness/student-collection.html?surface=mistakes',
  '/dev-harness/student-collection.html?surface=leaderboard',
  '/dev-harness/student-collection.html?surface=achievements',
] as const;

for (const viewport of [
  { height: 720, width: 1280 },
  { height: 852, width: 393 },
] as const) {
  test(`${String(viewport.width)}px student scenes request optimized raster assets`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);

    for (const route of sceneRoutes) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      const rasterResources = await page.evaluate(() =>
        performance
          .getEntriesByType('resource')
          .filter((entry): entry is PerformanceResourceTiming =>
            /\.(?:avif|jpe?g|png|webp)(?:\?|$)/u.test(entry.name),
          )
          .map((entry) => ({
            bytes: entry.decodedBodySize,
            name: entry.name,
          })),
      );
      expect(rasterResources.length, route).toBeGreaterThan(0);
      for (const resource of rasterResources) {
        expect(resource.bytes, resource.name).toBeLessThanOrEqual(350 * 1024);
      }
    }
  });
}
