import { expect, test, type Browser, type Page } from '@playwright/test';

import { TEST_USERS } from '../fixtures/users';
import { challengeAdmin, readAdminTotpSecret } from './helpers/admin';
import { signInTeacher } from './helpers/auth';

test.describe.configure({ mode: 'serial' });

const runTag = `t6e-${crypto.randomUUID().slice(0, 8)}`;
const contactEmail = `t6.${runTag}@example.test`;
const updatedContactEmail = `updated.${runTag}@example.test`;

interface BrowserState {
  dom: string;
  history: string;
  local: Record<string, string | null>;
  session: Record<string, string | null>;
}

interface CapturedResponse {
  body: string;
  status: number;
  url: string;
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const asString = (value: unknown): string =>
  typeof value === 'string' ? value : '';

async function signInAdmin(
  page: Page,
  credentials: Readonly<{ email: string; password: string }>,
) {
  await page.goto('/login');
  await page.getByText('教師端登入').click();
  await page.getByRole('textbox', { name: '帳號' }).fill(credentials.email);
  await page.getByLabel('密碼', { exact: true }).fill(credentials.password);
  await page.getByRole('button', { name: '登入' }).click();
  await page.waitForURL(/\/admin/u);
}

async function loginTeacherExpectFailure(
  browser: Browser,
  account: string,
  password: string,
  responseBodies: Promise<CapturedResponse>[],
  consoleLines: string[],
) {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('console', (message) => consoleLines.push(message.text()));
  page.on('response', (response) => {
    responseBodies.push(
      response
        .text()
        .then((body) => ({
          body,
          status: response.status(),
          url: response.url(),
        }))
        .catch(() => ({
          body: '',
          status: response.status(),
          url: response.url(),
        })),
    );
  });
  await page.goto('/login');
  await page.getByText('教師端登入').click();
  await page.getByRole('textbox', { name: '帳號' }).fill(account);
  await page.getByLabel('密碼', { exact: true }).fill(password);
  await page.getByRole('button', { name: '登入' }).click();
  await expect(page).toHaveURL(/\/login$/u);
  await expect(page.getByRole('alert')).toBeVisible();
  await context.close();
}

async function storedBrowserState(page: Page): Promise<BrowserState> {
  return page.evaluate(() => ({
    dom: document.body.textContent ?? '',
    history: window.location.href,
    local: Object.fromEntries(
      Array.from({ length: localStorage.length }, (_, index) => {
        const key = localStorage.key(index) ?? '';
        return [key, localStorage.getItem(key)];
      }),
    ),
    session: Object.fromEntries(
      Array.from({ length: sessionStorage.length }, (_, index) => {
        const key = sessionStorage.key(index) ?? '';
        return [key, sessionStorage.getItem(key)];
      }),
    ),
  }));
}

function expectSupabaseOwnedSyntheticIdentity(
  state: BrowserState,
  account: string,
): string {
  const authEntries = Object.entries(state.session).filter(([key]) =>
    /^sb-[a-z0-9-]+-auth-token$/u.test(key),
  );
  expect(authEntries).toHaveLength(1);
  const [authKey, rawSession] = authEntries[0] ?? ['', null];
  expect(authKey).not.toBe('');
  expect(rawSession).not.toBeNull();
  const session = asRecord(JSON.parse(rawSession ?? '{}'));
  const user = asRecord(session.user);
  const internalEmail = asString(user.email);
  expect(internalEmail).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}@(?:[a-z0-9-]+\.)+invalid$/u,
  );
  expect(internalEmail).not.toContain(account);
  expect(internalEmail).not.toBe(contactEmail);
  expect(internalEmail).not.toBe(updatedContactEmail);

  const encodedPayload = asString(session.access_token).split('.')[1] ?? '';
  const jwt = asRecord(
    JSON.parse(atob(encodedPayload.replace(/-/g, '+').replace(/_/g, '/'))),
  );
  expect(jwt.email).toBe(internalEmail);

  const namespace = internalEmail.split('@')[1] ?? '';
  const sessionWithoutAllowedEmail = (rawSession ?? '').replaceAll(
    internalEmail,
    '',
  );
  expect(sessionWithoutAllowedEmail).not.toContain(namespace);
  const otherSessionEntries = Object.fromEntries(
    Object.entries(state.session).filter(([key]) => key !== authKey),
  );
  for (const forbiddenSurface of [
    state.dom,
    state.history,
    JSON.stringify(state.local),
    JSON.stringify(otherSessionEntries),
  ]) {
    expect(forbiddenSurface).not.toContain(internalEmail);
    expect(forbiddenSurface).not.toContain(namespace);
  }
  return internalEmail;
}

