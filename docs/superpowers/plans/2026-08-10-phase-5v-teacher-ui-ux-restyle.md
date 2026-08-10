# Phase 5V：教師端 UI/UX Restyle Implementation Plan

**Status：** Owner approved：2026-08-10 ／ Codex single plan review completed ／ Authorized for Phase 5V implementation

**Spec：** `docs/superpowers/specs/2026-08-10-phase-5v-teacher-ui-ux-restyle-design.md`（Owner approved 2026-08-10）

**Base：** `feature/v2-major-update`，本次盤點時 HEAD `9b8613b7723ba2a5d06384f9a6357c2f941b83bf`（含 Phase 4A merge commit `3644bf2`）。

## A. Objective / Non-goals

**Objective：** 依 spec 第 4 節列出的 7 個教師端 route + HUD 導覽列，完成允許範圍內的 UI/UX restyle（視覺語彙套用、client-only navigation、client-side pagination、focus management、click-outside、responsive、accessibility），不改變任何 API/RPC/server state/計分/finalize/主持流程。

**Non-goals（明確排除，屬 5F 或其他範圍）：**

- `/teacher/live/:sessionId`（LivePresenter 投影/主持台）——完全不在本文件範圍。
- 任何新增的教師可見統計資料、新查詢、新聚合數字。
- 前端自行聚合正式資料。
- 2A/3A 尚未完成的功能。
- 教師報表計算方法論、隱私保護匯出功能。

## B. Baseline Inventory（實際盤點結果，非檔名猜測）

路由對照（`src/app/router/create-app-router.tsx:125-191`，全部包在同一個 `AppShell` + `RequireAuth` + `RequireRole(['teacher'])` 之下）：

| #   | Route                                              | Component                    | File                                                                        | 現有測試                         |
| --- | -------------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------- | -------------------------------- |
| 1   | `/teacher`                                         | `TeacherDashboardPage`       | `src/features/teacher-content/pages/teacher-dashboard-page.tsx`（171 行）   | `.test.tsx`（212 行）            |
| 2   | `/teacher/analytics`                               | `TeacherAnalyticsPage`       | `src/features/teacher-content/pages/teacher-analytics-page.tsx`（378 行）   | `.test.tsx`（278 行）            |
| 3   | `/teacher/classes`                                 | `TeacherClassroomsPage`      | `src/features/classrooms/pages/teacher-classrooms-page.tsx`（241 行）       | `.test.tsx`（245 行）            |
| 4   | `/teacher/classes/:classroomId`                    | `TeacherClassroomDetailPage` | `src/features/classrooms/pages/teacher-classroom-detail-page.tsx`（116 行） | `.test.tsx`（76 行）             |
| 5   | `/teacher/classes/:classroomId/members/:memberRef` | `TeacherStudentProgressPage` | `src/features/classrooms/pages/teacher-student-progress-page.tsx`（200 行） | `.test.tsx`（160 行）            |
| 6   | `/teacher/live`                                    | `TeacherLivePage`            | `src/features/live/pages/teacher-live-page.tsx`（190 行）                   | **無**（需新增，見 Task 4）      |
| 7   | `/teacher/live/:sessionId/report`                  | `TeacherLiveReportPage`      | `src/features/live/pages/teacher-live-report-page.tsx`（173 行）            | `.test.tsx`（166 行）            |
| —   | HUD 教師導覽列                                     | `HudCommandBar`              | `src/app/shell/hud-command-bar.tsx`（176 行）                               | `.test.tsx`（141 行，8 個 case） |

共用 shell/HUD/navigation/CSS：全部 7 route 共用同一個頂層 `AppShell`（`src/app/shell/app-shell.tsx`）與 `HudCommandBar`（`variant="teacher"`）。CSS token 權威來源是 `src/styles/tokens.css`（GGAME 三層 token），既有 `.teacher-*` namespace 已有 **69 個 selector**、`.sage-*` 已有 3 個 selector（`sage-page-header` 系列）。

各 route 現有 hooks／API 依賴（`grep ^import` + `use[A-Z]` confirmed）：

