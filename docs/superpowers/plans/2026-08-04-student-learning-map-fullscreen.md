# Student Learning Map Fullscreen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將學生精確路由 `/app` 實作成 owner 核准的全螢幕 JRPG 森林王國村：App Shell 左上精簡 HUD、上緣中央卷軸、右上既有導覽、六棟依 1200×800 世界座標落地的建築、吊掛木牌與獨立狀態徽章、底部章節對話框，以及直向可關閉旋轉提示加地圖內平移。

**Architecture:** 保留 `AppShell` 作為 inventory/economy 的唯一消費點，使用 `useLocation().pathname === '/app'` 切換純版面 class；`LobbyPage` 只取得 server-authoritative chapter map。地圖以單一 3:2 world layer 承載背景與所有場景物件，座標由純資料模組換算為百分比；直向平移只改 viewport 的 `scrollLeft`，不改 query、不寫資料、不重繪整棵應用樹。

**Tech Stack:** React 19、TypeScript strict、React Router 7、TanStack Query、CSS variables、Vitest + Testing Library、Playwright、pnpm。

## Global Constraints

- 規格唯一依據：`docs/superpowers/specs/2026-08-04-student-learning-map-fullscreen-design.md`。若與舊 plan/spec 衝突，以本文件引用的新規格為準。
- 不改路由、RPC、Supabase schema/RLS、章節解鎖、計分、XP/Token、裝備寫入、教師端與 `LivePresenter`。
- `useStudentChapterMap` 仍是章節狀態唯一來源；App Shell 既有 `useBlookInventory`、`useEconomySummary` 各維持一次，不得在 `LobbyPage` 或 `ChapterMap` 再消費。
- `HudCommandBar` 的文字、NavLink、`hidden`、`aria-controls`、click-outside、開啟焦點、Escape 回 toggle、登出機制零改動；本批只以祖先 class 改其位置。
- 不刪除通用 `StudentSummaryCard` 或其共用樣式，只從 `LobbyPage` 移除 import/render 與 `.hud-bar` 包裝。
- 不增加第二張地圖背景，不修改既有壓縮素材；scroll、木牌、徽章、鏈條、glow 以 semantic HTML/CSS 與既有 `Icon` 實作。
- 保護既有未提交 WIP：`tests/e2e/chapter-select.spec.ts`、`tests/e2e/helpers/quiz.ts`、`tests/e2e/learning-experience.spec.ts`。不得覆蓋、stash、stage 或把其 diff 計入本批 commit。
- 每個 task 先寫會因缺少該行為而失敗的測試，再做最小實作；不得使用 force click、synthetic dispatch、隱藏跳轉或 blind keyboard workaround。
- 每個 task 前後執行 `git status --short`；只逐檔 stage；不得 `git add -A`。commit 用各 task 專屬的 `/tmp/colorplay-learning-map-task-N-commit.txt`（N 代入當前 task 數字）搭配 `git commit -F`，尾行沿用 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`。
- 每個 task commit 前跑該 task Step 列出的 `pnpm exec prettier --check`、相關 Vitest、`pnpm typecheck`、`pnpm lint`；不得停用 hooks，不改 `package.json`、`eslint.config.js`。
- 日常 task 不生成正式 phase evidence；Task 5 才執行一次 browser/phase gate。真實裝置仍列人工驗證，不以 headless viewport 冒充。

---

### Task 1: Add the exact-route App Shell map mode and remove duplicate student summary data

**Files:**

- Modify: `src/app/shell/app-shell.tsx:1-178`
- Modify: `src/app/shell/app-shell.test.tsx:44-51, 96-357`
- Create: `src/features/learning/context/student-map-shell-context.ts`
- Modify: `src/features/rewards/components/economy-summary.tsx:1-26`
- Modify: `src/features/rewards/components/economy-summary.test.tsx`
- Modify: `src/features/learning/pages/lobby-page.tsx:1-55`
- Modify: `src/features/learning/pages/lobby-page.test.tsx:1-160`
- Modify: `src/features/learning/components/chapter-map.tsx:1-95`
- Modify: `src/features/learning/components/chapter-map.test.tsx:1-146`
- Modify: `src/styles/globals.css:239-297, 7032-7060`

**Interface changes:**

```tsx
type EconomySummaryViewProps = Readonly<{
  summary: EconomySummary;
  variant?: 'default' | 'learning-map';
}>;

const isStudentLearningMap =
  isAuthenticatedProfile && !isTeacher && location.pathname === '/app';
