#!/usr/bin/env node
/**
 * 全站設計稽核截圖 runner（Task 0）。
 *
 * 用法：
 *   node scripts/design-audit/capture-screens.mjs [--screen <id>] [--width 1280|393]
 *
 * 對 screen-routes.mjs 內每個畫面 × 每個寬度：登入（依 auth）→ 執行 setup（依
 * screen.setup 或畫面 id 特例）→ 導向目標路由 → 截全頁圖到
 * artifacts/design-audit/<screen>/<width>.png，並把結果彙整進
 * artifacts/design-audit/manifest.json（{screen, route, width, path, consoleErrors}）。
 *
 * 重用邊界：tests/e2e 內的登入／Live 建場流程都是各 spec 檔內的區域閉包，沒有
 * 匯出成可 import 的模組，因此本檔案依 Task 0 brief 允許的路徑，直接重新實作
 * 最小必要的登入／作答／建班互動（選擇器與流程對齊 tests/e2e/login.spec.ts、
 * live-smoke.spec.ts、quiz-runner.spec.ts、playable-slice.spec.ts）。種子帳號與
 * 章節清單則直接從 tests/fixtures 匯入，不重複造一份資料。
 *
 * Live 主持／投影類設定（tHost、tPresenter 系列、tReport、liveQuestion、
 * liveFeedback、liveFull）需要教師＋學生雙瀏覽器同步一整場 Live 流程，成本遠高於其餘畫面；
 * 依 Task 0 指示先標記 `skipped: 'setup-pending'`，留待 Task 11/12 執行時再補。
 */
// pnpm 的嚴格 node_modules 連結下，`playwright` 只是 @playwright/test 的間接
// 依賴，不會提升到頂層可 import；@playwright/test 本身重新匯出同一組
// browser launcher，因此改從這裡取得 chromium，避免另外新增一個直接依賴。
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import process from 'node:process';

import { SCREENS, WIDTHS } from './screen-routes.mjs';
import { TEST_USERS } from '../../tests/fixtures/users.ts';

const readArg = (flag) =>
  process.argv.includes(flag)
    ? process.argv[process.argv.indexOf(flag) + 1]
    : null;

const only = readArg('--screen');
const onlyWidth = readArg('--width');
const base = process.env.AUDIT_BASE_URL ?? 'http://localhost:5199';
const outputRoot = 'artifacts/design-audit';

const LIVE_SETUP_SKIP_REASONS = new Set([
  'live-open-question',
  'live-after-answer',
  'live-fullscreen-result',
  'live-hosting',
  'live-close-question',
  'live-final',
]);

// ---------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------

const waitForFeedback = (page) =>
  page
    .getByRole('heading', { name: /(?:✓ 答對了|✕ 答錯了)/u })
    .waitFor({ state: 'visible' });

// ---------------------------------------------------------------------------
// 登入（對齊 tests/e2e/live-smoke.spec.ts 的 signInTeacher/signInStudent）
// ---------------------------------------------------------------------------

async function loginAs(page, auth) {
  if (auth === 'anon') return;

  const account =
    auth === 'teacher' ? TEST_USERS.teacher : TEST_USERS.studentOne;
  await page.goto(`${base}/login`);
  if (auth === 'teacher') {
    // 原生 radio 被樣式裁切成 tab，check() 會等到可見狀態逾時；改點 label 文字
    // （沿用 live-smoke.spec.ts 的做法）。
    await page.getByText('教師端登入').click();
  }
  await page.getByRole('textbox', { name: '帳號' }).fill(account.email);
  await page.getByLabel('密碼').fill(account.password);
  await page.getByRole('button', { name: '登入' }).click();
  await page.waitForURL(auth === 'teacher' ? /\/teacher$/u : /\/app$/u);
}

// ---------------------------------------------------------------------------
// Quiz / Mission 作答流程（對齊 tests/e2e/quiz-runner.spec.ts、
// playable-slice.spec.ts、mission-page.tsx 的按鈕文案）
// ---------------------------------------------------------------------------

