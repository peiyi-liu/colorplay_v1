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
 * 重用邊界：登入／quiz／mission／classroom fixture 的機制性互動（選擇器＋
 * 等待序列）已抽成 tests/e2e/helpers/*.ts，這裡與 tests/e2e/live-smoke.spec.ts、
 * quiz-runner.spec.ts、playable-slice.spec.ts 都 import 同一份，不再各自
 * 重複同一組選擇器。runner 內只留「這裡才用得到」的正交邏輯：畫面對應
 * （runSetup 分派）、教師稽核用班級/成員的冪等 ensure 流程、章節複習頁的
 * 動態 id 解析、以及截圖／manifest 輸出本身。
 *
 * Node 24 對 .ts 檔的原生型別剝離（type-stripping）支援讓這支 .mjs 可以直接
 * import tests/e2e/helpers/*.ts 與 tests/fixtures/*.ts，不需要另外掛
 * tsx/ts-node loader，也不需要把共用邏輯改寫成一份 .mjs 版本——維持 helper
 * 只有一份 TypeScript 原始碼，供 e2e spec（Playwright 內建 esbuild 轉譯）與
 * 這支 runner（Node 原生型別剝離）兩種不同執行環境共用。前提是 helper 內只
 * 能用可剝離語法（型別註記／type-only import／Readonly<{}>），不能用
 * enum、namespace 等需要真的轉譯的 TS 特性——目前四個 helper 檔都符合。
 *
 * Live 主持／投影類設定（tHost、tPresenter 系列、tReport）需要教師＋學生雙
 * 瀏覽器同步一整場 Live 流程，成本遠高於其餘畫面；依 Task 0 指示先標記
 * `skipped: 'setup-pending'`，留待 Task 12 執行時再補。
 *
 * liveQuestion／liveFull（Task 11 補上）：教師分頁走 tests/e2e/live-smoke.spec.ts
 * 同款「選單元→建立活動並開場」流程開一場 screen_only 場次，配「Live 設計
 * 稽核班級」這個冪等（存在即重用、只建一次）班級與 liveHostTeacher／
 * liveStudentOne 這組專用帳號——刻意不共用 studentOne／teacher（其餘 30 幾
 * 個畫面共用的帳號），因為 teacher-live-page.tsx 的「一鍵開場」把場次自動
 * 掛在 classrooms.data[0]（依 created_at 升冪的第一筆），若跟其他畫面共用
 * 帳號、其他任務累積的班級排在前面，開場會誤掛到 studentOne 沒加入的班級
 * 而導致學生端加入失敗。liveHostTeacher 專用帳號目前只由這個 runner 建立
 * 唯一一間班級，能保證 data[0] 永遠解析到它。
 *
 * liveFeedback（`live-after-answer`）維持 skip：DC 1207-1246 對應的是
 * FeedbackPhase（question_display='device' 時的非全屏回饋——分布條＋教師
 * 引導解析＋名次卡），但 10D 簡化後的 teacher-live-page.tsx 已移除顯示位置
 * 選單，一鍵開場的 RPC 呼叫沒有帶 questionDisplay 參數，後端預設一律
 * 'screen_only'（見 supabase/migrations/20260724000500_live_section_activities.sql:17）。
 * 也就是說目前的教師端 UI 完全無法產生 device 場次——這條路徑目前是只能被
 * 單元測試以 stub state 觸達的死碼（同 live-pages.test.tsx 既有的 team 模式
 * 測試手法）。直接用 supabase-js 繞過 UI 呼叫 RPC 帶 p_question_display:
 * 'device' 可以觸達，但那是在稽核 runner 裡新造一條產品從未使用過的後門
 * 路徑，超出「畫面級截圖確認」的任務範圍；改以 live-pages.test.tsx 新增的
 * RTL 單元測試（見 'renders the non-fullscreen feedback...'）覆蓋這個狀態的
 * DC 檢查項，runner 維持 skip 並在報告說明。
 */
// pnpm 的嚴格 node_modules 連結下，`playwright` 只是 @playwright/test 的間接
// 依賴，不會提升到頂層可 import；@playwright/test 本身重新匯出同一組
// browser launcher，因此改從這裡取得 chromium，避免另外新增一個直接依賴。
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { setTimeout } from 'node:timers/promises';

