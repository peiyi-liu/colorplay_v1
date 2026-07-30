# JRPG 像素風改版 P0 地基 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 為 JRPG 像素風全站改版鋪設地基：ADR＋詞彙＋normative spec 更新、像素 token 集、RpgWindow 對話窗元件、像素字型底座。不改任何頁面外觀（批次①起才動頁面）。

**Architecture:** 純表現層。所有新 token 以**新增**方式進 `tokens.css`（不動既有 token，既有釘值測試不得紅）；對話窗是單一共用元件＋globals.css 樣式；字型走 @fontsource（拉丁）與自架 woff2（繁中像素）。

**Tech Stack:** React 19 + TypeScript + Vite、Vitest + RTL、CSS custom properties（tokens.css 單一色彩來源）、pnpm。

**規格依據:** `docs/superpowers/specs/2026-07-31-jrpg-pixel-restyle-design.md`（owner 已核准）。

## Global Constraints

- 分支：`feature/v2-major-update`；**不得推 main、不得部署**。
- 色彩僅能定義於 `src/styles/tokens.css`；元件與頁面一律 `var(--…)`，不得裸 hex。
- 新增 token 必須同批在 `src/styles/tokens.test.ts` 釘值。
- 既有測試不得變紅：本計畫全部是**新增**，不修改、不刪除既有 token 與元件。
- 無障礙底線：文字對比 4.5:1、像素字內文渲染 ≥16px、`prefers-reduced-motion` 尊重。
- 每個 commit 訊息結尾加：`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`。
- 驗證指令：`pnpm lint`、`pnpm typecheck`、`pnpm test`（在 `/Users/guanyucheng/Desktop/pei-game/colorplay` 執行）。

---

### Task 1: ADR 0005 — JRPG 像素視覺基線

**Files:**
- Create: `docs/adr/0005-jrpg-pixel-visual-baseline.md`

**Interfaces:**
- Produces: 後續 spec/07 與 tokens 變更的決策依據（供人閱讀，無程式介面）。

- [ ] **Step 1: 寫入 ADR 全文**

```markdown
# ADR 0005: JRPG 像素視覺基線取代淡彩基線

- 日期：2026-07-31
- 狀態：Accepted（owner 2026-07-31 核准）
- 取代：0728 淡彩全站裁定、0730 奶黃頁底裁定（僅視覺表現層；功能裁定不變）

## 背景

Owner 於 2026-07-30 深夜多輪 brainstorming 定案，將全站視覺與敘事翻譯為
16-bit 日式 RPG 像素世界（設計規格：
docs/superpowers/specs/2026-07-31-jrpg-pixel-restyle-design.md）。

## 決策

1. 全站視覺基線改為「色彩王國」JRPG 像素系統：夜空對話窗、羊皮紙日景、
   品牌三色升格三原色寶石、零圓角像素邊框。
2. 地圖軟鎖、兩層地圖、三色精靈導師、復仇戰再挑戰、排行榜全期累計
   （五項 owner 決議，詳見設計規格 §3）。
3. 純表現層：狀態機、RPC、RLS、ledger、rules_version、路由一律不動。
4. 0730 裁定中「已刪功能不復活」原則繼續有效。

## 影響

- tokens.css 新增 --pixel-* token 集（既有 token 保留，逐批遷移）。
- 每批次重拍該批 design-audit 截圖基準。
- 教師端像素濃度上限約三成（資料圖表維持現代可讀性）。
```

- [ ] **Step 2: Commit**

```bash
git add docs/adr/0005-jrpg-pixel-visual-baseline.md
git commit -m "docs: ADR 0005 adopt JRPG pixel visual baseline

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: CONTEXT.md 世界觀詞彙

**Files:**
- Modify: `CONTEXT.md`（檔尾新增章節；不動既有 Live 詞彙）

**Interfaces:**
- Produces: 全 codebase 統一命名——`RpgWindow`／`三色精靈 Tri-Spirits`／`寶箱結算 Loot Reveal`。

- [ ] **Step 1: 在 CONTEXT.md 檔尾追加以下章節**

```markdown
## JRPG Pixel Restyle（2026-07-31, ADR 0005）

**RPG Window（對話窗）**:
全站唯一的像素風容器元件：夜空底＋白雙線框。題目窗、系統訊息、NPC 對話、
購買確認一律用它。元件名 `RpgWindow`，樣式類名 `rpg-window`。
_Avoid_: dialog box, message box, panel（指此容器時）

**Tri-Spirits（三色精靈）**:
紅／藍／綠三位 NPC 導師，對應品牌三色寶石，負責回饋頁講解、標題畫面與
頒獎台演出。同一基底 sprite 換色而成。
_Avoid_: mascot, tutor, guide（指這組角色時）

