import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { TEST_USERS } from '../fixtures/users';
import {
  attachBrowserHealth,
  expectedBrowserFailures,
  unexpectedBrowserHealth,
} from './browser-health';
import { teacherContentExpectedFailureDeclarations } from './teacher-content-expected-failures';

const retiredRoutes = [
  {
    path: '/teacher/import',
    screenshot: 'teacher-import-retired-1280x720.png',
    viewport: { height: 720, width: 1280 },
  },
  {
    path: '/teacher/content',
    screenshot: 'teacher-content-retired-375x812.png',
    viewport: { height: 812, width: 375 },
  },
] as const;

test('Teacher Content retirement gate', async ({ page }, testInfo) => {
  if (process.env.PLAYWRIGHT_ACCEPTANCE !== 'on') {
    throw new Error('TEACHER_CONTENT_RETIREMENT_ACCEPTANCE_MODE_REQUIRED');
  }
  const evidenceRoot = process.env.PLAYWRIGHT_EVIDENCE_ROOT;
  if (!evidenceRoot) {
    throw new Error('TEACHER_CONTENT_RETIREMENT_EVIDENCE_ROOT_REQUIRED');
  }

  const health = attachBrowserHealth(page);
  await page.goto('/login');
  await page.getByText('教師端登入').click();
  await page
    .getByRole('textbox', { name: '帳號' })
    .fill(TEST_USERS.contentTeacher.email);
  await page.getByLabel('密碼', { exact: true }).fill(TEST_USERS.contentTeacher.password);
  await page.getByRole('button', { name: '登入' }).click();
  await expect(page).toHaveURL(/\/teacher$/u);
  await expect(page.getByRole('heading', { name: '教師工作區' })).toBeVisible();
  await expect(
    page.locator('a[href="/teacher/import"], a[href="/teacher/content"]'),
  ).toHaveCount(0);

  const unexpectedMutations: string[] = [];
  page.on('request', (request) => {
    const method = request.method();
    const url = new URL(request.url());
    if (
      url.pathname.startsWith('/rest/v1/') &&
      method !== 'GET' &&
      method !== 'HEAD' &&
      !/^\/rest\/v1\/rpc\/(?:get_|list_)/u.test(url.pathname)
    ) {
      unexpectedMutations.push(`${method} ${url.pathname}`);
    }
  });

  for (const route of retiredRoutes) {
    await page.setViewportSize(route.viewport);
    await page.goto(route.path);
    await expect(page).toHaveURL(new RegExp(`${route.path}$`, 'u'));
    await expect(
      page.getByRole('heading', { name: '找不到頁面' }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: '返回首頁' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '匯入內容' })).toHaveCount(
      0,
    );
    await expect(page.getByRole('button', { name: '下載範本' })).toHaveCount(0);
    await page.screenshot({
      fullPage: true,
      path: testInfo.outputPath(route.screenshot),
    });
  }

  expect(unexpectedMutations).toEqual([]);
  expect(teacherContentExpectedFailureDeclarations).toEqual({});
  const declaredFailures = expectedBrowserFailures(health);
  expect(declaredFailures).toEqual([]);
  const healthResult = unexpectedBrowserHealth(health, 'chromium');
  expect(healthResult).toEqual({
    consoleErrors: [],
    failedRequests: [],
    pageErrors: [],
    serverErrors: [],
  });

  await mkdir(join(evidenceRoot, 'reports'), { recursive: true });
  await writeFile(
    join(evidenceRoot, 'reports/browser-health.json'),
    `${JSON.stringify({
      console_errors: 0,
      expected_failures: declaredFailures,
      failed_requests: 0,
      page_errors: 0,
      server_errors: 0,
    })}\n`,
  );
});
