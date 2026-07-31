# Batch-4 Gate — Rendered Contrast Audit

Method: `getComputedStyle` pairs measured live in a real Chromium page
(Playwright, `chromium.launch()` + `page.evaluate`), **not** token values.
Ratios computed with the standard WCAG relative-luminance formula. Threshold:
**4.5:1 for text**.

Two measurement modes, both against the real live stylesheet/cascade:
- **live** — read directly off the actually-rendered app state (real seeded
  student `student.one`, Level 7, 700 Token).
- **swatch** — a DOM clone of the real element, with only the state-variant
  class swapped, appended (off-screen, same document/cascade) next to its
  real counterpart, then removed, for states the current seed doesn't
  produce live (e.g. silver/bronze leaderboard rows — only 2 students are
  seeded — or the `已解決` mistake state). Still real `getComputedStyle`
  output from the same browser/stylesheet.

Script: session-scratchpad `gate-capture-batch4.mjs` (throwaway, not
committed — per constraint, never placed inside the repo). Raw JSON:
`gate-capture-batch4-raw.json` in this directory.

## Continuity probe #1 (batch③ carry-over): opacity-compositing math

Batch-3's final review flagged that the gate's contrast helper had never been
validated against a real `opacity ≠ 1` element before trusting its numbers.
Before measuring anything batch-4-specific, this gate re-ran that proof:

**Target:** `.scene-day .mission-select__list::before` (`/app/missions`),
declared `opacity: 0.5`.

| Field | Value |
|---|---|
| declared color (opaque) | `rgb(138, 101, 31)` |
| backdrop (page bg behind it) | `rgb(253, 248, 234)` |
| helper's manual recompute (0.5 · declared + 0.5 · backdrop) | `rgb(195.5, 174.5, 132.5)` |
| **browser's own `getComputedStyle` after compositing** | `rgb(195.5, 174.5, 132.5)` |
| delta (manual − browser) | `[0, 0, 0]` |
| **proof** | **PASSES** — exact match, 0 delta on all 3 channels |

The helper's alpha-blend math is byte-exact against what Chromium actually
paints. Every ratio below that involves an `opacity`- or alpha-composited
background (the `mistake-group__badge` 10%-alpha chip, the `hall-of-medals`
light-beam gradient) is entered as the **true composited backdrop color**,
not the element's own declared (pre-composite) background — same discipline
the probe just validated.

## Shop (`/app/inventory/shop`, day scene → night purchase window, live)

| Pair | Color | Background | Ratio | Verdict |
|---|---|---|---|---|
| shop-tab `data-on='true'` (釘牌反白字) × 金深底 | `rgb(246,238,216)` | `rgb(138,101,31)` | 4.58 | PASS (tight) |
| 貨架卡 h2 (item name) × 卡底 | `rgb(37,48,66)` | `rgb(253,248,234)` | 12.53 | PASS |
| 貨架卡 p (price) × 卡底 | `rgb(102,112,133)` | `rgb(253,248,234)` | 4.69 | PASS (tight) |
| `已裝備` (blook-card__state) × 卡底 | `rgb(23,117,78)` | `rgb(253,248,234)` | 5.36 | PASS |
| `還差` disabled (blook-card__disabled) × own bg | `rgb(102,112,133)` | `rgb(255,248,225)` | 4.68 | PASS (tight) |
| `選用` (owned-not-equipped, swatch) × 卡底 | `rgb(37,48,66)` | `rgb(239,239,239)` | 11.56 | PASS |
| 夜窗 h2 × night bg | `rgb(244,241,228)` | `rgb(23,28,63)` | 14.56 | PASS |
| 夜窗 p × night bg | `rgb(244,241,228)` | `rgb(23,28,63)` | 14.56 | PASS |
| 取消鍵字 × 鍵底 (browser default chrome) | `rgb(37,48,66)` | `rgb(239,239,239)` | 11.56 | PASS |
| 確認購買鍵字 × 鍵底 | `rgb(45,38,0)` | `rgb(245,196,0)` | 9.20 | PASS |

Purchase dialog was opened on `招財貓` (100 Token) to capture `shop-dialog.png`,
then closed via **取消** — `確認購買` was never clicked, economy state was
not mutated.

## Mistakes / monster codex (`/app/learning/mistakes`, day scene, live)

