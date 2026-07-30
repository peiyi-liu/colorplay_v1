# JRPG 像素風 批次①「世界觀定調」Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 為五個畫面換上 JRPG 像素皮膚——標題畫面（/login）、命名之儀（/register）、教會回復（/forgot-password、/reset-password）、村莊廣場大廳（/app）——建立日夜場景語言，全站改版自此定調。

**Architecture:** CSS-scene-first：新增 `.scene-night`／`.scene-day` 場景底座與像素元件樣式（globals.css 附加），頁面 JSX 只做最小結構調整（掛場景類名、表單包進 P0 的 `RpgWindow`、加 PRESS START 與 HUD 包裝）。互動邏輯、表單驗證、路由、API 呼叫一律不動。村莊 tile 背景與精靈 sprite 等美術素材依規格延後，本批用純 CSS（星空點陣、羊皮紙面）呈現場景。

**Tech Stack:** React 19 + TypeScript、CSS custom properties（P0 的 `--pixel-*` token）、`RpgWindow` 元件、Vitest + RTL、Playwright（design-audit 截圖）。

**規格依據:** `docs/superpowers/specs/2026-07-31-jrpg-pixel-restyle-design.md` §4–§5（已核准）。P0 已完成（ledger：`.superpowers/sdd/progress.md`）。

## Global Constraints

- 分支：`feature/v2-major-update`；**不得推 main、不得部署**。
- 色彩僅能用 `var(--…)`（tokens.css 既有＋P0 的 `--pixel-*`）；**不得新增裸 hex**；若需新 token，加進 tokens.css 並同步 tokens.test 釘值。
- 行為零變更：不改任何 handler、schema、API、路由、redirect 邏輯；只動 className、包裝結構與純展示元素。
- 像素容器一律用 `RpgWindow`（`src/components/ui/rpg-window.tsx`，`title?: ReactNode`）；夜景硬位移陰影 `4px 4px 0`。
- 無障礙：文字對比 4.5:1（羊皮紙上金字用 `--pixel-gold-deep`）、觸控 44px、鍵盤焦點可見、`prefers-reduced-motion` 降級、像素字渲染 ≥16px（Cubic 11 用 22px＝11×2）。
- 既有測試不得紅；測試修改僅限「本批刻意改變的結構／文案」對應的斷言。
- 每個 commit 訊息結尾：`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`。
- 驗證：`pnpm lint && pnpm typecheck && pnpm test`；本批畫面另需 375px 與 1280px 截圖（Task 5）。

---

### Task 1: 場景與像素元件 CSS 底座

**Files:**
- Modify: `src/styles/globals.css`（檔尾追加，append-only）

**Interfaces:**
- Produces（Task 2–4 引用的類名）：`.scene-night`、`.scene-day`、`.press-start`、`.auth-window`、`.hud-bar`、`.pixel-heading`。

- [ ] **Step 1: 在 `src/styles/globals.css` 檔尾追加**

