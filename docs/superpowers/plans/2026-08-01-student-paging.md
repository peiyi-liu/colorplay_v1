# 學生端分頁批（Student Paging）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 學生端五頁（大廳/任務選擇＋地城樓層/商店/錯題/成就）長清單改 GamePager 水平分頁，減少整頁上下卷動（owner 0801 21:59＋22:21 核准）。

**Architecture:** 新共用元件 `GamePager<T>`（溢出才分頁：資料量 ≤ 單頁容量時 DOM 與現行等價、零 chrome）＋`useStageWide()` 寬度檔位 hook（與舞台 768 分界對齊）。各頁把既有 `.map(...)` 清單包進 GamePager 的 render-prop，容器/字串/資料流零變更。

**Tech Stack:** React 19、CSS（globals.css）、Vitest + Testing Library、Playwright。無新依賴。

**Spec:** `docs/superpowers/specs/2026-08-01-student-paging-design.md`（owner 2026-08-01 22:21 核准）

## Global Constraints

- **行為零變更**：路由、API、RPC、計分、資料排序（shop 的 costTokens 排序等）不動；分頁純前端 state，不進 URL/storage。
- **載重字串一字不改**：各頁全部既有字串。新增分頁文案逐字：箭頭 aria-label `上一頁`／`下一頁`、頁碼 `第 {n} / {N} 頁`。
- **溢出才分頁鐵律**：`items.length <= pageSize` 時 GamePager 只渲染 `children(items)`（render-prop 輸出原容器，零 chrome）→ e2e 種子資料量內斷言自然存活。超量頁面的載重斷言依 Task 1 盤點顯式同步，不得靜默弄紅。
- 44px 觸控（箭頭鈕）；對比 ≥4.5:1 rendered 實測；禁 transform:scale()；換頁動畫只動 transform/opacity 且 `prefers-reduced-motion`＋`[data-reduced-motion='true']` 雙通道瞬切。
- **commit 隔離**：平行 session 檔絕不入 commit（`.gitignore`、`docs/content/*`、`package.json`、`scripts/content/import-fixes.json`、`src/features/auth/pages/login-page.tsx`、`supabase/seeds/content-*.sql`、untracked `.agents/`、`.claude/`、`artifacts/`、`live/`、`skills-lock.json`、`tests/contracts/fetch-sheet*`）。seeds 檔可**唯讀**查數量。
- 每 commit 前 `npx prettier --check` 動過的檔；ledger `git add -f .superpowers/sdd/progress.md`（新節 `## Student Paging Batch (2026-08-01)`）；`eslint.config.js`/`package.json` 不可改；commit 訊息結尾 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`；勿推 main、勿部署。
- 既知紅不碰：assignments-live／live-advanced／session-lifecycle／shared-device（/app/profile 既存因）／learning-experience 等環境紅——但其**字串仍載重**。

## File Structure

| 檔案                                                            | 動作 | 職責                                    |
| --------------------------------------------------------------- | ---- | --------------------------------------- |
| `src/components/ui/game-pager.tsx`                              | 新增 | `GamePager<T>` 分頁器＋`useStageWide()` |
| `src/components/ui/game-pager.test.tsx`                         | 新增 | 分頁器單元測試                          |
| `src/styles/globals.css`                                        | 修改 | `.game-pager*` CSS＋大廳摘要壓縮        |
| `src/features/learning/pages/lobby-page.tsx`                    | 修改 | 章節卡分頁（保留全域 index 語意）       |
| `src/features/learning/pages/mission-page.tsx:83-143`           | 修改 | MissionSelectPage 清單分頁              |
| `src/features/learning/pages/chapter-detail-page.tsx:332-…`     | 修改 | 每 section 樓層卡分頁                   |
| `src/features/inventory/pages/shop-page.tsx`                    | 修改 | 角色/外框兩籤貨架分頁                   |
| `src/features/learning/pages/mistakes-page.tsx`                 | 修改 | 組內錯題＋已解決清單分頁                |
| `src/features/achievements/pages/achievements-page.tsx`         | 修改 | 徽章牆分頁                              |
| 各頁 `.test.tsx`                                                | 同步 | 溢出情境新測試＋既有斷言確認存活        |
| `docs/superpowers/plans/2026-08-01-student-paging-inventory.md` | 新增 | Task 1 盤點（斷言×種子量×容量表）       |

**每頁容量（`useStageWide()`：wide=`(min-width: 768px)`）**

| 頁                     | items             | wide | narrow |
| ---------------------- | ----------------- | ---- | ------ |
| 大廳章節卡             | chapterList       | 3    | 2      |
| 任務選擇清單           | playable          | 2    | 1      |
| 地城樓層（每 section） | section.subtopics | 4    | 2      |
| 商店角色/外框          | items（排序後）   | 8    | 4      |
| 錯題組內               | group.mistakes    | 5    | 3      |
| 錯題已解決             | resolved          | 6    | 4      |
| 成就徽章               | catalog.items     | 8    | 4      |

---

### Task 1: 分頁依賴盤點（唯讀＋文件）

**Files:**

- Create: `docs/superpowers/plans/2026-08-01-student-paging-inventory.md`

**Interfaces:**

- Produces: 每列 `spec 檔:行號｜斷言目標｜所在頁面 items 種子數 vs 容量｜處置（單頁內存活／Task N 顯式同步-先點「下一頁」／不碰-既知紅）`。

- [ ] **Step 1: 盤點 grep（唯讀）**

```bash
cd /Users/guanyucheng/Desktop/pei-game/colorplay
# 五頁的 e2e 斷言
grep -rn "章節\|學習大廳\|色彩任務選擇" tests/e2e --include="*.spec.ts" | head -30
grep -rn "招財貓\|Token 可用\|購買 \|選用\|已裝備\|外框" tests/e2e --include="*.spec.ts"
grep -rn "再挑戰\|補救\|待補救\|已解決\|正確答案" tests/e2e --include="*.spec.ts"
grep -rn "不屈不撓\|成就\|徽章" tests/e2e --include="*.spec.ts"
grep -rn "展開小節任務\|課後任務實戰\|精熟" tests/e2e --include="*.spec.ts"
# 單元測試同查（五頁 .test.tsx 的清單斷言）
grep -n "getAllBy\|toHaveLength\|length" src/features/learning/pages/lobby-page.test.tsx src/features/learning/pages/mission-page.test.tsx src/features/learning/pages/mistakes-page.test.tsx src/features/learning/pages/chapter-detail-page.test.tsx src/features/inventory/pages/*.test.tsx src/features/achievements/pages/achievements-page.test.tsx 2>/dev/null | head -40
# 種子數量（唯讀，平行 session 檔勿改）：逐檔閱讀計數——章節數、blook 數、frame 數、成就數、學生一號錯題數
ls supabase/seeds/
# e2e 預設 viewport（判定 wide/narrow 檔位）
grep -n "viewport" playwright.config.* | head -5
```

- [ ] **Step 2: 寫盤點文件（含結論表）**

必答問題（每頁一列）：「e2e/單元測試在測試資料量下會不會觸發分頁？」若會→列出需同步的斷言與同步法（斷言前插 `await page.getByRole('button', { name: '下一頁' }).click()` 至目標頁；單元測試同理 `userEvent.click(screen.getByRole('button', { name: '下一頁' }))`）。另記載：spec §2 商店列「已購區收第二籤」與現實不符——商店已有角色/外框籤且無獨立已購區，本批＝兩籤內貨架分頁（現實對齊，非漏做）。

- [ ] **Step 3: prettier＋commit**

```bash
npx prettier --check docs/superpowers/plans/2026-08-01-student-paging-inventory.md docs/superpowers/plans/2026-08-01-student-paging.md docs/superpowers/specs/2026-08-01-student-paging-design.md
git add docs/superpowers/plans/2026-08-01-student-paging-inventory.md docs/superpowers/plans/2026-08-01-student-paging.md docs/superpowers/specs/2026-08-01-student-paging-design.md
git add -f .superpowers/sdd/progress.md
git commit -m "docs(paging): student paging plan, approved spec, dependency inventory

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: GamePager＋useStageWide（TDD）

**Files:**

- Create: `src/components/ui/game-pager.tsx`
- Create: `src/components/ui/game-pager.test.tsx`
- Modify: `src/styles/globals.css`（`.game-pager*` CSS，`.rotate-banner` 塊之後）

**Interfaces:**

- Produces:

```tsx
export function useStageWide(): boolean; // matchMedia('(min-width: 768px)')，監聽變化
export function GamePager<T>(
  props: Readonly<{
    ariaLabel: string; // 分頁器 group 名（各頁自訂，如「章節分頁」）
    children: (pageItems: readonly T[]) => ReactNode; // 呼叫端渲染自己的 ul/div 容器
    items: readonly T[];
    pageSize: number;
  }>,
): ReactElement;
```

- 行為：`items.length <= pageSize` → 僅 `children(items)`（零 chrome）；否則 `children(切片)`＋導覽列（`上一頁`/`下一頁` 44px 鈕、`第 n / N 頁` aria-live="polite"、●○ 點列 aria-hidden）；items 縮短時頁碼自動 clamp；容器 keydown ←/→ 換頁；換頁動畫=`.game-pager__page` key 重掛 fade-slide（雙通道瞬切）。

- [ ] **Step 1: 失敗測試**

`src/components/ui/game-pager.test.tsx`：

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { GamePager } from './game-pager';

const renderPager = (count: number, pageSize: number) =>
  render(
    <GamePager
      ariaLabel="測試分頁"
      items={Array.from({ length: count }, (_, i) => `項目${String(i + 1)}`)}
      pageSize={pageSize}
    >
      {(pageItems) => (
        <ul aria-label="測試清單">
          {pageItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </GamePager>,
  );

describe('GamePager', () => {
  it('未溢出時不渲染任何分頁 chrome', () => {
    renderPager(3, 4);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.queryByRole('button', { name: '下一頁' })).toBeNull();
    expect(screen.queryByText(/第 \d+ \/ \d+ 頁/u)).toBeNull();
  });

  it('溢出時切片並顯示頁碼與箭頭', () => {
    renderPager(7, 3);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText('第 1 / 3 頁')).toBeVisible();
    expect(screen.getByRole('button', { name: '上一頁' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '下一頁' })).toBeEnabled();
  });

  it('下一頁/上一頁換頁且尾頁箭頭停用', async () => {
    renderPager(7, 3);
    const next = screen.getByRole('button', { name: '下一頁' });
    await userEvent.click(next);
    expect(screen.getByText('項目4')).toBeVisible();
    await userEvent.click(next);
    expect(screen.getByText('第 3 / 3 頁')).toBeVisible();
    expect(screen.getByText('項目7')).toBeVisible();
    expect(next).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: '上一頁' }));
    expect(screen.getByText('第 2 / 3 頁')).toBeVisible();
  });

  it('鍵盤 ←/→ 於分頁器內換頁', async () => {
    renderPager(7, 3);
    screen.getByRole('button', { name: '下一頁' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByText('第 2 / 3 頁')).toBeVisible();
    await userEvent.keyboard('{ArrowLeft}');
    expect(screen.getByText('第 1 / 3 頁')).toBeVisible();
  });

  it('items 縮短時頁碼 clamp 不越界', async () => {
    const { rerender } = renderPager(7, 3);
    await userEvent.click(screen.getByRole('button', { name: '下一頁' }));
    await userEvent.click(screen.getByRole('button', { name: '下一頁' }));
    rerender(
      <GamePager
        ariaLabel="測試分頁"
        items={['項目1', '項目2', '項目3', '項目4']}
        pageSize={3}
      >
        {(pageItems) => (
          <ul aria-label="測試清單">
            {pageItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
      </GamePager>,
    );
    expect(screen.getByText('第 2 / 2 頁')).toBeVisible();
    expect(screen.getByText('項目4')).toBeVisible();
  });
});
```

（`useStageWide` 的 matchMedia 已有全域 stub（src/test/setup.ts，matches:false）；hook 不另立測試，整合行為在各頁任務驗。）

- [ ] **Step 2: 跑測試確認紅**

```bash
pnpm exec vitest run src/components/ui/game-pager.test.tsx
```

Expected: FAIL（模組不存在）

- [ ] **Step 3: 實作 game-pager.tsx**

```tsx
import { useEffect, useState, type ReactElement, type ReactNode } from 'react';

const WIDE_QUERY = '(min-width: 768px)';

// 舞台寬度檔位（分頁批 spec §1）：與 GameStage 768 分界對齊。
export function useStageWide(): boolean {
  const [wide, setWide] = useState(() => window.matchMedia(WIDE_QUERY).matches);

  useEffect(() => {
    const media = window.matchMedia(WIDE_QUERY);
    const onChange = (event: MediaQueryListEvent) => {
      setWide(event.matches);
    };
    media.addEventListener('change', onChange);
    return () => {
      media.removeEventListener('change', onChange);
    };
  }, []);

  return wide;
}

// 像素風水平分頁器（spec §1）：溢出才分頁；未溢出時 DOM 與現行等價。
export function GamePager<T>({
  ariaLabel,
  children,
  items,
  pageSize,
}: Readonly<{
  ariaLabel: string;
  children: (pageItems: readonly T[]) => ReactNode;
  items: readonly T[];
  pageSize: number;
}>): ReactElement {
  const [rawPage, setRawPage] = useState(0);
  const safeSize = Math.max(1, pageSize);
  const pageCount = Math.max(1, Math.ceil(items.length / safeSize));
  const page = Math.min(rawPage, pageCount - 1);

  if (items.length <= safeSize) {
    return <>{children(items)}</>;
  }

  const pageItems = items.slice(page * safeSize, (page + 1) * safeSize);

  return (
    <div
      aria-label={ariaLabel}
      className="game-pager"
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft' && page > 0) {
          setRawPage(page - 1);
        }
        if (event.key === 'ArrowRight' && page < pageCount - 1) {
          setRawPage(page + 1);
        }
      }}
      role="group"
    >
      <div className="game-pager__page" key={page}>
        {children(pageItems)}
      </div>
      <div className="game-pager__nav">
        <button
          aria-label="上一頁"
          className="game-pager__arrow"
          disabled={page === 0}
          onClick={() => {
            setRawPage(page - 1);
          }}
          type="button"
        >
          ◀
        </button>
        <span aria-live="polite" className="game-pager__status">
          第 {page + 1} / {pageCount} 頁
        </span>
        <span aria-hidden="true" className="game-pager__dots">
          {Array.from({ length: pageCount }, (_, index) => (
            <span
              className={`game-pager__dot${index === page ? ' game-pager__dot--on' : ''}`}
              key={index}
            />
          ))}
        </span>
        <button
          aria-label="下一頁"
          className="game-pager__arrow"
          disabled={page === pageCount - 1}
          onClick={() => {
            setRawPage(page + 1);
          }}
          type="button"
        >
          ▶
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: CSS（globals.css，`.rotate-banner__close` 塊後）**

```css
/* ── GamePager 像素分頁器（分頁批 spec §1）：溢出才出現。────────── */
.game-pager__nav {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  margin-top: var(--space-2);
}

