import type { Page } from '@playwright/test';

// 共用登入互動：學生／教師登入表單的選擇器與流程。原本分別內嵌於
// tests/e2e/live-smoke.spec.ts、quiz-runner.spec.ts、playable-slice.spec.ts，
// 以及 scripts/design-audit/capture-screens.mjs，三處以上重複同一組選擇器；
// 抽成這裡讓 e2e spec 與截圖 runner 都 import 同一份。
//
// 這個模組刻意只做「操作＋等待到期望狀態」，不含 expect() 斷言——呼叫端（測試
// 或 runner）各自決定要不要在登入後另外斷言頁面內容，登入本身的機制與斷言
// 分離讓這裡可以同時被兩種呼叫者共用。
export type Credentials = Readonly<{ email: string; password: string }>;

export async function signInStudent(
  page: Page,
  credentials: Credentials,
): Promise<void> {
  await page.goto('/login');
  await page.getByRole('textbox', { name: '帳號' }).fill(credentials.email);
  await page.getByLabel('密碼').fill(credentials.password);
  await page.getByRole('button', { name: '登入' }).click();
  await page.waitForURL(/\/app$/u);
}

export async function signInTeacher(
  page: Page,
  credentials: Credentials,
): Promise<void> {
  await page.goto('/login');
  // 原生 radio 被樣式裁切成 tab，check() 會等到可見狀態逾時；改點 label 文字。
  await page.getByText('教師端登入').click();
  await page.getByRole('textbox', { name: '帳號' }).fill(credentials.email);
  await page.getByLabel('密碼').fill(credentials.password);
  await page.getByRole('button', { name: '登入' }).click();
  await page.waitForURL(/\/teacher$/u);
}

// 只切到教師登入 tab，不送出——供「tLogin」畫面與未來需要停在教師 tab
// 但尚未登入狀態的呼叫端使用。
export async function switchToTeacherTab(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByText('教師端登入').click();
}

// GameStage Shell（2026-08-01）：登出鈕收進底部 HUD 的 MENU 面板。
export async function signOutViaHud(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'MENU' }).click();
  await page.getByRole('button', { name: '登出' }).click();
}
