# Batch-5a Gate — Rendered Contrast Audit

Method: `getComputedStyle` pairs measured live in a real Chromium page
(Playwright, `chromium.launch()` + `page.evaluate`), **not** token values.
Ratios computed with the standard WCAG relative-luminance formula. Threshold:
**4.5:1 for text**.

Two measurement modes, both against the real live stylesheet/cascade:

- **live** — read directly off the actually-rendered app state, driven
  through a real join → lobby → question → reveal → podium live session
  (teacher `live.host.teacher` + two students `live.student.one`/`.two`),
  same helper functions (`tests/e2e/helpers/{auth,classrooms,live}.ts`) the
  official `live-smoke.spec.ts` uses.
- **synthetic** — a DOM clone of the real JSX markup (verified against
  source, not guessed), appended (in-page, same cascade) directly under the
  real `.live-guild-raid` container for states this batch's own default
  session config cannot reach live: the session is solo/non-team and
  `questionDisplay: 'screen_only'` (classroom default), so
  `participantView()` (`src/features/live/lib/live-phase-view.ts`) always
  resolves `question_feedback` to `'screen-only-result'`
  (`FullscreenResult`) rather than `'reveal'` — meaning `FeedbackPhase`'s
  `.live-distribution`, `.live-explanation`, `.live-standing-card` never
  mount live under these conditions, and `LiveTeamScoreboard` returns `null`
  whenever `state.mode !== 'team'`. Removed immediately after measurement.

Script: session-scratchpad `gate-capture-batch5a.mjs` (throwaway, not
committed — per constraint, never placed inside the repo). Raw JSON:
`gate-capture-batch5a-raw.json` in this directory.

## Methodology premises (carried forward from batch-4's continuity notes,

now written as unconditional policy per this gate's brief)

**D1 — positioned overlays paint above in-flow text, unconditionally.** A
positioned element (`position: absolute/relative/fixed/sticky`) with
`z-index: auto` participates in the stacking order at its parent stacking
context's level and, per CSS2.1 Appendix E step 8, in-flow, non-positioned
descendants of the same context paint **before** (i.e. underneath) any
positioned box that follows them in the stacking order — this is not
browser-dependent or "usually true", it is the specified paint order. Any
future gate on this codebase that meets a positioned decorative layer
(overlay, glow, beam) sitting near text **must** treat that layer as
painting **over** the text, not merely as a backdrop behind it, and:

1. sample **both** keyframe extremes of any animated opacity on that layer
   (not one arbitrary instant), and
2. composite the layer **over the text's own rendered color** as well as
   into the background (Porter-Duff "over" in both directions), reporting
   the **worse** (lower) of the two resulting ratios.

**終審 I3 修正:** 上一版這裡寫「decorative shapes with no text children」
作為 D1 不適用的理由——這個測試本身就用錯了。D1 講的是「positioned 圖層蓋在
*手足或祖先*的 in-flow 文字上面」,重點是它跟哪些其他元素共用同一個
stacking context、視覺上疊到誰頭上,跟這個圖層自己有沒有文字子節點無關(一個
沒有文字子節點的裝飾層,一樣可能疊在別的元素的文字上)。正確作法是逐一記錄
每個 positioned 裝飾層在受稽核 viewport 下實際疊到了哪些文字框(或證明它一個
都沒疊到)——「測它有沒有文字子節點」什麼都證明不了。`.podium-fireworks` 正是
這樣的一層(`position: absolute`,`z-index: auto`,原本錨在 `.live-presenter__
podium-stage`);I2 改錨點與偏移量後,它與 podium 文字框(rank/name/score)的
疊合已重新檢查——兩顆星火均落在 podium 列上緣以上(離最上緣分別約 25px、
41px),與任一文字框的 bounding box 皆無交集(見本檔 I2 重驗章節)。`.camp-fire`
維持不動,未在此次修正範圍內,亦未重新檢查。

