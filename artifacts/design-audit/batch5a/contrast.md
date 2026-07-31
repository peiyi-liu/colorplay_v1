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

Batch-5a's own new rules were audited against this premise and contain **no**
positioned-overlay-over-text case: `.camp-fire` and the podium
gems/fireworks (`.podium-gems`, `.podium-fireworks*`) are `aria-hidden`
decorative shapes with no text children; the wall-chip/podium-step
translucent backgrounds are element **own-background** alpha (Porter-Duff
"over" the ancestor's opaque backdrop, not a separate positioned layer above
the text) — that compositing is done below with `__blendOver`, which is the
correct mechanism for that case, distinct from D1's positioned-overlay case.
D1 is recorded here as standing policy for whenever a future batch does
introduce such an overlay (the class of defect batch-4's `medal-beam` gate
finding — see `artifacts/design-audit/batch4/contrast.md`, method note M7 —
first surfaced), not because this batch requires it.

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
its *inputs* (the two new alpha values) differ from what batch-4 measured.

## Join page (`/app/live/join`, live.student.one, before real join)

| Pair | Color | Background | Ratio | Verdict |
|---|---|---|---|---|
| join header eyebrow × night-deep (.live-join own bg) | `rgb(184, 134, 47)` | `rgb(16, 20, 46)` | 5.587 | PASS |
| join header h1 × night-deep (.live-join own bg) | `rgb(244, 241, 228)` | `rgb(16, 20, 46)` | 15.969 | PASS |
| join header intro p × night-deep (.live-join own bg) | `rgb(169, 176, 214)` | `rgb(16, 20, 46)` | 8.496 | PASS |
| join label × 夜窗 (.live-join__form own bg) | `rgb(244, 241, 228)` | `rgb(23, 28, 63)` | 14.556 | PASS |
| join input 字 × input 底 (self-contained, .scene-night input rule) | `rgb(37, 48, 66)` | `rgb(255, 255, 255)` | 13.290 | PASS |
| join alert(role=alert, zod 驗證訊息) × 夜窗 | `rgb(255, 138, 141)` | `rgb(23, 28, 63)` | 7.276 | PASS |

## Session (`/app/live/:id`, screen_only, live.student.one) — synthetic swatches for FeedbackPhase branch (unreachable under default screen_only) + live streak badge + session OptionButton

| Pair | Color | Background | Ratio | Verdict |
|---|---|---|---|---|
| FeedbackPhase 題文 p (:has(+ .live-distribution)) × 夜底 (synthetic, screen_only 模式下不可達) | `rgb(244, 241, 228)` | `rgb(16, 20, 46)` | 15.969 | PASS |
| live-distribution li × 夜底 (synthetic) | `rgb(244, 241, 228)` | `rgb(16, 20, 46)` | 15.969 | PASS |
| live-explanation strong × 夜底 (synthetic, composited — 10% alpha amber tint over night-deep; self-contained pre-existing amber-700 text, first exposed to a dark backdrop by this batch) | `rgb(178, 110, 5)` | `rgb(32.1999945, 29.0000115, 41.8999989)` | 4.032 | **FAIL** |
| live-explanation p × 夜底 (synthetic, composited — same as above) | `rgb(178, 110, 5)` | `rgb(32.1999945, 29.0000115, 41.8999989)` | 4.032 | **FAIL** |
| live-standing-card__rank × 自身淺底 (synthetic) | `rgb(37, 48, 66)` | `rgb(242, 244, 247)` | 12.062 | PASS |
| live-standing-card__score × 自身淺底 (synthetic) | `rgb(37, 48, 66)` | `rgb(242, 244, 247)` | 12.062 | PASS |
| live-standing-card__cheer × 自身淺底 (synthetic) | `rgb(34, 160, 107)` | `rgb(242, 244, 247)` | 3.021 | **FAIL** |
| live-team-scoreboard li × 夜底 (synthetic, team-mode 本場非 team 不可達) | `rgb(244, 241, 228)` | `rgb(16, 20, 46)` | 15.969 | PASS |
| session OptionButton (rose, screen_only shape glyph) × own bg (self-contained, pre-existing ui.css) | `rgb(255, 255, 255)` | `rgb(229, 72, 77)` | 3.914 | **FAIL** |
| session OptionButton (sky, screen_only shape glyph) × own bg (self-contained, pre-existing ui.css) | `rgb(255, 255, 255)` | `rgb(48, 86, 216)` | 6.090 | PASS |
| session OptionButton (amber, screen_only shape glyph) × own bg (self-contained, pre-existing ui.css) | `rgb(24, 33, 47)` | `rgb(108, 143, 248)` | 5.335 | PASS |
| session OptionButton (emerald, screen_only shape glyph) × own bg (self-contained, pre-existing ui.css) | `rgb(255, 255, 255)` | `rgb(34, 160, 107)` | 3.329 | **FAIL** |
| live-streak-badge (連擊 x2) × 夜底 | `rgb(244, 241, 228)` | `rgb(16, 20, 46)` | 15.969 | PASS |

## Presenter (`/teacher/live`, 1920×1080, teacher) — lobby/wall/question/reveal/podium/footer

