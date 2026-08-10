# Phase 5F-U1：Teacher LivePresenter UI Implementation Plan

**Status：** Owner approved：2026-08-10 ／ Claude Code single plan review completed ／ remediation completed ／ Authorized for implementation ／ Implementation in progress

**Spec：** `docs/superpowers/specs/2026-08-10-phase-5f-u1-teacher-live-presenter-ui-design.md`（Owner approved 2026-08-10）

**Parent spec：** `docs/superpowers/specs/2026-08-10-phase-5f-teacher-live-functional-design.md` 第 13 節「Delivery Slices」

**Base：** 建立 worktree 當下重新確認的 `feature/v2-major-update` tip `e559a5c32d7c685fb950033f97405680292cb1e5`。

## A. Objective / Completion Claim

在既有 production-wired 的 `LivePresenter` 上完成 `draft`／`cancelled` 主體、full-screen region accessibility、四個投影 viewport、keyboard/focus、pending 可辨識與 reduced-motion 支援；既有 route、hooks、repository、server state、transition handler 與主持流程全部原樣保留。

完成本 plan 後只能宣稱：

**「5F-U1 LivePresenter UI surface complete」**

不得宣稱 5F complete、Phase 5 complete、5F Slice Gate passed、production-ready，或 AC-LIVE-004／005／007／010 已重新驗證。

## B. Explicit Non-goals / Forbidden Paths

- 不新增或修改 API、RPC、schema、query、mutation、RLS、Edge Function。
- 不新增教師統計、參與紀錄、正確率、provisional rank 或 sample data。
- 不修改 `projectorView()`／`hostConsoleView()`、`LiveSessionState` 或新增第三套 phase union。
- 不修改 `use-live-session.ts`、`use-live-commands.ts`、`presenter-audio.ts`、`live-clock.ts`、`live-audio-cue.ts` 的判斷邏輯。
- 不修改 `teacher-live-session-page.tsx` 的 transition payload、version conflict、cancel、settle、navigate 行為；只允許其既有 RTL assertion 因 accessible role 修正而更新。
- 不修改 `src/app/router/create-app-router.tsx`、學生端 `live-session-page.tsx`、任何 `*repository.ts`、`supabase/**`、`.claude/**`、`.codex/**`。
- 不執行 Local Supabase、Docker、hosted/staging/production 操作、全域 `pnpm acceptance` 或 Phase 8 release gate。

## C. Baseline Inventory（實際讀碼）

| Module / seam              | Current fact                                                                                                                                                                                                                                              | U1 treatment                                                       |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `/teacher/live/:sessionId` | `TeacherLiveSessionPage` 以 production `useLiveSession`／`useLiveTransition` 組裝 `LivePresenter`                                                                                                                                                         | route 與資料流不動                                                 |
| `LivePresenter`            | `src/features/live/components/live-presenter.tsx`，剛好 500 行；唯一外部 interface 是現有 props                                                                                                                                                           | 保留 interface；只補呈現與 semantics                               |
| Phase projection           | `live-phase-view.ts` 已提供 7 態 `ProjectorPhaseView` 與 host action projection                                                                                                                                                                           | 完全不動                                                           |
| Missing bodies             | `draft`、`cancelled` 已在 union 中，但目前無 JSX 主體                                                                                                                                                                                                     | Task 1 補上誠實文案                                                |
| Root semantics             | 現為 `role="dialog" aria-modal="true" aria-label="投影模式"`                                                                                                                                                                                              | Task 1 改為 `role="region" aria-label="Live 投影模式"`             |
| Root overflow              | `.live-presenter { overflow: auto }`                                                                                                                                                                                                                      | 正式 viewport 改為 root 不捲動；只保留兩個核准子容器               |
| Allowed overflow           | lobby participant wall、reveal standings 尚未具備完整 scroll-region keyboard contract                                                                                                                                                                     | Task 2 收斂為可聚焦、有 label 的有界區域                           |
| Motion                     | `globals.css:1285-1298` 已以全域 `*` 規則把 reduced-motion duration 壓到 `0.01ms !important`，但不會清除具名 keyframes；`globals.css:6802-6806` 已對 podium fireworks 設 `animation:none`；wall chips／podium steps 另有 `[data-reduced-motion]` fallback | Task 3 以 `animation-name:none` 補齊 wall/podium，不重寫 audio cue |
| Existing RTL               | `live-presenter.test.tsx` 249 行、8 cases；`live-pages.test.tsx` host console 仍斷言 dialog                                                                                                                                                               | Task 1 增量修改，不刪既有 behavior assertions                      |
| Existing CSS               | `globals.css` 實測 `.live-presenter` 字樣 90 處（45 個 unique name、71 個行首 selector），無 presenter viewport breakpoint                                                                                                                                | 僅在 `.live-presenter*` namespace 內施工                           |
| Harness precedent          | Phase 4A/5V 使用 `dev-harness/*` + feature harness + dedicated Playwright config                                                                                                                                                                          | U1 固定使用 `localhost:4178`                                       |

