# Phase 8-UI: GGAME UI Restyle Implementation Plan

> **For agentic workers:** Execute task-by-task in one continuous session with `superpowers:executing-plans`（沿用本 repo 慣例；不使用 per-task subagent）。Track every step with its checkbox and stage this plan's checkbox updates in the same task commit. One complete-range review after the final task, one formal phase gate.

**Goal:** 把全 app 視覺換成 GGAME.html 語言（亮黃／大圓角白卡／扁平 2D／Noto Sans TC），任務頁改精熟地圖流，商店加邊框商品，並將完整 e2e 電池納入 phase gate。

**Architecture:** 三層 token（`src/styles/tokens.css`）→ 共用元件庫（`src/components/ui/`）→ 逐畫面重組。功能全接既有 server-authoritative 後端；唯一 schema 變更為邊框商品 migration。

**Tech Stack:** React 19 + TS strict + Vite + Tailwind v4（CSS variables）+ @fontsource/noto-sans-tc + lucide-react + Supabase + Vitest/RTL + Playwright + pgTAP。

**Authoritative sources:** `docs/superpowers/specs/2026-07-18-ui-restyle-design.md`（本計畫的唯一設計來源）；spec/07（Task 1 更新後）。
**Baseline:** `7a22016`（Phase 7 closed + design doc）。Worktree clean at plan commit.

## Global Constraints

- 元件與畫面內禁止裸 hex；一律 `var(--…)` token（`tokens.css` 為唯一定義點）。
- 禁止 FontAwesome／Google Fonts CDN；字體自架、圖示 lucide-react + emoji。
- 動效一律尊重 `data-reduced-motion`（既有機制）。
- 不動信任邊界：無 `service_role`、無答案下發前端；登入維持 Email/密碼。
- UI 文案繁中、identifiers 英文；TS strict；單檔 >500 行需拆分。
- 每 task：lint + typecheck + 受影響測試，完成宣稱附新鮮執行輸出；不產生截圖證據目錄（gate 一次做）。
- Review diff 排除 lockfile、`legacy/**`、`artifacts/**`、snapshot 圖檔、產生型檔案。
- `legacy/ggame-ui-reference-2026-07-18.html` 唯讀視覺參考，不得複製其 JS/mock 進產品源碼。

---

### Task 0: 基線修復（進場條件）

**Files:**

- Create: `src/features/profile/api/own-profile-select.ts`（export `OWN_PROFILE_SELECT = 'id,display_name,role,timezone,reduced_motion'`）
- Modify: `src/features/profile/api/profile-repository.ts`（select 改用該常數）
- Modify: `tests/e2e/profile-e2e-boundary.ts`（`ownProfileSelect` 改 import 同一常數）
- Modify: `tests/contracts/profile-e2e-boundary.test.ts`（新增斷言：matcher 與 repository 使用同一常數）
- Modify: `tests/e2e/login.spec.ts`（tab 順序改結構性斷言：反覆 Tab（上限 10 次）直到 Email 聚焦，再斷言 密碼→登入 相對順序；skip-link 仍斷言為第一個）
- Modify: `tests/e2e/playable-slice.spec.ts`、`tests/e2e/quiz-runner.spec.ts`（firefox 計時 flake：以 `expect(locator).toBeVisible()` 等確定性狀態等待取代時間性假設）

**Steps:**

- [x] **Step 1:** 建常數模組並改 repository/matcher/contract test；先跑 contract test 確認新斷言在未同步時會 FAIL（暫時把 matcher 改回舊字串驗證 RED，再還原）。
- [x] **Step 2:** `pnpm test`（unit+contract 全綠）。
- [x] **Step 3:** 修 login.spec 與 firefox flake 等待點。（診斷追加：e2e 改對 production build 跑（webServer build+preview）；修產品 bug `.question-option__key` 攔截點擊（pointer-events:none）；quiz 兩 spec 改以點擊可見選項列＋斷言 checked，斷言 payload 鍵由 `OWN_PROFILE_SELECT` 導出）
- [x] **Step 4:** `bash scripts/test-e2e-local.sh` 完整電池，Expected: **0 failed**——實測連續兩次 **47 passed / 0 failed**（59.5s）。
- [x] **Step 5:** Commit `fix: repair cross-phase e2e drift and flakes`。

### Task 1: Pin rules 與參考快照

**Files:**

