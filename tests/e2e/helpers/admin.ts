import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { expect, type Page } from '@playwright/test';
import * as OTPAuth from 'otpauth';

import type { Credentials } from './auth';

// admin 經教師端登入（spec §2.1）：登入表單互動與 signInTeacher 相同，
// 但成功後的目的地不同（依 profile.role 導向 /admin，而非 /teacher），
// 所以獨立一份而不是改既有 helper 的等待條件。這裡刻意只等到「已經在
// /admin 樹底下」，不是任何一個特定終點——RequirePrivilegedSession 會再
// 依 session 狀態把 pending_mfa 的帳號導去 /admin/mfa/enroll。
export async function signInAdmin(
  page: Page,
  credentials: Credentials,
): Promise<void> {
  await page.goto('/login');
  await page.getByText('教師端登入').click();
  await page.getByRole('textbox', { name: '帳號' }).fill(credentials.email);
  await page.getByLabel('密碼').fill(credentials.password);
  await page.getByRole('button', { name: '登入' }).click();
  await page.waitForURL(/\/admin/u);
}

// 綁定畫面顯示 secret 明碼（data-testid="totp-secret"）；用 otpauth 算出
// 當下的 6 碼送出。confirm-enrollment 成功後畫面會自動導去
// /admin/mfa/challenge（spec §4.4-3：saga 只補 identity/binding，不建
// session），這裡等到那個轉場完成再回傳 secret，避免呼叫端緊接著操作
// challenge 頁的欄位時它還沒掛載。
export async function enrollAdminTotp(page: Page): Promise<string> {
  const secretLocator = page.getByTestId('totp-secret');
  await expect(secretLocator).toBeVisible();
  const secret = await secretLocator.textContent();
  if (!secret) throw new Error('ADMIN_E2E_TOTP_SECRET_MISSING');
  const code = new OTPAuth.TOTP({ digits: 6, period: 30, secret }).generate();
  await page.locator('#admin-mfa-enroll-code').fill(code);
  await page.getByRole('button', { name: '完成綁定' }).click();
  await page.waitForURL(/\/admin\/mfa\/challenge$/u);
  return secret;
}

// 挑戰頁只算碼、送出；導向哪裡由呼叫端斷言（初次綁定後去 /admin，
// timeout/restore 情境則回 returnTo 記住的原頁），這裡不代呼叫端猜測。
export async function challengeAdmin(
  page: Page,
  secret: string,
): Promise<void> {
  const code = new OTPAuth.TOTP({ digits: 6, period: 30, secret }).generate();
  await page.locator('#admin-mfa-challenge-code').fill(code);
  await page.getByRole('button', { name: '驗證' }).click();
}

// 2026-08-19：app 的 Supabase client 用 window.sessionStorage 存 session
// （owner 要求「關閉分頁即登出」），Playwright 的 storageState 機制只存
// cookies／localStorage，抓不到 sessionStorage——每個新 context 對 app
// 而言都是全新分頁，無法跨 spec 檔重用已登入狀態。但 TOTP secret 只在
// enrollment 當下的畫面出現一次，之後任何一次 challenge（包含另一個
// spec 檔要用同一個 fixture admin 時）都需要它。這兩個函式把 secret
// 寫進 test-results/ 底下的暫存檔（已在 .gitignore），讓
// admin-security.spec.ts 完成 enrollment 後，admin-viewports.spec.ts
// 可以讀回來繼續走 challenge，不必重新綁定（也綁不了——同一 factor
// 只能綁定一次）。
const SECRET_STORE_PATH = 'test-results/.admin-e2e-totp-secrets.json';

async function readSecretStore(): Promise<Record<string, string>> {
  try {
    return JSON.parse(await readFile(SECRET_STORE_PATH, 'utf8')) as Record<
      string,
      string
    >;
  } catch {
    return {};
  }
}

export async function saveAdminTotpSecret(
  label: string,
  secret: string,
): Promise<void> {
  await mkdir(dirname(SECRET_STORE_PATH), { recursive: true });
  const existing = await readSecretStore();
  existing[label] = secret;
  await writeFile(SECRET_STORE_PATH, JSON.stringify(existing), 'utf8');
}

export async function readAdminTotpSecret(label: string): Promise<string> {
  const store = await readSecretStore();
  const secret = store[label];
  if (!secret) {
    throw new Error(
      `ADMIN_E2E_TOTP_SECRET_MISSING_FOR_${label}: run admin-security.spec.ts first`,
    );
  }
  return secret;
}