test('admin creates, updates and resets a teacher without leaking one-time credentials', async ({
  browser,
  page,
}) => {
  const consoleLines: string[] = [];
  const responseBodies: Promise<CapturedResponse>[] = [];
  page.on('console', (message) => consoleLines.push(message.text()));
  page.on('response', (response) => {
    responseBodies.push(
      response
        .text()
        .then((body) => ({
          body,
          status: response.status(),
          url: response.url(),
        }))
        .catch(() => ({
          body: '',
          status: response.status(),
          url: response.url(),
        })),
    );
  });

  const secret = await readAdminTotpSecret('adminPrimary');
  await signInAdmin(page, TEST_USERS.adminPrimary);
  await expect(page).toHaveURL(/\/admin\/mfa\/challenge$/u);
  await challengeAdmin(page, secret);
  await expect(page).toHaveURL(/\/admin$/u);
  await page.getByRole('link', { name: '教師帳號' }).click();
  await expect(page).toHaveURL(/\/admin\/teachers$/u);

  await page.getByRole('button', { name: '新增教師' }).click();
  const createDialog = page.getByRole('dialog', { name: '新增教師帳號' });
  await createDialog.getByLabel('教師姓名').fill(`T6-${runTag}-BROWSER`);
  await createDialog.getByLabel('聯絡 Email（選填）').fill(contactEmail);
  await createDialog
    .getByLabel('操作原因')
    .fill('Task 6 瀏覽器驗證建立教師帳號與一次性密碼');
  const createResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith('/functions/v1/admin-command') &&
      response.request().postData()?.includes('create_teacher_account') ===
        true,
  );
  await createDialog.getByRole('button', { name: '確認新增' }).click();
  const createResponse = await createResponsePromise;
  expect(createResponse.headers()['cache-control']).toBe('no-store, private');
  const receipt = page.getByRole('dialog', { name: '教師帳號已完成' });
  await expect(receipt).toBeVisible();
  const account =
    (await receipt.locator('dd code').first().textContent()) ?? '';
  const firstPassword =
    (await receipt.getByTestId('teacher-password').textContent()) ?? '';
  expect(account).toMatch(/^teacher[0-9]{2,13}$/u);
  expect(firstPassword).toHaveLength(12);
  await receipt.getByRole('button', { name: '關閉並清除' }).click();
  await expect(receipt).toBeHidden();
  await expect(page).toHaveURL(/\/admin\/teachers\/[0-9a-f-]+$/u);
  expect(JSON.stringify(await storedBrowserState(page))).not.toContain(
    firstPassword,
  );

  const teacherContext = await browser.newContext();
  const teacherPage = await teacherContext.newPage();
  teacherPage.on('console', (message) => consoleLines.push(message.text()));
  teacherPage.on('response', (response) => {
    responseBodies.push(
      response
        .text()
        .then((body) => ({
          body,
          status: response.status(),
          url: response.url(),
        }))
        .catch(() => ({
          body: '',
          status: response.status(),
          url: response.url(),
        })),
    );
  });
  await signInTeacher(teacherPage, { email: account, password: firstPassword });
  await expect(teacherPage.getByRole('heading').first()).toBeVisible();
  const teacherStorageBeforeReset = await storedBrowserState(teacherPage);
  await teacherContext.close();

  await page.getByRole('button', { name: '更新教師資料' }).click();
  const updateDialog = page.getByRole('dialog', { name: '更新教師資料' });
  await updateDialog.getByLabel('教師姓名').fill(`T6-${runTag}-UPDATED`);
  await updateDialog.getByLabel('聯絡 Email（選填）').fill(updatedContactEmail);
  await updateDialog
    .getByLabel('操作原因')
    .fill('Task 6 瀏覽器驗證教師姓名與聯絡資料更新');
  await updateDialog.getByRole('button', { name: '確認更新' }).click();
  await expect(
    page.locator('.admin-teacher-detail > p[role="status"]'),
  ).toContainText('教師資料已更新');
  await expect(
    page.getByRole('heading', { name: `T6-${runTag}-UPDATED` }),
  ).toBeVisible();

  await page.getByRole('button', { name: '重設密碼' }).click();
  const resetDialog = page.getByRole('dialog', { name: '重設教師密碼' });
  await resetDialog
    .getByLabel('操作原因')
    .fill('Task 6 瀏覽器驗證重設密碼後舊密碼失效');
  const resetResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith('/functions/v1/admin-command') &&
      response.request().postData()?.includes('reset_teacher_password') ===
        true,
  );
  await resetDialog.getByRole('button', { name: '確認重設密碼' }).click();
  const resetResponse = await resetResponsePromise;
  expect(resetResponse.headers()['cache-control']).toBe('no-store, private');
  const resetReceipt = page.getByRole('dialog', { name: '教師帳號已完成' });
  const secondPassword =
    (await resetReceipt.getByTestId('teacher-password').textContent()) ?? '';
  expect(secondPassword).toHaveLength(12);
  expect(secondPassword).not.toBe(firstPassword);
  await resetReceipt.getByRole('button', { name: '關閉並清除' }).click();
  expect(JSON.stringify(await storedBrowserState(page))).not.toContain(
    secondPassword,
  );

  await loginTeacherExpectFailure(
    browser,
    account,
    firstPassword,
    responseBodies,
    consoleLines,
  );
  const newContext = await browser.newContext();
  const newPage = await newContext.newPage();
  newPage.on('console', (message) => consoleLines.push(message.text()));
  newPage.on('response', (response) => {
    responseBodies.push(
      response
        .text()
        .then((body) => ({
          body,
          status: response.status(),
          url: response.url(),
        }))
        .catch(() => ({
          body: '',
          status: response.status(),
          url: response.url(),
        })),
    );
  });
  await signInTeacher(newPage, { email: account, password: secondPassword });
  const teacherStorageAfterReset = await storedBrowserState(newPage);
  await newContext.close();

  const responses = await Promise.all(responseBodies);
  for (const password of [firstPassword, secondPassword]) {
    const containing = responses.filter(({ body }) => body.includes(password));
    expect(containing).toHaveLength(1);
    expect(containing[0]?.url).toMatch(/\/functions\/v1\/admin-command$/u);
    expect(asRecord(JSON.parse(containing[0]?.body ?? '{}')).password).toBe(
      password,
    );
  }
  expect(consoleLines.join('\n')).not.toContain(firstPassword);
  expect(consoleLines.join('\n')).not.toContain(secondPassword);
  const internalEmailBeforeReset = expectSupabaseOwnedSyntheticIdentity(
    teacherStorageBeforeReset,
    account,
  );
  const internalEmailAfterReset = expectSupabaseOwnedSyntheticIdentity(
    teacherStorageAfterReset,
    account,
  );
  expect(internalEmailAfterReset).toBe(internalEmailBeforeReset);
  const internalNamespace = internalEmailBeforeReset.split('@')[1] ?? '';
  const authLoginResponses = responses.filter(({ url }) =>
    url.includes('/functions/v1/auth-login'),
  );
  expect(authLoginResponses.length).toBeGreaterThanOrEqual(3);
  for (const response of authLoginResponses) {
    expect(response.body).not.toContain(internalEmailBeforeReset);
    expect(response.body).not.toContain(internalNamespace);
    if (response.status >= 200 && response.status < 300) {
      const payload = asRecord(JSON.parse(response.body));
      const tokenEnvelope = asRecord(payload.session);
      expect(Object.keys(payload).sort()).toEqual(['session']);
      expect(Object.keys(tokenEnvelope).sort()).toEqual([
        'access_token',
        'refresh_token',
      ]);
      expect(asString(tokenEnvelope.access_token)).not.toBe('');
      expect(asString(tokenEnvelope.refresh_token)).not.toBe('');
    }
  }
  for (const response of responses.filter(
    ({ url }) => !url.includes('/auth/v1/'),
  )) {
    expect(response.body).not.toContain(internalEmailBeforeReset);
    expect(response.body).not.toContain(internalNamespace);
  }
});
