# 教師端整體優化批（Teacher Workspace）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 教師端八頁套用「賢者工坊」語彙（夜窗小卡／羊皮紙木牌／像素指令鈕，chrome 像素化 ≤3 處/頁）＋外殼批 HUD debt 三項＋紅 spec sizing 盤點報告（owner 2026-08-02 核准 spec）。

**Architecture:** 表現層為主：CSS 語彙集中在 `globals.css` 新增共用類（`.sage-page-header`／`.sage-title-bar`／`.pixel-command`）＋既有類修飾；JSX 只做 className 增補、GamePager 包裹（班級卡）、嚴重度/獎牌符號（aria 並存）。唯一結構變更＝HUD 教師導覽 Link→NavLink＋MENU 面板恆掛 DOM，經 Task 1 盤點顯式同步測試。

**Tech Stack:** React 19、CSS（globals.css）、Vitest + Testing Library、Playwright。無新依賴。

**Spec:** `docs/superpowers/specs/2026-08-02-teacher-workspace-design.md`（owner 2026-08-02 核准；未 commit，由 Task 1 一併納入）

## Global Constraints

- **行為零變更**：路由、API、RPC、計分、finalize、rules_version 不動；表單欄位/流程零變更（Live 建立）；資料排序不動。
- **載重字串一字不改**：`教師工作區`／`教學分析`／`班級管理`／`班級成員`／`Live 課堂主持`／`Live 主持台`／`場次報表`／`建立活動並開場`／`前往主持 ▶`／錯誤與空狀態文案全部原樣。新增純裝飾符號（▲/★）一律 `aria-hidden` 且不得插入既有字串節點內部。
- **LivePresenter（`src/features/live/components/live-presenter.tsx`）零接觸**：不改任何行；44px 只做 rendered 量測記錄（Task 10）。
- **像素濃度 ≤3 處/頁**：chrome（標題列/卡框/按鈕）才可像素化；同型元素（如五個區塊標題列同語彙）算 1 處。資料區（表格/圖表/數字）維持淺底深字、不用像素字體（加入碼六碼票券為唯一例外）。
- **表格鐵律**：`.ui-table` 內距/欄寬/字級不動；框語彙只做外層容器；1024/1440 寬度實測不壓縮可讀寬。
- 44px 觸控；對比 ≥4.5:1 rendered 實測；禁 `transform:scale()`；動畫只動 transform/opacity＋`prefers-reduced-motion` 與 `[data-reduced-motion='true']` 雙通道瞬切；console 0。
- **commit 隔離**：平行 session 檔絕不入 commit（`.gitignore`、`docs/content/*`、`package.json`、`scripts/content/import-fixes.json`、`src/features/auth/pages/login-page.tsx`、`supabase/seeds/content-*.sql`、untracked `.agents/`、`.claude/`、`artifacts/`、`live/`、`skills-lock.json`、`tests/contracts/fetch-sheet*`、`.superpowers/sdd/task-10-report.md` 的未 commit 變更）。commit 只 stage 自己的檔案。
- commit 訊息一律 `git commit -F <檔案>`（檔案放 session scratchpad；前批 heredoc 三次產生 EOF/`)` 殘渣被退回）；結尾 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`。
- 每 commit 前 `npx prettier --check` 動過的檔；ledger `git add -f .superpowers/sdd/progress.md`（新節 `## Teacher Workspace Batch (2026-08-02)`）；SDD 報告檔用 `teacher-task-N-report.md` 前綴；`eslint.config.js`/`package.json` 不可改；不得停用 hooks；gate 拋棄式腳本只放 session scratchpad；勿推 main、勿部署。
- **既知紅不碰**（全部已驗與 base 簽名逐字相同）：assignments-live／live-advanced／achievements／game-economy／learning-experience（acceptance-mode 守門 throw）＋session-lifecycle／shared-device（/app/profile 已刪）＋ui-restyle（login-page 文案漂移）。其字串仍載重。
- 量測若會變動成績/Token/錯題狀態，用拋棄式帳號；**勿再動 student.one**（其本地 DB 基線已於分頁批位移）。教師端 Live 量測用 `TEST_USERS`（`tests/fixtures/users.ts`）教師帳號建場→量測→取消場次（與 live-smoke 同構，慣例允許）。
- dev server `pnpm dev`（5173 可能已有前一 session 實例——先 `curl -sf http://localhost:5173 >/dev/null` 探測，活著就直接用，不要再起第二個）；MCP 瀏覽器可能被平行 session 鎖住→gate 用獨立 Playwright 腳本。

## File Structure