```css
/* ── 批次① JRPG 場景底座(spec §4;日夜場景見 CONTEXT.md Day/Night Scene) ── */

/* 夜景:標題畫面/命名之儀/教會回復。星空以 box-shadow 點陣繪製,無圖片素材。 */
.scene-night {
  position: relative;
  background: var(--pixel-night-deep);
  color: var(--pixel-window-ink);
  min-height: 100%;
  padding: 48px 16px 64px;
}

.scene-night::before {
  content: '';
  position: absolute;
  top: 24px;
  left: 12%;
  width: 4px;
  height: 4px;
  background: var(--pixel-window-frame);
  box-shadow:
    120px 40px 0 var(--pixel-window-frame),
    260px 12px 0 var(--pixel-window-muted),
    420px 64px 0 var(--pixel-window-frame),
    560px 28px 0 var(--pixel-window-muted),
    680px 84px 0 var(--pixel-window-frame),
    80px 120px 0 var(--pixel-window-muted),
    340px 140px 0 var(--pixel-window-frame),
    520px 156px 0 var(--pixel-window-muted),
    720px 180px 0 var(--pixel-window-frame),
    180px 200px 0 var(--pixel-window-frame);
  opacity: 0.9;
  pointer-events: none;
}

.scene-night > * {
  position: relative;
}

/* 日景:村莊廣場。羊皮紙頁底;tile 村莊背景屬素材批,先以純色呈現。 */
.scene-day {
  background: var(--pixel-parchment);
  padding-bottom: 48px;
}

/* 像素標題:繁中 Cubic 11 用 11 的整數倍(22px);拉丁徽標另用 Press Start 2P。 */
.pixel-heading {
  font-family: var(--font-pixel-tc);
  font-size: 22px;
  line-height: 1.5;
  letter-spacing: 0.02em;
}

/* PRESS START 閃爍(steps 硬切;reduced-motion 時恆亮)。 */
.press-start {
  font-family: var(--font-pixel-latin);
  font-size: 16px;
  letter-spacing: 0.14em;
  text-align: center;
  color: var(--pixel-gold);
  margin: 16px 0 0;
  animation: press-start-blink 1.2s steps(2, jump-none) infinite;
}

@keyframes press-start-blink {
  50% {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .press-start {
    animation: none;
  }
}

/* 夜景中的認證對話窗:置中、限制寬度;RpgWindow 供底與框。 */
.auth-window {
  max-width: 440px;
  margin: 24px auto 0;
}

.auth-window .rpg-window__body {
  font-size: 16px;
}

/* 夜景下表單控件反白(僅外觀;不動任何表單邏輯)。 */
.scene-night input,
.scene-night select {
  background: var(--paper);
  color: var(--ink-900);
  border-radius: var(--radius-pixel);
  min-height: 44px;
}

.scene-night a {
  color: var(--pixel-window-muted);
}

.scene-night :focus-visible {
  outline: 3px solid var(--pixel-gold);
  outline-offset: 2px;
}

/* 村莊 HUD 條:包住 StudentSummaryCard 的夜空窗橫幅(Lv/EXP/金幣)。 */
.hud-bar {
  background: var(--pixel-night);
  color: var(--pixel-window-ink);
  border: 3px solid var(--pixel-window-frame);
  box-shadow:
    0 0 0 5px var(--pixel-window-frame),
    4px 4px 0 var(--pixel-shadow);
  border-radius: var(--radius-pixel);
  padding: 12px 16px;
  margin-bottom: 24px;
}

/* HUD 內既有卡片元件透明化,由 HUD 條供底(不改元件本身)。 */
.hud-bar .card,
.hud-bar [class*='card'] {
  background: transparent;
  border: none;
  box-shadow: none;
  color: inherit;
}

/* 日景中的大廳白卡改為羊皮紙卡+金邊(覆蓋既有 .lobby-panel 外觀)。 */
.scene-day .lobby-panel {
  background: var(--pixel-parchment-card);
  border: 2px solid var(--pixel-gold-deep);
  border-radius: var(--radius-pixel);
  box-shadow: 4px 4px 0 var(--pixel-shadow);
}

.scene-day .lobby-panel h1 {
  font-family: var(--font-pixel-tc);
  font-size: 22px;
}
```

- [ ] **Step 2: 驗證**

Run: `pnpm lint && pnpm typecheck && pnpm vitest run src/styles/tokens.test.ts`
Expected: 全綠（純 CSS 追加，不影響任何測試）。

- [ ] **Step 3: Commit**

```bash
git add src/styles/globals.css
git commit -m "feat(styles): add JRPG batch-1 scene foundation (night/day, press-start, hud-bar)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: 標題畫面 /login

**Files:**
- Modify: `src/features/auth/pages/login-page.tsx`
- Test: `src/features/auth/pages/login-page.test.tsx`

**Interfaces:**
- Consumes: Task 1 類名；`RpgWindow`（`import { RpgWindow } from '../../../components/ui/rpg-window';`）。

- [ ] **Step 1: 讀 `login-page.tsx` 全檔**，確認既有結構：`<section className="route-panel auth-portal" data-portal={portal}>` 內含 `.auth-portal-brand`（SVG mark＋title＋subtitle）、`.route-panel__message`、portal fieldset、`.login-form`、教師註記。**所有 handler、schema、state 一字不動。**

- [ ] **Step 2: 修改 JSX 外殼（僅此三處）**

1. section 類名加場景：`className="route-panel auth-portal scene-night"`（保留 `data-portal`）。
2. 在 `.auth-portal-brand` 結尾（subtitle 之後）加一行：

```tsx
        <p className="press-start" aria-hidden="true">
          PRESS START
        </p>