```

`AppShell` 在 `isStudentLearningMap` 為真時，於 `.game-stage` 加 `.game-stage--learning-map`，並傳 `variant="learning-map"` 給同一份 economy view。query string 不影響判定；`/app/chapters/:id`、`/app/shop`、教師路由都不得套用。

- [ ] **Step 1: Write failing exact-route shell tests**

  在 `app-shell.test.tsx` 新增帶 child route 的 `createMemoryRouter` 測試，分別 render `/app?chapter=...` 與 `/app/shop`：

  ```tsx
  expect(stage).toHaveClass('game-stage--learning-map');
  expect(screen.getByRole('banner')).toContainElement(
    document.querySelector('.economy-summary--learning-map'),
  );
  expect(mockedUseEconomySummary).toHaveBeenCalledOnce();
  expect(mockedUseBlookInventory).toHaveBeenCalledOnce();
  ```

  對 `/app/shop` 斷言 class 與 map variant 都不存在，並重跑既有 MENU DOM/焦點測試，證明導覽機制未改。

- [ ] **Step 2: Write failing Lobby and economy presentation tests**

  - `lobby-page.test.tsx` 移除 `StudentSummaryCard` mock，將第一個測試改為 `queryByRole('region', { name: '學生資訊' })` 為 `null`；六棟建築、loading、error、retry、query selection 斷言全部保留。
  - `economy-summary.test.tsx` 增加 learning-map variant，逐字斷言 `Lv. 2`、`250 / 500 XP`、`250 Token`，且 default variant 仍顯示原本 `Level 2`。
  - `chapter-map.test.tsx` 移除 inventory mock，改由 `equippedBlook` prop 注入 `little_fox`；保留 equipped badge、六顆建築 button、selection 與 decorative image 測試。hook import absence留給 Step 7 的 source grep 驗證。

- [ ] **Step 3: Run RED tests and confirm the reasons**

  Run:

  ```bash
  pnpm exec vitest run \
    src/app/shell/app-shell.test.tsx \
    src/features/rewards/components/economy-summary.test.tsx \
    src/features/learning/pages/lobby-page.test.tsx \
    src/features/learning/components/chapter-map.test.tsx
  ```

  Expected: exact `/app` class、compact labels、summary removal 與 duplicate inventory removal 失敗；既有 loading/error/query tests 仍綠。

- [ ] **Step 4: Implement the exact-route shell mode**

  - 在 `AppShell` 引入 `useLocation`，只用 `location.pathname` 判定精確 `/app`。
  - `AuthenticatedEconomySummary` 接受 variant 並轉傳給 `EconomySummaryView`；不新增 hook。
  - `EconomySummaryView` 只在 map variant 使用 `Lv.` 與 modifier class；default markup/text 不變。
  - `.game-stage--learning-map` 在 landscape/desktop 將 `.hud-top` 定位到地圖左上、`.hud-command` 定位到右上，兩者保留原 DOM 順序與 z-index 關係；portrait 保留現有 flow/sticky command bar。
  - map HUD 約 `clamp(250px, 24vw, 304px)` × `clamp(58px, 6vw, 66px)`，只顯示 avatar、level、progress/XP 與 Token；用 `.game-stage--learning-map` descendant 覆寫，不污染其他路由。
  - Blook 圖以高度填滿正方形 avatar well、`max-width:none`、`left:50%/translateX(-50%)` 水平置中；fallback `hero.png` 套同一個方框裁切規則。

- [ ] **Step 5: Remove the page-level duplicate summary and share the shell-owned equipped Blook**

  - 從 `LobbyPage` 刪除 `StudentSummaryCard` import、`.hud-bar` 及 render。
  - 新增 `StudentMapShellContext`，只包含 `equippedBlook: BlookInventoryItem | null`。由 authenticated student shell 呼叫唯一一次 `useBlookInventory`，同一份結果同時提供左上 `StudentHudAvatar` 與 `<Outlet context={...}>`。
  - `LobbyPage` 透過 `useOutletContext` 讀取同一份 equipped Blook 並以 prop 傳給 `ChapterMap`；`ChapterMap` 刪除自己的 `useBlookInventory`，但保留 `.chapter-map__companion` 個人角色圖片與既有 fallback stable code，且不顯示「目前位置」文字。
  - 教師、anonymous/profile fallback 分支不得呼叫 inventory hook；既有 logged-out 單元測試必須維持綠。
  - 不刪通用 `student-summary-card.tsx`。

- [ ] **Step 6: Run GREEN tests and static checks**

  ```bash
  pnpm exec vitest run \
    src/app/shell/app-shell.test.tsx \
    src/app/shell/hud-command-bar.test.tsx \
    src/features/rewards/components/economy-summary.test.tsx \
    src/features/learning/pages/lobby-page.test.tsx \
    src/features/learning/components/chapter-map.test.tsx
  pnpm typecheck
  pnpm lint
  pnpm exec prettier --check \
    src/app/shell/app-shell.tsx \
    src/app/shell/app-shell.test.tsx \
    src/features/learning/context/student-map-shell-context.ts \
    src/features/rewards/components/economy-summary.tsx \
    src/features/rewards/components/economy-summary.test.tsx \
    src/features/learning/pages/lobby-page.tsx \
    src/features/learning/pages/lobby-page.test.tsx \
    src/features/learning/components/chapter-map.tsx \
    src/features/learning/components/chapter-map.test.tsx \
    src/styles/globals.css
  ```

- [ ] **Step 7: Review and commit only Task 1 files**

  Review `git diff -- src/app/shell/app-shell.tsx src/app/shell/app-shell.test.tsx src/features/learning/context/student-map-shell-context.ts src/features/rewards/components/economy-summary.tsx src/features/rewards/components/economy-summary.test.tsx src/features/learning/pages/lobby-page.tsx src/features/learning/pages/lobby-page.test.tsx src/features/learning/components/chapter-map.tsx src/features/learning/components/chapter-map.test.tsx src/styles/globals.css`；確認 `HudCommandBar` 未改，protected WIP 未 stage。Commit subject:

  ```text
  feat(learning): add exact-route fullscreen map shell mode
  ```

---

### Task 2: Anchor every building to one 1200×800 world coordinate system

**Files:**

- Create: `src/features/learning/components/chapter-map-layout.ts`
- Create: `src/features/learning/components/chapter-map-layout.test.ts`
- Modify: `src/features/learning/components/chapter-map.tsx`
- Modify: `src/features/learning/components/chapter-map.test.tsx`
- Modify: `src/features/learning/components/chapter-map-building.tsx`
- Modify: `src/features/learning/components/chapter-map-building.test.tsx`
- Modify: `src/styles/globals.css:7090-7321, 7451-7546`

**World layout contract:**

```ts
export const CHAPTER_MAP_WORLD = { height: 800, width: 1200 } as const;

