# Teacher Task 10: Gate 全電池＋真跑量測＋ledger 收批

Branch: `feature/v2-major-update`; base `196fc31`（Task 1-9 已完成，commits `cbd4a1e..196fc31`）。

## 狀態

**CONDITIONAL** — 單元、視覺快照、可及性、對比、觸控全數綠燈（觸控 1 項現場回修後過關）；e2e 電池發現 1 項 Task 5 引入的真實迴歸（`live-smoke.spec.ts`），未修，阻擋 clean merge，待 owner 裁決 fix wave 範圍。

## Step 1: 單元全套

```
npx vitest run
```

120 test files / 831 tests，全綠。

## Step 2: e2e 教師子集

```
npx playwright test tests/e2e/teacher-content.spec.ts tests/e2e/classroom-leaderboard.spec.ts \
  tests/e2e/live-smoke.spec.ts tests/e2e/app-shell.visual.spec.ts tests/e2e/accessibility.spec.ts \
  tests/e2e/chapter-select.spec.ts --project=chromium
```

| Spec | 結果 | 備註 |
|---|---|---|
| app-shell.visual.spec.ts | PASS 8/8 | 無快照 diff；符合 Task 1 盤點（不含教師頁快照），未觸發重拍 |
| accessibility.spec.ts | PASS 5/5 | axe 0 critical/serious |
| chapter-select.spec.ts | PASS 1/1 | |
| classroom-leaderboard.spec.ts | 裸跑 FAIL → 補環境後 PASS | 見下 |
| teacher-content.spec.ts | FAIL（既知紅，不在本批責任內） | 見下 |
| live-smoke.spec.ts | **FAIL（真迴歸，未修）** | 見下 |

### classroom-leaderboard.spec.ts —— 確認非缺陷

裸跑擲 `CLASSROOM_LEADERBOARD_ACCEPTANCE_MODE_REQUIRED`（該 spec 是 phase-gate 型測試，與 `game-economy`/`achievements` 同構，未帶 `PLAYWRIGHT_ACCEPTANCE=on` 必定擲此錯，這是既有設計，非測試邏輯紅——見 `progress.md` 第 655 行同類先例）。補上：

```
SUPABASE_URL=http://127.0.0.1:54321 \
SUPABASE_ANON_KEY=<local anon key via `supabase status`> \
PLAYWRIGHT_ACCEPTANCE=on PLAYWRIGHT_EVIDENCE_ROOT=$SCRATCH/acceptance-evidence \
npx playwright test tests/e2e/classroom-leaderboard.spec.ts --project=chromium
```

→ 1/1 PASS。確認非本批缺陷。

### teacher-content.spec.ts —— 既知紅，與本批無關

`PLAYWRIGHT_ACCEPTANCE=on` 後真斷言在 `getByRole('heading', { name: '匯入內容' })` 逾時（元素不存在）。追查：

```
git show cbd4a1e^:src/app/router/create-app-router.tsx | grep -n "content\|匯入"
```

在 Task 1（本批第一個 commit）之前的 router 就已經找不到「匯入內容」相關路由；`grep -rn "teacher/content\|匯入內容" src/` 在目前 HEAD 上也是零命中。該內容匯入頁面已在更早的 07-30 設計交付批被移除（`MEMORY.md` 記載「移除…content…」）。本批 Task 1-9 只碰 dashboard/analytics/classes/detail/live 六個畫面，從未碰內容匯入頁，這支 phase-gate spec 是移除該功能後遺留的既知紅，不在本批責任範圍，未修。

### live-smoke.spec.ts —— 真迴歸，記為 BLOCKING，未修

`createClassroom` 輔助函式在 240 秒後逾時：

```
Error: locator.waitFor: Test ended.
waiting for locator('ul[aria-label="教師班級列表"] li article')
  .filter({ has: getByRole('heading', { name: 'Live冒煙班級', exact: true }) })
  .last().locator('.classroom-card__code-value') to be visible
```

**根因**：Task 5（commit `15e2c58` "feat(teacher): classroom plank cards + pager + ticket join codes"）為 `/teacher/classes` 班級列表加上 `GamePager`（`src/components/ui/game-pager.tsx`）。班級列表固定依 `classroom.created_at, classroom.id` **升冪**排序（`supabase/migrations/20260717000200_classroom_commands.sql:375`，`tests/e2e/helpers/classrooms.ts` 檔頭已有此說明），`GamePager` 永遠從第 1 頁（`rawPage = 0`）起始，且沒有「新建項目所在頁自動導頁」的邏輯（`goToPage` 只在鍵盤翻頁時處理焦點交接，元件本身對 `items` 變化沒有任何 effect）。`live.host.teacher@colorplay.test` 帳號因跨批次驗證累積了 17-18 間班級（遠超過 wide 版面 `pageSize=6`），新建的「Live冒煙班級」因此落在第 3 頁；`createClassroom` 的 `.last()` locator 只在 `GamePager` 當頁渲染出來的 DOM 內查找（分頁前是整份 DOM 都在，`.last()` 一定拿得到），找不到目標，永遠等不到可見，逾時。