async function startQuizSession(page) {
  await page.goto(`${base}/app`);
  await page.waitForLoadState('networkidle');
  await page.locator('.lobby-chapter__challenge').first().click();
  await page.waitForURL(/\/app\/quiz\/[0-9a-f-]{36}$/u);
}

async function answerCurrentQuizQuestion(page) {
  // 上一題「下一題／結算」點下去後 React 需要一拍重繪新題目；沒有這個等待，
  // .question-option 的 first() 有機率仍解析到舊題已停用的選項節點，導致
  // click() 卡在「element is not enabled」重試迴圈。用新題目一定會出現的
  // 「送出答案」按鈕（初始為停用狀態，但存在）當作重繪完成的訊號。
  await page
    .getByRole('button', { name: '送出答案' })
    .waitFor({ state: 'visible' });
  await page.locator('.question-option').first().click();
  await page.getByRole('button', { name: '送出答案' }).click();
  await waitForFeedback(page);
}

// 點下「結算並查看結果」到真的導向 /result，中間還有一段結算用的非同步呼叫；
// 這段時間內 networkidle 常常提早判定完成（兩次請求間剛好有 >500ms 空檔），
// 之後才發生真正的導頁。改為手動輪詢「/result 網址」或「下一題一定會出現的
// 送出答案按鈕」兩者其一出現，避免用 Promise.race + 個別 waitFor 造成其中一
// 支未被等待的 promise 之後才 reject 而變成 unhandled rejection。
async function waitForNextQuizStep(page, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (/\/result$/u.test(new URL(page.url()).pathname)) return;
    if (
      await page
        .getByRole('button', { name: '送出答案' })
        .isVisible()
        .catch(() => false)
    ) {
      return;
    }
    await page.waitForTimeout(200);
  }
  throw new Error('DESIGN_AUDIT_QUIZ_STEP_TIMEOUT');
}

async function finishQuizSession(page) {
  await startQuizSession(page);
  const maxQuestions = 20; // 安全上限；實際題數由畫面上的「結算」按鈕決定何時停止
  for (let attempt = 0; attempt < maxQuestions; attempt += 1) {
    if (/\/result$/u.test(new URL(page.url()).pathname)) return;
    await answerCurrentQuizQuestion(page);
    const continueButton = page.getByRole('button', {
      name: /我理解了，下一題|結算並查看結果/u,
    });
    await continueButton.click();
    await waitForNextQuizStep(page);
  }
  throw new Error('DESIGN_AUDIT_QUIZ_DID_NOT_FINISH');
}

async function startMissionSession(page) {
  await page.goto(`${base}/app/missions`);
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: '展開小節任務' }).first().click();
  await page.waitForURL(/\/app\/missions\/[0-9a-f-]{36}$/u);
}

// ---------------------------------------------------------------------------
// 章節複習頁（動態 :firstChapterId，無獨立 setup 名稱——由大廳第一個可玩章節
// 的「複習與進度」連結點入取得）
// ---------------------------------------------------------------------------

