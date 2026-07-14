import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

import type { Database } from '../../src/types/database';
import { TEST_USERS } from '../fixtures/users';

test.use({ screenshot: 'off', trace: 'off', video: 'off' });

type BrowserHealth = Readonly<{
  consoleErrors: string[];
  failedRequests: string[];
  httpErrors: string[];
  pageErrors: string[];
}>;

const intendedRoute = {
  hash: '#checkpoint',
  pathname: '/app',
  search: '?chapter=color-theory',
} as const;

const readLocalPublicEnvironment = () => {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error('TASK_12_LOCAL_PUBLIC_ENV_MISSING');
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('TASK_12_SERVICE_ROLE_MUST_BE_UNSET');
  }

  const parsedUrl = new URL(url);
  if (
    parsedUrl.protocol !== 'http:' ||
    parsedUrl.hostname !== '127.0.0.1' ||
    parsedUrl.port !== '54321'
  ) {
    throw new Error('TASK_12_LOCAL_PUBLIC_ENV_INVALID');
  }

  return { anonKey, url } as const;
};

const attachHealthCollection = (page: Page): BrowserHealth => {
  const health: BrowserHealth = {
    consoleErrors: [],
    failedRequests: [],
    httpErrors: [],
    pageErrors: [],
  };

  page.on('console', (message) => {
    if (message.type() === 'error') health.consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => health.pageErrors.push(error.message));
  page.on('requestfailed', (request) => {
    health.failedRequests.push(request.failure()?.errorText ?? 'failed');
  });
  page.on('response', (response) => {
    if (response.status() >= 400) health.httpErrors.push('http-error');
  });

  return health;
};

const observedErrorCount = (health: BrowserHealth) =>
  health.consoleErrors.length +
  health.failedRequests.length +
  health.httpErrors.length +
  health.pageErrors.length;

const readRetainedRoute = (page: Page) =>
  page.evaluate(() => {
    const state: unknown = history.state;
    if (typeof state !== 'object' || state === null || !('usr' in state)) {
      return null;
    }
    const userState = state.usr;
    if (
      typeof userState !== 'object' ||
      userState === null ||
      !('from' in userState)
    ) {
      return null;
    }
    return userState.from;
  });

test('proves loading, intended-route retention, and a real authenticated outlet', async ({
  browser,
}, testInfo) => {
  const baseURL = testInfo.project.use.baseURL;
  if (typeof baseURL !== 'string') throw new Error('TASK_12_BASE_URL_MISSING');
  const { anonKey, url } = readLocalPublicEnvironment();

  const anonymousContext = await browser.newContext({ baseURL });
  await anonymousContext.addInitScript(() => {
    const runtimeWindow = window as Window & {
      __colorplayAuthLoadingObserved?: boolean;
    };
    runtimeWindow.__colorplayAuthLoadingObserved = false;
    const observer = new MutationObserver(() => {
      if (document.querySelector('[role="status"][aria-label="頁面載入中"]')) {
        runtimeWindow.__colorplayAuthLoadingObserved = true;
        observer.disconnect();
      }
    });
    observer.observe(document, { childList: true, subtree: true });
  });

  const warmupPage = await anonymousContext.newPage();
  await warmupPage.goto('/login');
  await expect(warmupPage.getByRole('heading', { name: '登入' })).toBeVisible();
  await warmupPage.waitForLoadState('networkidle');
  await warmupPage.close();

  const anonymousPage = await anonymousContext.newPage();
  const anonymousHealth = attachHealthCollection(anonymousPage);
  await anonymousPage.goto(
    `${intendedRoute.pathname}${intendedRoute.search}${intendedRoute.hash}`,
    { waitUntil: 'commit' },
  );
  await expect(
    anonymousPage.getByRole('status', { name: '頁面載入中' }),
  ).toBeVisible();
  await expect(
    anonymousPage.getByRole('heading', { name: '登入' }),
  ).toBeVisible();
  await expect(anonymousPage).toHaveURL(/\/login$/u);
  expect(
    await anonymousPage.evaluate(
      () =>
        (window as Window & { __colorplayAuthLoadingObserved?: boolean })
          .__colorplayAuthLoadingObserved === true,
    ),
  ).toBe(true);
  expect(await readRetainedRoute(anonymousPage)).toEqual(intendedRoute);
  expect(observedErrorCount(anonymousHealth)).toBe(0);
  await anonymousPage.close();
  await anonymousContext.close();

  const authClient = createClient<Database>(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const signInResult = await authClient.auth.signInWithPassword(
    TEST_USERS.studentOne,
  );
  if (signInResult.error) throw new Error('TASK_12_REAL_SIGN_IN_FAILED');
  const authenticatedSession = signInResult.data.session;

  const projectNamespace = new URL(url).hostname.split('.')[0];
  if (!projectNamespace) throw new Error('TASK_12_STORAGE_KEY_INVALID');
  const storageKey = `sb-${projectNamespace}-auth-token`;

  const authenticatedContext = await browser.newContext({ baseURL });
  const authenticatedPage = await authenticatedContext.newPage();
  const authenticatedHealth = attachHealthCollection(authenticatedPage);
  await authenticatedPage.goto('/login');
  await authenticatedPage.evaluate(
    ({ key, session }) => {
      localStorage.setItem(key, JSON.stringify(session));
    },
    { key: storageKey, session: authenticatedSession },
  );
  await authenticatedPage.goto('/app');
  await expect(
    authenticatedPage.getByRole('heading', { name: '選擇章節' }),
  ).toBeVisible();
  await expect(authenticatedPage.locator('body')).not.toContainText(
    TEST_USERS.studentOne.email,
  );
  expect(
    await authenticatedPage.evaluate(
      (allowedKey) =>
        Object.keys(localStorage).filter((key) => key !== allowedKey),
      storageKey,
    ),
  ).toEqual([]);
  expect(observedErrorCount(authenticatedHealth)).toBe(0);
  await authenticatedPage.close();
  await authenticatedContext.close();
});