```

3. 將「portal fieldset＋login-form＋教師註記」整段包進 RpgWindow（內容不動、順序不動）：

```tsx
      <RpgWindow className="auth-window">
        {/* 原本的 <fieldset className="login-form__portal">…、<form className="login-form">…、
            auth-portal__teacher-note 區塊原封不動搬進來 */}
      </RpgWindow>
```

（`route-panel__message` 留在窗外、brand 之下。）

- [ ] **Step 3: 跑既有測試**

Run: `pnpm vitest run src/features/auth/pages/login-page.test.tsx`
Expected: 全綠——若有斷言因包裝層級失敗（例如以 container 結構查詢），僅將該斷言改為以 role/label 查詢，不放寬任何行為驗證；並在報告中列出每一處修改前後對照。

- [ ] **Step 4: 新增一條像素皮膚斷言（附在既有 describe 尾）**

```tsx
  it('renders the PRESS START marquee on the title screen', () => {
    renderLoginPage();
    expect(screen.getByText('PRESS START')).toBeInTheDocument();
  });
```

（若該測試檔的 render helper 名稱不同，沿用該檔既有 helper；斷言內容不變。）

- [ ] **Step 5: 驗證與 Commit**

Run: `pnpm vitest run src/features/auth/pages/login-page.test.tsx && pnpm typecheck`
Expected: 全綠。

```bash
git add src/features/auth/pages/login-page.tsx src/features/auth/pages/login-page.test.tsx
git commit -m "feat(auth): restyle login as JRPG title screen (night scene, RpgWindow, PRESS START)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: 命名之儀 /register ＋ 教會回復 /forgot-password、/reset-password

**Files:**
- Modify: `src/features/auth/pages/register-page.tsx`
- Modify: `src/features/auth/pages/forgot-password-page.tsx`
- Modify: `src/features/auth/pages/reset-password-page.tsx`
- Test: `src/features/auth/pages/register-page.test.tsx`（既有；forgot/reset 若無測試檔則不新增）

**Interfaces:**
- Consumes: Task 1 類名、`RpgWindow`。

- [ ] **Step 1: 逐檔讀取三個頁面**，確認各自的 section 根元素與表單區塊。**任何 handler、schema、OTP 流程一字不動。**

- [ ] **Step 2: 對三頁做與 Task 2 相同的兩個外殼動作**

1. 根 section 類名追加 ` scene-night`（保留原類名與屬性）。
2. 表單主體（fieldset／form 及其附註）包進 `<RpgWindow className="auth-window">…</RpgWindow>`；頁面標題與說明文字留在窗外。若頁面主標題是 `h1`／`h2`，為其 className 追加 ` pixel-heading`（僅加類名，不改文字——文案調整屬後續批次，避免破壞測試與 OTP 信件對應）。

- [ ] **Step 3: 跑測試並最小修正**

Run: `pnpm vitest run src/features/auth/pages/register-page.test.tsx && pnpm vitest run src/features/auth`
Expected: 全綠；結構性斷言如失敗，僅改查詢方式（role/label），報告列對照。

- [ ] **Step 4: Commit**

```bash
git add src/features/auth/pages/register-page.tsx src/features/auth/pages/forgot-password-page.tsx src/features/auth/pages/reset-password-page.tsx src/features/auth/pages/register-page.test.tsx
git commit -m "feat(auth): night-scene RpgWindow restyle for register and password recovery pages

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: 村莊廣場大廳 /app

**Files:**
- Modify: `src/features/learning/pages/lobby-page.tsx`
- Test: `src/features/learning/pages/lobby-page.test.tsx`

**Interfaces:**
- Consumes: Task 1 類名（`.scene-day`、`.hud-bar`）。

- [ ] **Step 1: 讀 `lobby-page.tsx`**（104 行）。現有結構：`<section aria-labelledby="lobby-title" className="lobby">` → `<StudentSummaryCard />` → `.lobby-panel`（PageHeader＋pastel-grid）。錯誤分支 `.lobby--message` 一併處理。**資料流、frontierIndex 邏輯、LearningChapterCard props 一字不動。**

- [ ] **Step 2: 修改 JSX（僅此三處）**

1. 主 section：`className="lobby scene-day"`；錯誤分支 section：`className="lobby lobby--message scene-day"`。
2. HUD 包裝：`<StudentSummaryCard />` 改為

```tsx
      <div className="hud-bar">
        <StudentSummaryCard />
      </div>
