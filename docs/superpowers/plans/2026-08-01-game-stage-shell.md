# GameStage Shell（16:9 遊戲舞台外殼）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把全站（學生端／教師端／auth 頁）搬進置中 16:9 letterbox 遊戲舞台，舊 header／上排導覽退場改為遊戲 HUD（左上狀態窗＋右上資源列＋底部指令列＋MENU 收登出），進站 `/` 為遊戲標題畫面（icon＋PRESS START），一進網頁就像進遊戲。

**Architecture:** `AppShell` 重構為 `.game-viewport`（fixed 滿版 letterbox 底）→ `.game-stage`（置中 16:9、RpgWindow 雙線框、flex column：頂 HUD／可卷動 scene／底部指令列）→ 既有頁面 scene 原樣活在舞台內。直向或寬 <768px 時舞台退場＝現行 RWD 全幅＋可關閉軟橫幅。內容零 transform 縮放；路由/API/RPC/計分行為零變更，僅表現層結構。

**Tech Stack:** React 19 + react-router、CSS（globals.css 單檔慣例）、tokens.css design tokens、Vitest + Testing Library、Playwright e2e。無新依賴。

**Spec:** `docs/superpowers/specs/2026-08-01-game-stage-shell-design.md`（owner 2026-08-01 16:39 核准；§1.7/§8 標題畫面＝owner 17:05 增補）

## Global Constraints

- **行為零變更**：路由、API、RPC、計分、finalize、`rules_version` 不動；導覽仍是 `NavLink`/`Link` 路由跳轉。本批可動 TSX，但僅限表現層結構。
- **載重字串一字不改**：`主要導覽`／`教師導覽`（nav aria-label）、`學習大廳`／`課後任務實戰`／`裝備商店`／`我的錯題`／`Live 課堂`／`班級排行榜`／`成就徽章`、`教師工作區`／`Live 主持`／`班級管理`／`教學分析`、`登出`。另經盤點確認同屬載重（e2e 釘用）：`學習獎勵`（economy region aria-label）、`Level {n}`、`{cur} / {per} XP`、`{n} Token`、`{displayName}・教師端`、`跳到主要內容`。spec §4 草寫「Lv N」→ **保留現行「Level N」**（game-economy.spec.ts:81 釘 `Level 2`）。
- **結構性 e2e 斷言變更**：僅限 Task 1 盤點清單列出者，逐一顯式同步，不得靜默弄紅。已知一組預告紅（顯式，非靜默）：`app-shell.visual.spec.ts` 截圖比對於 Task 3–8 期間預期紅、Task 9 再生 snapshots 復綠——寫入 ledger。
- **禁止** `transform: scale()` 適配；對比 ≥4.5:1（rendered 實測）；觸控 ≥44px；`prefers-reduced-motion`＋`data-reduced-motion` 雙通道（本批不新增動畫，維持既有通道即可）；動畫只動 transform/opacity。
- **commit 隔離**：每 commit 只 stage 自己任務的檔案。平行 session 未 commit 變更**絕不可入 commit**：`.gitignore`、`docs/content/*`、`package.json`、`scripts/content/import-fixes.json`、`src/features/auth/pages/login-page.tsx`、`supabase/seeds/content-*.sql`、untracked `.agents/`、`.claude/`、`artifacts/`。本批也**不編輯** `src/features/auth/pages/login-page.tsx`（舞台是 shell 層，無需動它）。
- commit 前 `npx prettier --check` 動過的檔；ledger 用 `git add -f .superpowers/sdd/progress.md`；`eslint.config.js` 不可改；不得停用/繞過 hooks；gate 拋棄式腳本只放 session scratchpad。
- commit 訊息結尾：`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`。
- **勿推 main、勿部署**；分支 `feature/v2-major-update`；還原點 tag `v1-stable-20260730`。
- 素材批 design-debt 10 項中無「外殼直接相關」者；第 (6) 項死 CSS 退役指名「下個可動 TSX 批次」但標的（battle-monster／podium）非外殼範圍，**維持遞延**並於結批 ledger 註記，不混入本批。

## File Structure

| 檔案                                                                                         | 動作   | 職責                                                                                                                                              |
| -------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/shell/app-shell.tsx`                                                                | 重構   | 舞台結構＋HUD 組裝（登入/登出邏輯、idle logout、reducedMotion 原樣保留）                                                                          |
| `src/app/shell/hud-command-bar.tsx`                                                          | 新增   | 底部指令列：學生 7 項／教師 4 項導覽＋MENU 彈窗（顯示名＋登出）                                                                                   |
| `src/app/shell/rotate-banner.tsx`                                                            | 新增   | 直向軟橫幅（matchMedia portrait、sessionStorage、role="status"）                                                                                  |
| `src/app/shell/app-shell.test.tsx`                                                           | 同步   | 結構斷言與登出流程（經 MENU）同步                                                                                                                 |
| `src/app/shell/hud-command-bar.test.tsx`                                                     | 新增   | MENU 開合/Escape/登出委派單元測試                                                                                                                 |
| `src/app/shell/rotate-banner.test.tsx`                                                       | 新增   | 橫幅顯示/關閉/記憶單元測試                                                                                                                        |
| `src/styles/tokens.css`                                                                      | 修改   | 新 token `--stage-void`                                                                                                                           |
| `src/styles/tokens.test.ts`                                                                  | 修改   | 釘 `--stage-void` 值                                                                                                                              |
| `src/styles/globals.css`                                                                     | 修改   | 舞台/HUD/橫幅 CSS；退役 `.app-shell`、`.app-header*`、`.brand*`、`.student-rail*`、`.teacher-rail*`；`.skip-link`／`.live-result-screen` 錨定舞台 |
| `tests/e2e/helpers/auth.ts`                                                                  | 修改   | 新增 `signOutViaHud(page)` helper                                                                                                                 |
| `tests/e2e/{shared-device,auth-account,ui-restyle,playable-slice,session-lifecycle}.spec.ts` | 同步   | 登出改走 MENU                                                                                                                                     |
| `src/app/router/title-page.tsx`                                                              | 新增   | 遊戲標題畫面（icon＋PRESS START，Link 到 /login）                                                                                                 |
| `src/app/router/title-page.test.tsx`                                                         | 新增   | 標題畫面單元測試                                                                                                                                  |
| `src/app/router/create-app-router.tsx`                                                       | 修改   | `/` 路由 element 換 `TitlePage`（路由結構不變）                                                                                                   |
| `src/app/router/create-app-router.test.tsx`                                                  | 同步   | `/` 期望字串 `前往登入` → `PRESS START`                                                                                                           |
| `tests/e2e/app-shell.visual.spec.ts`（＋snapshots）                                          | 同步   | banner 斷言改舞台斷言、`/` action 改 PRESS START、新增 812×375、snapshots 再生                                                                    |
| `docs/superpowers/plans/2026-08-01-game-stage-shell-inventory.md`                            | 新增   | Task 1 依賴盤點清單（審查依據）                                                                                                                   |
| `.superpowers/sdd/progress.md`                                                               | 每任務 | ledger                                                                                                                                            |

DOM 目標結構（Task 6 完成後）：

```tsx
<div className="game-viewport">
  <div className="game-stage">
    <a className="skip-link" href="#main-content">跳到主要內容</a>
    <RotateBanner />                              {/* 僅直向渲染 */}
    {isAuthenticatedProfile ? <header className="hud-top">…</header> : null}
    <main id="main-content" tabIndex={-1} className="game-stage__scene"><Outlet /></main>
    {isAuthenticatedProfile && !isTeacher ? <HudCommandBar variant="student" … /> : null}
    {isTeacher ? <HudCommandBar variant="teacher" … /> : null}
  </div>