- Create: `legacy/ggame-ui-reference-2026-07-18.html`（自 owner 檔案快照，唯讀）
- Modify: `spec/07-ui-visual-system.md`（新增「GGAME token 體系」節：§3 的 primitive/semantic 值、元件語彙、圖示/動效規則、裸 hex 禁令；標注取代先前配色細節，其餘 AC-UI 規則不變）

**Steps:**

- [x] **Step 1:** `cp ../../example-html/GGAME.html legacy/ggame-ui-reference-2026-07-18.html`（路徑依實際 repo 相對位置調整）；確認 `.gitattributes` 對 `legacy/**` 的既有處理適用。
- [x] **Step 2:** 更新 spec/07；`pnpm document:manifest`；`pnpm document:manifest:check` PASS。
- [x] **Step 3:** Commit `docs: pin ggame ui tokens and snapshot reference`。

### Task 2: Token 基座與字體/圖示

**Files:**

- Create: `src/styles/tokens.css`（三層：primitive `--yellow-brand:#ffd600`、`--amber-avatar:#ffb300`、`--surface-page:#f4f6fa`、`--radius-card:24px`、`--radius-control:12px`；semantic `--color-primary`、`--color-teacher`、`--color-xp`、`--color-token`、`--color-alert`、`--surface-card`、`--border-subtle`；component 例 `--button-primary-bg`）
- Modify: `src/styles/`（既有全域樣式檔）：import tokens + `@fontsource/noto-sans-tc`（300/400/500/700/900）+ body 底色/字體 + `.animate-fade-in` keyframes（含 `[data-reduced-motion='true']` 停用）
- Modify: `package.json`（新增 `@fontsource/noto-sans-tc`、`lucide-react`）
- Test: `src/styles/tokens.test.ts`（node 讀檔斷言三層 token 鍵存在；防止改名漂移）

**Interfaces（Produces）:** 上列 CSS 變數名為後續所有 task 的唯一色彩/圓角來源。

**Steps:**

- [x] **Step 1:** 失敗測試（tokens.css 尚無）→ RED。
- [x] **Step 2:** `pnpm add @fontsource/noto-sans-tc lucide-react`；建 tokens.css 並接線。
- [x] **Step 3:** `pnpm test src/styles` GREEN + lint + typecheck；`pnpm build` exit 0。
- [x] **Step 4:** Commit `feat: add ggame design tokens and self-hosted font`。

### Task 3: 元件庫（基礎組）

**Files:**

- Create（各含同名 `.test.tsx`，RTL）: `src/components/ui/card.tsx`、`chip.tsx`、`stat-tile.tsx`、`progress-bar.tsx`、`section-header.tsx`、`empty-state.tsx`

**Interfaces（Produces）:**

- `Card { padding?: 'md'|'lg'; className?: string; children }`
- `Chip { tone: 'primary'|'teacher'|'success'|'danger'|'alert'|'neutral'; children }`
- `StatTile { label: string; value: ReactNode; tone?: 'default'|'xp'|'token' }`
- `ProgressBar { value: number; tone: 'primary'|'success'|'warning'|'danger'; label: string }`（`role="progressbar"` + aria-valuenow）
- `SectionHeader { chip?: ReactNode; title: string; description?: string; actions?: ReactNode }`
- `EmptyState { icon?: ReactNode; title: string; description?: string; action?: ReactNode }`

**Steps:**

- [x] **Step 1:** 每元件先寫失敗 RTL 測試（渲染、tone/variant class、aria）→ RED。
- [x] **Step 2:** 實作（僅 token 變數，無裸 hex）→ GREEN + lint + typecheck。
- [x] **Step 3:** Commit `feat: add ui component library base set`。

### Task 4: 元件庫（互動組）

**Files:**

- Create（各含 `.test.tsx`）: `src/components/ui/option-button.tsx`、`hint-callout.tsx`、`map-stepper.tsx`、`victory-card.tsx`、`data-table.tsx`

**Interfaces（Produces）:**

