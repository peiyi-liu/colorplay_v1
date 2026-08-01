# JRPG 像素素材批（Asset Batch）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把批①–⑤a 已就位的 CSS 幾何佔位換成真實像素美術：先落地素材規格（Task 1），再以 Gemini 圖像生成（owner 0801 拍板方案 C）小批打樣→owner 篩選→量產換裝，全程零行為變更。

**Architecture:** 素材規格進 `spec/07`（normative）＋ADR 0006（管線決策）。素材 @1x PNG 存 `src/assets/sprites/`，由 `globals.css` 以 `url()` 消費（Vite 打包雜湊、`image-rendering: pixelated`、整數倍放大）。生成走 google-genai（`gemini-2.5-flash-image`，生成腳本＝scratchpad 拋棄式；prompt 記錄進 sprites README 保再現性）；後製（降採樣／量化／去背）與守門腳本為 repo 內 Python 工具。換裝一律只動 CSS＋新增圖檔，TSX 零接觸。

**Tech Stack:** google-genai（Gemini image）、Python 3 + Pillow 11（後製/守門）、Vite asset pipeline、Playwright（真跑量測）。

## Global Constraints（每個 task 隱含必守）

- 分支 `feature/v2-major-update`；**勿推 main、勿部署**；還原點 tag `v1-stable-20260730`。
- **行為零變更**：計分、finalize、`rules_version`、路由、API、RPC 不動，只動表現層。
- **本批 TSX/TS 零接觸**：`git diff <base>..HEAD -- src/features src/app src/components` 必須為空（所有換裝含結構修法都用 CSS 達成）。
- 對比 4.5:1（rendered 實測、合成 ancestor opacity；非文字圖形 3:1）；`prefers-reduced-motion`＋`[data-reduced-motion]` 雙通道；動畫只動 transform/opacity、`steps()`、150–300ms。**幀動畫首發不做**：素材一律單幀，沿用現行 opacity/transform keyframes（background-position 動畫違反 transform/opacity 鐵律，未來要做幀動畫用雙 pseudo-element opacity 交替，已寫入規格）。
- 對比或視覺修法不得改版型；動到 layout 必須在真跑的 app 上量 `getBoundingClientRect`（含 44px 觸控下限）＋真實座標點擊。
- 載重字串與結構性 e2e locator 一字不可改（本批唯一直接引用換裝 class 的 e2e locator：`tests/e2e/live-advanced.spec.ts:231` 的 `.live-presenter__wall-chip` count——該 class 名不得改）。
- 色彩僅定義於 `src/styles/tokens.css`；globals.css **不得新增 raw hex**（sprite 圖檔內的像素色不受此限，見 Task 1 規格明文）。本批不新增 CSS token。
- `image-rendering: pixelated` 素材必加；sprite 整數倍放大；注意載入量（單檔 ≤16KB、全批 ≤160KB、/login 首屏新增 ≤32KB）。
- commit 只 stage 自己的檔案。**平行 session 未 commit 變更（絕不可 stage）**：`.gitignore`、`docs/content/import-review.md`、`docs/content/review-import-report.md`、`package.json`、`scripts/content/import-fixes.json`、`src/features/auth/pages/login-page.tsx`、`supabase/seeds/content-*.sql`，以及 untracked 的 `.agents/`、`.claude/`、`artifacts/design-audit/`。
- commit 前對動過且 prettier 支援的檔跑 `npx prettier --check <files>`（.py/.png 免）。ledger 用 `git add -f .superpowers/sdd/progress.md`。`eslint.config.js` 不可改；不得停用或繞過 hooks。
- gate 拋棄式腳本只放 session scratchpad；gate 腳本作答**必須用座標點擊**（批⑤a 曾改原生 `element.click()` 繞過回歸——會讓按鈕重疊類回歸對 gate 隱形）。
- commit 訊息結尾：`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- 生成需 `GEMINI_API_KEY`（owner 提供；建議放 `~/.claude/settings.json` 的 `env` 區塊）。缺 key＝Task 3 前置檢查失敗，停下回報，不得偽造素材。

## File Structure

| 路徑                                     | 責任                                               |
| ---------------------------------------- | -------------------------------------------------- |
| `spec/07-ui-visual-system.md`            | 增補「素材規格」normative 節（Task 1）             |
| `docs/adr/0006-pixel-asset-pipeline.md`  | 素材管線決策紀錄（Task 1）                         |
| `CONTEXT.md`                             | 詞彙表補：素材、@1x、palette swap（Task 1）        |
| `scripts/assets/pixel-palette.json`      | 機器可讀 sprite 主調色盤（Task 1）                 |
| `scripts/assets/pixelize.py`             | 後製：裁切/降採樣/量化/去背（Task 2）              |
| `scripts/assets/check-sprites.py`        | 素材守門：尺寸階/色域⊆調色盤/預算（Task 2）        |
| `src/assets/sprites/*.png` + `README.md` | 素材檔＋每檔生成紀錄（Task 3–7）                   |
| `src/styles/globals.css`                 | 換裝 CSS（Task 4–7）                               |
| session scratchpad                       | 生成腳本、venv、contact sheet、gate 腳本（拋棄式） |

**素材清單（17 檔，@1x 尺寸→顯示尺寸）**

| 檔名                                                  | @1x         | 顯示                  | 消費者                                                                                               |
| ----------------------------------------------------- | ----------- | --------------------- | ---------------------------------------------------------------------------------------------------- |
| `monster-base.png`                                    | 32×32       | 96×96 (×3)            | 批② `.battle-monster__body`；批④ `.codex-monster`（28×24 盒、32×32 顯示置底裁切，silhouette=filter） |
| `chest-base.png`                                      | 24×11       | 72×33 (×3)            | 批② `.loot-chest__base`                                                                              |
| `chest-lid.png`                                       | 24×9        | 72×27 (×3)            | 批② `.loot-chest__lid`                                                                               |
| `spirit-red.png`/`spirit-blue.png`/`spirit-green.png` | 16×16 ×3 檔 | 32×32 (×2)            | 批③ `.spirit-avatar--*`（配件差異畫進圖）                                                            |
| `hero.png`                                            | 8×8         | 16×16 (×2)            | 批③ `.map-node__hero`                                                                                |
| `torch.png`                                           | 8×14        | 8×14 (×1)             | 批③ `.floor-torch`（unlit=filter grayscale+opacity）                                                 |
| `keeper-blooks.png`/`keeper-frames.png`               | 16×16 ×2 檔 | 32×32 (×2)            | 批④ `.shop-keeper--*`                                                                                |
| `wood-tile.png`                                       | 32×32       | 64×64 repeat          | 批④ `.guild-board` 木紋（批⑤a 旗尾織紋復用）                                                         |
| `ground-tile.png`                                     | 32×32       | 64×64 repeat          | 批① `.scene-day` 村莊地面                                                                            |
| `village-silhouette.png`                              | 320×80      | 960×240 (×3) repeat-x | 批① `/login` `.scene-night.auth-portal` 底部剪影                                                     |
| `rune-slot.png`                                       | 12×15       | 24×30 (×2)            | 批⑤a `.rune-slot`                                                                                    |
| `camp-fire.png`                                       | 10×12       | 20×24 (×2)            | 批⑤a `.camp-fire`                                                                                    |
| `gems.png`                                            | 24×8        | 48×16 (×2)            | 批⑤a `.podium-gems`                                                                                  |
| `firework.png`                                        | 16×16       | 32×32 (×2)            | 批⑤a 煙火（改掛 podium pseudo-element）                                                              |

## Task Right-Sizing 與依賴

Task 1（規格）→ Task 2（工具）→ Task 3（打樣＋**owner checkpoint**）→ Task 4/5/6/7（量產換裝，依 owner 定稿風格錨定；彼此獨立、依序跑）→ Task 8（批 gate）。Task 9（e2e 舊債修復）獨立，可在 Task 3 等 owner 期間穿插。**Task 3 結束必須停下等 owner 篩選，未定稿不得進 Task 4。**

---

### Task 1: 素材規格落地（spec/07 增補＋ADR 0006＋詞彙＋調色盤 JSON）

**Files:**

- Modify: `spec/07-ui-visual-system.md`（於「網格：8px 基準…」行（現約 :16）之後插入新節）
- Create: `docs/adr/0006-pixel-asset-pipeline.md`
- Modify: `CONTEXT.md`（詞彙表補 3 條）
- Create: `scripts/assets/pixel-palette.json`

**Interfaces:**

- Produces: sprite 主調色盤 29 色（JSON：`{"colors": ["#10142e", ...]}`）；尺寸階規則；檔名慣例 `src/assets/sprites/<kebab-name>.png`；CSS 消費 pattern。後續所有 task 以此為 normative。

- [ ] **Step 1: 在 `spec/07-ui-visual-system.md` 插入以下 normative 節**

```markdown
### 素材規格（2026-08-01 素材批定案）

- **尺寸階**：角色/物件 sprite 以 16 或 32px 見方繪製（@1x），顯示為整數倍（×2/×3）。
  場景 tile＝32×32 @1x，×2 重複鋪排。寬幅場景件（村莊剪影）@1x 高 80px、×3 顯示。
  微型 UI 塊件（火把、符文石、寶石、營火等 box <48px 者）依既有版型盒繪製：
  @1x＝盒尺寸的一半（偶數）×2 顯示；盒 <16px 者 @1x＝盒尺寸 ×1 顯示。
  **換裝不得改動既有版型盒外尺寸**；素材在盒內置中、整數倍縮放，
  非整數倍縮放禁止；盒與 @1x 階不合時以 background 天然裁切呈現。
- **調色盤**：sprite 像素色 ⊆ `scripts/assets/pixel-palette.json`（29 色主調色盤＋透明）。
  該調色盤是 `--pixel-*`/品牌 tokens 的超集：CSS 端色彩仍僅定義於 tokens.css，
  sprite 圖檔內的像素色不算 raw-hex 違規，但必須通過 `check-sprites.py` 色域檢查。
  調色盤擴充需同批修訂 JSON 並在 ADR 0006 記錄。
- **命名與存放**：`src/assets/sprites/<kebab-name>.png`，全部 @1x 單檔；
  同族換色以後綴區分（如 `spirit-red.png`）。spritesheet 暫不採用（HTTP/2＋Vite
  雜湊下單檔快取粒度更好；素材量 >40 檔時重新評估）。每檔的生成模型、prompt、
  後製參數記錄於 `src/assets/sprites/README.md`。
- **CSS 消費方式**：`background: url('../assets/sprites/x.png') center / <W>px <H>px
no-repeat;` ＋ `image-rendering: pixelated`；`<W>×<H>`＝@1x×整數。
  態變化（silhouette/unlit）用 `filter`/`opacity`，不換圖。
- **動畫**：首發素材一律單幀，動態沿用既有 transform/opacity keyframes。
  幀動畫（未來）＝雙 pseudo-element 各持一幀以 opacity steps() 交替；
  禁止 background-position 動畫（違反「動畫只動 transform/opacity」鐵律）。
- **載重預算**：單檔 ≤16KB、素材總量 ≤160KB、/login 首屏新增 ≤32KB。
  CSS background 按需載入（selector 未命中不下載），勿把素材塞進首屏關鍵路徑。
- **生產管線**：Gemini 圖像生成（打樣→owner 篩選→以定稿圖為 reference 量產）→
  `pixelize.py` 後製（裁切/降採樣/調色盤量化/去背）→ `check-sprites.py` 守門。
  生成不可控時的退路：(A) 手繪像素 SVG（BlookArt 前例）；(B) 保留 CSS 幾何
  佔位結批止損。
```

- [ ] **Step 2: 建立 `scripts/assets/pixel-palette.json`**

```json
{
  "$comment": "sprite 主調色盤(spec/07 素材規格)。CSS 色仍以 tokens.css 為唯一定義點;此表僅約束 PNG 像素色。來源:--pixel-*/品牌/章節 tokens + sprite 專用 ramp 色。",
  "colors": [
    "#10142e",
    "#171c3f",
    "#232a55",
    "#565c82",
    "#a9b0d6",
    "#f4f1e4",
    "#ffffff",
    "#18212f",
    "#f6eed8",
    "#fdf8ea",
    "#e3d5b3",
    "#6b4a26",
    "#4a3118",
    "#f5c400",
    "#b8862f",
    "#8a651f",
    "#c73a3f",
    "#e5484d",
    "#ff8a8d",
    "#ff8b75",
    "#3056d8",
    "#2542ad",
    "#6c8ff8",
    "#22a06b",
    "#17754e",
    "#48cfa5",
    "#d976e8",
    "#ff8450",
    "#39b8df"
  ]
}
```

- [ ] **Step 3: 驗證 JSON 恰 29 色、全為 6 位小寫 hex**

Run: `python3 -c "import json,re; c=json.load(open('scripts/assets/pixel-palette.json'))['colors']; assert len(c)==29 and all(re.fullmatch(r'#[0-9a-f]{6}',x) for x in c); print('palette ok', len(c))"`
Expected: `palette ok 29`

- [ ] **Step 4: 建立 `docs/adr/0006-pixel-asset-pipeline.md`**

```markdown
# ADR 0006: 像素素材生產管線