.game-pager__arrow {
  display: inline-flex;
  min-width: 44px;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--pixel-night);
  border-radius: var(--radius-pixel);
  background: var(--pixel-parchment-card);
  box-shadow: 2px 2px 0 var(--pixel-shadow);
  color: var(--pixel-night);
  font-size: 14px;
}

.game-pager__arrow:disabled {
  opacity: 0.45;
  box-shadow: none;
}

.game-pager__status {
  color: inherit;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  font-weight: 800;
}

.game-pager__dots {
  display: inline-flex;
  gap: 6px;
}

.game-pager__dot {
  width: 8px;
  height: 8px;
  border: 2px solid var(--pixel-night);
  border-radius: var(--radius-pixel);
  background: transparent;
}

.game-pager__dot--on {
  background: var(--pixel-night);
}

/* 換頁動畫：只動 transform/opacity；雙通道瞬切。 */
.game-pager__page {
  animation: game-pager-page-in 160ms ease-out;
}

@keyframes game-pager-page-in {
  from {
    opacity: 0;
    transform: translateX(12px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .game-pager__page {
    animation: none;
  }
}

[data-reduced-motion='true'] .game-pager__page {
  animation: none;
}
```

- [ ] **Step 5: 跑測試綠＋prettier**

```bash
pnpm exec vitest run src/components/ui/game-pager.test.tsx
npx prettier --check src/components/ui/game-pager.tsx src/components/ui/game-pager.test.tsx src/styles/globals.css
```

Expected: 5/5 PASS；prettier clean

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/game-pager.tsx src/components/ui/game-pager.test.tsx src/styles/globals.css
git add -f .superpowers/sdd/progress.md
git commit -m "feat(paging): GamePager pixel pager with overflow-only chrome

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: 學習大廳章節卡分頁＋摘要壓縮

**Files:**

- Modify: `src/features/learning/pages/lobby-page.tsx:68-102`
- Modify: `src/features/learning/pages/lobby-page.test.tsx`（溢出測試）
- Modify: `src/styles/globals.css`（大廳摘要壓縮）

**Interfaces:**

- Consumes: `GamePager`、`useStageWide`（Task 2 簽名）。
- **關鍵**：現行 map 以**全域 index** 決定 icon（`CHAPTER_ICONS[index % …]`）、theme（`pastelThemeForIndex(index)`）與 `frontierIndex` 比對——分頁切片前先把 index 綁進 entries，切片後語意不變。

- [ ] **Step 1: 失敗測試**

lobby-page.test.tsx 新增（**先讀該檔既有 mock 慣例**，用同一 mock 工廠餵 7 筆 isPlayable 章節；render 樣板照檔內既有測試）：

```tsx
it('章節超過單頁容量時分頁且跨頁章節仍照全域序渲染', async () => {
  // 沿用本檔既有 usePublishedChapters mock，餵 7 筆章節（title: 章節一…章節七）
  // 全域 matchMedia stub matches:false → narrow 容量 2 → 4 頁
  expect(screen.getByText('第 1 / 4 頁')).toBeVisible();
  expect(screen.queryByText('章節三')).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: '下一頁' }));
  expect(screen.getByText('章節三')).toBeVisible();
});
```

- [ ] **Step 2: 跑測試紅**

```bash
pnpm exec vitest run src/features/learning/pages/lobby-page.test.tsx
```

Expected: 新測試 FAIL（無分頁）

- [ ] **Step 3: 實作**

lobby-page.tsx：

```tsx
import { GamePager, useStageWide } from '../../../components/ui/game-pager';
…
export function LobbyPage() {
  const chapters = usePublishedChapters();
  const stageWide = useStageWide();
  …
  const chapterList = chapters.data ?? [];
  const chapterEntries = chapterList.map((chapter, index) => ({
    chapter,
    index,
  }));
  // frontierIndex 計算原樣不動
  …
        {chapterList.length === 0 ? (
          <p className="lobby__empty">課程內容準備中，請稍後再回來看看。</p>
        ) : (
          <GamePager
            ariaLabel="章節分頁"
            items={chapterEntries}
            pageSize={stageWide ? 3 : 2}
          >
            {(pageEntries) => (
              <div className="pastel-grid">
                {pageEntries.map(({ chapter, index }) => {
                  const current = index === frontierIndex;
                  return (
                    /* 原 <LearningChapterCard …/> 一字不改，僅 index 來源改 entries */
                  );
                })}
              </div>
            )}
          </GamePager>
        )}
```

- [ ] **Step 4: 大廳摘要壓縮 CSS（目標：wide 檔常見高度下整頁無縱向卷動）**

globals.css `.lobby` 區附近新增（不動 StudentSummaryCard 元件本體）：

```css
/* 分頁批：大廳走「單屏」——章節格 wide 檔固定三欄單列。 */
@media (min-width: 768px) and (orientation: landscape) {
  .lobby .pastel-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
```

實測後若 812×375 仍溢出：允許 scene 內短卷動（spec §3「目標非鐵律」），記錄量測數字即可，不硬壓內容。**大廳壓縮後截圖列入證據供 owner 過目（spec §4 風險列）。**

- [ ] **Step 5: 跑測試綠**

```bash
pnpm exec vitest run src/features/learning/pages/lobby-page.test.tsx src/components/ui/game-pager.test.tsx
```

Expected: PASS

- [ ] **Step 6: 真跑量測**

1440×900：章節 ≤3 時無分頁 chrome（DOM 對照）；超量資料（本機 mock 或種子）箭頭換頁、座標點擊、鍵盤 ←/→；整頁縱向卷動量測（scrollHeight vs clientHeight）記錄。812×375＋375×812 同測。對比：箭頭鈕/頁碼/點列 rendered ≥4.5:1。console 0。證據 `artifacts/design-audit/student-paging/task3/`（不 commit）。

- [ ] **Step 7: Commit**

```bash
npx prettier --check src/features/learning/pages/lobby-page.tsx src/features/learning/pages/lobby-page.test.tsx src/styles/globals.css
git add src/features/learning/pages/lobby-page.tsx src/features/learning/pages/lobby-page.test.tsx src/styles/globals.css
git add -f .superpowers/sdd/progress.md
git commit -m "feat(paging): lobby chapter cards page horizontally

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: 任務選擇＋地城樓層分頁

**Files:**

- Modify: `src/features/learning/pages/mission-page.tsx:83-143`（MissionSelectPage）
- Modify: `src/features/learning/pages/chapter-detail-page.tsx:332-…`（每 section 的 subtopics map）
- Modify: `src/features/learning/pages/mission-page.test.tsx`、`src/features/learning/pages/chapter-detail-page.test.tsx`（溢出測試各一，寫法同 Task 3 Step 1 模式：沿用各檔既有 mock 餵超量資料→斷言頁碼＋跨頁項目可見性）

**Interfaces:**

- Consumes: `GamePager`、`useStageWide`。
- MissionSelect 的 map 只用 `chapter`（statusOf 以 id 查），無 index 依賴→直接分頁 `playable`；`heroChapterId` 計算不動（在分頁前以全量算）。
- chapter-detail：`section.subtopics.map(...)` 包進 per-section GamePager（`ariaLabel` 用 `` `${section.title} 樓層分頁` ``）；subtopic 渲染內容一字不改；**實作前先讀 :332-400 確認容器結構**（map 產出 sibling 序列則 children 用 fragment 包）。

- [ ] **Step 1: 失敗測試 ×2**（mock 超量：MissionSelect 5 章 playable（narrow 1/頁→5 頁）；chapter-detail 單 section 6 樓層（narrow 2/頁→3 頁））
- [ ] **Step 2: 跑紅**

```bash
pnpm exec vitest run src/features/learning/pages/mission-page.test.tsx src/features/learning/pages/chapter-detail-page.test.tsx
```

- [ ] **Step 3: 實作**

MissionSelectPage（`const stageWide = useStageWide();` 加在 hooks 區）：

```tsx
<GamePager
  ariaLabel="任務章節分頁"
  items={playable}
  pageSize={stageWide ? 2 : 1}
>
  {(pageChapters) => (
    <ul className="mission-select__list">
      {pageChapters.map((chapter) => {
        /* 原 li 內容一字不改 */
      })}
    </ul>
  )}
</GamePager>
```

chapter-detail（每 section 內）：

```tsx
<GamePager
  ariaLabel={`${section.title} 樓層分頁`}
  items={section.subtopics}
  pageSize={stageWide ? 4 : 2}
>
  {(pageSubtopics) => (
    <>
      {pageSubtopics.map((subtopic) => {
        /* 原樓層卡渲染一字不改 */
      })}
    </>
  )}
</GamePager>
```

- [ ] **Step 4: 跑綠＋真跑量測**（同 Task 3 模式：/app/missions 與 /app/chapters/:id 三情境、換頁座標點擊、卷動量測、console 0；證據 task4/）
- [ ] **Step 5: Commit**

```bash
npx prettier --check src/features/learning/pages/mission-page.tsx src/features/learning/pages/chapter-detail-page.tsx src/features/learning/pages/mission-page.test.tsx src/features/learning/pages/chapter-detail-page.test.tsx
git add src/features/learning/pages/mission-page.tsx src/features/learning/pages/chapter-detail-page.tsx src/features/learning/pages/mission-page.test.tsx src/features/learning/pages/chapter-detail-page.test.tsx
git add -f .superpowers/sdd/progress.md
git commit -m "feat(paging): mission select and dungeon floors page horizontally

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: 裝備商店貨架分頁

**Files:**

- Modify: `src/features/inventory/pages/shop-page.tsx`（blooks 籤 :258-312 與 FrameShopSection :66-118 兩處 `.blook-grid` map）
- Modify: shop 相關 `.test.tsx`（溢出測試；既有購買流程測試斷言存活確認——先 `ls src/features/inventory` 找實際測試檔名）

**Interfaces:**

- Consumes: `GamePager`、`useStageWide`。兩處 map 均只用 `item`，無 index 依賴。排序（costTokens）在分頁前、一字不改。
- 容量 wide 8 / narrow 4。**Task 1 盤點若判定 e2e 種子（如 game-economy 的招財貓）落在第 2 頁→該 e2e 斷言前插「下一頁」點擊並列入盤點文件；若在第 1 頁則零同步。**購買 dialog／toast 流程不動。

- [ ] **Step 1-2: 失敗測試（沿用檔內 mock 餵 9 件 blook→wide？注意全域 stub matches:false=narrow 4/頁→3 頁）→跑紅**
- [ ] **Step 3: 實作**（`ShopPage` 與 `FrameShopSection` 各自 `const stageWide = useStageWide();`＋包 GamePager，`ariaLabel` 分別 `角色貨架分頁`／`外框貨架分頁`；children 內原 `<div className="blook-grid">…</div>` 一字不改）
- [ ] **Step 4: 跑綠＋targeted e2e**

```bash
pnpm exec vitest run src/features/inventory
pnpm exec playwright test tests/e2e/game-economy.spec.ts --project=chromium
```

Expected: vitest PASS；game-economy 若為既知環境紅→失敗簽名須與 base 相同（盤點記錄），不得出現「找不到招財貓」類**新**失敗。

- [ ] **Step 5: 真跑量測**（/app/shop 兩籤換頁、購買 dialog 開關不受分頁影響、三情境、console 0；證據 task5/）
- [ ] **Step 6: Commit**

```bash
npx prettier --check src/features/inventory/pages/shop-page.tsx（＋動過的 test 檔）
git add src/features/inventory/pages/shop-page.tsx（＋動過的 test 檔）
git add -f .superpowers/sdd/progress.md
git commit -m "feat(paging): shop racks page horizontally per tab

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: 錯題組內分頁＋已解決分頁

**Files:**

- Modify: `src/features/learning/pages/mistakes-page.tsx:93-108`（組內 mistake-list）＋`:146-161`（resolved list）
- Modify: `src/features/learning/pages/mistakes-page.test.tsx`（溢出測試）

**Interfaces:**

- Consumes: `GamePager`、`useStageWide`。組結構（section/h2/badge/actions）不動；只分頁 `group.mistakes`（wide 5 / narrow 3）與 `resolved`（wide 6 / narrow 4）。`groupOpenMistakes` 函式不動。
- 「N 題待補救」badge 顯示**總數**（`group.mistakes.length`）——badge 在 GamePager 外天然如此，計畫聲明防誤改。「再挑戰（補救練習）」鈕在組層、不隨頁藏。

- [ ] **Step 1-2: 失敗測試（mock 一組 7 題→narrow 3/頁 3 頁；resolved 9 題→narrow 4/頁 3 頁）→跑紅**
- [ ] **Step 3: 實作**（兩處包法同前：children 內原 `<ul className="mistake-list">…` 與 `<ul className="mistake-resolved__list">…` 一字不改；`ariaLabel` 分別 `` `${group.subtopicTitle} 錯題分頁` `` 與 `已解決錯題分頁`）
- [ ] **Step 4: 跑綠＋真跑量測**（/app/mistakes 有錯題資料的帳號三情境；badge 總數不變；console 0；證據 task6/）
- [ ] **Step 5: Commit**

```bash
npx prettier --check src/features/learning/pages/mistakes-page.tsx src/features/learning/pages/mistakes-page.test.tsx
git add src/features/learning/pages/mistakes-page.tsx src/features/learning/pages/mistakes-page.test.tsx
git add -f .superpowers/sdd/progress.md
git commit -m "feat(paging): mistake codex pages within groups

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: 成就徽章牆分頁

**Files:**

- Modify: `src/features/achievements/pages/achievements-page.tsx:50-54`
- Modify: `src/features/achievements/pages/achievements-page.test.tsx`（溢出測試＋既有斷言存活）

**Interfaces:**

- Consumes: `GamePager`、`useStageWide`。map 只用 `item`；容量 wide 8 / narrow 4。
- `<ul aria-label="成就徽章列表" className="pastel-grid achievements-grid">` 容器保留在 children 內一字不改。
- **盤點警示**：achievements.spec.ts 釘 `不屈不撓`（既知環境紅）——若成就種子 >8，處置依 Task 1 盤點（環境紅不碰，但失敗簽名不得因分頁改變；種子 ≤8 零影響）。

- [ ] **Step 1-2: 失敗測試（mock 10 枚→narrow 4/頁 3 頁）→跑紅**
- [ ] **Step 3: 實作**（包法同前，`ariaLabel="成就徽章分頁"`，`const stageWide = useStageWide();`）
- [ ] **Step 4: 跑綠＋真跑量測**（/app/achievements 三情境；reduced-motion 兩通道下換頁瞬切（重掛動畫關閉）；console 0；證據 task7/）
- [ ] **Step 5: Commit**

```bash
npx prettier --check src/features/achievements/pages/achievements-page.tsx src/features/achievements/pages/achievements-page.test.tsx
git add src/features/achievements/pages/achievements-page.tsx src/features/achievements/pages/achievements-page.test.tsx
git add -f .superpowers/sdd/progress.md
git commit -m "feat(paging): hall of medals pages horizontally

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Gate 全電池＋ledger 結批

**Files:**

- Modify: `.superpowers/sdd/progress.md`
- 證據: `artifacts/design-audit/student-paging/gate/`（不 commit）；拋棄式腳本只放 session scratchpad

- [ ] **Step 1: 靜態電池**：`pnpm exec vitest run`（全綠，計數記錄）；`pnpm lint`＝0；`pnpm typecheck` 綠；prettier check 本批全部動過檔。
- [ ] **Step 2: e2e 電池**：綠套件（quiz-runner chromium+firefox、live-smoke、auth-account、playable-slice、ui-restyle、app-shell.visual、classroom-leaderboard）全 PASS；既知紅簽名與 base 逐字比對未擴大（尤其 game-economy／achievements／learning-experience 的清單類失敗訊息）。
- [ ] **Step 3: 真跑電池**：學生帳號三情境（1440×900／812×375／375×812）跑五頁——每頁：分頁 chrome 出現條件正確（未溢出=無）、箭頭座標點擊換頁、鍵盤 ←/→、頁碼 aria-live、44px、縱向卷動量測（記錄各頁 scrollHeight−clientHeight delta，對照批前基線證明「長卷」消失或大幅縮短）、console 0。
- [ ] **Step 4: 對比電池**：`.game-pager__arrow`（enabled；disabled 態非互動豁免但仍量測記錄）、`__status`、dots on/off 於五頁實際場景 rendered 實測 ≥4.5:1。
- [ ] **Step 5: reduced-motion 雙通道**：兩通道下換頁瞬切（getComputedStyle animation 為 none）。
- [ ] **Step 6: ledger 結批 commit**（`## Student Paging Batch — GATE` 節：判定、commit 清單、卷動量測前後對照表、既知紅比對、遞延事項）。

```bash
git add -f .superpowers/sdd/progress.md
git commit -m "docs(sdd): close student paging batch with gate results

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Self-Review 紀錄

- **Spec 覆蓋**：§1 GamePager 全項→T2（溢出才分頁/雙通道/aria-live/44px/鍵盤/clamp）；§2 表逐列→T3 大廳（含壓縮＋owner 截圖）、T4 任務選擇＋樓層、T5 商店（**spec 誤記對齊**：spec 草寫「已購區收第二籤」，實際商店已有角色/外框籤且無獨立已購區→實作＝兩籤內貨架分頁，T1 盤點文件記載）、T6 錯題、T7 成就、範圍外頁不動；§3 品質→各任務量測＋T8 gate；§4 風險四列→溢出才分頁（T2）＋容量檔位對齊 768（T2）＋錯題僅組內（T6）＋大廳截圖（T3）。
- **佔位符掃描**：T3-T7 的溢出測試以「錨定斷言＋mock 資料形狀」給出、mock 工廠寫法依各測試檔既有慣例對齊（刻意——各檔 mock 形狀不同，硬寫必錯；實作者先讀該測試檔再展開）；其餘代碼完整。
- **型別一致**：`GamePager<T>` props、`useStageWide()`、`第 {n} / {N} 頁`、`上一頁`/`下一頁`、`.game-pager__*` class 全文一致。