| 檔案                                                               | 動作 | 職責                                             |
| ------------------------------------------------------------------ | ---- | ------------------------------------------------ |
| `docs/superpowers/plans/2026-08-02-teacher-workspace-inventory.md` | 新增 | Task 1 盤點（結構斷言×處置表）                   |
| `src/app/shell/hud-command-bar.tsx`                                | 修改 | 教師 Link→NavLink＋面板恆掛＋click-outside＋焦點 |
| `src/app/shell/hud-command-bar.test.tsx`                           | 同步 | active 態/aria-controls/click-outside 新斷言     |
| `src/styles/globals.css`                                           | 修改 | 共用語彙類＋各頁修飾（追加於檔尾教師批節）       |
| `src/features/teacher-content/pages/teacher-dashboard-page.tsx`    | 修改 | 工坊台三欄 className＋捷徑指令鈕                 |
| `src/features/teacher-content/pages/teacher-analytics-page.tsx`    | 修改 | 高頻錯誤卡嚴重度符號（aria 並存）                |
| `src/features/classrooms/pages/teacher-classrooms-page.tsx`        | 修改 | 班級卡 GamePager（wide 6／narrow 3）             |
| `src/features/classrooms/pages/teacher-classrooms-page.test.tsx`   | 同步 | 溢出分頁新測試                                   |
| `src/features/classrooms/pages/teacher-classroom-detail-page.tsx`  | 修改 | 頁首識別牌 className                             |
| `src/features/classrooms/pages/teacher-student-progress-page.tsx`  | 修改 | 頁首標題列 className（內容不動）                 |
| `src/features/live/pages/teacher-live-session-page.tsx`            | 修改 | 錯誤過渡卡「開幕」className                      |
| `src/features/live/pages/teacher-live-report-page.tsx`             | 修改 | 頁首語彙＋前三名獎牌符號                         |
| `docs/superpowers/plans/2026-08-02-red-spec-sizing.md`             | 新增 | Task 9 紅 spec 斷差/工作量報告                   |

**不動**：`teacher-live-page.tsx`（Task 7 純 CSS）、`live-presenter.tsx`、`game-pager.tsx`、路由、所有 repository/hooks。

---

### Task 1: 結構斷言盤點（唯讀＋docs commit）

**Files:**

- Create: `docs/superpowers/plans/2026-08-02-teacher-workspace-inventory.md`
- Commit 同車: `docs/superpowers/specs/2026-08-02-teacher-workspace-design.md`（未 commit 的已核准 spec）、本計畫檔、ledger 新節

**Interfaces:**

- Produces: 盤點表，每列 `測試檔:行號｜斷言目標｜受影響 Task｜處置（存活不動／Task N 顯式同步／不碰-既知紅）`。後續 Task 的測試同步只能動此表列出的斷言。

- [ ] **Step 1: 盤點 grep（唯讀）**

```bash
cd /Users/guanyucheng/Desktop/pei-game/colorplay
# HUD 教師導覽結構斷言（Task 2 影響面：NavLink 會加 aria-current、active class、面板恆掛 DOM）
grep -n "教師工作區\|Live 主持\|班級管理\|教學分析\|hud-menu\|hud-command\|aria-controls\|MENU" src/app/shell/hud-command-bar.test.tsx src/app/shell/app-shell.test.tsx
grep -rn "教師工作區\|Live 主持\|hud-menu\|MENU" tests/e2e --include="*.spec.ts" | grep -v "expected-failures"
# 教師八頁載重字串與結構斷言
grep -rn "班級成員\|場次報表\|Live 課堂主持\|建立活動並開場\|管理班級\|查看細節\|複製\b" tests/e2e --include="*.spec.ts" | grep -v "expected-failures" | head -40
grep -n "getAllBy\|toHaveLength\|querySelector\|getByRole" src/features/teacher-content/pages/*.test.tsx src/features/classrooms/pages/*.test.tsx src/features/live/pages/*.test.tsx | head -60
# 班級卡分頁：測試 fixture 的班級數 vs 容量（wide 6）
grep -n "classroom" src/features/classrooms/pages/teacher-classrooms-page.test.tsx | head -20
# app-shell.visual 快照是否覆蓋教師頁（若有→Task 10 顯式重拍）
grep -n "teacher\|snapshot\|toHaveScreenshot" tests/e2e/app-shell.visual.spec.ts
# a11y spec 是否掃教師頁（aria-current/hidden panel 影響）
grep -n "teacher\|/teacher" tests/e2e/accessibility.spec.ts
```

- [ ] **Step 2: 寫盤點文件**

必答問題：(a) NavLink 化後 `aria-current="page"`＋`hud-command__tab--active` class 會出現在哪些既有斷言的元素上？（已知候選：`app-shell.test.tsx:272-380` 的 href 斷言——href 不變應存活；`hud-command-bar.test.tsx:41` 的 4 標籤迴圈——role link 不變應存活；逐一驗證後記錄）。(b) MENU 面板恆掛 DOM 後，哪些測試以「面板不存在」斷言收合態？→ 改為 `hidden` 屬性斷言，列出行號。(c) 班級卡在各測試 fixture 的數量是否 ≤6（不觸發分頁）？(d) app-shell.visual 快照與 a11y spec 是否覆蓋教師頁。結論表沿分頁批 inventory 格式。

- [ ] **Step 3: prettier＋commit（訊息用 -F 檔案）**

```bash
npx prettier --check docs/superpowers/plans/2026-08-02-teacher-workspace-inventory.md docs/superpowers/plans/2026-08-02-teacher-workspace.md docs/superpowers/specs/2026-08-02-teacher-workspace-design.md
printf '%s\n' "docs(teacher): teacher workspace plan, approved spec, assertion inventory" "" "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" > "$SCRATCH/commit-msg-t1.txt"
git add docs/superpowers/plans/2026-08-02-teacher-workspace-inventory.md docs/superpowers/plans/2026-08-02-teacher-workspace.md docs/superpowers/specs/2026-08-02-teacher-workspace-design.md
git add -f .superpowers/sdd/progress.md
git commit -F "$SCRATCH/commit-msg-t1.txt"
```