- 狀態：Accepted（owner 2026-08-01 拍板方案 C）
- 脈絡：批①–⑤a 交付了 CSS 幾何佔位；素材規格在 P0 刻意延後（需先看對話窗/字型
  實渲染），至今從未落地。owner 於 0801 在「A 手繪 / B 委外 / C AI 生成打樣」中
  選 C。
- 決策：
  1. 素材規格 normative 落於 spec/07「素材規格」節；本 ADR 只記管線決策。
  2. 生成＝google-genai `gemini-2.5-flash-image`（打樣可升 `gemini-3-pro-image-preview`）。
     生成腳本為拋棄式（session scratchpad）；再現性靠 `src/assets/sprites/README.md`
     記錄每檔 prompt/模型/後製參數。
  3. 節奏＝小批打樣（3 素材類×4 變體＋1 場景樣張）→ owner 篩選定稿 → 以定稿圖
     為 reference image 量產同風格素材。
  4. 後製與守門＝repo 內 Python（Pillow）：`pixelize.py`／`check-sprites.py`。
     AI 輸出是高解析假像素，必經降採樣到真 @1x 網格＋量化到 29 色調色盤＋去背，
     才是合格素材。
  5. 退路：兩輪打樣風格仍不可控 → (A) 手繪像素 SVG（repo 已有 BlookArt 先例）
     逐件替代；(B) 保留 CSS 幾何佔位、結批止損。任一退路都不得延長批次去「硬試」。
- 影響：素材檔進 `src/assets/sprites/`（Vite 雜湊快取）；globals.css 消費；
  TSX 零接觸。`GEMINI_API_KEY` 為 owner 私有，不入 repo。
```

- [ ] **Step 5: `CONTEXT.md` 詞彙表補 3 條（沿用該檔既有格式）**

```markdown
- **素材（sprite）**：`src/assets/sprites/` 下的 @1x 像素 PNG，經 globals.css
  `url()` 整數倍放大消費；規格見 spec/07「素材規格」節。
