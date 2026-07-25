import type { Page } from '@playwright/test';

// 共用班級 fixture 互動：原本 tests/e2e/live-smoke.spec.ts 與
// scripts/design-audit/capture-screens.mjs 各自重複「填班級名稱→建立→讀加入
// 碼」「用加入碼加入班級」的選擇器序列，抽成這裡共用。輪替加入碼／解析
// classroomId／讀第一位成員 memberRef 只有截圖 runner 用到，但同屬「班級
// fixture 互動」，一起放這裡方便之後有 e2e spec 需要時直接重用。

export type ClassroomReceipt = Readonly<{ joinCode: string }>;

// 呼叫端需先自行導到 /teacher/classes（不同呼叫端的前置動線不同，例如
// runner 會先檢查是否已有同名班級）。
export async function createClassroom(
  teacherPage: Page,
  name: string,
): Promise<ClassroomReceipt> {
  await teacherPage.getByRole('textbox', { name: '班級名稱' }).fill(name);
  await teacherPage.getByRole('button', { name: '建立班級' }).click();
  const receipt = teacherPage.getByLabel('一次性班級加入碼');
  await receipt.waitFor();
  const joinCode = (await receipt.locator('strong').innerText()).trim();
  return { joinCode };
}

export async function rotateClassroomJoinCode(
  teacherPage: Page,
): Promise<ClassroomReceipt> {
  await teacherPage.getByRole('button', { name: '輪替加入碼' }).click();
  await teacherPage.getByRole('button', { name: '確認輪替' }).click();
  const receipt = teacherPage.getByLabel('一次性班級加入碼');
  await receipt.waitFor();
  const joinCode = (await receipt.locator('strong').innerText()).trim();
  return { joinCode };
}

export async function joinClassroomByCode(
  studentPage: Page,
  joinCode: string,
): Promise<void> {
  await studentPage.goto(`/join/${joinCode}`);
  await studentPage.getByRole('button', { name: '加入班級' }).click();
  await studentPage.waitForLoadState('networkidle');
}

// 教師班級管理頁（/teacher/classes）上，用班級名稱找對應的 classroomId
// （由「管理班級」連結的 href 解析），找不到回傳 null。
export async function findClassroomIdByName(
  page: Page,
  name: string,
): Promise<string | null> {
  const article = page
    .locator('ul[aria-label="教師班級列表"] li article')
    .filter({ has: page.getByRole('heading', { name, exact: true }) });
  if ((await article.count()) === 0) return null;
  const href = await article
    .first()
    .getByRole('link', { name: '管理班級' })
    .getAttribute('href');
  return href ? (href.split('/').pop() ?? null) : null;
}

// 班級詳情頁（/teacher/classes/:id）上，讀第一位成員的 memberRef（由「查看
// 細節」連結的 href 解析），沒有成員回傳 null。
export async function readFirstMemberRef(page: Page): Promise<string | null> {
  const link = page.getByRole('link', { name: '查看細節 ›' }).first();
  if ((await link.count()) === 0) return null;
  const href = await link.getAttribute('href');
  return href ? (href.split('/').pop() ?? null) : null;
}
