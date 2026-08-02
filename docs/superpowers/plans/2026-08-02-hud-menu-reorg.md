# HUD 導覽重組＋經濟列頭像 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 底部 HUD 兩端重組（學生列上剩 學習大廳/Live 課堂＋MENU，5 項進面板；教師剩 工作區/Live 主持＋MENU，2 項進面板）＋學生頂部 Blook 頭像框與 Level/XP/Token 一體群組＋教師頂部改歡迎識別＋修手機跑版（owner 2026-08-02 核准 spec）。

**Architecture:** `hud-command-bar.tsx` 內部重排：列上導覽縮減、MENU 面板上半插入 NavLink 導覽區（點擊自動關面板），沿批⑤b 既有 hidden/click-outside/焦點機制零改動。`app-shell.tsx` hud-top 分流：學生＝新 `StudentHudAvatar`（裝備中 Blook 用既有 `BlookArt` 渲染、未裝備 fallback hero 精靈 CSS 背景）＋既有 `AuthenticatedEconomySummary` 包進 `.hud-economy-group` 一體卡；教師＝移除經濟、`歡迎，{displayName}・教師端`。資料流零變更（inventory/economy 均既有 query）。

**Tech Stack:** React 19、CSS（globals.css 檔尾新節）、Vitest + Testing Library、Playwright。無新依賴。

**Spec:** `docs/superpowers/specs/2026-08-02-hud-menu-reorg-design.md`（已 commit e3708c4）

## Global Constraints

- 行為零變更：路由、API、RPC、計分不動；inventory/economy 為既有 hook 的唯讀新消費點。
- **載重字串**：11 個導覽標籤原字搬位（`學習大廳`/`Live 課堂`/`課後任務實戰`/`我的錯題`/`班級排行榜`/`成就徽章`/`裝備商店`/`教師工作區`/`Live 主持`/`班級管理`/`教學分析`）；`MENU`/`登出`/displayName 不動；新增字串僅 `歡迎，`（教師頂部前綴）與面板導覽 nav 的 `aria-label="更多導覽"`；列上兩個 nav 的 `aria-label`（`主要導覽`/`教師導覽`）不變。頭像為 `aria-hidden` 裝飾（裝備狀態於商店已有可及表達）。
- MENU 面板機制沿批⑤b **零改動**：恆掛 `hidden`、`aria-controls`、click-outside、開啟焦點移入、Escape 回 toggle。
- 44px 觸控（面板內導覽項也要）；對比 ≥4.5:1 rendered 實測；禁 `transform:scale()`；動畫只 transform/opacity＋`prefers-reduced-motion` 與 `[data-reduced-motion='true']` 雙通道；console 0。
- **containment 斷言**（外殼批教訓）：375×667 直向與 812×375 橫向，底部 HUD 與頂部經濟群組 right-edge 必須在 viewport 內（`scrollWidth` ≤ viewport＋逐鈕 boundingBox 包含性），不得只量 44px。
- LivePresenter 零接觸；投影/報表不在本批。
- 結構性測試斷言變更僅限 Task 1 盤點授權清單（本批影響面大：移入 hidden 面板的連結在收合時 `getByRole` 查不到）。既知紅（assignments-live/live-advanced/achievements/game-economy/learning-experience/session-lifecycle/shared-device/ui-restyle）不碰。
- **commit 隔離**：平行 session 檔絕不入 commit（`.gitignore`、`docs/content/*`、`package.json`、`scripts/content/import-fixes.json`、`src/features/auth/pages/login-page.tsx`、`supabase/seeds/content-*.sql`、untracked `.agents/`、`.claude/`、`artifacts/`、`live/`、`skills-lock.json`、`tests/contracts/fetch-sheet*`）。逐檔 git add，絕不 `git add -A`。
- commit 訊息一律 `git commit -F <session scratchpad 檔>`，結尾 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`。
- 每 commit 前 `npx prettier --check` 動過的檔；`eslint.config.js`/`package.json` 不可改；不得停用 hooks；勿推 main、勿部署。
- ledger `git add -f .superpowers/sdd/progress.md`（新節 `## HUD Menu Reorg Batch (2026-08-02)`）；SDD 報告檔前綴 `hudreorg-task-N-report.md`。
- dev server 5173 先 `curl -sf` 探測；gate 用獨立 Playwright。