- **@1x**：sprite 的原生像素尺寸；顯示尺寸恆為其整數倍（pixelated 放大）。
- **palette swap（換色）**：同基底 sprite 換色相產生家族變體的策略（spec §4.5）；
  由 pixelize.py 以調色盤映射實作，非 CSS filter。
```

- [ ] **Step 6: prettier 檢查與 commit**

Run: `npx prettier --check spec/07-ui-visual-system.md docs/adr/0006-pixel-asset-pipeline.md CONTEXT.md scripts/assets/pixel-palette.json`
Expected: 全過（不符先 `--write` 再檢）

```bash
git add spec/07-ui-visual-system.md docs/adr/0006-pixel-asset-pipeline.md CONTEXT.md scripts/assets/pixel-palette.json
git commit -m "docs(spec): pin pixel asset spec, palette, and pipeline ADR 0006

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: 後製與守門工具（pixelize.py／check-sprites.py，selftest 先紅後綠）

**Files:**

- Create: `scripts/assets/pixelize.py`
- Create: `scripts/assets/check-sprites.py`

**Interfaces:**

- Consumes: `scripts/assets/pixel-palette.json`（Task 1）
- Produces: CLI `python3 scripts/assets/pixelize.py <src.png> <out.png> --size WxH [--trim-bg] [--keep-colors]`；`python3 scripts/assets/check-sprites.py`（掃 `src/assets/sprites/*.png`，違規非零退出）。兩支皆有 `--selftest`／可獨立驗證。

- [ ] **Step 1: 寫 `scripts/assets/pixelize.py`（quantize 先留 `raise NotImplementedError`，跑 selftest 確認紅）**

```python
#!/usr/bin/env python3
"""AI 產出 -> 合格 sprite 後製:裁切/降採樣/量化/去背(spec/07 素材規格)。

用法: pixelize.py SRC OUT --size 32x32 [--trim-bg] [--keep-colors]
  --trim-bg     四角最常見色視為背景,邊界 flood 成透明(容差 24/通道)
  --keep-colors 跳過調色盤量化(僅打樣 contact sheet 用;正式素材禁用)
  --selftest    合成已知圖驗證整條管線
"""
import argparse
import json
from collections import deque
from pathlib import Path

from PIL import Image

PALETTE_PATH = Path(__file__).parent / "pixel-palette.json"


def load_palette():
    colors = json.loads(PALETTE_PATH.read_text())["colors"]
    return [tuple(int(c[i : i + 2], 16) for i in (1, 3, 5)) for c in colors]


def trim_bg(img, tol=24):
    img = img.convert("RGBA")
    px = img.load()
    w, h = img.size
    corners = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]
    bg = max(set(corners), key=corners.count)

    def near(p):
        return all(abs(p[i] - bg[i]) <= tol for i in range(3))

    seen = [[False] * w for _ in range(h)]
    q = deque(
        [(x, y) for x in range(w) for y in (0, h - 1)]
        + [(x, y) for y in range(h) for x in (0, w - 1)]
    )
    while q:
        x, y = q.popleft()
        if not (0 <= x < w and 0 <= y < h) or seen[y][x]:
            continue
        seen[y][x] = True
        if not near(px[x, y]):
            continue
        px[x, y] = (0, 0, 0, 0)
        q.extend([(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)])
    return img


def quantize(img, palette):
    px = img.load()
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = px[x, y]
            if a < 128:
                px[x, y] = (0, 0, 0, 0)
                continue
            nearest = min(
                palette,
                key=lambda c: (c[0] - r) ** 2 + (c[1] - g) ** 2 + (c[2] - b) ** 2,
            )
            px[x, y] = (*nearest, 255)
    return img


def pixelize(src, out, size, do_trim, keep_colors):
    img = Image.open(src).convert("RGBA")
    if do_trim:
        img = trim_bg(img)
        box = img.getbbox()
        if box:
            img = img.crop(box)
    img = img.resize(size, Image.BOX)
    if not keep_colors:
        img = quantize(img, load_palette())
    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out, optimize=True)


def selftest():
    import tempfile

    with tempfile.TemporaryDirectory() as td:
        td_path = Path(td)
        big = Image.new("RGBA", (512, 512), (255, 255, 255, 255))
        for i, c in enumerate(
            [(199, 58, 63), (48, 86, 216), (34, 160, 107), (184, 134, 47)]
        ):
            ox = (i % 2) * 256
            oy = (i // 2) * 256
            for dx in range(64, 192):
                for dy in range(64, 192):
                    big.putpixel((ox + dx, oy + dy), (*c, 255))
        src = td_path / "src.png"
        out = td_path / "out.png"
        big.save(src)
        pixelize(src, out, (16, 16), do_trim=True, keep_colors=False)
        result = Image.open(out)
        assert result.size == (16, 16), result.size
        palette = set(load_palette())
        opaque = {
            result.getpixel((x, y))[:3]
            for x in range(16)
            for y in range(16)
            if result.getpixel((x, y))[3] == 255
        }
        assert opaque and opaque <= palette, opaque - palette
        assert any(
            result.getpixel((x, y))[3] == 0 for x in range(16) for y in range(16)
        )
    print("pixelize selftest ok")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src", nargs="?")
    ap.add_argument("out", nargs="?")
    ap.add_argument("--size")
    ap.add_argument("--trim-bg", action="store_true")
    ap.add_argument("--keep-colors", action="store_true")
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()
    if args.selftest:
        selftest()
        return
    if not (args.src and args.out and args.size):
        ap.error("SRC OUT --size 必填")
    w, h = (int(v) for v in args.size.lower().split("x"))
    pixelize(Path(args.src), Path(args.out), (w, h), args.trim_bg, args.keep_colors)
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: 跑 selftest 轉綠**

Run: `python3 scripts/assets/pixelize.py --selftest`
Expected: `pixelize selftest ok`

- [ ] **Step 3: 寫 `scripts/assets/check-sprites.py`**

```python
#!/usr/bin/env python3
"""素材守門(spec/07):尺寸階/色域⊆調色盤/預算。gate 於 Task 8 呼叫,違規非零退出。"""
import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SPRITES = ROOT / "src" / "assets" / "sprites"
PALETTE = {
    tuple(int(c[i : i + 2], 16) for i in (1, 3, 5))
    for c in json.loads(
        (Path(__file__).parent / "pixel-palette.json").read_text()
    )["colors"]
}
BUDGET_FILE = 16 * 1024
BUDGET_TOTAL = 160 * 1024


def check():
    errors = []
    total = 0
    pngs = sorted(SPRITES.glob("*.png")) if SPRITES.exists() else []
    if not pngs:
        print("no sprites yet — nothing to check")
        return 0
    for p in pngs:
        size = p.stat().st_size
        total += size
        if size > BUDGET_FILE:
            errors.append(f"{p.name}: {size}B > 單檔預算 {BUDGET_FILE}B")
        img = Image.open(p).convert("RGBA")
        if img.width > 320 or img.height > 320:
            errors.append(f"{p.name}: {img.size} 超出 @1x 尺寸上限 320")
        bad = {
            img.getpixel((x, y))[:3]
            for x in range(img.width)
            for y in range(img.height)
            if img.getpixel((x, y))[3] >= 128
        } - PALETTE
        if bad:
            errors.append(f"{p.name}: {len(bad)} 個調色盤外色 例 {sorted(bad)[:3]}")
    if total > BUDGET_TOTAL:
        errors.append(f"總量 {total}B > 預算 {BUDGET_TOTAL}B")
    for e in errors:
        print("FAIL", e)
    print(f"checked {len(pngs)} sprites, total {total}B")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(check())
