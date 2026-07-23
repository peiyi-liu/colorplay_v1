import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const routes = [
  '/',
  '/login',
  '/app',
  '/unauthorized',
  '/missing-route',
] as const;

for (const route of routes) {
  test(`${route} has no critical or serious axe violations`, async ({
    page,
  }) => {
    await page.goto(route);

    const results = await new AxeBuilder({ page }).analyze();
    const blockingViolations = results.violations.filter(
      ({ impact }) => impact === 'critical' || impact === 'serious',
    );

    expect(blockingViolations).toEqual([]);
  });
}