async function openFirstChapter(page) {
  await page.goto(`${base}/app`);
  await page.waitForLoadState('networkidle');
  await page.locator('.lobby-chapter__review').first().click();
  await page.waitForURL(/\/app\/chapters\//u);
}

// ---------------------------------------------------------------------------
// 教師班級稽核 fixture（動態 :classroomId / :memberRef，無獨立 setup 名稱）。
// 冪等：重跑只在第一次建立班級／成員，後續重用同一筆資料。
// ---------------------------------------------------------------------------

const AUDIT_CLASSROOM_NAME = '設計稽核班級';

async function findClassroomIdByName(page, name) {
  const article = page
    .locator('ul[aria-label="教師班級列表"] li article')
    .filter({ has: page.getByRole('heading', { name, exact: true }) });
  if ((await article.count()) === 0) return null;
  const href = await article
    .first()
    .getByRole('link', { name: '管理班級' })
    .getAttribute('href');
  return href ? href.split('/').pop() : null;
}

async function readFirstMemberRef(page) {
  const link = page.getByRole('link', { name: '查看細節 ›' }).first();
  if ((await link.count()) === 0) return null;
  const href = await link.getAttribute('href');
  return href ? href.split('/').pop() : null;
}

async function ensureAuditClassroomWithMember(teacherPage, browser) {
  await teacherPage.goto(`${base}/teacher/classes`);
  await teacherPage.waitForLoadState('networkidle');

  let classroomId = await findClassroomIdByName(
    teacherPage,
    AUDIT_CLASSROOM_NAME,
  );
  if (!classroomId) {
    await teacherPage
      .getByRole('textbox', { name: '班級名稱' })
      .fill(AUDIT_CLASSROOM_NAME);
    await teacherPage.getByRole('button', { name: '建立班級' }).click();
    await teacherPage.getByLabel('一次性班級加入碼').waitFor();
    classroomId = await findClassroomIdByName(
      teacherPage,
      AUDIT_CLASSROOM_NAME,
    );
    if (!classroomId) throw new Error('DESIGN_AUDIT_CLASSROOM_CREATE_FAILED');
  }

  await teacherPage.goto(`${base}/teacher/classes/${classroomId}`);
  await teacherPage.waitForLoadState('networkidle');

  let memberRef = await readFirstMemberRef(teacherPage);
  if (!memberRef) {
    await teacherPage.getByRole('button', { name: '輪替加入碼' }).click();
    await teacherPage.getByRole('button', { name: '確認輪替' }).click();
    const receipt = teacherPage.getByLabel('一次性班級加入碼');
    await receipt.waitFor();
    const joinCode = (await receipt.locator('strong').innerText()).trim();

    const studentContext = await browser.newContext({ baseURL: base });
    const studentPage = await studentContext.newPage();
    await loginAs(studentPage, 'student');
    await studentPage.goto(`${base}/join/${joinCode}`);
    await studentPage.getByRole('button', { name: '加入班級' }).click();
    await studentPage.waitForLoadState('networkidle');
    await studentContext.close();

    await teacherPage.reload();
    await teacherPage.waitForLoadState('networkidle');
    memberRef = await readFirstMemberRef(teacherPage);
    if (!memberRef)
      throw new Error('DESIGN_AUDIT_CLASSROOM_MEMBER_JOIN_FAILED');
  }

  return { classroomId, memberRef };
}

// ---------------------------------------------------------------------------
// runSetup：依 screen.setup（或無 setup 但路由含動態參數的畫面 id 特例）執行
// 進頁前互動。回傳值決定 main loop 接下來的動作：
//   - null/undefined      → 沒有 setup，main loop 用 screen.route 直接 goto
//   - { }                 → setup 已把頁面帶到最終狀態，不再 goto（避免重整
//                            清掉剛互動出來的畫面狀態，例如教師 tab 切換）
//   - { route }            → setup 解析出動態路由（例如帶入 classroomId），
//                            main loop 用這個 route 去 goto
//   - { skipNetworkIdle }  → 已手動 goto，但不能等 networkidle（loading 畫面
//                            要在節流的請求完成「之前」截圖）
//   - { skipped }          → 本畫面此次不截圖，manifest 記一筆 skipped 原因
// ---------------------------------------------------------------------------

async function runSetup(page, browser, screen) {
  if (LIVE_SETUP_SKIP_REASONS.has(screen.setup)) {
    return { skipped: 'setup-pending' };
  }

  switch (screen.setup) {
    case 'switch-teacher-tab': {
      // auth: 'anon' → loginAs() 是 no-op，這裡的畫面需要自己先落地在 /login。
      await page.goto(`${base}/login`);
      await page.getByText('教師端登入').click();
      return {};
    }
    case 'teacher-tab-submit-bad': {
      await page.goto(`${base}/login`);
      await page.getByText('教師端登入').click();
      await page
        .getByRole('textbox', { name: '帳號' })
        .fill('design.audit.invalid@colorplay.test');
      await page.getByLabel('密碼').fill('Design-Audit-Invalid1!');
      await page.getByRole('button', { name: '登入' }).click();
      await page.getByRole('alert').waitFor();
      return {};
    }
    case 'start-mission': {
      await startMissionSession(page);
      return {};
    }
    case 'start-quiz': {
      await startQuizSession(page);
      return {};
    }
    case 'answer-one': {
      await startQuizSession(page);
      await answerCurrentQuizQuestion(page);
      return {};
    }
    case 'finish-quiz': {
      await finishQuizSession(page);
      return {};
    }
    case 'throttle-first-paint': {
      await page.route('**/rest/v1/**', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 4000));
        await route.continue().catch(() => undefined);
      });
      await page.goto(`${base}/app`);
      await page
        .getByRole('status', { name: '頁面載入中' })
        .waitFor({ state: 'visible', timeout: 8000 });
      return { skipNetworkIdle: true };
    }
    default:
      break;
  }

  if (screen.id === 'chapter') {
    await openFirstChapter(page);
    return {};
  }

  if (screen.id === 'tClassDetail' || screen.id === 'tStudentProgress') {
    const { classroomId, memberRef } = await ensureAuditClassroomWithMember(
      page,
      browser,
    );
    return {
      route:
        screen.id === 'tClassDetail'
          ? `/teacher/classes/${classroomId}`
          : `/teacher/classes/${classroomId}/members/${memberRef}`,
    };
  }

  return null;
}