export type ChapterGroundAnchor = Readonly<{
  x: number;
  y: number;
  visualOffsetX: number;
  visualOffsetY: number;
}>;

export const CHAPTER_GROUND_ANCHORS: Readonly<
  Record<number, ChapterGroundAnchor>
> = {
  1: { x: 290, y: 298, visualOffsetX: 0, visualOffsetY: 0 },
  2: { x: 582, y: 282, visualOffsetX: 0, visualOffsetY: 0 },
  3: { x: 896, y: 298, visualOffsetX: 0, visualOffsetY: 0 },
  4: { x: 300, y: 575, visualOffsetX: 0, visualOffsetY: 0 },
  5: { x: 586, y: 620, visualOffsetX: 0, visualOffsetY: 0 },
  6: { x: 888, y: 575, visualOffsetX: 0, visualOffsetY: 0 },
};
```

`anchorStyle(anchor)` 回傳百分比 `left/top` 與 `--chapter-visual-offset-x/y`，百分比由上述 logical world 常數換算，不把數字散落 CSS。

- [ ] **Step 1: Write the failing pure layout contract**

  - 逐一斷言六個 exact `(x,y)`。
  - 斷言轉換後 Chapter 1 是 `24.166…% / 37.25%`、Chapter 6 是 `74% / 71.875%`。
  - 斷言 visual offset 絕對值不得超過 8 logical px；未知 sort order 明確 throw，不默默疊在 `(0,0)`。

- [ ] **Step 2: Write failing component structure tests**

  在 `chapter-map.test.tsx` 斷言：

  ```tsx
  const world = container.querySelector('.chapter-map__world');
  expect(world).toHaveAttribute('data-world-width', '1200');
  expect(world).toHaveAttribute('data-world-height', '800');
  expect(container.querySelector('.chapter-map__base')?.parentElement).toBe(
    world,
  );
  ```

  逐棟讀 `data-ground-x/y`，並確認背景、建築 list、雲、construction、冒險者都在同一 `.chapter-map__world`。刪除舊 3×2 grid 專用結構斷言。

- [ ] **Step 3: Run RED tests**

  ```bash
  pnpm exec vitest run \
    src/features/learning/components/chapter-map-layout.test.ts \
    src/features/learning/components/chapter-map.test.tsx \
    src/features/learning/components/chapter-map-building.test.tsx
  ```

  Expected: layout module 尚不存在、world metadata 與 ground anchors 尚未渲染。

- [ ] **Step 4: Implement the shared world layer**

  - `ChapterMap` DOM 改為 `.chapter-map__viewport > .chapter-map__world`；背景、`ol`、六棟建築、decorative adventurer 全置於 world。
  - world 固定 3:2 邏輯比例。landscape/desktop 以同一 world layer fit/cover；portrait 只放大 world 寬度供內部 pan，不另排 2×3、不改座標。
  - `ChapterMapBuilding` 接收 `anchor`，`li` 以 bottom-center contact point 絕對定位：元件本體使用 `transform: translate(-50%, -100%)`；木牌可往 anchor 下方延伸，但建築 PNG 的底部中心必須對準 anchor。
  - 將固定 adventurer 與保留的個人角色 companion 位置都改為同一 logical world 百分比；刪除 portrait 專用 2×3 grid 重排規則。

- [ ] **Step 5: Add coordinate-safe CSS**

  - `.chapter-map__world` 為唯一 `position:relative` 世界；`.chapter-map__base` 填滿它。
  - `.chapter-map__buildings` 改為 `position:absolute; inset:0`，不再 `display:grid`。
  - 每棟 `li` 由 inline `left/top` 對準 anchor；visual offset 只作用在 PNG visual wrapper，不改 ground anchor。
  - 用 CSS custom properties紀錄 `--chapter-anchor-x/y` 供 browser acceptance 讀取；禁止 viewport `%` 另算一套位置。

- [ ] **Step 6: Run GREEN tests and static checks**

  ```bash
  pnpm exec vitest run \
    src/features/learning/components/chapter-map-layout.test.ts \
    src/features/learning/components/chapter-map.test.tsx \
    src/features/learning/components/chapter-map-building.test.tsx
  pnpm typecheck
  pnpm lint
  pnpm exec prettier --check \
    src/features/learning/components/chapter-map-layout.ts \
    src/features/learning/components/chapter-map-layout.test.ts \
    src/features/learning/components/chapter-map.tsx \
    src/features/learning/components/chapter-map.test.tsx \
    src/features/learning/components/chapter-map-building.tsx \
    src/features/learning/components/chapter-map-building.test.tsx \
    src/styles/globals.css
  ```

- [ ] **Step 7: Review and commit only Task 2 files**

  特別 grep 確認舊 3×2 grid/portrait 2-column 規則已移除，六個 offset 均在 ±8。Commit subject:

  ```text
  feat(learning): anchor chapter buildings to the village world
  ```

---

### Task 3: Implement the refined scroll, hanging signs, state medals, glow, and JRPG dialogue

**Files:**

- Modify: `src/features/learning/pages/lobby-page.tsx`
- Modify: `src/features/learning/pages/lobby-page.test.tsx`
- Modify: `src/features/learning/components/chapter-map-building.tsx`
- Modify: `src/features/learning/components/chapter-map-building.test.tsx`
- Modify: `src/features/learning/components/chapter-map-panel.tsx`
- Modify: `src/features/learning/components/chapter-map-panel.test.tsx`
- Modify: `src/features/learning/components/chapter-map.test.tsx`
- Modify: `src/styles/globals.css:7062-7088, 7130-7429`

**State presentation mapping:**

| State                 | `Icon`  | Visible label | Scene overlay              | Entry link |
| --------------------- | ------- | ------------- | -------------------------- | ---------- |
| `completed`           | `check` | `已完成`      | none                       | yes        |
| `available`           | `star`  | `可進入`      | none                       | yes        |
| `locked`              | `lock`  | `未解鎖`      | `locked-cloud.png`         | no         |
| `content_unavailable` | `alert` | `內容準備中`  | `construction-overlay.png` | no         |

- [ ] **Step 1: Write failing scroll semantics tests**

  在 `lobby-page.test.tsx` 斷言唯一 `h1` 與三段核准字串逐字不漂移，且 header 有 `.chapter-map-scroll`：

  ```text
  學生端 · 森林王國村
  學習地圖
  選擇一棟建築，查看章節的複習、精熟度與解鎖條件。
  ```

  decorative roller/crest 元素全部 `aria-hidden="true"`，卷軸本身仍是 HTML，不用背景圖片承載文字。

- [ ] **Step 2: Write failing building state tests**

  - 木牌內只允許 `Chapter N` 與章節標題；狀態文字不得是木牌 descendant。
  - 四種 state 各有 `.chapter-map__status-medal` 與上表 exact label；`locked` 全面由「尚未解鎖」同步成 owner 核准的「未解鎖」。
  - `locked` cloud、`content_unavailable` construction 存在且 `aria-hidden`；completed 不再把 completion image 當狀態唯一表達。
  - selected 仍用 `aria-pressed=true` 與 `data-selected=true`；button accessible name 包含 chapter/title/state。

- [ ] **Step 3: Write failing compact dialogue tests**

  `chapter-map-panel.test.tsx` 驗證 `aria-live="polite"`、Chapter/access、title、複習數字、精熟度/80% 與 action。locked/unavailable 無 link；locked blockers 原安全語意逐字保留。刪除不是核准對話內容的 description 與「學習狀態」列斷言，使 dialogue 可在短橫向保持精簡。

- [ ] **Step 4: Run RED tests**

  ```bash
  pnpm exec vitest run \
    src/features/learning/pages/lobby-page.test.tsx \
    src/features/learning/components/chapter-map-building.test.tsx \
    src/features/learning/components/chapter-map-panel.test.tsx \
    src/features/learning/components/chapter-map.test.tsx
  ```

  Expected: scroll class/decoration、獨立 medal、`未解鎖`、dialogue 精簡與 visual state 皆失敗。

- [ ] **Step 5: Implement semantic scroll and state presentation**

  - Lobby header 加 semantic classes 與 decorative spans；用 pseudo-elements/CSS 產生木軸、羊皮紙紋理、內外陰影、森林徽記。
  - Building button 內保留 art visual；新增兩條 `aria-hidden` chain、木牌與獨立 medal。狀態 `Icon` 沿用站內唯一 SVG 系統，不用 emoji。
  - selected/hover filter 只套在透明 PNG 輪廓：selected 明亮黃呼吸 `drop-shadow`，hover 較弱；button 不得有矩形 background/border selected state。
  - `:focus-visible` 在木牌＋medal 可見區畫 3px 清楚輪廓，不能因移除矩形 selection 而刪鍵盤 focus。
  - `prefers-reduced-motion` 與 profile reduced-motion 都停止 glow/cloud/adventurer 動畫；selected 保留靜態金色輪廓。

- [ ] **Step 6: Implement the bottom A-type dialogue**

  - Panel 定位於 map stage 底部、橫向延伸且保留 frame gap；內容 grid 在短橫向可換行。
  - 只保留核准資訊；locked blocker 與 unavailable 文案不改安全語意。
  - 選建築只更新 selected state；dialogue 不自動 focus、不導航、不觸發 query invalidation。

- [ ] **Step 7: Run GREEN tests and static checks**

  ```bash
  pnpm exec vitest run \
    src/features/learning/pages/lobby-page.test.tsx \
    src/features/learning/components/chapter-map-building.test.tsx \
    src/features/learning/components/chapter-map-panel.test.tsx \
    src/features/learning/components/chapter-map.test.tsx
  pnpm typecheck
  pnpm lint
  pnpm exec prettier --check \
    src/features/learning/pages/lobby-page.tsx \
    src/features/learning/pages/lobby-page.test.tsx \
    src/features/learning/components/chapter-map-building.tsx \
    src/features/learning/components/chapter-map-building.test.tsx \
    src/features/learning/components/chapter-map-panel.tsx \
    src/features/learning/components/chapter-map-panel.test.tsx \
    src/features/learning/components/chapter-map.test.tsx \
    src/styles/globals.css
  ```

- [ ] **Step 8: Review and commit only Task 3 files**

  Grep `尚未解鎖|chapter-map__building-state`，確認舊 label/state-in-sign 不殘留；grep `background` 確認 selected button 沒矩形底。Commit subject:

  ```text
  feat(learning): refine chapter map signs and dialogue
  ```

---

### Task 4: Add non-blocking rotate guidance and accessible portrait world panning

**Files:**

- Create: `src/features/learning/components/chapter-map-camera.tsx`
- Create: `src/features/learning/components/chapter-map-camera.test.tsx`
- Modify: `src/features/learning/components/chapter-map.tsx`
- Modify: `src/features/learning/components/chapter-map.test.tsx`
- Modify: `src/app/shell/rotate-banner.tsx`
- Modify: `src/app/shell/rotate-banner.test.tsx`
- Modify: `src/app/shell/app-shell.tsx`
- Modify: `src/app/shell/app-shell.test.tsx`
- Modify: `src/styles/globals.css:109-132, 7090-7117, 7451-7554`

**Camera interface:**

```tsx
type ChapterMapCameraProps = Readonly<{
  activeChapter: Pick<StudentChapterMapEntry, 'chapterId' | 'sortOrder'>;
  children: ReactNode;
}>;

