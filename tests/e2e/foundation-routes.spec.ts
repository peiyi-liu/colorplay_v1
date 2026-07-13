import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const evidenceRoot = 'artifacts/acceptance/phase-1a-task-04';

const routes = [
  { path: '/login', heading: '登入', screenshot: 'login.png' },
  { path: '/app', heading: '學習大廳', screenshot: 'app.png' },
  {
    path: '/unauthorized',
    heading: '沒有權限',
    screenshot: 'unauthorized.png',
  },
  {
    path: '/missing-route',
    heading: '找不到頁面',
    screenshot: 'not-found.png',
  },
] as const;

test('foundation routes render without browser health errors', async ({
  page,
}) => {
  const browserName =
    page.context().browser()?.browserType().name() ?? 'unknown-browser';
  const screenshotDirectory = `${evidenceRoot}/screenshots/${browserName}`;
  await mkdir(screenshotDirectory, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  const httpErrors: string[] = [];

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

  for (const route of routes) {
    await page.goto(route.path);
    await expect(
      page.getByRole('heading', { name: route.heading }),
    ).toBeVisible();
    await page.screenshot({
      path: `${screenshotDirectory}/${route.screenshot}`,
      fullPage: true,
    });
  }

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
  expect(httpErrors).toEqual([]);
});