| Route                                              | Hooks（皆走 optional `repository?` injection seam，同 Phase 4A 模式）                                                                                                                |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/teacher`                                         | `useOwnedClassrooms`、`useTeacherClassroomSummary`                                                                                                                                   |
| `/teacher/analytics`                               | `useOwnedClassrooms`、`usePublishedChapters`、`useTeacherClassroomSummary`、`useTeacherLiveReport`、`useTeacherQuestionAnalysis`、`useTeacherSubtopicMastery`、`useTeacherSubtopics` |
| `/teacher/classes`                                 | `useOwnedClassrooms`、`useCreateClassroom`、`useStageWide`（**已使用**，見下方重大發現）                                                                                             |
| `/teacher/classes/:classroomId`                    | `useOwnedClassroomMembers`                                                                                                                                                           |
| `/teacher/classes/:classroomId/members/:memberRef` | `useStudentProgress`                                                                                                                                                                 |
| `/teacher/live`                                    | `useOwnedClassrooms`、`useCreateLiveActivity`、`useLaunchLiveSession`、`useLiveActivities`、`useLiveSectionOptions`                                                                  |
| `/teacher/live/:sessionId/report`                  | `useLiveSessionDetail`                                                                                                                                                               |

所有 teacher hooks（`use-classrooms.ts`／`use-teacher-content.ts`／`use-live-commands.ts`）與頁面元件本身，都已支援 optional `repository?: XxxRepository` prop 注入（`teacher-classrooms-page.tsx:67-69`、`teacher-dashboard-page.tsx:60-66` 等逐一確認），與 Phase 4A `chapter-detail-page.tsx` 相同的 DI seam——這代表 Task 5 的 dev-only Chromium harness不需要新增抽象，可直接沿用既有 seam。

### 重大盤點發現（修正 spec 表格部分「未套用/未處理」狀態）

實際讀碼發現以下項目與 spec 第 4 節標記的「未套用」或「未處理」不完全一致：

1. **HUD 教師導覽列（部分已完成、部分未完成）**：`hud-command-bar.tsx` **已完成**：`NavLink`（非 `Link`，`commandTabClassName`/`menuLinkClassName` 已算 `isActive`）、MENU 面板已用 `hidden={!menuOpen}` 恆掛 DOM、已有 `pointerdown` click-outside 監聽、開啟時 `menuPanelRef.current?.focus()`、Escape 關閉並回焦點到切換鈕。對應測試 `hud-command-bar.test.tsx` 的 8 個 case 逐一命中這些行為。**尚未完成**：面板開啟時 `Tab`／`Shift+Tab` 在面板內可聚焦元素循環的 **focus trap**——目前完全沒有這段邏輯，鍵盤使用者按 Tab 會跳出面板到頁面其他元素。**Task 1 因此包含一項精確、受限的新行為（focus trap），其餘為驗證 + 視覺套用，不是全新實作。**
2. **`/teacher/classes` 的 GamePager 分頁**（spec 標記「未套用」樣式，但分頁機制本身）：`teacher-classrooms-page.tsx:9,72,183,237` 已經 import 並渲染 `<GamePager>`、呼叫 `useStageWide()`。**分頁邏輯已存在，Task 2 只需要視覺套用（木牌卡樣式／票券化），不需要新增分頁機制。**

這個落差不影響 spec 允許範圍本身，但改變了各 task 的實際工作量與驗證重點。

## C. File Inventory（逐 task）

見下方 Task 1-5 各自的 **Files** 小節。跨 task 共用、統一列在此處：

**全域共用（多個 task 會碰）：**

- `src/styles/globals.css`（Modify，累加式——各 task 只新增自己 route 的區塊，不跨 task 互相修改既有規則）

**Forbidden modification paths（本 plan 全程，不限單一 task）：**

- `src/app/router/create-app-router.tsx`（Phase 5V 不需要新路由，也不需要改路由結構——spec 第 4 節唯一的導覽新增是「/teacher 補一個 Live 連結」，屬頁面內 `<Link>`／`<NavLink>` 新增，不動路由設定本身）
- `src/features/live/pages/teacher-live-session-page.tsx`（LivePresenter，Explicit Exclusion）
- 任何 `*repository.ts`（RPC 呼叫層）
- 任何 `*hooks/use-*.ts` 的 query/mutation **定義**本身（可以「使用」既有 hook，不能新增或修改 hook 的查詢邏輯、queryKey、mutation 邏輯）
- 任何 API/RPC client 層
- `supabase/**`（schema、migration、RLS、Edge Function）
- `.claude/`、`.codex/`（與本 slice 無關）

**Phase 1／Phase 4A overlap 標記**：見 D 節「Phase 1 Overlap Audit」逐檔說明。

## D. Phase 1 Overlap Audit

Phase 1（`phase1/admin-security-impl`，唯讀重新確認 tip 仍為 `def3fc9`，與上一輪盤點相同）與 `feature/v2-major-update` 的 merge-base 是 `2295fd6`。`git diff 2295fd6..def3fc9 -- src/` 共 63 個檔案，與 Phase 5V 計畫觸碰路徑交叉比對（已查證的寫為事實，未查證的標為 unknown ownership reason，不使用推測性字眼）：

| 檔案                                                                                                                                                                                                                                                                                                                                                                                               | 分類                                        | 說明與因應                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/app/shell/hud-command-bar.tsx`                                                                                                                                                                                                                                                                                                                                                                | **Exact overlap**                           | 事實：Phase 1 diff 列表中確實包含這個檔案。Phase 1 具體改了什麼——**unknown ownership reason**（未查證，本 plan 不猜測是新增 admin variant 或其他原因）。**因應**：Task 1 對這個檔案的改動（含 focus trap 新邏輯）限定在既有 `useEffect`／`onKeyDown` 區塊內擴充，不重構其他 handler／state，把 diff 面積壓到最小，降低 Phase 1 未來 merge 時的文字衝突機率。 |
| `src/app/shell/app-shell.tsx`                                                                                                                                                                                                                                                                                                                                                                      | **Exact overlap**                           | 事實：Phase 1 diff 列表中確實包含這個檔案。具體改動內容——**unknown ownership reason**。**因應**：Phase 5V 確認不需要修改 `app-shell.tsx` 本身——教師視覺差異透過頁面/HUD 內部的 `.teacher-*` class 完成。若任一 task 執行時發現真的需要 shell 層改動，立即停止該項、標記需要與 Phase 1 協調時序，不得自行擴權。                                               |
| `src/features/classrooms/pages/teacher-classroom-detail-page.test.tsx`                                                                                                                                                                                                                                                                                                                             | **Exact overlap**                           | 事實：Phase 1 diff 列表中包含這個測試檔，但**不**包含同名的 `.tsx` 頁面本體。具體改動內容——**unknown ownership reason**（可能是 auth mock 調整，未查證，不當作事實陳述）。**因應**：由 **Task 3 單獨承擔**這個 overlap，只新增/調整視覺相關 assertion，不觸碰既有的 mock 設置區塊；commit message 註明此已知重疊。                                           |
| `src/styles/globals.css`                                                                                                                                                                                                                                                                                                                                                                           | **Exact overlap（三方熱點）**               | 事實：Phase 1、Phase 4A（已合併）、Phase 5V 都會/已經修改這個檔案。**因應**：見 F 節 CSS Containment Strategy。                                                                                                                                                                                                                                              |
| `src/app/router/create-app-router.tsx`                                                                                                                                                                                                                                                                                                                                                             | Shared parent／module overlap（風險已排除） | 事實：Phase 1 diff 列表中包含這個檔案。Phase 5V 確認不需要修改路由設定（見 C 節 forbidden paths），此檔案對 Phase 5V 是零風險。                                                                                                                                                                                                                              |
| `src/features/auth/pages/login-page.tsx`／`register-page.tsx`、`src/features/inventory/pages/shop-page.tsx`、`src/features/learning/api/mastery-repository.test.ts`、`src/features/learning/hooks/use-mastery.test.tsx`、`src/types/database.ts`、`src/admin-browser-catalog.d.ts`、`src/deployment-environment.d.ts`、`src/lib/config/deployment-environment.ts`、`src/features/admin/**`（全部） | No overlap                                  | 不在 Phase 5V 的 7 route + HUD 範圍內，與本 slice 無交集。                                                                                                                                                                                                                                                                                                   |

**CSS selector/token overlap**：Phase 4A（已合併）使用 `.chapter-*` namespace，與 Phase 5V 的 `.teacher-*`／`.sage-*`／既有 `.hud-*` 完全不同 namespace，**no overlap**。Phase 1 admin shell 的 CSS namespace——**unknown ownership reason**（未查證是否為 `.admin-*`）。

**implementation 開始前的義務**：任一 task 開始前，需重新唯讀確認 Phase 1 當時的最新 tip 與 overlap 結果；若 tip 已改變，只更新本節 inventory 文字，不修改 Phase 1 worktree。

**未使用 Local Supabase，未修改 Phase 1 worktree**——本節全部是唯讀 `git diff` 比對。

## E. Behavior-Preservation Matrix

| API/query/mutation/handler                                                                                                                                                           | 狀態                                                                         | 說明                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `useOwnedClassrooms`、`useTeacherClassroomSummary`、`useTeacherLiveReport`、`useTeacherQuestionAnalysis`、`useTeacherSubtopicMastery`、`useTeacherSubtopics`、`usePublishedChapters` | **untouched**                                                                | 查詢邏輯、queryKey、repository 介面完全不動                                            |
| `useOwnedClassroomMembers`、`useStudentProgress`                                                                                                                                     | **untouched**                                                                | 同上                                                                                   |
| `useCreateClassroom`                                                                                                                                                                 | **untouched**（mutation 邏輯不動）；表單 UI 為 **presentation wrapper only** | 送出流程、驗證 schema（zod）不變；RTL 需新增/保留 repository-call assertion（見 H 節） |
| `useCreateLiveActivity`、`useLaunchLiveSession`、`useLiveActivities`、`useLiveSectionOptions`                                                                                        | **untouched**                                                                | `/teacher/live` 表單邏輯零變更；RTL 需新增/保留 repository-call assertion（見 H 節）   |
| `useLiveSessionDetail`                                                                                                                                                               | **untouched**；報表渲染為 **presentation wrapper only**                      | 只加前三名獎牌符號，表格資料與排序邏輯不動                                             |
| GamePager 分頁狀態（`teacher-classrooms-page.tsx` 既有）                                                                                                                             | **client-only interaction adjustment**（視覺only，機制不動）                 | 已存在的分頁機制保留，只換卡片樣式                                                     |
| HUD `menuOpen`／click-outside／focus/Escape 邏輯                                                                                                                                     | **untouched**                                                                | 邏輯已完整實作且通過測試，不重寫                                                       |
| HUD `Tab`／`Shift+Tab` focus trap                                                                                                                                                    | **新增行為**（見 Task 1）                                                    | 目前不存在，是本 plan 唯一被明確允許新增互動邏輯的項目                                 |
| 任何後端聚合統計（如「課堂/課後統計欄位」「Live 參與紀錄」）                                                                                                                         | **explicitly deferred to 5F**                                                | spec 第 5 節 Explicit Exclusion 明文排除，不得設計假資料填補                           |

## F. CSS Containment Strategy

1. **Teacher-specific namespace**：延續既有 `.teacher-*`（69 個既有 selector）與 `.sage-*`（page-header 系列）慣例。新規則一律以 `.teacher-` 或既有元件根 class 為前綴。
2. **避免污染 Phase 4A chapter detail**：不得使用 `.chapter-` 前綴，也不得修改任何 `.chapter-*` 選取器。
3. **避免污染 admin shell**：不新增/修改任何 `.admin-*` 前綴選取器；`src/features/admin/components/admin-shell.tsx` 目前只存在於未合併的 `phase1/admin-security-impl` 分支（不在本次 checkout）。若 Task 1 需要動 `app-shell.tsx` 相關 class，先唯讀查閱 Phase 1 worktree 當時內容（不修改），必要時改用更窄的 selector。
4. **限制 globals.css 新增範圍**：每個 task 只新增一個有明確頭尾註解的區塊，插入位置緊鄰既有同 route 規則，不插入無關規則中間，不在檔尾另開大雜燴 override 區。
5. **是否抽 teacher-owned component/token**：不新增 token；可視需要抽出 1-2 個小型 presentational 元件（木牌卡、票券樣式加入碼），必須是既有元件重構，不是新的資料抽象。
6. **Mobile/desktop breakpoints**：沿用 `spec/07-ui-visual-system.md` 第 3 節（320 最小寬度、375×812、768×1024、≥1024 桌面最大內容寬 1280px）。
7. **Reduced-motion／focus-visible／color-independent state**：新增動畫需提供 `prefers-reduced-motion` 對應規則（若既有全域規則已覆蓋則不重複宣告）；focus-visible 對比 ≥3:1；狀態變化不得只靠顏色。

## G. Task Seams（5 tasks）

### Task 1：HUD／Teacher Dashboard

**目的**：驗證 HUD 既有互動行為（NavLink/active/hidden/click-outside/開啟時聚焦/Escape）不回歸；**新增** Tab/Shift+Tab focus trap（TDD）；套用 pixel/night 視覺語彙；補齊 `/teacher` 缺少的 Live 快捷連結。

**Files：**

- Modify：`src/app/shell/hud-command-bar.tsx`——視覺 className 增補；**新增**一項精確受限的行為：在既有 `menuOpen` 時掛載的 `onKeyDown` 監聽（目前只處理 `Escape`）內，新增 `Tab` 分支：面板開啟時攔截 `Tab`／`Shift+Tab`，焦點只在面板內可聚焦元素（`menuPanelRef` 底下的 nav links + 登出按鈕）循環；`menuOpen=false` 時完全不掛載這段攔截（沿用既有「`if (!menuOpen) return`」提早退出模式，不需要額外的開關邏輯）。不重構其他既有 handler/state。
- Modify：`src/app/shell/hud-command-bar.test.tsx`——新增 focus-trap 測試 + 視覺 class 斷言，不刪除既有 8 個 case。
- Modify：`src/features/teacher-content/pages/teacher-dashboard-page.tsx`（新增一個 `<Link>`／`<NavLink>` 到 Live，client-only navigation）
- Modify：`src/features/teacher-content/pages/teacher-dashboard-page.test.tsx`
- Modify：`src/styles/globals.css`

**行為邊界**：允許新增的邏輯**僅限** Tab/Shift+Tab 攔截與循環；不得修改 `menuOpen` state 本身、`pointerdown` 監聽、Escape 處理、既有 `useEffect` 的依賴陣列或既有分支。

**TDD 測試contract（本輪只寫入 plan，不實際寫測試/程式碼）**：

- `Tab` 從面板內最後一個可聚焦元素觸發時，焦點回到第一個可聚焦元素。
- `Shift+Tab` 從第一個可聚焦元素觸發時，焦點回到最後一個。
- MENU 關閉時，`Tab` 不被攔截（正常瀏覽器 tab order）。
- `Escape` 關閉後焦點回到 MENU 切換鈕（既有行為，需確認不回歸）。
- 既有 teacher/student HUD 測試（8 個 case）全數不回歸。

**對應 AC**：AC-UI-004（HUD 按鈕觸控 ≥44px）、AC-UI-015（focus-visible、pending/選取狀態可辨識）。

**Scoped validation**：`pnpm typecheck`；`npx eslint <本 task 修改檔案>`；`npx vitest run src/app/shell/hud-command-bar.test.tsx src/features/teacher-content/pages/teacher-dashboard-page.test.tsx`；`npx prettier --check <本 task 修改檔案>`；`git diff --check`。

**Commit boundary**：單一 commit，涵蓋上述全部檔案。

### Task 2：Analytics／Classes List

**目的**：`/teacher/analytics` 套用標題列語彙、嚴重度符號、表格外層框線、篩選器 client-side 互動優化；`/teacher/classes` 班級卡改木牌卡樣式、既有 GamePager 分頁視覺套用、加入碼票券化視覺。

**Files：**

- Modify：`src/features/teacher-content/pages/teacher-analytics-page.tsx`（**表格內距/欄寬/字級不動**）
- Modify：`src/features/teacher-content/pages/teacher-analytics-page.test.tsx`
- Modify：`src/features/classrooms/pages/teacher-classrooms-page.tsx`（卡片視覺、加入碼視覺；GamePager 呼叫方式不動）
- Modify：`src/features/classrooms/pages/teacher-classrooms-page.test.tsx`——需新增/保留 `useCreateClassroom` 的 repository-call assertion（見 H 節）
- Modify：`src/styles/globals.css`

**行為邊界**：hook 呼叫方式不動；篩選器互動優化僅限既有篩選狀態的前端呈現改善，不得新增查詢參數。

**對應 AC**：AC-UI-008、AC-UI-004、AC-UI-013。

**Scoped validation**：同 Task 1 模式，命令對應本 task 檔案。

**Commit boundary**：單一 commit。

### Task 3：Classroom Detail／Student Progress

**目的**：套用視覺語彙到 2 個路由，明確不新增任何統計欄位。**單獨承擔**與 Phase 1 的 `teacher-classroom-detail-page.test.tsx` exact overlap。

**Files：**

- Modify：`src/features/classrooms/pages/teacher-classroom-detail-page.tsx`（頁首識別牌樣式、成員數/加入碼徽章化；表格不動）
- Modify：`src/features/classrooms/pages/teacher-classroom-detail-page.test.tsx`（**Phase 1 overlap**——只新增視覺斷言，不動既有 mock 設置區塊，commit message 註明重疊）
- Modify：`src/features/classrooms/pages/teacher-student-progress-page.tsx`（標題列語彙統一、既有內容視覺細化；**不新增 Live 參與紀錄或統計欄位**）
- Modify：`src/features/classrooms/pages/teacher-student-progress-page.test.tsx`
- Modify：`src/styles/globals.css`

**行為邊界**：`useOwnedClassroomMembers`／`useStudentProgress` 呼叫方式與資料流不動。

**對應 AC**：AC-UI-004、AC-UI-008。

**Scoped validation**：同 Task 1 模式。

**Commit boundary**：單一 commit。

### Task 4：Live Create／Live Report

**目的**：`/teacher/live` 表單卡改召集令語彙（欄位/流程/送出邏輯零變更）；`/teacher/live/:sessionId/report` 前三名獎牌符號（表格不動）。**負責新增** `teacher-live-page.test.tsx`（目前無測試）。

**Files：**

- Modify：`src/features/live/pages/teacher-live-page.tsx`
- Create：`src/features/live/pages/teacher-live-page.test.tsx`——基礎渲染 + 表單送出行為測試，比照其他 teacher page test 檔案既有 `repositoryWith`/fixture 寫法；需含 `useCreateLiveActivity`／`useLaunchLiveSession` 的 repository-call assertion（見 H 節）
- Modify：`src/features/live/pages/teacher-live-report-page.tsx`（表格不動）
- Modify：`src/features/live/pages/teacher-live-report-page.test.tsx`
- Modify：`src/styles/globals.css`

**行為邊界**：`useCreateLiveActivity`／`useLaunchLiveSession`／`useLiveActivities`／`useLiveSectionOptions`／`useLiveSessionDetail` 呼叫方式與資料流全部不動。

**對應 AC**：AC-UI-013（獎牌符號需可辨識、不得只靠顏色）、AC-UI-004、AC-UI-011（若 `/teacher/live` 表單有 Dialog/確認互動，需符合明確關閉規則——實作時重新確認是否存在）。

**Scoped validation**：`pnpm typecheck`；scoped `eslint`；`npx vitest run src/features/live/pages/teacher-live-page.test.tsx src/features/live/pages/teacher-live-report-page.test.tsx`；scoped `prettier --check`；`git diff --check`。

**Commit boundary**：單一 commit，涵蓋上述全部檔案。

### Task 5：Responsive／Focus／A11y／Chromium Harness

**目的**：跨 7 route + HUD 的斷點、鍵盤、focus、console 錯誤驗證，建立可重複執行的 dev-only Chromium 驗證基礎設施。

**Files：**

- Create：`src/features/teacher-content/pages/teacher-routes.harness.tsx`（dev/test-only；見 I 節組裝契約）
- Create：`dev-harness/teacher-routes.html`、`dev-harness/teacher-routes.main.tsx`
- Create：`playwright.teacher-routes-harness.config.ts`（見下方固定 port 規格）
- Create：`tests/e2e/teacher-routes.harness.spec.ts`
- **tsconfig.app.json：no change**——已唯讀確認 `"include": ["src", "dev-harness"]` 已涵蓋新的 `dev-harness/*` 檔案，不需修改。
- **tsconfig.node.json：Modify**——已唯讀確認 `"include"` 目前只明列 `playwright.config.ts`／`playwright.chapter-detail-harness.config.ts` 兩個具體檔名，需新增一行 `"playwright.teacher-routes-harness.config.ts"`。

**行為邊界**：純驗證基礎設施，不改動 Task 1-4 已完成的產品程式碼。

**正式 AC mapping**：AC-UI-004、AC-UI-015。**Scoped quality checks（非正式 AC，見 J 節）**：320px 無水平 overflow、console/page error 為 0。

**Scoped validation**：`pnpm typecheck`；scoped `eslint`；scoped `prettier --check`；`git diff --check`；**一次** `npx playwright test --config=playwright.teacher-routes-harness.config.ts`。

**Commit boundary**：單一 commit。

**明確排除**：不建立 acceptance evidence directory；不執行全域 E2E、`pnpm acceptance`、Supabase、Docker 或 hosted gate。

## H. Task-Level UI Surface Checks vs Deferred Production Network Parity

本節誠實區分「本輪能證明什麼」與「本輪不能證明什麼」，不是修改 spec，是避免 plan 暗示過度的保證。

**Task-level UI surface checks（本 plan 範圍內可執行）：**

- Forbidden modification paths 見 C 節（`*repository.ts`、hook 定義、API/RPC client、router、`supabase/**`）——全程禁止修改。
- 有 mutation 觸發互動的 route（Task 2 的 `useCreateClassroom`、Task 4 的 `useCreateLiveActivity`／`useLaunchLiveSession`），對應 RTL 測試需保留或新增 repository-call assertion：
  - 呼叫的 method 名稱不變。
  - 呼叫的 arguments/payload 形狀不變。
  - mutation 呼叫次數不變（不因視覺改動導致重複觸發）。
  - pending 狀態期間不造成重複提交（例如按鈕 disabled 狀態驗證）。
- Task 5 的 Chromium harness **可以**監聽 network request，但**只能宣稱**：「injected repository harness 沒有發出非 Vite/module asset 的意外請求」——這是 **harness isolation 證據**，不是 production network parity 證據，因為 harness 本身注入的是 fixture repository，不是真實 repository/hooks。

**Deferred Slice Gate（本輪不執行、不宣稱通過）：**

- 本輪完成邊界仍是 **「Teacher UI/UX Restyle task-level surface complete」**（見 M 節），不是 Slice Gate 通過。
- Spec 第 8／9 節要求的「逐路由 production network parity」（變更前後 network 請求完全一致）**尚未**在本 UI-only task 執行——這需要真實 hook/repository 接上真實或允許的 integration environment，超出本輪 dev-only harness 的能力範圍。
- 後續 Phase 5V Slice Gate 必須在**允許的 integration environment**中，比較變更前後每個 route 的 request method、URL、payload、次數，逐一确認零差異。
- 在這份 production network parity 證據完成前，**不得宣稱 Phase 5V Slice Gate 通過**，只能宣稱 task-level UI surface complete。

## I. Chromium Harness Assembly Contract

Task 5 的 harness 明確包含兩類 scenario：

**Route scenarios（7 個）：**

- 7 個教師頁面元件，各自經既有 `repository?` DI seam 注入 deterministic fixture repository。
- 不經過 `RequireAuth`、`RequireRole` 或真實 Supabase——直接掛載頁面元件本身（比照 Phase 4A `chapter-detail-page.harness.tsx` 模式）。

**HUD scenario（獨立於 route scenarios）：**

- 使用 `MemoryRouter` 包裹，掛載 `HudCommandBar`，`variant="teacher"`。
- 提供 deterministic `displayName`、`onSignOut` spy（無需真實登出邏輯）。
- 可透過 `MemoryRouter` 的 `initialEntries` 指定目前 route，驗證對應 top tab 與 MENU 內連結的 active state。
- 驗證：MENU 開啟時的初始 focus、`Tab`/`Shift+Tab` focus trap（見 Task 1 TDD contract）、`Escape` 關閉並回焦點、click-outside 關閉。
- **不需要**掛載完整 `AppShell`——`HudCommandBar` 是獨立元件，直接掛載即可，比照既有 `hud-command-bar.test.tsx` 的做法（該檔案本身就是只用 `MemoryRouter` 包裹，不掛 `AppShell`）。

**Chromium config（固定，不得使用共用/既有 Phase 4A port）：**

```ts
use: { baseURL: 'http://localhost:4177' },
webServer: {
  command: 'npx vite --host localhost --port 4177 --strictPort',
  url: 'http://localhost:4177/dev-harness/teacher-routes.html?scenario=...',
  reuseExistingServer: false,
  timeout: 60_000,
},
```

不得使用 `4173`（共用 `playwright.config.ts` 的 production preview port）或 `4176`（Phase 4A harness 已佔用的 port），也不得修改共用 `playwright.config.ts`。

## J. Existing AC Mapping（正式）與 Scoped Quality Checks（非正式）

**正式 Existing AC Mapping**（僅 spec 第 7 節已核准項目，逐 task 標注適用情形見 G 節）：

- AC-UI-004（Touch target）
- AC-UI-008（扁平化設計與視覺降載）
- AC-UI-011（Dialog 明確關閉與提示一致）
- AC-UI-013（圖示隱喻與教育情境一致）
- AC-UI-015（點選、Focus、Pending 與錯誤狀態可辨識）

**Scoped quality checks（非正式 AC mapping，只是 Task 5 harness 的品質檢查項，不宣稱是 AC-UI-003／AC-UI-007，spec 未核准這兩個編號用於本文件）：**

- 320px 無水平 overflow。
- Console/page error 為 0。

## K. Review Policy

- Plan 完成後由 **Codex 做一次 plan review**——本輪即為該次 review 的 remediation，修正完成後**不再進行第二輪 review**。
- Implementation（Task 1-5）全部完成且 scoped checks 全綠後，**只能使用一位 effective reviewer、一次往返**：hook、Codex plugin、單一 reviewer sub-agent、self-review fallback 四選一，不得混用或平行使用。
- **禁止平行 Standards/Spec 兩個 reviewer sub-agent 同時啟動**（吸取先前 Phase 4A round 的教訓，已在 `docs/handoff.md` 更正記錄）。
- Review 後不得啟動第二輪 reviewer；有 findings 就修復後只重跑受影響的 scoped validation。

## L. Worktree Strategy

Plan 核准並 commit 後才建立（本輪不執行）：

- Branch：`phase5v/teacher-ui-ux-restyle`
- Worktree：`.worktrees/phase5v-teacher-ui-ux-restyle`
- Base：當時經確認的 `feature/v2-major-update` tip（建立前需重新 `git rev-parse` 確認）

## M. Completion Boundary

Phase 5V 完成只能宣稱：**「Teacher UI/UX Restyle task-level surface complete」**。

不得宣稱：Phase 5 完成、5F 完成、teacher functionality 全部完成、Production-ready、Phase 5V Slice Gate 通過（見 H 節 Deferred Slice Gate）。

## N. 明確排除（重申 spec 邊界）

- API/RPC 新增或修改。
- Supabase schema、migration、RLS、Edge Function。
- Server/domain state、計分、finalize、Live 主持流程。
- 新增教師統計資料契約。
- Mock/fake data 冒充正式功能——若視覺需求需要目前後端沒有的資料，標記為 deferred integration，不設計假資料填補（本計畫目前未發現任何此類需求；若執行中發現，立即停止該項並記錄移交 5F）。
- `/teacher/live/:sessionId`（LivePresenter）與 5F 的其他 functional scope。
- 2A/3A 尚未完成的功能重新實作。
