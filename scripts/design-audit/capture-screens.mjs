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
 * Live 主持／投影類設定（tHost、tPresenter、tPresenterChart、
 * tPresenterPodium、tReport，Task 12 補上）：教師＋學生雙瀏覽器同步一整場
 * Live 流程，成本遠高於其餘畫面，Task 0 先標記 `skipped: 'setup-pending'`
 * 留到這裡才實作。共用 launchLiveSessionForHostAudit 開一場新場次＋讓
 * liveStudentOne 用真實加入流程進場，再依畫面需要的階段往下推：
 * live-hosting（tHost／tPresenter）開第一題但不收題；live-close-question
 * （tPresenterChart）讓唯一參與者作答觸發伺服器自動收題，看長條圖／Top 5；
 * live-final（tPresenterPodium／tReport）反覆「作答→按主持台當前主要
 * 動作」直到主要動作文案變成「結算成績」再按下，落地最終頒獎台／報表。
 * 全程用同一組 liveHostTeacher／liveStudentOne 帳號（理由見下方 Live 學生
 * 四態 fixture 註解），且不驗證答案對錯——單一參與者不論選哪個選項都會
 * 觸發自動收題，稽核截圖只需要「有結果可看」，不需要像
 * live-smoke.spec.ts 那樣反查正解。
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
// 這支 .mjs 不在 eslint.config.js 的 typescriptFiles 範圍內，只吃到
// eslint.configs.recommended（no-undef 預設開啟，沒有像 .ts 那樣被
// typescript-eslint 關掉）。下面 page.evaluate(() => {...}) 傳入的 callback
// 實際是序列化到瀏覽器內執行（Playwright 機制），document/getComputedStyle
// 在那個執行環境裡是合法全域，只是這支檔案本身用 Node 語法解析看不出來——
// 用標準 ESLint 全域宣告註解讓 lint 認得這兩個識別字，不用整支關掉 no-undef。
/* global document, getComputedStyle */
// pnpm 的嚴格 node_modules 連結下，`playwright` 只是 @playwright/test 的間接
// 依賴，不會提升到頂層可 import；@playwright/test 本身重新匯出同一組
// browser launcher，因此改從這裡取得 chromium，避免另外新增一個直接依賴。
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { setTimeout } from 'node:timers/promises';
import { URL } from 'node:url';

import { SCREENS, WIDTHS } from './screen-routes.mjs';
import { TEST_USERS } from '../../tests/fixtures/users.ts';
import {
  signInStudent,
  signInTeacher,
  switchToTeacherTab,
} from '../../tests/e2e/helpers/auth.ts';
import { launchLiveSessionFromTeacherHome } from '../../tests/e2e/helpers/live.ts';
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

// liveFeedback（device 模式）依然無法從目前教師 UI 產生，維持 skip（見檔
// 頭大註解）；tHost 系列五個畫面的 setup 名稱由這裡移除即代表已實作。
const LIVE_SETUP_SKIP_REASONS = new Set(['live-after-answer']);

// liveQuestion／liveFull 專用帳號（見上方大註解）：不與其餘畫面共用的
// studentOne，避免 teacher-live-page.tsx 的一鍵開場誤掛到 studentOne 沒加入
// 的班級。
const LIVE_SESSION_SETUPS = new Set([
  'live-open-question',
  'live-fullscreen-result',
]);

// tHost 系列（教師視角）專用帳號，理由同上——一鍵開場誤掛班級的風險同樣
// 存在於教師本人，所以主持稽核也不能借用其餘 30 幾個畫面共用的 teacher。
const LIVE_HOST_SETUPS = new Set([
  'live-hosting',
  'live-close-question',
  'live-final',
]);

// ---------------------------------------------------------------------------
// 登入：角色（'student' | 'teacher' | 'anon'）→ 對應 seed 帳號，機制委派給
// tests/e2e/helpers/auth.ts。credentialOverride 預設對應角色的共用帳號
// （studentOne／teacher，其餘 30 幾個畫面共用），Live 場次／主持 setup 覆寫
// 為各自的專用帳號（liveStudentOne／liveHostTeacher）。
// ---------------------------------------------------------------------------