export function ChapterMapCamera(props: ChapterMapCameraProps): ReactElement;
```

Camera DOM owns `.chapter-map__viewport`, `tabIndex={0}`, blank-world pointer drag, ArrowLeft/ArrowRight/Home/End keyboard pan, initial centering and six-position indicator。它只改 `scrollLeft`；children world DOM 不因每個 pointermove setState。

- [ ] **Step 1: Write failing camera interaction tests**

  用 fake viewport dimensions/`scrollWidth` 測：

  - mount 後 active chapter 會置中並 clamp 到 `[0, scrollWidth-clientWidth]`；
  - active chapter 改變會重新置中，但不 focus camera/dialogue；
  - ArrowLeft/ArrowRight 移動固定 step，Home/End 到兩端並 `preventDefault`；
  - blank world pointer drag 改 `scrollLeft`，pointer target 是 `button`/`a` 時不啟動 drag；
  - indicator 有六個位置、目前 sortOrder 使用 `aria-current="step"`；
  - 不呼叫 data hooks、router navigation 或 storage writes。

- [ ] **Step 2: Write failing rotate-banner map-copy tests**

  - `RotateBanner` 新增可選 `message` prop；default 仍是 `轉橫體驗更佳`。
  - AppShell 精確 `/app` portrait 顯示 `轉橫可看完整森林王國村` 與既有 `關閉轉向提示`，關閉後 sessionStorage 行為不變。
  - 提示是 `role=status`、非 modal/dialog，關閉後地圖仍在 DOM 且可操作；其他路由仍用 default copy。

- [ ] **Step 3: Run RED tests**

  ```bash
  pnpm exec vitest run \
    src/features/learning/components/chapter-map-camera.test.tsx \
    src/features/learning/components/chapter-map.test.tsx \
    src/app/shell/rotate-banner.test.tsx \
    src/app/shell/app-shell.test.tsx
  ```

  Expected: camera module/props、map-specific rotate copy、pan controls 尚不存在。

- [ ] **Step 4: Implement panning without page overflow**

  - Camera 使用 DOM ref 與 pointer capture；pointermove 直接更新 viewport `scrollLeft`，避免 React state 每 frame 重繪。
  - portrait world 設足以探索六個 anchor 的寬度，`.chapter-map__viewport { overflow-x:auto; overscroll-behavior-x:contain; }`，document 自身維持 `overflow-x:clip`/無水平溢出。
  - 提供可見文字 `拖曳探索村莊` 與六章 position indicator；indicator 非按鈕，不製造第二組章節操作。
  - 初始鏡頭取現有 `initialSelection` 的 selected/first available；章節被 pointer/keyboard 選取後 camera 對準該 anchor。
  - map viewport focus ring 3px；building/button/link 各自仍至少 44×44。

- [ ] **Step 5: Integrate the non-blocking rotate hint**

  - `RotateBanner` 只接受文字 prop，不新增鎖屏、overlay interception 或 orientation API 強制旋轉。
  - AppShell 在 exact student `/app` 傳 map copy；dismiss storage key 與現有 add/remove listener 保持不變。
  - landscape 自動不顯示提示並以完整六章視野；portrait 關閉提示後不停止 camera。

- [ ] **Step 6: Run GREEN tests and static checks**

  ```bash
  pnpm exec vitest run \
    src/features/learning/components/chapter-map-camera.test.tsx \
    src/features/learning/components/chapter-map.test.tsx \
    src/app/shell/rotate-banner.test.tsx \
    src/app/shell/app-shell.test.tsx \
    src/app/shell/hud-command-bar.test.tsx
  pnpm typecheck
  pnpm lint
  pnpm exec prettier --check \
    src/features/learning/components/chapter-map-camera.tsx \
    src/features/learning/components/chapter-map-camera.test.tsx \
    src/features/learning/components/chapter-map.tsx \
    src/features/learning/components/chapter-map.test.tsx \
    src/app/shell/rotate-banner.tsx \
    src/app/shell/rotate-banner.test.tsx \
    src/app/shell/app-shell.tsx \
    src/app/shell/app-shell.test.tsx \
    src/styles/globals.css
  ```

- [ ] **Step 7: Review and commit only Task 4 files**

  確認沒有 `window.location`、force/synthetic click、scrollIntoView workaround、data mutation。Commit subject:

  ```text
  feat(learning): add portrait village map exploration
  ```

---

### Task 5: Complete viewport acceptance, tune only measured visual defects, and close the gate

**Files:**

- Modify: `tests/e2e/learning-map-fullscreen.spec.ts:1-77`
- Create: `tests/e2e/helpers/learning-map.ts`
- Modify only if a measured gate fails: `src/styles/globals.css`
- Modify only if a real behavior defect is exposed: the exact Task 1-4 product/component file owning that defect

**Acceptance rule:** 先新增/擴充 browser assertions 看見 RED，再只依量測回修。不得為過測試改 server-authoritative 數字、降低門檻、使用 force click、`scrollIntoViewIfNeeded`、DOM dispatch 或隱藏 route jump。

- [ ] **Step 1: Add reusable browser measurement helpers**

  `tests/e2e/helpers/learning-map.ts` 提供：

  ```ts
  export async function expectPointerReachable(locator: Locator): Promise<void>;
  export async function readRenderedContrast(locator: Locator): Promise<number>;
  export async function expectVisibleFocusRing(locator: Locator): Promise<void>;
  export async function readWorldAnchorError(building: Locator): Promise<{
    x: number;
    y: number;
  }>;
  ```

  `expectPointerReachable` 只能用 real wheel/drag 抵達後 `locator.click()`；contrast 解析實際 foreground/background（含最近不透明祖先）；focus ring 讀 computed outline/box-shadow 並檢查未被 HUD clip。

- [ ] **Step 2: Expand the E2E spec before final tuning**

  對 1280×720、812×375、375×812 各驗證：

  - `.game-stage--learning-map`、full-bleed、無 `.hud-bar`/奶黃色外卡、`document.scrollWidth <= viewport`；
  - 六個 building ground point 與 1200×800 anchor 轉換誤差不超過 8 logical px 對應的 rendered tolerance；
  - scroll 與最近 HUD/nav/building/medal gap ≥8px；
  - selected art computed filter/animation 有金光、button selected background 透明；reduced motion 下為靜態金光；
  - 六個 building button、MENU、action 都可 real pointer click，focus-visible 可見，target ≥44×44；
  - locked/unavailable 沒 action，MENU 仍可 click-outside 與 Escape 回 toggle；
  - 375×812 rotate hint 可關，關閉後 mouse drag 與 keyboard pan 都改變 camera，頁面不水平溢出，初始鏡頭對準 available chapter；
  - 812×375 用真實 mouse wheel 可到達底部 dialogue/action，不呼叫任何 programmatic scroll helper；
  - scroll、wood sign、medal、dialogue、HUD 的 rendered contrast 全部 ≥4.5:1；console error/pageerror 0。

  裝備 avatar 用 local `learningStudent` 驗證；fallback CSS resilience 另以 browser request interception 只讓 inventory snapshot 失敗，明確標為 presentation fallback test，不把 mock 當 server acceptance。另在 unit test 以 `little_fox` 與 `indigo_dragon` 兩種 3:2 art 驗證相同置中容器規則。

- [ ] **Step 3: Run the new spec and record RED measurements**

  先探測既有 dev server，不殺、不重啟：

  ```bash
  curl -sf http://127.0.0.1:5175 >/dev/null
  PLAYWRIGHT_BASE_URL=http://127.0.0.1:5175 \
    pnpm exec playwright test tests/e2e/learning-map-fullscreen.spec.ts \
      --project=chromium --reporter=list
  ```

  Expected before tuning: 至少部分座標/gap/contrast/short-landscape reachability assertion 揭露精確差值；若全綠，仍需人工讀一次三張 screenshot，不能直接宣稱視覺對準。

- [ ] **Step 4: Tune only failures in the approved CSS scope**

  - anchor 視覺誤差只可調 `visualOffsetX/Y`，每軸 ≤8 logical px；不得移動 logical anchor。
  - contrast <4.5 只調 `globals.css` 的 learning-map 節 token/底色。
  - target <44、focus 被 clip、HUD 遮擋或 wheel 不可達，回到 owning layout rule 修正後重跑該 viewport。
  - 將 screenshots 寫 `/tmp/colorplay-learning-map/`，不得進 repo；人工檢查六棟 bottom-center 確實落在空地，不只看數學 data attribute。

- [ ] **Step 5: Run the focused component and browser gates**

  ```bash
  pnpm exec vitest run \
    src/app/shell/app-shell.test.tsx \
    src/app/shell/hud-command-bar.test.tsx \
    src/app/shell/rotate-banner.test.tsx \
    src/features/rewards/components/economy-summary.test.tsx \
    src/features/learning/pages/lobby-page.test.tsx \
    src/features/learning/components/chapter-map-layout.test.ts \
    src/features/learning/components/chapter-map-camera.test.tsx \
    src/features/learning/components/chapter-map.test.tsx \
    src/features/learning/components/chapter-map-building.test.tsx \
    src/features/learning/components/chapter-map-panel.test.tsx
  PLAYWRIGHT_BASE_URL=http://127.0.0.1:5175 \
    pnpm exec playwright test \
      tests/e2e/learning-map-fullscreen.spec.ts \
      tests/e2e/app-shell.visual.spec.ts \
      tests/e2e/auth-account.spec.ts \
      tests/e2e/playable-slice.spec.ts \
      --project=chromium --reporter=list
  ```

  快照不得因本批任意重拍；`app-shell.visual` 若只因 `/app` 核准畫面改變而紅，先確認其 snapshot 是否包含 `/app`，再以獨立 S 級 snapshot task 交 owner 決定，不在本 commit 偷更新。

- [ ] **Step 6: Run the Learning phase and repository quality gates**

  以乾淨 local Supabase DB 與 fixture 帳號執行，絕不動 `student.one`：

  ```bash
  PLAYWRIGHT_ACCEPTANCE=on pnpm phase:learning-experience
  pnpm typecheck
  pnpm lint
  pnpm test
  pnpm build
  pnpm exec prettier --check \
    src/app/shell/app-shell.tsx \
    src/app/shell/app-shell.test.tsx \
    src/app/shell/rotate-banner.tsx \
    src/app/shell/rotate-banner.test.tsx \
    src/features/rewards/components/economy-summary.tsx \
    src/features/rewards/components/economy-summary.test.tsx \
    src/features/learning/pages/lobby-page.tsx \
    src/features/learning/pages/lobby-page.test.tsx \
    src/features/learning/components/chapter-map-layout.ts \
    src/features/learning/components/chapter-map-layout.test.ts \
    src/features/learning/components/chapter-map-camera.tsx \
    src/features/learning/components/chapter-map-camera.test.tsx \
    src/features/learning/components/chapter-map.tsx \
    src/features/learning/components/chapter-map.test.tsx \
    src/features/learning/components/chapter-map-building.tsx \
    src/features/learning/components/chapter-map-building.test.tsx \
    src/features/learning/components/chapter-map-panel.tsx \
    src/features/learning/components/chapter-map-panel.test.tsx \
    src/styles/globals.css \
    tests/e2e/learning-map-fullscreen.spec.ts \
    tests/e2e/helpers/learning-map.ts
  ```

  `pnpm test` 會看見 protected WIP 的 working-tree 版本；結果需分開標記「本批 committed diff」與「既有未提交 WIP」影響。若 WIP 造成 failure，不得改/stage 它以求綠。

- [ ] **Step 7: Perform the final exact-diff review**

  - `git diff 77f1793..HEAD --stat` 檢查逐 commit 隔離。
  - grep 確認六個標題仍由 RPC 資料渲染，沒有 hardcode 到 image/CSS。
  - grep 確認沒有新增 inventory/economy hook 消費點、Supabase write、MENU mechanism diff、force/synthetic/hidden navigation。
  - 核對 1280×720、812×375、375×812 數字、contrast、44px、scroll gap、console 0。
  - `git status --short` 再確認三支 protected WIP 仍未 stage、內容未被本批覆蓋。

- [ ] **Step 8: Commit the acceptance coverage and any measured CSS tuning**

  只 stage `tests/e2e/learning-map-fullscreen.spec.ts`、`tests/e2e/helpers/learning-map.ts` 與本 task 確實回修的 map CSS/owner files。Commit subject:

  ```text
  test(learning): close fullscreen village map acceptance
  ```

  不 push、不 deploy。回報需明確分成：已完成且本機全綠、待真實裝置人工驗證、以及任何因 protected WIP 無法歸因本批的結果。

---

## Plan Self-Review Checklist

- [ ] 規格第 1–13 節每項至少對應一個 task 與一個驗證點。
- [ ] 沒有待填代號、假函式或未定檔名。
- [ ] 新 interface 的 property、state label 與測試字串一致；`locked` 統一為 `未解鎖`。
- [ ] 地圖座標只存在 `chapter-map-layout.ts` 一份，CSS/測試從同一資料衍生。
- [ ] App Shell exact-route mode 不會套到 `/app/shop`、章節詳情或教師端。
- [ ] `LobbyPage`/`ChapterMap` 沒有 inventory/economy hook；App Shell 每 hook 一次。
- [ ] 地圖保留 equipped Blook 個人角色圖片但不顯示「目前位置」文字；資料來自 shell outlet context。
- [ ] portrait pan 不讓 document 水平溢出，也不攔截 button/link activation。
- [ ] 三支 protected WIP、題庫、login、seed、Supabase 都不在任何 stage 清單。
- [ ] 每一 task 都有 RED、GREEN、static checks、exact review 與獨立 commit。
- [ ] Task 5 的 phase/browser gate 不以 headless viewport 宣稱真實裝置已驗收。
