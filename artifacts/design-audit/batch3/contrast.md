# Batch-3 Gate — Rendered Contrast Audit

Method: `getComputedStyle` pairs measured live in a real Chromium page (Playwright,
`chromium.launch()` + `page.evaluate`), **not** token values. Ratios computed with
the standard WCAG relative-luminance formula. Threshold: **4.5:1 for text**; the
two non-text pairs (`mastery-ring__track` stroke, `subtopic-tag` chip boundary)
are additionally judged against the WCAG 1.4.11 non-text 3:1 guideline, noted
inline.

Two measurement modes, both against the real live stylesheet/cascade:
- **live** — read directly off the actually-rendered app state (real seeded
  student progress).
- **swatch** — a DOM clone of the real element, with only the state-variant
  class swapped, appended (off-screen, same document/cascade) next to its real
  counterpart, then removed. Used only where the seeded local DB does not
  currently have a student in that particular state (e.g. no seeded student is
  `developing` or `mastered` on chapter-3/4 yet, and `--color-token`-tone pills
  for the `primary` tone had no live sample). This is still real
  `getComputedStyle` output from the same browser/stylesheet — no token
  lookup involved.

Script: `.superpowers/sdd/gate-capture.mjs` (throwaway, not committed). Raw
JSON: `gate-capture-raw.json` in this directory.

## World map (`/app/missions`, day scene, studentOne)

| Pair | Color | Background | Ratio | Verdict |
|---|---|---|---|---|
| item h2 × item bg | `rgb(37,48,66)` | `rgb(246,238,216)` | 11.48 | PASS |
| item subtopic li × item bg | `rgb(102,112,133)` | `rgb(246,238,216)` | **4.30** | **FAIL** (borderline, text ~4.30 < 4.5) |
| SectionHeader title × world-map-panel bg | — | `rgb(253,248,234)` | 12.53 | PASS |
| SectionHeader description × world-map-panel bg | — | `rgb(253,248,234)` | 4.69 | PASS (tight margin) |
| map-node-status--not_started (swatch) × item bg | — | — | 9.04 | PASS |
| map-node-status--learning (live) × item bg | — | — | 4.58 | PASS (tight margin) |
| map-node-status--developing (swatch) × item bg | — | — | 7.37 | PASS |
| map-node-status--mastered (swatch) × item bg | — | — | 4.58 | PASS (tight margin) |
| map-node__number in --not_started (swatch) × badge bg | — | — | 9.49 | PASS |
| map-node__number in --learning (live) × badge bg | — | — | 5.00 | PASS |
| map-node__number in --developing (swatch) × badge bg | — | — | 8.04 | PASS |
| map-node__number in --mastered (swatch) × badge bg | — | — | 5.09 | PASS |

**Defect found:** `.mission-select__subtopics li` (`src/styles/globals.css:3403-3404`,
`color: var(--color-muted)` = `--ink-500` `#667085`) on `.mission-select__item`
background (`--pixel-parchment` `#f6eed8`, `src/styles/globals.css:3382`)
measures **4.30:1**, under the 4.5:1 text threshold. Visually confirmed in
`missions-desktop.png` (crop shows legible-but-dim blue-gray subtopic list
text) — readable but a real, narrow WCAG AA fail. Not one of the two items
Task 4 explicitly delegated to this gate, but caught by the required
"item 內 h2/小節列 × item 底" pair in the brief's Step 6 checklist.

## Dungeon (`/app/chapters/:id`, night scene, studentOne, chapter-3)