**Loot Reveal（寶箱結算）**:
quiz result 頁的獎勵演出：寶箱開啟後滾動顯示本次「確定已入帳」的
XP／G／新解鎖成就。純演出，禁止任何隨機掉落。
_Avoid_: loot drop, gacha, reward roll

**Day/Night Scene（日夜場景）**:
村莊與世界地圖＝羊皮紙暖色日景；戰鬥、Live、投影幕＝夜空 navy。
Live 投影墨色舞台自此為正規邏輯而非例外。
```

- [ ] **Step 2: Commit**

```bash
git add CONTEXT.md
git commit -m "docs: add JRPG pixel restyle glossary to CONTEXT.md

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: spec/07 normative 視覺基線更新

**Files:**
- Modify: `spec/07-ui-visual-system.md`（標題後插入新章節；既有內容整段保留並標註被取代）

**Interfaces:**
- Produces: 批次①〜⑤ 的 normative 視覺依據。

- [ ] **Step 1: 讀 `spec/07-ui-visual-system.md` 前 30 行確認標題位置**

Run: 讀檔（僅為定位主標題行，不改既有文字）。

- [ ] **Step 2: 在主標題（第一個 `# …` 行）之後插入**

```markdown
> **基線變更（2026-07-31, ADR 0005）**：本檔既有的淡彩／奶黃基線自即日起
> 被「JRPG 像素視覺基線」取代，僅供尚未遷移頁面的維護參考。新開發一律
> 依下節與 docs/superpowers/specs/2026-07-31-jrpg-pixel-restyle-design.md。

## JRPG 像素視覺基線（2026-07-31 起 normative）

- 調色盤：全站約 48 色；品牌三色 coral `#C73A3F`／cobalt `#3056D8`／
  jade `#22A06B` 為最高飽和層，僅用於寶石、關鍵行動、計分。
  基準色：夜空窗 `#171C3F`、夜景頁底 `#10142E`、羊皮紙 `#F6EED8`、
  金幣金 `#B8862F`。日夜場景：村莊/地圖＝日景，戰鬥/Live/投影＝夜景。
- 容器：`RpgWindow` 對話窗（夜空底＋白雙線框、零圓角、硬位移陰影
  `box-shadow: 4px 4px 0`）為唯一像素容器；素材 `image-rendering: pixelated`。
- 網格：8px 基準；sprite 16/32px 整數倍放大；間距為 4px 倍數。
- 字型：繁中標題短文 Cubic 11（≥16px 渲染）；拉丁點綴 Press Start 2P；
  長文退 Noto Sans TC；數字 `tabular-nums`。
- 動效：`steps()` 緩動、150–300ms、只動 transform/opacity、
  尊重 `prefers-reduced-motion`；戰鬥三拍鐵律（樂觀揮刀→伺服器判定→命中/MISS）。
- 教師端像素濃度上限三成；已刪功能不復活；色彩僅定義於 tokens.css。
```

- [ ] **Step 3: Commit**

```bash
git add spec/07-ui-visual-system.md
git commit -m "docs(spec): supersede pastel baseline with JRPG pixel baseline (ADR 0005)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: 像素 token 集（TDD）

**Files:**
- Modify: `src/styles/tokens.css`（`:root` 區塊尾端追加；不動既有 token）
- Test: `src/styles/tokens.test.ts`（檔尾追加一個 describe；不動既有斷言）

**Interfaces:**
- Produces: `--pixel-night`、`--pixel-night-deep`、`--pixel-parchment`、`--pixel-parchment-card`、`--pixel-gold`、`--pixel-window-frame`、`--pixel-window-ink`、`--pixel-window-muted`、`--pixel-shadow`、`--radius-pixel`、`--font-pixel-latin`、`--font-pixel-tc`（Task 5 與批次①起引用）。

- [ ] **Step 1: 在 `src/styles/tokens.test.ts` 檔尾追加失敗測試**

```ts
describe('JRPG pixel baseline tokens (ADR 0005)', () => {
  it.each([
    '--pixel-night: #171c3f',
    '--pixel-night-deep: #10142e',
    '--pixel-parchment: #f6eed8',
    '--pixel-parchment-card: #fdf8ea',
    '--pixel-gold: #b8862f',
    '--pixel-window-frame: #f4f1e4',
    '--radius-pixel: 0px',
  ])('pins pixel token %s', (declaration) => {
    expect(tokensCss).toContain(declaration);
  });

  it.each([
    '--pixel-window-ink',
    '--pixel-window-muted',
    '--pixel-shadow',
    '--font-pixel-latin',
    '--font-pixel-tc',
  ])('declares pixel token %s', (name) => {
    expect(tokensCss).toMatch(new RegExp(`${name}:\\s`, 'u'));
  });
});
```

- [ ] **Step 2: 跑測試確認新斷言失敗、既有全綠**

