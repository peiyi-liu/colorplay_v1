# Live Phase View: 收攏 Live 播放階段成一個 deep module

> **For agentic workers:** Execute task-by-task in one continuous session with `superpowers:executing-plans`（沿用本 repo 慣例；不使用 per-task subagent）。Track every step with its checkbox and stage this plan's checkbox updates in the same task commit.

**Goal:** 把「這一刻該顯示什麼、Host 能做什麼」從 4 個 render module 收進一個 module，每個 audience 一個進入點，回傳 discriminated union。Postgres 仍是 state machine 的唯一 authority。

**Architecture:** `src/features/live/lib/` 下新增 phase view 與 clock 兩個 in-process module。三個進入點 `participantView` / `hostConsoleView` / `projectorView`，各自回傳自己的 union。pages 與 components 退化成 render。

**Tech Stack:** React 19 + TS strict + Vite + Vitest/RTL + Playwright。無 schema 變更、無 migration、無 pgTAP 改動。

**Authoritative sources:** `docs/adr/0004-live-phase-projection.md`（決策與被否決方案）、`CONTEXT.md`（Live 術語）。

**Baseline:** `c845039`。

## Global Constraints

- **Postgres 是唯一 authority。** client 只做 projection；任何「先在 client 判斷再送」的捷徑都不接受（ADR 0004）。
- **術語一律依 `CONTEXT.md`**：Host / Projector / Participant / Phase / Late Join / Ambient Loop / Cue。identifiers 用 `Projector`，**但 `?presenter=1` query parameter 不得改名**（老師書籤與教案在用）。
- **規則搬進 module 的判準：有沒有讀 session state。** 讀 → 進 module；不讀 → 留在外面。
- **`precedence`（view，階段內主次）與 `emphasis`（copy module，動作本身樣式）是兩個東西，不得同名。** `rank` / `role` 在本 repo 已有別的意思，不得借用。
- **Task 2–4 test-first，且 view 測試必須由「即將被刪的頁面測試」逐條轉譯而來**，不得依設計意圖從零撰寫。每個被刪的 case 必須在 commit message 標明由哪個 view test 取代。
- **只有渲染後才觀察得到的行為不得下沉**，留在頁面層。判定清單見 Task 2 Step 1。
- 每 task：lint + typecheck + 受影響測試，完成宣稱附新鮮執行輸出。
- **Task 2–4（會刪頁面測試的 task）完成前必須加跑 `bash scripts/test-e2e-local.sh --project=chromium --grep='Live smoke'`**（本機需 Supabase local 在跑；若被 skip 視同失敗）。逐條轉譯若有遺漏，這條 e2e 是最後一道攔截。

---

### Task 1: `live-clock` module（搬移＋TDD 補洞）

`live-pages.test.tsx:153-164` 的 `remainingSeconds` suite 只有**一個 case**（基本倒數公式＋null deadline），只有 `remainingSeconds` 本體算「搬家」。`tick` 要吸收的另外三塊——paused 剩餘秒數（`live-session-page.tsx:418`）、ring `fraction` 幾何（`live-presenter.tsx:82-89`）、最後 5 秒 tick 規則（`live-presenter.tsx:336`）——**目前零測試**（`live-presenter.test.tsx` 的 6 個 case 無任何 ring/計時斷言），這三塊必須 test-first。

**Files:**

- Create: `src/features/live/lib/live-clock.ts`（`tick(state, now, fetchedAt)` → `{ secondsLeft, fraction, isFinalCountdown }`；吸收 clock skew、paused 秒數、ring 幾何、最後 5 秒規則）
- Create: `src/features/live/lib/live-clock.test.ts`（由 `live-pages.test.tsx:153-164` 逐條移入）
- Modify: `src/features/live/pages/live-session-page.tsx`（刪除 `remainingSeconds` export 與 `:418` 的 `Math.ceil(pausedRemainingMs/1000)`，改用 `tick`）
- Modify: `src/features/live/components/live-presenter.tsx`（刪除 `:9` 從 page 的 import；`:82-89` ring 幾何與 `:336` tick 規則改用 `tick`）
- Modify: `src/features/live/pages/teacher-live-session-page.tsx`（`:207` 改用 `tick`）
- Modify: `src/features/live/pages/live-pages.test.tsx`（移除 `remainingSeconds` suite）

**Steps:**

