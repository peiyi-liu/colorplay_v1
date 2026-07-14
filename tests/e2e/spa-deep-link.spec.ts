import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const evidenceRoot =
  process.env.PLAYWRIGHT_EVIDENCE_ROOT ??
  'artifacts/acceptance/phase-1a-task-08';

const routes = [
  {
    expectedPath: '/login',
    heading: '登入',
    path: '/login',
    slug: 'login',
  },
  {
    expectedPath: '/login',
    heading: '登入',
    path: '/app',
    slug: 'app-anonymous-redirect',
  },
  {
    expectedPath: '/unauthorized',
    heading: '沒有權限',
    path: '/unauthorized',
    slug: 'unauthorized',
  },
] as const;

for (const route of routes) {
  test(`${route.path} receives the SPA fallback and resolves safely on refresh`, async ({
    page,
  }, testInfo) => {
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];
    const httpErrors: string[] = [];
    const pageErrors: string[] = [];
    const screenshotDirectory = `${evidenceRoot}/screenshots/${testInfo.project.name}`;

    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('requestfailed', (request) => {
      failedRequests.push(
        `${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`,
      );
    });
    page.on('response', (response) => {
      if (response.status() >= 400) {
        httpErrors.push(`${String(response.status())} ${response.url()}`);
      }
    });

    await page.setViewportSize({ height: 900, width: 1440 });

    const directResponse = await page.goto(route.path, {
      waitUntil: 'networkidle',
    });

    expect(directResponse?.status()).toBe(200);
    await expect(
      page.getByRole('heading', { name: route.heading }),
    ).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(route.expectedPath);

    await mkdir(screenshotDirectory, { recursive: true });
    await page.screenshot({
      animations: 'disabled',
      fullPage: true,
      path: `${screenshotDirectory}/AC-LEARN-004__foundation__${route.slug}-direct__1440x900__01.png`,
    });

    const refreshResponse = await page.reload({ waitUntil: 'networkidle' });

    expect(refreshResponse).not.toBeNull();
    expect(refreshResponse?.status()).not.toBe(404);
    expect(refreshResponse?.status()).toBeLessThan(400);
    await expect(
      page.getByRole('heading', { name: route.heading }),
    ).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(route.expectedPath);
    await page.screenshot({
      animations: 'disabled',
      fullPage: true,
      path: `${screenshotDirectory}/AC-LEARN-004__foundation__${route.slug}-refresh__1440x900__02.png`,
    });

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(failedRequests).toEqual([]);
    expect(httpErrors).toEqual([]);
  });
}