**D2 — gradient-backed pairs are sampled at the gradient's darkest
(lowest-lightness) stop/face**, i.e. the most pessimistic point along the
gradient, not the average or the lightest end. No rule touched by batch-5a
paints text over a CSS `linear-gradient`/`radial-gradient` background — all
of this batch's backgrounds are flat tokens (`--pixel-night`,
`--pixel-night-deep`, solid `--rose-500`/`--sky-500`/`--amber-500`/
`--emerald-600`/`--emerald-700`) or translucent flat-color overlays
(`rgb(255 255 255 / 12–14%)`), so D2 has no applicable target this batch.
Recorded as standing policy for the next batch that does introduce a
gradient face.

## Continuity: opacity/alpha-compositing helper

The `__blendOver` (Porter-Duff "over", alpha-carrying top color composited
onto an opaque backdrop) helper is verbatim from batch-4, where it was
proven byte-exact against Chromium's own rendering (0 delta across all 3
channels — see `artifacts/design-audit/batch4/contrast.md`, "Continuity
probe #1"). This gate reuses it unmodified for the wall-chip
(`rgb(255 255 255 / 14%)` own background) and podium-step
(`rgb(255 255 255 / 12%)` own background) translucent fills, both composited
over the resolved `.live-presenter` backdrop (`--pixel-night-deep`). No new
probe was re-run this batch since the mechanism itself is unchanged; only
its _inputs_ (the two new alpha values) differ from what batch-4 measured.

## Join page (`/app/live/join`, live.student.one, before real join)

| Pair                                                               | Color                | Background           | Ratio  | Verdict |
| ------------------------------------------------------------------ | -------------------- | -------------------- | ------ | ------- |
| join header eyebrow × night-deep (.live-join own bg)               | `rgb(184, 134, 47)`  | `rgb(16, 20, 46)`    | 5.587  | PASS    |
| join header h1 × night-deep (.live-join own bg)                    | `rgb(244, 241, 228)` | `rgb(16, 20, 46)`    | 15.969 | PASS    |
| join header intro p × night-deep (.live-join own bg)               | `rgb(169, 176, 214)` | `rgb(16, 20, 46)`    | 8.496  | PASS    |
| join label × 夜窗 (.live-join__form own bg)                        | `rgb(244, 241, 228)` | `rgb(23, 28, 63)`    | 14.556 | PASS    |
| join input 字 × input 底 (self-contained, .scene-night input rule) | `rgb(37, 48, 66)`    | `rgb(255, 255, 255)` | 13.290 | PASS    |
| join alert(role=alert, zod 驗證訊息) × 夜窗                        | `rgb(255, 138, 141)` | `rgb(23, 28, 63)`    | 7.276  | PASS    |

## Session (`/app/live/:id`, screen_only, live.student.one) — synthetic swatches for FeedbackPhase branch (unreachable under default screen_only) + live streak badge + session OptionButton

