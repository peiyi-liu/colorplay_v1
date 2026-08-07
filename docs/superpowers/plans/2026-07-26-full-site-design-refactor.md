# 全站設計稿視覺重構 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 claude design 設計稿的 35 個畫面**逐畫面、逐元素**落到現有 colorplay 前端，達到畫面級一致（不是文字級一致）。

**Architecture:** 設計唯一事實源是 `live/project/ColorPlay 現有畫面.dc.html`（下稱 **DC**，共 2344 行；各任務引用行號區間，該區間的 inline style 即完整視覺規格，實作者直接讀取，不靠本計畫轉述）。重構純屬前端視覺層：JSX 結構＋`src/styles/globals.css`＋tokens；**零後端變更**（全部功能鍵的 RPC 對應已存在，見附錄 A）。驗證以「渲染截圖對照驗收清單」為準——**禁止以 grep 文字比對作為畫面一致性證據**（本專案已因此誤判教師工作區一次）。

**Tech Stack:** React 18 + TypeScript + Vite、CSS variables tokens（`src/styles/tokens.css`＋`globals.css`）、Vitest + RTL、Playwright（截圖 runner）。

## Global Constraints

- 設計事實源：`live/project/ColorPlay 現有畫面.dc.html`（DC）。文案以 DC 為準逐字採用。
- DC 色票（新值先加進 `tokens.css` 再引用，不得裸寫 hex 於元件）：紙張 `#f6f4ee`、墨 `#14161f`/`#1d212e`、黃 `#ffd600`（hover `#ffb300`）、琥珀文字 `#b26e05`、黃底 `#fff6c7`/`#fff0b3`/`#fffdf2`、紅 `#d64533`/`#b23425`、綠 `#128a5e`/`#0e6f4c`、藍 `#3056d8`/`#2542ad`、**教師紫 `#7b48ce`**、靛藍淺 `#e0e7fb`、灰階 `#646b7e`/`#c2c7d3`/`#e2e5ec`/`#eef0f4`/`#f6f7fa`。
- 可信邊界（AGENTS.md §5）：不得新增任何前端判定/計分邏輯；不得在取題回應中出現 `correct_answer`。
- 字體 Syne + Noto Sans TC；focus ring `3px #3056d8 offset 3px`；互動元件 min-height ≥ 44px（DC 小按鈕 34px 者除外）。
- 兩檔寬度都要驗：桌機 1280、手機 393。
- 每個 Task 獨立測試循環＋獨立 commit；commit 訊息附 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`。
- 單檔超過 500 行需說明或拆分。
- Suite 基線（不得倒退）：unit 722、pgTAP 045=22、typecheck/lint 全綠。

## 驗證基準（本計畫的核心，先建再改頁）

**每個畫面的 Definition of Done（四條全過才算完成）：**

1. 兩檔寬度截圖中，該畫面驗收清單（各 Task 內）逐項可目視確認。
2. 該頁 unit 測試（結構斷言同步更新）綠。
3. 截圖過程 console 無 error。
4. 文案與 DC 逐字一致（動態資料除外）。

**GATE（全部任務完成後）：** 35 畫面 × 2 寬度截圖全數過清單 → `pnpm test`＋`typecheck`＋`lint` 全綠 → `pnpm test:db` 綠（本計畫無 DB 變更，跑基線防倒退）→ visual snapshot（`pnpm test:visual`）更新並附說明。

**審計產物：** 截圖存 `artifacts/design-audit/<screen>/<width>.png`（不進 git，AGENTS.md §8：以路徑與 manifest 記錄，不回讀進 context）。

---

### Task 0: 截圖驗證 runner（測試基準基礎設施）

**Files:**

- Create: `scripts/design-audit/capture-screens.mjs`
- Create: `scripts/design-audit/screen-routes.mjs`

**Interfaces:**

- Produces: CLI `node scripts/design-audit/capture-screens.mjs [--screen <id>] [--width 1280|393]`，輸出 `artifacts/design-audit/<screen>/<width>.png` 與 `manifest.json`（`{screen, route, width, path, consoleErrors: []}`）。後續每個 Task 的「截圖驗證」步驟都呼叫它。

- [ ] **Step 1: 寫路由清單（35 畫面 → 路由/前置動作）**

```js
// scripts/design-audit/screen-routes.mjs
// 35 個 DC 畫面的路由對應。auth: 'student' | 'teacher' | 'anon'。
// setup: 進頁前需要的互動（例如切到教師登入 tab）。
export const SCREENS = [
  { id: 'login', route: '/login', auth: 'anon' },
  { id: 'tLogin', route: '/login', auth: 'anon', setup: 'switch-teacher-tab' },
  {
    id: 'tLoginError',
    route: '/login',
    auth: 'anon',
    setup: 'teacher-tab-submit-bad',
  },
  { id: 'register', route: '/register', auth: 'anon' },
  { id: 'lobby', route: '/app', auth: 'student' },
  { id: 'chapter', route: '/app/chapters/:firstChapterId', auth: 'student' },
  { id: 'missionSelect', route: '/app/missions', auth: 'student' },
  {
    id: 'mission',
    route: '/app/missions/:sessionId',
    auth: 'student',
    setup: 'start-mission',
  },
  {
    id: 'quiz',
    route: '/app/quiz/:sessionId',
    auth: 'student',
    setup: 'start-quiz',
  },
  {
    id: 'quizFeedback',
    route: '/app/quiz/:sessionId',
    auth: 'student',
    setup: 'answer-one',
  },
  {
    id: 'quizResult',
    route: '/app/quiz/:sessionId/result',
    auth: 'student',
    setup: 'finish-quiz',
  },
  { id: 'shop', route: '/app/shop', auth: 'student' },
  { id: 'achievements', route: '/app/achievements', auth: 'student' },
  { id: 'classrooms', route: '/app/profile', auth: 'student' },
  { id: 'leaderboard', route: '/app/leaderboard', auth: 'student' },
  { id: 'mistakes', route: '/app/mistakes', auth: 'student' },
  // progress 畫面依 owner 批示改為教師專屬，學生端不收錄（見批示紀錄 #2）
  { id: 'liveJoin', route: '/app/live/join', auth: 'student' },
  {
    id: 'liveQuestion',
    route: '/app/live/:sessionId',
    auth: 'student',
    setup: 'live-open-question',
  },
  {
    id: 'liveFeedback',
    route: '/app/live/:sessionId',
    auth: 'student',
    setup: 'live-after-answer',
  },
  {
    id: 'liveFull',
    route: '/app/live/:sessionId',
    auth: 'student',
    setup: 'live-fullscreen-result',
  },
  {
    id: 'loading',
    route: '/app',
    auth: 'student',
    setup: 'throttle-first-paint',
  },
  { id: 'unauthorized', route: '/unauthorized', auth: 'student' },
  { id: 'tDash', route: '/teacher', auth: 'teacher' },
  { id: 'tLive', route: '/teacher/live', auth: 'teacher' },
  {
    id: 'tHost',
    route: '/teacher/live/:sessionId',
    auth: 'teacher',
    setup: 'live-hosting',
  },
  {
    id: 'tPresenter',
    route: '/teacher/live/:sessionId?presenter=1',
    auth: 'teacher',
    setup: 'live-hosting',
  },
  {
    id: 'tPresenterChart',
    route: '/teacher/live/:sessionId?presenter=1',
    auth: 'teacher',
    setup: 'live-close-question',
  },
  {
    id: 'tPresenterPodium',
    route: '/teacher/live/:sessionId?presenter=1',
    auth: 'teacher',
    setup: 'live-final',
  },
  {
    id: 'tReport',
    route: '/teacher/live/:sessionId/report',
    auth: 'teacher',
    setup: 'live-final',
  },
  { id: 'tContent', route: '/teacher/content', auth: 'teacher' },
  { id: 'tAnalytics', route: '/teacher/analytics', auth: 'teacher' },
  { id: 'tClasses', route: '/teacher/classes', auth: 'teacher' },
  {
    id: 'tClassDetail',
    route: '/teacher/classes/:classroomId',
    auth: 'teacher',
  },
  {
    id: 'tStudentProgress',
    route: '/teacher/classes/:classroomId/members/:memberRef',
    auth: 'teacher',
  },
];
export const WIDTHS = [
  { name: '1280', viewport: { width: 1280, height: 900 } },
  { name: '393', viewport: { width: 393, height: 852 } },
];
```

- [ ] **Step 2: 寫 capture runner**

沿用既有 e2e 基礎（`tests/e2e` 的 login helper 與 Live smoke 的 hosting fixture——`setup` 動作直接重用 `tests/e2e` 內既有流程函式，不重寫）。核心：

```js
// scripts/design-audit/capture-screens.mjs
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { SCREENS, WIDTHS } from './screen-routes.mjs';