已用 debug snapshot 確認：page 1 只有「進階Live班級」×3、「T7素材驗證班」×3，完全沒有「Live冒煙班級」。

**這不只是測試 helper 過時**：這是真實的產品缺陷——任何累積班級數超過一頁（wide 6 間／narrow 3 間）的教師，新建班級後，新班級在自己的班級列表上**看不到**，除非手動點「下一頁」翻到最後一頁。

**未修的理由**：Task 10 的回修授權明確限定在「量測不改樣式」的例外範圍內（contrast/touch-target CSS 補丁，見下方「觸控回修」一節），這個問題的根本修法（排序反轉成新到舊、或新建後自動跳頁、或另加 toast+捷徑）是 JS 邏輯與產品體驗決策，不在授權範圍，且任一方案都可能連動 `classroom-leaderboard.spec.ts`／`capture-screens.mjs` 等其他消費端的既有假設（例如 `readClassroomJoinCode` 的 `.first()` 慣例）。因此依「app-shell.visual 若意外 diff，停下來回報 BLOCKED 而非重拍」的既定原則類推，這裡選擇如實回報、不擅自改動，留給 owner 裁決 UX 方向後另立 fix wave。

未觸碰 `student.one`（本次全程用 `teacher@colorplay.test`／`live.host.teacher@colorplay.test`）；因 `createClassroom` 本身就是逾時點，從未進到 `joinClassroomByCode`／建立 Live 場次，所以沒有殘留待取消的場次，只留下一間空的「Live冒煙班級」班級卡（無害殘留，與既有 17-18 間跨批測試殘留同性質）。

## Step 3: 真跑三情境量測

量測腳本（拋棄式，僅存於 scratchpad，未入 repo）：`$SCRATCH/gate-measure.mjs`（情境①③）、`$SCRATCH/gate-measure-live.mjs`（情境②）。皆使用真實登入（`teacher@colorplay.test` 或 `live.host.teacher@colorplay.test`，取自 `tests/fixtures/users.ts`），對本機 dev server（`http://localhost:5173`，先探測沿用既有進程，未另起新進程）以 Playwright 操作，`getComputedStyle` 讀取渲染值；對比計算沿祖先鏈做正確 alpha 疊色（起點白色，逐層 `src-over` 合成，非「找到第一個非零 alpha 就停」的舊寫法）。全程 console 0 error / 0 pageerror。

### 情境①③：工作區→分析→班級管理→詳情，1024/1440 寬度

#### 對比（rendered，全數 ≥4.5:1）

| 元素 | fg (rgb) | bg (rgb，疊色後) | ratio | 對應 gate 待驗項 |
|---|---|---|---|---|
| `.teacher-dashboard-header__intro p`（dashboard） | 102,112,133 | 255,248,225 | **4.68** | Task 6：壓線項，過關 |
| `.sage-page-header p`（classroom detail，同一標頭元件） | 102,112,133 | 253,248,234 | **4.69** | 同上 |
| `.teacher-live-console--night .teacher-live-console__title` | 244,241,228 | 23,28,63 | **14.56** | Task 3：夜窗 title，過關 |
| `.teacher-live-console--night .teacher-live-console__description` | 169,176,214 | 23,28,63 | **7.74** | Task 3：夜窗 description，過關 |
| `.teacher-analytics-section > h2`（sage 標題列，賢者窗語彙配方） | 37,48,66 | 253,248,234 | **12.53** | 「sage 標題列字」——`.sage-title-bar` 本身 src/ 零消費者（見下方 Notes），以同配方的真實消費端代表量測 |
| `.teacher-error-card__severity`（coral-700） | 199,58,63 | 255,255,255 | **5.12** | Task 4：嚴重度符號，過關 |
| `.classroom-card__code-value`（票券碼） | 37,48,66 | 246,238,216 | **11.48** | |
| `.sage-page-header h1`（classroom detail） | 37,48,66 | 253,248,234 | **12.53** | |
| `.live-launch__field label`（gold-deep，晚宣告的 `globals.css:6900` 規則覆蓋 `:5400` 的 muted 版本） | 138,101,31 | 255,255,255 | **5.30** | Task 7：待驗項，過關 |