（`$SCRATCH`＝session scratchpad 目錄；下同。）

---

### Task 2: HUD debt 三項（TDD）

**Files:**

- Modify: `src/app/shell/hud-command-bar.tsx`
- Modify: `src/app/shell/hud-command-bar.test.tsx`（僅 Task 1 盤點表列出的斷言＋新測試）

**Interfaces:**

- Consumes: 既有 `commandTabClassName`／`commandLinkClassName`（檔內 4-7 行，學生端已在用）。
- Produces: 教師導覽 4 項 NavLink（active 態同學生端 class）；`#hud-menu-panel` 恆掛 DOM 以 `hidden` 切換；面板開啟時焦點移入、點擊面板外關閉。

- [ ] **Step 1: 寫失敗測試（新斷言）**

```tsx
// hud-command-bar.test.tsx 新增（router 初始路徑 /teacher/classes 的教師 variant render helper 沿檔內既有寫法）
it('教師導覽於目前路徑顯示 active 態', () => {
  renderTeacherAt('/teacher/classes');
  expect(screen.getByRole('link', { name: '班級管理' })).toHaveClass(
    'hud-command__link--active',
  );
  expect(screen.getByRole('link', { name: '教學分析' })).not.toHaveClass(
    'hud-command__link--active',
  );
});

it('MENU 面板收合時仍掛在 DOM 且 hidden，aria-controls 不懸空', () => {
  renderTeacherAt('/teacher');
  const panel = document.getElementById('hud-menu-panel');
  expect(panel).not.toBeNull();
  expect(panel).toHaveAttribute('hidden');
});

it('點擊面板外會關閉 MENU；開啟時焦點移入面板', async () => {
  renderTeacherAt('/teacher');
  await userEvent.click(screen.getByRole('button', { name: 'MENU' }));
  const panel = document.getElementById('hud-menu-panel');
  expect(panel).not.toHaveAttribute('hidden');
  expect(panel?.contains(document.activeElement)).toBe(true);
  await userEvent.click(document.body);
  expect(panel).toHaveAttribute('hidden');
});
```

- [ ] **Step 2: 跑測試確認紅**

Run: `npx vitest run src/app/shell/hud-command-bar.test.tsx`
Expected: 新 3 條 FAIL（active class 不存在／panel 為 null／hidden 缺席）。

- [ ] **Step 3: 實作**

```tsx
// 教師分支：Link → NavLink（/teacher 必須 end，否則其餘三路徑都命中前綴）
<nav aria-label="教師導覽" className="hud-command__nav">
  <NavLink className={commandTabClassName} end to="/teacher">
    教師工作區
  </NavLink>
  <NavLink className={commandTabClassName} to="/teacher/live">
    Live 主持
  </NavLink>
  <NavLink className={commandLinkClassName} to="/teacher/classes">
    班級管理
  </NavLink>
  <NavLink className={commandLinkClassName} to="/teacher/analytics">
    教學分析
  </NavLink>
</nav>
```

```tsx
// 面板恆掛＋click-outside＋焦點移入（hud-menu 容器加 ref）
const menuRef = useRef<HTMLDivElement>(null);
const menuPanelRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  if (!menuOpen) return;
  menuPanelRef.current?.focus();
  const onPointerDown = (event: PointerEvent) => {
    if (!menuRef.current?.contains(event.target as Node)) {
      setMenuOpen(false);
    }
  };
  document.addEventListener('pointerdown', onPointerDown);
  return () => {
    document.removeEventListener('pointerdown', onPointerDown);
  };
}, [menuOpen]);
```

```tsx
<div className="hud-menu" ref={menuRef}>
  {/* toggle 不變 */}
  <div
    className="hud-menu__panel"
    hidden={!menuOpen}
    id="hud-menu-panel"
    ref={menuPanelRef}
    tabIndex={-1}
  >
    {/* 內容不變：displayName＋登出鈕 */}
  </div>
</div>
```

既有 Escape useEffect 保留（焦點回 toggle）。若 tabIndex=-1 容器聚焦出現預設外框，於 globals.css 教師批節補 `.hud-menu__panel:focus { outline: none; }`（程式聚焦通常不觸發 focus-visible，先實測再補）。

- [ ] **Step 4: 同步盤點表列出的既有斷言＋全綠**

Run: `npx vitest run src/app/shell/`
Expected: PASS（含 app-shell.test.tsx——href 斷言不受 NavLink 影響；若盤點表列出面板存在性舊斷言，改 hidden 斷言）。

- [ ] **Step 5: prettier＋commit**

```bash
npx prettier --check src/app/shell/hud-command-bar.tsx src/app/shell/hud-command-bar.test.tsx
git add src/app/shell/hud-command-bar.tsx src/app/shell/hud-command-bar.test.tsx
git commit -F "$SCRATCH/commit-msg-t2.txt"
# 訊息："fix(shell): teacher HUD active state, persistent menu panel, click-outside + focus"
```