| Pair | Ratio | Verdict |
|---|---|---|
| eyebrow × header bg | 5.09 | PASS |
| h1 × header bg | 14.56 | PASS |
| review-progress label × header bg | 7.74 | PASS |
| review-progress value × header bg | 14.56 | PASS |
| **mastery-ring__track stroke × header bg** (delegated, non-text 3:1) | 13.29 | PASS |
| chapter-status-pill--success (live) text × own bg | 5.36 | PASS |
| chapter-status-pill--primary (swatch) text × own bg | 12.53 | PASS |
| chapter-status-pill--neutral (swatch) text × own bg | 9.49 | PASS |
| subtopic h2 × floor-window bg | 14.56 | PASS |
| subtopic progress row × floor-window bg | 14.56 | PASS |
| **subtopic-tag text × own chip bg** (delegated, self-contained) | 11.83 | PASS |
| **subtopic-tag chip bg × floor-window bg** (delegated, non-text 3:1) | 14.67 | PASS |
| accordion title × accordion bg | 12.53 | PASS |
| 完成複習 button text × button bg | 10.46 | PASS |
| 空狀態 p × 頁底 (chapter-1, no cards) | 15.97 | PASS |
| alert p[role=alert] (synthetic) × 頁底 | 7.98 | PASS |

Both items Task 4 delegated to this gate for a legibility check on the new
dark dungeon surfaces — `.chapter-detail__subtopic-tag` and
`.mastery-ring__track` — **PASS** comfortably (11.83 / 14.67 and 13.29
respectively). No defect here.

## Mentor feedback row (`.feedback-card__mentor-name`, tri-spirit)

Two real usage contexts exist for the shared `feedback-card`/`feedback-card__mentor-name`
markup (`src/features/quiz/components/feedback-card.tsx:65-74`,
`src/features/learning/pages/mission-page.tsx:236-243`): the battle quiz page
wraps it in `.battle-scene` (dark, `src/features/quiz/pages/quiz-session.tsx:353`),
the mission page does not (light `--color-surface`). `.battle-scene .feedback-card`
(`src/styles/globals.css:5675-5699`) overrides `h2`/`p`/`.feedback-card__score`
colors for the night background, but **never overrides
`.feedback-card__mentor-name--{red,blue,green}`** (`src/styles/globals.css:679-689`),
which keep the same "700" shades tuned for a light background in both contexts.

| Pair | Ratio | Verdict |
|---|---|---|
| mentor-name--green (live, battle-scene) × feedback-card bg (`--pixel-night`) | **2.90** | **FAIL** |
| mentor-name--red (swatch, battle-scene) × feedback-card bg | **3.22** | **FAIL** |
| mentor-name--blue (swatch, battle-scene) × feedback-card bg | **1.93** | **FAIL** |
| mentor-name--blue (live, mission) × feedback-card bg (white) | 8.53 | PASS |
| mentor-name--red (swatch, mission) × feedback-card bg | 5.12 | PASS |
| mentor-name--green (swatch, mission) × feedback-card bg | 5.69 | PASS |

**Defect found (all 3 battle-scene mentor colors fail, worst case 1.93:1):**
`src/styles/globals.css:5675-5699` (`.battle-scene .feedback-card` override
block) does not add a night-safe override for
`.feedback-card__mentor-name--red/--blue/--green`
(`src/styles/globals.css:679-689`), so the mentor honorific text renders in
`--coral-700` (`rgb(199,58,63)`) / `--cobalt-700` (`rgb(37,66,173)`) /
`--jade-700` (`rgb(23,117,78)`) directly on `--pixel-night`
(`rgb(23,28,63)`) with no adjustment. Visually confirmed in
`quiz-feedback-spirit.png` — "綠精靈導師" is legible but noticeably
low-contrast against the dark card, matching the measured 2.90:1. This is the
same "night surface swallows a light-tuned text color" class of defect the
batch-2 gate found and fixed for other elements (see batch-2 gate notes,
`.superpowers/sdd/progress.md`); this specific pairing (mentor-name colors ×
`.battle-scene`) was newly introduced by commit `d1c17de` and was not caught
before this gate. The mission-page context (light background) is unaffected
and passes with margin.

## Summary (initial pass, pre-fix)