- `OptionButton { variant: 'rose'|'sky'|'amber'|'emerald'; shape: 'triangle'|'square'|'circle'|'diamond'; state?: 'idle'|'locked'|'correct'|'wrong'; disabled?: boolean; onClick(): void; children }`（shape 以文字符號 ▲■●◆ 呈現；locked 附 aria-disabled 與鎖形圖示，不只靠顏色）
- `HintCallout { tier: 1|2; children }`（tier1 rose／tier2 yellow 左邊框）
- `MapStepper { total: number; currentIndex: number; unlockedCount: number; onJump(index: number): void }`（未解鎖節點 disabled；進度線寬 = completed/total）
- `VictoryCard { title: string; description?: string; xp: number; tokens: number; badgeName?: string; onRetry(): void; onNext?(): void }`
- `DataTable { caption: string; columns: ReadonlyArray<{ key: string; header: string }>; rows: ReadonlyArray<Record<string, ReactNode>> }`

**Steps:**

- [x] **Step 1:** 失敗 RTL（含鍵盤操作與 aria 斷言）→ RED。
- [x] **Step 2:** 實作 → GREEN + lint + typecheck。
- [x] **Step 3:** Commit `feat: add ui component library interactive set`。

### Task 5: App shell 與導覽 IA

**Files:**

- Modify: `src/app/shell/app-shell.tsx`（GGAME header：logo 塊、狀態膠囊（暱稱/XP/代幣，接既有錢包 hook）、「▶ 進入大廳」、教師「🔒 教師後台」、登出；學生 3 頁籤番號導覽軌 + chevron；教師 indigo 導覽軌：數據看板/題庫管理/Live 主持/班級管理）
- Modify: `src/app/shell/app-shell.test.tsx`（斷言新導覽結構、角色分流、skip-link 仍為首個聚焦點）

**Steps:**

- [x] **Step 1:** 更新失敗測試 → RED。
- [x] **Step 2:** 實作 → GREEN + lint + typecheck。
- [x] **Step 3:** `bash scripts/test-e2e-local.sh tests/e2e/login.spec.ts`（驗證 Task 0 的結構性斷言仍成立）。
- [x] **Step 4:** Commit `feat: restyle app shell with ggame navigation`。

### Task 6: 大廳

**Files:**

- Modify: `src/features/learning/pages/`（大廳/章節頁）＋必要之 `src/features/{rewards,leaderboard,achievements,live}` hooks 取數
- Create: `src/features/leaderboard/lib/percentile.ts`（`toPercentile(rank: number, total: number): number` = `Math.round((1 - (rank - 1) / total) * 100)`；含單元測試）
- Test: 對應頁面 `.test.tsx`

**內容:** 頭貼卡（裝備 Blook + `--amber-avatar` 框）、數據列（XP/排名/PR；未入班隱藏排名與 PR）、6 章節網格（已發佈黃框/未發佈灰鎖）、入口卡片列（錯題中心真實計數、每日目標、作業、成就、排行榜、複習卡）、Live 廣播 banner（Realtime 既有訂閱）。

**執行備註：** 排行榜 payload 無班級總人數（selfEntry+topEntries 而已），學生端無法誠實計算 PR 百分位；`toPercentile` util 已實作＋測試，UI 僅顯示 XP／全體排名／代幣，PR 格留待後端補人數欄位再啟用（gate 報告列為保留項）。`chapter-select` 頁由 `lobby-page` 取代。

**Steps:**

- [x] **Step 1:** 失敗 RTL（含未入班隱藏、鎖卡不可點）→ RED。
- [x] **Step 2:** 實作 → GREEN + lint + typecheck。
- [x] **Step 3:** Commit `feat: restyle lobby as ggame hub`。

### Task 7: 任務實戰（精熟地圖流）

**Files:**

- Modify: `src/features/learning/`（精熟流頁面：MapStepper + 情境題卡 + 選項鎖定 + 兩層 HintCallout + VictoryCard；接既有 hints/mistakes/remediation/learning-progress hooks 與 RPC）
- Test: 頁面 `.test.tsx`（答錯鎖選項、提示逐層顯示、未過關不可跳關、結算獎勵顯示）

**執行備註：** 精熟流落點為既有 quiz session 頁（`startRemediation` 回傳 session id、`requestHint` 作用於 session question）：session 頁鑲入 MapStepper 地圖、HintPanel 改 HintCallout 分層樣式、結果頁加 GGAME 慶祝樣式（e2e 釘住文案全保留）。另系統性強化 e2e 健康收集：導航取消類（靜態資產／只讀 REST／字體子集下載）豁免落入 shared helper 與三個獨立收集器，auth 端點與 mutation 不豁免（合約 15/15 釘住）；舊「選擇章節／尚無題目」斷言全面清掃至大廳語意。

**Steps:**