```

- [ ] **Step 4: 守門紅綠雙驗（違規樣本測完即刪）**

Run: `python3 scripts/assets/check-sprites.py`
Expected: `no sprites yet — nothing to check`
Run: `mkdir -p src/assets/sprites && python3 -c "from PIL import Image; Image.new('RGBA',(8,8),(1,2,3,255)).save('src/assets/sprites/_bad.png')" && python3 scripts/assets/check-sprites.py; rm src/assets/sprites/_bad.png`
Expected: `FAIL _bad.png: 1 個調色盤外色 …` 且退出碼 1；刪檔後復綠

- [ ] **Step 5: Commit**

```bash
git add scripts/assets/pixelize.py scripts/assets/check-sprites.py
git commit -m "feat(assets): add sprite post-processing and gate check tools

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: 打樣批（style probe）＋ owner 篩選 CHECKPOINT

**Files:**

- Create（scratchpad，拋棄式）: `<scratchpad>/assetgen/generate.py`、venv、原始輸出、contact sheet
- Create（不 commit）: `artifacts/design-audit/asset-batch/proofs/contact-sheet-*.png`
- Create: `src/assets/sprites/README.md`

**Interfaces:**

- Consumes: pixelize.py（Task 2）
- Produces: owner 定稿的 style anchor 圖（複製到 `artifacts/design-audit/asset-batch/anchor/`，檔名 `spirit.png`／`monster.png`／`chest.png`／`village.png`）＋定稿 prompt 全文記入 ledger，供 Task 4–7 引用。

- [ ] **Step 1: 生成環境預檢（缺任一項即停，回報 owner，不得繼續）**

```bash
[ -n "$GEMINI_API_KEY" ] && echo key-ok || echo "STOP: GEMINI_API_KEY 未設(放 ~/.claude/settings.json env 區塊後重開 session)"
python3 -m venv "$SCRATCHPAD/assetgen/venv" && "$SCRATCHPAD/assetgen/venv/bin/pip" -q install google-genai pillow && echo venv-ok
```

- [ ] **Step 2: 寫生成腳本 `<scratchpad>/assetgen/generate.py`**

```python
#!/usr/bin/env python3
"""打樣/量產共用生成腳本(拋棄式;prompt 紀錄以 sprites README 為準)。"""
import argparse
import pathlib
import sys

from google import genai

STYLE = (
    "16-bit JRPG pixel art sprite, SNES era, crisp hard pixels, no anti-aliasing, "
    "no outline glow, flat solid colors from a limited palette of deep navy #171c3f, "
    "parchment cream #f6eed8, gold #b8862f, coral red #c73a3f, cobalt blue #3056d8, "
    "jade green #22a06b, centered subject, plain solid white background, full body"
)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--prompt", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--ref", help="style anchor image path(量產時必帶)")
    ap.add_argument("--model", default="gemini-2.5-flash-image")
    args = ap.parse_args()
    client = genai.Client()  # 讀 GEMINI_API_KEY
    contents = []
    if args.ref:
        from PIL import Image

        contents.append(Image.open(args.ref))
        contents.append(
            "Use the exact same pixel-art style, palette and scale as this reference image. "
        )
    contents.append(STYLE + ". Subject: " + args.prompt)
    resp = client.models.generate_content(model=args.model, contents=contents)
    for part in resp.candidates[0].content.parts:
        if getattr(part, "inline_data", None):
            pathlib.Path(args.out).write_bytes(part.inline_data.data)
            print("wrote", args.out)
            return
    sys.exit("no image in response: " + str(resp))


if __name__ == "__main__":
    main()
```

- [ ] **Step 3: 打樣生成——3 素材類 × 4 變體＋1 場景樣張（13 張原始圖，存 scratchpad）**

```bash
V="$SCRATCHPAD/assetgen/venv/bin/python"; G="$SCRATCHPAD/assetgen/generate.py"; O="$SCRATCHPAD/assetgen/raw"
mkdir -p "$O"
for i in 1 2 3 4; do
  $V $G --prompt "small cute round elemental fairy spirit creature, single color body, big eyes, tiny horn accessory" --out "$O/spirit-$i.png"
  $V $G --prompt "small chubby slime monster with two dark eyes, friendly menacing look" --out "$O/monster-$i.png"
  $V $G --prompt "closed wooden treasure chest with gold trim and lock, front view" --out "$O/chest-$i.png"
done
$V $G --prompt "silhouette of a small medieval village skyline at night, houses and towers, wide horizontal strip, dark navy on white sky" --out "$O/village-1.png"
```

- [ ] **Step 4: 後製 @1x 並拼 contact sheet（量化前後並列）**

```bash
for f in "$O"/spirit-*.png; do python3 scripts/assets/pixelize.py "$f" "${f%.png}-1x.png" --size 16x16 --trim-bg; done
for f in "$O"/monster-*.png; do python3 scripts/assets/pixelize.py "$f" "${f%.png}-1x.png" --size 32x32 --trim-bg; done
for f in "$O"/chest-*.png; do python3 scripts/assets/pixelize.py "$f" "${f%.png}-1x.png" --size 24x20 --trim-bg; done
python3 scripts/assets/pixelize.py "$O/village-1.png" "$O/village-1-1x.png" --size 320x80 --trim-bg
```

以 Pillow 小腳本（scratchpad）把 @1x 各 ×4 NEAREST 放大、與原始圖縮圖並列，拼成 `contact-sheet-round1.png`，複製到 `artifacts/design-audit/asset-batch/proofs/`。

- [ ] **Step 5: CHECKPOINT——contact sheet 呈 owner 篩選**

停下，問 owner：(a) 每素材類選哪一變體（或均不合格）；(b) 全局風格可否當 anchor。

- **通過** → 選中的原始圖複製為 `artifacts/design-audit/asset-batch/anchor/{spirit,monster,chest,village}.png`，定稿 prompt＋選擇記入 ledger，進 Task 4。
- **一輪不合格** → 依 owner 回饋改 prompt 重打一輪（回 Step 3；可換 `--model gemini-3-pro-image-preview`）。
- **兩輪仍不可控** → 停批，把退路決策（ADR 0006：A 手繪 SVG／B 保留佔位止損）交 owner 裁定。**不得自行進入第三輪。**

- [ ] **Step 6: 建 `src/assets/sprites/README.md` 骨架並 commit**

```markdown
# Pixel Sprites

規格見 `spec/07-ui-visual-system.md`「素材規格」節；管線見 ADR 0006。
每檔記錄：生成模型／prompt／reference／pixelize 參數。style anchor＝
owner 定稿圖（artifacts/design-audit/asset-batch/anchor/，不入 repo）。

| 檔名 | 模型 | prompt 摘要 | pixelize 參數 |
| ---- | ---- | ----------- | ------------- |
```