</div>
```

語意決策：頂部 HUD 保留 `<header>` 元素（banner role）＝登入後 `getByRole('banner')` 斷言存活（app-shell.test.tsx:90、:255）；未登入頁（/login 等）無 header → 僅 `app-shell.visual.spec.ts:29` 一處需同步（Task 6）。

---

### Task 1: Shell 依賴盤點（唯讀盤點＋文件，不動產品碼）

**Files:**

- Create: `docs/superpowers/plans/2026-08-01-game-stage-shell-inventory.md`

**Interfaces:**

- Produces: 盤點文件，後續 Task 3/5/6/7/8/9 的同步依據；每列格式 `檔案:行號｜依賴內容｜處置（保留字串存活／Task N 顯式同步／不碰-既知紅）`。同 commit 一併納入本計畫檔與 spec 增補（§1.7/§8 標題畫面）。

- [ ] **Step 1: 執行盤點 grep（全部唯讀）**

```bash
cd /Users/guanyucheng/Desktop/pei-game/colorplay
# A. e2e/單元測試對 header/banner/nav/登出 的依賴
grep -rn "getByRole('banner')\|app-header\|student-rail\|teacher-rail" tests/e2e src --include="*.ts" --include="*.tsx"
grep -rn "登出" tests/e2e --include="*.ts"
grep -rn "主要導覽\|教師導覽\|學習大廳\|課後任務實戰\|裝備商店\|我的錯題\|Live 課堂\|班級排行榜\|成就徽章\|教師工作區\|Live 主持\|班級管理\|教學分析" tests/e2e --include="*.ts"
# B. e2e 對 economy 字串
grep -rn "學習獎勵\|Level \| XP\| Token" tests/e2e --include="*.spec.ts"
# C. 單元測試對 shell 結構
grep -n "banner\|登出\|brand\|ColorPlay 首頁\|navigation" src/app/shell/app-shell.test.tsx
# D. fixed/sticky 全站掃（globals + 元件層）
grep -rn "position: *fixed\|position: *sticky" src/styles src/components src/features --include="*.css" --include="*.tsx"
# E. 100dvh/100vh 佔高（舞台內會撐出假卷動）
grep -rn "100dvh\|100vh" src/styles src/features --include="*.css" --include="*.tsx"
# F. toast 定位方式
grep -rn "toast" src/styles/globals.css | head -20
grep -rn "position\|className" src/components/ui/toast.tsx | head -20
# G. 教師端寬表格容器 class（overflow 守門用）
grep -n "overflow" src/styles/globals.css | sed -n '1,40p'
grep -rn "table\|__table" src/features/classrooms src/features/teacher-content src/features/live --include="*.tsx" -l
```

- [ ] **Step 2: 寫盤點文件**

`docs/superpowers/plans/2026-08-01-game-stage-shell-inventory.md`，必含（計畫撰寫時已預查的已知項，盤點須覆核並補全）：

```markdown
# GameStage Shell 依賴盤點（2026-08-01）

## A. banner role

- tests/e2e/app-shell.visual.spec.ts:29（/login 斷言 banner 可見）→ Task 6 顯式同步（改斷言 .game-stage 可見）
- src/app/shell/app-shell.test.tsx:90、:255（authenticated mock）→ header 保留於 HUD 頂列，存活不改

## B. 登出直接點擊（→ Task 5 改走 signOutViaHud）

- tests/e2e/shared-device.spec.ts:40
- tests/e2e/auth-account.spec.ts:107、:115
- tests/e2e/ui-restyle.spec.ts:101、:120
- tests/e2e/playable-slice.spec.ts:124
- tests/e2e/session-lifecycle.spec.ts:44（鍵盤焦點路徑測試 → 先鍵盤啟動 MENU 再聚焦登出，保留鍵盤可操作性驗證）
- src/app/shell/app-shell.test.tsx:388、:415、:420、:493、:498（單元測試同步：先開 MENU；profile 錯誤情境釘 fallback 登出鈕）
- 既知紅不碰：assignments-live.spec.ts / live-advanced.spec.ts（另案重寫 session 模型）

## C. economy 載重字串（HUD 沿用 EconomySummaryView，全部存活）

- tests/e2e/learning-experience.spec.ts:91（region「學習獎勵」）、:92-93、:196-197、:228-229
- tests/e2e/game-economy.spec.ts:79-83、:147（Level/XP/Token 字面）

## D. fixed/sticky（處置）

- .skip-link（globals.css:61）fixed → Task 3 改 absolute 錨舞台
- .student-rail（:1263）/.teacher-rail（:1343）sticky → Task 5 退役
- .live-result-screen（:2222）fixed → Task 8 改 absolute 錨舞台，z-index 70
- .live-presenter（:4675）fixed → 保留（投影＝全螢幕接管例外，ledger 慣例）
- （盤點補全：toast 與其他元件層 hits，逐列標處置）

## E. 100dvh

- globals.css:17（基底）保留；:56（.app-shell）Task 3 隨容器改名處理
- （盤點補全：feature 頁 hits 與處置）

## G. 教師寬表格容器

-（盤點結果：列出實際容器 class；已有 overflow 容器者標「已守門」）

## H. `/` 首頁字串（→ Task 7 標題畫面顯式同步）

- tests/e2e/app-shell.visual.spec.ts:14（routes 陣列 `前往登入`）→ 改 `PRESS START`
- src/app/router/create-app-router.test.tsx:179（`['/', 'ColorPlay', '前往登入']`）→ 改 `PRESS START`
- （盤點補全：其他引用 `前往登入`/首頁文案的測試）
```

- [ ] **Step 3: prettier 檢查與 commit**

```bash
npx prettier --check docs/superpowers/plans/2026-08-01-game-stage-shell-inventory.md docs/superpowers/plans/2026-08-01-game-stage-shell.md docs/superpowers/specs/2026-08-01-game-stage-shell-design.md
git add docs/superpowers/plans/2026-08-01-game-stage-shell-inventory.md docs/superpowers/plans/2026-08-01-game-stage-shell.md docs/superpowers/specs/2026-08-01-game-stage-shell-design.md
git add -f .superpowers/sdd/progress.md
git commit -m "docs(shell): game stage shell plan, spec title-screen amendment, dependency inventory

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: `--stage-void` token（TDD）

**Files:**

- Modify: `src/styles/tokens.css`（`--pixel-night-deep` 附近，約 :218）
- Modify: `src/styles/tokens.test.ts`（ADR 0005 describe 的釘值清單，約 :124-132）

**Interfaces:**

- Produces: CSS 變數 `--stage-void: #0a0d20`（letterbox 底色，較 `--pixel-night-deep: #10142e` 深一階）。Task 3 的 `.game-viewport` 使用。

- [ ] **Step 1: 先加釘值測試（預期失敗）**

`src/styles/tokens.test.ts` 在 `'--pixel-night-deep: #10142e',` 之後插入：

```ts
    '--stage-void: #0a0d20',
```

- [ ] **Step 2: 跑測試確認紅**

```bash
pnpm exec vitest run src/styles/tokens.test.ts
```

Expected: FAIL（`--stage-void` 未宣告）

- [ ] **Step 3: tokens.css 加 token**

在 `--pixel-night-deep` 宣告行後加：

```css
--stage-void: #0a0d20; /* 16:9 舞台 letterbox 底，較 night-deep 深一階（GameStage spec §2） */
```

- [ ] **Step 4: 跑測試確認綠**

```bash
pnpm exec vitest run src/styles/tokens.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
npx prettier --check src/styles/tokens.css src/styles/tokens.test.ts
git add src/styles/tokens.css src/styles/tokens.test.ts
git add -f .superpowers/sdd/progress.md
git commit -m "feat(shell): add --stage-void letterbox token

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: 舞台結構（game-viewport／game-stage／scene 卷動＋直向 RWD 退場）

**Files:**

- Modify: `src/app/shell/app-shell.tsx`
- Modify: `src/styles/globals.css`（`.app-shell` 塊約 :55、`.skip-link` 塊約 :60）
- Modify: `src/app/shell/app-shell.test.tsx`（新增舞台結構斷言）

**Interfaces:**

- Produces: `.game-viewport` > `.game-stage` > `.skip-link`＋既有 header/nav/main；`main` 掛 `game-stage__scene` class。Task 4–6 在 stage 內插入 HUD 元件。
- 本任務**不動** header/student-rail/teacher-rail 的 JSX 內容（仍在舞台內原樣渲染）→ 全部既有 e2e 字串/結構斷言存活。

**⚠ 預告紅（顯式，非靜默）**：`tests/e2e/app-shell.visual.spec.ts` 截圖比對自本任務起預期紅（版面大改），Task 9 再生 snapshots 復綠。本任務 ledger 記入此狀態；其餘非視覺 e2e 不受影響。

- [ ] **Step 1: 更新 app-shell.test.tsx（預期失敗）**

在 `describe('AppShell', …)` 內新增：

```tsx
it('wraps the whole app in the 16:9 game stage shell', () => {
  render(
    <MemoryRouter>
      <ToastProvider>
        <AppShell />
      </ToastProvider>
    </MemoryRouter>,
  );

  const main = screen.getByRole('main');
  expect(main).toHaveClass('game-stage__scene');
  const stage = main.closest('.game-stage');
  expect(stage).not.toBeNull();
  expect(stage?.closest('.game-viewport')).not.toBeNull();
  // skip-link 錨在舞台內（fixed 退場改 absolute）
  expect(
    screen.getByRole('link', { name: '跳到主要內容' }).closest('.game-stage'),
  ).toBe(stage);
});
```

- [ ] **Step 2: 跑測試確認紅**

```bash
pnpm exec vitest run src/app/shell/app-shell.test.tsx
```

Expected: FAIL（無 .game-stage 結構）

- [ ] **Step 3: 重構 app-shell.tsx 外層結構**

`return` 區塊改為（header/nav/alert 區塊內容**原樣不動**，僅搬進舞台）：

```tsx
return (
  <div className="game-viewport">
    <div className="game-stage">
      <a className="skip-link" href="#main-content">
        跳到主要內容
      </a>
      {/* …既有 <header className="app-header">…</header> 原樣… */}
      {/* …既有 student-rail / teacher-rail / signOutError 區塊原樣… */}
      <main className="game-stage__scene" id="main-content" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  </div>
);
```

- [ ] **Step 4: globals.css 舞台 CSS**

刪除 `.app-shell { … }` 塊（display:flex; min-height:100dvh; flex-direction:column），原位置替換為：

```css
/* ── GameStage Shell：16:9 遊戲舞台（spec 2026-08-01 §2–3）──────────
   預設＝直向/窄幅 RWD 全幅（舞台退場）；≥768px 且橫向＝置中 letterbox。
   內容零 transform 縮放；卷動發生在 .game-stage__scene。 */
