import { expect, test } from '@playwright/test';

import { TEST_USERS } from '../fixtures/users';
import { signedInClient } from '../helpers/signed-in-client';

test.use({ screenshot: 'off', trace: 'off', video: 'off' });

// 完整帳號旅程（註冊 OTP →帳號登入→忘記→重設）只需驗證一次後端行為；
// 登入頁的跨瀏覽器渲染由其餘 spec 覆蓋。
const mailpitBaseUrl = 'http://127.0.0.1:54324';

type MailpitMessageSummary = Readonly<{ ID: string }>;

const fetchLatestMessageTo = async (
  address: string,
): Promise<Readonly<{ text: string }> | null> => {
  const searchResponse = await fetch(
    `${mailpitBaseUrl}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`,
  );
  if (!searchResponse.ok) return null;
  const payload = (await searchResponse.json()) as {
    messages?: MailpitMessageSummary[];
  };
  const latest = payload.messages?.[0];
  if (!latest) return null;
  const detailResponse = await fetch(
    `${mailpitBaseUrl}/api/v1/message/${latest.ID}`,
  );
  if (!detailResponse.ok) return null;
  const detail = (await detailResponse.json()) as { Text?: string };
  return { text: detail.Text ?? '' };
};

const waitForEmailMatch = async (
  address: string,
  extract: (text: string) => string | null,
): Promise<string> => {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const message = await fetchLatestMessageTo(address);
    if (message) {
      const value = extract(message.text);
      if (value) return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`AUTH_E2E_EMAIL_TIMEOUT: ${address}`);
};

const extractOtp = (text: string): string | null =>
  /\b(\d{6})\b/u.exec(text)?.[1] ?? null;

const extractRecoveryLink = (text: string): string | null => {
  const match = /https?:\/\/[^\s"'\])]+/gu;
  for (const candidate of text.match(match) ?? []) {
    if (candidate.includes('/auth/v1/verify')) return candidate;
  }
  return null;
};

test('student registers with OTP, signs in by account, and resets the password', async ({
  browserName,
  page,
}) => {
  test.skip(browserName !== 'chromium', '後端旅程單瀏覽器驗證即可');
  test.setTimeout(180_000);

  // 取得新班級序號（教師 fixture 建班，回傳一次性 join code）。
  const teacher = await signedInClient(TEST_USERS.teacher);
  const { data: receipt, error: classroomError } = await teacher.rpc(
    'create_classroom',
    { p_name: `E2E 註冊班 ${Date.now().toString(36)}` },
  );
  await teacher.auth.signOut({ scope: 'local' });
  expect(classroomError).toBeNull();
  const joinCode = receipt?.[0]?.join_code;
  if (!joinCode) throw new Error('AUTH_E2E_JOIN_CODE_MISSING');

  const unique = Date.now().toString(36);
  const email = `register.${unique}@colorplay.test`;
  const account = `reg${unique}`;
  const password = 'ColorP1x';
  const newPassword = 'ColorP2y';

  // 註冊：表單內 Email OTP 認證 → 綠色已認證 → 完成註冊直達大廳。
  await page.goto('/register');
  await page.getByLabel('名字').fill('端對端 學生');
  await page.getByLabel('暱稱').fill(`旅程${unique.slice(-4)}`);
  await page.getByLabel('班級序號').fill(joinCode);
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page.getByRole('button', { name: '傳送驗證碼' }).click();

  const otp = await waitForEmailMatch(email, extractOtp);
  await page.getByLabel('E-mail 驗證碼').fill(otp);
  await page.getByRole('button', { name: '確認驗證' }).click();
  await expect(page.getByText('✓ 已認證')).toBeVisible();

  await page.getByLabel('帳號（學號）').fill(account);
  await page.getByLabel('密碼', { exact: true }).fill(password);
  await page.getByLabel('密碼確認').fill(password);
  await page.getByRole('button', { name: '完成註冊' }).click();
  await expect(page).toHaveURL(/\/app$/u, { timeout: 20_000 });
  await expect(page.getByText('色彩任務選擇大廳')).toBeVisible({
    timeout: 20_000,
  });

  // 登出後以帳號（學號）登入。
  await page.getByRole('button', { name: '登出' }).click();
  await expect(page).toHaveURL(/\/login$/u, { timeout: 15_000 });
  await page.getByLabel('帳號').fill(account);
  await page.getByLabel('密碼').fill(password);
  await page.getByRole('button', { name: '登入' }).click();
  await expect(page).toHaveURL(/\/app$/u, { timeout: 20_000 });

  // 忘記密碼：帳號＋Email → 信中連結 → 重設 → 跳回登入頁。
  await page.getByRole('button', { name: '登出' }).click();
  await expect(page).toHaveURL(/\/login$/u, { timeout: 15_000 });
  await page.goto('/forgot-password');
  await page.getByLabel('帳號').fill(account);
  await page.getByLabel('E-mail').fill(email);
  await page.getByRole('button', { name: '寄送重設連結' }).click();
  await expect(page.getByText(/重設密碼連結已寄出/u)).toBeVisible();

  const recoveryLink = await waitForEmailMatch(email, extractRecoveryLink);
  await page.goto(recoveryLink);
  await expect(page).toHaveURL(/\/reset-password/u, { timeout: 20_000 });
  await expect(page.getByRole('button', { name: '更新密碼' })).toBeEnabled({
    timeout: 20_000,
  });
  await page.getByLabel('新密碼', { exact: true }).fill(newPassword);
  await page.getByLabel('確認新密碼').fill(newPassword);
  await page.getByRole('button', { name: '更新密碼' }).click();
  await expect(page).toHaveURL(/\/login$/u, { timeout: 20_000 });

  // 新密碼可登入；同時驗證錯誤密碼走泛用 401（防列舉）。
  const failedLogin = await fetch(
    'http://127.0.0.1:54321/functions/v1/auth-login',
    {
      body: JSON.stringify({ account, password: 'Wrong1x' }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    },
  );
  expect(failedLogin.status).toBe(401);
  expect(((await failedLogin.json()) as { error?: string }).error).toBe(
    'AUTH_INVALID_CREDENTIALS',
  );

  await page.getByLabel('帳號').fill(account);
  await page.getByLabel('密碼').fill(newPassword);
  await page.getByRole('button', { name: '登入' }).click();
  await expect(page).toHaveURL(/\/app$/u, { timeout: 20_000 });
});