```bash
git add src/assets/sprites/README.md
git commit -m "docs(assets): start sprite provenance ledger

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: 批② 換裝——戰鬥魔物＋寶箱

**Files:**

- Create: `src/assets/sprites/monster-base.png`、`chest-base.png`、`chest-lid.png`
- Modify: `src/styles/globals.css`（`.battle-monster__body` 現約 :5928-5942、`.battle-monster__eye*` :5944-5958、`.loot-chest*` :6158-6184；行號以當時 HEAD 為準，先 grep 再改）
- Modify: `src/assets/sprites/README.md`（補 3 列）

**Interfaces:**

- Consumes: anchor（Task 3）、pixelize/check（Task 2）。每個量產 task 開頭先 `V="$SCRATCHPAD/assetgen/venv/bin/python"; G="$SCRATCHPAD/assetgen/generate.py"; O="$SCRATCHPAD/assetgen/raw"; A="artifacts/design-audit/asset-batch/anchor"`。
- Produces: 檔名如上；`.battle-monster__eye` DOM 保留但 CSS 隱形（TSX 零接觸）。

- [ ] **Step 1: 生成＋後製（量產一律帶 `--ref`）**

```bash
$V $G --ref "$A/monster.png" --prompt "the same slime monster, final clean version" --out "$O/monster-final.png"
$V $G --ref "$A/chest.png" --prompt "the same treasure chest, box body only without lid" --out "$O/chest-base-raw.png"
$V $G --ref "$A/chest.png" --prompt "the same treasure chest, curved lid only without box body" --out "$O/chest-lid-raw.png"
python3 scripts/assets/pixelize.py "$O/monster-final.png" src/assets/sprites/monster-base.png --size 32x32 --trim-bg
python3 scripts/assets/pixelize.py "$O/chest-base-raw.png" src/assets/sprites/chest-base.png --size 24x11 --trim-bg
python3 scripts/assets/pixelize.py "$O/chest-lid-raw.png" src/assets/sprites/chest-lid.png --size 24x9 --trim-bg
python3 scripts/assets/check-sprites.py
```

Expected: `checked 3 sprites …` 退出碼 0。（分件生成裁切效果差時：生完整寶箱一張，Pillow 於 scratchpad 依 11/9 高度比橫切成兩檔。）

- [ ] **Step 2: CSS 換裝（保留盒尺寸與全部動畫 keyframes）**

`.battle-monster__body` 整段改為：

```css
.battle-monster__body {
  position: absolute;
  inset: 0;
  background: url('../assets/sprites/monster-base.png') center / 96px 96px
    no-repeat;
  image-rendering: pixelated;
}
```

`.battle-monster__eye`／`--left`／`--right` 三規則宣告改為 `background: none;`（DOM 與規則保留，五官已在 sprite 內）。`.battle-stage--hit .battle-monster__body { opacity: 0.6; }` 不動。

```css
.loot-chest__base {
  position: absolute;
  inset: 23px 0 0;
  background: url('../assets/sprites/chest-base.png') center bottom / 72px 33px
    no-repeat;
  image-rendering: pixelated;
}

.loot-chest__lid {
  position: absolute;
  inset: 0 0 auto;
  height: 27px;
  background: url('../assets/sprites/chest-lid.png') center top / 72px 27px
    no-repeat;
  image-rendering: pixelated;
  transform-origin: bottom left;
  transition: transform 300ms steps(3);
}
```

（`.loot-chest` 外盒 72×56 不變；lid 26→27、base inset-top 22→23 皆在 absolute 盒內不影響外部 flow；border/gold 底移除由 sprite 呈現；`[data-open]` 與 reduced-motion 規則不動。）

- [ ] **Step 3: 真跑量測（本機 Supabase＋`pnpm dev`；Playwright 腳本 scratchpad）**

學生 fixture 登入 → `/app/quiz/:id` 戰鬥與結算：

- `.battle-stage__monster`／`.loot-chest` rect 前後一致（96×96／72×56）。
- `getComputedStyle` backgroundImage 含檔名；截圖目視成形。
- 答題四鈕**座標點擊**命中、各鈕 ≥44px。
- 開蓋（data-open）/hit/idle 動畫無回歸；`[data-reduced-motion]` 靜止。
- 375px 重測。截圖存 `artifacts/design-audit/asset-batch/`。

- [ ] **Step 4: README 補列、prettier、commit**

```bash
npx prettier --check src/styles/globals.css src/assets/sprites/README.md
git add src/assets/sprites/monster-base.png src/assets/sprites/chest-base.png src/assets/sprites/chest-lid.png src/assets/sprites/README.md src/styles/globals.css
git commit -m "feat(pixel-assets): dress battle monster and loot chest with real sprites

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: 批③ 換裝——三色精靈＋地圖 hero＋火把

**Files:**

- Create: `src/assets/sprites/spirit-red.png`、`spirit-blue.png`、`spirit-green.png`、`hero.png`、`torch.png`
- Modify: `src/styles/globals.css`（`.spirit-avatar*` 現約 :5402-5457、`.map-node__hero` :3543-3553、`.floor-torch*` :4384-4404）
- Modify: `src/assets/sprites/README.md`

**Interfaces:**

- Consumes: anchor；spirit-red 為基底，藍/綠以 `--ref` spirit 紅版原始圖生成（配件：紅=尖角、藍=方帽、綠=斜葉，畫進圖，對應現行 ::before 註解語意）。
- Produces: 檔名如上；`.spirit-avatar__body::before`（配件）與 `.spirit-avatar__eyes` DOM 保留、CSS 退役。

- [ ] **Step 1: 生成＋後製**

```bash
$V $G --ref "$A/spirit.png" --prompt "the same fairy spirit, coral red body, small pointed horn on head" --out "$O/spirit-red-raw.png"
$V $G --ref "$O/spirit-red-raw.png" --prompt "identical spirit but cobalt blue body and a tiny square hat instead of horn" --out "$O/spirit-blue-raw.png"
$V $G --ref "$O/spirit-red-raw.png" --prompt "identical spirit but jade green body and a small slanted leaf on head instead of horn" --out "$O/spirit-green-raw.png"
$V $G --ref "$A/monster.png" --prompt "tiny 8-bit hero adventurer with coral tunic, front view, very simple" --out "$O/hero-raw.png"
$V $G --ref "$A/monster.png" --prompt "small wall torch with gold flame on dark handle, front view, tall narrow" --out "$O/torch-raw.png"
python3 scripts/assets/pixelize.py "$O/spirit-red-raw.png" src/assets/sprites/spirit-red.png --size 16x16 --trim-bg
python3 scripts/assets/pixelize.py "$O/spirit-blue-raw.png" src/assets/sprites/spirit-blue.png --size 16x16 --trim-bg
python3 scripts/assets/pixelize.py "$O/spirit-green-raw.png" src/assets/sprites/spirit-green.png --size 16x16 --trim-bg
python3 scripts/assets/pixelize.py "$O/hero-raw.png" src/assets/sprites/hero.png --size 8x8 --trim-bg
python3 scripts/assets/pixelize.py "$O/torch-raw.png" src/assets/sprites/torch.png --size 8x14 --trim-bg
python3 scripts/assets/check-sprites.py
```

- [ ] **Step 2: CSS 換裝**

```css
.spirit-avatar {
  position: relative;
  display: inline-block;
  flex: none;
  width: 32px;
  height: 32px;
  image-rendering: pixelated;
  animation: spirit-idle 0.3s steps(2, jump-none) infinite alternate;
}

.spirit-avatar__body {
  position: absolute;
  inset: 0;
  background: url('../assets/sprites/spirit-red.png') center / 32px 32px
    no-repeat;
  box-shadow: none;
}

.spirit-avatar__body::before {
  content: none;
}

.spirit-avatar__eyes {
  background: none;
  box-shadow: none;
}

.spirit-avatar--red .spirit-avatar__body {
  background-image: url('../assets/sprites/spirit-red.png');
}

.spirit-avatar--blue .spirit-avatar__body {
  background-image: url('../assets/sprites/spirit-blue.png');
}

.spirit-avatar--green .spirit-avatar__body {
  background-image: url('../assets/sprites/spirit-green.png');
}
```