| Pair                                                                                                                                                                                      | Color                | Background                                | Ratio  | Verdict  |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ----------------------------------------- | ------ | -------- |
| FeedbackPhase 題文 p (:has(+ .live-distribution)) × 夜底 (synthetic, screen_only 模式下不可達)                                                                                            | `rgb(244, 241, 228)` | `rgb(16, 20, 46)`                         | 15.969 | PASS     |
| live-distribution li × 夜底 (synthetic)                                                                                                                                                   | `rgb(244, 241, 228)` | `rgb(16, 20, 46)`                         | 15.969 | PASS     |
| live-explanation strong × 夜底 (synthetic, composited — 10% alpha amber tint over night-deep; self-contained pre-existing amber-700 text, first exposed to a dark backdrop by this batch) | `rgb(178, 110, 5)`   | `rgb(32.1999945, 29.0000115, 41.8999989)` | 4.032  | **FAIL** |
| live-explanation p × 夜底 (synthetic, composited — same as above)                                                                                                                         | `rgb(178, 110, 5)`   | `rgb(32.1999945, 29.0000115, 41.8999989)` | 4.032  | **FAIL** |
| live-standing-card__rank × 自身淺底 (synthetic)                                                                                                                                           | `rgb(37, 48, 66)`    | `rgb(242, 244, 247)`                      | 12.062 | PASS     |
| live-standing-card__score × 自身淺底 (synthetic)                                                                                                                                          | `rgb(37, 48, 66)`    | `rgb(242, 244, 247)`                      | 12.062 | PASS     |
| live-standing-card__cheer × 自身淺底 (synthetic)                                                                                                                                          | `rgb(34, 160, 107)`  | `rgb(242, 244, 247)`                      | 3.021  | **FAIL** |
| live-team-scoreboard li × 夜底 (synthetic, team-mode 本場非 team 不可達)                                                                                                                  | `rgb(244, 241, 228)` | `rgb(16, 20, 46)`                         | 15.969 | PASS     |
| session OptionButton (rose, screen_only shape glyph) × own bg (self-contained, pre-existing ui.css)                                                                                       | `rgb(255, 255, 255)` | `rgb(229, 72, 77)`                        | 3.914  | **FAIL** |
| session OptionButton (sky, screen_only shape glyph) × own bg (self-contained, pre-existing ui.css)                                                                                        | `rgb(255, 255, 255)` | `rgb(48, 86, 216)`                        | 6.090  | PASS     |
| session OptionButton (amber, screen_only shape glyph) × own bg (self-contained, pre-existing ui.css)                                                                                      | `rgb(24, 33, 47)`    | `rgb(108, 143, 248)`                      | 5.335  | PASS     |
| session OptionButton (emerald, screen_only shape glyph) × own bg (self-contained, pre-existing ui.css)                                                                                    | `rgb(255, 255, 255)` | `rgb(34, 160, 107)`                       | 3.329  | **FAIL** |
| live-streak-badge (連擊 x2) × 夜底                                                                                                                                                        | `rgb(244, 241, 228)` | `rgb(16, 20, 46)`                         | 15.969 | PASS     |

## Presenter (`/teacher/live`, 1920×1080, teacher) — lobby/wall/question/reveal/podium/footer

