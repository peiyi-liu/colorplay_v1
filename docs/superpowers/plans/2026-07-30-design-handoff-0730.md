# 0730 設計交付落地批 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 依 owner 0730 設計稿（學生端／教師端／帳號入口 .dc.html）＋ 14 項文字規格，更新 ColorPlay 全站頁面並逐頁核對一致。

**Architecture:** 純前端批次（無 migration）。色彩改 `src/styles/tokens.css`（唯一色彩定義點）＋ `tokens.test.ts` 釘值同步；版面改 `globals.css`；行為改各 feature 頁面元件；路由縮減改 `create-app-router.tsx`。資料真實性問題定位為前端跨帳號 React Query 快取殘留，修 `clearUserScopedQueries`。

**Tech Stack:** React + TS + Vite、CSS tokens、Vitest + RTL、design-audit 截圖 runner。

## Global Constraints

- 14 項文字規格與設計稿衝突時，**以文字規格為準**（文字是較晚的裁定）。
- tokens.css 是唯一色彩定義點；元件不得出現裸 hex；改色必同步 `tokens.test.ts` 釘值。
- 前端不可信邊界不動：不新增任何前端計分／資料決定邏輯。
- 每 task：受影響 lint/typecheck/unit 測試綠即完成；整批最後一次 review＋design-audit 截圖核對。
- UI 文案繁中、identifiers 英文。

---

### Task 1（項2＋項10）：頁底奶黃＋LEVEL 進度條暖黃

**Files:** Modify `src/styles/tokens.css`、`src/styles/tokens.test.ts`、`src/styles/globals.css:181-185`

- [ ] tokens.css:`--surface-page: var(--paper)` → `--surface-page: #faf5e2;`（上一版奶黃，卡片維持 `--paper: #ffffff` 白）
- [ ] tokens.test.ts 釘值同步（surface-page 相關斷言改 `#faf5e2`）
- [ ] globals.css `.economy-summary__level progress` 的 `accent-color: var(--color-accent)` → `var(--yellow-brand)`
- [ ] Run: `pnpm vitest run src/styles/tokens.test.ts` → PASS

### Task 2（項13）：brand icon 紅綠藍

**Files:** Modify `src/app/shell/app-shell.tsx:87-103`；grep 全站其他 brand mark（auth 頁）同步

- [ ] 三圓改：cx11 `var(--coral-700)`、cx21 `var(--cobalt-600)` fillOpacity .92、cx16/cy20 `var(--jade-600)` fillOpacity .92（對齊設計稿）
- [ ] `grep -rn "hue-ch1\|hue-ch5" src --include="*.tsx"` 找出其餘品牌圓點（login/register auth-portal-brand）一併改
- [ ] Run: `pnpm vitest run src/app/shell` → PASS

### Task 3（項14）：移除未用頁面

**Files:** Modify `src/app/router/create-app-router.tsx`、`src/features/classrooms/pages/teacher-classroom-detail-page.tsx:52-63`、`src/features/live/pages/teacher-live-session-page.tsx`、`src/features/teacher-content/pages/teacher-analytics-page.tsx`（作業總覽區塊）、`scripts/design-audit/capture-screens.mjs`；Delete 頁面檔＋對應 test：`join-classroom-route`、`profile-foundation-page`、`student-assignments-page`、`student-assignment-detail-page`、`teacher-import-wizard-page`、`teacher-content-workspace-page`、`teacher-classroom-progress-page`、`teacher-assignments-page`

- [ ] Router 移除 8 條路由與 import：`/join/:joinCode`、`/app/profile`、`/app/assignments`（×2）、`/teacher/import`、`/teacher/content`、`/teacher/classes/:id/progress`、`/teacher/classes/:id/assignments`
- [ ] 班級成員頁 header 移除「作業管理」「學習進度」兩個 secondary-action 連結
- [ ] Live 主持台只留投影：`TeacherLiveSessionPage` 一律 render `LivePresenter`（去 host console UI／投影模式切換鈕），`onExit`→`navigate('/teacher/live')`；取消流程沿用 LivePresenter 內建確認
- [ ] 教學分析頁移除「作業總覽」區塊（班級作業功能停做）
- [ ] 保留 `profile` hooks（shell 用 useMyProfile）；只刪頁面檔。刪檔前 grep 引用確認孤立
- [ ] capture-screens.mjs 移除對應 screens
- [ ] Run: `pnpm vitest run src/app/router src/features/live src/features/classrooms src/features/teacher-content` → PASS（router/app-shell 測試同步更新）

### Task 4（項1）：錯題「（已解決）」移除

**Files:** Modify `src/features/learning/pages/mistakes-page.tsx:144`、`mistakes-page.test.tsx`

- [ ] `{mistake.prompt}（已解決）` → `{mistake.prompt}`；同步測試斷言
- [ ] Run: `pnpm vitest run src/features/learning/pages/mistakes-page.test.tsx` → PASS

### Task 5（項3）：大廳四格統計置中＋合併長條樣式

**Files:** Modify `src/styles/globals.css`（`.pastel-summary__stats`/`.pastel-summary__stat`）

- [ ] 對齊設計稿：stats 容器 flex nowrap、1px `--pastel-summary-border`、radius 12、漸層底；cell 無自框、左分隔線、`text-align: center`（dt 與 dd）
- [ ] Run: `pnpm vitest run src/features/learning/components` → PASS（無 DOM 變更，樣式為主）