### Module / seam decision

`LivePresenter` 保持一個深 module：production caller 與 RTL 都只穿過同一個 props interface；projection、audio、clock 與 repository 是既有內部 seams，不新增 pass-through adapter。Chromium harness 直接以真實 `LiveSessionState` fixture 呼叫同一 interface，不建立第二個 production presenter。

`live-presenter.tsx` 目前已達 500 行。本批預期會略超過 500 行，但不為行數門檻搬動 `CountdownRing`、`StandingsBoard` 或 phase rendering，因為那會把 U1 變成未授權的 presenter 重寫、放大 regression diff。理由是：本次新增只屬同一個 cohesive interface 的兩個既有 phase 分支與 viewport safety state；review 必須檢查新增淨行數是否仍維持在窄幅。若實際實作需要新增超過約 50 行 presenter JSX，立即停止並改提最小內部 module 拆分，不得邊寫邊擴張。

## D. Owner Decision and Enforcement Boundary：Live 專用內容上限

### 確定事實

核准 spec 同時要求：

1. `question-boundary` 使用 1000 字元 prompt。
2. 4 個 options，各使用 500 字元文字。
3. 1024×768 時核心 prompt/options 全文不裁切、不靠捲動。
4. 教室投影距離仍需可讀。

這等於最多 3000 個內容字元。即使假設全為最有利排版的 CJK 方形字，以 16×16 px（已低於合理的教室投影字級）計算，字框面積約 `3000 × 16 × 16 = 768,000 px²`；1024×768 viewport 總面積只有 `786,432 px²`，還未計入 header、footer、題號、timer、作答數、gap 與 padding。四條要求無法同時成立。

### Owner 裁定

Owner 已採用選項 1：以 Chromium 實測定案一組 LivePresenter 專用 prompt／option 顯示上限；不得縮小既有題幹 `51.2px`／選項 `32px` 字級，不新增第三個 scroll region，也不得 line-clamp、ellipsis 或裁切。

### U1 強制點與 deferred enforcement

- **U1 本輪可強制的範圍**：Task 2 的 boundary fixture 與 Chromium contract test 以定案上限為正式通過契約；Presenter UI 對該上限負責四 viewport 零根層捲動與全文可見。量測 tracer 另保留 74／50 baseline 與相鄰失敗邊界，不冒充 production 可顯示內容。
- **建立 Live 時的 client-side 驗證不可在 U1 實作**：目前 `LiveSectionOption` 只有 `sectionId`／`title`／`quizTemplateId`，`list_live_section_options` 不回傳題幹或選項。要在 `TeacherLivePage` 驗證長度必須新增 query/data contract，違反 B 節禁止新增 query/data 的邊界。
- **不得收緊全站 schema**：`questions.prompt` 的 1–1000 與 `question_options.option_text` 的 1–500 是 Quiz／複習共用 CHECK，不得為 Live 修改。
- **真正 content enforcement 移交但不阻塞 U1**：優先由 2A content import gate 依 Task 2 定案值拒絕不適合 Live 的內容；若需要 server-authoritative activity/session guard，移交 5F-F2。兩者落地前，U1 仍可獨立交付其 presentation contract 與既有 62 題的改寫清單，不宣稱 production 已全面強制內容上限。