async function loginAs(page, auth, credentialOverride) {
  if (auth === 'anon') return;
  if (auth === 'teacher') {
    await signInTeacher(page, credentialOverride ?? TEST_USERS.teacher);
    return;
  }
  await signInStudent(page, credentialOverride ?? TEST_USERS.studentOne);
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

    const studentContext = await browser.newContext({
      baseURL: base,
      reducedMotion: 'reduce',
    });
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
    const receipt = await createClassroom(
      teacherPage,
      LIVE_AUDIT_CLASSROOM_NAME,
    );
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
    const studentContext = await browser.newContext({
      baseURL: base,
      reducedMotion: 'reduce',
    });
    const studentPage = await studentContext.newPage();
    await signInStudent(studentPage, TEST_USERS.liveStudentOne);
    await joinClassroomByCode(studentPage, joinCode);
    await studentContext.close();
  }
}

// Live 場次主持流程（選單元→建立活動並開場，一鍵開場直接進投影模式並帶出
// 六碼課堂代碼）已抽成 tests/e2e/helpers/live.ts 的
// launchLiveSessionFromTeacherHome，與 tests/e2e/live-smoke.spec.ts 共用同
// 一份選擇器序列（Task 12）。每次呼叫都會建一個新場次（活動/場次本身不像
// 班級可冪等重用——一個場次只能走一次題目進度），累積的活動列表跟其餘
// quiz/mission setup 一樣屬既有可接受的本機 side effect。

// liveQuestion／liveFull 共用的前半段：確保 fixture 班級／學生成員→開一個
// screen_only 場次→學生（studentPage，已由 loginAs 登入 liveStudentOne）用
// 真實加入流程進場→主持人開第一題。回傳 presenter locator 供呼叫端決定要不
// 要再往下推（liveFull 需要再多按一次答案鈕）。
async function openLiveQuestionForStudent(studentPage, browser) {
  const teacherContext = await browser.newContext({
    baseURL: base,
    reducedMotion: 'reduce',
  });
  const teacherPage = await teacherContext.newPage();
  await signInTeacher(teacherPage, TEST_USERS.liveHostTeacher);
  await ensureLiveAuditClassroomWithStudent(teacherPage, browser);
  const { presenter, joinCode } =
    await launchLiveSessionFromTeacherHome(teacherPage);

  await studentPage.goto(`${base}/app/live/join`);
  await studentPage.getByLabel('課堂代碼').fill(joinCode);
  await studentPage.getByRole('button', { name: '加入課堂' }).click();
  await studentPage.waitForURL(/\/app\/live\/[0-9a-f-]{36}$/u);

  await presenter.getByRole('button', { name: '開始第一題' }).click();
  await studentPage.locator('.question-card legend').waitFor();

  return { teacherContext };
}

// tHost 系列（教師視角，Task 12）共用的前半段：呼叫端已由 loginAs 用
// liveHostTeacher 登入並落在教師工作區。這裡確保 fixture 班級／學生成員→
// 開一場新場次（一鍵開場直接進投影模式）→ 另開一個學生分頁用真實加入流程
// 進場。回傳 sessionId（供各畫面解析動態路由）與 presenter／studentPage，
// 呼叫端決定要把場次再往前推到哪個階段。
async function launchLiveSessionForHostAudit(teacherPage, browser) {
  await ensureLiveAuditClassroomWithStudent(teacherPage, browser);
  const { presenter, joinCode } =
    await launchLiveSessionFromTeacherHome(teacherPage);
  const sessionId = new URL(teacherPage.url()).pathname.split('/').pop();
  if (!sessionId) throw new Error('DESIGN_AUDIT_LIVE_SESSION_ID_MISSING');

  const studentContext = await browser.newContext({
    baseURL: base,
    reducedMotion: 'reduce',
  });
  const studentPage = await studentContext.newPage();
  await signInStudent(studentPage, TEST_USERS.liveStudentOne);
  await studentPage.goto(`${base}/app/live/join`);
  await studentPage.getByLabel('課堂代碼').fill(joinCode);
  await studentPage.getByRole('button', { name: '加入課堂' }).click();
  await studentPage.waitForURL(/\/app\/live\/[0-9a-f-]{36}$/u);

  return { presenter, sessionId, studentContext, studentPage };
}