（`--red/--green ::before` 兩條 clip-path 規則整段刪；`spirit-idle` keyframes 不動；`inset: 6px 4px 0` 改 `inset: 0`——配件已含在 16×16 sprite，內外盒 32×32 不變。）

```css
.map-node__hero {
  position: absolute;
  top: -18px;
  right: -12px;
  width: 16px;
  height: 16px;
  border: none;
  background: url('../assets/sprites/hero.png') center / 16px 16px no-repeat;
  image-rendering: pixelated;
  box-shadow: none;
  animation: hero-bob 0.3s steps(2, jump-none) infinite alternate;
}
```

（盒 18×18〔14+2border〕→16×16，absolute 不入 flow；top/right 各外移 2px 維持錨點。Step 3 量測不遮節點文字，順檢 B3 M6 精靈/魔物間距。）

```css
.floor-torch {
  width: 8px;
  height: 14px;
  background: url('../assets/sprites/torch.png') center / 8px 14px no-repeat;
  image-rendering: pixelated;
  filter: grayscale(1);
  opacity: 0.45;
}

.floor-torch--lit {
  filter: none;
  opacity: 1;
  animation: torch-flicker 0.3s steps(2, jump-none) infinite alternate;
}
```

（clip-path 刪；lit/unlit 同圖、態差=filter/opacity；盒 8×14 不變→火把列不換行，B3 M5 維持現狀記錄。）

- [ ] **Step 3: 真跑量測**

`/app/missions`＋`/app/chapters/:id`＋答題回饋頁：

- 三元素 rect 與版型零回歸（hero 新盒 16×16：量不遮節點編號/文字）。
- 三色精靈可辨（配件三態截圖）、火把 lit/unlit 對比（非文字 3:1）。
- 節點按鈕座標點擊＋44px；375px；reduced-motion 雙通道。

- [ ] **Step 4: README、prettier、commit（stage 僅本 task 檔案）**

```bash
git add src/assets/sprites/spirit-red.png src/assets/sprites/spirit-blue.png src/assets/sprites/spirit-green.png src/assets/sprites/hero.png src/assets/sprites/torch.png src/assets/sprites/README.md src/styles/globals.css
git commit -m "feat(pixel-assets): dress spirits, map hero, and floor torches

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: 批①④ 換裝——場景（login 剪影＋村莊地面）＋村莊設施（店主×2＋圖鑑魔物＋木紋）

**Files:**

- Create: `src/assets/sprites/village-silhouette.png`、`ground-tile.png`、`wood-tile.png`、`keeper-blooks.png`、`keeper-frames.png`
- Modify: `src/styles/globals.css`（`.scene-night.auth-portal` 現約 :5740、`.scene-day` :5603-5607、`.scene-day.guild-board` :4592-4600、`.shop-keeper*` :4447-4477、`.codex-monster*` :4547-4590）
- Modify: `src/assets/sprites/README.md`

**Interfaces:**

- Consumes: anchor＋`monster-base.png`（Task 4；codex 復用不生新圖）
- Produces: 檔名如上。**`src/features/auth/pages/login-page.tsx` 是平行 session 修改中檔案——login 換裝只准動 CSS。**

- [ ] **Step 1: 生成＋後製**

```bash
$V $G --ref "$A/village.png" --prompt "the same village silhouette, wide strip, rooftops and one tower, night navy" --out "$O/village-final.png"
$V $G --ref "$A/village.png" --prompt "seamless tileable ground texture of warm parchment-colored cobblestone plaza, very low contrast, top-down" --out "$O/ground-raw.png"
$V $G --ref "$A/village.png" --prompt "seamless tileable dark wooden plank texture with visible grain, warm brown" --out "$O/wood-raw.png"
$V $G --ref "$A/spirit.png" --prompt "small shopkeeper NPC bust with coral apron waving, front view" --out "$O/keeper-blooks-raw.png"
$V $G --ref "$A/spirit.png" --prompt "small tailor NPC bust with cobalt blue hat and measuring tape, front view" --out "$O/keeper-frames-raw.png"
python3 scripts/assets/pixelize.py "$O/village-final.png" src/assets/sprites/village-silhouette.png --size 320x80 --trim-bg
python3 scripts/assets/pixelize.py "$O/ground-raw.png" src/assets/sprites/ground-tile.png --size 32x32
python3 scripts/assets/pixelize.py "$O/wood-raw.png" src/assets/sprites/wood-tile.png --size 32x32
python3 scripts/assets/pixelize.py "$O/keeper-blooks-raw.png" src/assets/sprites/keeper-blooks.png --size 16x16 --trim-bg
python3 scripts/assets/pixelize.py "$O/keeper-frames-raw.png" src/assets/sprites/keeper-frames.png --size 16x16 --trim-bg
python3 scripts/assets/check-sprites.py
```

（tile 兩張不 `--trim-bg`——鋪排要滿版。無縫檢查：scratchpad 用 Pillow 2×2 拼接目視接縫，明顯就重生成。**紋理色 clamp**：ground-tile 全像素 clamp 到 `#f6eed8/#fdf8ea/#e3d5b3` 三色、wood-tile clamp 到 `#6b4a26/#4a3118/#8a651f` 三色——scratchpad 腳本以調色盤子集重量化，保證紋理對比可控。）

- [ ] **Step 2: CSS 換裝**

login 剪影（只加規則）：

```css
.scene-night.auth-portal::after {
  content: '';
  position: absolute;
  inset: auto 0 0;
  height: 240px;
  background: url('../assets/sprites/village-silhouette.png') center bottom /
    960px 240px repeat-x;
  image-rendering: pixelated;
  pointer-events: none;
}
```

（`.scene-night > * { position: relative }` 既有規則保證內容蓋在剪影上。Step 3 必測：剪影最亮色與其上文字/連結合成對比、與 `.press-start` 重疊情形。）

村莊地面（`.scene-day` :5603）：

```css
.scene-day {
  background: var(--pixel-parchment) url('../assets/sprites/ground-tile.png')
    top left / 64px 64px repeat;
  image-rendering: pixelated;
  padding-bottom: 48px;
}
```

佈告欄木紋（`.scene-day.guild-board` :4592 的 `background` 行改為）：

```css
background: var(--pixel-gold-deep) url('../assets/sprites/wood-tile.png') top
  left / 64px 64px repeat;
image-rendering: pixelated;
```

店主（盒 20→32，inline icon，Step 3 量 header row 位移）：

```css
.shop-keeper {
  position: relative;
  display: inline-block;
  flex: none;
  width: 32px;
  height: 32px;
  margin-right: 6px;
  vertical-align: -8px;
  image-rendering: pixelated;
  box-shadow: none;
}

.shop-keeper::before {
  content: none;
}

.shop-keeper--blooks {
  background: url('../assets/sprites/keeper-blooks.png') center / 32px 32px
    no-repeat;
}

.shop-keeper--frames {
  background: url('../assets/sprites/keeper-frames.png') center / 32px 32px
    no-repeat;
}
```

圖鑑魔物（復用 monster-base；盒 28×24 不變、sprite 顯示 @1x＝32×32 底部對齊、左右各 2px 由 background 天然裁切——規格「盒與 @1x 階不合時以 background 裁切呈現」）：

```css
.codex-monster {
  position: relative;
  flex: none;
  display: inline-block;
  width: 28px;
  height: 24px;
  margin-top: 2px;
  background: url('../assets/sprites/monster-base.png') center bottom / 32px
    32px no-repeat;
  image-rendering: pixelated;
  filter: brightness(0) opacity(0.75);
}

.codex-monster--lit {
  filter: none;
}

.codex-monster--lit::before {
  content: none;
}
```

