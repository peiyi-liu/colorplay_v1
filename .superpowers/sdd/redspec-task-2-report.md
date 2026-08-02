# Task 2 report — Red Spec Rewrite

## Outcome

Learning Experience phase gate is green. Product/test commit:
`f3a24e4e4e5e9eb44b29c35f997708f8791c1e03` (`4 files changed, 197
insertions, 31 deletions`). No push or deployment was performed.

## Root cause and minimal product fix

At 1280×720, `#main-content` was a grid with `place-items: center`. Combined
with the landscape fixed-height/overflow rules, the 1659 px result card was
vertically centered inside the 591 px scrollport. Its top started above the
scroll origin, so `返回我的錯題` was clipped behind the HUD and could not be
reached by pointer scrolling; its focus ring was clipped for the same reason.

The minimal fix in `src/styles/globals.css` keeps horizontal centering with
`justify-items: center` and changes vertical alignment to `align-items: safe
center`. Short content remains centered; overflowing content falls back to the
safe start edge and therefore has a reachable scroll origin. No force click,
DOM dispatch, direct-route shortcut, or keyboard-only workaround is used.

## TDD evidence

- RED: the new 1280×720 regression assertion measured the link top at
  `-61.6953125`, above the main scrollport top `75.1875`.
- GREEN: the same flow passed at 1280×720, 812×375, and 375×812. Every viewport
  performed a normal pointer `click()`, reached `/app/mistakes`, and verified
  the empty-mistakes result.
- Contract RED→GREEN: the finalizer contract first rejected the stale
  `request_question_hint` declaration, then required the current
  `teacher_student_progress` denial. Final focused result: 1 file / 5 tests
  passed.

Measured result-link evidence:

- 1280×720: main y=`75.1875..666`, link y=`358.9375..381.9375`, scrollTop
  `225.5`.
- 812×375: main y=`75.1875..321`, link y=`186.4375..209.4375`, scrollTop
  `398`.
- 375×812: document scrolling exposes link y=`394.4375..417.4375` without
  intersecting the bottom HUD y=`758..812`.
- All three: `hitIsLink=true`, `:focus-visible=true`, a nonzero outline is
  present, and the outline-painted rectangle intersects neither `.hud-top`
  nor `.hud-command`.

## Current-flow synchronization

- Review media/cards open their current accordion UI and Chapter 4 is selected
  from lobby page 2.
- The current mistakes badge format (`2 題待補救`) is asserted without
  weakening the badge-class check.
- Classroom enrollment uses the canonical `join_classroom` helper; no deleted
  `/join/:code` route remains in the flow.
- Teacher progress uses the current member-detail route and exact current UI:
  `learning.student 的學習進度`, `100.0%`, and `已精熟`.
- A second teacher receives the current fail-closed message. Its one expected
  `teacher_student_progress` 403 is declared exactly; no other browser failure
  is accepted.
- Reward baselines remain unchanged: the standard run reaches `450 / 500 XP`
  and `150 Token`; remediation reaches `480 / 500 XP` with Tokens unchanged.

## Verification

The latest full phase run used a clean detached validation worktree and a fresh
local Supabase reset:

- Prettier, ESLint, TypeScript, production build: passed.
- Vitest: 118 files / 814 tests passed.
- pgTAP: 47 files / 1070 tests passed; runtime smoke: 3 passed.
- Integration: 12 files / 24 tests passed.
- Headed Chromium Learning Experience gate: 1/1 passed in 22.1 s total.
- Browser health: console errors 0, page errors 0, unexpected failed requests
  0, server errors 0; the declared 403 was observed exactly once.
- Manifest decision: `PASS` for clean validation SHA
  `c3862406a425c1f496eacea9bcdbf6bf6d60a091`.

The repository baseline contained 14 unrelated Prettier failures. They were
formatted only in the disposable validation worktree so the full runner could
continue; none entered the Task 2 commit. On the real task diff, scoped
Prettier, scoped ESLint, `pnpm typecheck`, contract 5/5, and `git diff --check`
all passed.

## Review and boundaries

Independent review initially found two Important test-evidence gaps: only a
trial click was used in two viewports, and overlap measurement covered only the
top HUD. Both were corrected before the final gate: all viewports now use real
clicks and the full focus paint is checked against both HUD regions. The final
exact staged diff contained only:

- `scripts/acceptance/finalize-learning-experience.mjs`
- `src/styles/globals.css`
- `tests/contracts/learning-experience-phase-gate.test.ts`
- `tests/e2e/learning-experience.spec.ts`

No Supabase file, fixture, package file, question-content WIP, login WIP, or
seed WIP was edited or committed. Remaining risk is limited to the baseline
repository-wide formatting debt noted above; the affected Task 2 files
themselves are formatted and fully gated.
