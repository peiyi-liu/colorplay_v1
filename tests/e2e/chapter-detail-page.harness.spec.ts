import { expect, test, type Page } from '@playwright/test';

const observeRuntimeErrors = (page: Page) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });
  return { consoleErrors, pageErrors };
};

const WIDTHS = [320, 375, 1024, 1440] as const;
const SCENARIOS = [
  'locked',
  'content-preparing',
  'content-readiness-error',
  'error',
  'in-progress',
  'completed',
  'long-title',
] as const;

for (const width of WIDTHS) {
  test(`chapter-detail-page states render without layout/console defects at ${String(width)}px`, async ({
    page,
  }) => {
    const runtimeErrors = observeRuntimeErrors(page);
    await page.setViewportSize({ height: 900, width });

    for (const scenario of SCENARIOS) {
      await page.goto(`/dev-harness/chapter-detail.html?scenario=${scenario}`);
      await page.waitForLoadState('networkidle');

      const overflow = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(overflow.scrollWidth, scenario).toBeLessThanOrEqual(
        overflow.clientWidth,
      );

      if (
        [
          'locked',
          'content-preparing',
          'content-readiness-error',
          'error',
        ].includes(scenario)
      ) {
        await expect(page.getByRole('heading').first()).toBeVisible();
      }
      if (scenario === 'locked' || scenario === 'content-preparing') {
        await expect(page.getByRole('heading').first()).toBeFocused();
      }
      if (scenario === 'in-progress' || scenario === 'completed') {
        const primaryAction = page.locator('.primary-action').first();
        await expect(primaryAction).toBeVisible();
      }
      if (scenario === 'long-title') {
        const heading = page.getByRole('heading', { level: 2 }).first();
        const box = await heading.boundingBox();
        expect(box?.width ?? 0).toBeLessThanOrEqual(width);
      }
    }

    expect(
      runtimeErrors.consoleErrors,
      `console errors at ${String(width)}px`,
    ).toEqual([]);
    expect(
      runtimeErrors.pageErrors,
      `page errors at ${String(width)}px`,
    ).toEqual([]);
  });
}

test('keyboard operation reaches the retry action in the error state', async ({
  page,
}) => {
  await page.goto('/dev-harness/chapter-detail.html?scenario=error');
  await page.waitForLoadState('networkidle');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: '重試' })).toBeFocused();
});