.game-viewport {
  display: flex;
  min-height: 100dvh;
  flex-direction: column;
  background: var(--stage-void);
}

.game-stage {
  position: relative;
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  background: var(--color-surface-page);
}

.game-stage__scene {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
}

@media (min-width: 768px) and (orientation: landscape) {
  .game-viewport {
    position: fixed;
    inset: 0;
    align-items: center;
    justify-content: center;
    flex-direction: row;
  }

  /* 舞台框沿 .rpg-window 雙線框語彙（globals.css .rpg-window）。 */
  .game-stage {
    overflow: hidden;
    width: min(100vw, calc(100vh * 16 / 9));
    height: min(100vh, calc(100vw * 9 / 16));
    flex: none;
    border: 3px solid var(--pixel-window-frame);
    outline: 2px solid var(--pixel-night);
    box-shadow:
      0 0 0 5px var(--pixel-window-frame),
      6px 6px 0 var(--pixel-shadow);
    border-radius: var(--radius-pixel);
  }

  .game-stage__scene {
    overflow-y: auto;
  }
}
```

注意：`.game-stage` 背景必須＝現行頁底色。實作前 `grep -n "surface-page\|body {" src/styles/globals.css src/styles/tokens.css` 確認現行頁底 token 實名（0730 批為奶黃頁底），用實名；`--color-surface-page` 若非實名則替換，**不留 fallback 鏈**。

`.skip-link` 塊只改一行：`position: fixed;` → `position: absolute;`（z-index/top/left 等原樣，錨定 `.game-stage` 的 relative）。

改完以 `grep -n "app-shell" src/styles/globals.css` 確認僅剩 `.app-shell__auth-error`（保留，Task 6 仍在用）。

- [ ] **Step 5: 跑單元測試確認綠**

```bash
pnpm exec vitest run src/app/shell/app-shell.test.tsx src/styles/tokens.test.ts
```

Expected: PASS

- [ ] **Step 6: 真跑 app 量測（素材批慣例）**

啟動 dev server，實測並存證據到 `artifacts/design-audit/stage-shell/task3/`（不 commit）：

1. 1440×900 `/login`：`.game-stage` boundingBox 寬高比 = 16/9（±2%）、左右黑邊色 = `#0a0d20`、雙線框可見。
2. 812×375 `/login`：舞台高貼滿 375、寬 ≈ 666、左右黑邊。
3. 375×812（直向）`/login`：無 letterbox、內容全幅、可正常卷動（舞台退場）。
4. 登入學生帳號 `/app`：舊 header＋nav 仍在舞台內、頁面可於 scene 內卷動、skip-link focus 後可見於舞台左上。
5. console 0 error。

- [ ] **Step 7: Commit**

```bash
npx prettier --check src/app/shell/app-shell.tsx src/styles/globals.css src/app/shell/app-shell.test.tsx
git add src/app/shell/app-shell.tsx src/styles/globals.css src/app/shell/app-shell.test.tsx
git add -f .superpowers/sdd/progress.md
git commit -m "feat(shell): wrap the whole app in a 16:9 letterbox game stage

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: 直向軟橫幅 RotateBanner（TDD）

**Files:**

- Create: `src/app/shell/rotate-banner.tsx`
- Create: `src/app/shell/rotate-banner.test.tsx`
- Modify: `src/app/shell/app-shell.tsx`（stage 內、skip-link 後插入 `<RotateBanner />`）
- Modify: `src/app/shell/app-shell.test.tsx`（補 matchMedia stub）
- Modify: `src/styles/globals.css`（橫幅 CSS，舞台 CSS 塊之後）

**Interfaces:**

- Produces: `RotateBanner(): ReactElement | null` 無 props；直向（`matchMedia('(orientation: portrait)')`）且未關閉時渲染；`sessionStorage` key `colorplay.rotate-banner-dismissed` = `'1'`。
- 橫幅文案（spec §3 原文）：`轉橫體驗更佳`；關閉鈕 aria-label：`關閉轉向提示`。佔位式（in-flow，非覆蓋）。

- [ ] **Step 1: 寫失敗測試**

`src/app/shell/rotate-banner.test.tsx`：

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RotateBanner } from './rotate-banner';

function stubMatchMedia(matches: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const media = {
    addEventListener: (_: string, cb: (event: MediaQueryListEvent) => void) =>
      listeners.add(cb),
    matches,
    media: '(orientation: portrait)',
    removeEventListener: (
      _: string,
      cb: (event: MediaQueryListEvent) => void,
    ) => listeners.delete(cb),
  };
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue(media as unknown as MediaQueryList),
  );
  return {
    fire: (next: boolean) => {
      media.matches = next;
      listeners.forEach((cb) => cb({ matches: next } as MediaQueryListEvent));
    },
  };
}

describe('RotateBanner', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('直向時以 status 角色顯示轉橫提示', () => {
    stubMatchMedia(true);
    render(<RotateBanner />);
    expect(screen.getByRole('status')).toHaveTextContent('轉橫體驗更佳');
  });

  it('橫向時不渲染', () => {
    stubMatchMedia(false);
    render(<RotateBanner />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('關閉後於同 session 記住不再顯示', async () => {
    stubMatchMedia(true);
    const { unmount } = render(<RotateBanner />);
    await userEvent.click(screen.getByRole('button', { name: '關閉轉向提示' }));
    expect(screen.queryByRole('status')).toBeNull();
    expect(sessionStorage.getItem('colorplay.rotate-banner-dismissed')).toBe(
      '1',
    );
    unmount();
    render(<RotateBanner />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('轉向變化即時切換顯示', () => {
    const media = stubMatchMedia(false);
    render(<RotateBanner />);
    expect(screen.queryByRole('status')).toBeNull();
    media.fire(true);
    expect(screen.getByRole('status')).toBeVisible();
  });
});
```

- [ ] **Step 2: 跑測試確認紅**

```bash
pnpm exec vitest run src/app/shell/rotate-banner.test.tsx
```

Expected: FAIL（模組不存在）

- [ ] **Step 3: 實作 rotate-banner.tsx**

```tsx
import { useEffect, useState, type ReactElement } from 'react';

const STORAGE_KEY = 'colorplay.rotate-banner-dismissed';
const PORTRAIT_QUERY = '(orientation: portrait)';

// 直向軟提示（spec §3）：佔位式、可關、sessionStorage 記住；不硬擋直式操作。
export function RotateBanner(): ReactElement | null {
  const [isPortrait, setIsPortrait] = useState(
    () => window.matchMedia(PORTRAIT_QUERY).matches,
  );
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem(STORAGE_KEY) === '1',
  );

  useEffect(() => {
    const media = window.matchMedia(PORTRAIT_QUERY);
    const onChange = (event: MediaQueryListEvent) => {
      setIsPortrait(event.matches);
    };
    media.addEventListener('change', onChange);
    return () => {
      media.removeEventListener('change', onChange);
    };
  }, []);

  if (!isPortrait || dismissed) return null;

  return (
    <div className="rotate-banner" role="status">
      <span className="rotate-banner__text">轉橫體驗更佳</span>
      <button
        aria-label="關閉轉向提示"
        className="rotate-banner__close"
        onClick={() => {
          sessionStorage.setItem(STORAGE_KEY, '1');
          setDismissed(true);
        }}
        type="button"
      >
        ×
      </button>
    </div>
  );
}
```

- [ ] **Step 4: 掛進 app-shell.tsx＋既有測試 stub**

skip-link 之後：