const only = process.argv.includes('--screen')
  ? process.argv[process.argv.indexOf('--screen') + 1]
  : null;
const base = process.env.AUDIT_BASE_URL ?? 'http://localhost:5199';
const manifest = [];
const browser = await chromium.launch();
for (const screen of SCREENS.filter((s) => !only || s.id === only)) {
  for (const width of WIDTHS) {
    const context = await browser.newContext({ viewport: width.viewport });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on(
      'console',
      (m) => m.type() === 'error' && consoleErrors.push(m.text()),
    );
    await loginAs(page, base, screen.auth); // 重用 e2e login helper
    await runSetup(page, base, screen); // 重用 live-smoke fixture 動作
    await page.goto(base + resolveRoute(screen)); // :param 由 setup 回填
    await page.waitForLoadState('networkidle');
    const dir = `artifacts/design-audit/${screen.id}`;
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
writeFileSync(
  'artifacts/design-audit/manifest.json',
  JSON.stringify(manifest, null, 2),
);
await browser.close();
```

（`loginAs`／`runSetup`／`resolveRoute` 為同檔輔助函式：`loginAs` 以 seed 帳號走 `/login` 表單；`runSetup` 對 Live 類畫面呼叫 `tests/e2e` 已有的建場/作答流程；無 setup 的畫面為 no-op。若 e2e helper 未匯出，先抽為可 import 的模組——屬本 Task 範圍。）

- [ ] **Step 3: 驗證 runner 本身**

Run: `pnpm dev`（背景，port 5199）→ `node scripts/design-audit/capture-screens.mjs --screen lobby`
Expected: `artifacts/design-audit/lobby/1280.png`、`393.png` 存在，manifest 內 `consoleErrors: []`。

- [ ] **Step 4: Commit**

```bash
git add scripts/design-audit/
git commit -m "test: 全站設計稽核截圖 runner（35 畫面×2 寬度）"
```

---

### Task 1: Tokens 增補＋教師紫識別基礎

**Files:**

- Modify: `src/styles/tokens.css`
- Modify: `src/styles/globals.css`（新增 `ui-chip--teacher`）
- Test: `src/components/ui/chip.test.tsx`（若無則新建）

**Interfaces:**

- Produces: `--color-teacher: #7b48ce`、`--color-teacher-soft: #e0e7fb`、`--surface-host: #fdf8ee`（Task 2/3/4/12 消費）；`.ui-chip--teacher` 樣式（紫框紫字淡紫底，DC 1318）。

- [ ] **Step 1: 失敗測試**——`chip.test.tsx` 斷言 `<Chip tone="teacher">` 產出 class `ui-chip--teacher`。
- [ ] **Step 2: 跑測試確認紅。**
- [ ] **Step 3: 實作**——tokens 三行＋CSS：

```css
.ui-chip--teacher {
  border: 1px solid var(--color-teacher);
  background: color-mix(in srgb, var(--color-teacher) 10%, transparent);
  color: var(--color-teacher);
}
```

- [ ] **Step 4: 跑測試綠。**
- [ ] **Step 5: Commit** `style: 教師紫 token 與 teacher chip 樣式（DC 識別基礎）`

---

### Task 2: App Shell 對齊（header／學生導覽／教師導覽）

**Files:**

- Modify: `src/app/shell/app-shell.tsx`、`src/styles/globals.css`
- Test: `src/app/shell/app-shell.test.tsx`

**DC 規格：** 85–154 行。

**驗收清單（截圖逐項確認）：**

- [ ] header：白底、底線 `2px solid #ffd600`、min-height 64px；左側三圓 logo＋「ColorPlay／色彩原理遊戲式學習平台」雙行（DC 87–95）。
- [ ] 學生已登入：獎勵膠囊（圓角 999、白底灰框）內含 `Level n`＋progress＋`x / y XP`＋粗體 `n Token`（DC 98–105）。
- [ ] 教師已登入：header 右側**紫色徽章**「`{display_name}`・教師端」＋鎖 icon（DC 108–111；姓名用 profile 的 display_name，不寫死「劉老師」）。
- [ ] 學生導覽：左群組（學習大廳・課後任務實戰・裝備商店，.875rem）＋彈性 spacer＋右群組（我的錯題・Live 課堂・班級排行榜・成就徽章，.75rem）；active 分頁黃色 3px 底線（DC 122–140）。
- [ ] 教師導覽：`#e0e7fb` 底、**紫色**連結文字，四項順序 教師工作區→Live 主持→班級管理→教學分析（DC 143–153；順序已上線，本 Task 補配色）。

**批示 #2 已定案：學生導覽不含「學習進度」分頁（本 Task 移除該連結；路由與頁面刪除屬 Task 10）。**

- [ ] **Step 1:** 更新 `app-shell.test.tsx`：斷言教師徽章文字（`・教師端`）、學生導覽兩群組順序（`getAllByRole('link')` 序列）；跑測試紅。
- [ ] **Step 2:** 改 JSX＋CSS（獎勵膠囊、紫徽章、導覽分組）。
- [ ] **Step 3:** `pnpm vitest run src/app` 綠。
- [ ] **Step 4:** `node scripts/design-audit/capture-screens.mjs --screen lobby`＋`--screen tDash`，對 DC 85–154 過清單。
- [ ] **Step 5: Commit** `style: App Shell 對齊 DC——獎勵膠囊、教師紫徽章、導覽分組`

---

### Task 3: 教師工作區 tDash 重構（已知最大落差）

**Files:**

- Modify: `src/features/teacher-content/pages/teacher-dashboard-page.tsx`、`src/styles/globals.css`
- Test: `src/features/teacher-content/pages/teacher-dashboard-page.test.tsx`

**DC 規格：** 1314–1389 行。

**驗收清單：**

- [ ] header：紫 chip「教師決策工具」＋h1＋說明；**右側**「選擇班級」下拉（min-width 200、2px 灰框）；header 底線 `2px solid #ffd600`（DC 1316–1329）。
- [ ] Live hero：`#1d212e` 黑底圓角 20 卡；左側 48px **黃色圓形閃電徽章**（SVG 路徑 DC 1333）；標題 Syne 1.2rem「課堂即時競賽（Live）廣播控制台」＋灰說明（`#c2c7d3` .8rem）；右側黃色「前往主持 ▶」按鈕，hover `#ffb300`（DC 1330–1341）。
- [ ] 雙欄 grid（`auto-fit minmax(320px,1fr)`）：左「班級總覽」白卡（卡頭標題＋右側班名小字）＋三張統計卡（黃左框 4px、`#f6f7fa` 底、dt 灰小字/dd 1.5rem 900），平均正確率卡跨欄含黃色 progressbar（DC 1345–1365）。
- [ ] 「最需要加強的子題」＝紅左框 4px、紅字 700、`rgba(214,69,51,.08)` 底、警告三角 icon（DC 1366–1371）。
- [ ] 右「功能捷徑」白卡：僅 **2 項**（教學分析、班級管理），黃左框按鈕、右端 `›`、hover `#fffdf2` 底（DC 1374–1385）。移除 內容工作區/匯入內容/Live 課堂主持 捷徑（Live 已有 hero；內容工作區依導覽精簡決策退場）。

- [ ] **Step 1:** 更新 page 測試：斷言捷徑僅 2 個 link、閃電徽章存在、選擇班級 select 位於 header 內（`within(header)`）；跑測試紅。
- [ ] **Step 2:** 重寫 JSX（順序：header→hero→grid[總覽,捷徑]）＋新 CSS（`.teacher-live-console` 改黑底規格、`.teacher-live-console__badge`、`.teacher-summary-card`、`.teacher-summary-warning`、`.teacher-shortcut-card`）。
- [ ] **Step 3:** `pnpm vitest run src/features/teacher-content` 綠。
- [ ] **Step 4:** 截圖 `--screen tDash` 兩寬度過清單。
- [ ] **Step 5: Commit** `style: 教師工作區依 DC 重構——黑色 Live hero、卡片化總覽、捷徑精簡`

---

### Task 4: 認證群（login／tLogin／tLoginError／register）

**Files:**

- Modify: `src/features/auth/pages/login-page.tsx`、`register-page.tsx`、`src/styles/globals.css`
- Test: `src/features/auth/pages/login-page.test.tsx`、`register-page.test.tsx`

**DC 規格：** login 175–217、tLogin 1265–1312、tLoginError 1943–1994、register 1996–2072。

**驗收清單：**

- [ ] 卡片：`2px solid #1d212e` 框、圓角 16、頂部置中三圓 logo＋ColorPlay 雙行（DC 176–183）。
- [ ] 分頁膠囊：灰底容器內兩鍵；學生 tab active＝墨黑底白字，教師 tab active＝**紫底白字**（DC 187–194 vs 1276–1285）。
- [ ] 教師 portal：靛藍說明框「教師帳號由開發後台建立。」含警告 icon（DC 1286–1289）；欄位 帳號/密碼/班級序號；送出鍵**紫色**（DC 1305）。
- [ ] 學生 portal：送出鍵黃色；下方「註冊帳號｜忘記密碼」置中（DC 208–214）。
- [ ] 錯誤態：invalid 欄位 `2px solid #b23425` 紅框＋欄位下紅字（DC 1968–1984）；總結 `role="alert"`「帳號、密碼或班級序號不正確」。
- [ ] auth 路由頂端六色彩虹條（DC 158–160；已有則截圖確認）。
- [ ] register：OTP 流程照現有邏輯，視覺對 DC 1996–2072（實作者先讀該區段）。

- [ ] **Step 1:** login-page.test 增紅斷言：教師 tab active 時送出鍵 class 含紫色 variant、說明框文字；register 斷言標題/主鍵樣式 class。跑紅。
- [ ] **Step 2:** 實作（`login-form__submit--teacher` 用 `--color-teacher`；欄位級錯誤已有 zod，補紅框樣式 class）。
- [ ] **Step 3:** `pnpm vitest run src/features/auth` 綠。
- [ ] **Step 4:** 截圖 login/tLogin/tLoginError/register 過清單。
- [ ] **Step 5: Commit** `style: 認證四畫面對齊 DC——紫色教師識別與欄位級錯誤`

---

### Task 5: 學習大廳 lobby

**Files:** Modify `src/features/learning/pages/lobby-page.tsx`＋CSS；Test 同名 test。
**DC 規格：** 219–361。

**驗收清單：**

- [ ] 頂部白卡：左 Blook 頭像（64px 圓角 16 漸層底）＋「{暱稱}」＋副標「讓我們開始今日的色彩複習與挑戰！」；右統計卡（`#f6f7fa` 底圓角 16）三欄：累計積分(XP)/全體排名/當前 PR，值 1.5rem 900（DC 221–239）。
- [ ] 「色彩任務選擇大廳」白卡＋卡頭底線；章節卡 grid `minmax(280px,1fr)`（DC 242–250）。
- [ ] 章節卡（六章全列）：鎖定＝灰帶（`#eef0f4` 底＋`#c2c7d3` 3px 底線＋鎖 icon＋「鎖定中」pill＋右下「敬請期待」）；開放＝**章節色帶**（Ch3 藍 `#e0e7fb`/`#3056d8`、Ch4 紫 `#ede4f9`/`#7b48ce`）＋琥珀 2px 卡框＋綠「已開放」pill＋黃「開始挑戰」＋「複習與進度 ›」（DC 251–353）。開放章節以 DB 實際狀態為準。

Steps（同 Task 3 模式）：測試紅（章節卡 pill 與按鈕斷言）→ 實作 → 測試綠 → 截圖 `--screen lobby` → Commit `style: 學習大廳章節卡與統計卡對齊 DC`。

---

### Task 6: 章節複習 chapter

**Files:** Modify `src/features/learning/pages/chapter-detail-page.tsx`＋CSS；Test 同名 test。
**DC 規格：** 534–636。

**驗收清單：**

- [ ] 單一大白卡（圓角 20、padding 40）；黃 pill「章節複習」＋h1＋右側黃色「開始挑戰」。
- [ ] 章節進度列：綠「學習中」pill（帶光暈圓點）＋「複習完成 x/y」黃 progressbar＋**44px 圓環**「精熟程度 n%」（綠 stroke，DC 556–567）。
- [ ] 小節區：黃左框 3px＋「小節」黃 pill＋小節碼標題；進度行「已學習圓點・複習 x/y 迷你條・精熟 n%」（DC 571–590）。
- [ ] 複習卡 `<details>`：黃左框 4px summary、序號方塊漸層（依 DC 594/608/623 三種循環）、完成 ✓ 綠勾；卡內文 `white-space:pre-wrap`；未完成卡右下「完成複習」墨框按鈕（DC 592–633）。

Steps：測試紅（圓環 role/精熟百分比、完成複習按鈕）→ 實作 → 綠 → 截圖 → Commit `style: 章節複習頁對齊 DC——精熟圓環與複習卡`。

---

### Task 7: 任務選擇／任務作答

**Files:** Modify `src/features/learning/pages/mission-page.tsx`＋CSS；Test 同名 test。
**DC 規格：** missionSelect 638–666、mission 668–734。

**驗收清單：**

- [ ] 選擇頁：白卡＋卡頭（黃 pill「5 階精熟測驗」＋h2「課後任務實戰」＋說明）；小節列 `#f6f7fa` 圓角卡＋右黃鍵「展開小節任務」（DC 640–663）。
- [ ] 作答頁：精熟地圖（5 節點、通過段黃線、目前節點黃底、未解鎖 disabled 60% 透明）（DC 671–681）；「關卡進度:x / 5」黃 pill；情境任務灰卡（琥珀小標）；選項鎖定態＝灰底刪除線＋●（DC 698–715）；提示卡紅左框＋「索取第 n 層提示」黃底琥珀字鍵（DC 719–725）；底部「← 回任務實戰」膠囊。

Steps：測試紅（鎖定選項 disabled＋line-through class、提示鍵文案）→ 實作 → 綠 → 截圖 → Commit `style: 任務選擇與作答對齊 DC——精熟地圖與提示層`。

---

### Task 8: 限時挑戰／答題回饋／挑戰結果

**Files:** Modify `src/features/quiz/pages/quiz-session.tsx`、`quiz-result.tsx`、`components/question-card.tsx`、`feedback-card.tsx`＋CSS；Test 各同名 test。
**DC 規格：** quiz 363–422、quizFeedback 424–472、quizResult 474–532。

**驗收清單：**

- [ ] quiz：10 節點精熟地圖（同 Task 7 樣式）；右上進度卡（2px 灰框：第 x/y 題、Quiz Score、琥珀「剩餘 n 秒」）；題卡 2px 灰框；選項＝圓字母＋2px 框，選取態黃框 `#fff0b3` 底；右下黃鍵「送出答案」。
- [ ] feedback：同版面、fieldset disabled、計時顯示「已作答」。
- [ ] result：header 卡**頂部 8px 黃條**＋章節 pill＋「挑戰完成 🎉」＋四張成績膠囊（總分/答對/+XP/+Token，`#f6f4ee` 底 2px 框）＋琥珀左框重複挑戰折扣說明（DC 476–485）；逐題回顧卡：✓答對綠 `#0e6f4c`／✕答錯紅 `#b23425`／⌛逾時藍 `#3056d8` 標題，我的答案/正確答案/解析 三格 `#f6f4ee` 圓角格（DC 488–524）；底部「再玩一次」黃鍵＋「回章節」框線鍵。

Steps：測試紅（result 三種狀態圖示與色 class、四膠囊）→ 實作 → 綠 → 截圖三畫面 → Commit `style: 限時挑戰三態對齊 DC——地圖、進度卡與結果回顧`。

---

### Task 9: 裝備商店／成就徽章

**Files:** Modify `src/features/inventory/pages/shop-page.tsx`、`src/features/achievements/pages/achievements-page.tsx`＋CSS；Test 各同名 test。
**DC 規格：** shop 736–866、achievements 867–977。

**驗收清單：**

- [ ] shop header：墨黑 2px 框白卡＋頂部六色彩虹條＋黃 pill「你的角色收藏」＋Syne h1＋右側墨黑底白字「n Token 可用」膠囊（DC 738–746）。
- [ ] 商品卡四態（DC 749–810）：已裝備＝綠框「已裝備」；已擁有＝框線「選用」；可購買＝黃鍵「購買 n Token」；不足＝disabled 灰鍵「還差 n Token」。
- [ ] achievements：已獲得卡＝黃框＋`linear-gradient(135deg,#fff,#fff8d6)` 底＋彩色 icon 方塊＋「已獲得」黃 pill＋「解鎖於 {日期}」；未獲得卡＝灰框白底 `opacity:.78 grayscale(1)`＋灰進度條（DC 878–974）。

Steps：測試紅（四態按鈕文案/disabled、成就灰階 class）→ 實作 → 綠 → 截圖 → Commit `style: 商店與成就對齊 DC——商品四態與徽章灰階`。

---

### Task 10: 我的班級／排行榜／錯題／學習進度

**Files:** Modify `student-classrooms-page.tsx`、`classroom-leaderboard-page.tsx`（含 `leaderboard-table.tsx`）、`mistakes-page.tsx`、`progress-dashboard-page.tsx`＋CSS；Test 各同名 test。
**DC 規格：** classrooms 979–1003、leaderboard 1005–1050、mistakes 1052–1105、progress 1107–1163。

**驗收清單：**

- [ ] classrooms：外層白卡＋黃 pill「班級學習」；加入表單卡；班級列卡含「查看排行榜」黃鍵。
- [ ] leaderboard：前三名列底色 金 `#fffcea`／銀 `#f3f2f4`／銅 `#fdf6e8`（DC 1022–1035）；欄位 名次/暱稱/XP。
- [ ] mistakes：黃 pill「補救學習」＋規則說明；子題群黃左框＋紅「n 題待補救」pill；錯題卡 `#fffdf2` 黃左框、綠字正確答案；每群右下「再挑戰（補救練習）」黃鍵；已解決群灰左框灰卡（DC 1059–1103）。
- [ ] **progress（依批示 #2 改為移除學生端入口）**：刪除 `/app/progress` 路由與 `progress-dashboard-page.tsx`(+test)；先 `grep -rn "app/progress" src` 清掉所有站內連入點（含導覽，導覽部分屬 Task 2）；router 測試同步更新；教師端兩個進度頁不動。

Steps：測試紅（前三名列 class、錯題 pill 文案）→ 實作 → 綠 → 截圖 4 畫面 → Commit `style: 班級/排行/錯題/進度四頁對齊 DC`。

---

### Task 11: 學生 Live 四態（確認性收尾）

**Files:** Modify `live-join-page.tsx`、`live-session-page.tsx`＋CSS（預期小改）；Test `live-pages.test.tsx`。
**DC 規格：** liveJoin 1165–1178、liveQuestion 1180–1205、liveFeedback 1207–1246、liveFull 1248–1263。

**驗收清單：**

- [ ] join：560px 白卡＋黃 pill、六碼輸入 `letter-spacing:.35em` 置中、黃鍵「加入課堂」。
- [ ] question:「題目在投影幕上，選出你的答案！」legend；四形狀鍵色序 紅▲/藍■/黃●/綠◆、高度 `clamp(6rem,22vh,11rem)`；「已收到你的答案…」status；連擊 🔥 pop 動畫。
- [ ] feedback：✓/✕＋分數 h2；分布條（正解綠、其餘藍）；琥珀左框「教師引導解析」；名次卡（第 n 名／共 m 人＋累積分＋激勵語）；「等待主持人進入下一題…」。
- [ ] full：綠 `#128a5e` ✓／紅 `#e11d48` ✕ 全屏卡＋加分＋名次（min-height 480）。

Steps：先截圖比對（前批已重構，預期僅微調）→ 有差異才改＋測試 → 綠 → Commit `style: 學生 Live 四態 DC 收尾比對`。

---

### Task 12: 教師 Live（開場／主持台／投影三態／報表）

**Files:** Modify `teacher-live-page.tsx`、`teacher-live-session-page.tsx`、`live-presenter.tsx`、`teacher-live-report-page.tsx`＋CSS；Test 各同名 test。
**DC 規格：** tLive 1391–1421、tHost 1423–1450、tPresenter 1452–1483、tPresenterChart 1485–1533、tPresenterPodium 1535–1565、tReport 1567–1638。

**驗收清單：**

- [ ] tLive：黑 header 卡（黃圓閃電 40px＋Syne 標題＋灰副標）＋「1・選擇對戰單元」「2・每題秒數」下拉＋滿版黃鍵「建立活動並開場」（前批已做，截圖確認）。
- [ ] tHost：**卡片底 `#fdf8ee`（`--surface-host`）＋琥珀 35% 邊框**（DC 1424）；黃 pill「ColorPlay Live 主持台」；「已作答 n/m」；「即時作答分布（僅主持人可見）」；鍵組 黃「收題並公布答案」＋小鍵「暫停」「取消挑戰」＋「投影模式」。
- [ ] presenter 三態：黑底、圓形倒數、Top5 ↑↓—、正解列 `scale(1.06)`＋綠 outline、頒獎台 0/1.2/2.4s 延遲（多已上線，逐項截圖確認）。
- [ ] tReport：無「建議重教」區塊（owner 決策）；逐題分析/作答矩陣/匯出 CSV/學習閉環/最終排名/回 Live 活動 順序與 DC 一致。

Steps：截圖六畫面 → 差異項修（預期集中 tHost 底色）＋測試 → 綠 → Commit `style: 教師 Live 六畫面 DC 收尾——主持台琥珀底`。

---

### Task 13: 教師管理群（內容／分析／班級／成員／學生進度）

**Files:** Modify `teacher-content-workspace-page.tsx`、`teacher-analytics-page.tsx`、`teacher-classrooms-page.tsx`、`teacher-classroom-detail-page.tsx`、`teacher-student-progress-page.tsx`＋CSS；Test 各同名 test。
**DC 規格：** tContent 1640–1746、tAnalytics 1748–1871、tClasses 1873–1941、tClassDetail 2072–2179、tStudentProgress 2181–2278。

**驗收清單：**

- [ ] tContent：題庫/複習卡兩張白卡表格（欄位 題號/題目/狀態/版本/動作；動作小鍵 34px）。
- [ ] tAnalytics：篩選白卡五欄（班級/起訖日期/章節/子題）；班級總覽四統計卡（含最弱子題卡）；「高頻錯誤 n」紅標卡；題目分析/子題精熟/Live 報表三表格。
- [ ] tClasses：header 黃底線＋右側「班級數/有效學生」雙統計；建立表單卡黃左框 6px；班級卡（卡頭班名＋綠「n 位有效學生」pill、dl 加入碼版本/建立日期、墨框「管理班級」hover 反白＋「教學分析」小鍵）（DC 1893–1937）。
- [ ] tClassDetail：header 黃底線＋三動作鍵；一次性加入碼卡（黑卡頭＋黃鎖圓徽＋「版本 n」膠囊、虛線框碼＋「複製」鍵）——**複製鍵為新增互動**：`navigator.clipboard.writeText`，成功後鍵文案短暫轉「已複製」（純前端）；成員表七欄（前批已做，截圖確認）。
- [ ] tStudentProgress：四統計卡（待補救錯題紅左框）＋章節表＋錯題卡列（前批已做，截圖確認）。

Steps：測試紅（tClasses 卡頭統計、複製鍵 `navigator.clipboard` mock 行為）→ 實作 → 綠 → 截圖五畫面 → Commit `style: 教師管理五畫面對齊 DC——班級卡與一次性碼複製`。

---

### Task 14: 手機 393 全站 pass＋GATE 總驗證

**Files:** Modify `src/styles/globals.css`（RWD 修正）；無新檔。

- [ ] **Step 1:** `node scripts/design-audit/capture-screens.mjs`（全量 35×2）。
- [ ] **Step 2:** 逐畫面過 393 寬清單：無水平捲動（表格類容器內 `overflow-x:auto` 除外）、觸控目標 ≥44px、字級不小於 DC 規格。發現問題逐項修（每畫面一個小 commit）。
- [ ] **Step 3:** GATE：`pnpm test`＋`typecheck`＋`lint`＋`pnpm test:db` 全綠；`pnpm test:visual` snapshot 更新。
- [ ] **Step 4:** 產出 `artifacts/design-audit/manifest.json` 總表＋差異結案清單（0 項未結才算 PASS）。
- [ ] **Step 5: Commit** `style: 全站 393 響應收尾＋設計稽核 GATE 紀錄`

---

## 附錄 A：功能鍵 → 後端對應（本重構零後端變更）

完整逐鍵表在 `docs/plan-live-design-handoff-2026-07-25.md` 第二節（學生端＋教師端兩表，標注 ✅/➖）。摘要：35 畫面全部功能鍵的 RPC／Edge Function 均已存在並上線——認證（`auth-login`/`student-register`）、學習（`get_learning_progress` 家族）、Quiz/任務（quiz engine RPC）、商店/成就（catalog＋inventory RPC）、班級（`create/join/rotate/list_*` 家族＋D1 `list_owned_classroom_members` v2）、學生進度（D2 `teacher_student_progress`）、Live 全鏈（`join/submit/close/open_next/pause/resume`＋報表）。本計畫新增的唯一互動「複製加入碼」為瀏覽器 clipboard API，不經後端。

## Owner 批示紀錄（2026-07-26，全部定案）

1. **教師紫 `#7b48ce`：採用**——「教師紫就是給教師的，跟學生的區分開」。Task 1/2/4 照計畫執行。
2. **學習進度：改為教師專屬**——「學生端是看不到，只給老師看學生狀況」。學生端**移除**「學習進度」導覽分頁與 `/app/progress` 路由（頁面與測試一併移除，先 grep 站內連入點）；教師端沿用 `/teacher/classes/:id/progress`（班級層）與 `/teacher/classes/:id/members/:ref`（個人層）。→ Task 2 與 Task 10 已依此改寫；Task 0 路由清單移除 `progress`（畫面總數 35→34）。
3. **章節卡六章色相：照六章節色相環推導**（橙/綠/藍/紫/桃/青；Ch3 藍、Ch4 紫已由 DC 給定）。

## Self-Review 紀錄

- Spec 覆蓋：35 畫面全數落在 Task 2–13；跨畫面元素（header/nav）在 Task 2；驗證基礎在 Task 0/14。register 視覺細節由實作者讀 DC 1996–2072（本計畫未轉述該段，已標注）。
- Placeholder 掃描：無 TBD/TODO；「照 DC 行號實作」為明確規格引用方式，非佔位。
- 一致性：`--color-teacher`／`--surface-host`／`ui-chip--teacher` 於 Task 1 定義、Task 2/3/4/12 消費；capture runner `--screen` 參數在各 Task 引用一致。
