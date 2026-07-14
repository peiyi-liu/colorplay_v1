import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

import {
  attachBrowserHealth,
  unexpectedBrowserHealth,
} from '../e2e/browser-health';

const evidenceRoot = process.env.PLAYWRIGHT_EVIDENCE_ROOT;
const studentEmail = process.env.ACCEPTANCE_STUDENT_EMAIL;
const studentPassword = process.env.ACCEPTANCE_STUDENT_PASSWORD;

const viewports = [
  { height: 812, label: '375x812', width: 375 },
  { height: 1024, label: '768x1024', width: 768 },
  { height: 900, label: '1440x900', width: 1440 },
] as const;

function requireAcceptanceEnvironment() {
  if (!evidenceRoot || !studentEmail || !studentPassword) {
    throw new Error('PHASE_1_ACCEPTANCE_ENVIRONMENT_MISSING');
  }
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('PHASE_1_SERVICE_ROLE_MUST_BE_UNSET');
  }
  return { evidenceRoot, studentEmail, studentPassword } as const;
}

async function saveScreenshot(page: Page, filename: string): Promise<string> {
  const environment = requireAcceptanceEnvironment();
  const directory = `${environment.evidenceRoot}/screenshots`;
  await mkdir(directory, { recursive: true });
  const path = `${directory}/${filename}`;
  await page.screenshot({ animations: 'disabled', fullPage: true, path });
  return path;
}

async function saveHealthReport(
  filename: string,
  health: ReturnType<typeof unexpectedBrowserHealth>,
) {
  const environment = requireAcceptanceEnvironment();
  const directory = `${environment.evidenceRoot}/network`;
  await mkdir(directory, { recursive: true });
  await writeFile(
    `${directory}/${filename}`,
    `${JSON.stringify(
      {
        console_errors: health.consoleErrors.length,
        unexpected_5xx: health.serverErrors.length,
        unexpected_failed_requests: health.failedRequests.length,
        unhandled_page_errors: health.pageErrors.length,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
}

async function assertAxeAndSave(page: Page, filename: string) {
  const environment = requireAcceptanceEnvironment();
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter(
    ({ impact }) => impact === 'critical' || impact === 'serious',
  );
  expect(blocking).toEqual([]);

  const directory = `${environment.evidenceRoot}/reports`;
  await mkdir(directory, { recursive: true });
  await writeFile(
    `${directory}/${filename}`,
    `${JSON.stringify(
      {
        critical: results.violations.filter(
          ({ impact }) => impact === 'critical',
        ).length,
        serious: results.violations.filter(({ impact }) => impact === 'serious')
          .length,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
}

async function signIn(page: Page) {
  const environment = requireAcceptanceEnvironment();
  await page.getByLabel('Email').fill(environment.studentEmail);
  await page.getByLabel('密碼').fill(environment.studentPassword);
  await page.getByRole('button', { name: '登入' }).click();
  await expect(page).toHaveURL(/\/app$/u);
  await expect(
    page.getByRole('heading', { name: 'student.one' }),
  ).toBeVisible();
}

async function enableBriefLatency(context: BrowserContext, page: Page) {
  const session = await context.newCDPSession(page);
  await session.send('Network.enable');
  await session.send('Network.emulateNetworkConditions', {
    connectionType: 'cellular3g',
    downloadThroughput: 1_000_000,
    latency: 300,
    offline: false,
    uploadThroughput: 750_000,
  });
  return async () => {
    await session.send('Network.emulateNetworkConditions', {
      connectionType: 'none',
      downloadThroughput: -1,
      latency: 0,
      offline: false,
      uploadThroughput: -1,
    });
    await session.detach();
  };
}

test('@phase1-headed login/profile/refresh/logout/unauthorized/deep-link evidence at three viewports', async ({
  browserName,
  page,
}) => {
  const environment = requireAcceptanceEnvironment();
  expect(browserName).toBe('chromium');
  const context = page.context();

  for (const viewport of viewports) {
    const health = attachBrowserHealth(page);
    await page.setViewportSize({
      height: viewport.height,
      width: viewport.width,
    });

    const loginResponse = await page.goto('/login', {
      waitUntil: 'networkidle',
    });
    expect(loginResponse?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: '登入' })).toBeVisible();
    await saveScreenshot(
      page,
      `AC-AUTH-001__student__login__${viewport.label}__01.png`,
    );
    const loginDeepLink = await page.reload({ waitUntil: 'networkidle' });
    expect(loginDeepLink?.status()).toBe(200);
    await saveScreenshot(
      page,
      `AC-UI-003__anonymous__login-deep-link__${viewport.label}__01.png`,
    );
    await assertAxeAndSave(page, `axe-login-${viewport.label}.json`);

    const stopLatency = await enableBriefLatency(context, page);
    await page.getByLabel('Email').fill(environment.studentEmail);
    await page.getByLabel('密碼').fill(environment.studentPassword);
    await page
      .getByRole('button', { name: '登入' })
      .click({ noWaitAfter: true });
    await expect(page.getByRole('button', { name: '登入中…' })).toBeDisabled();
    await saveScreenshot(
      page,
      `AC-AUTH-001__student__login-pending__${viewport.label}__02.png`,
    );
    await expect(page).toHaveURL(/\/app$/u);
    await stopLatency();
    await expect(
      page.getByRole('heading', { name: 'student.one' }),
    ).toBeVisible();
    await saveScreenshot(
      page,
      `AC-AUTH-001__student__profile__${viewport.label}__03.png`,
    );
    await assertAxeAndSave(page, `axe-profile-${viewport.label}.json`);

    const refreshResponse = await page.reload({ waitUntil: 'networkidle' });
    expect(refreshResponse?.status()).toBe(200);
    await expect(
      page.getByRole('heading', { name: 'student.one' }),
    ).toBeVisible();
    await saveScreenshot(
      page,
      `AC-AUTH-001__student__refresh__${viewport.label}__04.png`,
    );

    const appDeepLink = await page.goto('/app', { waitUntil: 'networkidle' });
    expect(appDeepLink?.status()).toBe(200);
    expect((await page.reload({ waitUntil: 'networkidle' }))?.status()).toBe(
      200,
    );
    await expect(
      page.getByRole('heading', { name: 'student.one' }),
    ).toBeVisible();
    await saveScreenshot(
      page,
      `AC-UI-003__student__app-deep-link__${viewport.label}__04.png`,
    );

    const unauthorizedDeepLink = await page.goto('/unauthorized', {
      waitUntil: 'networkidle',
    });
    expect(unauthorizedDeepLink?.status()).toBe(200);
    expect((await page.reload({ waitUntil: 'networkidle' }))?.status()).toBe(
      200,
    );
    await expect(page.getByRole('heading', { name: '沒有權限' })).toBeVisible();
    await saveScreenshot(
      page,
      `AC-AUTH-005__student__unauthorized-deep-link__${viewport.label}__05.png`,
    );

    await page.goto('/app');
    const logoutResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/auth/v1/logout',
    );
    await page.getByRole('button', { name: '登出' }).click();
    const confirmedLogoutResponse = await logoutResponse;
    expect(confirmedLogoutResponse.status()).toBeLessThan(400);
    await expect(page).toHaveURL(/\/login$/u);
    await expect(page.locator('body')).not.toContainText('student.one');
    await page.waitForLoadState('networkidle');
    await page.goBack();
    await expect(page).toHaveURL(/\/(?:login|unauthorized)$/u);
    await expect(page.locator('body')).not.toContainText('student.one');
    await page.goto('/app');
    await expect(page).toHaveURL(/\/login$/u);
    await saveScreenshot(
      page,
      `AC-AUTH-003__student__logout__${viewport.label}__06.png`,
    );

    await page.setViewportSize({ height: 812, width: 320 });
    await page.goto('/login');
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth + 1,
      ),
    ).toBe(true);

    const unexpected = unexpectedBrowserHealth(
      health,
      browserName,
      confirmedLogoutResponse,
    );
    expect(unexpected).toEqual({
      consoleErrors: [],
      failedRequests: [],
      pageErrors: [],
      serverErrors: [],
    });
    await saveHealthReport(`headed-${viewport.label}.json`, unexpected);
  }
});