```tsx
import { RotateBanner } from './rotate-banner';
…
        <a className="skip-link" href="#main-content">
          跳到主要內容
        </a>
        <RotateBanner />
```

app-shell.test.tsx 既有測試在 jsdom 無 matchMedia 會炸 → `beforeEach` 補全域 stub（橫向＝不渲染橫幅，不影響既有斷言）：

```tsx
vi.stubGlobal(
  'matchMedia',
  vi.fn().mockReturnValue({
    addEventListener: vi.fn(),
    matches: false,
    media: '(orientation: portrait)',
    removeEventListener: vi.fn(),
  } as unknown as MediaQueryList),
);
```

- [ ] **Step 5: 橫幅 CSS**

globals.css 舞台塊後：

```css
/* 直向軟橫幅（spec §3）：夜窗像素條，佔位式非覆蓋。 */
.rotate-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  border-bottom: 2px solid var(--pixel-window-frame);
  background: var(--pixel-night);
  color: var(--pixel-parchment);
  font-size: 15px;
  font-weight: 700;
  padding: var(--space-1) var(--space-2) var(--space-1) var(--space-3);
}

.rotate-banner__close {
  display: inline-flex;
  min-width: 44px;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--pixel-window-frame);
  border-radius: var(--radius-pixel);
  background: transparent;
  color: var(--pixel-parchment);
  font-size: 20px;
  line-height: 1;
}
```

- [ ] **Step 6: 跑測試綠**

```bash
pnpm exec vitest run src/app/shell/rotate-banner.test.tsx src/app/shell/app-shell.test.tsx
```

Expected: PASS

- [ ] **Step 7: 真跑量測**

375×812 `/login` 與 `/app`（登入後）：橫幅可見、×鈕 boundingBox ≥44×44、文字對比實測 ≥4.5:1（parchment on night）、點 × 後消失、reload（同 session）不再出現、清 sessionStorage 後恢復；812×375 橫向不出現；console 0。證據 `artifacts/design-audit/stage-shell/task4/`。

- [ ] **Step 8: Commit**

```bash
npx prettier --check src/app/shell/rotate-banner.tsx src/app/shell/rotate-banner.test.tsx src/app/shell/app-shell.tsx src/app/shell/app-shell.test.tsx src/styles/globals.css
git add src/app/shell/rotate-banner.tsx src/app/shell/rotate-banner.test.tsx src/app/shell/app-shell.tsx src/app/shell/app-shell.test.tsx src/styles/globals.css
git add -f .superpowers/sdd/progress.md
git commit -m "feat(shell): portrait rotate-hint soft banner with session dismiss

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: 底部 HUD 指令列＋MENU 收登出（學生＋教師）＋e2e 同步

**Files:**

- Create: `src/app/shell/hud-command-bar.tsx`
- Create: `src/app/shell/hud-command-bar.test.tsx`
- Modify: `src/app/shell/app-shell.tsx`（rails 退場、logout 移交、指令列進場）
- Modify: `src/app/shell/app-shell.test.tsx`（登出流程經 MENU）
- Modify: `src/styles/globals.css`（指令列 CSS；退役 `.student-rail*`／`.teacher-rail*`／`.app-header__logout` 塊）
- Modify: `tests/e2e/helpers/auth.ts`（`signOutViaHud`）
- Modify: `tests/e2e/shared-device.spec.ts:40`、`tests/e2e/auth-account.spec.ts:107,115`、`tests/e2e/ui-restyle.spec.ts:101,120`、`tests/e2e/playable-slice.spec.ts:124`、`tests/e2e/session-lifecycle.spec.ts:44-…`

**Interfaces:**

- Produces:

```tsx
export function HudCommandBar(
  props: Readonly<{
    displayName: string;
    isSigningOut: boolean;
    onSignOut: () => void;
    variant: 'student' | 'teacher';
  }>,
): ReactElement;
```

- 學生 variant：`<nav aria-label="主要導覽">` 內 7 個 `NavLink`（字串/`to`/`end` 與現行 student-rail 完全相同，全可見不收彈出層）；教師 variant：`<nav aria-label="教師導覽">` 內 4 個 `Link` 同現行 teacher-rail。
- MENU 鈕（名稱字面 `MENU`）：`aria-expanded`/`aria-controls`，彈出面板含 `displayName` 與登出鈕（字串 `登出`/`登出中…`、disabled 邏輯原樣，onClick 委派 `onSignOut`）。Escape 關閉。
- e2e helper：`export async function signOutViaHud(page: Page): Promise<void>`（開 MENU → 點登出）。

- [ ] **Step 1: 元件失敗測試**

`src/app/shell/hud-command-bar.test.tsx`：

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { HudCommandBar } from './hud-command-bar';

function renderBar(variant: 'student' | 'teacher', onSignOut = vi.fn()) {
  render(
    <MemoryRouter>
      <HudCommandBar
        displayName="student.one"
        isSigningOut={false}
        onSignOut={onSignOut}
        variant={variant}
      />
    </MemoryRouter>,
  );
  return onSignOut;
}

describe('HudCommandBar', () => {
  it('學生指令列 7 項導覽全可見且 aria-label 不變', () => {
    renderBar('student');
    expect(screen.getByRole('navigation', { name: '主要導覽' })).toBeVisible();
    for (const label of [
      '學習大廳',
      '課後任務實戰',
      '裝備商店',
      '我的錯題',
      'Live 課堂',
      '班級排行榜',
      '成就徽章',
    ]) {
      expect(screen.getByRole('link', { name: label })).toBeVisible();
    }
  });

  it('教師指令列 4 項導覽全可見且 aria-label 不變', () => {
    renderBar('teacher');
    expect(screen.getByRole('navigation', { name: '教師導覽' })).toBeVisible();
    for (const label of ['教師工作區', 'Live 主持', '班級管理', '教學分析']) {
      expect(screen.getByRole('link', { name: label })).toBeVisible();
    }
  });

  it('MENU 收使用者名與登出，點登出委派 onSignOut', async () => {
    const onSignOut = renderBar('student');
    expect(screen.queryByRole('button', { name: '登出' })).toBeNull();
    const menu = screen.getByRole('button', { name: 'MENU' });
    expect(menu).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(menu);
    expect(menu).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('student.one')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: '登出' }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it('Escape 關閉 MENU 面板', async () => {
    renderBar('student');
    await userEvent.click(screen.getByRole('button', { name: 'MENU' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('button', { name: '登出' })).toBeNull();
  });
});
```

- [ ] **Step 2: 跑測試確認紅**

```bash
pnpm exec vitest run src/app/shell/hud-command-bar.test.tsx
```

Expected: FAIL（模組不存在）

- [ ] **Step 3: 實作 hud-command-bar.tsx**