Note：`.teacher-error-card__severity` 在 `live.host.teacher` 帳號的分析頁資料下沒有觸發嚴重度卡片（count=0），改用 `teacher@colorplay.test` 帳號（有 2 張錯誤卡）量得上表數字；同一組演算法（含 alpha 疊色修正）跑兩次結果一致（5.12），非量測誤差。

Note：`.sage-title-bar`（`globals.css:6758`）目前在整個 `src/` 沒有任何 `.tsx` 消費它（`grep -rn "sage-title-bar" src/` 僅命中 CSS 定義本身），是死選擇器。並非本批引入的迴歸（本批 Task 3 開始就沒有任何 commit 對它加消費端），僅記錄，不在 Task 10 授權範圍內清理。

#### 觸控（boundingBox，1440px；1 項回修）

| 元素 | 回修前 | 回修後 | 結論 |
|---|---|---|---|
| `.teacher-shortcut-card__list a.pixel-command`（指令鈕，dashboard） | 437.13×56 | — | 過關，未動 |
| MENU 鈕 | 71.61×44 | — | 過關（剛好壓在 44px），未動 |
| `.classroom-card__copy`（複製鈕，classes） | **50×32** | 50×44 | **未達標→已回修** |
| `GamePager` 箭頭（`◀`/`▶`，classes；需 >1 頁班級才會渲染，改用 `live.host.teacher` 帳號量測） | 44×44 | — | 過關（剛好壓在 44px），未動 |

回修：`src/styles/globals.css` 檔尾（教師批節，緊接 Task 9 最後一條規則之後）追加：

```css
/* Task 10 gate 觸控修補：.classroom-card__copy 沿用 2026-07-27 舊規格
   min-height:32px（早於本批，非 Task 1-9 引入），/teacher/classes 真跑量測
   (1440px, boundingBox) 讀出 50×32px，低於 44px 門檻；加大到 44px，字級/
   內距/顏色不動。 */
.classroom-card__copy {
  min-height: 44px;
}
```

重跑量測確認 50×44，過關。重跑 `app-shell.visual.spec.ts`／`accessibility.spec.ts`／`chapter-select.spec.ts` 三支快篩 e2e 確認 CSS 改動未產生新的快照 diff 或可及性回歸（14/14 PASS）。`prettier --check src/styles/globals.css .superpowers/sdd/progress.md` 通過。

`.classroom-card__copy` 的舊規格（`min-height:32px`）定義於 `globals.css:2962`（07-27 批「常駐可見＋一鍵複製班名＋碼」），Task 5 的教師批節（`globals.css:6861` 起）只重上色 `.classroom-card__code`/`.classroom-card__code-value`，未覆寫按鈕尺寸，因此這個未達標本身**不是**本批 Task 1-9 引入的迴歸，而是 Task 10 真跑量測第一次抓到的既有缺陷；依「任何觸控 <44px：回修」的鐵律當場修正。

#### `.hud-menu__panel` focus outline 視覺確認（Task 2 gate 待驗項）

`teacher@colorplay.test` 登入後點 `MENU`（`hud-command-bar.tsx` 對 `.hud-menu__panel` 執行 `tabIndex={-1}` + 程式 `.focus()`）。截圖 + `getComputedStyle`：

```json
{
  "isFocused": true,
  "outlineStyle": "none",
  "outlineWidth": "3px",
  "outlineColor": "rgb(246, 238, 216)"
}
```

`outline-style: none` 表示瀏覽器沒有渲染任何外框（`outline-width` 數值在 `style: none` 下不生效）；螢幕截圖視覺確認一致，面板只有自身的邊框/硬影樣式，無額外聚焦外框。**結論：不需要套用預授權的 `.hud-menu__panel:focus { outline: none; }` 補丁**——Chromium 對「透過滑鼠點擊觸發的程式化 `.focus()`」預設就不會顯示 `:focus-visible` 外框，此為瀏覽器既有行為，非本批缺陷。未套用該補丁。

#### 1024/1440 溢出

| 頁面 | 寬度 | scrollWidth | clientWidth | `.ui-table` 首欄寬 |
|---|---|---|---|---|
| classroom-detail | 1024 | 1024 | 1024 | 80.28px |
| classroom-detail | 1440 | 1440 | 1440 | 91.19px |
| classes-list | 1024 | 1024 | 1024 | （無 `.ui-table`） |
| classes-list | 1440 | 1440 | 1440 | （無 `.ui-table`） |
| analytics | 1024 | 1024 | 1024 | 285.2px |
| analytics | 1440 | 1440 | 1440 | 322px |
| live-launch（forge 兩欄） | 1024 | 1024 | 1024 | （無 `.ui-table`） |