// tHost／tPresenter：開第一題但先不收題——學生已看到題目、尚未作答，對應
// DC 1428/1470「已作答 n/m」與即時作答分布的進行中狀態。
async function ensureLiveQuestionOpenForHost(teacherPage, browser) {
  const { presenter, sessionId, studentContext, studentPage } =
    await launchLiveSessionForHostAudit(teacherPage, browser);
  await presenter.getByRole('button', { name: '開始第一題' }).click();
  await studentPage.locator('.question-card legend').waitFor();
  await studentContext.close();
  return { sessionId };
}

// tPresenterChart：收題並公布答案後的長條圖／Top 5 畫面。唯一參與者作答
// 即觸發伺服器自動收題（同 live-smoke.spec.ts 既有行為），不需要主持人
// 再按一次「收題並公布答案」。
async function ensureLiveQuestionClosedForHost(teacherPage, browser) {
  const { presenter, sessionId, studentContext, studentPage } =
    await launchLiveSessionForHostAudit(teacherPage, browser);
  await presenter.getByRole('button', { name: '開始第一題' }).click();
  await studentPage.locator('.question-card legend').waitFor();
  await studentPage.locator('.question-card button').first().click();
  await presenter.locator('.live-presenter__chart').waitFor();
  await studentContext.close();
  return { sessionId };
}