Run: `pnpm vitest run src/styles/tokens.test.ts`
Expected: 新 describe FAIL（找不到 `--pixel-night`），其餘 PASS。

- [ ] **Step 3: 在 `src/styles/tokens.css` 的 `:root` 區塊尾端（最後一個 `}` 前）追加**

```css
  /* ── JRPG 像素基線(2026-07-31 ADR 0005):P0 新增,批次①起逐頁採用;
     既有淡彩 token 保留供未遷移頁面,勿刪 ── */
  --pixel-night: #171c3f; /* 夜空對話窗底 */
  --pixel-night-deep: #10142e; /* 夜景頁底(戰鬥/Live/投影) */
  --pixel-parchment: #f6eed8; /* 羊皮紙日景頁底(村莊/地圖) */
  --pixel-parchment-card: #fdf8ea; /* 日景卡片底 */
  --pixel-gold: #b8862f; /* 金幣/EXP 強調 */
  --pixel-window-frame: #f4f1e4; /* 對話窗白框 */
  --pixel-window-ink: #f4f1e4; /* 對話窗內文字 */
  --pixel-window-muted: #a9b0d6; /* 對話窗次要文字 */
  --pixel-shadow: rgba(0, 0, 0, 0.25); /* 硬位移陰影色 */
  --radius-pixel: 0px; /* 像素風零圓角 */
  --font-pixel-latin: 'Press Start 2P', monospace;
  --font-pixel-tc: 'Cubic 11', 'Noto Sans TC', sans-serif;
```

- [ ] **Step 4: 跑測試確認全綠**

Run: `pnpm vitest run src/styles/tokens.test.ts`
Expected: PASS（含既有斷言）。

- [ ] **Step 5: Commit**

```bash
git add src/styles/tokens.css src/styles/tokens.test.ts
git commit -m "feat(tokens): add JRPG pixel baseline tokens with pinned tests

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: RpgWindow 對話窗元件（TDD）

**Files:**
- Create: `src/components/ui/rpg-window.tsx`
- Test: `src/components/ui/rpg-window.test.tsx`
- Modify: `src/styles/globals.css`（檔尾追加 `.rpg-window` 區塊）

**Interfaces:**
- Consumes: Task 4 的 `--pixel-*` token。
- Produces: `RpgWindow({ title?: ReactNode; children: ReactNode; className?: string })`——批次①起所有像素容器一律引用。

- [ ] **Step 1: 寫失敗測試 `src/components/ui/rpg-window.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { RpgWindow } from './rpg-window';