---

### Task 3: 共用語彙＋工坊台 `/teacher`

**Files:**

- Modify: `src/styles/globals.css`（檔尾新節 `/* ── 教師批：賢者工坊語彙 ── */`）
- Modify: `src/features/teacher-content/pages/teacher-dashboard-page.tsx`

**Interfaces:**

- Produces（後續 Task 4/6/8 共用）：
  - `.sage-page-header`——頁首識別牌：木牌配方＋`h1 { font-family: var(--font-pixel-tc); }`
  - `.sage-title-bar`——區塊標題列
  - `.pixel-command`——像素指令鈕（Link/button 通用）

- [ ] **Step 1: 共用語彙 CSS（globals.css 檔尾）**

```css
/* ── 教師批：賢者工坊語彙（spec 2026-08-02；chrome 像素化 ≤3 處/頁） ── */
/* 木牌配方沿商店貨架（.scene-day .blook-card）：羊皮紙格＋厚底木板＋硬影。 */
.sage-page-header {
  border: 2px solid var(--pixel-gold-deep);
  border-bottom: 6px solid var(--pixel-gold-deep);
  border-radius: var(--radius-pixel);
  background: var(--pixel-parchment-card);
  box-shadow: 4px 4px 0 var(--pixel-shadow);
  padding: 20px 22px;
}

.sage-page-header h1 {
  font-family: var(--font-pixel-tc);
  font-size: 22px;
}

.sage-title-bar {
  border: 2px solid var(--pixel-gold-deep);
  border-radius: var(--radius-pixel);
  background: var(--pixel-parchment-card);
  box-shadow: 3px 3px 0 var(--pixel-shadow);
  font-family: var(--font-pixel-tc);
  padding: 10px 14px;
}

.pixel-command {
  border: 2px solid var(--ink-900);
  border-radius: var(--radius-pixel);
  background: var(--pixel-parchment-card);
  box-shadow: 3px 3px 0 var(--pixel-shadow);
  color: var(--ink-900);
  font-weight: 800;
  transition: translate 120ms ease-out;
}

.pixel-command:hover {
  translate: 0 -2px;
}

@media (prefers-reduced-motion: reduce) {
  .pixel-command {
    transition: none;
  }
}

[data-reduced-motion='true'] .pixel-command {
  transition: none;
}
```

- [ ] **Step 2: 工坊台 CSS（同節續寫）**

```css
/* 工坊台（≥1024px）：Live 夜窗主位置左，總覽/捷徑置右。 */
@media (min-width: 1024px) {
  .teacher-dashboard-grid--forge {
    grid-template-columns: minmax(0, 1fr) minmax(0, 0.8fr);
  }
}

/* Live 控制台＝夜窗小卡（配方同 .purchase-dialog）。 */
.teacher-live-console--night {
  border: 3px solid var(--pixel-window-frame);
  border-radius: var(--radius-pixel);
  outline: 2px solid var(--pixel-night);
  background: var(--pixel-night);
  box-shadow:
    0 0 0 5px var(--pixel-window-frame),
    4px 4px 0 var(--pixel-shadow);
  color: var(--pixel-window-ink);
}

.teacher-live-console--night .teacher-live-console__title {
  color: var(--pixel-window-ink);
}

.teacher-live-console--night .teacher-live-console__description {
  color: var(--pixel-window-muted);
}

/* 總覽數字卡＝像素徽章：金框硬影，數字仍深字大號（資料非 chrome）。 */
.teacher-dashboard-grid--forge .teacher-summary-card__stat {
  border: 2px solid var(--pixel-gold-deep);
  border-left-width: 6px;
  border-radius: var(--radius-pixel);
  background: var(--pixel-parchment-card);
  box-shadow: 2px 2px 0 var(--pixel-shadow);
}

/* 捷徑＝像素指令鈕列。 */
.teacher-shortcut-card__list a.pixel-command {
  border: 2px solid var(--ink-900);
  border-radius: var(--radius-pixel);
  background: var(--pixel-parchment-card);
}
```

- [ ] **Step 3: JSX className 增補（字串/DOM 結構不動）**

`teacher-dashboard-page.tsx` 三處：

```tsx
<div className="teacher-live-console teacher-live-console--night">
```

```tsx
<div className="teacher-dashboard-grid teacher-dashboard-grid--forge">
```

```tsx
<Link className="pixel-command" to="/teacher/analytics">
  教學分析 <span aria-hidden="true">›</span>
</Link>
<Link className="pixel-command" to="/teacher/classes">
  班級管理 <span aria-hidden="true">›</span>
</Link>
```

（`.teacher-shortcut-card__list a` 既有 CSS 仍生效，`pixel-command` 覆蓋外觀。）

- [ ] **Step 4: 驗證**

Run: `npx vitest run src/features/teacher-content/pages/teacher-dashboard-page.test.tsx && npx prettier --check src/styles/globals.css src/features/teacher-content/pages/teacher-dashboard-page.tsx`
Expected: PASS（href/字串斷言不受 className 影響）。
濃度自查：夜窗(1)＋徽章數字卡(2)＋指令鈕(3)＝3 處，頁首 header 維持現行不像素化。