| Pair                                                                                        | Color                | Background                              | Ratio  | Verdict  |
| ------------------------------------------------------------------------------------------- | -------------------- | --------------------------------------- | ------ | -------- |
| wall-chip 名字「顏梓涵超級無敵彩虹閃電勇…」× own bg (14% white over night-deep, composited) | `rgb(255, 255, 255)` | `rgb(49.46, 52.900000000000006, 75.26)` | 12.051 | PASS     |
| wall-chip 名字「live.student…」× own bg (14% white over night-deep, composited)             | `rgb(255, 255, 255)` | `rgb(49.46, 52.900000000000006, 75.26)` | 12.051 | PASS     |
| presenter bar p (等待室/題號) × night-deep                                                  | `rgb(255, 255, 255)` | `rgb(16, 20, 46)`                       | 18.079 | PASS     |
| presenter bar button (音效開啟/已靜音) × own bg (transparent → night-deep)                  | `rgb(255, 255, 255)` | `rgb(16, 20, 46)`                       | 18.079 | PASS     |
| presenter code (課堂代碼六碼) × night-deep                                                  | `rgb(245, 196, 0)`   | `rgb(16, 20, 46)`                       | 11.001 | PASS     |
| presenter count (N 位同學已加入) × night-deep                                               | `rgb(255, 255, 255)` | `rgb(16, 20, 46)`                       | 18.079 | PASS     |
| presenter question h2 × night-deep                                                          | `rgb(255, 255, 255)` | `rgb(16, 20, 46)`                       | 18.079 | PASS     |
| presenter options li (rose) × own bg (self-contained)                                       | `rgb(255, 255, 255)` | `rgb(229, 72, 77)`                      | 3.914  | **FAIL** |
| presenter options li (sky) × own bg (self-contained)                                        | `rgb(255, 255, 255)` | `rgb(48, 86, 216)`                      | 6.090  | PASS     |
| presenter options li (amber) × own bg (self-contained)                                      | `rgb(24, 33, 47)`    | `rgb(108, 143, 248)`                    | 5.335  | PASS     |
| presenter options li (emerald) × own bg (self-contained)                                    | `rgb(255, 255, 255)` | `rgb(34, 160, 107)`                     | 3.329  | **FAIL** |
| chart label (correct=true) × night-deep                                                     | `rgb(23, 117, 78)`   | `rgb(16, 20, 46)`                       | 3.178  | **FAIL** |
| chart count (correct=true) × night-deep                                                     | `rgb(23, 117, 78)`   | `rgb(16, 20, 46)`                       | 3.178  | **FAIL** |
| chart label (correct=false) × night-deep                                                    | `rgb(255, 255, 255)` | `rgb(16, 20, 46)`                       | 18.079 | PASS     |
| chart count (correct=false) × night-deep                                                    | `rgb(255, 255, 255)` | `rgb(16, 20, 46)`                       | 18.079 | PASS     |
| chart label (correct=false) × night-deep                                                    | `rgb(255, 255, 255)` | `rgb(16, 20, 46)`                       | 18.079 | PASS     |
| chart count (correct=false) × night-deep                                                    | `rgb(255, 255, 255)` | `rgb(16, 20, 46)`                       | 18.079 | PASS     |
| chart label (correct=false) × night-deep                                                    | `rgb(255, 255, 255)` | `rgb(16, 20, 46)`                       | 18.079 | PASS     |
| chart count (correct=false) × night-deep                                                    | `rgb(255, 255, 255)` | `rgb(16, 20, 46)`                       | 18.079 | PASS     |
| presenter standings li (Top5) × night-deep                                                  | `rgb(255, 255, 255)` | `rgb(16, 20, 46)`                       | 18.079 | PASS     |
| presenter footer primary button (下一題/結算成績) × own bg                                  | `rgb(24, 33, 47)`    | `rgb(245, 196, 0)`                      | 9.849  | PASS     |
| podium rank 1 文字「顏梓涵超級無敵彩虹閃」× own bg (12% white over night-deep, composited)  | `rgb(255, 255, 255)` | `rgb(44.68, 48.2, 71.08)`               | 12.904 | PASS     |
| podium rank 1 文字「1498 分」× own bg (12% white over night-deep, composited)               | `rgb(255, 255, 255)` | `rgb(44.68, 48.2, 71.08)`               | 12.904 | PASS     |
| podium rank 2 文字「live.stude」× own bg (12% white over night-deep, composited)            | `rgb(255, 255, 255)` | `rgb(44.68, 48.2, 71.08)`               | 12.904 | PASS     |
| podium rank 2 文字「1494 分」× own bg (12% white over night-deep, composited)               | `rgb(255, 255, 255)` | `rgb(44.68, 48.2, 71.08)`               | 12.904 | PASS     |

## Summary

40 pairs total, 5 sub-4.5:1 (all detailed above with attribution): 4 are
confirmed pre-existing (`git diff 5fe46ef..HEAD` shows their selectors
untouched) and reachable only via synthetic swatch or already accepted
elsewhere in the app; 1 (`.live-explanation`) is a pre-existing translucent
background rule newly exposed to a dark backdrop by this batch, itself only
reachable in a non-default (`questionDisplay !== 'screen_only'`) session.
None are attributable to a _new_ color decision made by batch-5a's own
diff — batch-5a's new rules (wall-chip clip-path/border, chart-fill
clip-path, podium-gems, podium-fireworks, camp-fire, and the ink-restoration
rules for question-card/live-standing-card/live-team-scoreboard/streak-badge)
all measure clean.

## Re-verify (post-0e91d55)

Fix wave `0e91d55` (`src/styles/globals.css` only, 28 insertions/9 deletions):

1. **`.podium-gems` rebuilt as a single element** — `clip-path: path(...)`
   carrying three independent diamond subpaths (`M24 0 L30 6...`, `M6 4
L12 10...`, `M42 4 L48 10...`) plus a hard-stop `linear-gradient` aligned
   to each subpath's x-range (coral 0-12px, cobalt 18-30px, jade 36-48px).
   Per the commit's own CSS comment, the `::before`/`::after` approach was
   tried first and rejected: a parent's `clip-path` clips its pseudo-element
   children too (verified in-browser via `elementFromPoint`, which hit the
   underlying box, not a gem) — same clipping mechanism this gate's original
   finding identified for the box-shadow approach, just rediscovered via a
   different failed workaround before landing on the single-path fix.