### Task 2 實測定案

Chromium 定案為**題幹 36 字 × 每個選項 21 字 × 4 選項**。初始 74／50 baseline 在 1024×768 為 `scrollHeight 1411px / clientHeight 768px`。36／21 在四 viewport 均保留既有題幹 `51.2px`／`52px`與選項 `32px`，最緊的 1280×720 主體高 `581px`且與 header／footer 各留約 `6.25px`；37／21 與 36／22 均失敗。現有 CSV 需改寫 11／62 題題幹與 22／248 個選項。

## E. File Inventory

### Task 1 — existing-state rendering / accessible semantics

- Modify：`src/features/live/components/live-presenter.tsx`
- Modify：`src/features/live/components/live-presenter.test.tsx`
- Modify：`src/features/live/pages/live-pages.test.tsx`（只把既有 host-console accessible-role assertion 從 dialog 改為 named region；其他 transition assertions 不動）

### Task 2 — viewport harness / boundary layout

- Create：`src/features/live/components/live-presenter.test-fixtures.ts`
- Create：`src/features/live/components/live-presenter.harness.tsx`
- Create：`dev-harness/live-presenter.html`
- Create：`dev-harness/live-presenter.main.tsx`
- Create：`playwright.live-presenter-harness.config.ts`
- Create：`tests/e2e/live-presenter.harness.spec.ts`
- Modify：`src/features/live/components/live-presenter.tsx`（只加 scroll-region／too-small 所需 markup；handler 不動）
- Modify：`src/styles/globals.css`
- Modify：`tsconfig.node.json`（加入 dedicated config；`tsconfig.app.json` 已涵蓋 `src` 與 `dev-harness`，no change）
- Modify：本 plan（把 Task 2 實測定案的 prompt／option 上限寫回）
- Modify：核准 spec（第 5／7 節實測值回寫）

### Task 3 — keyboard / focus / pending / reduced motion

- Modify：`src/features/live/components/live-presenter.test.tsx`
- Modify：`tests/e2e/live-presenter.harness.spec.ts`
- Modify：`src/styles/globals.css`

### Planning / handoff only

- Create：本 plan。
- Modify：`docs/handoff.md`（append-only checkpoint）。

## F. Overlap / Dirty-state Boundary

主 checkout 的既有 dirty/untracked paths（`docs/content/sheet-db-verify-report.md`、`artifacts/design-audit/**`、`live/**`、`ref_image/**`、截圖與 `POSTGREST_READY` 暫存路徑）不屬本 plan，規劃、worktree 建立、未來 integration preflight 都不得納入。

Phase 1 `phase1/admin-security-impl` 盤點 tip 為 `def3fc96c5cfbfddc70f90790104e87219158466`，merge-base 為 `2295fd6`。與 U1 計畫修改路徑的交集只有 `src/styles/globals.css`；Phase 1 的該檔 diff 未命中 `.live-presenter`／podium／wall／fireworks selectors，因此是同檔不同 namespace 的文字整合風險，不是已知 selector 行為衝突。Implementation 開始前需重新比對當時 tip；不得修改 Phase 1 worktree。

## G. Behavior-Preservation Matrix