- [ ] **Step 5: commit**

```bash
git add src/styles/globals.css src/features/teacher-content/pages/teacher-dashboard-page.tsx
git commit -F "$SCRATCH/commit-msg-t3.txt"
# 訊息："feat(teacher): sage-workshop vocabulary + forge dashboard layout"
```

---

### Task 4: 教學分析 `/teacher/analytics`

**Files:**

- Modify: `src/styles/globals.css`（教師批節續寫）
- Modify: `src/features/teacher-content/pages/teacher-analytics-page.tsx`
- Modify: `src/features/teacher-content/pages/teacher-analytics-page.test.tsx`（新增嚴重度 aria 斷言）

**Interfaces:**

- Consumes: `.teacher-analytics-section`（globals.css:5149 既有 overflow 守門，不動）。
- Produces: 高頻錯誤卡嚴重度符號（rank 制：第 1 名 `▲▲▲`＝高、第 2 名 `▲▲`＝中，`aria-hidden`＋`visually-hidden` 文字並存）。

- [ ] **Step 1: 失敗測試（嚴重度 aria 文字）**

```tsx
// teacher-analytics-page.test.tsx：沿檔內既有高頻錯誤 render 情境新增
it('高頻錯誤概念標示嚴重度（螢幕閱讀器文字）', async () => {
  renderAnalyticsWithWorstQuestions(); // 沿檔內既有 fixture helper 名稱
  expect(await screen.findByText('嚴重度：高')).toBeInTheDocument();
  expect(screen.getByText('嚴重度：中')).toBeInTheDocument();
});
```

Run: `npx vitest run src/features/teacher-content/pages/teacher-analytics-page.test.tsx` → 新斷言 FAIL。

- [ ] **Step 2: JSX——嚴重度符號（rank 制，避開 correct_rate 單位歧義）**

```tsx
{
  worst.map((row, index) => (
    <article className="teacher-error-card" key={row.stable_code}>
      <span className="teacher-error-card__badge">高頻錯誤 {index + 1}</span>
      <span aria-hidden="true" className="teacher-error-card__severity">
        {index === 0 ? '▲▲▲' : '▲▲'}
      </span>
      <span className="visually-hidden">
        {index === 0 ? '嚴重度：高' : '嚴重度：中'}
      </span>
      <strong>{row.prompt}</strong>
      {/* p 段落原樣 */}
    </article>
  ));
}
```

- [ ] **Step 3: CSS——標題列語彙＋嚴重度色（純選擇器，JSX 標題不動）**

```css
/* 分析區塊標題列＝賢者窗語彙；表格零改動（overflow 守門既有）。 */
.teacher-analytics-section > h2 {
  border: 2px solid var(--pixel-gold-deep);
  border-radius: var(--radius-pixel);
  background: var(--pixel-parchment-card);
  box-shadow: 3px 3px 0 var(--pixel-shadow);
  font-family: var(--font-pixel-tc);
  padding: 10px 14px;
}

.teacher-error-card__severity {
  color: var(--coral-700);
  font-size: 0.85rem;
  letter-spacing: 2px;
}
```

- [ ] **Step 4: 驗證＋commit**

Run: `npx vitest run src/features/teacher-content/pages/teacher-analytics-page.test.tsx && npx prettier --check src/features/teacher-content/pages/teacher-analytics-page.tsx src/features/teacher-content/pages/teacher-analytics-page.test.tsx src/styles/globals.css`
Expected: PASS。濃度自查：標題列同型×5＝1 處＋嚴重度符號（保守記 1 處）＝2 處。
Commit（-F）：`feat(teacher): analytics sage title bars + severity markers`

---

### Task 5: 班級管理 `/teacher/classes`

**Files:**

- Modify: `src/features/classrooms/pages/teacher-classrooms-page.tsx`
- Modify: `src/features/classrooms/pages/teacher-classrooms-page.test.tsx`
- Modify: `src/styles/globals.css`（教師批節續寫）

**Interfaces:**

- Consumes: `GamePager`／`useStageWide`（`src/components/ui/game-pager.tsx`；溢出才分頁：≤pageSize 時 DOM 與現行等價）。
- Produces: 班級卡清單 `GamePager`（wide 6／narrow 3）；卡片木牌語彙＋加入碼票券（CSS-only）。

- [ ] **Step 1: 失敗測試（7 班觸發分頁）**

```tsx
// teacher-classrooms-page.test.tsx：沿檔內既有 repository stub 造 7 班
it('超過 6 班時顯示分頁器且第一頁只有 6 張卡', async () => {
  renderWithClassrooms(sevenClassrooms); // 沿檔內 stub helper 造 7 筆
  await screen.findByRole('heading', { name: '班級管理' });
  expect(screen.getByRole('button', { name: '下一頁' })).toBeInTheDocument();
  expect(
    screen
      .getAllByRole('heading', { level: 2 })
      .filter((heading) => heading.closest('.classroom-card')),
  ).toHaveLength(6);
});
```

Run → FAIL（無分頁器）。注意 jsdom matchMedia mock 沿分頁批各頁 test 慣例。

- [ ] **Step 2: JSX——GamePager 包裹**