全數 `scrollWidth === clientWidth`，零橫向溢出。「與 base 相同」：`git diff cbd4a1e..196fc31 -- src/styles/globals.css | grep ui-table` 零命中，`.ui-table` 的 CSS 與消費端 tsx 在本批全程未被觸碰，故本批下的首欄寬度定義上等於 base。

### 情境②：Live 建立→開場→LivePresenter 控制列→取消場次

用 `live.host.teacher@colorplay.test`，複用既有 `classrooms.data[0]`（`launchLiveSessionFromTeacherHome` 走 `/teacher/live` 的 `<select>`，不經班級列表 UI，不受上述 `GamePager` 迴歸影響）。

1. `/teacher/live` → 選單元（index 1）→「建立活動並開場」→ 進入投影模式，`phase=lobby`。
2. `footer.live-presenter__controls button` 逐鈕量測：

   | 按鈕 | 寬×高 |
   |---|---|
   | 「開始第一題」（lobby 唯一 primary 動作） | 192×52 |

   過關（≥44px）。lobby 階段只有一顆 footer 按鈕；其餘動作（暫停/續行/公布答案等）只在題目/回饋階段出現，本情境未進題，符合 brief 描述的「建立→開場→量控制列→取消」範圍。
3. header「取消挑戰」→「確認取消挑戰」→ `runCancel` 觸發 `cancel` transition，成功後導回 `/teacher/live`（`waitForURL` 確認），場次已取消收尾。
4. 全程 console 0 error / 0 pageerror。

## 結論

- 單元：120/120 files，831/831 tests，全綠。
- e2e 子集：4/6 完全乾淨（app-shell.visual、accessibility、chapter-select 直接綠；classroom-leaderboard 補環境後綠，證實非缺陷）；1/6 既知紅且與本批無關（teacher-content，功能已於更早批次移除）；**1/6 真迴歸未修（live-smoke，Task 5 分頁排序造成新建班級不可見）**。
- Step 3 對比：8 組全數 ≥4.5:1，含 Task 3/4/6/7 四個 gate 待驗項全部確認過關。
- Step 3 觸控：4 組原生達標，1 組（複製鈕）不達標，已依鐵律回修為 44px 並重跑確認。
- `.hud-menu__panel` 聚焦外框：確認無外框，預授權補丁未套用（不需要）。
- 1024/1440 溢出：零橫向溢出，`.ui-table` 首欄寬與 base 定義上相同（該表格全批零改動）。

**Gate 結論：CONDITIONAL。** 對比/觸控/可及性/視覺快照/單元測試已全數達標；`live-smoke.spec.ts` 的真迴歸因超出 Task 10 CSS-only 授權範圍，如實記錄、未修，需 owner 先裁決 UX 修復方向（班級列表排序反轉／新建後自動跳頁／toast 捷徑等）再開一個小 fix wave，之後才建議 clean merge。

## Debt 移交

1. **`live-smoke.spec.ts` 迴歸（BLOCKING，未修）**——見上方根因分析。
2. sizing 報告結論（Task 9）：`assignments-live` M/2 tasks、`live-advanced` L/4-5 tasks 需 owner 先裁 team/schedule 範疇；`learning-experience` S/2 tasks 優先。
3. toast 錨定另議（承 Task 1-9 既有記錄，未在本批處理）。
4. skip-link 卷動邊界低影響未做（承 Task 1-9 既有記錄）。
5. `.sage-title-bar` 死 CSS（`globals.css:6758`，零消費者），非本批引入，僅記錄不清理。

## 變更檔案

- `src/styles/globals.css`：檔尾追加 `.classroom-card__copy { min-height: 44px; }`（觸控回修，唯一程式碼變更）。
- `.superpowers/sdd/progress.md`：`## Teacher Workspace Batch (2026-08-02)` 節尾追加本收批小節。
- `.superpowers/sdd/teacher-task-10-gate-report.md`：本檔案（新增）。

## Commits（Teacher Workspace Batch 全批）

`cbd4a1e 319dc68 b31485a 1ed5fc0 40e13a5 15e2c58 ebf9128 1b5ce07 08820cf dc802f6 196fc31` + 本收批 commit（`docs(sdd): close teacher workspace batch with gate results`）。