| Pair | Color | Background | Ratio | Verdict |
|---|---|---|---|---|
| wall-chip 名字「顏梓涵超級無敵彩虹閃電勇…」× own bg (14% white over night-deep, composited) | `rgb(255, 255, 255)` | `rgb(49.46, 52.900000000000006, 75.26)` | 12.051 | PASS |
| wall-chip 名字「live.student…」× own bg (14% white over night-deep, composited) | `rgb(255, 255, 255)` | `rgb(49.46, 52.900000000000006, 75.26)` | 12.051 | PASS |
| presenter bar p (等待室/題號) × night-deep | `rgb(255, 255, 255)` | `rgb(16, 20, 46)` | 18.079 | PASS |
| presenter bar button (音效開啟/已靜音) × own bg (transparent → night-deep) | `rgb(255, 255, 255)` | `rgb(16, 20, 46)` | 18.079 | PASS |
| presenter code (課堂代碼六碼) × night-deep | `rgb(245, 196, 0)` | `rgb(16, 20, 46)` | 11.001 | PASS |
| presenter count (N 位同學已加入) × night-deep | `rgb(255, 255, 255)` | `rgb(16, 20, 46)` | 18.079 | PASS |
| presenter question h2 × night-deep | `rgb(255, 255, 255)` | `rgb(16, 20, 46)` | 18.079 | PASS |
| presenter options li (rose) × own bg (self-contained) | `rgb(255, 255, 255)` | `rgb(229, 72, 77)` | 3.914 | **FAIL** |
| presenter options li (sky) × own bg (self-contained) | `rgb(255, 255, 255)` | `rgb(48, 86, 216)` | 6.090 | PASS |
| presenter options li (amber) × own bg (self-contained) | `rgb(24, 33, 47)` | `rgb(108, 143, 248)` | 5.335 | PASS |
| presenter options li (emerald) × own bg (self-contained) | `rgb(255, 255, 255)` | `rgb(34, 160, 107)` | 3.329 | **FAIL** |
| chart label (correct=true) × night-deep | `rgb(23, 117, 78)` | `rgb(16, 20, 46)` | 3.178 | **FAIL** |
| chart count (correct=true) × night-deep | `rgb(23, 117, 78)` | `rgb(16, 20, 46)` | 3.178 | **FAIL** |
| chart label (correct=false) × night-deep | `rgb(255, 255, 255)` | `rgb(16, 20, 46)` | 18.079 | PASS |
| chart count (correct=false) × night-deep | `rgb(255, 255, 255)` | `rgb(16, 20, 46)` | 18.079 | PASS |
| chart label (correct=false) × night-deep | `rgb(255, 255, 255)` | `rgb(16, 20, 46)` | 18.079 | PASS |
| chart count (correct=false) × night-deep | `rgb(255, 255, 255)` | `rgb(16, 20, 46)` | 18.079 | PASS |
| chart label (correct=false) × night-deep | `rgb(255, 255, 255)` | `rgb(16, 20, 46)` | 18.079 | PASS |
| chart count (correct=false) × night-deep | `rgb(255, 255, 255)` | `rgb(16, 20, 46)` | 18.079 | PASS |
| presenter standings li (Top5) × night-deep | `rgb(255, 255, 255)` | `rgb(16, 20, 46)` | 18.079 | PASS |
| presenter footer primary button (下一題/結算成績) × own bg | `rgb(24, 33, 47)` | `rgb(245, 196, 0)` | 9.849 | PASS |
| podium rank 1 文字「顏梓涵超級無敵彩虹閃」× own bg (12% white over night-deep, composited) | `rgb(255, 255, 255)` | `rgb(44.68, 48.2, 71.08)` | 12.904 | PASS |
| podium rank 1 文字「1498 分」× own bg (12% white over night-deep, composited) | `rgb(255, 255, 255)` | `rgb(44.68, 48.2, 71.08)` | 12.904 | PASS |
| podium rank 2 文字「live.stude」× own bg (12% white over night-deep, composited) | `rgb(255, 255, 255)` | `rgb(44.68, 48.2, 71.08)` | 12.904 | PASS |
| podium rank 2 文字「1494 分」× own bg (12% white over night-deep, composited) | `rgb(255, 255, 255)` | `rgb(44.68, 48.2, 71.08)` | 12.904 | PASS |

## Summary

40 pairs total, 5 sub-4.5:1 (all detailed above with attribution): 4 are
confirmed pre-existing (`git diff 5fe46ef..HEAD` shows their selectors
untouched) and reachable only via synthetic swatch or already accepted
elsewhere in the app; 1 (`.live-explanation`) is a pre-existing translucent
background rule newly exposed to a dark backdrop by this batch, itself only
reachable in a non-default (`questionDisplay !== 'screen_only'`) session.
None are attributable to a *new* color decision made by batch-5a's own
diff — batch-5a's new rules (wall-chip clip-path/border, chart-fill
clip-path, podium-gems, podium-fireworks, camp-fire, and the ink-restoration
rules for question-card/live-standing-card/live-team-scoreboard/streak-badge)
all measure clean.