| Existing behavior                                                    | Required proof                                                                                           |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `projectorView(state)` / `hostConsoleView(state)` phase/action rules | source files零 diff；既有 phase tests全綠                                                                |
| `runTransition` expected version與 payload                           | `live-pages.test.tsx` 既有 repository-call assertions 原樣保留                                           |
| cancel 二段確認與 `runCancel` navigate                               | existing tests + Task 1 callback assertion；不得新增第二個一般尺寸 exit control                          |
| podium/cancelled `onExit`                                            | cancelled RTL 驗證既有 callback；too-small 只重用同一 callback                                           |
| pending 防重複操作                                                   | footer buttons 維持 `disabled={transitionPending}`；RTL 驗證 primary/secondary 均 disabled、click 不觸發 |
| mute / audio cue / countdown                                         | 既有 8 cases 不刪；audio/clock source files零 diff                                                       |
| standings query                                                      | `repository?` DI 與 `useLiveStandings` 呼叫方式不動                                                      |
| production runtime isolation                                         | `src/main.tsx`／router 不 import harness/fixture；Chromium network 僅允許 Vite/module assets             |

## H. Task Seams（3 tasks）

### Task 1：Seven-state body completeness and full-screen region semantics

**目的：** 以 RTL 先鎖住 `draft`／`cancelled`、callback、pending 與 region semantics，再做最小 JSX 修改。

**RED：**

- `draft` 顯示「場次準備中」與「尚未開放學生加入」語意；不顯示參與人數、題目或 timer。
- `draft` footer 沿用 `startSession` primary action；cancel 仍使用既有 header 二段確認並只呼叫既有 `onCancel` 一次。
- `cancelled` 顯示「本場已取消」與「不會產生正式名次或完整正確率」語意；不顯示名次或百分比；header 的「離開投影」呼叫既有 `onExit`。
- root 為 `role="region"`、accessible name「Live 投影模式」，不存在 `aria-modal`。
- `transitionPending=true` 時 existing footer actions disabled，click 不執行 callback；loading label 保留。
- `live-pages.test.tsx` 只更新 host console 的 named-region assertion，既有 `openQuestion`／`finalize` payload assertions 不變。

**GREEN：** 只在 `LivePresenter` 加入兩個 phase 主體與 semantics 修正；不修改 phase projection 或 route handler。

**對應 AC：** AC-UI-013、AC-UI-015；`draft`／`cancelled` viewport 是 spec 的 AC-TBD，不自行創號。

**Scoped validation：**

Task 開始前記錄 `task_base=$(git rev-parse HEAD)`；本 task commit 建立後執行最後兩項機械檢查，`git diff --name-only "$task_base"..HEAD` 必須恰等於 Task 1 三個檔案。

```bash
pnpm typecheck
npx eslint src/features/live/components/live-presenter.tsx src/features/live/components/live-presenter.test.tsx src/features/live/pages/live-pages.test.tsx
npx vitest run src/features/live/components/live-presenter.test.tsx src/features/live/pages/live-pages.test.tsx src/features/live/lib/live-phase-view.test.ts src/features/live/lib/live-phase-view.guard-matrix.test.ts
npx prettier --check src/features/live/components/live-presenter.tsx src/features/live/components/live-presenter.test.tsx src/features/live/pages/live-pages.test.tsx
git diff --check
git diff --name-only "$task_base"..HEAD
rg -n "test-fixtures|\.harness" src/main.tsx src/app/router/ && exit 1 || true
```

**Commit boundary：** 一個 commit；只含三個檔案。

### Task 2：Four-viewport layout and isolated Chromium harness

**前置狀態：** D 節選項 1 已由 owner 裁定；Task 2 已以 Chromium 定案 36／21，fixture 使用該邊界而非一般短文案。

**目的：** 建立 dev/test-only harness，以真實 `LiveSessionState` 形狀走 `LivePresenter` 同一 interface；先讓 overflow/visibility assertions RED，再以 `.live-presenter*` CSS 與最小 markup 使其 GREEN。

**Harness scenarios：** `draft`、`lobby-boundary`、`question-boundary`、`paused-boundary`、`reveal-boundary`、`podium-boundary`、`cancelled`、`too-small-cancelled`。四個正式 viewport 為 1024×768、1280×720、1366×768、1920×1080；前七個 scenario 全部跑四尺寸。`too-small-cancelled` 只跑 900×600，刻意使用原本就有「離開投影」的 cancelled phase。