```tsx
import { GamePager, useStageWide } from '../../../components/ui/game-pager';
// component 內：
const wide = useStageWide();
// 清單分支：
<GamePager
  ariaLabel="班級清單分頁"
  items={classrooms.data}
  pageSize={wide ? 6 : 3}
>
  {(pageItems) => (
    <ul aria-label="教師班級列表" className="classroom-list">
      {pageItems.map((classroom) => (
        /* 既有 <li>…</li> 整段原樣搬入，僅 map 來源改 pageItems */
      ))}
    </ul>
  )}
</GamePager>
```

已知取捨（記入 task 報告）：`ClassroomJoinCode` 的 `copied` state 在翻頁重掛時重置——僅影響 2 秒暫態「已複製」字樣，可接受。

- [ ] **Step 3: CSS——木牌卡＋票券（沿貨架配方）**

```css
/* 班級卡＝木牌（貨架配方低配：無像素字體，字級不動）。 */
.classroom-card {
  border: 2px solid var(--pixel-gold-deep);
  border-bottom: 6px solid var(--pixel-gold-deep);
  border-radius: var(--radius-pixel);
  background: var(--pixel-parchment-card);
  box-shadow: 3px 3px 0 var(--pixel-shadow);
}

/* 加入碼＝像素票券（六碼用像素拉丁字型——資料區像素唯一例外）。 */
.classroom-card__code {
  border: 2px dashed var(--pixel-gold-deep);
  border-radius: var(--radius-pixel);
  background: var(--pixel-parchment);
}

.classroom-card__code-value {
  font-family: var(--font-pixel-latin);
  font-size: 0.95rem;
  letter-spacing: 3px;
}
```

（既有 `.classroom-card` 宣告在 globals.css:2692——本批修飾寫在檔尾教師批節覆蓋，原節不動，避免與平行 diff 衝突。）

- [ ] **Step 4: 驗證＋commit**

Run: `npx vitest run src/features/classrooms/pages/teacher-classrooms-page.test.tsx && npx prettier --check src/features/classrooms/pages/teacher-classrooms-page.tsx src/features/classrooms/pages/teacher-classrooms-page.test.tsx src/styles/globals.css`
Expected: PASS（既有測試 fixture ≤6 班→DOM 等價存活；盤點表確認）。
濃度自查：木牌卡(1)＋票券(2)＋GamePager 箭頭（既有元件）＝≤3。
Commit（-F）：`feat(teacher): classroom plank cards + pager + ticket join codes`

---

### Task 6: 班級詳情＋學生進度（標題語彙）

**Files:**

- Modify: `src/features/classrooms/pages/teacher-classroom-detail-page.tsx`
- Modify: `src/features/classrooms/pages/teacher-student-progress-page.tsx`
- Modify: `src/styles/globals.css`（教師批節續寫）

**Interfaces:**

- Consumes: `.sage-page-header`（Task 3）。
- Produces: 兩頁頁首掛 `.sage-page-header`；detail 成員摘要 Chip 徽章化（CSS-only）；member-table 與進度頁內容零改動。

- [ ] **Step 1: JSX——className 增補**

`teacher-classroom-detail-page.tsx`：

```tsx
<header className="teacher-dashboard-header sage-page-header">
```

`teacher-student-progress-page.tsx`：找到頁首 `<header>`（含 `route-panel__eyebrow` 教師班級管理＋h1），加 `sage-page-header`；其餘不動。

- [ ] **Step 2: CSS——detail 摘要徽章**

```css
/* 班級詳情：成員數 Chip＝像素徽章（金框硬影；字串/內距不動）。 */
.classroom-section-header .ui-chip {
  border: 2px solid var(--pixel-gold-deep);
  border-radius: var(--radius-pixel);
  box-shadow: 2px 2px 0 var(--pixel-shadow);
}
```

- [ ] **Step 3: 驗證＋commit**

Run: `npx vitest run src/features/classrooms/pages/teacher-classroom-detail-page.test.tsx src/features/classrooms/pages/teacher-student-progress-page.test.tsx && npx prettier --check src/features/classrooms/pages/teacher-classroom-detail-page.tsx src/features/classrooms/pages/teacher-student-progress-page.tsx src/styles/globals.css`
Expected: PASS（純 className）。濃度：識別牌(1)＋徽章(2)。
Commit（-F）：`feat(teacher): sage headers for classroom detail + student progress`

---

### Task 7: Live 建立 `/teacher/live`（純 CSS 召集令）

**Files:**

- Modify: `src/styles/globals.css`（教師批節續寫；`teacher-live-page.tsx` 零改動）

**Interfaces:**

- Consumes: `.live-launch` 既有結構（globals.css:5336-5438；hero 已是深底）。
- Produces: hero 夜窗化＋欄位標籤石板語彙（沿批⑤a 咒文石板視覺低配）；欄位/流程/字串零變更。

- [ ] **Step 1: CSS**