## File Structure

| 檔案                                                            | 動作 | 職責                                       |
| --------------------------------------------------------------- | ---- | ------------------------------------------ |
| `docs/superpowers/plans/2026-08-02-hud-menu-reorg-inventory.md` | 新增 | Task 1 盤點（單元＋e2e 斷言授權清單）      |
| `src/app/shell/hud-command-bar.tsx`                             | 修改 | 列上縮減＋面板導覽區＋closeMenu            |
| `src/app/shell/hud-command-bar.test.tsx`                        | 同步 | 面板內導覽斷言（開 MENU 後查）             |
| `src/app/shell/app-shell.tsx`                                   | 修改 | hud-top 分流：學生群組卡＋教師歡迎         |
| `src/app/shell/app-shell.test.tsx`                              | 同步 | 導覽/識別斷言（授權清單）                  |
| `src/styles/globals.css`                                        | 修改 | 檔尾新節 `/* ── HUD 重組批 ── */`          |
| `tests/e2e/helpers/*` 與綠 e2e                                  | 同步 | `openHudMenu` helper＋依授權清單改點擊路徑 |
| `tests/e2e/app-shell.visual.spec.ts-snapshots`                  | 重拍 | HUD 佈局變更（顯式授權，commit 訊息記明）  |

**不動**：`economy-summary.tsx`（rewards 元件原樣，群組化靠外層 wrapper）、`blook-art.tsx`、`game-pager.tsx`、路由、repository/hooks。

---

### Task 1: 盤點（唯讀＋docs commit）

**Files:**

- Create: `docs/superpowers/plans/2026-08-02-hud-menu-reorg-inventory.md`
- Commit 同車: 本計畫檔＋ledger 新節

**Interfaces:**

- Produces: 授權清單（單元＋e2e 分節），每列 `檔:行｜斷言｜受影響 Task（2/3/4）｜處置（存活/開 MENU 後斷言/改直達路由/不碰-既知紅）`。

- [ ] **Step 1: 盤點 grep（唯讀）**

```bash
cd /Users/guanyucheng/Desktop/pei-game/colorplay
# 單元：HUD 與 app-shell 對 11 個標籤/識別/經濟的斷言
grep -n "學習大廳\|課後任務實戰\|裝備商店\|我的錯題\|Live 課堂\|班級排行榜\|成就徽章\|教師工作區\|Live 主持\|班級管理\|教學分析\|教師端\|Level \|Token\|economy" src/app/shell/hud-command-bar.test.tsx src/app/shell/app-shell.test.tsx
# e2e：綠 spec 中經底部 HUD 點「將移入面板的 7 個標籤」的位置（既知紅列出但標不碰）
grep -rn "name: '課後任務實戰'\|name: '我的錯題'\|name: '班級排行榜'\|name: '成就徽章'\|name: '裝備商店'\|name: '班級管理'\|name: '教學分析'" tests/e2e --include="*.ts"
grep -rn "主要導覽\|教師導覽" tests/e2e --include="*.ts" | head
# signOutViaHud 現行實作（重組後仍相容？）
sed -n '40,60p' tests/e2e/helpers/auth.ts
# 學生頂部資料源簽名（Task 4 依據）
sed -n '1,50p' src/features/inventory/hooks/use-blook-inventory.ts
grep -n "export function BlookArt" -A 8 src/components/ui/blook-art.tsx
# EconomySummaryView 消費端（確認只有 app-shell）
grep -rn "EconomySummaryView" src --include="*.tsx" | grep -v test
# 教師端經濟現況與測試斷言
sed -n '13,32p' src/app/shell/app-shell.tsx
# visual 快照清單（哪些含 HUD → 重拍面）
ls tests/e2e/app-shell.visual.spec.ts-snapshots/ && grep -n "toHaveScreenshot" tests/e2e/app-shell.visual.spec.ts | head
# .hud-menu__panel 現行底色 token（面板導覽字色基準）
sed -n "$(grep -n '\.hud-menu__panel' src/styles/globals.css | head -1 | cut -d: -f1),+14p" src/styles/globals.css
```

- [ ] **Step 2: 寫盤點文件**