**第一個 RED／量測 tracer：**

1. 先用既有真實最長內容（prompt 74、4 個 option 各 50）在 1024×768 量出 header／footer／body bounding boxes 與 overflow，記錄為「現況超界量測」，不得改 CSS 讓這組不合理內容通過。
2. 保留既有 h2 `51.2px` 與 option `32px` computed font size assertions，逐步測候選上限；候選必須同時有 4 options 且 prompt/options 全文可見。
3. 定案後把確切數值寫入本 Task、spec 第 5／7 節與 fixture constants；同時計算 `artifacts/content/questions.csv` 62 題／248 選項中超過上限的筆數。

**Assertions：**

- 每個正式 viewport 的 `documentElement.scrollWidth/scrollHeight <= clientWidth/clientHeight`，且 `.live-presenter` 自身 `scrollWidth/scrollHeight <= clientWidth/clientHeight`。
- header、phase heading/core content、footer control bounding boxes 完整落在 viewport；不得只測 document overflow。
- lobby wall 與 standings 是唯一可 overflow 子容器：有 accessible label、`tabIndex=0`，實際 `scrollHeight > clientHeight` 時可 focus 並以鍵盤捲動；不遮 header/footer。
- question/paused/reveal 的裁定後最大內容完整可見，不使用 line-clamp、ellipsis、clip 或第三個 scroll region。
- 1024×768 與 1280×720 不觸發 too-small；900×600 的 `too-small-cancelled` 顯示「投影視窗過小」並可用 cancelled 既有 `onExit` 離開。進行中 phase 的 too-small 不新增 exit control，維持 spec 8.5。
- console errors、page errors、unexpected network requests 為 0。

**CSS strategy：** root 改成固定 viewport grid/flex（header、`minmax(0,1fr)` body、footer），`overflow: hidden`；所有 body 子項必須有 `min-width:0`／`min-height:0`；只為 1024×720 以上 projector contract 寫 scoped responsive rules，不污染 teacher/chapter/admin namespaces。保留既有 pixel/night tokens，不新增 token。

**Harness isolation：** `live-presenter.test-fixtures.ts` 與 `.harness.tsx` 頂端標註 DEV/TEST-ONLY；`dev-harness/live-presenter.main.tsx` 是唯一入口。production router/main 零 import。Dedicated config 固定：

```ts
use: { baseURL: 'http://localhost:4178' },
webServer: {
  command: 'npx vite --host localhost --port 4178 --strictPort',
  url: 'http://localhost:4178/dev-harness/live-presenter.html?scenario=draft',
  reuseExistingServer: false,
  timeout: 60_000,
},
```

**對應 AC：** AC-UI-008、AC-UI-013、AC-UI-015；viewport/draft/cancelled 仍為 AC-TBD。

**Scoped validation：**

Task 開始前記錄 `task_base=$(git rev-parse HEAD)`；本 task commit 建立後執行最後兩項機械檢查，changed paths 必須恰等於 Task 2 inventory（含本 plan 與核准 spec）。

```bash
pnpm typecheck
npx eslint src/features/live/components/live-presenter.tsx src/features/live/components/live-presenter.test-fixtures.ts src/features/live/components/live-presenter.harness.tsx dev-harness/live-presenter.main.tsx tests/e2e/live-presenter.harness.spec.ts playwright.live-presenter-harness.config.ts
npx prettier --check src/features/live/components/live-presenter.tsx src/features/live/components/live-presenter.test-fixtures.ts src/features/live/components/live-presenter.harness.tsx dev-harness/live-presenter.html dev-harness/live-presenter.main.tsx tests/e2e/live-presenter.harness.spec.ts playwright.live-presenter-harness.config.ts src/styles/globals.css tsconfig.node.json
npx playwright test --config=playwright.live-presenter-harness.config.ts
git diff --check
git diff --name-only "$task_base"..HEAD
rg -n "test-fixtures|\.harness" src/main.tsx src/app/router/ && exit 1 || true
```

