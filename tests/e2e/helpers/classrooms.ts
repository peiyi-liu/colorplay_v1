import { randomUUID } from 'node:crypto';

import type { Page } from '@playwright/test';

import type { Credentials } from './auth.ts';
import { signedInClient } from '../../helpers/signed-in-client.ts';

// 共用班級 fixture 互動：原本 tests/e2e/live-smoke.spec.ts 與
// scripts/design-audit/capture-screens.mjs 各自重複「填班級名稱→建立→讀加入
// 碼」「讓帳號加入班級」的選擇器序列，抽成這裡共用。
//
// 2026-07-27/07-30 owner 裁定重寫了這裡的每一段互動，修這支檔案前先核對過
// 現行畫面／路由（src/features/classrooms/pages/teacher-classrooms-page.tsx、
// src/app/router/create-app-router.tsx）：
//
// 1. 建班不再回一次性加入碼 modal——加入碼固定顯示在班級卡上
//    （teacher-classrooms-page.tsx:19-50 的 ClassroomJoinCode，
//    `.classroom-card__code-value`），永遠可讀，不需要「只顯示一次」那套
//    receipt 邏輯，也因此不再需要「輪替」才能拿到碼：任何時候直接讀卡片
//    上的值即可。
// 2. 對應地，`輪替加入碼`／`確認輪替` 這兩顆鍵已經從教師班級頁移除（整份
//    teacher-classrooms-page.tsx 找不到），舊的 rotateClassroomJoinCode
//    (Page 版) 已刪除；仍需要「換一個新碼」的呼叫端（目前只有
//    classroom-leaderboard.spec.ts:268，驗證舊碼失效的驗收案例）直接呼叫
//    src/features/classrooms/api/classroom-repository.ts 的
//    `rotateJoinCode`——那是唯一還留著的入口，屬於 repository 層，不是這裡
//    的職責。
// 3. `/join/:code` 路由已整個移除（create-app-router.tsx 沒有這個
//    path；create-app-router.test.tsx 有斷言其不存在），
//    src/features/classrooms/pages/student-classrooms-page.tsx／
//    components/join-classroom-form.tsx 雖然原始碼還在，但沒有任何路由指向
//    它們，是死碼。學生現在改成「註冊時填班級序號」直接入班
//    （src/features/auth/pages/register-page.tsx 的 classCode 欄位＋
//    schemas/account-auth-schemas.ts 的 classCodeInput）。
//
//    但這條「註冊時入班」路徑只服務全新帳號——本檔兩個呼叫端
//    （live-smoke.spec.ts、capture-screens.mjs）用的都是 seed-auth.ts 預先
//    建好、已經有 profile 的固定帳號（liveStudentOne／studentOne 等），
//    走註冊會生出一個「跟 fixture 帳號無關」的新帳號，那個新帳號才是班級
//    成員；capture-screens.mjs 之後的 Live 場次稽核卻是另外用固定的
//    liveStudentOne 登入去加入場次（見該檔 openLiveQuestionForStudent／
//    launchLiveSessionForHostAudit），而 join_live_session RPC 會檢查
//    「登入者本人」是不是該班級的 active 學生成員
//    （supabase/migrations/20260724000300_live_student_experience.sql:374-383）
//    ——如果入班的是別的帳號，liveStudentOne 加入場次會直接被判
//    LIVE_JOIN_INVALID_CODE。也就是說對這兩個呼叫端而言，「入班的帳號」跟
//    「之後要用來操作的帳號」必須是同一個，註冊流程無法滿足。
//
//    目前產品內，已有 profile 的既有帳號完全沒有任何 UI 可以加入班級
//    （上面第 3 點）；這裡直接呼叫 join-classroom Edge Function，不透過
//    src/features/classrooms/api/
//    classroom-repository.ts 的包裝——那支檔案的 ClassroomRepositoryError
//    用了建構子參數屬性（parameter property），Node 原生型別剝離不支援
//    （實測 `TypeScript parameter property is not supported in strip-only
//    mode`），import 進來會讓 capture-screens.mjs 直接掛掉；裸接
//    `.functions.invoke(...)` 才能讓這支檔案繼續同時被 Playwright（esbuild
//    轉譯）與 capture-screens.mjs（Node 原生剝離）兩種執行環境載入。直接
//    join_classroom RPC 已撤銷 authenticated 權限，避免繞過 IP＋帳號限流。

export type ClassroomReceipt = Readonly<{
  classroomId: string;
  joinCode: string;
}>;

const readFunctionError = async (error: unknown): Promise<string> => {
  if (typeof error !== 'object' || error === null) return 'UNKNOWN';
  const fallback =
    'message' in error && typeof error.message === 'string'
      ? error.message
      : 'UNKNOWN';
  if (!('context' in error) || !(error.context instanceof Response)) {
    return fallback;
  }

  const payload: unknown = await error.context
    .clone()
    .json()
    .catch(() => null);
  return typeof payload === 'object' &&
    payload !== null &&
    'error' in payload &&
    typeof payload.error === 'string'
    ? payload.error
    : fallback;
};