必答：(a) 單元測試逐條處置（哪些改「先 `userEvent.click(MENU)` 再斷言」、哪些斷言面板內 link）；(b) 綠 e2e 逐支處置（點擊改 `openHudMenu` 前置 vs 改 `page.goto` 直達——以最小 diff 為準；既知紅列出標「不碰」）；(c) `signOutViaHud` 在面板加導覽區後是否仍穩（登出鈕 selector 是否唯一）；(d) `useBlookInventory`/`BlookArt` 確切簽名抄錄（Task 4 依據）；(e) 教師端現行 render `AuthenticatedEconomySummary` 的位置與相關測試斷言；(f) visual 快照受影響清單（重拍理由）；(g) `.hud-menu__panel` 底色 token（定案面板導覽字色 token）。

- [ ] **Step 3: prettier＋commit**

```bash
npx prettier --check docs/superpowers/plans/2026-08-02-hud-menu-reorg-inventory.md docs/superpowers/plans/2026-08-02-hud-menu-reorg.md
printf '%s\n' "docs(shell): hud reorg plan + assertion inventory" "" "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" > "$SCRATCH/commit-msg-hr1.txt"
git add docs/superpowers/plans/2026-08-02-hud-menu-reorg-inventory.md docs/superpowers/plans/2026-08-02-hud-menu-reorg.md
git add -f .superpowers/sdd/progress.md
git commit -F "$SCRATCH/commit-msg-hr1.txt"
```

（`$SCRATCH`＝session scratchpad；下同。）

---

### Task 2: HUD 指令列重組（TDD）

**Files:**

- Modify: `src/app/shell/hud-command-bar.tsx`
- Modify: `src/app/shell/hud-command-bar.test.tsx`（授權清單）
- Modify: `src/styles/globals.css`（檔尾新節 `/* ── HUD 重組批（spec 2026-08-02） ── */`）

**Interfaces:**

- Consumes: 既有 `commandTabClassName`；批⑤b 面板機制（hidden/click-outside/焦點——零改動）。
- Produces: 列上結構（學生：`學習大廳`+`Live 課堂` tabs＋spacer；教師：`教師工作區`+`Live 主持` tabs＋spacer）；面板導覽 `nav[aria-label="更多導覽"]` 內 `hud-menu__nav-link`（NavLink，點擊 `closeMenu`）。Task 3 的 e2e 依此結構。

- [ ] **Step 1: 失敗測試（依授權清單同步＋新斷言）**

新測試（沿檔內 render helper 慣例）：

```tsx
it('學生列上只剩學習大廳與 Live 課堂，其餘導覽收進 MENU 面板', async () => {
  renderStudentAt('/app');
  const bar = screen.getByRole('navigation', { name: '主要導覽' });
  expect(within(bar).getAllByRole('link')).toHaveLength(2);
  expect(screen.queryByRole('link', { name: '裝備商店' })).toBeNull(); // 面板 hidden
  await userEvent.click(screen.getByRole('button', { name: 'MENU' }));
  const panelNav = screen.getByRole('navigation', { name: '更多導覽' });
  for (const label of [
    '課後任務實戰',
    '我的錯題',
    '班級排行榜',
    '成就徽章',
    '裝備商店',
  ]) {
    expect(within(panelNav).getByRole('link', { name: label })).toBeVisible();
  }
});

it('點擊面板導覽項後 MENU 自動關閉', async () => {
  renderStudentAt('/app');
  await userEvent.click(screen.getByRole('button', { name: 'MENU' }));
  await userEvent.click(screen.getByRole('link', { name: '裝備商店' }));
  expect(document.getElementById('hud-menu-panel')).toHaveAttribute('hidden');
});

it('教師列上剩工作區與 Live 主持，班級管理/教學分析收進 MENU', async () => {
  renderTeacherAt('/teacher');
  const bar = screen.getByRole('navigation', { name: '教師導覽' });
  expect(within(bar).getAllByRole('link')).toHaveLength(2);
  await userEvent.click(screen.getByRole('button', { name: 'MENU' }));
  const panelNav = screen.getByRole('navigation', { name: '更多導覽' });
  expect(
    within(panelNav).getByRole('link', { name: '班級管理' }),
  ).toBeVisible();
  expect(
    within(panelNav).getByRole('link', { name: '教學分析' }),
  ).toBeVisible();
});
```

既有斷言依授權清單同步（標籤迴圈/active 態測試改為列上＋面板的查法）。
Run: `npx vitest run src/app/shell/hud-command-bar.test.tsx` → 新斷言 FAIL。