describe('RpgWindow', () => {
  it('renders title heading and body content', () => {
    render(<RpgWindow title="系統訊息">歡迎來到色彩王國</RpgWindow>);
    expect(
      screen.getByRole('heading', { name: '系統訊息' }),
    ).toBeInTheDocument();
    expect(screen.getByText('歡迎來到色彩王國')).toBeInTheDocument();
  });

  it('omits heading when no title given', () => {
    render(<RpgWindow>純內容</RpgWindow>);
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('merges custom className onto the window container', () => {
    render(<RpgWindow className="quiz-window">內容</RpgWindow>);
    const region = screen.getByText('內容').closest('.rpg-window');
    expect(region).not.toBeNull();
    expect(region).toHaveClass('quiz-window');
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm vitest run src/components/ui/rpg-window.test.tsx`
Expected: FAIL（模組不存在）。

- [ ] **Step 3: 實作 `src/components/ui/rpg-window.tsx`**

```tsx
import type { HTMLAttributes, ReactNode } from 'react';

type RpgWindowProps = {
  /** 窗標題;省略時不渲染 heading */
  title?: ReactNode;
  children: ReactNode;
} & HTMLAttributes<HTMLElement>;

/** JRPG 對話窗:全站唯一像素容器(spec/07 JRPG 基線、CONTEXT.md RPG Window) */
export function RpgWindow({
  title,
  children,
  className,
  ...rest
}: RpgWindowProps) {
  const classes = ['rpg-window', className].filter(Boolean).join(' ');
  return (
    <section className={classes} {...rest}>
      {title ? <h2 className="rpg-window__title">{title}</h2> : null}
      <div className="rpg-window__body">{children}</div>
    </section>
  );
}
```

- [ ] **Step 4: 在 `src/styles/globals.css` 檔尾追加樣式**

```css
/* ── JRPG 對話窗(ADR 0005;元件 src/components/ui/rpg-window.tsx) ── */
.rpg-window {
  background: var(--pixel-night);
  color: var(--pixel-window-ink);
  border: 3px solid var(--pixel-window-frame);
  outline: 2px solid var(--pixel-night);
  box-shadow:
    0 0 0 5px var(--pixel-window-frame),
    8px 8px 0 var(--pixel-shadow);
  border-radius: var(--radius-pixel);
  padding: 20px 24px;
}

.rpg-window__title {
  margin: 0 0 8px;
  font-size: 18px;
  font-weight: 700;
  color: var(--pixel-window-ink);
  letter-spacing: 0.04em;
}

.rpg-window__body {
  font-size: 16px;
  line-height: 1.7;
}

.rpg-window__muted {
  color: var(--pixel-window-muted);
}
```

- [ ] **Step 5: 跑測試確認全綠**

Run: `pnpm vitest run src/components/ui/rpg-window.test.tsx`
Expected: PASS（3 tests）。

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/rpg-window.tsx src/components/ui/rpg-window.test.tsx src/styles/globals.css
git commit -m "feat(ui): add RpgWindow pixel dialog component

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: 像素字型底座

**Files:**
- Create: `src/styles/fonts-pixel.css`
- Create: `src/assets/fonts/cubic-11.woff2`（下載）
- Modify: `src/main.tsx`（import 兩行）
- Modify: `package.json`＋`pnpm-lock.yaml`（經 pnpm 新增依賴）

**Interfaces:**
- Produces: 字族名 `'Press Start 2P'` 與 `'Cubic 11'` 可用（Task 4 的 `--font-pixel-*` 因此生效）。

- [ ] **Step 1: 安裝拉丁像素字型**

Run: `pnpm add @fontsource/press-start-2p`
Expected: package.json dependencies 出現 `@fontsource/press-start-2p`。

- [ ] **Step 2: 下載 Cubic 11（俐方體 11 號，OFL 授權）**

```bash
mkdir -p src/assets/fonts
# 先查 release 資產確切檔名(可能是 Cubic_11.woff2 或含版本號):
curl -s https://api.github.com/repos/ACh-K/Cubic-11/releases/latest | grep browser_download_url
# 用上一步列出的 .woff2 URL 下載:
curl -L -o src/assets/fonts/cubic-11.woff2 <上一步的 woff2 URL>
ls -la src/assets/fonts/cubic-11.woff2
```

Expected: 檔案存在且大小 > 200KB。若 release 只有 ttf：改存 `src/assets/fonts/cubic-11.ttf`，Step 3 的 `src`／`format` 改為 `format('truetype')`。授權註記（OFL）必須寫在 fonts-pixel.css 註解。

- [ ] **Step 3: 寫 `src/styles/fonts-pixel.css`**

```css
/* Cubic 11(俐方體 11 號) — SIL OFL 1.1,來源 github.com/ACh-K/Cubic-11。
   像素字以 11 的整數倍尺寸(22/33px)最銳利;內文渲染 ≥16px(spec/07)。
   TODO(批次①後): 子集化壓載入量;目前整檔僅標題短文使用。 */
@font-face {
  font-family: 'Cubic 11';
  src: url('../assets/fonts/cubic-11.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
```

- [ ] **Step 4: 在 `src/main.tsx` 追加 import**

先讀 `src/main.tsx` 確認既有 `@fontsource/noto-sans-tc` import 的位置與寫法，於同一段追加：

```ts
import '@fontsource/press-start-2p/index.css';
import './styles/fonts-pixel.css';
```

- [ ] **Step 5: 驗證建置與型別**

Run: `pnpm typecheck && pnpm build`
Expected: 皆成功；build 輸出包含 cubic-11 字型資產。

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml src/styles/fonts-pixel.css src/assets/fonts src/main.tsx
git commit -m "feat(fonts): add Press Start 2P and Cubic 11 pixel font foundation

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: P0 收尾 gate

**Files:** 無新檔。

- [ ] **Step 1: 全套驗證**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: 全綠（722+ 既有測試＋本計畫新增測試）。

- [ ] **Step 2: 確認未動頁面外觀**

Run: `git diff --stat HEAD~6 -- src/features src/app`
Expected: 無任何 `src/features`／`src/app` 變更（P0 不碰頁面）。

- [ ] **Step 3: 回報**

輸出各 commit hash 與測試數字，宣告 P0 完成、可開批次①計畫。**不推遠端。**

---

## Self-Review 紀錄

- Spec 覆蓋：ADR（§7 P0）✓、CONTEXT 詞彙 ✓、spec/07 ✓、tokens＋釘值（§4.1）✓、對話窗（§4.2）✓、字型（§4.3）✓。素材規格與首發素材（§4.5）**刻意延後**至批次①計畫——需 owner 先看過對話窗與字型的實際渲染再定 sprite 規格，避免白做。
- Placeholder 掃描：Task 6 Step 2 的下載 URL 以查詢步驟現場取得（release 資產名不可預先寫死），並附 ttf 替代路徑，非佔位符。
- 型別一致：`RpgWindow` 簽名僅 Task 5 定義；token 名稱 Task 4 與 Task 5 CSS 完全一致。