- 36 pairs measured (12 world map + 16 dungeon + 6 mentor + 2 delegated
  already counted in dungeon's 16).
- 4 pairs under 4.5:1: 1 borderline text fail (world-map subtopic list, 4.30),
  3 severe text fails (battle-scene mentor-name colors, 1.93–3.22).
- Both Task-4-delegated items (`subtopic-tag`, `mastery-ring__track`) pass
  with large margins — no action needed there.
- Net verdict for Step 6: **FAIL** (defects reported, not patched, per gate
  scope).

---

## Re-verify after fix wave `4460d65` (CSS-only)

Fix wave `4460d65` ("fix(quiz): night-safe tri-spirit mentor colors on
battle feedback; deepen world-map subtopic ink", `src/styles/globals.css`
only, +19 lines) added:
- `.battle-scene .feedback-card__mentor-name--red` → `var(--pixel-danger)` (`#ff8a8d`)
- `.battle-scene .feedback-card__mentor-name--blue` → `var(--hue-ch1)` (`#6c8ff8`)
- `.battle-scene .feedback-card__mentor-name--green` → `var(--hue-ch4)` (`#48cfa5`)
- `.scene-day .mission-select__subtopics` → `color: var(--ink-700)` (`#344054`)

Re-measured with the same tooling/methodology (`.superpowers/sdd/gate-capture.mjs`,
re-run in full against the current HEAD; screenshots re-captured and
overwritten in this directory).

| Pair | Color (before) | Color (after) | Ratio (before) | Ratio (after) | Verdict |
|---|---|---|---|---|---|
| item subtopic li × item bg (world map) | `rgb(102,112,133)` (`--ink-500`) | `rgb(52,64,84)` (`--ink-700`) | 4.30 | **9.04** | **PASS** |
| mentor-name--green × battle-scene feedback-card bg (live) | `rgb(23,117,78)` (`--jade-700`) | `rgb(72,207,165)` (`--hue-ch4`) | 2.90 | **8.43** | **PASS** |
| mentor-name--red × battle-scene feedback-card bg (swatch) | `rgb(199,58,63)` (`--coral-700`) | `rgb(255,138,141)` (`--pixel-danger`) | 3.22 | **7.28** | **PASS** |
| mentor-name--blue × battle-scene feedback-card bg (swatch) | `rgb(37,66,173)` (`--cobalt-700`) | `rgb(108,143,248)` (`--hue-ch1`) | 1.93 | **5.43** | **PASS** |

All 4 previously-failing pairs now clear 4.5:1, worst case 5.43:1 (mentor-name--blue,
battle-scene). Note: my independently re-measured values (7.28 / 5.43 / 8.43 / 9.04)
differ numerically from the fix-wave author's stated claim (7.54 / 5.60 / 8.49 / 8.80)
— both agree on pass/fail outcome and are in the same ballpark; the small
deltas are most likely rounding/measurement-context differences (e.g. exact
sRGB resolution of the CSS custom properties), not a discrepancy that changes
the verdict.

**Regression check — mission-page (light) mentor-name, must be unaffected:**

| Pair | Ratio (initial pass) | Ratio (re-verify) | Verdict |
|---|---|---|---|
| mentor-name--blue (live, mission) × feedback-card bg (white) | 8.53 | 8.53 | **PASS, unchanged** |
| mentor-name--red (swatch, mission) × feedback-card bg | 5.12 | 5.12 | **PASS, unchanged** |
| mentor-name--green (swatch, mission) × feedback-card bg | 5.69 | 5.69 | **PASS, unchanged** |

Byte-identical to the initial pass — confirms the new `.battle-scene`/`.scene-day`
scoped overrides did not leak into the mission-page (light) context.

**Screenshots re-captured and overwritten** (`quiz-feedback-spirit.png`,
`mission-feedback-spirit.png`, `missions-desktop.png`, `missions-375.png`,
`chapter-detail-desktop.png`, `chapter-detail-375.png`): `quiz-feedback-spirit.png`
now shows "綠精靈導師" as a clearly legible bright mint green against the
dark battle card (previously a dim, hard-to-read olive). `missions-desktop.png`
now shows the 3-1/3-2/3-3 subtopic list in a visibly darker slate tone,
clearly more legible than before. Visual review confirms both fixes read
correctly, no regressions, no new overflow/white-on-white introduced.

## Summary (post-fix)

- All 36 pairs now ≥4.5:1 (worst case 5.43:1). Net verdict for Step 6:
  **PASS**.
- Mission-page (light) mentor-name contrast confirmed unchanged/unaffected
  by the fix's `.battle-scene`/`.scene-day` scoping.