// tPresenterPodium／tReport：走完整場直到結算成績。用主持台當前主要動作
// 的文案（下一題／結算成績）判斷該不該推進到下一題，不寫死題數；上限 30
// 輪純屬防呆（真實題庫遠小於此，跳出代表主持流程卡住而非正常結束）。
async function ensureLiveSessionCompletedForHost(teacherPage, browser) {
  const { presenter, sessionId, studentContext, studentPage } =
    await launchLiveSessionForHostAudit(teacherPage, browser);
  const primaryAction = presenter.locator('.primary-action');

  await presenter.getByRole('button', { name: '開始第一題' }).click();
  for (let round = 0; round < 30; round += 1) {
    await studentPage.locator('.question-card legend').waitFor();
    await studentPage.locator('.question-card button').first().click();
    // 等長條圖出現代表伺服器已自動收題、主持台已切到本題結果——這時
    // primaryAction 的文案才是這一輪真正該按的動作，不會讀到收題前殘留
    // 的「收題並公布答案」。
    await presenter.locator('.live-presenter__chart').waitFor();
    const label = (await primaryAction.innerText()).trim();
    await primaryAction.click();
    if (label === '結算成績') break;
  }
  await presenter.getByRole('heading', { name: '最終頒獎台' }).waitFor();
  // 頒獎台每階是獨立 CSS 動畫（globals.css .live-presenter__podium-step，
  // rank 1 delay 2.4s + 0.5s 動畫時長）：只等到標題出現就截圖，最高分那階
  // 還在 opacity:0 的延遲期，畫面會是空的。等滿最長延遲＋動畫時長，讓所有
  // 階都進到 reveal 後的終態再截圖。
  await setTimeout(3000);
  await studentContext.close();
  return { sessionId };
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
    case 'live-hosting': {
      const { sessionId } = await ensureLiveQuestionOpenForHost(page, browser);
      // tHost 是非投影的主持台（無 ?presenter=1），tPresenter 是同一場次
      // 的投影模式——用 screen.id 分流回傳的路由，不用 screen.route 的
      // :sessionId placeholder（那是給 resolveRoute 的靜態畫面用的）。
      return {
        route:
          screen.id === 'tPresenter'
            ? `/teacher/live/${sessionId}?presenter=1`
            : `/teacher/live/${sessionId}`,
      };
    }
    case 'live-close-question': {
      const { sessionId } = await ensureLiveQuestionClosedForHost(
        page,
        browser,
      );
      return { route: `/teacher/live/${sessionId}?presenter=1` };
    }
    case 'live-final': {
      const { sessionId } = await ensureLiveSessionCompletedForHost(
        page,
        browser,
      );
      // tPresenterPodium：teacherPage 已停在投影模式的最終頒獎台，不用再
      // goto（避免重整把投影狀態打回原形）。tReport 才需要再導到報表頁。
      return screen.id === 'tReport'
        ? { route: `/teacher/live/${sessionId}/report` }
        : {};
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

// ---------------------------------------------------------------------------
// Task 14 393 GATE 檢查：manifest 393 條目附上機器可查的 RWD 量測（不用再靠
// 肉眼盯 34 張截圖找水平捲動／小於 44px 觸控目標）。
//   - overflow：document.documentElement.scrollWidth 是否超出 clientWidth——
//     跟 tests/e2e/app-shell.visual.spec.ts 既有的
//     `scrollWidth <= clientWidth + 1` 判定同一套邏輯。「表格容器
//     overflow-x:auto 除外」這條允許不需要另外找表格特例：容器自己
//     overflow:auto 會把子內容的溢位攔在自己框內、不會外溢到
//     documentElement，這條全域檢查本來就只抓真正外溢到整頁的情況（跟本次
//     .student-rail__content 修正前後的實測結果一致）。
//   - smallTargets：可互動元素（連結／按鈕／表單控制項／role=button 等）
//     中，寬或高小於 44px 的（排除 display:none／未渲染的 0×0 元素）。
//   - smallFonts：字級低於 tokens.css 定義的最小字級 --font-size-metadata
//     （12px）的可見文字節點。
// ---------------------------------------------------------------------------

async function auditMobileRwd(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const vw = doc.clientWidth;
    const hasOverflow = doc.scrollWidth > vw + 1;
    // 只在真的有溢位時才找元凶，避免每個畫面都白白掃一次 DOM——找的是
    // rect.right 超出 viewport 的最外層元素（跳過同樣超出的子孫，不然清單
    // 會被巢狀結構洗版），方便直接定位是哪個 class 撐出去的，不用另外寫
    // scratch 腳本重查一次。
    const overflowingElements = [];
    if (hasOverflow) {
      const reported = new Set();
      for (const el of document.querySelectorAll('body *')) {
        const rect = el.getBoundingClientRect();
        if (rect.right <= vw + 1) continue;
        let ancestor = el.parentElement;
        let alreadyReported = false;
        while (ancestor) {
          if (reported.has(ancestor)) {
            alreadyReported = true;
            break;
          }
          ancestor = ancestor.parentElement;
        }
        if (alreadyReported) continue;
        reported.add(el);
        overflowingElements.push({
          tag: el.tagName.toLowerCase(),
          cls: el.className?.toString?.().slice(0, 60) ?? '',
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        });
        if (overflowingElements.length >= 10) break;
      }
    }
    const overflow = {
      scrollWidth: doc.scrollWidth,
      clientWidth: vw,
      hasOverflow,
      overflowingElements,
    };

    const INTERACTIVE_SELECTOR =
      'a[href], button, input:not([type="hidden"]), select, textarea, [role="button"], [role="link"], [role="tab"], [role="menuitem"], summary';
    const smallTargets = [];
    for (const el of document.querySelectorAll(INTERACTIVE_SELECTOR)) {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      if (rect.width < 44 || rect.height < 44) {
        smallTargets.push({
          tag: el.tagName.toLowerCase(),
          text: (el.textContent ?? el.getAttribute('aria-label') ?? '')
            .trim()
            .slice(0, 24),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        });
      }
    }

    const smallFonts = [];
    for (const el of document.querySelectorAll('body *')) {
      const hasOwnText = Array.from(el.childNodes).some(
        (node) => node.nodeType === 3 && node.textContent?.trim(),
      );
      if (!hasOwnText) continue;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const size = Number.parseFloat(style.fontSize);
      if (size < 12) {
        smallFonts.push({
          tag: el.tagName.toLowerCase(),
          cls: el.className?.toString?.().slice(0, 40) ?? '',
          fontSize: size,
          text: (el.textContent ?? '').trim().slice(0, 24),
        });
      }
    }

    return {
      overflow,
      smallTargets: smallTargets.slice(0, 30),
      smallFonts: smallFonts.slice(0, 30),
    };
  });
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
        // reducedMotion: 'reduce' 對應 globals.css:1007-1020 既有的
        // `@media (prefers-reduced-motion: reduce)` 全域規則（把每個
        // animation-duration/transition-duration 壓到 0.01ms）——這是
        // Task 14 修的第二個 runner 偽影：`.animate-fade-in`（globals.css:
        // 1055-1057，0.3s opacity/translateY 進場動效）在 networkidle 後立刻
        // 截圖，動畫還沒跑完就被拍到「全白/半透明」中間幀（Task 7 報告記錄）。
        // 用 Playwright 內建的 reduced-motion 模擬讓全站動畫在這個 context
        // 裡形同瞬間完成，一次修好全 corpus，不必逐頁面加 setTimeout 賭時機；
        // 這條全域規則不會動到只認 `[data-reduced-motion='true']` 這個
        // App 內部設定檔開關（而非 media query）的少數規則（例如
        // `.live-presenter__ring svg{display:none}`），所以不影響任何畫面
        // 本身該顯示的內容。
        const context = await browser.newContext({
          baseURL: base,
          viewport: width.viewport,
          reducedMotion: 'reduce',
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
            : LIVE_HOST_SETUPS.has(screen.setup)
              ? TEST_USERS.liveHostTeacher
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

        // Playwright 的虛擬滑鼠位置會跨 page.goto() 保留：登入表單「登入」鍵
        // 的點擊座標，剛好可能疊到目的頁某個互動元素上，讓截圖偶發帶出該
        // 元素的 :hover 樣式（Task 13 稽核 tClasses「管理班級」鍵撞見過，
        // CSS／DOM 本身經 getComputedStyle 直接驗證皆正確，純屬殘留滑鼠座標
        // 造成的截圖假象）。截圖前挪到畫面外角落，避免任何殘留 hover 態；
        // 部分 hover 樣式帶 150ms transition，:hover 一解除仍要多等一小段
        // 讓過場動畫跑完，不然截圖會停在「剛解除 hover」那一幀的中間色。
        await page.mouse.move(0, 0);
        await setTimeout(200);

        const dir = `${outputRoot}/${screen.id}`;
        mkdirSync(dir, { recursive: true });
        const path = `${dir}/${width.name}.png`;
        // `fullPage: true` 單獨使用時，Playwright 是對「整份可捲動內容」
        // 截圖，寬度跟高度都會跟著 document.documentElement.scrollWidth/
        // scrollHeight走——如果頁面本身有水平溢位（例如 Task 0 記錄的
        // `.student-rail__content` 393 寬溢位到 482px），393.png 檔案的
        // 實際物理寬度就不是 393，而是溢位後的寬度（Task 11 報告記錄過
        // 463px 的實例）。這樣一來稽核檔案本身就沒辦法拿來單純檢查
        // 「393 寬有沒有水平捲動」，因為連檔案尺寸都已經被溢位污染。
        // 用 clip 明確釘住 { width: 393（或 1280）, height: 真實內容高度 }
        // ——同時保留 fullPage:true 讓 CDP 截到的來源畫布涵蓋整份可捲動
        // 高度（只有 clip 沒有 fullPage 的話，clip 的可視範圍會被截斷在
        // 目前 viewport 高度內，量過＝852，量不到更下面的內容）。結果：
        // PNG 檔案寬度永遠等於 viewport CSS px，溢位的內容不會撐開檔案
        // 尺寸，而是被裁掉——溢位本身仍然是真實 bug，需要另外用
        // scrollWidth 檢查揪出來修，不能靠看截圖檔案尺寸判斷。
        const fullHeight = await page.evaluate(
          () => document.documentElement.scrollHeight,
        );
        await page.screenshot({
          path,
          fullPage: true,
          clip: {
            x: 0,
            y: 0,
            width: width.viewport.width,
            height: fullHeight,
          },
        });
        // 393 GATE（Task 14）：附上機器可查的 RWD 量測，manifest 本身就是
        // 差異結案清單的資料來源，不必逐張截圖肉眼抓水平捲動／小觸控目標。
        const rwd393 =
          width.name === '393' ? await auditMobileRwd(page) : undefined;
        manifest.push({
          screen: screen.id,
          route: screen.route,
          width: width.name,
          path,
          consoleErrors,
          ...(rwd393 ? { rwd393 } : {}),
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