```css
/* Live 建立＝召集令：hero 夜窗（配方同 .purchase-dialog），表單維持淺底。 */
.live-launch {
  border: 3px solid var(--pixel-window-frame);
  border-radius: var(--radius-pixel);
  outline: 2px solid var(--pixel-night-deep);
  background: var(--pixel-night-deep);
  box-shadow:
    0 0 0 5px var(--pixel-window-frame),
    4px 4px 0 var(--pixel-shadow);
}

.live-launch__hero h1 {
  font-family: var(--font-pixel-tc);
}

.live-launch form {
  border-radius: 0;
}

/* 欄位標籤＝石板刻字（金深字，不動欄位本體）。 */
.live-launch__field label {
  color: var(--pixel-gold-deep);
}
```

- [ ] **Step 2: 驗證＋commit**

Run: `npx vitest run src/features/live/pages/ && npx prettier --check src/styles/globals.css`
Expected: PASS（零 JSX 變更）。對比待驗記錄：`--pixel-gold-deep`(#8a651f) label 在表單 `--surface-card` 淺底上→Task 10 rendered 實測；未達 4.5:1 則改 `--ink-700`。濃度：夜窗(1)＋像素標題(2)。
Commit（-F）：`feat(teacher): live launch summons vocabulary (css-only)`

---

### Task 8: Live 主持過渡卡＋Live 報表

**Files:**

- Modify: `src/features/live/pages/teacher-live-session-page.tsx`（僅錯誤分支 className）
- Modify: `src/features/live/pages/teacher-live-report-page.tsx`
- Modify: `src/features/live/pages/teacher-live-report-page.test.tsx`（獎牌 aria-hidden 斷言）
- Modify: `src/styles/globals.css`（教師批節續寫）

**Interfaces:**

- Consumes: `.sage-page-header`（Task 3）；`--rank-gold-row`／`--rank-silver-row`／`--rank-bronze-row`（tokens 既有）。
- Produces: 過渡卡 `.route-panel--overture`；報表最終排名前三名獎牌符號 `★`（`aria-hidden`，既有文字節點逐字不動）。**LivePresenter 零接觸。**

- [ ] **Step 1: 失敗測試（獎牌不進可及名稱）**

```tsx
// teacher-live-report-page.test.tsx：沿檔內既有報表 render 情境
it('最終排名前三名有裝飾獎牌且不影響文字內容', async () => {
  renderReportWithRanking(); // 沿檔內既有 fixture helper 名稱
  const medals = document.querySelectorAll('.live-report__medal');
  expect(medals).toHaveLength(3);
  for (const medal of medals) {
    expect(medal).toHaveAttribute('aria-hidden', 'true');
  }
});
```

Run → FAIL。

- [ ] **Step 2: JSX**

`teacher-live-session-page.tsx` 錯誤分支：

```tsx
<section className="route-panel route-panel--overture">
```

`teacher-live-report-page.tsx`：header 加 `sage-page-header`；最終排名 li：

```tsx
{
  report.ranking.map((entry) => (
    <li key={entry.rank}>
      {entry.rank <= 3 ? (
        <span
          aria-hidden="true"
          className={`live-report__medal live-report__medal--${
            ['gold', 'silver', 'bronze'][entry.rank - 1] ?? 'bronze'
          }`}
        >
          ★
        </span>
      ) : null}
      第 {entry.rank} 名 {entry.displayName}（{entry.score} 分
      {entry.teamNumber === null ? '' : `・第 ${String(entry.teamNumber)} 隊`}）
    </li>
  ));
}
```

（既有文字模板逐字保留；獎牌是前置兄弟節點。）

- [ ] **Step 3: CSS**

```css
/* 主持過渡卡＝開幕（夜窗低配；只在錯誤/取消過渡出現，投影零接觸）。 */
.route-panel--overture {
  border: 3px solid var(--pixel-window-frame);
  border-radius: var(--radius-pixel);
  background: var(--pixel-night);
  box-shadow:
    0 0 0 5px var(--pixel-window-frame),
    4px 4px 0 var(--pixel-shadow);
  color: var(--pixel-window-ink);
}

.route-panel--overture h1 {
  color: var(--pixel-window-ink);
  font-family: var(--font-pixel-tc);
}

/* 報表獎牌（沿排行榜金銀銅列色）。 */
.live-report__medal {
  display: inline-grid;
  width: 22px;
  height: 22px;
  border: 2px solid var(--pixel-gold-deep);
  border-radius: var(--radius-pixel);
  margin-right: 6px;
  color: var(--ink-900);
  font-size: 12px;
  place-items: center;
}

.live-report__medal--gold {
  background: var(--rank-gold-row);
}

.live-report__medal--silver {
  background: var(--rank-silver-row);
}

.live-report__medal--bronze {
  background: var(--rank-bronze-row);
}
```

- [ ] **Step 4: 驗證＋commit**

Run: `npx vitest run src/features/live/pages/ && npx prettier --check src/features/live/pages/teacher-live-session-page.tsx src/features/live/pages/teacher-live-report-page.tsx src/features/live/pages/teacher-live-report-page.test.tsx src/styles/globals.css`
Expected: PASS（live-advanced 的 `場次報表` heading 斷言為既知紅環境、字串未動）。
Commit（-F）：`feat(teacher): live overture transition card + report medals`

---

### Task 9: 紅 spec sizing 盤點（唯讀＋報告）

**Files:**

- Create: `docs/superpowers/plans/2026-08-02-red-spec-sizing.md`

**Interfaces:**

- Produces: owner 決策文件：每 spec 一節 `斷差清單（spec 期待 vs 現行 UI，含檔:行）｜重寫工作量估算（S/M/L＋預估 task 數）｜可否分段（獨立可交付切點）｜建議`。**本批不重寫任何紅 spec。**

- [ ] **Step 1: 逐檔閱讀（唯讀）**

```bash
wc -l tests/e2e/assignments-live.spec.ts tests/e2e/live-advanced.spec.ts tests/e2e/learning-experience.spec.ts tests/e2e/assignments-live-expected-failures.ts
grep -n "acceptance\|throw\|expectedFailure" tests/e2e/assignments-live.spec.ts tests/e2e/live-advanced.spec.ts tests/e2e/learning-experience.spec.ts | head -30
```

再逐檔 Read 全文，對照現行 Live session 互動模型（`src/features/live/lib/live-phase-view.ts` 的 `hostConsoleView`、LivePresenter 進場即投影）與學習流（learning-experience 的 student.one 基線位移：錯題 33 開→約 25 開/8 解＋補救 XP）。

- [ ] **Step 2: 寫報告**

必答：(a) 各 spec 與 0730「主控台移除、進場即投影」與 0726 一鍵式建立的斷差各幾處；(b) learning-experience 是「簽名比對修基線」級或「重寫互動」級；(c) 若重寫，能否照「session 模型先、斷言後」分兩段。**不改任何 spec 檔。**

- [ ] **Step 3: prettier＋commit**

```bash
npx prettier --check docs/superpowers/plans/2026-08-02-red-spec-sizing.md
git add docs/superpowers/plans/2026-08-02-red-spec-sizing.md
git commit -F "$SCRATCH/commit-msg-t9.txt"
# 訊息："docs(teacher): red-spec rewrite sizing report"
```

---

### Task 10: Gate 全電池＋量測＋ledger 收批

**Files:**

- Modify: `.superpowers/sdd/progress.md`（收批節）
- 拋棄式量測腳本：session scratchpad（不入 repo）

**Interfaces:**

- Consumes: 全部前置 Task 的 commit；`TEST_USERS`（`tests/fixtures/users.ts`）教師帳號。
- Produces: gate 結論（PASS/FAIL＋證據數字）寫入 ledger；44px／對比實測表。

- [ ] **Step 1: 單元全套**

Run: `npx vitest run`
Expected: 全綠（±0 於 base 既知狀態）。

- [ ] **Step 2: e2e 教師子集**

```bash
npx playwright test tests/e2e/teacher-content.spec.ts tests/e2e/classroom-leaderboard.spec.ts tests/e2e/live-smoke.spec.ts tests/e2e/app-shell.visual.spec.ts tests/e2e/accessibility.spec.ts tests/e2e/chapter-select.spec.ts
```

Expected: 綠（chapter-select 分頁批已復活；app-shell.visual 若 Task 1 盤點判定含教師頁快照→顯式重拍並在 commit 訊息記明；其餘既知紅不在子集內）。

- [ ] **Step 3: 真跑三情境量測（拋棄式 Playwright 腳本，教師帳號）**

情境：①工作區→分析→班級管理→詳情（對比取樣：夜窗 title/description、sage 標題列字、指令鈕字、票券碼、嚴重度符號、Live 建立石板 label；44px：指令鈕、GamePager 箭頭、複製鈕、MENU）②Live 建立→開場→LivePresenter 控制列 `footer.live-presenter__controls button` 逐鈕 `boundingBox()` 高寬 ≥44 記錄（**量測不改樣式**）→取消場次 ③1024/1440 兩寬度 `document.documentElement.scrollWidth` ≤ viewport＋`.ui-table` 首欄可讀寬與 base 相同。console 全程 0 error。對比以 rendered getComputedStyle 色值計算（沿前批 gate 腳本法）。
Expected: 全項 ≥4.5:1、≥44px；任何未達→回修（CSS 加深/加大）再跑，不得記「預期內失敗」。

- [ ] **Step 4: ledger 收批＋commit**

`.superpowers/sdd/progress.md` 於 `## Teacher Workspace Batch (2026-08-02)` 節補收批小節：全部 commit hash、gate 數字、debt 移交（sizing 報告結論、toast 錨定另議、skip-link 卷動邊界低影響未做）。

```bash
git add -f .superpowers/sdd/progress.md
git commit -F "$SCRATCH/commit-msg-t10.txt"
# 訊息："docs(sdd): close teacher workspace batch with gate results"
```

---

## Self-Review 紀錄

- Spec §2 八頁逐一對應：dashboard=T3、analytics=T4、classes=T5、detail+progress=T6、live 建立=T7、live 主持+報表=T8；§3 HUD debt=T2；§4 sizing=T9；§5 gate=T10；盤點先行=T1。✔
- 載重字串零變動：所有 JSX 變更僅 className/裝飾節點；獎牌/嚴重度為 aria-hidden 兄弟節點。✔
- 命名一致：`.sage-page-header`／`.sage-title-bar`／`.pixel-command` 於 T3 定義、T4/T6/T8 消費；GamePager 介面沿現檔簽名。✔