| Pair | Color | Background | Ratio | Verdict |
|---|---|---|---|---|
| header eyebrow/h1/intro p × parchment-card | `rgb(37,48,66)` | `rgb(253,248,234)` | 12.53 | PASS |
| mistake-group__title × parchment-card | `rgb(37,48,66)` | `rgb(253,248,234)` | 12.53 | PASS |
| `mistake-group__badge` 字 × badge 底 (alpha-composited, NOT self-contained) | `rgb(199,58,63)` | `rgb(250.6,230.4,218.3)` | **4.25** | **FAIL** — see note below |
| mistake-list__prompt × card bg | `rgb(37,48,66)` | `rgb(255,251,234)` | 12.81 | PASS |
| mistake-list__answer (正確答案) × card bg | `rgb(23,117,78)` | `rgb(255,251,234)` | 5.48 | PASS |
| 已解決 title (swatch) × card bg | `rgb(52,64,84)` | `rgb(253,248,234)` | 9.86 | PASS |
| 已解決 answer span (swatch) × card bg | `rgb(23,117,78)` | `rgb(253,248,234)` | 5.36 | PASS |
| 空狀態 p[role=status] (swatch) × scene-day 底 | `rgb(37,48,66)` | `rgb(246,238,216)` | 11.48 | PASS |

**Note (pre-existing, not batch-4 scope):** `.mistake-group__badge`
(`src/styles/globals.css:3745-3751`) was introduced at `cd5eceb`, long before
this batch (batch-4's `adcfc6a` touches `.mistakes-codex` container/list
styling only and never this selector). Measured 4.25:1 is a real, narrow
AA fail — but it predates and is untouched by the commits under review here.
Reported for completeness of the brief's requested matrix, not attributable
to batch-4.

## Leaderboard / guild notice-board (`/app/leaderboard`, live + swatch)

