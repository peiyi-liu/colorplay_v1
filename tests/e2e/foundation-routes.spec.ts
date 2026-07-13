import { mkdir } from 'node:fs/promises';
import { chromium, expect, test } from '@playwright/test';

const baseUrl = 'http://127.0.0.1:4173';
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

test('foundation routes render without browser health errors', async () => {
  await mkdir(`${evidenceRoot}/screenshots`, { recursive: true });
  await mkdir(`${evidenceRoot}/traces`, { recursive: true });

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
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

  try {
    for (const route of routes) {
      await page.goto(`${baseUrl}${route.path}`);
      await expect(
        page.getByRole('heading', { name: route.heading }),
      ).toBeVisible();
      await page.screenshot({
        path: `${evidenceRoot}/screenshots/${route.screenshot}`,
        fullPage: true,
      });
    }

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(failedRequests).toEqual([]);
    expect(httpErrors).toEqual([]);
  } finally {
    await context.close();
    await browser.close();
  }
});