（clip-path 刪；silhouette=filter。Step 3 目視裁切，醜則另生 `codex-monster.png` 14×12 @1x ×2 備援並回補 README 與清單。）

- [ ] **Step 3: 真跑量測**

`/login`、`/app`、`/app/shop`、`/app/mistakes`、`/app/leaderboard`：

- login：剪影貼底、不遮表單；`.press-start` 疊區對比合格；表單座標點擊；375px。
- 村莊/佈告欄：紋理上直落文字全部 rendered 對比 ≥4.5:1（取最深紋理色採樣點；含 375px）；金銀銅列無回歸。不合格的修法＝加深該紋理 clamp 子集或撤紋理，**不改版型不改字色 token**。
- 商店：keeper 32×32 後 header row rect 位移 ≤12px、無重疊無換行破版；分頁鈕座標點擊＋44px。
- 圖鑑：silhouette/lit 兩態可辨。
- reduced-motion 雙通道；console 0。

- [ ] **Step 4: README、prettier、commit**

```bash
git add src/assets/sprites/village-silhouette.png src/assets/sprites/ground-tile.png src/assets/sprites/wood-tile.png src/assets/sprites/keeper-blooks.png src/assets/sprites/keeper-frames.png src/assets/sprites/README.md src/styles/globals.css
git commit -m "feat(pixel-assets): dress login skyline, village ground, guild board, shop keepers, codex

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: 批⑤a 換裝——Live（符文石＋營火＋三寶石＋煙火結構修法＋旗尾織紋）

**Files:**

- Create: `src/assets/sprites/rune-slot.png`、`camp-fire.png`、`gems.png`、`firework.png`
- Modify: `src/styles/globals.css`（`.rune-slot*` 現約 :6357-6375、`.camp-fire` :6500-6536、`.podium-gems` :6582-6597、`.podium-fireworks*` :6599-6638、`.live-presenter .live-presenter__wall-chip` :6542-6548）
- Modify: `src/assets/sprites/README.md`

**Interfaces:**

- Consumes: anchor（Task 3）、wood-tile.png（Task 6）
- Produces: 檔名如上；煙火從「兩個 span 定值定位」改為「podium 自身 pseudo-element」（B5a close-out D4 指定的結構性修法）——span 以 CSS `display: none` 退役，TSX 不動。

- [ ] **Step 1: 生成＋後製**

```bash
$V $G --ref "$A/chest.png" --prompt "small stone rune tablet slot, dark navy stone with carved border, tall rectangle" --out "$O/rune-raw.png"
$V $G --ref "$A/chest.png" --prompt "small camp fire with gold flames on dark logs, front view" --out "$O/campfire-raw.png"
$V $G --ref "$A/chest.png" --prompt "three faceted gems in a row: coral red, cobalt blue, jade green, wide strip" --out "$O/gems-raw.png"
$V $G --ref "$A/chest.png" --prompt "single pixel firework burst, gold core with coral blue green sparks, radial" --out "$O/firework-raw.png"
python3 scripts/assets/pixelize.py "$O/rune-raw.png" src/assets/sprites/rune-slot.png --size 12x15 --trim-bg
python3 scripts/assets/pixelize.py "$O/campfire-raw.png" src/assets/sprites/camp-fire.png --size 10x12 --trim-bg
python3 scripts/assets/pixelize.py "$O/gems-raw.png" src/assets/sprites/gems.png --size 24x8 --trim-bg
python3 scripts/assets/pixelize.py "$O/firework-raw.png" src/assets/sprites/firework.png --size 16x16 --trim-bg
python3 scripts/assets/check-sprites.py
```

- [ ] **Step 2: CSS 換裝**

```css
.rune-slot {
  width: 24px;
  height: 30px;
  border: none;
  background: url('../assets/sprites/rune-slot.png') center / 24px 30px
    no-repeat;
  image-rendering: pixelated;
}

.rune-slot--lit {
  background-color: var(--pixel-gold);
  border: none;
  box-shadow: 2px 2px 0 var(--pixel-shadow);
}
```

（lit＝金底透出 sprite 鏤空；Step 3 目視，效果差改 lit 用 `filter: sepia(1) saturate(3) brightness(1.3)`，二選一記 README。）

```css
.camp-fire {
  display: inline-block;
  width: 20px;
  height: 24px;
  margin-bottom: 8px;
  background: url('../assets/sprites/camp-fire.png') center / 20px 24px
    no-repeat;
  image-rendering: pixelated;
  animation: camp-flicker 0.3s steps(2, jump-none) infinite alternate;
}
```

```css
.podium-gems {
  display: block;
  width: 48px;
  height: 16px;
  margin: 0 auto 6px;
  background: url('../assets/sprites/gems.png') center / 48px 16px no-repeat;
  image-rendering: pixelated;
}
```

（camp-fire/podium-gems 的 clip-path 與 gradient 刪除；flicker keyframes 與雙通道規則不動。）

煙火結構修法（D4）——`.podium-fireworks` 改 `display: none;`（span 退役），`.live-presenter__podium` 補 `position: relative;`（若無），新增：

```css
.live-presenter__podium::before,
.live-presenter__podium::after {
  content: '';
  position: absolute;
  top: -40px;
  width: 32px;
  height: 32px;
  background: url('../assets/sprites/firework.png') center / 32px 32px no-repeat;
  image-rendering: pixelated;
  animation: fireworks-burst 1.2s steps(3, jump-none) infinite;
  pointer-events: none;
}

.live-presenter__podium::before {
  left: -44px;
}

.live-presenter__podium::after {
  right: -44px;
  animation-delay: 0.6s;
}

@media (prefers-reduced-motion: reduce) {
  .live-presenter__podium::before,
  .live-presenter__podium::after {
    animation: none;
  }
}

[data-reduced-motion='true'] .live-presenter__podium::before,
[data-reduced-motion='true'] .live-presenter__podium::after {
  animation: none;
}
```

（舊 `.podium-fireworks--left/--right` 定值規則含 1080p 校準長註解整段刪——結構修法後定位隨 podium 走，D4 三種失準條件自然解除；`fireworks-burst` keyframes 保留。）

旗尾織紋（**class 名與 clip-path 形狀皆不動**——`live-advanced.spec.ts:231` locator＋B5a 旗尾 2.7px 邊際風險原樣保留，只疊布紋）：`.live-presenter .live-presenter__wall-chip` 宣告尾端加

```css
background-image: url('../assets/sprites/wood-tile.png');
background-size: 64px 64px;
image-rendering: pixelated;
```

（wall-chip 名字若實測對比 <4.5:1，**撤掉此三行**（旗尾織紋降格不做，記 README），不得改字色或版型救它。）

- [ ] **Step 3: 真跑量測（需 1080p presenter；真實 Live 場次 host＋2 學生 fixture；腳本 scratchpad、作答一律座標點擊）**

- `/app/live/join`：rune 六格點亮節奏、rect 24×30 不變、輸入座標點擊。
- late-join 營地：`.camp-fire` 成形（**本輪必排入 capture 時序**——批⑤a 未觸達的態這次補上）。
- presenter 1080p：三寶石裁圖可辨；**兩顆煙火距各自名次卡 ≤48px 且零文字重疊**（getBoundingClientRect；再以 1366×768 重量一次證明定位隨 podium 走）；旗幟牆名條對比；`grep -c 'live-presenter__wall-chip' src/styles/globals.css` 前後一致。
- 學生端 question/feedback 四鈕座標點擊＋44px＋`.live-options` grid 全寬（批⑤a C1 legend 教訓警戒區）。
- reduced-motion 雙通道（含 pseudo-element 煙火）；console 0；375px 學生端。

- [ ] **Step 4: README、prettier、commit**

```bash
git add src/assets/sprites/rune-slot.png src/assets/sprites/camp-fire.png src/assets/sprites/gems.png src/assets/sprites/firework.png src/assets/sprites/README.md src/styles/globals.css
git commit -m "feat(pixel-assets): dress live runes, camp fire, podium gems, structural fireworks

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: 素材批 Gate

