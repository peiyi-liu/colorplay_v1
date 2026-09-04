# JRPG Pixel Batch-4「村莊設施」Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把四個村莊設施頁改成 JRPG 日景羊皮紙風——`/app/shop` 道具店（木架陳列＋櫃檯分頁＋夜窗購買確認）、`/app/mistakes` 魔物圖鑑（錯題＝魔物剪影卡、復仇成功點亮）、`/app/leaderboard` 公會佈告欄（木板底＋羊皮紙名條＋金銀銅）、`/app/achievements` 勳章殿堂（未解鎖石膏、解鎖光柱）——**純表現層，行為零變更**。

**Architecture:** 沿用批③場景系統：`.scene-day` 只鋪羊皮紙背景、深色面（木板、夜窗對話框）逐條顯式設色。四頁各自一個 CSS-first 任務（className 附加＋裝飾性 aria-hidden 元素＋CSS），最後 gate 沿用批③方法並補上兩項 continuity（opacity 合成驗證針、gate 腳本回收）。

**Tech Stack:** React 19 + TypeScript、CSS（globals.css）、Vitest + Testing Library、Playwright（gate）。

**Base commit:** `82993ba`（批③終點）。Branch: `feature/v2-major-update`（勿推 main、勿部署）。

## Global Constraints

- **行為零變更鐵律**：計分、購買/裝備 mutation、補救 startRemediation、排行榜 RPC、成就查詢、路由、API 一律不動；只動 className、裝飾性 aria-hidden 元素與 CSS。
- **色彩只用 tokens、本批不新增 token**：木板底＝`--pixel-gold-deep`；名條/卡底＝`--pixel-parchment`/`--pixel-parchment-card`；石膏＝`--slate-*`/`--ink-700`；光柱可用 `color-mix(in srgb, var(--pixel-gold) N%, transparent)`（既有 chapter-status-pill 先例）；tokens.css/tokens.test.ts 不動；diff 零 raw hex（既有伺服器資料 inline `linear-gradient(135deg, ${item.gradientStart}…)` 非 raw hex，不動）。
- **對比 4.5:1**：gate 以 getComputedStyle 實測 rendered 配對並**合成 ancestor opacity**（批③終審教訓）；羊皮紙淺底金字用 `--pixel-gold-deep`；木板深底文字用 `--pixel-parchment`。**禁止用容器級 `opacity` 做灰階/剪影**（批③ I2 教訓）——石膏與剪影用實色表達。
- **場景外溢防護**：scene class 只鋪 background 禁容器級 color；深色面（木板 header、夜窗 dialog）逐條設色；覆蓋選擇器寫足 specificity 不依賴檔案順序。
- **動效**：只 transform/opacity、`steps()`；一次性 150–300ms；慢速 idle loop 比照既有 `.press-start` 先例（1.2s steps(2)）；**每個無限循環動畫都要 `@media (prefers-reduced-motion: reduce)`＋`[data-reduced-motion='true']` 兩條顯式 `animation: none`**。
- **載重字串／選擇器一字不可改**（下節清單）；新增裝飾一律 `aria-hidden="true"` 且**不得含任何文字**（shop 有 `getByText('已裝備', { exact: true })` 精確計數）。
- **CSS-first 幾何佔位**（owner 拍板）：店主、魔物剪影、勳章光柱全 CSS；`.shop-keeper*`、`.codex-monster*`、`.hall-*` class 群＝素材批換裝介面。
- **commit 紀律**：工作區有平行 session 未 commit 變更——每 commit 只 `git add` 任務列出的檔案，禁 `git add -A`/`git add .`；訊息結尾 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`。
- `eslint.config.js` 受保護不可改；不得停用/繞過 hooks；GateGuard 要求陳述事實照做。**gate 拋棄式 .mjs 不得放 repo 內**（eslint 掃 `.superpowers/`，批③教訓）。
- e2e 全電池既有範圍外失敗勿當基線；gate 只跑目標 spec，紅的用批③已驗證的 base-worktree 對照法歸因。

## 載重字串與選擇器（不可變更）

| 頁           | 來源                                                                                        | 內容                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| shop         | tests/e2e/game-economy.spec.ts:98-150、shop-page.test.tsx                                   | h1 `裝備商店`；`{N} Token 可用`；按鈕 `購買 {名}，{N} Token`／`選用 {名}`／`還差 {N} Token，無法購買 {名}`／`確認購買`／`取消`／`購買中…`；dialog name `購買「{名}」？`＋`將扣除 {N} Token。`；status `已購買{名}。`/`已裝備{名}。`；**`已裝備` exact-text 計數＝1**（`.blook-card__state`）；`.blook-card__art svg` 數量斷言（class 與內部 svg 結構不可動）；tab `角色`/`外框`；aria `商店分類`/`外框商店`；hint `裝備後將顯示在大廳頭貼外框。`；error `無法載入裝備商店，請稍後重試。`＋`重試` |
| mistakes     | tests/e2e/learning-experience.spec.ts:200-230、mistakes-page.test.tsx                       | h1 `我的錯題`；eyebrow `補救學習`；`{N} 題待補救`（class `mistake-group__badge`）；heading `已解決`；`正確答案：{X}`；按鈕 `再挑戰（補救練習）`；status `目前沒有待補救的錯題，繼續保持！`；`（再次答錯）` 字尾；error 文案＋`重試`；補救 session 內的 `返回我的錯題` link 在 quiz 頁（本批不碰）                                                                                                                                                                                                |
| leaderboard  | tests/e2e/classroom-leaderboard.spec.ts、live-advanced、classroom-leaderboard-page.test.tsx | h1 `排行榜`；eyebrow `班級 XP`；`Top 10 與你的名次都由伺服器依正式 XP 紀錄計算。`；table aria-label `` `${classroomName} Top 10` ``；th `名次`/`暱稱`/`XP`；`第 {N} 名`；`{N} XP`；`這是你`；aside aria-label `我的班級名次`；`目前還沒有可排行的學生。`；alert `無法顯示排行榜…`；class `ui-table leaderboard-table`＋`leaderboard-table__row--gold/--silver/--bronze`＋`leaderboard-blook`（結構沿用，只加樣式）                                                                               |
| achievements | tests/e2e/achievements.spec.ts:51-124、achievements-page.test.tsx                           | h1 `個人成就與徽章`；description `完成學習任務、累積挑戰紀錄，解鎖你的專屬色彩成就。`；list aria-label `成就徽章列表`；StatusBadge `已解鎖`/`未解鎖`；`解鎖於 {日期}`；`進度`＋`{X} / {Y}`；progressbar aria-label `` `${displayName}進度` ``；back link aria `回課後學習大廳`；`重試`；attr `data-achievement-state`／class `achievement-card--locked`（測試與樣式錨點，保留）                                                                                                                  |

四頁的 loading／error 早退 branch（`route-panel`／`shop-message-panel`／achievements 的 `page-card` alert 版）一律**不掛 scene class**（批③慣例）。

## File Structure

- Modify: `src/features/inventory/pages/shop-page.tsx`（section className＋tab 內 aria-hidden 店主裝飾）＋ `shop-page.test.tsx`
- Modify: `src/features/learning/pages/mistakes-page.tsx`（section className＋魔物剪影 span）＋ `mistakes-page.test.tsx`
- Modify: `src/features/leaderboard/pages/classroom-leaderboard-page.tsx`（section className）＋ `classroom-leaderboard-page.test.tsx`
- Modify: `src/features/achievements/pages/achievements-page.tsx`（section className）＋ `achievements-page.test.tsx`
- Modify: `src/styles/globals.css`（四頁各一區塊，全部附在批③地城 CSS 之後）
- Create: `artifacts/design-audit/batch4/`（Task 5）；Modify: `.superpowers/sdd/progress.md`（Task 5 append）
- 不動：tokens、api、hooks、router、`leaderboard-table.tsx`、`achievement-card.tsx`（兩元件僅被 CSS 選中，不改 JSX）

---

### Task 1: 道具店（/app/shop＝木架陳列＋櫃檯分頁＋夜窗購買確認）

**Files:**

- Modify: `src/features/inventory/pages/shop-page.tsx`
- Modify: `src/features/inventory/pages/shop-page.test.tsx`
- Modify: `src/styles/globals.css`

**Interfaces:**

- Consumes: 既有 `.scene-day`（只鋪背景）、`.rpg-window` 邊框配方（globals.css:4740，抄配方不掛 class）、tokens
- Produces: `.shop-keeper`/`.shop-keeper--blooks`/`.shop-keeper--frames` 裝飾 class（素材批換裝點）

- [ ] **Step 1: 寫失敗測試（shop-page.test.tsx 新增，沿用檔內既有 render harness 與 repository stub）**

```tsx
it('dresses the shop as a day-scene village facility', async () => {
  // 沿用檔內既有成功 render（等 heading 裝備商店出現）後：
  expect(document.querySelector('.blook-shop.scene-day')).not.toBeNull();
  expect(document.querySelectorAll('.shop-keeper')).toHaveLength(2);
  for (const keeper of document.querySelectorAll('.shop-keeper')) {
    expect(keeper).toHaveAttribute('aria-hidden', 'true');
  }
  // 載重：分頁按鈕 accessible name 不受裝飾影響
  expect(screen.getByRole('button', { name: '角色' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '外框' })).toBeInTheDocument();
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm vitest run src/features/inventory/pages/shop-page.test.tsx`
Expected: 新例 FAIL（scene-day/shop-keeper 不存在），既有例全綠

- [ ] **Step 3: JSX（shop-page.tsx）**

(a) 主 section（213 行）：

```tsx
<section className="blook-shop scene-day" aria-labelledby="blook-shop-title">
```

（error 早退的 `shop-message-panel` 不動。）

(b) 兩個 shop-tab 按鈕內、文字之前各加一枚店主頭像（aria-hidden 不進 accessible name）：

```tsx
<button
  className="shop-tab"
  data-on={shopTab === 'blooks' ? 'true' : undefined}
  onClick={() => {
    setShopTab('blooks');
  }}
  type="button"
>
  <span aria-hidden="true" className="shop-keeper shop-keeper--blooks" />
  角色
</button>
```

外框分頁同構：`<span aria-hidden="true" className="shop-keeper shop-keeper--frames" />` 後接 `外框`。

- [ ] **Step 4: 跑測試確認通過**

Run: `pnpm vitest run src/features/inventory/pages/shop-page.test.tsx`
Expected: 全綠（含既有 dialog／購買流程例）

- [ ] **Step 5: CSS（globals.css，附在批③地城區塊之後，開新註解區 `── 批④ 村莊設施`）**

```css
/* ── 批④ 道具店(/app/shop;spec §5:兩櫃檯 NPC+木架陳列+購買確認對話窗) ──
   scene-day 只鋪背景;深色面(夜窗 dialog)逐條設色(批②③外溢教訓)。 */
.scene-day.blook-shop {
  padding: 24px 16px 48px;
}

/* 櫃檯分頁釘牌:木牌+店主頭像。 */
.scene-day .shop-tab {
  border: 2px solid var(--pixel-gold-deep);
  border-radius: var(--radius-pixel);
  background: var(--pixel-parchment-card);
}

.scene-day .shop-tab[data-on='true'] {
  background: var(--pixel-gold-deep);
  color: var(--pixel-parchment);
}

/* 店主頭像:CSS 幾何佔位(素材批換裝;.shop-keeper* 為換裝介面)。 */
.shop-keeper {
  position: relative;
  display: inline-block;
  flex: none;
  width: 20px;
  height: 20px;
  margin-right: 6px;
  vertical-align: -4px;
  border-radius: var(--radius-pixel);
  box-shadow: 2px 2px 0 var(--pixel-shadow);
}

.shop-keeper::before {
  content: '';
  position: absolute;
  top: 7px;
  left: 4px;
  width: 3px;
  height: 3px;
  background: var(--pixel-window-frame);
  box-shadow: 7px 0 0 var(--pixel-window-frame);
}

.shop-keeper--blooks {
  background: var(--coral-700);
}

.shop-keeper--frames {
  background: var(--cobalt-600);
}

/* 木架陳列:貨架卡=羊皮紙格+底部厚木板。 */
.scene-day .blook-card {
  border: 2px solid var(--pixel-gold-deep);
  border-bottom: 6px solid var(--pixel-gold-deep);
  border-radius: var(--radius-pixel);
  background: var(--pixel-parchment-card);
  box-shadow: 3px 3px 0 var(--pixel-shadow);
}

.scene-day .blook-shop__header {
  border: 2px solid var(--pixel-gold-deep);
  border-radius: var(--radius-pixel);
  background: var(--pixel-parchment-card);
  box-shadow: 4px 4px 0 var(--pixel-shadow);
}

.scene-day .blook-shop__header h1 {
  font-family: var(--font-pixel-tc);
  font-size: 22px;
}

/* 購買確認=夜空對話窗(spec §4.2;配方同 .rpg-window,不掛 class 免容器色外溢)。 */
.purchase-dialog {
  background: var(--pixel-night);
  border: 3px solid var(--pixel-window-frame);
  outline: 2px solid var(--pixel-night);
  box-shadow:
    0 0 0 5px var(--pixel-window-frame),
    4px 4px 0 var(--pixel-shadow);
  border-radius: var(--radius-pixel);
}

.purchase-dialog h2 {
  color: var(--pixel-window-ink);
}

.purchase-dialog > p {
  color: var(--pixel-window-ink);
}
```

（`.purchase-dialog::backdrop` 既有樣式不動；`取消`/`確認購買` 按鈕自帶實底不需覆蓋——Step 6 逐面自查確認。若既有 `.purchase-dialog` 區塊（globals.css:967-987）與上述屬性衝突，**就地改寫該區塊**而非後置覆蓋。）

- [ ] **Step 6: 逐面自查**

深色面清單：夜窗 dialog 的 h2／p（已設 window-ink）、`secondary-action` 取消鍵與 `primary-action` 確認鍵在夜窗上（自帶底，肉眼查）；淺色面：blook-card 內 h2/h3/price p/`已裝備` state/`還差` disabled 鍵維持墨字（無容器色，繼承即可）；`data-on` 釘牌反白字 `--pixel-parchment` on `--pixel-gold-deep`（gate 實測）。375px：tab 列與貨架 grid 不溢出。

- [ ] **Step 7: 驗證與 commit**

Run: `pnpm vitest run src/features/inventory && pnpm lint && pnpm typecheck`
Expected: 全綠

```bash
git add src/features/inventory/pages/shop-page.tsx src/features/inventory/pages/shop-page.test.tsx src/styles/globals.css
git commit -m "feat(shop): village item-shop day scene with counter tabs and night purchase window

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: 魔物圖鑑（/app/mistakes＝錯題魔物卡、復仇點亮）

**Files:**

- Modify: `src/features/learning/pages/mistakes-page.tsx`
- Modify: `src/features/learning/pages/mistakes-page.test.tsx`
- Modify: `src/styles/globals.css`

**Interfaces:**

- Consumes: 既有 `.scene-day`、tokens
- Produces: `.codex-monster`／`.codex-monster--lit` 裝飾 class（素材批換裝點）

- [ ] **Step 1: 寫失敗測試（mistakes-page.test.tsx 新增；先讀檔內 fixture 的 open/resolved 實際數量，下方 2/1 以實值釘）**

```tsx
it('renders codex monsters: silhouettes for open mistakes, lit for resolved', async () => {
  // 沿用檔內既有成功 render 後：
  expect(document.querySelector('.mistakes-codex.scene-day')).not.toBeNull();
  const monsters = document.querySelectorAll('.codex-monster');
  expect(monsters).toHaveLength(2); // = open + resolved 總數，依 fixture 實值
  expect(document.querySelectorAll('.codex-monster--lit')).toHaveLength(1); // = resolved 數
  for (const monster of monsters) {
    expect(monster).toHaveAttribute('aria-hidden', 'true');
  }
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm vitest run src/features/learning/pages/mistakes-page.test.tsx`
Expected: 新例 FAIL，既有例全綠

- [ ] **Step 3: JSX（mistakes-page.tsx）**

(a) 主 section（65 行）改：

```tsx
<section aria-labelledby="mistakes-title" className="mistakes-codex scene-day">
```

（error 早退 `route-panel` 不動。）

(b) 待補救 li（92-100 行）prompt 前插剪影，原兩個 `<p>` 內容與 class 一字不動、包一層 body 供橫排版：

```tsx
<li className="mistake-list__item" key={mistake.mistakeId}>
  <span aria-hidden="true" className="codex-monster" />
  <div className="mistake-list__body">
    <p className="mistake-list__prompt">
      {mistake.prompt}
      {mistake.status === 'reopened' ? '（再次答錯）' : ''}
    </p>
    <p className="mistake-list__answer">
      正確答案：{mistake.correctOptionText}
    </p>
  </div>
</li>
```

(c) 已解決 li（143-150 行）同構加點亮魔物：

```tsx
<li key={mistake.mistakeId}>
  <span aria-hidden="true" className="codex-monster codex-monster--lit" />
  {mistake.prompt}
  <span className="mistake-resolved__answer">
    正確答案：{mistake.correctOptionText}
  </span>
</li>
```

- [ ] **Step 4: 跑測試確認通過**

Run: `pnpm vitest run src/features/learning/pages/mistakes-page.test.tsx`
Expected: 全綠

- [ ] **Step 5: CSS（globals.css，批④區塊續）**

```css
/* ── 批④ 魔物圖鑑(/app/mistakes;spec §5:錯題=魔物卡,剪影→復仇點亮) ── */
.scene-day.mistakes-codex {
  width: min(100%, 760px);
  padding: 24px 16px 48px;
}

.mistakes-codex > header {
  border: 2px solid var(--pixel-gold-deep);
  border-radius: var(--radius-pixel);
  background: var(--pixel-parchment-card);
  box-shadow: 4px 4px 0 var(--pixel-shadow);
  padding: 20px 22px;
}

.mistakes-codex > header h1 {
  font-family: var(--font-pixel-tc);
  font-size: 22px;
}

.mistakes-codex .mistake-group,
.mistakes-codex .mistake-resolved {
  border: 2px solid var(--pixel-gold-deep);
  border-radius: var(--radius-pixel);
  background: var(--pixel-parchment-card);
  box-shadow: 3px 3px 0 var(--pixel-shadow);
  padding: 16px 18px;
  margin-top: 16px;
}

.mistakes-codex .mistake-list__item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

/* 圖鑑魔物:CSS 幾何佔位(.codex-monster* 為素材批換裝介面)。
   剪影=實色墨塊(禁 opacity 灰階,批③ I2 教訓);復仇成功=點亮上色。 */
.codex-monster {
  position: relative;
  flex: none;
  display: inline-block;
  width: 28px;
  height: 24px;
  margin-top: 2px;
  background: var(--ink-700);
  clip-path: polygon(
    20% 100%,
    0 45%,
    18% 8%,
    50% 0,
    82% 8%,
    100% 45%,
    80% 100%,
    62% 82%,
    38% 82%
  );
}

.codex-monster--lit {
  background: var(--jade-600);
}

.codex-monster--lit::before {
  content: '';
  position: absolute;
  top: 9px;
  left: 8px;
  width: 3px;
  height: 3px;
  background: var(--pixel-window-frame);
  box-shadow: 9px 0 0 var(--pixel-window-frame);
}

.mistakes-codex .mistake-resolved__list > li {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: wrap;
}
```

- [ ] **Step 6: 逐面自查**

全頁淺色（無深色面）：header/卡片墨字繼承；`mistake-group__badge` 既有底色在 parchment-card 上（gate 實測）；375px 剪影＋長 prompt 換行不溢出；空狀態 `目前沒有待補救的錯題` 直接坐 scene-day 背景仍為墨字。

- [ ] **Step 7: 驗證與 commit**

Run: `pnpm vitest run src/features/learning && pnpm lint && pnpm typecheck`
Expected: 全綠

```bash
git add src/features/learning/pages/mistakes-page.tsx src/features/learning/pages/mistakes-page.test.tsx src/styles/globals.css
git commit -m "feat(learning): monster-codex mistakes page with silhouette-to-lit revenge cards

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: 公會佈告欄（/app/leaderboard＝木板底＋羊皮紙名條＋金銀銅）

**Files:**

- Modify: `src/features/leaderboard/pages/classroom-leaderboard-page.tsx`
- Modify: `src/features/leaderboard/pages/classroom-leaderboard-page.test.tsx`
- Modify: `src/styles/globals.css`

**Interfaces:**

- Consumes: 既有 `.leaderboard-table__row--gold/--silver/--bronze` class（leaderboard-table.tsx:70-75，JSX 不動）、tokens
- Produces: `.guild-board` 版型 class

**注意**：`leaderboard-table.tsx`、`student-leaderboard-route.tsx` **JSX 一律不動**；所有視覺經 `.guild-board` 前綴 CSS 選中。決議 5：維持全期累計、純視覺改造。

- [ ] **Step 1: 寫失敗測試（classroom-leaderboard-page.test.tsx 新增，沿用檔內既有 render harness）**

```tsx
it('dresses the leaderboard as a guild notice board', async () => {
  // 沿用檔內既有成功 render（等 heading 排行榜出現）後：
  expect(
    document.querySelector('.leaderboard-panel.scene-day.guild-board'),
  ).not.toBeNull();
  expect(screen.getByRole('heading', { name: '排行榜' })).toBeInTheDocument();
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm vitest run src/features/leaderboard/pages/classroom-leaderboard-page.test.tsx`
Expected: 新例 FAIL，既有例全綠

- [ ] **Step 3: JSX（classroom-leaderboard-page.tsx:46-50）**

```tsx
<section
  aria-labelledby="classroom-leaderboard-title"
  className="page-wide leaderboard-panel scene-day guild-board"
>
```

（error 早退 `route-panel` 不動。）

- [ ] **Step 4: 跑測試確認通過**

Run: `pnpm vitest run src/features/leaderboard/pages/classroom-leaderboard-page.test.tsx`
Expected: 全綠

- [ ] **Step 5: CSS（globals.css，批④區塊續）**

```css
/* ── 批④ 公會佈告欄(/app/leaderboard;決議 5 純視覺:木板底+羊皮紙名條+金銀銅) ──
   木板=深色面:header 文字逐條設淺色(外溢鐵律,不設容器 color)。 */
.scene-day.guild-board {
  background: var(--pixel-gold-deep);
  border: 3px solid var(--pixel-window-frame);
  outline: 2px solid var(--pixel-gold-deep);
  box-shadow:
    0 0 0 5px var(--pixel-window-frame),
    4px 4px 0 var(--pixel-shadow);
  border-radius: var(--radius-pixel);
  padding: 24px 20px 32px;
}

.guild-board > header .route-panel__eyebrow {
  color: var(--pixel-parchment);
}

.guild-board > header h1 {
  font-family: var(--font-pixel-tc);
  font-size: 22px;
  color: var(--pixel-parchment);
}

.guild-board > header p {
  color: var(--pixel-parchment);
}

/* 空榜文案直接坐木板。 */
.guild-board > p {
  color: var(--pixel-parchment);
}

/* 名條:每列=羊皮紙紙條;表頭紙條淡一階。 */
.guild-board .ui-table.leaderboard-table {
  background: transparent;
  border-collapse: separate;
  border-spacing: 0 8px;
}

.guild-board .leaderboard-table thead th {
  background: var(--pixel-parchment);
  color: var(--ink-700);
}

.guild-board .leaderboard-table tbody th,
.guild-board .leaderboard-table tbody td {
  background: var(--pixel-parchment-card);
  border-top: 2px solid var(--pixel-gold-deep);
  border-bottom: 2px solid var(--pixel-gold-deep);
}

/* 金銀銅名條:沿用既有 row class(JSX 不動),換紙條底+顯式字色。 */
.guild-board .ui-table .leaderboard-table__row--gold th,
.guild-board .ui-table .leaderboard-table__row--gold td {
  background: var(--pixel-gold);
  color: var(--pixel-night);
}

.guild-board .ui-table .leaderboard-table__row--silver th,
.guild-board .ui-table .leaderboard-table__row--silver td {
  background: var(--slate-200);
  color: var(--ink-900);
}

.guild-board .ui-table .leaderboard-table__row--bronze th,
.guild-board .ui-table .leaderboard-table__row--bronze td {
  background: var(--hue-ch3-soft);
  color: var(--ink-900);
}

/* 自己名次卡(rank>10 的 aside)=高亮紙條。 */
.guild-board aside[aria-label='我的班級名次'] {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
  border: 2px solid var(--pixel-gold);
  border-radius: var(--radius-pixel);
  background: var(--pixel-parchment-card);
  box-shadow: 3px 3px 0 var(--pixel-shadow);
  padding: 12px 16px;
}

/* 「這是你」章。 */
.guild-board .leaderboard-blook strong {
  border: 1px solid var(--pixel-gold-deep);
  border-radius: var(--radius-pixel);
  background: var(--pixel-gold);
  color: var(--pixel-night);
  font-size: var(--font-size-supporting);
  padding: 1px 6px;
  margin-left: 6px;
}
```

- [ ] **Step 6: 逐面自查（深色面清單）**

木板上：eyebrow／h1／description／空榜 p（皆設 `--pixel-parchment`，#f6eed8 on #8a651f 約 5.4:1，gate 實測）；紙條上：預設墨字繼承＋tier 三列顯式色（gold 條 night on gold 約 5.2:1）；`這是你` 章 night on gold；`FramedBlook` 頭像磚（伺服器漸層）在紙條上不動；既有 `.ui-table .leaderboard-table__row--*`（globals.css:3357-3369）若設字色，`.guild-board` 前綴 (0,3,0)+ 覆蓋成立不依賴順序。error 分支無 scene。375px：表格橫向不溢出。

- [ ] **Step 7: 驗證與 commit**

Run: `pnpm vitest run src/features/leaderboard && pnpm lint && pnpm typecheck`
Expected: 全綠

```bash
git add src/features/leaderboard/pages/classroom-leaderboard-page.tsx src/features/leaderboard/pages/classroom-leaderboard-page.test.tsx src/styles/globals.css
git commit -m "feat(leaderboard): guild notice-board with parchment name strips and medal rows

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: 勳章殿堂（/app/achievements＝未解鎖石膏、解鎖光柱）

**Files:**

- Modify: `src/features/achievements/pages/achievements-page.tsx`
- Modify: `src/features/achievements/pages/achievements-page.test.tsx`
- Modify: `src/styles/globals.css`

**Interfaces:**

- Consumes: 既有 `.achievement-card`／`.achievement-card--locked`／`data-achievement-state`（achievement-card.tsx，JSX 不動）、tokens
- Produces: `.hall-of-medals` 版型 class

- [ ] **Step 1: 寫失敗測試（achievements-page.test.tsx 新增，沿用檔內既有 render harness；若 fixture 無 unlocked 項則於測試資料補一筆——只改測試檔）**

```tsx
it('dresses achievements as the hall of medals', async () => {
  // 沿用檔內既有成功 render（等 heading 個人成就與徽章出現）後：
  expect(
    document.querySelector('.achievements.scene-day.hall-of-medals'),
  ).not.toBeNull();
  expect(document.querySelector('.achievement-card--locked')).not.toBeNull();
  expect(
    document.querySelector('[data-achievement-state="unlocked"]'),
  ).not.toBeNull();
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm vitest run src/features/achievements/pages/achievements-page.test.tsx`
Expected: 新例 FAIL，既有例全綠

- [ ] **Step 3: JSX（achievements-page.tsx:36）**

```tsx
<section
  aria-labelledby="achievements-title"
  className="achievements scene-day hall-of-medals"
>
```

（error 早退 `page-card page-narrow` alert 版不動。）

- [ ] **Step 4: 跑測試確認通過**

Run: `pnpm vitest run src/features/achievements/pages/achievements-page.test.tsx`
Expected: 全綠

- [ ] **Step 5: CSS（globals.css，批④區塊續）**

```css
/* ── 批④ 勳章殿堂(/app/achievements;spec §5:未解鎖=石膏剪影、解鎖=光柱) ── */
.scene-day.hall-of-medals {
  padding: 24px 16px 48px;
}

/* 解鎖徽章:金框+頂部光柱(靜態漸層+慢速呼吸;僅動 opacity;
   1.2s steps(2) 比照 .press-start 先例)。 */
.hall-of-medals .achievement-card:not(.achievement-card--locked) {
  position: relative;
  overflow: hidden;
  border: 2px solid var(--pixel-gold-deep);
  border-radius: var(--radius-pixel);
  box-shadow: 3px 3px 0 var(--pixel-shadow);
}

.hall-of-medals .achievement-card:not(.achievement-card--locked)::before {
  content: '';
  position: absolute;
  top: 0;
  left: 50%;
  width: 56px;
  height: 100%;
  transform: translateX(-50%) skewX(-8deg);
  background: linear-gradient(
    to bottom,
    color-mix(in srgb, var(--pixel-gold) 35%, transparent),
    transparent 70%
  );
  pointer-events: none;
  animation: medal-beam 1.2s steps(2, jump-none) infinite alternate;
}

@keyframes medal-beam {
  from {
    opacity: 1;
  }

  to {
    opacity: 0.55;
  }
}

@media (prefers-reduced-motion: reduce) {
  .hall-of-medals .achievement-card:not(.achievement-card--locked)::before {
    animation: none;
  }
}

[data-reduced-motion='true']
  .hall-of-medals
  .achievement-card:not(.achievement-card--locked)::before {
  animation: none;
}

/* 未解鎖=石膏剪影:實色灰階(禁容器 opacity,批③ I2 教訓);
   以 (0,3,0) 起跳覆蓋 pastel data-theme 色不依賴順序。 */
.hall-of-medals .achievement-card.achievement-card--locked {
  border: 2px solid var(--slate-300);
  border-radius: var(--radius-pixel);
  background: var(--slate-100);
  box-shadow: 3px 3px 0 var(--pixel-shadow);
}

.hall-of-medals .achievement-card--locked .pastel-card__icon {
  background: var(--slate-200);
  color: var(--ink-700);
}

.hall-of-medals .achievement-card--locked .pastel-card__title,
.hall-of-medals .achievement-card--locked .pastel-card__description {
  color: var(--ink-700);
}
```

- [ ] **Step 6: 逐面自查**

全頁淺色：unlocked 卡 pastel 主題字色維持（光柱僅疊 35% 金——gate 於光柱最亮處取樣 title×卡底仍 ≥4.5）；locked 石膏卡 `--ink-700` on `--slate-100`（約 9:1）；進度條與 `{X} / {Y}` 值在石膏底可讀；StatusBadge 兩態字×badge 底（gate 實測）；375px grid 不溢出。

- [ ] **Step 7: 驗證與 commit**

Run: `pnpm vitest run src/features/achievements && pnpm lint && pnpm typecheck`
Expected: 全綠

```bash
git add src/features/achievements/pages/achievements-page.tsx src/features/achievements/pages/achievements-page.test.tsx src/styles/globals.css
git commit -m "feat(achievements): hall-of-medals with plaster locked cards and light-beam unlocks

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Batch Gate（驗證與證據＋批③ continuity）

**Files:**

- Create: `artifacts/design-audit/batch4/`
- Modify: `.superpowers/sdd/progress.md`（只 append batch-4 段落）

**Interfaces:**

- Consumes: Tasks 1-4 全部 commit；批③ gate 工具（session scratchpad 的 `gate-capture.mjs`；若已蒸發，按 `artifacts/design-audit/batch3/contrast.md` 記載的方法重建於 scratchpad——**不得放 repo 內**）

- [ ] **Step 1: 靜態全套**

Run: `pnpm lint && pnpm typecheck && pnpm vitest run`
Expected: lint 0 err、typecheck pass、unit 全綠（批③終點基線＋本批新增）

- [ ] **Step 2: raw hex 與 token 檢查**

Run: `git diff 82993ba..HEAD -- src/ ':!src/styles/tokens.css' | grep -E '^\+.*#[0-9a-fA-F]{3,8}\b'`
Expected: 無輸出

Run: `git diff 82993ba..HEAD -- src/styles/tokens.css src/styles/tokens.test.ts`
Expected: 空

- [ ] **Step 3: 載重字串完整性（與 `git show 82993ba:<file>` 比對計數，不得減少）**

```bash
for s in 裝備商店 "Token 可用" 確認購買 已裝備 選用 還差; do echo "$s:"; grep -c "$s" src/features/inventory/pages/shop-page.tsx; git show 82993ba:src/features/inventory/pages/shop-page.tsx | grep -c "$s"; done
for s in 我的錯題 題待補救 已解決 "再挑戰（補救練習）" 正確答案; do echo "$s:"; grep -c "$s" src/features/learning/pages/mistakes-page.tsx; git show 82993ba:src/features/learning/pages/mistakes-page.tsx | grep -c "$s"; done
git diff 82993ba..HEAD -- src/features/leaderboard/components/leaderboard-table.tsx src/features/achievements/components/achievement-card.tsx
```

Expected: 每組前後計數一致；最後一條 diff 為空（兩元件零接觸＝字串天然不變）

- [ ] **Step 4: 目標 e2e（不跑全電池；紅的用批③ base-worktree 對照法歸因後記錄）**

```bash
npx playwright test tests/e2e/game-economy.spec.ts tests/e2e/achievements.spec.ts tests/e2e/learning-experience.spec.ts tests/e2e/classroom-leaderboard.spec.ts --project=chromium
```

Expected: 全綠，或紅者經 `git worktree add` 於 base `82993ba` 重跑證明失敗與本批 diff 無關（classroom-leaderboard 與 learning-experience 已知受平行 session content seed 漂移影響）

- [ ] **Step 5: 截圖證據（1280×720＋375×812）→ `artifacts/design-audit/batch4/`**

9 張：`shop-desktop/375.png`＋開啟購買夜窗的 `shop-dialog.png`、`mistakes-desktop/375.png`、`leaderboard-desktop/375.png`、`achievements-desktop/375.png`。逐張檢視：木架卡成形、店主釘牌可辨、魔物剪影/點亮對比清楚、木板名條分層、金銀銅可辨、石膏 vs 光柱可辨、無溢出、無同色字。

- [ ] **Step 6: rendered 對比實測（含 opacity 合成）→ `artifacts/design-audit/batch4/contrast.md`**

**先打驗證針（批③ continuity #1）**：對已知 opacity≠1 的元素（世界地圖 `.scene-day .mission-select__list::before` opacity 0.5，或合成 swatch）量測一次，證明 opacity 合成 helper 混色數學正確，記入 contrast.md 方法節。

然後全部配對 ≥4.5:1：

- shop：釘牌 data-on 反白字×金深底；貨架卡 h2/h3/price/`已裝備`/`還差` disabled 字×卡底；夜窗 h2/p×night 底；取消/確認鍵字×鍵底。
- mistakes：header 與卡片全部文字×parchment-card；`mistake-group__badge` 字×badge 底；空狀態×scene-day 底。
- leaderboard：eyebrow/h1/description/空榜×木板底；thead th×parchment；一般列 td 墨字×紙條；金列 night×gold、銀列 ink-900×slate-200、銅列 ink-900×hue-ch3-soft；`這是你` night×gold；SelfRankCard 文字×紙條。
- achievements：unlocked 卡 title/description×卡底（光柱最亮處取樣）；locked 卡 title/description/進度值×slate-100；StatusBadge 兩態字×badge 底。

- [ ] **Step 7: console 乾淨**

四頁各完整載入一次：console error＝0、pageerror＝0。

- [ ] **Step 8: 記錄與 commit**

`.superpowers/sdd/progress.md` append batch-4 段落（任務 SHA、gate 結果、對比範圍、e2e 歸因、opacity 驗證針結果）。

```bash
git add artifacts/design-audit/batch4 .superpowers/sdd/progress.md
git commit -m "test(gate): batch-4 village facilities gate evidence

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## 風險與備註

- **`已裝備` exact-count 斷言（game-economy.spec:109）**：任何新增元素文字不得恰為 `已裝備`——本批新增元素一律無文字，天然安全；gate Step 3 雙保險。
- **`.blook-card__art svg` 數量斷言**：Task 1 不動該 class 與內部結構，只改卡框。
- **leaderboard-table.tsx／achievement-card.tsx JSX 零接觸**：全部視覺經 `.guild-board`/`.hall-of-medals` 前綴選中，Step 3 以空 diff 驗證。
- **石膏／剪影禁 opacity**：批③終審 I2 的量測盲點直接規避；gate 本批起帶 opacity 合成驗證針。
- **achievements.spec:124／classroom-leaderboard.spec:246 的截圖步驟**為 outputPath 產物非基線比對，視覺改版不會紅。
- **既有 `.purchase-dialog`（globals.css:967-987）**：Task 1 如遇屬性衝突就地改寫該區塊，不做後置覆蓋堆疊。
- 素材批換裝點：`.shop-keeper*`、`.codex-monster*`、`.hall-of-medals` 光柱/石膏、`.guild-board` 木板紋理。
- Deferred（不做）：店主 NPC 對話泡泡、圖鑑翻頁動畫、佈告欄圖釘/膠帶裝飾、批③遺留 M4-M11（另案）。