test('@phase1-smoke cross-browser login/profile refresh/logout smoke', async ({
  browserName,
  page,
}) => {
  requireAcceptanceEnvironment();
  const health = attachBrowserHealth(page);
  await page.setViewportSize({ height: 900, width: 1440 });
  const directResponse = await page.goto('/login', {
    waitUntil: 'networkidle',
  });
  expect(directResponse?.status()).toBe(200);
  await saveScreenshot(
    page,
    `AC-COMPAT-001__student__login__1440x900__${browserName}.png`,
  );

  await signIn(page);
  expect((await page.reload({ waitUntil: 'networkidle' }))?.status()).toBe(200);
  await expect(
    page.getByRole('heading', { name: 'student.one' }),
  ).toBeVisible();
  await saveScreenshot(
    page,
    `AC-COMPAT-001__student__profile-refresh__1440x900__${browserName}.png`,
  );

  const logoutResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/auth/v1/logout',
  );
  await page.getByRole('button', { name: '登出' }).click();
  expect((await logoutResponse).status()).toBeLessThan(400);
  await expect(page).toHaveURL(/\/login$/u);

  const unexpected = unexpectedBrowserHealth(health, browserName);
  expect(unexpected).toEqual({
    consoleErrors: [],
    failedRequests: [],
    pageErrors: [],
    serverErrors: [],
  });
  await saveHealthReport(`smoke-${browserName}.json`, unexpected);
});
