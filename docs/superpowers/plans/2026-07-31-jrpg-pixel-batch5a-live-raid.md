# JRPG Pixel Batch-5a「Live 團體戰」Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把學生端 Live 三面改成 JRPG 夜景公會團體戰——`/app/live/join` 召集令（六格咒文石板逐格點亮＋錯誤震動）、`/app/live/:id` 公會團體戰（夜景營地／戰陣、Late Join＝營地等待）、`?presenter=1` 投影幕（旗幟牆、四色軍勢分布、Top 5 英雄榜、頒獎台三寶石加冕＋煙火）——**純表現層，行為零變更**。批⑤b（教師端）另立計畫。

**Architecture:** Live 屬夜景系（spec §4.1：戰鬥、Live、投影幕＝夜空 navy；投影墨色舞台既有例外轉正規）。join/session 掛 `.scene-night`（只鋪背景）＋深色面逐條設色；presenter 本身已是深色 fixed overlay（容器級 white 為既有自足設計，僅換底色 token＋加裝飾，不動其容器色模式）。裝飾全 CSS 幾何（`.rune-slot*`／`.camp-fire`／`.podium-gems`／`.podium-fireworks*`＝素材批換裝介面）。

**Tech Stack:** React 19 + TypeScript、CSS（globals.css）、Vitest + Testing Library、Playwright（gate，含 1920×1080 投影驗證）。

**Base commit:** `5fe46ef`（批④終點）。Branch: `feature/v2-major-update`（勿推 main、勿部署）。

## Global Constraints