// 教師班級列表（/teacher/classes）上，用班級名稱找到對應卡片
// （ul[aria-label="教師班級列表"] li article，heading 為班級名稱）。
// createClassroom／readClassroomJoinCode 共用，避免各自重寫同一段 locator。
const classroomCardByName = (page: Page, name: string) =>
  page
    .locator('ul[aria-label="教師班級列表"] li article')
    .filter({ has: page.getByRole('heading', { name, exact: true }) });

// 呼叫端需先自行導到 /teacher/classes（不同呼叫端的前置動線不同，例如
// runner 會先檢查是否已有同名班級）。
export async function createClassroom(
  teacherPage: Page,
  name: string,
): Promise<ClassroomReceipt> {
  await teacherPage.getByRole('textbox', { name: '班級名稱' }).fill(name);
  await teacherPage.getByRole('button', { name: '建立班級' }).click();
  // 班級名稱沒有唯一性限制（同一教師可以有多個同名班級——例如本檔案重跑
  // 未重置資料庫時會累積出好幾張同名卡片）；列表固定依 created_at 升冪排序
  // （supabase/migrations/20260717000200_classroom_commands.sql:375 的
  // `order by classroom.created_at, classroom.id`），剛建立的一定是同名卡片
  // 裡最後一張，用 .last() 精準鎖定「這次建立的」那一間，不會誤讀到別間
  // 同名舊班級的加入碼。
  const classroomCard = classroomCardByName(teacherPage, name).last();
  const codeValue = classroomCard.locator('.classroom-card__code-value');
  await codeValue.waitFor();
  const joinCode = (await codeValue.innerText()).trim();
  const href = await classroomCard
    .getByRole('link', { name: '進入班級' })
    .getAttribute('href');
  const classroomId = href?.split('/').pop();
  if (!classroomId) throw new Error('CLASSROOM_HELPER_ID_MISSING');
  return { classroomId, joinCode };
}

// 讀某個「已存在」班級卡片上目前的固定加入碼（不需要先建立）。加入碼永久
// 顯示、不會過期（teacher-classrooms-page.tsx 的 ClassroomJoinCode），所以
// 呼叫端要幫已存在的班級「拿一個可用的加入碼」時，直接讀卡片即可，不需要
// （也無法）像舊版 UI 那樣先按輪替。呼叫端需自行導到 /teacher/classes。
// 同名多筆時取第一筆（.first()），與 findClassroomIdByName 的既有慣例
// 一致，確保兩者解析到同一間班級。
export async function readClassroomJoinCode(
  page: Page,
  name: string,
): Promise<string> {
  const codeValue = classroomCardByName(page, name)
    .first()
    .locator('.classroom-card__code-value');
  await codeValue.waitFor();
  return (await codeValue.innerText()).trim();
}

// 讓一個「已有帳號」的學生（seed-auth.ts 預建的固定 fixture，例如
// liveStudentOne／studentOne）用加入碼成為某班級的學生成員。現行產品 UI
// 對既有帳號完全沒有「加入班級」入口（見檔頭說明），直接呼叫受限流保護的
// join-classroom Edge Function。重複呼叫同一組（帳號、班級）仍維持冪等，
// 呼叫端不需要事先檢查是否已是成員。
export async function joinClassroomByCode(
  credentials: Credentials,
  joinCode: string,
): Promise<void> {
  const client = await signedInClient(credentials);
  try {
    const response: unknown = await client.functions.invoke<unknown>(
      'join-classroom',
      {
        body: {
          joinCode: joinCode.trim(),
          requestId: randomUUID(),
        },
      },
    );
    if (
      typeof response !== 'object' ||
      response === null ||
      !('error' in response)
    ) {
      throw new Error('CLASSROOM_HELPER_JOIN_FAILED: INVALID_RESPONSE');
    }
    if (response.error !== null) {
      const message = await readFunctionError(response.error);
      throw new Error(`CLASSROOM_HELPER_JOIN_FAILED: ${message}`);
    }
  } finally {
    await client.auth.signOut({ scope: 'local' });
  }
}

// 教師班級管理頁（/teacher/classes）上，用班級名稱找對應的 classroomId
// （由「管理班級」連結的 href 解析），找不到回傳 null。
export async function findClassroomIdByName(
  page: Page,
  name: string,
): Promise<string | null> {
  const article = classroomCardByName(page, name);
  if ((await article.count()) === 0) return null;
  const href = await article
    .first()
    .getByRole('link', { name: '進入班級' })
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