- [x] **Step 1:** 失敗 RTL → RED。
- [x] **Step 2:** 實作（節點數 = 該小節實際題數；閘門判斷沿用後端回傳，前端不自算）→ GREEN + lint + typecheck。
- [x] **Step 3:** Commit `feat: rebuild mission page as mastery map flow`。

### Task 8: 邊框商品 migration + 商店重刷

**Files:**

- Create: `supabase/migrations/20260721000100_avatar_frames.sql`（frames 商品類別、`equipped_frame` 欄位、購買/裝備 RPC 沿用帳本模式、RLS 預設拒絕）
- Create: `supabase/tests/035_avatar_frames.test.sql`（正向購買/裝備、負向：他人錢包、重複購買 idempotent、未擁有不可裝備、outsider 不可讀寫）
- Modify: `src/features/inventory/`、`src/features/rewards/`（repository/hooks/型別再生成）
- Modify: 商店頁（頭像區 = 6 Blook 卡片；邊框區 = 漸層樣本卡；擁有/價格/已裝備狀態）
- Modify: 大廳頭貼框與排行榜列（裝備邊框反映）

**執行備註：** migration 落為 `avatar_frames`＋`user_frames`＋`profiles.active_frame_id`＋三 RPC（鏡射 blook 信任邊界）；`economy_source_type` 加 `frame_purchase`（005 合約同步）。pgTAP 035 共 31 斷言（35 檔 892 測試全綠）。裝備反映：大廳頭貼框已接；排行榜列的邊框反映需排行榜 RPC 增欄位，列入 gate 保留項（同 PR 百分位）。

**Steps:**

- [x] **Step 1:** 失敗 pgTAP `035` → RED。
- [x] **Step 2:** migration → `pnpm test:db` GREEN（34+1 檔全綠）。
- [x] **Step 3:** 失敗 Vitest（repository/hooks）→ RED → 實作 + `supabase gen types` → GREEN。
- [x] **Step 4:** 商店/大廳 UI RTL → RED → 實作 → GREEN + lint + typecheck。
- [x] **Step 5:** Commit `feat: add avatar frames and restyle shop`。

### Task 9: Live 重刷

**Files:**

- Modify: `src/features/live/`（學生端：四色 OptionButton + 限時膠囊 + 答後分佈條 + 教師引導解析區；教師主持台：amber 廣播控制台樣式；報表頁套 DataTable）
- Test: 既有 live `.test.tsx` 更新斷言

**Steps:**

- [x] **Step 1:** 更新失敗 RTL → RED。
- [x] **Step 2:** 實作（功能/RPC 零變更）→ GREEN + lint + typecheck。
- [x] **Step 3:** Commit `feat: restyle live with ggame kahoot skin`。

### Task 10: 教師看板與內容管理重刷

**Files:**

- Modify: `src/features/teacher-content/`、`src/features/classrooms/`（3 指標卡+ProgressBar、規則式高頻錯誤卡（取 analytics 答錯率 Top N 題）、學生精熟 DataTable、匯出按鈕樣式；題庫 CRUD/XLSX 匯入精靈套 token 重排）
- Test: 對應 `.test.tsx` 更新

**Steps:**

- [x] **Step 1:** 更新失敗 RTL（含高頻錯誤卡由 mock analytics 資料規則式產生）→ RED。
- [x] **Step 2:** 實作 → GREEN + lint + typecheck。
- [x] **Step 3:** Commit `feat: restyle teacher dashboard and content tools`。

### Task 11: 其餘畫面 + 登入換皮

**Files:**

- Modify: `src/features/{achievements,assignments,leaderboard,profile,auth,quiz}` 各頁（共用元件重組版面；登入頁 GGAME 分流視覺、欄位仍 Email/密碼；quiz 限時挑戰入口保留並套皮）
- Test: 各頁 `.test.tsx` 更新

**執行備註：** `route-panel` 卡片化（去 8px 頂邊條 → GGAME 細邊大圓角）一次重刷剩餘頁面；登入頁加 GGAME 認證入口品牌區（Email/密碼欄位與登入行為不變）。品牌區在矮視窗（≤640px 高，軟鍵盤情境）折疊以守住 primary action 可見性（login.spec 372×500 佈局斷言驗證）。

**Steps:**