- [ ] **Step 2: 實作 hud-command-bar.tsx**

```tsx
const menuLinkClassName = ({ isActive }: { isActive: boolean }) =>
  `hud-menu__nav-link${isActive ? ' hud-menu__nav-link--active' : ''}`;
// component 內：
const closeMenu = () => {
  setMenuOpen(false);
};
```

列上（學生分支；教師分支同構、換字串與路徑）：

```tsx
<nav aria-label="主要導覽" className="hud-command__nav">
  <NavLink className={commandTabClassName} end to="/app">
    學習大廳
  </NavLink>
  <NavLink className={commandTabClassName} to="/app/live/join">
    Live 課堂
  </NavLink>
  <span aria-hidden="true" className="hud-command__spacer" />
</nav>
```

面板（`hud-menu__user` 之前插入）：

```tsx
<nav aria-label="更多導覽" className="hud-menu__nav">
  {variant === 'student' ? (
    <>
      <NavLink className={menuLinkClassName} onClick={closeMenu} to="/app/missions">
        課後任務實戰
      </NavLink>
      <NavLink className={menuLinkClassName} onClick={closeMenu} to="/app/mistakes">
        我的錯題
      </NavLink>
      <NavLink className={menuLinkClassName} onClick={closeMenu} to="/app/leaderboard">
        班級排行榜
      </NavLink>
      <NavLink className={menuLinkClassName} onClick={closeMenu} to="/app/achievements">
        成就徽章
      </NavLink>
      <NavLink className={menuLinkClassName} onClick={closeMenu} to="/app/shop">
        裝備商店
      </NavLink>
    </>
  ) : (
    <>
      <NavLink className={menuLinkClassName} onClick={closeMenu} to="/teacher/classes">
        班級管理
      </NavLink>
      <NavLink className={menuLinkClassName} onClick={closeMenu} to="/teacher/analytics">
        教學分析
      </NavLink>
    </>
  )}
</nav>
<span aria-hidden="true" className="hud-menu__divider" />
```

- [ ] **Step 3: CSS（字色 token 依 Task 1 (g) 面板底色定案；下為夜色面板預設，若 (g) 判定淺底則字色改 `var(--ink-900)`、active 改 `var(--pixel-gold-deep)`——二擇一寫死，不留兩套）**

```css
/* ── HUD 重組批（spec 2026-08-02）：面板導覽區 ── */
.hud-menu__nav {
  display: grid;
  gap: 6px;
  margin-bottom: var(--space-3);
}

.hud-menu__nav-link {
  display: flex;
  min-height: 44px;
  align-items: center;
  border: 2px solid transparent;
  border-radius: var(--radius-pixel);
  color: var(--pixel-window-ink);
  font-weight: 700;
  padding: 0 14px;
  text-decoration: none;
}

.hud-menu__nav-link--active {
  border-color: var(--pixel-gold);
  color: var(--pixel-gold);
}

.hud-menu__divider {
  display: block;
  height: 2px;
  background: var(--pixel-window-muted);
  margin: var(--space-2) 0 var(--space-3);
}
```

- [ ] **Step 4: 全綠＋commit**

Run: `npx vitest run src/app/shell/ && npx tsc -b --pretty false && npx prettier --check <動過的檔>`
Expected: 全綠。
Commit（-F）：`feat(shell): move secondary nav into hud menu panel`

---

### Task 3: e2e 同步（helper＋綠 spec＋快照重拍）

**Files:**

- Modify: `tests/e2e/helpers/auth.ts`（加 `openHudMenu`；若 (c) 判定需加固 signOutViaHud selector 一併）
- Modify: 授權清單列出的綠 e2e spec 檔
- Re-record: `tests/e2e/app-shell.visual.spec.ts-snapshots/*`（依 (f) 清單）

**Interfaces:**

- Consumes: Task 2 面板結構（`nav[aria-label="更多導覽"]`、`#hud-menu-panel`）。
- Produces: `openHudMenu(page: Page): Promise<void>`（tests/e2e/helpers/auth.ts export）。

- [ ] **Step 1: helper**

```ts
export async function openHudMenu(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'MENU' }).click();
  await expect(page.locator('#hud-menu-panel')).toBeVisible();
}
```

（`expect` 沿檔內既有 import 慣例。）