function resolveRoute(screen) {
  if (screen.route.includes(':')) {
    throw new Error(
      `DESIGN_AUDIT_UNRESOLVED_ROUTE_PARAM: ${screen.id} (${screen.route})`,
    );
  }
  return screen.route;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const targetScreens = SCREENS.filter((screen) => !only || screen.id === only);
const targetWidths = WIDTHS.filter(
  (width) => !onlyWidth || width.name === onlyWidth,
);

if (targetScreens.length === 0) {
  process.stderr.write(`DESIGN_AUDIT_UNKNOWN_SCREEN: ${String(only)}\n`);
  process.exitCode = 1;
} else {
  const manifest = [];
  const browser = await chromium.launch();

  for (const screen of targetScreens) {
    for (const width of targetWidths) {
      const context = await browser.newContext({ viewport: width.viewport });
      const page = await context.newPage();
      const consoleErrors = [];
      page.on(
        'console',
        (message) =>
          message.type() === 'error' && consoleErrors.push(message.text()),
      );

      process.stdout.write(`[design-audit] ${screen.id} @ ${width.name}\n`);

      await loginAs(page, screen.auth);
      const setup = await runSetup(page, browser, screen);

      if (setup?.skipped) {
        manifest.push({
          screen: screen.id,
          route: screen.route,
          width: width.name,
          path: null,
          consoleErrors,
          skipped: setup.skipped,
        });
        await context.close();
        continue;
      }

      const targetRoute = setup?.route ?? (setup ? null : resolveRoute(screen));
      if (targetRoute) {
        await page.goto(base + targetRoute);
      }
      if (!setup?.skipNetworkIdle) {
        await page.waitForLoadState('networkidle');
        // 好幾個畫面（chapter 詳情、mission 結算後、教師班級管理…）在拿到
        // networkidle 之後還有第二段串接的資料請求（React Query 波次抓取），
        // 這段空檔會被 networkidle 誤判成「已經穩定」，實際上畫面仍停在
        // RouteLoading 的「頁面載入中」。等它消失（或本來就沒出現）再截圖。
        // `loading` 畫面本身就是要截這個轉場狀態，靠 skipNetworkIdle 跳過此步。
        await page
          .getByRole('status', { name: '頁面載入中' })
          .waitFor({ state: 'hidden', timeout: 10000 })
          .catch(() => undefined);
      }

      const dir = `${outputRoot}/${screen.id}`;
      mkdirSync(dir, { recursive: true });
      const path = `${dir}/${width.name}.png`;
      await page.screenshot({ path, fullPage: true });
      manifest.push({
        screen: screen.id,
        route: screen.route,
        width: width.name,
        path,
        consoleErrors,
      });

      await context.close();
    }
  }

  mkdirSync(outputRoot, { recursive: true });
  writeFileSync(
    `${outputRoot}/manifest.json`,
    JSON.stringify(manifest, null, 2),
  );
  await browser.close();
}