- [x] **Step 1:** 逐頁更新失敗 RTL → RED → 實作 → GREEN(可分多個 commit，訊息 `feat: restyle <area> pages`）。
- [x] **Step 2:** `pnpm test` 全綠 + lint + typecheck。
- [x] **Step 3:** Commit（最後一頁）`feat: restyle remaining pages`。

### Task 12: Gate 工具 + visual 基線重建 + phase gate

**Files:**

- Create: `scripts/acceptance/run-ui-restyle.sh`（以 `run-live-advanced.sh` 為模板：reset → `pnpm test` → `pnpm test:db` → **`pnpm test:e2e` 完整電池** → `pnpm test:coverage`（`src/components/ui/` 行覆蓋 ≥80% 斷言）→ token 掃描（`grep -rE '#[0-9a-fA-F]{3,8}' src/components src/features --include='*.tsx'` 命中即 FAIL）→ gate spec → 證據 manifest）
- Create: `tests/e2e/ui-restyle.spec.ts`（`UI Restyle phase gate`：三 viewport 逐畫面截圖：登入/大廳/任務/商店/Live 學生+主持/教師看板；同畫面以 `file://` 開 `legacy/ggame-ui-reference-2026-07-18.html` 對應分頁截參考圖並列存證；axe 掃描 0 violations；console error 0；reduced-motion 開關生效）
- Modify: `package.json`（`phase:ui-restyle`；`test:e2e` grep-invert 加 `UI Restyle phase gate`）
- Modify: `tests/contracts/`（runner 順序 contract test，比照既有慣例）
- Update: visual snapshot 基線（S 級，一次重建，附原因）

**Steps:**

- [ ] **Step 1:** runner/gate contract test RED → 實作 runner 與 gate spec → contract GREEN。
- [ ] **Step 2:** `pnpm test:visual -- --update-snapshots` 重建基線；commit `test: rebuild visual baselines for ggame restyle`。
- [ ] **Step 3:** Commit `test: add ui restyle phase gate`。
- [ ] **Review Step:** 一輪完整範圍 review（`7a22016..HEAD`），優先序：token 純度（無裸 hex）、a11y（aria/鍵盤/形狀符號）、reduced-motion、閘門與獎勵顯示不自算、migration RLS 負向覆蓋；修 Critical/Important 後結束（上限一輪）。
- [ ] **Gate Step 1:** 拋棄式 headless precheck 綠後，clean `GATE_SHA` 跑 `pnpm phase:ui-restyle`。
- [ ] **Gate Step 2:** delivery-gate 檢查單（AC 對照、風險、保留項）寫入 gate 報告；owner 人工核可 GGAME 並列截圖。
- [ ] **Gate Step 3:** PASS 後在 `.superpowers/sdd/progress.md` close phase；redeploy staging；commit `docs: close ui restyle phase`。Reservations：學號登入（下一 phase ADR）、GGAME 後續視覺修訂只動 token/元件層、真機證據待人工。

---

## Owner 回饋增補（2026-07-19 預覽後核准，依序執行）

### Task 11a: 快速修正批 — DONE

- [x] #2 登入預設 `/app` 大廳（既有 fallbackDestination 已滿足，e2e 釘住）。
- [x] #1 sessionStorage session（關分頁即登出、reload 可復原）；auth-guards 儲存衛生斷言升級為「localStorage 全空＋sessionStorage 僅 token key」。
- [x] #6 全域 Toast 系統（右上角、success/error/info、auto-dismiss、error 用 alert 播報）；接線：商店購買/裝備（改為唯一回饋通道）、登入成功、登出。
- [x] 驗證：unit 104 檔 631 綠、e2e 47/47。

### Task 11b: 認證入口 GGAME 化（欄位仍 Email/密碼）

- [ ] 全螢幕深色遮罩＋置中白卡＋學生（黃）/教師（靛）雙頁籤視覺。

### Task 11c: 教師區重排（工作區/教學分析/題庫管理/Live 主持/班級管理）

- [ ] `/teacher` 依 GGAME 教師端版型重組（廣播控制台入口卡、指標卡、雙欄診斷、學生表）。

### Task 11d: 學生六頁深度優化（進度/作業/Live/排行榜/成就/個人資料）

- [ ] 逐頁 GGAME 語彙重排。

### Task 11e: 課後任務實戰 5 階精熟（含 mastery migration + pgTAP）

- [ ] 不限時多次嘗試＋選項鎖定＋逐層提示之 mastery session 後端模式與新頁；導覽軌 tab2 改指新頁。

### Task 12 依原計畫收尾。