- [x] **Step 1:** 建 `live-clock.ts`，先只把 `remainingSeconds` 原樣搬入；`live-pages.test.tsx:153-164` 的測試移至 `live-clock.test.ts`，確認在新位置為綠（此段是搬家，不做 TDD）。
- [x] **Step 2:** 為 `tick` 寫 RED 測試：paused 凍結秒數（對照 `live-session-page.tsx:418` 的 `Math.ceil(pausedRemainingMs/1000)`）、`fraction` 幾何（`deadline − opened` 為分母、clamp 0–1，對照 `live-presenter.tsx:82-89`）、`isFinalCountdown`（剩 1–5 秒為 true；0 與 >5 為 false，對照 `:336`）。執行一次確認 FAIL。
- [x] **Step 3:** 實作 `tick` 至全綠。
- [x] **Step 4:** 三個 caller 改用 `tick`；確認 `live-presenter.tsx` 不再 import 任何 page module。
- [x] **Step 5:** `pnpm test` 全綠；`pnpm lint` + typecheck。
- [x] **Step 6:** Commit `refactor: extract live clock module and fix component-to-page import`。

### Task 2: Phase view + `participantView`

**Files:**

- Create: `src/features/live/lib/live-phase-view.ts`（union 型別 + `participantView(state)`）
- Create: `src/features/live/lib/live-phase-view.test.ts`
- Create: `docs/superpowers/plans/2026-07-25-live-phase-view-test-map.md`（case → 去向對照表）
- Modify: `src/features/live/pages/live-session-page.tsx`（`:366-379` 四條件規則、`:391-470` 八個分支改為 switch）
- Modify: `src/features/live/pages/live-pages.test.tsx`（刪除已被取代的 participant cases）

Participant union 變體：`lobby` · `waiting-for-next`（Late Join）· `question` · `paused` · `reveal` · `screen-only-result` · `completed` · `cancelled`。`showScoreboard` 與 `ambientLoop` 為變體欄位。

**Steps:**

- [x] **Step 1:** 先產出對照表：逐條列出**所有 render `<LiveSessionPage>` 的 case**——`live-pages.test.tsx:200-421`（`LiveSessionPage (participant)` describe）**加上誤置於 host describe 內的三個 participant case：`:561`（paused overlay）、`:582`（streak 徽章）、`:604`（team scoreboard）**——標注「轉譯為 view test」或「留在頁面層」。分類依據是 case 實際 render 的元件，不是 describe 標題。留在頁面層的合法理由只有四類：React reconciler 交互（如 `teacher-live-session-page.tsx:268-273` 的 `key={action.transition}`）、跨 render 的計時行為（`Countdown` 重錨定）、`aria-live` / `role="status"` 播報、元素實際被覆蓋或缺席。其餘一律轉譯。
- [x] **Step 2:** 依對照表撰寫 view tests（RED）——由既有 case 的斷言逐條翻譯，不得新增設計意圖來源的斷言。
- [x] **Step 3:** 實作 `participantView` 至全綠。
- [x] **Step 4:** `live-session-page.tsx` 改由 switch 渲染；exhaustive check 必須為編譯期保證。
- [x] **Step 5:** 刪除對照表標記為已取代的 page cases。
- [x] **Step 6:** `pnpm test` + lint + typecheck。
- [x] **Step 7:** Commit `refactor: add participant phase view`，commit message 內含 case → view test 對照。

### Task 3: `actionCopy` + `hostConsoleView`

**Files:**

- Create: `src/features/live/lib/live-action-copy.ts`（`actionCopy(transition, audience)` → `{ label, emphasis }`）
- Create: `src/features/live/lib/live-action-copy.test.ts`
- Modify: `src/features/live/lib/live-phase-view.ts`（新增 `hostConsoleView`；`hostActions: readonly { transition, precedence }[]`，secondaries 順序固定）
- Modify: `src/features/live/lib/live-phase-view.test.ts`
- Modify: `src/features/live/pages/teacher-live-session-page.tsx`（刪除 `:24-41` `hostAction`、`:17-22` `transitionErrorMessage`、`:295` cancel 顯示規則）
- Modify: `src/features/live/pages/live-pages.test.tsx`（刪除已被取代的 host console cases）

**Steps:**

- [x] **Step 1:** 對照表擴充至 `live-pages.test.tsx:422-637` 中**實際 render `<TeacherLiveSessionPage>` 的 case**。注意：`:561`、`:582`、`:604` 雖在 host describe 內，render 的是 `<LiveSessionPage>`，屬 Task 2 的 participant 對照表——不得轉譯成 hostConsoleView 測試，也不得在本 task 刪除。
- [x] **Step 2:** 由對照表撰寫 `hostConsoleView` 的 view tests（RED），含最後一題 `advance` / `finalize` 分岔與 cancel 可見性。
- [x] **Step 3:** 實作 `hostConsoleView` 與 `actionCopy` 至全綠。
- [x] **Step 4:** 主持台改由清單渲染；`key={action.transition}` 的 reconciler 保護必須保留（該行為留在頁面層測試）。
- [x] **Step 5:** 刪除已取代的 page cases；`pnpm test` + lint + typecheck。
- [x] **Step 6:** Commit `refactor: add host console phase view and action copy`。