```tsx
import { useEffect, useState, type ReactElement } from 'react';
import { Link, NavLink } from 'react-router-dom';

const commandTabClassName = ({ isActive }: { isActive: boolean }) =>
  `hud-command__tab${isActive ? ' hud-command__tab--active' : ''}`;
const commandLinkClassName = ({ isActive }: { isActive: boolean }) =>
  `hud-command__link${isActive ? ' hud-command__link--active' : ''}`;

// 底部 HUD 指令列（spec §4）：7 項導覽全可見；MENU 收使用者資訊＋登出。
export function HudCommandBar({
  displayName,
  isSigningOut,
  onSignOut,
  variant,
}: Readonly<{
  displayName: string;
  isSigningOut: boolean;
  onSignOut: () => void;
  variant: 'student' | 'teacher';
}>): ReactElement {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  return (
    <div className="hud-command">
      {variant === 'student' ? (
        <nav aria-label="主要導覽" className="hud-command__nav">
          <NavLink className={commandTabClassName} end to="/app">
            學習大廳
          </NavLink>
          <NavLink className={commandTabClassName} to="/app/missions">
            課後任務實戰
          </NavLink>
          <NavLink className={commandTabClassName} to="/app/shop">
            裝備商店
          </NavLink>
          <span aria-hidden="true" className="hud-command__spacer" />
          <NavLink className={commandLinkClassName} to="/app/mistakes">
            我的錯題
          </NavLink>
          <NavLink className={commandLinkClassName} to="/app/live/join">
            Live 課堂
          </NavLink>
          <NavLink className={commandLinkClassName} to="/app/leaderboard">
            班級排行榜
          </NavLink>
          <NavLink className={commandLinkClassName} to="/app/achievements">
            成就徽章
          </NavLink>
        </nav>
      ) : (
        <nav aria-label="教師導覽" className="hud-command__nav">
          <Link className="hud-command__tab" to="/teacher">
            教師工作區
          </Link>
          <Link className="hud-command__tab" to="/teacher/live">
            Live 主持
          </Link>
          <Link className="hud-command__link" to="/teacher/classes">
            班級管理
          </Link>
          <Link className="hud-command__link" to="/teacher/analytics">
            教學分析
          </Link>
        </nav>
      )}
      <div className="hud-menu">
        <button
          aria-controls="hud-menu-panel"
          aria-expanded={menuOpen}
          className="hud-menu__toggle"
          onClick={() => {
            setMenuOpen((open) => !open);
          }}
          type="button"
        >
          MENU
        </button>
        {menuOpen ? (
          <div className="hud-menu__panel" id="hud-menu-panel">
            <p className="hud-menu__user">{displayName}</p>
            <button
              className="hud-menu__logout"
              disabled={isSigningOut}
              onClick={onSignOut}
              type="button"
            >
              {isSigningOut ? '登出中…' : '登出'}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: app-shell.tsx 接線**

1. 刪除 student-rail 與 teacher-rail 兩個 `<nav>` 區塊、刪除 header 內 `app-header__logout` 按鈕區塊。
2. 抽出既有 onClick 內容為 `handleSignOut`（函式體一字不改搬移）：

```tsx
const handleSignOut = () => {
  if (signOutPending.current) return;
  signOutPending.current = true;
  setIsSigningOut(true);
  setSignOutError(false);
  void auth.signOut().then(
    () => {
      signOutPending.current = false;
      setIsSigningOut(false);
      toast({ message: '已安全登出。', tone: 'info' });
      return navigate('/login', { replace: true });
    },
    () => {
      signOutPending.current = false;
      setIsSigningOut(false);
      setSignOutError(true);
    },
  );
};
```

3. `main` 之後插入指令列（登入才有；未登入頁無指令列）：

```tsx
{
  isAuthenticatedProfile && !isTeacher ? (
    <HudCommandBar
      displayName={profile.data?.displayName ?? ''}
      isSigningOut={isSigningOut}
      onSignOut={handleSignOut}
      variant="student"
    />
  ) : null;
}
{
  isTeacher ? (
    <HudCommandBar
      displayName={profile.data?.displayName ?? ''}
      isSigningOut={isSigningOut}
      onSignOut={handleSignOut}
      variant="teacher"
    />
  ) : null;
}
```

4. **登出永遠可達**：現行 header 登出鈕在 `auth.status === 'authenticated'` 即顯示（profile 未載入/失敗也可登出）；指令列掛 `isAuthenticatedProfile`。故當 `auth.status === 'authenticated' && !isAuthenticatedProfile` 時，在 header 區位置保留 fallback 登出鈕：

```tsx
{
  auth.status === 'authenticated' && !isAuthenticatedProfile ? (
    <button
      className="hud-menu__logout hud-menu__logout--fallback"
      disabled={isSigningOut}
      onClick={handleSignOut}
      type="button"
    >
      {isSigningOut ? '登出中…' : '登出'}
    </button>
  ) : null;
}
```

（app-shell.test.tsx 若有 profile 錯誤情境釘登出可用——依盤點 B/C 清單覆核該情境具體斷言後對齊。）

- [ ] **Step 5: 指令列 CSS＋退役舊 rails CSS**

globals.css：刪 `.student-rail`〜`.student-rail__link--active` 全塊、`.teacher-rail`〜其連結樣式全塊、`.app-header__logout` 塊。新增：

```css
/* ── 底部 HUD 指令列（spec §4）─────────────────────────────────── */
.hud-command {
  position: sticky;
  z-index: 50;
  bottom: 0;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  border-top: 2px solid var(--pixel-window-frame);
  background: var(--pixel-night);
  padding: var(--space-1) max(var(--space-2), env(safe-area-inset-right))
    max(var(--space-1), env(safe-area-inset-bottom))
    max(var(--space-2), env(safe-area-inset-left));
}

.hud-command__nav {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: var(--space-1);
  overflow: auto hidden;
  white-space: nowrap;
}

.hud-command__spacer {
  flex: 1;
}

.hud-command__tab,
.hud-command__link {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  border: 2px solid transparent;
  border-radius: var(--radius-pixel);
  color: var(--pixel-parchment);
  text-decoration: none;
  padding: 0 var(--space-3);
}

.hud-command__tab {
  font-size: 15px;
  font-weight: 800;
}

.hud-command__link {
  font-size: 13px;
  font-weight: 700;
}

.hud-command__tab--active,
.hud-command__link--active {
  border-color: var(--pixel-window-frame);
  background: var(--pixel-parchment);
  color: var(--pixel-night);
}

.hud-command__tab:hover,
.hud-command__link:hover {
  border-color: var(--pixel-window-frame);
}

.hud-menu {
  position: relative;
}

.hud-menu__toggle {
  display: inline-flex;
  min-width: 44px;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--pixel-window-frame);
  border-radius: var(--radius-pixel);
  background: var(--pixel-night-deep);
  color: var(--pixel-parchment);
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.08em;
  padding: 0 var(--space-3);
}

.hud-menu__panel {
  position: absolute;
  z-index: 60;
  right: 0;
  bottom: calc(100% + var(--space-2));
  min-width: 200px;
  border: 3px solid var(--pixel-window-frame);
  border-radius: var(--radius-pixel);
  background: var(--pixel-night-deep);
  box-shadow: 4px 4px 0 var(--pixel-shadow);
  color: var(--pixel-parchment);
  padding: var(--space-3);
}

.hud-menu__user {
  margin: 0 0 var(--space-2);
  font-weight: 800;
}

.hud-menu__logout {
  display: inline-flex;
  min-width: 44px;
  min-height: 44px;
  width: 100%;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--pixel-window-frame);
  border-radius: var(--radius-pixel);
  background: var(--pixel-parchment);
  color: var(--pixel-night);
  font-weight: 800;
}

/* 舞台模式：指令列是舞台底列（flex 尾），sticky 還原為普通列。 */
@media (min-width: 768px) and (orientation: landscape) {
  .hud-command {
    position: static;
  }
}
```

- [ ] **Step 6: app-shell.test.tsx 同步（登出經 MENU）**

三處登出流程測試（:388、:415、:493 附近）在點登出前補開 MENU：

```tsx
await userEvent.click(screen.getByRole('button', { name: 'MENU' }));
await userEvent.click(screen.getByRole('button', { name: '登出' }));
```

導覽結構測試（role navigation＋link name 查找）應原樣通過；若有測試釘 `student-rail` class 或 header 內 logout 位置，依盤點 C 清單逐一改為新結構斷言。profile 錯誤情境的登出測試對齊 Step 4 的 fallback 鈕。

- [ ] **Step 7: 跑單元測試綠**

```bash
pnpm exec vitest run src/app/shell
```

Expected: PASS（app-shell + hud-command-bar + rotate-banner + use-idle-logout 全綠）

- [ ] **Step 8: e2e 同步（依盤點 B 清單）**

`tests/e2e/helpers/auth.ts` 加：

```ts
// GameStage Shell（2026-08-01）：登出鈕收進底部 HUD 的 MENU 面板。
export async function signOutViaHud(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'MENU' }).click();
  await page.getByRole('button', { name: '登出' }).click();
}
```

替換直接點擊（各檔 import helper）：

- `shared-device.spec.ts:40`、`auth-account.spec.ts:107,115`、`ui-restyle.spec.ts:101,120`、`playable-slice.spec.ts:124` → `await signOutViaHud(page);`
- `session-lifecycle.spec.ts:44-…`（鍵盤路徑測試，保留鍵盤可操作性驗證）：焦點舞改兩段——沿用既有 browserName 分支與 for-loop 舞步，先聚焦 `MENU` 鈕、`Enter` 開面板，再聚焦 `登出`、`Enter` 送出：

```ts
const menuButton = page.getByRole('button', { name: 'MENU' });
await expect(menuButton).toBeVisible();
// …（既有 firefox/webkit 分支與 for-loop 舞步，目標換 menuButton）…
await page.keyboard.press('Enter');
const logout = page.getByRole('button', { name: '登出' });
await expect(logout).toBeVisible();
// …（同樣舞步聚焦 logout）…
await page.keyboard.press('Enter');
```

既知紅（assignments-live／live-advanced）**不碰**。

- [ ] **Step 9: 綠 e2e 抽測**

```bash
pnpm exec playwright test tests/e2e/session-lifecycle.spec.ts tests/e2e/shared-device.spec.ts --project=chromium
```

Expected: PASS

- [ ] **Step 10: 真跑量測**

1280×720 登入學生：底部指令列 7 項全可見、active 態正確；**座標點擊**逐一點 7 項驗路由跳轉；MENU 開合、登出跳 /login。教師帳號同驗 4 項＋MENU。對比實測：parchment on night、night on parchment（active）、MENU 鈕，全部 ≥4.5:1。375×812：指令列 sticky 底、44px 觸控、不遮內容（佔位式）。console 0。證據 `artifacts/design-audit/stage-shell/task5/`。

- [ ] **Step 11: Commit**

```bash
npx prettier --check src/app/shell/hud-command-bar.tsx src/app/shell/hud-command-bar.test.tsx src/app/shell/app-shell.tsx src/app/shell/app-shell.test.tsx src/styles/globals.css tests/e2e/helpers/auth.ts tests/e2e/shared-device.spec.ts tests/e2e/auth-account.spec.ts tests/e2e/ui-restyle.spec.ts tests/e2e/playable-slice.spec.ts tests/e2e/session-lifecycle.spec.ts
git add src/app/shell/hud-command-bar.tsx src/app/shell/hud-command-bar.test.tsx src/app/shell/app-shell.tsx src/app/shell/app-shell.test.tsx src/styles/globals.css tests/e2e/helpers/auth.ts tests/e2e/shared-device.spec.ts tests/e2e/auth-account.spec.ts tests/e2e/ui-restyle.spec.ts tests/e2e/playable-slice.spec.ts tests/e2e/session-lifecycle.spec.ts
git add -f .superpowers/sdd/progress.md
git commit -m "feat(shell): bottom HUD command bar with MENU sign-out, retire rails

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: 頂部 HUD（狀態窗＋資源列＋賢者窗）＝header 重塑、brand 退場