**Commit boundary：** 一個 commit；包含 Task 2 inventory，沒有產品 data/query changes。

### Task 3：Keyboard, focus contrast, pending visibility, reduced motion

**目的：** 在 Task 2 harness 上補齊互動與 media-query 的可重現證明；JSDOM 不冒充 CSS engine。

**RTL：**

- 驗證 DOM/tab order 仍是 header controls → 可聚焦 wall/standings（存在時）→ footer controls。
- 驗證兩步取消的「返回」與「確認取消挑戰」順序及 callback 次數。
- pending primary/secondary control 均 disabled，loading label 與 disabled 樣式在四個正式 viewport 可辨識。

**Chromium：**

- keyboard-only：lobby 與 reveal 分別驗證 header → bounded scroll region → footer 的 focus order；focus indicator 全程可見。
- 使用 computed color/outline 或 axe-compatible contrast helper 驗證 `.live-presenter :focus-visible` 與相鄰深色背景至少 3:1；若全域 `--color-info` 不足，只能加 `.live-presenter :focus-visible` scoped override。
- Reduced-motion RED：現況全域規則已把 duration 壓到 `0.01ms`，但 wall chip／podium step 的 computed `animation-name` 仍是具名 keyframes。GREEN 單一策略是 `page.emulateMedia({ reducedMotion: 'reduce' })` 後驗證 wall chip、podium step、podium fireworks 的 computed `animation-name` 全為 `none`；不得以 duration assertion 代替。
- 正常 motion 下驗證 wall/podium 一次性 presentation cue 仍有非 `none` animation；不測、不改 audio cue 判斷。
- `@media (prefers-reduced-motion: reduce)` 是正式證明；既有 `[data-reduced-motion]` fallback 可保留但不能替代 media-query test。
- Header 控制項（靜音／取消／離開）與 footer 主持控制，在四個正式 viewport 的 bounding box 均須 `width >= 44 && height >= 44`；不足時只改 `.live-presenter*` namespace。

**對應 AC：** AC-UI-008、AC-UI-015；AC-UI-011 不適用，因 presenter 已是 route region。

**Scoped validation：**

Task 開始前記錄 `task_base=$(git rev-parse HEAD)`；本 task commit 建立後執行最後兩項機械檢查，changed paths 必須恰等於 Task 3 三個檔案。

```bash
pnpm typecheck
npx eslint src/features/live/components/live-presenter.test.tsx tests/e2e/live-presenter.harness.spec.ts
npx vitest run src/features/live/components/live-presenter.test.tsx src/features/live/pages/live-pages.test.tsx src/features/live/lib/live-phase-view.test.ts src/features/live/lib/live-phase-view.guard-matrix.test.ts src/features/live/lib/live-audio-cue.test.ts src/features/live/lib/live-clock.test.ts src/features/live/lib/presenter-audio.test.ts
npx prettier --check src/features/live/components/live-presenter.test.tsx tests/e2e/live-presenter.harness.spec.ts src/styles/globals.css
npx playwright test --config=playwright.live-presenter-harness.config.ts
git diff --check
git diff --name-only "$task_base"..HEAD
rg -n "test-fixtures|\.harness" src/main.tsx src/app/router/ && exit 1 || true
```

**Commit boundary：** 一個 commit；只含 Task 3 三個檔案。

## I. Final Scoped Validation（implementation 完成後）