```

3. 其餘不動（`.lobby-panel` 外觀由 Task 1 的 `.scene-day .lobby-panel` 接手；章節卡的告示板化與 Blook 待機動畫屬素材批，本批不做）。

- [ ] **Step 3: 跑測試並最小修正**

Run: `pnpm vitest run src/features/learning/pages/lobby-page.test.tsx`
Expected: 全綠；如有 container 結構斷言受 hud-bar 包裝影響，僅改查詢方式，報告列對照。

- [ ] **Step 4: 新增一條場景斷言（附在既有 describe 尾，沿用該檔 render helper）**

```tsx
  it('applies the day scene and HUD wrapper to the lobby', async () => {
    renderLobbyPage();
    const section = await screen.findByRole('region', {
      name: /色彩任務選擇大廳/,
    });
    expect(section).toHaveClass('scene-day');
    expect(section.querySelector('.hud-bar')).not.toBeNull();
  });
```

（若 section 未曝露為 region，改以 `container.querySelector('section.lobby')` 斷言同兩件事。）

- [ ] **Step 5: 驗證與 Commit**

Run: `pnpm vitest run src/features/learning/pages/lobby-page.test.tsx && pnpm typecheck`
Expected: 全綠。

```bash
git add src/features/learning/pages/lobby-page.tsx src/features/learning/pages/lobby-page.test.tsx
git commit -m "feat(lobby): day-scene village plaza with night-window HUD bar

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: 批次① 收尾 gate（截圖與驗證）

**Files:** 無程式變更；產出截圖至 `artifacts/design-audit/`（若該路徑 gitignored 則僅本機留存）。

- [ ] **Step 1: 全套驗證**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: 全綠（760＋本批新增斷言）。

- [ ] **Step 2: 截圖本批五畫面**

先 `ls scripts/design-audit/` 確認截圖腳本入口（screen-routes.mjs 為路由清單；capture 腳本名以實際檔案為準），啟動 `pnpm dev`（沿用該腳本預設 port），對 `/login`、`/register`、`/forgot-password`、`/app`（登入態 fixture 依腳本既有機制）擷取 1280px 與 375px 兩檔寬度。無法自動登入的畫面（/app）如腳本不支援，記錄限制並以未登入可達畫面為準。

- [ ] **Step 3: 逐張自檢**

對照 spec §5：夜景星空、PRESS START、對話窗置中（440px）、日景羊皮紙、HUD 夜空窗橫幅；375px 無橫向捲動。發現偏差列入報告（不在本 task 修）。

- [ ] **Step 4: 回報**

輸出 commit 清單、測試數字、截圖路徑清單與自檢結果。**不推遠端。**

---

## Self-Review 紀錄

- Spec 覆蓋：§5 學生端前四列（/login、/register、/forgot+/reset、/app）✓；三寶石懸浮與村莊剪影、Blook 待機動畫、格子輸入框、聖堂燭光→**素材依賴，明文延後**（spec §4.5 資產規格屬批次①後段；本批 CSS-first 定調）。§4.2 對話窗與 4px 陰影由 P0 元件承載 ✓。§4.3 字型：pixel-heading 22px＝11×2 ✓、PRESS START 16px ✓。
- Placeholder 掃描：Task 2/3 的「搬進 RpgWindow」步驟以現有區塊整段搬移＋明確禁改邏輯表述，非 TBD；Task 5 截圖腳本入口採現場確認（腳本名不可預寫死）。測試最小修正規則明確限縮（僅查詢方式、需列對照）。
- 型別一致：只引用 P0 已定案介面（`RpgWindow` className/title）與 Task 1 類名，無新型別。