import { SCREENS, WIDTHS } from './screen-routes.mjs';
import { TEST_USERS } from '../../tests/fixtures/users.ts';
import {
  signInStudent,
  signInTeacher,
  switchToTeacherTab,
} from '../../tests/e2e/helpers/auth.ts';
import {
  answerQuizQuestionByFirstOption,
  finishQuizByAnsweringFirstOption,
  fullChallengeChapter,
  startQuizFromLobby,
} from '../../tests/e2e/helpers/quiz.ts';
import { startMissionFromSelectPage } from '../../tests/e2e/helpers/mission.ts';
import {
  createClassroom,
  findClassroomIdByName,
  joinClassroomByCode,
  readFirstMemberRef,
  rotateClassroomJoinCode,
} from '../../tests/e2e/helpers/classrooms.ts';

const readArg = (flag) =>
  process.argv.includes(flag)
    ? process.argv[process.argv.indexOf(flag) + 1]
    : null;

const only = readArg('--screen');
const onlyWidth = readArg('--width');
const base = process.env.AUDIT_BASE_URL ?? 'http://localhost:5199';
const outputRoot = 'artifacts/design-audit';

const LIVE_SETUP_SKIP_REASONS = new Set([
  'live-after-answer',
  'live-hosting',
  'live-close-question',
  'live-final',
]);

// liveQuestion／liveFull 專用帳號（見上方大註解）：不與其餘畫面共用的
// studentOne，避免 teacher-live-page.tsx 的一鍵開場誤掛到 studentOne 沒加入
// 的班級。
const LIVE_SESSION_SETUPS = new Set([
  'live-open-question',
  'live-fullscreen-result',
]);

// ---------------------------------------------------------------------------
// 登入：角色（'student' | 'teacher' | 'anon'）→ 對應 seed 帳號，機制委派給
// tests/e2e/helpers/auth.ts。studentCredentials 預設 studentOne（其餘 30 幾
// 個畫面共用的帳號），Live 場次 setup 覆寫為專用的 liveStudentOne。
// ---------------------------------------------------------------------------

async function loginAs(page, auth, studentCredentials = TEST_USERS.studentOne) {
  if (auth === 'anon') return;
  if (auth === 'teacher') {
    await signInTeacher(page, TEST_USERS.teacher);
    return;
  }
  await signInStudent(page, studentCredentials);
}

// ---------------------------------------------------------------------------
// 章節複習頁（動態 :firstChapterId，無獨立 setup 名稱——由大廳第一個可玩章節
// 的「複習與進度」連結點入取得）。不重複於任何 e2e spec，留在 runner 本地。
// ---------------------------------------------------------------------------