- **行為零變更鐵律**：join 節流／加入碼驗證、`screen_only` 安全裁剪、server-authoritative 倒數、standings/podium 資料流、音效引擎一律不動。允許的唯一 hook 級動作：join 頁用 react-hook-form **既有** `watch('joinCode')` 讀值渲染純顯示的六格（不影響表單提交）。
- **色彩只用 tokens、本批不新增 token**；tokens.css/tokens.test.ts 不動；diff 零 raw hex。
- **場景外溢防護**：`.scene-night` 既有 base（globals.css:4772，含既有容器 color——本批**沿用不改**；join/session 每個淺色子卡逐條處理，深色面文字逐條設色）；specificity 不依賴檔案順序。
- **禁容器 opacity 灰階**；無限循環動畫雙通道 reduced-motion 顯式關閉（`@media` + `[data-reduced-motion='true']`）；一次性動畫（震動）150–300ms steps()，僅 transform/opacity。
- **對比 4.5:1**，gate rendered 實測含 opacity 合成；**gradient 面依批④ D2 規約在漸層最深端取樣**；**beam/覆蓋層依批④ D1 規約：positioned z-index:auto 必然畫在 in-flow 文字之上（CSS2.1 App.E），量測採雙 keyframe 極值＋前景合成**。
- **載重字串／結構一字不可改**（下節清單）；新增裝飾一律 `aria-hidden="true"` 無文字。
- **commit 紀律**：平行 session 有未 commit 變更——每 commit 只 stage 任務列出檔案；訊息尾 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`。ledger `.superpowers` 路徑被 ignore 規則蓋到但檔案已追蹤——用 `git add -f .superpowers/sdd/progress.md`。
- `eslint.config.js` 保護不可改；不得繞 hooks；gate 拋棄式 .mjs 只放 session scratchpad。**實作者 commit 前對動過的檔跑 `npx prettier --check`**（批④教訓：CI 第一關）。
- e2e 全電池既有失敗勿當基線；gate 只跑 live-smoke（chromium）；紅的用 base-worktree 對照法歸因。

## 載重字串與選擇器（不可變更）

| 面        | 來源                                                                 | 內容                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| join      | live-smoke:101-102、live-advanced:48-49、assignments-live:222-223    | label `課堂代碼`（htmlFor=live-join-code）；button `加入課堂`/`加入中…`；h1 `加入課堂挑戰`；`輸入老師公布的課堂代碼，即可進入等待室。`；error `請輸入六位數字課堂代碼`/`代碼無效或課堂尚未開放，請向老師確認。`/`嘗試次數過多，請稍候一分鐘再試。`/`目前無法加入課堂，請稍後重試。`；input `placeholder="000000"`、maxLength=6、inputMode=numeric、`data-interaction-group="live-join"`                                |
| session   | live-smoke:61,103、live-advanced:50,136-137,277、assignments-live:90 | `等待主持人開始…`；`已收到你的答案，等待其他同學…`；heading `答對了                                                                                                                                                                                                                                                                                                                                                    | 答錯了` regex（FeedbackPhase h2 內容格式不可變）；streak 列（**live-streak-badge 結構與文字完全不動**）；`課堂挑戰` h1；`已加入這場挑戰！`；`目前第 N 名`；`挑戰結束！`；`回章節`；`重新輸入代碼`；FullscreenResult 全屏綠紅（**本批不動**：獨立於 scene 之外） |
| presenter | helpers/live.ts:29,32、live-smoke:48,53,130、live-advanced:229-246   | aria-label `投影模式`（role=dialog）；aria-label `課堂代碼`（`.live-presenter__code`）；**結構性 locator：`.live-presenter__question h2` 與 `.live-presenter__options li`（e2e 由投影讀題文對答案——DOM 層級與 class 不可動）**；`.live-presenter__wall-chip` count 斷言（class 不可改名）；heading `最終頒獎台`；button `離開投影`/`取消挑戰`/`確認取消挑戰`/`已靜音`/`音效開啟`；footer 按鈕文字由 teacher 端傳入不動 |

loading／error 早退 branch（route-panel）一律不掛 scene class（既批慣例）。

## File Structure

- Modify: `src/features/live/pages/live-join-page.tsx`（section className＋form className＋watch 六格）
- Modify: `src/features/live/pages/live-session-page.tsx`（section className＋live-waiting 營火 span；其餘 JSX 不動）
- Modify: `src/features/live/components/live-presenter.tsx`（podium 三寶石＋煙火 aria-hidden span；其餘 JSX 不動）
- Modify: `src/features/live/pages/live-pages.test.tsx`＋`src/features/live/components/live-presenter.test.tsx`（場景/裝飾斷言）
- Modify: `src/styles/globals.css`（批⑤a 區塊；`.live-presenter` 底色 token 一行就地改）
- Create: `artifacts/design-audit/batch5a/`（Task 4）；Modify: `.superpowers/sdd/progress.md`（append）
- 不動：hooks、lib（live-clock/phase-view/audio）、types、OptionButton、live-team-scoreboard.tsx、FullscreenResult 分支

---

### Task 1: 召集令（/app/live/join＝夜景＋六格咒文石板＋錯誤震動）

**Files:**

- Modify: `src/features/live/pages/live-join-page.tsx`
- Modify: `src/features/live/pages/live-pages.test.tsx`
- Modify: `src/styles/globals.css`

**Interfaces:**

- Consumes: 既有 `.scene-night` base、`.rpg-window` 邊框配方（globals.css:4740，抄配方）、react-hook-form 既有 `watch`
- Produces: `.rune-slots`/`.rune-slot`/`.rune-slot--lit` 裝飾 class

- [ ] **Step 1: 寫失敗測試（live-pages.test.tsx 新增；沿用檔內 LiveJoinPage 既有 render harness；輸入互動用檔內既有慣例——userEvent 或 fireEvent.change）**

```tsx
it('renders the summons scroll: night scene and six rune slots lighting per typed digit', async () => {
  // 沿用檔內既有 LiveJoinPage render 後：
  expect(document.querySelector('.live-join.scene-night')).not.toBeNull();
  const slotsWrap = document.querySelector('.rune-slots');
  expect(slotsWrap).not.toBeNull();
  expect(slotsWrap).toHaveAttribute('aria-hidden', 'true');
  expect(slotsWrap).toHaveTextContent('');
  expect(document.querySelectorAll('.rune-slot')).toHaveLength(6);
  expect(document.querySelectorAll('.rune-slot--lit')).toHaveLength(0);
  await userEvent.type(screen.getByLabelText('課堂代碼'), '123');
  expect(document.querySelectorAll('.rune-slot--lit')).toHaveLength(3);
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm vitest run src/features/live/pages/live-pages.test.tsx`
Expected: 新例 FAIL，既有例全綠

- [ ] **Step 3: JSX（live-join-page.tsx）**

(a) useForm 解構加 `watch`（37-44 行），並取值：

```tsx
const {
  formState: { errors },
  handleSubmit,
  register,
  watch,
} = useForm<JoinValues>({
  defaultValues: { joinCode: '' },
  resolver: zodResolver(joinSchema),
});
const typedCode = watch('joinCode');
```

(b) section（47 行）：

```tsx
<section aria-labelledby="live-join-title" className="live-join scene-night">
```

(c) form（53 行）加 className（`data-interaction-group` 與 onSubmit 原樣保留）：

```tsx
<form
  className="live-join__form"
  data-interaction-group="live-join"
```

(d) label 與 input 之間（72-73 行之間）插入六格：

```tsx
<span aria-hidden="true" className="rune-slots">
  {Array.from({ length: 6 }, (_, index) => (
    <span
      className={
        index < typedCode.trim().length
          ? 'rune-slot rune-slot--lit'
          : 'rune-slot'
      }
      key={index}
    />
  ))}
</span>
```

- [ ] **Step 4: 跑測試確認通過**

Run: `pnpm vitest run src/features/live/pages/live-pages.test.tsx`
Expected: 全綠

- [ ] **Step 5: CSS（globals.css，新註解區 `── 批⑤a Live 團體戰`，接在批④區塊後）**

```css
/* ── 批⑤a 召集令(/app/live/join;spec §5:六格咒文石板逐格點亮、錯誤震動) ──
   scene-night 沿用既有 base;本頁深色面文字逐條設色(外溢鐵律)。 */
.scene-night.live-join {
  padding: 48px 16px 64px;
}

.live-join > header .route-panel__eyebrow {
  /* 正典修法 b(globals.css:288 上方註解):pill 轉透明坐夜底。 */
  border-color: var(--pixel-gold);
  background: transparent;
  color: var(--pixel-gold);
}

.live-join > header h1 {
  font-family: var(--font-pixel-tc);
  font-size: 22px;
  color: var(--pixel-window-ink);
}

.live-join > header p {
  color: var(--pixel-window-muted);
}

/* 召集令窗:夜窗配方(同 .rpg-window,globals.css:4740;不掛 class 免容器色注入表單)。 */
.live-join__form {
  max-width: 440px;
  margin: 24px auto 0;
  background: var(--pixel-night);
  border: 3px solid var(--pixel-window-frame);
  outline: 2px solid var(--pixel-night);
  box-shadow:
    0 0 0 5px var(--pixel-window-frame),
    4px 4px 0 var(--pixel-shadow);
  border-radius: var(--radius-pixel);
  padding: 20px 24px;
}

.live-join__form label {
  color: var(--pixel-window-ink);
}

/* 六格咒文石板(.rune-slot* 素材批換裝介面);逐格點亮=實色,禁 opacity。 */
.rune-slots {
  display: flex;
  gap: 8px;
  margin: 12px 0;
}

.rune-slot {
  width: 24px;
  height: 30px;
  border: 2px solid var(--pixel-window-muted);
  border-radius: var(--radius-pixel);
  background: var(--pixel-night-deep);
}

.rune-slot--lit {
  border-color: var(--pixel-gold);
  background: var(--pixel-gold);
  box-shadow: 2px 2px 0 var(--pixel-shadow);
}

/* 錯誤震動:alert 出現時單發 shake(一次性 240ms,transform only;
   一次性動畫由全域 [data-reduced-motion] 縮時承接,@media 顯式關)。 */
.live-join__form p[role='alert'] {
  color: var(--pixel-danger);
  animation: rune-shake 240ms steps(4, jump-none);
}

@keyframes rune-shake {
  25% {
    transform: translateX(-4px);
  }

  75% {
    transform: translateX(4px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .live-join__form p[role='alert'] {
    animation: none;
  }
}
```

- [ ] **Step 6: 逐面自查**

深色面：header 三行＋form label＋alert（已逐條設色）；input 反白由既有 `.scene-night input` 規則（globals.css:4857）承接——實測；`加入課堂` primary-action 自帶底＋批② `.scene-night .primary-action` 字色修正已存在；375px 六格單行不換行。

- [ ] **Step 7: 驗證與 commit**

Run: `pnpm vitest run src/features/live/pages/live-pages.test.tsx && pnpm lint && pnpm typecheck && npx prettier --check src/features/live/pages/live-join-page.tsx src/features/live/pages/live-pages.test.tsx src/styles/globals.css`
Expected: 全綠

```bash
git add src/features/live/pages/live-join-page.tsx src/features/live/pages/live-pages.test.tsx src/styles/globals.css
git commit -m "feat(live): summons-scroll join page with rune slots and error shake

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: 公會團體戰（/app/live/:id 學生端＝夜景營地／戰陣）

**Files:**

- Modify: `src/features/live/pages/live-session-page.tsx`
- Modify: `src/features/live/pages/live-pages.test.tsx`
- Modify: `src/styles/globals.css`

**Interfaces:**

- Consumes: 既有 `.scene-night`、`.question-card`／OptionButton（不動）、Task 1 的批⑤a CSS 區塊
- Produces: `.live-guild-raid` 版型 class、`.camp-fire` 裝飾 class

**深色面設色清單（逐條，缺一 gate 擋）**——淺色面（question-card fieldset、OptionButton 四色、live-explanation、live-standing-card、live-distribution track）維持淺底墨字不動；深色面：

| 元素                                                                           | 覆蓋                                                                     |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| header `.route-panel__eyebrow`                                                 | 透明 pill＋`--pixel-gold`（正典修法 b）                                  |
| header h1                                                                      | `--font-pixel-tc`（字色由既有 `.scene-night h1,h2` 規則承接）            |
| lobby/paused/completed/cancelled 的 h2                                         | 既有 `.scene-night h1,h2`（globals.css:4925）承接——gate 實測             |
| 直接坐夜底的 `<p>`（人數、暫停說明、成績、`已收到…`、`等待主持人進入下一題…`） | `--pixel-window-muted`                                                   |
| `第 N / M 題`＋倒數 p                                                          | 同上組選擇器命中 → `--pixel-window-muted`，倒數 strong 繼承              |
| completed `ol[aria-label='前三名'] li`                                         | `--pixel-window-ink`                                                     |
| FeedbackPhase 題文 p 與 `.live-distribution` li 文字                           | `--pixel-window-ink`                                                     |
| `.live-waiting`（Late Join 營地）                                              | 夜窗配方＋營火裝飾                                                       |
| `.live-streak-badge`                                                           | 夜景預設 ink（--pixel-window-ink）——裁定：對比鐵律優先於 match-base 字面 |
| `.live-team-scoreboard`（零樣式裸 section）                                    | `--pixel-window-ink` 顯式設色                                            |
| FullscreenResult                                                               | **不動**（獨立全屏綠紅，未掛 scene）                                     |

- [ ] **Step 1: 寫失敗測試（live-pages.test.tsx 新增；沿用檔內 LiveSessionPage 既有 harness——先讀檔；若無 waiting-for-next fixture 則擴充測試檔 fixture）**

```tsx
it('dresses the student session as a night guild raid with a camp fire while waiting', async () => {
  // 以檔內 waiting-for-next 態 state render 後：
  expect(
    document.querySelector('.live-session-shell.scene-night.live-guild-raid'),
  ).not.toBeNull();
  const fire = document.querySelector('.live-waiting .camp-fire');
  expect(fire).not.toBeNull();
  expect(fire).toHaveAttribute('aria-hidden', 'true');
  expect(fire).toHaveTextContent('');
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm vitest run src/features/live/pages/live-pages.test.tsx`
Expected: 新例 FAIL，既有例全綠

- [ ] **Step 3: JSX（live-session-page.tsx）**

(a) 主 section（350-354 行）：

```tsx
<section
  aria-labelledby="live-session-title"
  className="live-session-shell page-mid scene-night live-guild-raid"
>
```

（error 早退 route-panel、FullscreenResult 分支不動。）

(b) `waiting-for-next` 分支 live-waiting div（372 行）內、h2 之前插入：

```tsx
<span aria-hidden="true" className="camp-fire" />
```

- [ ] **Step 4: 跑測試確認通過**

Run: `pnpm vitest run src/features/live/pages/live-pages.test.tsx`
Expected: 全綠

- [ ] **Step 5: CSS（globals.css，批⑤a 區塊續）**

```css
/* ── 批⑤a 公會團體戰(/app/live/:id 學生端;Late Join=營地等待;
   ATB=速度計分由投影 CountdownRing+批② quiz ATB 承載) ── */
.live-guild-raid > header .route-panel__eyebrow {
  border-color: var(--pixel-gold);
  background: transparent;
  color: var(--pixel-gold);
}

.live-guild-raid > header h1 {
  font-family: var(--font-pixel-tc);
  font-size: 22px;
}

/* 直接坐夜底的段落文字。淺色子卡(question-card/standing-card/explanation/
   scoreboard)各自帶底,選擇器限定 div 直接子 p 與 role=status,避開卡內文字。 */
.live-guild-raid > div > p,
.live-guild-raid > div > div > p,
.live-guild-raid p[role='status'] {
  color: var(--pixel-window-muted);
}

.live-guild-raid > div > ol[aria-label='前三名'] li {
  color: var(--pixel-window-ink);
}

.live-guild-raid .live-distribution li {
  color: var(--pixel-window-ink);
}

/* streak badge:既有火焰字色不得被上方 role=status 規則改變——顯式還原
   (實作時 rendered 比對 base 字色,以 base 實值填入 var 名;若 base 即
   繼承色則此規則刪除)。 */
.live-guild-raid .live-streak-badge {
  color: var(--pixel-gold);
}

/* Late Join 營地:夜窗+營火(.camp-fire 素材批換裝介面)。 */
.live-guild-raid .live-waiting {
  background: var(--pixel-night);
  border: 3px solid var(--pixel-window-frame);
  outline: 2px solid var(--pixel-night);
  box-shadow:
    0 0 0 5px var(--pixel-window-frame),
    4px 4px 0 var(--pixel-shadow);
  border-radius: var(--radius-pixel);
  padding: 20px 24px;
  text-align: center;
}

.camp-fire {
  display: inline-block;
  width: 20px;
  height: 24px;
  margin-bottom: 8px;
  background: var(--pixel-gold);
  clip-path: polygon(
    50% 0,
    78% 30%,
    100% 62%,
    82% 100%,
    18% 100%,
    0 62%,
    22% 30%
  );
  animation: camp-flicker 0.3s steps(2, jump-none) infinite alternate;
}

@keyframes camp-flicker {
  from {
    opacity: 1;
  }

  to {
    opacity: 0.72;
  }
}

@media (prefers-reduced-motion: reduce) {
  .camp-fire {
    animation: none;
  }
}

[data-reduced-motion='true'] .camp-fire {
  animation: none;
}
```

**實作註**：`.live-streak-badge` 既有規則在 globals.css:1178——先查其 base 字色。裁定：夜景下取夜景預設 `--pixel-window-ink`，對比鐵律優先於 match-base 字面（原「badge 字色不得與 base 不同」的計畫文字已由 owner 級 4.5:1 對比鐵律取代——base=淺頁 ink-900，夜底不可讀）。

- [ ] **Step 6: 逐面自查**

依上表逐列；OptionButton 四色格字×各色底 rendered 實測；`.live-standing-card`/`.live-explanation` 維持淺底墨字；`.live-team-scoreboard`（零樣式裸 section，計畫原文誤列為淺卡）顯式設色 `--pixel-window-ink`；FullscreenResult 無 scene 不受影響；375px 選項格與分布條不溢出。

- [ ] **Step 7: 驗證與 commit**

Run: `pnpm vitest run src/features/live && pnpm lint && pnpm typecheck && npx prettier --check src/features/live/pages/live-session-page.tsx src/features/live/pages/live-pages.test.tsx src/styles/globals.css`
Expected: 全綠

```bash
git add src/features/live/pages/live-session-page.tsx src/features/live/pages/live-pages.test.tsx src/styles/globals.css
git commit -m "feat(live): night guild-raid student session with camp-fire late join

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: 投影幕（?presenter=1＝旗幟牆＋軍勢分布＋頒獎台三寶石加冕與煙火）

**Files:**

- Modify: `src/features/live/components/live-presenter.tsx`
- Modify: `src/features/live/components/live-presenter.test.tsx`
- Modify: `src/styles/globals.css`（含 `.live-presenter` 底色一行就地改）

**Interfaces:**

- Consumes: 既有 `.live-presenter` 深色舞台（globals.css:4692）、podium/wall/chart 既有結構
- Produces: `.podium-gems`／`.podium-fireworks` 裝飾 class

**結構鐵律**：`.live-presenter__question h2`、`.live-presenter__options li`、`.live-presenter__wall-chip`、aria-label `課堂代碼`／`投影模式` 的 DOM 與 class 一字不動。

- [ ] **Step 1: 寫失敗測試（live-presenter.test.tsx 新增；沿用檔內 podium 態 fixture——先讀檔）**

```tsx
it('crowns the champion with tri-gems and textless fireworks on the podium', () => {
  // 以檔內既有 podium 態 render 後：
  const gems = document.querySelector(
    '.live-presenter__podium-step--1 .podium-gems',
  );
  expect(gems).not.toBeNull();
  expect(gems).toHaveAttribute('aria-hidden', 'true');
  expect(gems).toHaveTextContent('');
  const fireworks = document.querySelectorAll('.podium-fireworks');
  expect(fireworks).toHaveLength(2);
  for (const spark of fireworks) {
    expect(spark).toHaveAttribute('aria-hidden', 'true');
    expect(spark).toHaveTextContent('');
  }
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm vitest run src/features/live/components/live-presenter.test.tsx`
Expected: 新例 FAIL，既有例全綠

- [ ] **Step 3: JSX（live-presenter.tsx podium 分支，436-458 行）**

(a) `live-presenter__podium-stage` div 內、h2 之前插入：

```tsx
<span
  aria-hidden="true"
  className="podium-fireworks podium-fireworks--left"
/>
<span
  aria-hidden="true"
  className="podium-fireworks podium-fireworks--right"
/>
```

(b) podium li 內、`.live-presenter__podium-rank` span 之前插入（li class 與既有子順序不動）：

```tsx
{
  entry.rank === 1 ? <span aria-hidden="true" className="podium-gems" /> : null;
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `pnpm vitest run src/features/live/components/live-presenter.test.tsx`
Expected: 全綠

- [ ] **Step 5: CSS**

(a) 就地改 `.live-presenter` 底色一行（globals.css:4699）：`background: var(--slate-950);` → `background: var(--pixel-night-deep);`（spec §4.1 Live＝夜空 navy 正規化；其餘宣告不動）。

(b) 批⑤a 區塊續：

```css
/* ── 批⑤a 投影幕(spec §5:旗幟牆/四色軍勢/Top5 英雄榜/頒獎台三寶石+煙火) ── */
/* 旗幟牆:名條 chip 改三角旗尾(class 不改名,count 斷言沿用)。 */
.live-presenter__wall-chip {
  border: 2px solid var(--pixel-window-frame);
  border-radius: var(--radius-pixel);
  clip-path: polygon(0 0, 100% 0, 100% 70%, 50% 100%, 0 70%);
  padding-bottom: 14px;
}

/* 軍勢分布:條尾階梯緣(僅 clip fill;四色與 correct 既有規則不動)。 */
.live-presenter__chart-fill {
  clip-path: polygon(
    0 0,
    100% 0,
    calc(100% - 6px) 33%,
    100% 66%,
    calc(100% - 6px) 100%,
    0 100%
  );
}

/* Top5 英雄榜:夜窗框。 */
.live-presenter__standings {
  border: 3px solid var(--pixel-window-frame);
  outline: 2px solid var(--pixel-night-deep);
  box-shadow: 0 0 0 5px var(--pixel-window-frame);
  border-radius: var(--radius-pixel);
  padding: 16px 20px;
}

/* 頒獎台舞台:供煙火絕對定位。 */
.live-presenter__podium-stage {
  position: relative;
}

/* 冠軍三寶石加冕(品牌三色=三原色寶石,spec §2)。 */
.podium-gems {
  position: relative;
  display: block;
  width: 12px;
  height: 12px;
  margin: 0 auto 6px;
  background: var(--cobalt-600);
  box-shadow:
    -18px 4px 0 var(--coral-700),
    18px 4px 0 var(--jade-600);
  clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%);
}

/* 煙火:雙發交替(星點=box-shadow 陣;僅 opacity/transform)。 */
.podium-fireworks {
  position: absolute;
  width: 6px;
  height: 6px;
  background: var(--pixel-gold);
  box-shadow:
    -16px -12px 0 var(--coral-700),
    16px -12px 0 var(--cobalt-600),
    -12px 14px 0 var(--jade-600),
    14px 12px 0 var(--pixel-gold),
    0 -20px 0 var(--pixel-window-frame);
  animation: fireworks-burst 1.2s steps(3, jump-none) infinite;
}

.podium-fireworks--left {
  top: 96px;
  left: 12%;
}

.podium-fireworks--right {
  top: 72px;
  right: 12%;
  animation-delay: 0.6s;
}

@keyframes fireworks-burst {
  0% {
    opacity: 0;
    transform: scale(0.4);
  }

  40% {
    opacity: 1;
    transform: scale(1);
  }

  100% {
    opacity: 0;
    transform: scale(1.4);
  }
}

@media (prefers-reduced-motion: reduce) {
  .podium-fireworks {
    animation: none;
    opacity: 0.9;
  }
}

[data-reduced-motion='true'] .podium-fireworks {
  animation: none;
  opacity: 0.9;
}
```

- [ ] **Step 6: 逐面自查**

底色換 token 後全部既有文字面（bar、code、wall、question h2、options、chart label/count、standings、podium、footer）×`--pixel-night-deep` rendered 實測；旗尾 clip 不裁到名字（padding-bottom 已留）；煙火絕對定位於 stage 上緣兩側不壓文字；1920×1080 僅裝飾不動字級。

- [ ] **Step 7: 驗證與 commit**

Run: `pnpm vitest run src/features/live && pnpm lint && pnpm typecheck && npx prettier --check src/features/live/components/live-presenter.tsx src/features/live/components/live-presenter.test.tsx src/styles/globals.css`
Expected: 全綠

```bash
git add src/features/live/components/live-presenter.tsx src/features/live/components/live-presenter.test.tsx src/styles/globals.css
git commit -m "feat(live): projector banner wall, army chart edges, tri-gem podium with fireworks

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Batch Gate（驗證與證據＋1080p 投影驗證）

**Files:**

- Create: `artifacts/design-audit/batch5a/`
- Modify: `.superpowers/sdd/progress.md`（append；`git add -f`）

**Interfaces:**

- Consumes: Tasks 1-3 commits；scratchpad 的 gate-capture.mjs（蒸發則按 batch4 contrast.md 方法重建於 scratchpad）

- [ ] **Step 1: 靜態全套**

Run: `pnpm lint && pnpm typecheck && pnpm vitest run`
Expected: 全綠；另 `npx prettier --check` 對本批動過的 6 個源/測檔全過

- [ ] **Step 2: raw hex 與 token 檢查**

Run: `git diff 5fe46ef..HEAD -- src/ ':!src/styles/tokens.css' | grep -E '^\+.*#[0-9a-fA-F]{3,8}\b'`
Expected: 無輸出

Run: `git diff 5fe46ef..HEAD -- src/styles/tokens.css src/styles/tokens.test.ts`
Expected: 空

- [ ] **Step 3: 載重字串完整性（與 `git show 5fe46ef:<file>` 計數比對）**

```bash
for s in 課堂代碼 加入課堂 加入課堂挑戰; do echo "$s:"; grep -c "$s" src/features/live/pages/live-join-page.tsx; git show 5fe46ef:src/features/live/pages/live-join-page.tsx | grep -c "$s"; done
for s in 等待主持人開始 已收到你的答案 課堂挑戰 連擊; do echo "$s:"; grep -c "$s" src/features/live/pages/live-session-page.tsx; git show 5fe46ef:src/features/live/pages/live-session-page.tsx | grep -c "$s"; done
for s in 最終頒獎台 投影模式 課堂代碼 離開投影; do echo "$s:"; grep -c "$s" src/features/live/components/live-presenter.tsx; git show 5fe46ef:src/features/live/components/live-presenter.tsx | grep -c "$s"; done
diff <(grep -o "live-presenter__question\|live-presenter__options\|live-presenter__wall-chip" src/features/live/components/live-presenter.tsx | sort | uniq -c) <(git show 5fe46ef:src/features/live/components/live-presenter.tsx | grep -o "live-presenter__question\|live-presenter__options\|live-presenter__wall-chip" | sort | uniq -c)
```

Expected: 全部前後一致；最後一條 diff 空

- [ ] **Step 4: 目標 e2e**

Run: `npx playwright test tests/e2e/live-smoke.spec.ts --project=chromium`
Expected: 綠（等待室→十題→頒獎台全程，涵蓋三面）；紅則 base-worktree（5fe46ef）對照歸因

- [ ] **Step 5: 截圖證據 → `artifacts/design-audit/batch5a/`**

以 live-smoke 同套 helper 驅動真實場次拍 8 張：`join-desktop.png`＋`join-375.png`（含輸入 3 碼點亮態）、`student-lobby.png`、`student-question.png`、`student-feedback.png`、`presenter-lobby-1080p.png`（1920×1080）、`presenter-question-1080p.png`、`presenter-reveal-1080p.png`、`presenter-podium-1080p.png`。逐張檢視：石板點亮、夜窗、營火（如可達 waiting 態）、旗幟牆、軍勢條階梯緣、三寶石＋煙火、無溢出、無同色字。**1080p 四張＝spec §6 投影驗證的 CI 近似（現場實測待 owner 課堂）**。

- [ ] **Step 6: rendered 對比實測（含 opacity 合成＋D1/D2 規約）→ contrast.md**

方法節開頭寫入修正版 D1 前提（positioned z-index:auto **必然**覆蓋 in-flow 文字——無條件；覆蓋層量測採雙 keyframe 極值＋前景合成）與 D2（gradient 面取最深端）。配對：

- join：header 三行×night-deep；label/alert×夜窗；input 字×input 底。
- session：eyebrow/h1×夜底；status/p 組×夜底；distribution li×夜底；OptionButton 四色格字×各色底；standing-card/explanation/scoreboard 文字×各自淺底；streak badge 字色與 base 一致性比對。
- presenter（底色換 token 後全量）：bar 文字/按鈕、code、count、wall-chip 名字、question h2、options li、chart label/count（含 correct 態）、standings li、podium li 文字、footer 按鈕。

- [ ] **Step 7: console 乾淨**

join／session（lobby 態）／presenter（lobby 態）各載入：console error＝0、pageerror＝0（AudioContext 警告若 base 同現則記錄不計）。

- [ ] **Step 8: 記錄與 commit**

`.superpowers/sdd/progress.md` append batch-5a 段落。

```bash
git add artifacts/design-audit/batch5a
git add -f .superpowers/sdd/progress.md
git commit -m "test(gate): batch-5a live raid gate evidence

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## 風險與備註

- **live-smoke 是全鏈路 e2e**（投影讀題→學生答題）——`.live-presenter__question h2`／`__options li` 結構依賴最尖銳；Task 3 只加兄弟裝飾與 CSS。
- **`.live-presenter` 容器級 color:white 為既有自足設計**：本批不改其模式，僅換底色 token；淺色卡不進投影幕。
- **streak badge e2e 斷言與元件現況的既有出入**（emoji/全形驚嘆號 vs Icon/半形）＝base 既有狀態，本批零接觸不修不碰。
- **FullscreenResult（screen_only 題間全屏綠紅）零接觸**。
- **ATB**：由投影 CountdownRing（既有環）＋批② quiz ATB 承載；學生端 ATB 條視覺記 deferred（素材批）。
- 素材批換裝點：`.rune-slot*`、`.camp-fire`、`.podium-gems`、`.podium-fireworks*`、旗尾/條尾 clip-path。
- Deferred：投影旗幟牆背景紋理、chart 軍旗頭、頒獎台階高低差、學生端 ATB 條、批④遺留（leaderboard-table 375 溢出等）。