```bash
pnpm typecheck
npx eslint src/features/live/components/live-presenter.tsx src/features/live/components/live-presenter.test.tsx src/features/live/components/live-presenter.test-fixtures.ts src/features/live/components/live-presenter.harness.tsx src/features/live/pages/live-pages.test.tsx dev-harness/live-presenter.main.tsx tests/e2e/live-presenter.harness.spec.ts playwright.live-presenter-harness.config.ts
npx vitest run src/features/live/components/live-presenter.test.tsx src/features/live/pages/live-pages.test.tsx src/features/live/lib/live-phase-view.test.ts src/features/live/lib/live-phase-view.guard-matrix.test.ts src/features/live/lib/live-audio-cue.test.ts src/features/live/lib/live-clock.test.ts src/features/live/lib/presenter-audio.test.ts
npx prettier --check src/features/live/components/live-presenter.tsx src/features/live/components/live-presenter.test.tsx src/features/live/components/live-presenter.test-fixtures.ts src/features/live/components/live-presenter.harness.tsx src/features/live/pages/live-pages.test.tsx dev-harness/live-presenter.html dev-harness/live-presenter.main.tsx tests/e2e/live-presenter.harness.spec.ts playwright.live-presenter-harness.config.ts src/styles/globals.css tsconfig.node.json
npx playwright test --config=playwright.live-presenter-harness.config.ts
git diff --check
git diff --name-only "$implementation_base"..HEAD
rg -n "test-fixtures|\.harness" src/main.tsx src/app/router/ && exit 1 || true
```

Final Chromium run 必須包含四 viewport 下所有 header/footer 控制項 `>=44×44px`、pending label/disabled 樣式可辨識、七態 root/body bounding boxes、too-small-cancelled、reduced-motion `animation-name:none`。不執行 `pnpm acceptance`、全域 `pnpm test:e2e`、DB/Docker/Supabase 或 hosted checks；這些不是 U1 task-level UI surface gate。

## J. Review Policy / Remediation

- **Claude Code 唯一一次 plan review 已完成**，原結論 `BLOCK`（4 High／4 Medium／1 Low）；本版已逐項 remediation，不啟動第二次 plan review。Claude 不修改本 plan 或 Codex worktree。
- Implementation 三個 task 完成且 scoped checks 全綠後，仍由 **Claude Code 作唯一 implementation reviewer**；不得再啟動 sub-agent、Codex plugin/CLI、hook reviewer 或第二 reviewer。
- Plan review 與 implementation review 是兩個不同 artifact，各一次；finding 修復後只重跑受影響的 scoped validation，不啟動第二位 reviewer。
- Review 必須特別核對 D 節 owner decision、forbidden paths、production fixture isolation、transition payload assertions、四尺寸 × 七態 matrix 與 root/body bounding-box assertions；只看 screenshot 或 document overflow 不足以 ALLOW。

## K. Worktree / Integration Strategy

Owner 已裁定 D 節選項 1並授權本輪 implementation；本 plan/spec remediation commit 建立後即可建立：

- Branch：`phase5f/u1-live-presenter-ui`
- Worktree：`.worktrees/phase5f-u1-live-presenter-ui`
- Base：建立當下重新確認的 `feature/v2-major-update` tip

建立前重新記錄主 checkout dirty-state fingerprints；worktree 內逐 task 個別 commit，不使用 `git add -A`。Implementation review ALLOW 後只提出 integration preflight 建議；merge、push、hosted 操作仍需 owner 另行授權。

## L. Risks / Stop Conditions

- 實作需要新 API/data/phase/transition：停止，移交 5F-F2 或提出 spec/ADR，不用 fixture 補洞。
- 最大內容只能靠縮到不可讀、clip、ellipsis 或第三個未核准 scroll region 才能過：停止，回報 contract contradiction。
- `LivePresenter` 需要大規模抽檔／重寫或新增超過約 50 行 JSX：停止，先提出最小內部 module 拆分供 owner/reviewer 裁定。
- Phase 1 tip 變更且新增 `.live-presenter*` overlap：停止該 CSS task，先做 integration sequencing 決定。
- Chromium 因 port 4178 被占用：`--strictPort` 直接失敗，不靜默換 port、不重用既有 server。

## M. AC / Evidence Boundary

Task-level mapping：AC-UI-008、AC-UI-013、AC-UI-015；viewport 與 `draft`／`cancelled` 維持 AC-TBD。AC-UI-011 不適用。U1 只產生測試輸出，不建立 `artifacts/acceptance/`，不以 dev-only harness 冒充 production network parity、phase gate 或 headed release evidence。