2. **`.live-guild-raid .live-explanation` grounded**: `background:
var(--pixel-parchment-card)` + `color: var(--ink-900)` (author's own
   remeasurement found amber-700 on parchment-card still only 3.86:1, so the
   text color was deepened to ink-900, not just backed with a solid
   ground).

Re-ran the full gate capture (`gate-capture-batch5a.mjs`, unmodified) end to
end against the fixed code — same real 10-question session, same two
students (long-name + normal), same methodology (D1/D2 premises above still
apply unchanged; the `.podium-gems` path-based fix has no opacity/gradient
compositing concern of its own — the gradient is opaque, hard-stop, no
alpha).

### 1. Three-gems verdict: **PASS**

`presenter-podium-1080p.png` (overwritten) and a fresh 8× pixel crop
(`podium-gems-crop-after-0e91d55.png`, contrasted with the pre-fix
`podium-gems-crop-before-0e91d55.png`) both show **three distinct, fully-formed
diamond gems — coral (left), cobalt (center), jade (right)** — in a row
above rank-1's crown. No clipping, no missing gems, no overlap. Confirmed
visually at pixel level, not inferred from CSS alone.

### 2. `.live-explanation` re-measure: **PASS**

| Pair                                                                                                         | Color             | Background           | Ratio      | Verdict  |
| ------------------------------------------------------------------------------------------------------------ | ----------------- | -------------------- | ---------- | -------- |
| live-explanation strong × parchment-card (opaque ground, real backdrop resolved same as round 1 methodology) | `rgb(37, 48, 66)` | `rgb(253, 248, 234)` | **12.525** | **PASS** |
| live-explanation p × parchment-card                                                                          | `rgb(37, 48, 66)` | `rgb(253, 248, 234)` | **12.525** | **PASS** |

Both comfortably clear 4.5:1 (12.525, same ink-900/parchment-card pairing
already proven elsewhere in this batch's own measurements, e.g. the join
input pair). The background is now fully opaque — no alpha compositing
needed for this pair going forward (D1's overlay-compositing concern was
already confirmed inapplicable to this component; that conclusion still
holds since the fix didn't introduce a positioned overlay, only changed the
base background/color declarations).

### 3. Regression check: **no change, no new failures**

| Pair                                                       | Round-1 ratio | Re-verify ratio | Verdict                                |
| ---------------------------------------------------------- | ------------- | --------------- | -------------------------------------- |
| `.live-presenter__option--rose` / `.ui-option--rose`       | 3.914         | 3.914           | unchanged (pre-existing, out of scope) |
| `.live-presenter__option--emerald` / `.ui-option--emerald` | 3.329         | 3.329           | unchanged (pre-existing, out of scope) |
| Reveal chart label/count, correct state                    | 3.178         | 3.178           | unchanged (pre-existing, out of scope) |
| `.live-standing-card__cheer`                               | 3.021         | 3.021           | unchanged (pre-existing, out of scope) |

All four are byte-identical to round 1 — confirms the fix wave (scoped to
`.podium-gems` and `.live-explanation` only) did not touch or perturb any of
these unrelated pre-existing selectors.