**Files:**

- Create（scratchpad）: gate 腳本（座標點擊版；批⑤a gate-capture 骨架已隨舊 session scratchpad 蒸發，需重寫）
- Modify: `.superpowers/sdd/progress.md`（結批紀錄，`git add -f`）
- 證據: `artifacts/design-audit/asset-batch/`（不 commit）

**Interfaces:**

- Consumes: Task 1–7 全部產出；`<base>`＝本批第一個 commit 的父 SHA（開批時記入 ledger）。
- Produces: gate PASS/FAIL 裁決＋contrast.md＋截圖組；PASS 才交 opus 終審。

- [ ] **Step 1: 靜態電池**

```bash
pnpm lint && pnpm typecheck && pnpm test
git diff <base>..HEAD --stat -- src/features src/app src/components src/styles/tokens.css
```

Expected: 三綠；**diff 輸出空**（TSX/TS/tokens 零接觸鐵律）。

- [ ] **Step 2: raw hex 與載重字串**

```bash
git diff <base>..HEAD -- src/styles/globals.css | grep -E '^\+' | grep -oiE '#[0-9a-f]{3,8}' | sort -u
```

Expected: 空。載重字串由 Step 1 TSX zero-diff 保證；另 `grep -c "live-presenter__wall-chip" src/styles/globals.css` 與 base 一致。

- [ ] **Step 3: 素材守門**

Run: `python3 scripts/assets/check-sprites.py`
Expected: 0 FAIL。另計 `/login` 引用素材（village-silhouette）≤32KB。

- [ ] **Step 4: e2e**

`quiz-runner`（chromium＋firefox）與 `live-smoke` 必綠（966ba62 後基線＝PASS）。其餘既有紅 spec（classroom-leaderboard／assignments-live／live-advanced；若 Task 9 已完成則以修復後結果為準）不列 blocking，但紅因需與 base 字面比對確認非本批引入。

- [ ] **Step 5: 視覺與對比電池（腳本 scratchpad；作答/導航一律座標點擊）**

- 截圖重拍：login、村莊、世界地圖、樓層、戰鬥、結算、商店、圖鑑、佈告欄、join、學生 question/feedback、camp、presenter 四態 1080p——桌機＋375 全套存 `artifacts/design-audit/asset-batch/`。
- 對比 rendered 實測（ancestor opacity 合成；紋理面最深/最亮雙採樣；positioned 元素必畫在 in-flow 文字上〔B4 D1 註記〕；動畫疊層取 keyframe 兩極值）：紋理上文字、剪影疊字區、sprite 鄰接文字全配對 ≥4.5:1、非文字圖形 ≥3:1 → `contrast.md`。
- 幾何：互動鈕 rect ≥44px；全部換裝元素盒尺寸與 base 比對（keeper 20→32、hero 18→16 兩處刻意變更以 Task 5/6 量測值為準，其餘必須相等）。
- reduced-motion 雙通道全景；console 0 error/0 pageerror。

- [ ] **Step 6: 結批**

ledger 記錄（含 deferred/新發現）、`git add -f .superpowers/sdd/progress.md`、commit、交 opus 終審。

---

### Task 9（獨立順手債，可在 Task 3 等 owner 期間執行）: e2e 舊 spec 修復

**Files:**

- Modify: `tests/e2e/classroom-leaderboard.spec.ts`（:47 教師登入等待）
- Modify: `tests/e2e/assignments-live.spec.ts`（:35 同構＋assignments 段落退場）
- Modify: `tests/e2e/live-advanced.spec.ts`（過時「一次性班級加入碼」選擇器）

**Interfaces:**

- Consumes: `tests/e2e/helpers/classrooms.ts`（966ba62 修復版 API）
- Produces: Live e2e 電池可全綠的測試端基線（**產品端字串零變更**——`app-shell.tsx:150` 學生導覽=`主要導覽`、`:178` 教師導覽=`教師導覽` 皆為產品現況，不改產品）。

- [ ] **Step 1**: 兩支 spec 中**教師身分登入後**等待 `getByRole('navigation', { name: '主要導覽' })` 的行改等 `教師導覽`（學生登入的等待不動；`learning-experience.spec.ts:55` 經查為學生流程，僅確認不改）。
- [ ] **Step 2**: assignments 功能 0730 已裁定移除且勿復活 → `assignments-live.spec.ts` 的 assignments 流程段落刪除；若整檔僅剩 assignments 則整檔刪除並在 commit message 引用 0730 裁定；可獨立保留的 Live 段落遷入精簡版。
- [ ] **Step 3**: `live-advanced.spec.ts` 過時選擇器段落改用 `helpers/classrooms.ts` 現行 API。
- [ ] **Step 4**: 本機 Supabase＋seed 實跑三支至綠，或把殘餘紅歸因既有產品問題記 ledger；prettier；commit（僅 tests/e2e 檔案）。

```bash
git add tests/e2e/classroom-leaderboard.spec.ts tests/e2e/assignments-live.spec.ts tests/e2e/live-advanced.spec.ts
git commit -m "test(e2e): align stale specs with post-0730 product UI

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Self-Review 紀錄

1. **Spec 覆蓋**：§4.1 調色盤→Task 1 palette.json；§4.2（pixelated/整數倍）→規格節＋各換裝 CSS；§4.5 素材生產→Task 1（spritesheet 暫緩有明文理由；**per-chapter palette swap 首發不做**——現行戰鬥魔物單色無章節 CSS hook，做換色需動 TSX 違反零接觸鐵律，記為未來批）；§5 逐畫面→Task 4–7 對應批②③①④⑤a；教師端＝批⑤b 範圍不碰。歷批 deferred 屬素材批者全數安置：M4 寶箱造型（T4）、煙火 D4 結構修法（T7）、M6 精靈魔物間距（T5 量測）、M5 火把換行（T5 記錄維持）、C1 legend 警戒區（T7 量測）、wall-chip 旗尾邊際（T7 明文不動形狀）。
2. **Placeholder 掃描**：無 TBD/TODO；CSS/Python/命令皆完整。生成 prompt 為首發文案，量產時允許依 owner 回饋微調（記 README），非佔位。
3. **介面一致性**：17 檔名於 File Structure 表、各 Task Files、CSS url() 三處核對一致；pixelize CLI 簽名（Task 2）與 Task 3–7 呼叫相符；`$V/$G/$O/$A` 於 Task 4 Interfaces 定義完整版，Task 5–7 沿用（各 task 開頭重新 export）。
4. **已知風險**：(a) `GEMINI_API_KEY` 未設＝Task 3 硬前置，停下條件已寫；(b) 風格不可控＝兩輪上限＋ADR 退路交 owner；(c) codex 28px 非整數倍→已預裁「background 裁切」方案＋獨立素材備援；(d) wall-chip 織紋對比不合格＝明文撤功能不救版型；(e) google-genai SDK 呼叫細節若與現版不符（inline_data 取法），生成腳本在 scratchpad 修即可，不影響 repo。