- [ ] **Step 2: 依授權清單逐支同步**

每處「點擊已移入面板的導覽」前插 `await openHudMenu(page);`（或依 (b) 處置欄改 `page.goto` 直達——逐支照清單）。既知紅不碰。

- [ ] **Step 3: 真跑受影響綠 spec＋重拍快照**

```bash
npx playwright test <授權清單列出的綠 spec> --project=chromium
npx playwright test tests/e2e/app-shell.visual.spec.ts --project=chromium --update-snapshots
npx playwright test tests/e2e/app-shell.visual.spec.ts --project=chromium
```

Expected: 同步後全綠；快照重拍後穩定綠（連跑兩次第二次零 diff）。

- [ ] **Step 4: commit**

逐檔 add（含 snapshots 目錄實際變更檔）。
Commit（-F）：`test(e2e): sync nav flows with hud menu panel + re-record hud snapshots`（內文記明重拍原因＝HUD 佈局變更）。

---

### Task 4: 頂部 hud-top 分流（學生頭像群組＋教師歡迎）（TDD）

**Files:**

- Modify: `src/app/shell/app-shell.tsx`
- Modify: `src/app/shell/app-shell.test.tsx`（授權清單）
- Modify: `src/styles/globals.css`（HUD 重組批節續寫）

**Interfaces:**

- Consumes: `BlookArt({ emoji, size, stableCode })`（src/components/ui/blook-art.tsx）；`useBlookInventory`（src/features/inventory/hooks/use-blook-inventory.ts，items[].equipped/emoji/stableCode——以 Task 1 (d) 抄錄簽名為準）；既有 `AuthenticatedEconomySummary`。
- Produces: `StudentHudAvatar`（app-shell.tsx 檔內 function，不外銷）；hud-top 新結構。

- [ ] **Step 1: 失敗測試**

```tsx
it('學生頂部顯示頭像框與經濟群組', async () => {
  renderStudentShell(); // 沿檔內既有 helper；inventory stub 含一件 equipped blook
  expect(await screen.findByText(/Level \d+/u)).toBeInTheDocument();
  expect(document.querySelector('.hud-economy-group')).not.toBeNull();
  expect(document.querySelector('.hud-avatar')).not.toBeNull();
});

it('教師頂部顯示歡迎識別且不渲染經濟數字', async () => {
  renderTeacherShell();
  expect(await screen.findByText(/歡迎，.+・教師端/u)).toBeInTheDocument();
  expect(screen.queryByText(/Level \d+/u)).toBeNull();
  expect(screen.queryByText(/\d+ Token/u)).toBeNull();
});
```

Run → FAIL。（inventory stub 沿 app-shell.test 既有 QueryClient/repository 注入慣例；若該檔未 mock inventory，照檔內其他 feature 的 mock 寫法補。）

- [ ] **Step 2: 實作 app-shell.tsx**

```tsx
import { BlookArt } from '../../components/ui/blook-art';
import { useBlookInventory } from '../../features/inventory/hooks/use-blook-inventory';

// 學生頂部頭像：裝備中 Blook；載入中/錯誤/未裝備一律 hero 精靈 fallback（CSS 背景）。
function StudentHudAvatar() {
  const inventory = useBlookInventory();
  const equipped = inventory.data?.items.find((item) => item.equipped) ?? null;
  return (
    <span
      aria-hidden="true"
      className={`hud-avatar${equipped ? '' : ' hud-avatar--hero'}`}
    >
      {equipped ? (
        <BlookArt
          emoji={equipped.emoji}
          size={26}
          stableCode={equipped.stableCode}
        />
      ) : null}
    </span>
  );
}
```

hud-top 分流（原教師 identity 區塊改為）：

```tsx
<header className="hud-top">
  {isTeacher ? (
    <span className="hud-top__identity">
      <Icon name="lock-open" size={14} />
      歡迎，{profile.data?.displayName}・教師端
    </span>
  ) : (
    <div className="hud-economy-group">
      <StudentHudAvatar />
      <AuthenticatedEconomySummary />
    </div>
  )}
  {signOutError ? (
    <p className="app-shell__auth-error" role="alert">
      登出失敗，請稍後重試。
    </p>
  ) : null}
</header>
```

（教師不再 render `AuthenticatedEconomySummary`——移除消費點、economy query 教師端不再發。）