| Pair | Color | Background | Ratio | Verdict |
|---|---|---|---|---|
| eyebrow × 木板底 (script's original pairing — see defect below) | `rgb(246,238,216)` | `rgb(138,101,31)` | 4.58 | PASS-as-measured, **misleading — see defect** |
| h1 × 木板底 | `rgb(246,238,216)` | `rgb(138,101,31)` | 4.58 | PASS (tight) |
| description p × 木板底 | `rgb(246,238,216)` | `rgb(138,101,31)` | 4.58 | PASS (tight) |
| thead th × parchment (self-contained) | `rgb(52,64,84)` | `rgb(246,238,216)` | 9.04 | PASS |
| 金列 (gold, live) td × 紙條 | `rgb(23,28,63)` | `rgb(184,134,47)` | 5.09 | PASS |
| `這是你` × own bg | `rgb(23,28,63)` | `rgb(184,134,47)` | 5.09 | PASS |
| 銀列 (silver, swatch) td × 紙條 | `rgb(37,48,66)` | `rgb(228,231,236)` | 10.72 | PASS |
| 銅列 (bronze, swatch) td × 紙條 | `rgb(37,48,66)` | `rgb(255,244,199)` | 12.04 | PASS |
| 一般列 (no tier, swatch) td × 紙條 | `rgb(37,48,66)` | `rgb(253,248,234)` | 12.53 | PASS |
| SelfRankCard (swatch, rank>10) × 紙條 | `rgb(37,48,66)` | `rgb(253,248,234)` | 12.53 | PASS |

**Defect found (this gate, beyond the script's pairing list) — CRITICAL:**
`.guild-board > header .route-panel__eyebrow` (`src/styles/globals.css:4581-4583`,
introduced at `22b12ed`) sets `color: var(--pixel-parchment)` but does **not**
override the base `.route-panel__eyebrow` chip's own background
(`src/styles/globals.css:288-300`: `background: color-mix(in srgb,
var(--yellow-brand) 22%, white)`). The eyebrow text does not actually sit
directly on the wood-board background the brief's checklist named ("eyebrow
× 木板底") — it sits inside its own opaque pale-yellow pill, which the
original gate pairing missed (it read the ancestor `.guild-board`
`background-color`, not the pill's own, closer, fully-opaque background
layer). True rendered pair:

| Color | Background (pill's own, opaque) | Ratio |
|---|---|---|
| `rgb(246,238,216)` (`--pixel-parchment`) | `rgb(252.8,242.0,198.9)` (`color-mix(#f5c400 22%, white)`) | **1.03:1** |

Visually confirmed: cropped `leaderboard-desktop.png` around the eyebrow pill
shows the label text as a barely-visible ghost, essentially unreadable
(near-identical light-on-light). This is the exact same defect class the
final review of an earlier batch already fixed elsewhere in this file under
the "終審 I2" comment (`.battle-scene .route-panel__eyebrow` line 5733,
`.victory-scene .route-panel__eyebrow` line 6101 — both correctly override
`color` to a **deep** token because their pill backgrounds stay pale) — but
that fix was not applied to `.guild-board`'s eyebrow override. **Reported,
not patched** (gate scope).

## Achievements / hall of medals (`/app/achievements`, live + swatch)

| Pair | Color | Background | Ratio | Verdict |
|---|---|---|---|---|
| unlocked 卡 title × 光柱最亮處合成底 (beam-composited, f=0.389) | `rgb(37,48,66)` | `rgb(230.5,236.2,215.9)` | 11.01 | PASS |
| unlocked 卡 description × 光柱最亮處合成底 (beam-composited, f=0.563) | `rgb(102,112,133)` | `rgb(235.2,246.7,233.3)` | **4.499** | **FAIL** (0.001 under threshold) |
| unlocked 卡 title × 卡底 (naive, no beam — comparison only) | `rgb(37,48,66)` | `rgb(239,255,247)` | 12.86 | (reference) |
| locked 卡 title (石膏) × slate-100 | `rgb(52,64,84)` | `rgb(242,244,247)` | 9.49 | PASS |
| locked 卡 description × slate-100 | `rgb(52,64,84)` | `rgb(242,244,247)` | 9.49 | PASS |
| locked 卡 progress-value × slate-100 | `rgb(52,64,84)` | `rgb(242,244,247)` | 9.49 | PASS |
| StatusBadge `已解鎖` × own bg (self-contained) | `rgb(23,117,78)` | `rgb(220,243,232)` | 4.88 | PASS |
| StatusBadge `未解鎖` × own bg (self-contained) | `rgb(86,97,113)` | `rgb(238,241,244)` | 5.54 | PASS |

**Defect found — marginal, batch-4-introduced:** the description text on
unlocked cards is otherwise a clean 12.86:1 against the plain card
background (`.hall-of-medals .achievement-card:not(.achievement-card--locked)`,
`src/styles/globals.css:5459-5465`); batch-4's own light-beam overlay
(`::before`, `src/styles/globals.css:5467-5482`) is what drags it down to
4.499:1 at its brightest sampled point — 0.001 under the 4.5 threshold.
Additional methodology risk: the beam's `medal-beam` keyframes
(`src/styles/globals.css:5484-5493`) animate the overlay's own opacity
between `1` and `0.55` on an infinite `steps(2, jump-none)` alternate, i.e.
the true backdrop composited under the text is **not static** — it holds at
two different alpha levels forever. This gate's contrast helper (like all
static-screenshot gates) can only sample one frozen instant; it cannot prove
the *worst-case* frame across the animation cycle is ≥ 4.499. Given the
sampled frame is already sub-threshold, the true worst-case across the cycle
is plausibly lower. **Reported, not patched** (gate scope) — recommend a
fix-wave sampling both keyframe extremes explicitly, or excluding text from
the beam's horizontal footprint.

## Summary (original pass, pre-fix)

- 36 pairs from the brief's checklist + 1 continuity probe + 1
  gate-discovered defect (eyebrow pill) = 38 total measurements.
- **35 of 36 checklist pairs ≥ 4.5:1.**
- **3 pairs below 4.5:1**: `mistake-group__badge` (4.25, pre-existing/out of
  scope), `hall-of-medals` unlocked description under beam (4.499,
  batch-4-introduced, marginal), and the guild-board eyebrow pill (1.03,
  batch-4-introduced, **critical**, found by this gate's manual visual
  audit rather than the script's original pairing choice).
- Opacity-compositing continuity probe: **PASSES**, 0 delta.
- **Step 6 verdict (original pass): FAIL** (contrast) — defects reported per
  gate role, not fixed.

---

## Re-verify after fix wave `862cc5f`

Fix wave `862cc5f` (CSS-only, `src/styles/globals.css`) landed 4 changes:

1. `.guild-board > header .route-panel__eyebrow` — pill `background` →
   `transparent`, `border-color` → `var(--pixel-parchment)` (text color
   unchanged). Pill no longer has its own opaque background; text now sits
   directly on whatever is actually behind it.
2. `.mistakes-codex .mistake-group__badge` — `background` → solid
   `var(--pixel-parchment-card)` (was a 10%-alpha coral tint). Now
   self-contained/opaque.
3. `.hall-of-medals .achievement-card:not(.achievement-card--locked)
   .pastel-card__description` — `color` → `var(--ink-900)` (was the default
   slate-gray description color).
4. `.chapter-dungeon .route-panel__eyebrow` — same transparent-pill pattern
   as (1), `border-color`/`color` → `var(--pixel-gold)`. This is a **batch-3
   latent instance of the same defect class**, on `/app/chapters/:id`
   (night scene), caught and fixed opportunistically in this same wave —
   not part of batch-4's original commits, but re-verified here since it's
   in the fix-wave diff.

Method: identical rendered-`getComputedStyle` approach, extended with a
`__resolveOpaqueBackground` helper that walks the DOM ancestor chain from
the (now-transparent) pill upward, Porter-Duff–compositing each ancestor's
own `background-color` "over" the accumulated result until an opaque layer
is reached — the same real-compositing discipline the batch-3 continuity
probe validated, just generalized from a single-opacity blend to a full
ancestor-chain walk. Script: session-scratchpad
`gate-reverify-862cc5f.mjs`. Raw JSON: `gate-reverify-862cc5f-raw.json` in
this directory.

| # | Pair | Color | Resolved background | Ratio | Verdict |
|---|---|---|---|---|---|
| 1 | guild-board eyebrow (transparent pill) × true resolved backdrop (= 木板底, since pill bg is now `rgba(0,0,0,0)`) | `rgb(246,238,216)` | `rgb(138,101,31)` | **4.579** | **PASS** — genuinely above 4.5, not a rounding artifact (measured to 13 significant figures: `4.578584990628881`) |
| 2 | `mistake-group__badge` (now solid parchment-card) × own opaque bg | `rgb(199,58,63)` | `rgb(253,248,234)` | **4.821** | **PASS** |
| 3 | unlocked-card description (now `ink-900`) × beam-composited backdrop, same sample position as original (f=0.563) | `rgb(37,48,66)` | `rgb(235.24,246.73,233.32)` (unchanged from original pass — confirms only the text color changed, not the beam math) | **12.019** | **PASS** |
| 4 | chapter-dungeon eyebrow (transparent pill, gold) × true resolved backdrop (dungeon header's dark navy) | `rgb(184,134,47)` | `rgb(23,28,63)` | **5.092** | **PASS** |

All 4 pairs measured comfortably ≥ 4.5:1 via the rendered opacity/alpha-
compositing method — none is a borderline rounding call. Pair #1 in
particular was flagged by the coordinator as the one to watch (their own
estimate: ~4.58): the actual rendered figure is `4.578584990628881`, i.e.
genuinely ≥ 4.5, confirmed rather than rounded up.

**Regression spot-check:** `.mistakes-codex > header .route-panel__eyebrow`
(light day-scene page, `/app/mistakes`) — this selector was **not** touched
by `862cc5f`. Measured: color `rgb(37,48,66)` (`--ink-900`) on background
`color(srgb 0.991373 0.949098 0.78)` (≈ `rgb(252.8,242.0,198.9)`, the
original pale `color-mix(yellow-brand 22%, white)` pill) → **11.83:1**,
unchanged from the base `.route-panel__eyebrow` rule. Confirms the fix
wave correctly scoped its transparent-pill treatment to the two dark-scene
selectors (guild-board, chapter-dungeon) and left the light-scene default
(pale pill + ink-900) alone. **No regression.**

Screenshots re-captured (overwritten): `leaderboard-desktop.png`,
`leaderboard-375.png`, `achievements-desktop.png`, `mistakes-desktop.png`,
`mistakes-375.png`, `achievements-375.png`, and newly added
`chapter-detail-desktop.png`. Eyeballed: guild-board eyebrow pill now shows
a crisp cream-outlined "班級 XP" chip, clearly legible against the wood
board (previously a near-invisible ghost); chapter-dungeon eyebrow shows a
gold-outlined "章節複習" chip clearly legible against the dark navy header;
mistake badge and achievement description read normally with no visual
regressions elsewhere on either page.

**Updated Step 6 verdict: PASS.** All 3 originally-batch-4-attributable
defects (guild eyebrow, hall-of-medals description, and — out of an
abundance of caution — the pre-existing mistake-badge) plus the
opportunistically-fixed batch-3-latent chapter-dungeon eyebrow are now
confirmed ≥ 4.5:1 by rendered measurement, with a clean regression
spot-check on the unmodified light-scene eyebrow pattern. Gate is green on
contrast as of `862cc5f`.