**Files:**

- Modify: `src/app/shell/app-shell.tsx`（header 改 `hud-top`、brand 移除）
- Modify: `src/app/shell/app-shell.test.tsx`（brand 測試同步）
- Modify: `src/styles/globals.css`（hud-top／economy 像素化 CSS；退役 `.app-header*`、`.brand*`）
- Modify: `tests/e2e/app-shell.visual.spec.ts:29`（banner 斷言同步）

**Interfaces:**

- Consumes: `AuthenticatedEconomySummary`（沿用，內部 `EconomySummaryView` 的 markup／字串／`aria-label="學習獎勵"` region 一字不動——所有 economy e2e 斷言因此自動存活）。
- Produces: 登入後 `<header className="hud-top">`（banner role 保留）；未登入無 header。

- [ ] **Step 1: 單元測試先行同步（預期紅）**

app-shell.test.tsx：

1. `:94` 'uses a labelled home link…' 測試改為 brand 退場斷言：

```tsx
it('遊戲 HUD 不再提供頂列品牌連結（chrome 收進舞台）', () => {
  render(
    <MemoryRouter>
      <ToastProvider>
        <AppShell />
      </ToastProvider>
    </MemoryRouter>,
  );

  expect(screen.queryByRole('link', { name: 'ColorPlay 首頁' })).toBeNull();
  expect(document.querySelectorAll('[data-acceptance-target]')).toHaveLength(0);
});
```

2. 未登入情境（既有 unauthenticated mock 測試群）補：

```tsx
expect(screen.queryByRole('banner')).toBeNull();
```

（授權情境的 `:77`/`:90`/`:255` banner 斷言不動——header 保留。）

- [ ] **Step 2: 跑測試確認紅**

```bash
pnpm exec vitest run src/app/shell/app-shell.test.tsx
```

Expected: FAIL（brand 仍在）

- [ ] **Step 3: app-shell.tsx header 重塑**

header 區塊改為（brand SVG 與 `app-header__navigation` 包裝移除；economy／teacher badge／auth-error 進 hud-top；`Link` import 若無他用一併移除）：

```tsx
{
  isAuthenticatedProfile ? (
    <header className="hud-top">
      <AuthenticatedEconomySummary />
      {isTeacher ? (
        <span className="hud-top__identity">
          <Icon name="lock-open" size={14} />
          {profile.data?.displayName}・教師端
        </span>
      ) : null}
      {signOutError ? (
        <p className="app-shell__auth-error" role="alert">
          登出失敗，請稍後重試。
        </p>
      ) : null}
    </header>
  ) : null;
}
```

（Task 5 的 fallback 登出鈕在 header 之外、stage 之內原地保留——`auth.status === 'authenticated' && !isAuthenticatedProfile` 時 header 不渲染，fallback 鈕獨立存在，signOutError 在該情境下改與 fallback 鈕相鄰渲染。）

- [ ] **Step 4: CSS**

globals.css：刪 `.app-header`〜`.app-header__teacher-badge`、`.brand`〜`.brand__subtitle` 全塊（`grep -n "app-header\|brand" src/styles/globals.css` 確認清乾淨；`.app-shell__auth-error` 保留）。新增：

```css
/* ── 頂部 HUD（spec §4）：左狀態窗＋右資源列；賢者窗＝教師 identity。── */
.hud-top {
  z-index: 40;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3) 0;
}

/* 左上狀態窗：夜空窗小卡（Level＋EXP 條）。 */
.hud-top .economy-summary {
  display: flex;
  flex: 1;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
}

.hud-top .economy-summary__level {
  display: flex;
  flex-direction: column;
  gap: 2px;
  border: 2px solid var(--pixel-window-frame);
  border-radius: var(--radius-pixel);
  background: var(--pixel-night);
  box-shadow: 3px 3px 0 var(--pixel-shadow);
  color: var(--pixel-parchment);
  font-size: 13px;
  font-weight: 800;
  padding: var(--space-1) var(--space-2);
}

.hud-top .economy-summary__level progress {
  width: 120px;
  height: 8px;
  accent-color: var(--pixel-gold);
}

/* 右上資源列：Token/XP 計數，tabular-nums。 */
.hud-top .economy-summary__tokens {
  border: 2px solid var(--pixel-gold-deep);
  border-radius: var(--radius-pixel);
  background: var(--pixel-night);
  color: var(--pixel-gold);
  font-size: 14px;
  font-variant-numeric: tabular-nums;
  font-weight: 800;
  padding: var(--space-1) var(--space-2);
}

/* 賢者窗：教師 identity 像素化。 */
.hud-top__identity {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  border-radius: var(--radius-pixel);
  background: var(--pixel-night);
  color: var(--pixel-parchment);
  font-size: 13px;
  font-weight: 800;
  padding: var(--space-1) var(--space-2);
}
```

賢者窗邊框色＝既有教師暖橘識別：實作時 `grep -n "teacher" src/styles/tokens.css` 取實際 token 名（0728 批教師暖橘），寫成 `border: 2px solid var(--<實名>);`。夜窗底上的字一律 parchment（暖橘只做框色，避免對比不足）；gate 實測把關。

另注意：`.hud-top .economy-summary__tokens` 的金色字 `--pixel-gold: #b8862f` on `--pixel-night: #171c3f` 對比約 3.4:1 **不足**——實測若 <4.5:1，字改 `var(--pixel-parchment)`、框保留金色（步驟內先行量測再定案，不留到 gate 才發現）。

- [ ] **Step 5: visual spec banner 斷言同步**

`tests/e2e/app-shell.visual.spec.ts:29`：

```ts
await expect(page.locator('.game-stage')).toBeVisible();
```

（截圖比對本任務仍預期紅，Task 9 收。）

- [ ] **Step 6: 跑單元測試綠**

```bash
pnpm exec vitest run src/app/shell
```

Expected: PASS

- [ ] **Step 7: 真跑量測**

登入學生 1280×720＋812×375：左上狀態窗（Level n＋EXP 條）、右上 Token 計數、`aria-label="學習獎勵"` region 存活（locator 驗證）；教師帳號賢者窗可見；全部 HUD 字色對比實測 ≥4.5:1；/login 無 header、標題畫面滿舞台；console 0。證據 `artifacts/design-audit/stage-shell/task6/`。

- [ ] **Step 8: Commit**

```bash
npx prettier --check src/app/shell/app-shell.tsx src/app/shell/app-shell.test.tsx src/styles/globals.css tests/e2e/app-shell.visual.spec.ts
git add src/app/shell/app-shell.tsx src/app/shell/app-shell.test.tsx src/styles/globals.css tests/e2e/app-shell.visual.spec.ts
git add -f .superpowers/sdd/progress.md
git commit -m "feat(shell): top HUD status window and resource bar, retire legacy header

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: 遊戲標題畫面 TitlePage（`/`＝icon＋PRESS START；spec §1.7/§8）

**Files:**

- Create: `src/app/router/title-page.tsx`
- Create: `src/app/router/title-page.test.tsx`
- Modify: `src/app/router/create-app-router.tsx`（`/` 路由 element 換 `TitlePage`，路由結構不變）
- Modify: `src/app/router/create-app-router.test.tsx:179`（期望字串同步）
- Modify: `tests/e2e/app-shell.visual.spec.ts:14`（routes 陣列 action 同步）
- Modify: `src/styles/globals.css`（`.title-screen` CSS）

**Interfaces:**

- Produces: `export function TitlePage(): ReactElement`——`/` 專屬標題畫面；PRESS START 為 `Link to="/login"`，帶既有 `data-acceptance-target`/`data-primary-action`/`data-acceptance-interactive` 屬性（visual spec 的 primary-target 斷言存活）。
- `RoutePage` 保留原樣（`/unauthorized`、404 續用）；登入頁（學生/教師身分切換）**零接觸**——平行 session 禁碰檔。

- [ ] **Step 1: 失敗測試**

`src/app/router/title-page.test.tsx`：

```tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { TitlePage } from './title-page';