- [ ] **Step 3: CSS（HUD 重組批節續寫）**

```css
/* 學生頂部：頭像＋Level/XP/Token 一體群組卡（像素金框）。 */
.hud-economy-group {
  display: flex;
  align-items: center;
  border: 2px solid var(--pixel-gold-deep);
  border-radius: var(--radius-pixel);
  background: var(--pixel-night);
  box-shadow: 2px 2px 0 var(--pixel-shadow);
  gap: var(--space-2);
  padding: 4px 10px 4px 4px;
}

.hud-avatar {
  display: grid;
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  border: 2px solid var(--pixel-gold);
  border-radius: var(--radius-pixel);
  background: var(--pixel-night-deep);
  place-items: center;
}

.hud-avatar--hero {
  background:
    url('../assets/sprites/hero.png') center / 24px 24px no-repeat,
    var(--pixel-night-deep);
  image-rendering: pixelated;
}
```

（若群組卡與 `.hud-top .economy-summary` 既有框疊出雙框，僅允許在新節以 `.hud-economy-group .economy-summary { border: 0; box-shadow: none; background: transparent; }` 收斂——不改 economy-summary 原節。）

- [ ] **Step 4: 全綠＋commit**

Run: `npx vitest run src/app/shell/ && npx tsc -b --pretty false && npx eslint src/app/shell --max-warnings 0 && npx prettier --check <動過的檔>`
Expected: 全綠。
Commit（-F）：`feat(shell): student avatar economy group + teacher welcome identity`

---

### Task 5: Gate＋ledger 收批

**Files:**

- Modify: `.superpowers/sdd/progress.md`（收批節）
- 拋棄式量測腳本：session scratchpad

**Interfaces:**

- Consumes: Task 1-4 commits；`TEST_USERS`（tests/fixtures/users.ts）。
- Produces: gate 數字入 ledger。

- [ ] **Step 1: 全套驗證**

```bash
npx vitest run                      # 全綠（基線 830＋新增，記數字）
npx tsc -b --pretty false && npx eslint . --max-warnings 0
npx playwright test tests/e2e/live-smoke.spec.ts tests/e2e/classroom-leaderboard.spec.ts tests/e2e/chapter-select.spec.ts tests/e2e/app-shell.visual.spec.ts tests/e2e/auth-account.spec.ts tests/e2e/playable-slice.spec.ts --project=chromium
```

Expected: 全綠（auth-account/playable-slice 走 signOutViaHud——重組相容直接證據）。

- [ ] **Step 2: 真跑量測（拋棄式腳本，學生＋教師帳號）**

① **containment**：375×667 與 812×375、學生與教師兩端：`document.documentElement.scrollWidth <= viewport.width`＋列上每鈕與面板開啟後每導覽項 `boundingBox()` 完整落在 viewport（right-edge）。② **44px**：列上鈕、面板導覽項、MENU 鈕。③ **對比**：面板導覽字/active 態、`歡迎，…・教師端`、economy 群組內 Level/XP/Token 字（rendered getComputedStyle，全 ≥4.5:1）。④ 頭像：裝備 Blook 帳號見 BlookArt、未裝備帳號見 hero fallback（截圖記錄）。⑤ console 0。任何未達→回修再跑。**勿動 student.one 的資料。**

- [ ] **Step 3: ledger 收批＋commit**

`## HUD Menu Reorg Batch (2026-08-02)` 節補：全部 commit hash、測試數字、量測表、debt 移交。

```bash
git add -f .superpowers/sdd/progress.md
git commit -F "$SCRATCH/commit-msg-hr5.txt"   # "docs(sdd): close hud menu reorg batch with gate results"
```

---

## Self-Review 紀錄

- Spec §1 兩端列上/面板分配=T2、自動關面板=T2、§2 學生頭像群組=T4、教師歡迎=T4、§3 鐵律（containment/44px/對比/雙通道）=T5 gate、§4 測試影響=T1 授權＋T2/T3/T4 同步。✔
- 命名一致：`menuLinkClassName`/`hud-menu__nav`/`hud-menu__nav-link`/`hud-menu__divider`/`StudentHudAvatar`/`hud-economy-group`/`hud-avatar` 於 T2/T4 定義、T3/T5 消費。✔
- 面板底色 token 二義處以 Task 1 (g) 定案（不留兩套並行）。✔