async function openFirstChapter(page) {
  await page.goto(`${base}/app`);
  await page.waitForLoadState('networkidle');
  await page.locator('.lobby-chapter__review').first().click();
  await page.waitForURL(/\/app\/chapters\//u);
}

// ---------------------------------------------------------------------------
// 班級排行榜（動態 :classroomId，無獨立 setup 名稱——由「我的班級」列表頁的
// 「查看排行榜」連結點入取得，同 openFirstChapter 手法）。Task 10 修正：
// screen-routes.mjs 先前把 `classrooms`/`leaderboard` 兩個畫面 id 的路由對
// 調寫錯（`classrooms` 誤指到 `/app/profile`——個人設定頁，`leaderboard` 缺
// 動態 classroomId、實際落在班級列表頁），本函式與上面的路由修正一併補上。
// ---------------------------------------------------------------------------

async function openFirstClassroomLeaderboard(page) {
  await page.goto(`${base}/app/leaderboard`);
  await page.waitForLoadState('networkidle');
  await page
    .getByRole('link', { name: /查看.*排行榜/u })
    .first()
    .click();
  await page.waitForURL(/\/app\/leaderboard\/.+/u);
}

// ---------------------------------------------------------------------------
// 教師班級稽核 fixture（動態 :classroomId / :memberRef，無獨立 setup 名稱）。
// 冪等：重跑只在第一次建立班級／成員，後續重用同一筆資料。組成用的每個
// 選擇器互動都來自 tests/e2e/helpers/classrooms.ts；這裡只是 runner 專屬的
// 「先查有沒有、沒有才建立」編排邏輯。
// ---------------------------------------------------------------------------

const AUDIT_CLASSROOM_NAME = '設計稽核班級';

async function ensureAuditClassroomWithMember(teacherPage, browser) {
  await teacherPage.goto(`${base}/teacher/classes`);
  await teacherPage.waitForLoadState('networkidle');

  let classroomId = await findClassroomIdByName(
    teacherPage,
    AUDIT_CLASSROOM_NAME,
  );
  if (!classroomId) {
    await createClassroom(teacherPage, AUDIT_CLASSROOM_NAME);
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
    const { joinCode } = await rotateClassroomJoinCode(teacherPage);

    const studentContext = await browser.newContext({ baseURL: base });
    const studentPage = await studentContext.newPage();
    await loginAs(studentPage, 'student');
    await joinClassroomByCode(studentPage, joinCode);
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
// Live 學生四態 fixture（Task 11）：liveHostTeacher 專用班級，冪等——第一次
// 執行才建立班級並讓 liveStudentOne 加入，之後重跑直接重用。與
// ensureAuditClassroomWithMember 手法相同，只是換一組 Live 專用帳號（見檔頭
// 大註解的理由）。
// ---------------------------------------------------------------------------

const LIVE_AUDIT_CLASSROOM_NAME = 'Live 設計稽核班級';

async function ensureLiveAuditClassroomWithStudent(teacherPage, browser) {
  await teacherPage.goto(`${base}/teacher/classes`);
  await teacherPage.waitForLoadState('networkidle');

  let classroomId = await findClassroomIdByName(
    teacherPage,
    LIVE_AUDIT_CLASSROOM_NAME,
  );
  let joinCode = null;
  if (!classroomId) {
    const receipt = await createClassroom(teacherPage, LIVE_AUDIT_CLASSROOM_NAME);
    joinCode = receipt.joinCode;
    classroomId = await findClassroomIdByName(
      teacherPage,
      LIVE_AUDIT_CLASSROOM_NAME,
    );
    if (!classroomId)
      throw new Error('DESIGN_AUDIT_LIVE_CLASSROOM_CREATE_FAILED');
  } else {
    await teacherPage.goto(`${base}/teacher/classes/${classroomId}`);
    await teacherPage.waitForLoadState('networkidle');
    const memberRef = await readFirstMemberRef(teacherPage);
    if (!memberRef) {
      ({ joinCode } = await rotateClassroomJoinCode(teacherPage));
    }
  }

  if (joinCode) {
    const studentContext = await browser.newContext({ baseURL: base });
    const studentPage = await studentContext.newPage();
    await signInStudent(studentPage, TEST_USERS.liveStudentOne);
    await joinClassroomByCode(studentPage, joinCode);
    await studentContext.close();
  }
}

// Live 場次主持流程：走跟 tests/e2e/live-smoke.spec.ts 一樣的「選單元→建立
// 活動並開場」，一鍵開場直接進投影模式並帶出六碼課堂代碼。每次呼叫都會建
// 一個新場次（活動/場次本身不像班級可冪等重用——一個場次只能走一次題目
// 進度），累積的活動列表跟其餘 quiz/mission setup 一樣屬既有可接受的本機
// side effect。
async function launchLiveSessionFromTeacherHome(teacherPage) {
  await teacherPage.goto(`${base}/teacher/live`);
  const sectionSelect = teacherPage.getByLabel('1・選擇對戰單元');
  await sectionSelect.waitFor();
  await sectionSelect.selectOption({ index: 1 });
  await teacherPage.getByRole('button', { name: '建立活動並開場' }).click();
  const presenter = teacherPage.getByLabel('投影模式');
  const codePanel = presenter.getByLabel('課堂代碼');
  await codePanel.waitFor();
  const joinCode = (await codePanel.innerText()).trim();
  return { presenter, joinCode };
}

// liveQuestion／liveFull 共用的前半段：確保 fixture 班級／學生成員→開一個
// screen_only 場次→學生（studentPage，已由 loginAs 登入 liveStudentOne）用
// 真實加入流程進場→主持人開第一題。回傳 presenter locator 供呼叫端決定要不
// 要再往下推（liveFull 需要再多按一次答案鈕）。
async function openLiveQuestionForStudent(studentPage, browser) {
  const teacherContext = await browser.newContext({ baseURL: base });
  const teacherPage = await teacherContext.newPage();
  await signInTeacher(teacherPage, TEST_USERS.liveHostTeacher);
  await ensureLiveAuditClassroomWithStudent(teacherPage, browser);
  const { presenter, joinCode } = await launchLiveSessionFromTeacherHome(teacherPage);

  await studentPage.goto(`${base}/app/live/join`);
  await studentPage.getByLabel('課堂代碼').fill(joinCode);
  await studentPage.getByRole('button', { name: '加入課堂' }).click();
  await studentPage.waitForURL(/\/app\/live\/[0-9a-f-]{36}$/u);

  await presenter.getByRole('button', { name: '開始第一題' }).click();
  await studentPage.locator('.question-card legend').waitFor();

  return { teacherContext };
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
      await switchToTeacherTab(page);
      return {};
    }
    case 'teacher-tab-submit-bad': {
      await switchToTeacherTab(page);
      await page
        .getByRole('textbox', { name: '帳號' })
        .fill('design.audit.invalid@colorplay.test');
      await page.getByLabel('密碼').fill('Design-Audit-Invalid1!');
      await page.getByRole('button', { name: '登入' }).click();
      await page.getByRole('alert').waitFor();
      return {};
    }
    case 'start-mission': {
      await startMissionFromSelectPage(page);
      return {};
    }
    case 'start-quiz': {
      await startQuizFromLobby(page, {
        templateId: fullChallengeChapter.templateId,
      });
      return {};
    }
    case 'answer-one': {
      await startQuizFromLobby(page, {
        templateId: fullChallengeChapter.templateId,
      });
      await answerQuizQuestionByFirstOption(page);
      return {};
    }
    case 'finish-quiz': {
      await finishQuizByAnsweringFirstOption(page);
      return {};
    }
    case 'live-open-question': {
      const { teacherContext } = await openLiveQuestionForStudent(
        page,
        browser,
      );
      await teacherContext.close();
      return {};
    }
    case 'live-fullscreen-result': {
      const { teacherContext } = await openLiveQuestionForStudent(
        page,
        browser,
      );
      // 唯一參與者作答即觸發伺服器自動關題（同 live-smoke.spec.ts 的既有
      // 行為），screen_only 學生端直接進全屏題間結果，不需要主持人再按
      // 「下一題」。
      await page.locator('.question-card button').first().click();
      await page.locator('.live-result-screen').waitFor();
      await teacherContext.close();
      return {};
    }
    case 'throttle-first-paint': {
      await page.route('**/rest/v1/**', async (route) => {
        await setTimeout(4000);
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

  if (screen.id === 'leaderboard') {
    await openFirstClassroomLeaderboard(page);
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

if (only && !SCREENS.some((screen) => screen.id === only)) {
  process.stderr.write(`DESIGN_AUDIT_UNKNOWN_SCREEN: ${only}\n`);
  process.exitCode = 1;
} else if (onlyWidth && !WIDTHS.some((width) => width.name === onlyWidth)) {
  process.stderr.write(`DESIGN_AUDIT_UNKNOWN_WIDTH: ${onlyWidth}\n`);
  process.exitCode = 1;
} else {
  const targetScreens = SCREENS.filter((screen) => !only || screen.id === only);
  const targetWidths = WIDTHS.filter(
    (width) => !onlyWidth || width.name === onlyWidth,
  );

  const manifest = [];
  const browser = await chromium.launch();

  // try/finally：迴圈中途若有畫面拋錯（例如某個 setup 逾時），已經截完的
  // entry 仍要落盤成 manifest.json，browser 也一定要關掉，不能整個run留下
  // 孤兒 chromium 行程或遺失先前畫面的稽核紀錄。錯誤本身不吞——finally 跑完
  // 後仍會繼續往外拋，process 照樣以非 0 結束。
  try {
    for (const screen of targetScreens) {
      for (const width of targetWidths) {
        // baseURL 一定要設：共用的 tests/e2e/helpers/*.ts 用相對路徑
        // page.goto('/login') 之類的呼叫（比照 Playwright test 的
        // use.baseURL 慣例），沒有 baseURL 這裡會直接噴 invalid URL。
        const context = await browser.newContext({
          baseURL: base,
          viewport: width.viewport,
        });
        const page = await context.newPage();
        const consoleErrors = [];
        page.on(
          'console',
          (message) =>
            message.type() === 'error' && consoleErrors.push(message.text()),
        );

        process.stdout.write(`[design-audit] ${screen.id} @ ${width.name}\n`);

        await loginAs(
          page,
          screen.auth,
          LIVE_SESSION_SETUPS.has(screen.setup)
            ? TEST_USERS.liveStudentOne
            : undefined,
        );
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

        const targetRoute =
          setup?.route ?? (setup ? null : resolveRoute(screen));
        if (targetRoute) {
          await page.goto(base + targetRoute);
        }
        if (!setup?.skipNetworkIdle) {
          await page.waitForLoadState('networkidle');
          // 好幾個畫面（chapter 詳情、mission 結算後、教師班級管理…）在拿到
          // networkidle 之後還有第二段串接的資料請求（React Query 波次抓
          // 取），這段空檔會被 networkidle 誤判成「已經穩定」，實際上畫面
          // 仍停在 RouteLoading 的「頁面載入中」。等它消失（或本來就沒出
          // 現）再截圖。`loading` 畫面本身就是要截這個轉場狀態，靠
          // skipNetworkIdle 跳過此步。
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
  } finally {
    mkdirSync(outputRoot, { recursive: true });
    writeFileSync(
      `${outputRoot}/manifest.json`,
      JSON.stringify(manifest, null, 2),
    );
    await browser.close();
  }
}