describe('TitlePage', () => {
  it('顯示 ColorPlay 標題與 PRESS START 進入登入頁', () => {
    render(
      <MemoryRouter>
        <TitlePage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'ColorPlay' })).toBeVisible();
    const start = screen.getByRole('link', { name: 'PRESS START' });
    expect(start).toHaveAttribute('href', '/login');
    expect(start).toHaveAttribute('data-primary-action', 'true');
  });
});
```

同步 `src/app/router/create-app-router.test.tsx:179`：

```tsx
    ['/', 'ColorPlay', 'PRESS START'],
```

- [ ] **Step 2: 跑測試確認紅**

```bash
pnpm exec vitest run src/app/router
```

Expected: FAIL（TitlePage 不存在＋router 期望未滿足）

- [ ] **Step 3: 實作 title-page.tsx**

```tsx
import { Link } from 'react-router-dom';

// 遊戲標題畫面（spec §8，owner 0801 17:05）：icon＋PRESS START，
// 按下進既有登入頁（身分切換沿用登入頁，本批零接觸）。
export function TitlePage() {
  return (
    <section className="title-screen" data-interaction-group="foundation-route">
      <span aria-hidden="true" className="title-screen__mark">
        <svg fill="none" height="96" viewBox="0 0 32 32" width="96">
          <circle cx="11" cy="12" fill="var(--coral-700)" r="7" />
          <circle
            cx="21"
            cy="12"
            fill="var(--cobalt-600)"
            fillOpacity="0.92"
            r="7"
          />
          <circle
            cx="16"
            cy="20"
            fill="var(--jade-600)"
            fillOpacity="0.92"
            r="7"
          />
        </svg>
      </span>
      <h1 className="title-screen__logo">ColorPlay</h1>
      <p className="title-screen__subtitle">色彩原理遊戲式學習平台</p>
      <Link
        className="title-screen__start"
        data-acceptance-interactive="true"
        data-acceptance-target
        data-primary-action="true"
        to="/login"
      >
        PRESS START
      </Link>
    </section>
  );
}
```

（icon＝既有 brand 三圓 SVG 放大；`--coral-700`/`--cobalt-600`/`--jade-600` 為 app-shell.tsx 現行 brand mark 所用 token，沿用。）

- [ ] **Step 4: 接進 router**

`create-app-router.tsx` `/` 路由：

```tsx
import { TitlePage } from './title-page';
…
        {
          path: '/',
          element: <TitlePage />,
        },
```

（原 inline `RoutePage` props 移除；`RoutePage` import 仍被 `/unauthorized`、404 使用，保留。）

- [ ] **Step 5: CSS**

globals.css（route-panel 區塊附近）：

```css
/* ── 遊戲標題畫面（spec §8）────────────────────────────────────── */
.title-screen {
  display: flex;
  flex: 1;
  min-height: 100%;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  background: var(--pixel-night-deep);
  color: var(--pixel-parchment);
  text-align: center;
  padding: var(--space-6) var(--space-4);
}

.title-screen__logo {
  margin: 0;
  font-family: var(--font-pixel-latin), var(--font-pixel-tc), sans-serif;
  font-size: clamp(2.5rem, 6vw, 4rem);
  letter-spacing: 0.06em;
}

.title-screen__subtitle {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
}

.title-screen__start {
  display: inline-flex;
  min-width: 44px;
  min-height: 48px;
  align-items: center;
  justify-content: center;
  border: 3px solid var(--pixel-window-frame);
  border-radius: var(--radius-pixel);
  background: var(--pixel-night);
  box-shadow: 4px 4px 0 var(--pixel-shadow);
  color: var(--pixel-parchment);
  font-family: var(--font-pixel-latin), var(--font-pixel-tc), sans-serif;
  font-size: 18px;
  font-weight: 800;
  letter-spacing: 0.12em;
  margin-top: var(--space-3);
  padding: var(--space-2) var(--space-5);
  text-decoration: none;
  animation: title-start-blink 1.6s steps(2, jump-none) infinite;
}

@keyframes title-start-blink {
  50% {
    opacity: 0.7; /* 最暗幀對比仍 ≥4.5:1（parchment on night-deep ≈14:1，×0.7 有餘裕；gate 實測把關） */
  }
}

@media (prefers-reduced-motion: reduce) {
  .title-screen__start {
    animation: none;
  }
}
```

雙通道第二軌：實作時 `grep -n "data-reduced-motion" src/styles/globals.css` 取現行 selector 寫法（server-backed 偏好），照同型式補：

```css
[data-reduced-motion='true'] .title-screen__start {
  animation: none;
}
```

- [ ] **Step 6: e2e visual spec `/` action 同步**

`tests/e2e/app-shell.visual.spec.ts:14`：

```ts
  { action: 'PRESS START', path: '/', role: 'link' },
```

- [ ] **Step 7: 跑測試綠**

```bash
pnpm exec vitest run src/app/router
```

Expected: PASS

- [ ] **Step 8: 真跑量測**

1440×900＋812×375 `/`：夜空標題畫面滿舞台、icon＋ColorPlay＋PRESS START 置中、鈕 ≥44px、對比實測（含閃爍最暗幀 0.7 態）≥4.5:1、reduced-motion 兩通道下不閃爍；點 PRESS START 進 `/login`、登入學生後進 `/app` 大廳（全流程走一次）；375×812 直向全幅正常；console 0。證據 `artifacts/design-audit/stage-shell/task7/`。

- [ ] **Step 9: Commit**

```bash
npx prettier --check src/app/router/title-page.tsx src/app/router/title-page.test.tsx src/app/router/create-app-router.tsx src/app/router/create-app-router.test.tsx src/styles/globals.css tests/e2e/app-shell.visual.spec.ts
git add src/app/router/title-page.tsx src/app/router/title-page.test.tsx src/app/router/create-app-router.tsx src/app/router/create-app-router.test.tsx src/styles/globals.css tests/e2e/app-shell.visual.spec.ts
git add -f .superpowers/sdd/progress.md
git commit -m "feat(shell): press-start title screen at the landing route

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: 舞台內覆蓋層錨定＋既有 fixed/sticky/100dvh 收斂

**Files:**

- Modify: `src/styles/globals.css`（`.live-result-screen` 約 :2222；依盤點 D/E/G 清單其餘項）
- Modify: `docs/superpowers/plans/2026-08-01-game-stage-shell-inventory.md`（處置狀態回寫）

**Interfaces:**

- Consumes: Task 1 盤點文件 D（fixed/sticky）、E（100dvh）、G（教師表格）清單——逐列處置，處置結果回寫盤點文件（狀態欄「已處理／保留-理由」）。

- [ ] **Step 1: live-result-screen 錨舞台**

`.live-result-screen` 塊改兩行、其餘原樣：

```css
.live-result-screen {
  position: absolute; /* was fixed：錨 .game-stage（relative），蓋舞台不蓋 letterbox */
  z-index: 70; /* was 50：高於 hud-command(50)/hud-menu__panel(60) */
  inset: 0;
  /* …其餘宣告原樣… */
}
```

- [ ] **Step 2: 逐列處置盤點 D/E 其餘項**

- `.live-presenter`（:4675）**保留 fixed**——投影＝全螢幕接管例外（ledger「Live 投影墨色舞台例外」慣例），CSS 加一行註解記錄決策。
- toast 與其他元件層 fixed/sticky hits：錨定瀏覽器視窗且會落在 letterbox 上者 → 改 absolute 錨舞台；否則加註保留理由。逐列，無默認。
- 100dvh hits（feature 頁若有）：舞台內以 `min-height: 100%`（相對 scene）取代，避免舞台內假卷動；globals 基底（:17）保留。

- [ ] **Step 3: 教師寬表格 overflow 守門（盤點 G）**