### Task 6（項4）：章節複習標題完整＋送出答案淺色

**Files:** Modify `src/features/learning/pages/chapter-detail-page.tsx:269`、`chapter-detail-page.test.tsx`、`src/styles/globals.css`

- [ ] h1 改 `Chapter {chapter.sortOrder}：{chapter.title}`（同大廳卡片格式）
- [ ] globals.css 新增 `.question-card__action .primary-action`：bg `var(--amber-highlight-soft)`、color `var(--pastel-cta-contrast)`、border 1px `var(--yellow-brand)`（quiz 與 mission 共用）
- [ ] Run: `pnpm vitest run src/features/learning/pages/chapter-detail-page.test.tsx src/features/quiz` → PASS

### Task 7（項5）：任務實戰小節分節完整標題

**Files:** Modify `src/features/learning/api/chapters.ts`（新增 `subtopicTitles`）、`mission-page.tsx`（MissionSelectPage 列表）、對應 tests

- [ ] chapters API：collect 完整小節標題（含「3-1 」前綴、有題目者、numeric 排序），型別加 `subtopicTitles: readonly string[]`
- [ ] MissionSelectPage：每章節卡內逐行列出完整小節標題（分節列表），保留章級「展開小節任務」按鈕（`start_mastery_session` 為章級 RPC，不動後端）
- [ ] Run: `pnpm vitest run src/features/learning` → PASS

### Task 8（項6）：排行榜頭像對齊大廳圓形樣式

**Files:** Modify `src/features/leaderboard/components/leaderboard-table.tsx`、`src/styles/globals.css`、leaderboard tests

- [ ] 三欄制：名次｜暱稱（圓形頭像＋displayName＋這是你）｜XP；頭像用 `pastel-summary__avatar` 同款圓形、外框漸層改為「圓形漸層底」呈現（同大廳），移除方形 borderImage 章與 Blook 名稱欄
- [ ] CSS：`.leaderboard-blook { display:flex; align-items:center; gap:10px }`、縮版頭像 40px／BlookArt 30
- [ ] SelfRankCard 同步同款頭像
- [ ] Run: `pnpm vitest run src/features/leaderboard` → PASS

### Task 9（項7＋項8）：任務實戰作答對齊 quiz＋回饋行距

**Files:** Modify `src/features/learning/pages/mission-page.tsx`、`mission-page.test.tsx`、`src/styles/globals.css`

- [ ] MissionPage 作答區改 question-card 型式：radio 選項（鎖定選項 disabled＋data-locked）＋「送出答案」submit（沿用 Task 6 淺色樣式）；保留提示層與鎖定機制、答對回饋卡＋下一關流程
- [ ] 回饋卡行距：`.feedback-card .live-explanation` 與後續按鈕間距加大（margin-block ≥ var(--space-4)）
- [ ] Run: `pnpm vitest run src/features/learning/pages/mission-page.test.tsx` → PASS

### Task 10（項9）：Blook 尖耳圓潤化

**Files:** Modify `src/components/ui/blook-art.tsx`

- [ ] fox／cat／owl／tiger／wolf／dragon 的耳（角）path 加同色 `stroke`＋`strokeWidth 3.4`＋`strokeLinejoin round`（設計稿技法）；lucky_cat 保留紅色內描線
- [ ] Run: `pnpm vitest run src/components` → PASS

### Task 11（項11）：Live 投影選項放大

**Files:** Modify `src/styles/globals.css:4123-4160`

- [ ] `.live-presenter__options` gap → 20px；`.live-presenter__option` min-height 128px、font-size 2rem、padding 28px 32px（設計稿值）；≤720px 維持單欄
- [ ] Run: `pnpm vitest run src/features/live` → PASS

### Task 12（項12）：跨帳號快取殘留修正

**Files:** Modify `src/features/auth/context/auth-context.tsx`、auth 測試

- [ ] `clearUserScopedQueries` 改為清除**全部** query cache（cancel＋removeQueries 無 predicate）；刪 `isUserScopedQuery`。公開目錄資料重抓成本可接受，換得換帳號零殘留（achievements/leaderboard/classrooms/learning/mastery/live/teacher-content 原本全數漏清）
- [ ] 同步單元測試：斷言換帳號後所有 scope 均被移除
- [ ] Run: `pnpm vitest run src/features/auth` → PASS

### Task 13：全站驗證與出貨

- [ ] `pnpm lint && pnpm typecheck && pnpm test`
- [ ] design-audit runner 全頁截圖，逐頁對照設計稿與 14 項規格
- [ ] 一輪 code review（colorplay:code-review 或自查 diff）
- [ ] commit（分項或單批皆可，訊息含 owner 0730 裁定）→ push main → Vercel READY 確認

## Self-Review

- 覆蓋檢查：14 項全對應（項2→T1、項10→T1、項13→T2、項14→T3、項1→T4、項3→T5、項4→T6、項5→T7、項6→T8、項7/8→T9、項9→T10、項11→T11、項12→T12）。
- 項12 之「其餘數據皆實際數值」：探勘已確認各頁數字均來自伺服器 RPC／查詢（economy/leaderboard/analytics），app 程式碼無硬編數據；示範數字僅存在於設計稿與截圖 runner fixtures，不進正式頁面。報告中說明。
- 型別一致：`subtopicTitles` 只新增於 chapters API 與 MissionSelectPage 消費端。