**Podium rank/name/score text spot-check:** all four podium text pairs
(rank-1 name, rank-1 score, rank-2 name, rank-2 score) still measure
**12.904** (white text over the 12%-white-over-night-deep composited
own-background) — identical formula/ratio to round 1. Score values differ
slightly (1499/1497 vs round 1's 1498/1494) only because this is a fresh
real session with its own natural scoring variance (speed-based points),
not a regression — the _contrast pair_ (color × background) driving the
ratio is untouched by the gems fix, as expected since `.podium-gems` and the
rank/score `<span>` text are siblings, not nested.

### Updated Step 6 verdict (re-verify): **PASS**

All items this fix wave targeted now measure ≥4.5:1 (12.525 for both
`.live-explanation` pairs) with no regression on the four pre-existing,
out-of-scope sub-4.5 pairs or the podium text. The wall-chip clip-path
finding (PASS, thin margin) and the four pre-existing pairs remain
unchanged and are still reported for completeness, not attributed to
batch-5a.

## Final-review fix wave — C1 / I2 rendered re-verify

Static harness (inlines the real `tokens.css`+`globals.css` post-fix,
reconstructs the real DOM shape verified against
`src/features/live/pages/live-session-page.tsx` and
`src/features/live/components/live-presenter.tsx`; Playwright,
`getBoundingClientRect`/`getComputedStyle`), 1920×1080. Not committed
(session-scratchpad, throwaway, same policy as `gate-capture-batch5a.mjs`).

### C1 — legend straddling the card border

Before the fix, `<legend>` (a direct child of `<fieldset class="question-
card">`) straddles the fieldset's border-top edge by default (native HTML
legend positioning), so its upper half painted on `--pixel-night-deep`
instead of the card's white background. Fix: `.live-guild-raid .question-
card legend { float: left; }` — floating a legend removes it from the
browser's special border-straddling placement and renders it as a normal
in-flow box inside the fieldset's padding box.

Measured post-fix: legend's `getBoundingClientRect()` (top 230.5, bottom
276.0, left 44, right 916) is fully contained within the fieldset's rect
(top 204.5, bottom 420.5, left 18, right 942) — `isInsideCardBox: true`.
`elementFromPoint` at the legend's own midpoint returns the `<legend>`
element itself (no occluding layer). Legend text (`rgb(37, 48, 66)`, ink-900)
× fieldset background (`rgb(255, 255, 255)`) = **13.290:1** — comfortably
over the 4.5:1 floor. **PASS.**

### I2 — podium fireworks anchor

The literal fix text circulated for this finding (`position: relative` on
`.live-presenter__podium`, offsets `top:-28px/-44px`, `left/right:8%`) does
**not** work: the two `.podium-fireworks` spans are DOM **siblings** of
`.live-presenter__podium` (both direct children of `.live-presenter__podium-
stage` — see the JSX at `live-presenter.tsx` line ~437), not its
descendants. A CSS containing block can only be established by an
_ancestor_; `position: relative` on a sibling is a no-op for the spans'
positioning. Measured with that literal fix applied: the fireworks still
landed **~669px** (left) / **~682px** (right) from the podium's bounding
box — materially the same distance as the original bug, just relocated (the
containing block silently fell back to `.live-presenter`, `position:
fixed; inset: 0`, i.e. still full-viewport-sized).

Shipped fix instead keeps `.live-presenter__podium-stage`'s pre-existing
`position: relative` (the actual DOM ancestor of the fireworks spans, so the
real containing block) and recalibrates `.podium-fireworks--left/--right`'s
offsets against the **real measured position of `.live-presenter__podium`
relative to the stage** (podium top 387px / left 543px / right-gap 543px /
width 787px from the stage's own box, at 1920×1080), rather than guessing
percentages of the full-viewport stage:

```css
.podium-fireworks--left {
  top: 359px;
  left: 32%;
}

.podium-fireworks--right {
  top: 343px;
  right: 32%;
  animation-delay: 0.6s;
}
```

Re-measured with this fix: left burst bounding box centered ~(626, 478),
right burst ~(1294, 462); podium bounding box top 504/left 567/right 1353.
Distance from each burst to the podium box: **left ≈ 25.3px**, **right ≈
41.3px** (down from ~669–682px) — both sit just above the podium row's top
edge, left burst over the left third (rank-2's step), right burst over the
right third (near rank-3's step). Overlap check against all six podium text
boxes (rank/name/score × 3 steps): **0 overlaps** for both bursts. Confirmed
visually too (static screenshot, animations frozen at settled state):
both bursts sit in the gap between the "最終頒獎台" heading and the podium
row, clear of all three cards. **PASS** (re-anchored fix, not the literal
text originally circulated — see deviation note above).