以 1024×768 與 1440×900 舞台實測 `/teacher/classes`、`/teacher/classes/:id`、`/teacher/analytics`、`/teacher/live/:sessionId/report`：表格容器橫向溢出舞台者，對其實際 class（盤點 G 記錄）加：

```css
.<盤點G記錄的容器class > {
  overflow-x: auto;
}
```

僅容器級守門不破版；深度調整留批⑤b。實測皆無溢出則記「已守門」不加碼。

- [ ] **Step 4: 真跑量測**

以 live-smoke 流程觸發學生題間結果畫面：`.live-result-screen` 蓋滿舞台、letterbox 仍露出、z 序正確（蓋過 HUD）；教師四頁無橫向破版；console 0。證據 `artifacts/design-audit/stage-shell/task8/`。

- [ ] **Step 5: 綠 e2e 迴歸抽測**

```bash
pnpm exec playwright test tests/e2e/live-smoke.spec.ts tests/e2e/quiz-runner.spec.ts --project=chromium
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
npx prettier --check src/styles/globals.css docs/superpowers/plans/2026-08-01-game-stage-shell-inventory.md
git add src/styles/globals.css docs/superpowers/plans/2026-08-01-game-stage-shell-inventory.md
git add -f .superpowers/sdd/progress.md
git commit -m "fix(shell): anchor in-stage overlays to the game stage, guard wide tables

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: visual spec 舞台版＋812×375 驗證點＋snapshots 再生

**Files:**

- Modify: `tests/e2e/app-shell.visual.spec.ts`
- Regenerate: `tests/e2e/app-shell.visual.spec.ts-snapshots/*`

**Interfaces:**

- Produces: 視覺基準含舞台幾何斷言；spec §5 要求的 812×375 驗證點自此常駐。

- [ ] **Step 1: viewports 加 812×375、加舞台幾何斷言**

viewports 陣列加：

```ts
  { height: 375, label: '812x375', width: 812 },
```

每 route 測試內（既有斷言之後）加幾何驗證：

```ts
const stageBox = await page.locator('.game-stage').boundingBox();
if (!stageBox) throw new Error('GAME_STAGE_NOT_RENDERED');
const isStageMode = viewport.width >= 768 && viewport.width > viewport.height;
if (isStageMode) {
  // letterbox 舞台：16:9（±2%）。
  expect(Math.abs(stageBox.width / stageBox.height - 16 / 9)).toBeLessThan(
    0.02 * (16 / 9),
  );
} else {
  // 直向/窄幅：舞台退場＝全幅。
  expect(Math.round(stageBox.width)).toBe(viewport.width);
}
```

- [ ] **Step 2: 跑 visual spec 確認截圖紅（幾何斷言綠）**

```bash
pnpm exec playwright test tests/e2e/app-shell.visual.spec.ts --project=chromium
```

Expected: 幾何/role 斷言 PASS、`toHaveScreenshot` 比對 FAIL（版面已改）

- [ ] **Step 3: 再生 snapshots**

```bash
pnpm exec playwright test tests/e2e/app-shell.visual.spec.ts --update-snapshots
```

- [ ] **Step 4: 重跑確認全綠**

```bash
pnpm exec playwright test tests/e2e/app-shell.visual.spec.ts
```

Expected: PASS（專案設定含多瀏覽器則各 project 全綠）

- [ ] **Step 5: 人工目檢再生後的 snapshots**

逐張開新 snapshot 確認：letterbox 底色、舞台框、HUD 位置正確——**再生不是免檢**，發現破版回上游任務修。

- [ ] **Step 6: Commit**

```bash
npx prettier --check tests/e2e/app-shell.visual.spec.ts
git add tests/e2e/app-shell.visual.spec.ts tests/e2e/app-shell.visual.spec.ts-snapshots
git add -f .superpowers/sdd/progress.md
git commit -m "test(shell): stage-geometry visual baseline with 812x375 landscape point

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: Gate 全電池＋ledger 結批

**Files:**

- Modify: `.superpowers/sdd/progress.md`（結批節）
- 證據: `artifacts/design-audit/stage-shell/gate/`（不 commit）；拋棄式腳本只放 session scratchpad

**Interfaces:**

- Consumes: Task 1–9 全部交付；素材批 gate 模式（真跑、座標點擊、對比電池、console 0）。

- [ ] **Step 1: 靜態電池**

```bash
pnpm exec vitest run
pnpm lint
pnpm typecheck
npx prettier --check "src/app/shell/**" "src/styles/tokens.css" "src/styles/tokens.test.ts" "tests/e2e/app-shell.visual.spec.ts" "tests/e2e/helpers/auth.ts"
```

Expected: 全 PASS（素材批結批基準 801 tests＋本批新增；既有 pre-existing 紅若仍在，以 base 對照證明非本批引入。`pnpm lint`/`pnpm typecheck` 若非實際 script 名，以 package.json scripts 實名執行——**不改 package.json**）

- [ ] **Step 2: e2e 電池**

```bash
pnpm exec playwright test tests/e2e/quiz-runner.spec.ts --project=chromium --project=firefox
pnpm exec playwright test tests/e2e/live-smoke.spec.ts tests/e2e/classroom-leaderboard.spec.ts tests/e2e/session-lifecycle.spec.ts tests/e2e/shared-device.spec.ts tests/e2e/auth-account.spec.ts tests/e2e/playable-slice.spec.ts tests/e2e/app-shell.visual.spec.ts --project=chromium
```

Expected: 全 PASS。既知紅（assignments-live／live-advanced＋素材批已證環境漂移紅）不計，但**須重跑確認失敗訊息與 base 逐字相同**（未因本批擴大）。

- [ ] **Step 3: 真跑視覺/互動電池（三情境）**

登入學生＋教師各跑，證據入 gate 目錄：

1. **1440×900 桌機**：letterbox 幾何（16:9±2%、置中、`--stage-void` 底實測 `#0a0d20`）、雙線框；**座標點擊** 7＋4 導覽項逐一驗路由；MENU→登出全流程。
2. **812×375 橫向手機（新增驗證點）**：舞台貼合（高=375）、HUD 全項 ≥44px 可點、scene 卷動正常。
3. **375×812 直向**：軟橫幅**開/關兩態**各截圖、×鈕 ≥44px、關閉後 sessionStorage 記憶、RWD 全幅、指令列 sticky 底不遮內容。

- [ ] **Step 4: 對比電池（rendered 實測）**

getComputedStyle＋實際合成色量測，全部 ≥4.5:1：指令列 tab/link（默認＋active＋hover）、MENU 鈕、MENU 面板字、狀態窗 Level/XP 字、資源列 Token 字、賢者窗、軟橫幅字＋×鈕、skip-link focus 態、fallback 登出鈕。任一不足回修（調色動 globals.css；若須動 token 同步 tokens.test 釘值）。

- [ ] **Step 5: 雙通道 reduced-motion＋console**

`prefers-reduced-motion: reduce` 模擬＋`data-reduced-motion` 各跑一輪主要頁：本批無新動畫，驗既有通道未破。全程 console 0 error/warning（既知白名單除外）。

- [ ] **Step 6: ledger 結批＋memory**

progress.md 追加「GameStage Shell Batch」結批節：任務 commit 清單、gate 結果、既知紅對照、遞延事項（教師端深度＝批⑤b；design-debt(6) 維持遞延——標的非外殼範圍）。

```bash
git add -f .superpowers/sdd/progress.md
git commit -m "docs(sdd): close game stage shell batch with gate results

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Self-Review 紀錄

- **Spec 覆蓋**：§1 七決策→T3(1,2)/T5(3)/T5+T6(4)/T3(5)/批序(6)/T7(7)；§2 舞台規格→T2+T3；§3 三情境→T3+T4+T10；§4 HUD→T5+T6（「Lv N」→保留「Level N」載重字串，已記 Global Constraints）；§5 品質→各任務量測步驟＋T10；§7 風險五列→T1 盤點/T3 skip-link＋T8 錨定/T8 表格/T4 佔位式/T3+T5 flex 尾列（spec 對策欄草寫 grid `1fr auto`，實作用 flex column＋`flex:1`＋`min-height:0` 達成同一行為「內容區才卷動、HUD 固定」）；§8 標題畫面→T7（含 e2e 兩處 `前往登入`→`PRESS START` 顯式同步）。
- **佔位符掃描**：T8 Step 2/3 依 T1 盤點清單逐列處置（清單為 T1 交付物、含格式與已知項，非 TBD）；其餘步驟皆有完整代碼。
- **型別/命名一致**：`HudCommandBar` props、`signOutViaHud`、`TitlePage`、`.game-stage__scene`、`--stage-void: #0a0d20` 全文一致；`handleSignOut` 於 T5 定義、T5/T6 同名引用。