### Task 4: `projectorView` + 音效分流

**Files:**

- Modify: `src/features/live/lib/live-phase-view.ts`（新增 `projectorView`；變體帶 `ambientLoop`）
- Create: `src/features/live/lib/live-audio-cue.ts`（`cueFor(previous, current)`；`previous === null` 回 `null`）
- Create: `src/features/live/lib/live-audio-cue.test.ts`
- Modify: `src/features/live/components/live-presenter.tsx`（`:211-222` 音效 useEffect 改為 `ambientLoop` + `cueFor`；`:449-464` footer 改由清單渲染，`primary` 固定右側、secondaries 依清單順序置左）
- Modify: `src/features/live/components/live-presenter.test.tsx`（逐條轉譯）

**Steps:**

- [x] **Step 1:** 對照表擴充至 `live-presenter.test.tsx` 全部 6 個 case。
- [x] **Step 2:** 撰寫 `projectorView` 與 `cueFor` 測試（RED），明確涵蓋「重連進入 lobby 時 Ambient Loop 恢復」與「重連進入 podium 時 Cue 不發」。
- [x] **Step 3:** 實作至全綠。
- [x] **Step 4:** footer 改為由 `precedence` 決定版位——render 端不得認得 transition name。
- [x] **Step 5:** `pnpm test` + lint + typecheck。
- [x] **Step 6:** Commit `refactor: add projector phase view and split ambient loop from cues`。

### Task 5: SQL guard 對照 fixture 測試

**Files:**

- Create: `src/features/live/lib/live-phase-view.guard-matrix.test.ts`

**Steps:**

- [x] **Step 1:** 從 `supabase/migrations/20260717000800_live_play_commands.sql:106-148` 與 `20260720000100_live_pause.sql:124` 抄出 guard 矩陣為 fixture（來源狀態 → 合法 transition）。
- [x] **Step 2:** 表格測試：`hostConsoleView` 對每個狀態提供的 transition 必須是 fixture 允許集合的子集。
- [x] **Step 3:** 反向驗證——暫時改壞一條投影規則，確認測試 FAIL，再還原。
- [x] **Step 4:** Commit `test: pin live host actions against SQL guard matrix`。

### Task 6: 共用選項順序常數（drift risk）

**Files:**

- Modify: `src/components/ui/option-button.tsx`（新增 export `OPTION_ORDER: readonly { variant: OptionVariant; shape: OptionShape }[]`——index → 色與形狀的唯一有序來源。`SHAPE_SYMBOLS`（`:9-14`，shape → glyph）**已是單一來源，不動**）
- Modify: `src/features/live/components/live-presenter.tsx`（刪除 `:16-21` `OPTION_STYLE`，改由 `OPTION_ORDER` + `SHAPE_SYMBOLS` 導出）
- Modify: `src/features/live/pages/live-session-page.tsx`（刪除 `:25-36` `OPTION_VARIANTS` / `OPTION_SHAPES`，改 import `OPTION_ORDER`）

真正重複的不是 glyph 對照（那已在 `SHAPE_SYMBOLS` 單一來源），而是 **index → (variant, shape) 的順序**：`live-presenter.tsx:16-21` 與 `live-session-page.tsx:25-36` 各自硬寫了一份。兩份目前一致，因此這是 drift risk 而非 live bug；順序若被任一側改動才會在課堂上出現「投影幕與手機形狀不同」。

**Steps:**

- [x] **Step 1:** 在 `option-button.tsx` 新增 `OPTION_ORDER`，兩處改 import；確認合併前後 index → (variant, shape) 對照完全不變。
- [x] **Step 2:** `pnpm test` + lint + typecheck。
- [x] **Step 3:** Commit `refactor: single source for live option shape and colour`。

---

## Out of scope

- `LiveRepository` 外殼收攏（架構審查 C2）——獨立候選，不在本計畫。
- Participant 的 `question` 變體是否需依 `screen_only` 再拆（options 有無 text）——本計畫以單一變體帶 optional text，若日後證明不夠誠實再拆。
- 任何 migration、RPC payload 或 pgTAP 變更。
