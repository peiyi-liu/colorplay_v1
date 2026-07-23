# Phase 7: ColorPlay Live Advanced

**Baseline:** `f3762f0` (Phase 6 closed; staging redeployed). Worktree clean at plan commit.
**Exit ACs:** `AC-LIVE-012` (capacity/latency profile) plus updated Live regression/security evidence over `AC-LIVE-001`–`011` behaviors touched by the new features.
**Authoritative sources:** spec/10 §Phase 7 (pause/resume, real-time distributions, reusable/scheduled activities, reports, team mode, streak visuals, reduced motion, approved capacity/latency profile; first-party only), spec/05 §Live (Phase 7 擴充需核准規格 — pinned by Task 1), acceptance AC-LIVE-012.

## Scope decisions (approved defaults)

- **Pause/resume:** host-only, only from `question_open`. `pause_live_session` stores the remaining time and moves to a new `paused` state (enum value added; runtime-only casts in the same migration); `resume_live_session` recomputes `deadline_at = now() + remaining` and returns to `question_open`. Both bump `state_version` and broadcast. `submit_live_answer` rejects while paused; students see a paused overlay with a frozen timer; refresh recovers via `get_live_session_state`.
- **Team mode:** `create_live_session` gains `p_mode` (`individual` default / `team`) and `p_team_count` (2–4). The server assigns `team_number` on join deterministically (smallest active team, ties to the lowest number). Team totals = sum of member scores, included in feedback/completed payloads and shown as a team scoreboard; individual scoring, XP/Token ledger, and ranks stay exactly as Live Core (spec/05: same ledger contract, Live not in mastery). No client-chosen teams.
- **Real-time distribution:** during `question_open` the host (only) reads per-option answer counts via a host-only RPC, refreshed on each answered-count broadcast; students keep seeing counts only at feedback as today. No correctness flag in the during-open payload beyond what the host console already knows.
- **Reusable/scheduled activities:** activities stay reusable (many sessions per activity). `live_activities` gains nullable `scheduled_for`; a host-only command sets/clears it; the teacher Live page lists upcoming scheduled activities in order and starting one uses the normal session flow. No auto-start — the host must be present.
- **Reports:** host-only `teacher_live_session_detail(p_session_id)` returns per-question rows (position, prompt, answered, correct, correct rate, average response ms) plus the final participant ranking with display names only (no emails). UI: a session report page linked from the finalized host console and the Phase 6 analytics Live table.
- **Streak visuals + reduced motion:** `live_participants.current_streak` is server-maintained (consecutive correct within the session; wrong/timeout resets; remediation-free by construction). The answer receipt returns the streak and the student UI celebrates ≥2 with a badge/animation. Reduced motion honors `prefers-reduced-motion` automatically and adds a server-backed profile toggle (`profiles.reduced_motion`, updated through the existing trusted profile update path — never localStorage); when active, a root `data-reduced-motion` attribute disables the celebration/transition animations.
- **Capacity/latency (AC-LIVE-012):** the gate runs the seeded profile (one host, two active students, one outsider) across **two full sessions** so answers alone exceed 30 samples; every `submit_live_answer` and both `finalize_live_session` calls are timed client-side, cold-start (first answer after channel join) recorded separately, and a latency report JSON lands in evidence. The finalizer fails unless samples ≥ 30, answer p95 ≤ 800 ms, finalize p95 ≤ 1000 ms, zero lost/duplicate authoritative answers (count asserted against the DB), and outsider access = 0.
- First-party throughout: no Kahoot branding/assets, no external APIs.

## Tasks

### Task 1 — Pin the approved Live Advanced rules (S)

- [x] **Step 1:** Extend spec/05 §Live with the pinned rules above (states incl. `paused`, team assignment/scoring, streak reset semantics, distribution visibility windows, scheduling semantics, report privacy, latency budgets and sample profile). No other spec change.
- [x] **Step 2:** Commit `docs: pin live advanced rules`.

### Task 2 — Pause/resume (M)

- [x] **Step 1:** Failing pgTAP `032_live_pause`: host-only pause from `question_open` (students and teacher B denied; wrong-state pause denied), remaining time frozen (deadline math asserted around the pause window), answers rejected while `paused`, resume restores a future deadline and `question_open`, both transitions bump `state_version` once and broadcast, duplicate pause/resume via stale state → conflict error, refresh recovery payload carries the paused state.
- [x] **Step 2:** RED. **Step 3:** migration `20260720000100_live_pause.sql`. **Step 4:** GREEN + 016–019 regression + lint + typecheck. **Step 5:** Commit `feat: add live pause and resume`.

### Task 3 — Team mode (M)

- [x] **Step 1:** Failing pgTAP `033_live_teams`: mode/team-count validation (2–4, individual default), deterministic round-robin assignment on join, team totals in feedback and completed payloads equal to summed member scores (recomputed independently), individual ledger rows unchanged versus an individual-mode control, final payload team ranking, teams invisible to outsiders.
- [x] **Step 2:** RED. **Step 3:** migration `20260720000200_live_teams.sql`. **Step 4:** GREEN + lint + typecheck. **Step 5:** Commit `feat: add live team mode`.

### Task 4 — Distribution, detail report, scheduling, streaks (M)

- [x] **Step 1:** Failing pgTAP `034_live_insights`: host-only during-open distribution (per-option counts match inserted answers; students/teacher B denied), `teacher_live_session_detail` host-only with per-question aggregates equal to independent recomputation and no email anywhere in the payload, `schedule_live_activity` host-only set/clear with ordering contract, `current_streak` maintained across correct/wrong/timeout sequences and returned in the answer receipt, `profiles.reduced_motion` updatable only by the owner through the trusted path.
- [x] **Step 2:** RED. **Step 3:** migration `20260720000300_live_insights.sql`. **Step 4:** GREEN + full `pnpm test:db` + lint + typecheck. **Step 5:** Commit `feat: add live insights and scheduling`.

### Task 5 — Data layer (M)

- [x] **Step 1:** Failing Vitest: live repository gains pause/resume/distribution/detail/schedule and the streak-bearing answer receipt; profile repository gains the reduced-motion toggle; strict zod, stable error codes; hooks with invalidation and broadcast-driven refresh for the host distribution.
- [x] **Step 2:** RED. **Step 3:** implement + regenerate database types. **Step 4:** GREEN + lint + typecheck. **Step 5:** Commit `feat: add live advanced data layer`.

### Task 6 — UI (L)

- [x] **Step 1:** Failing RTL: host console pause/resume with paused banner and live per-option distribution panel; team scoreboard on host and student feedback/final views; student streak badge with celebration gated by reduced motion (media query + profile toggle on the profile page, `data-reduced-motion` root attribute); teacher Live page scheduling form + upcoming list; session report page (per-question table + ranking) linked from the finalized console and analytics.
- [x] **Step 2:** RED. **Step 3:** implement (lazy route for the report page). **Step 4:** GREEN + lint + typecheck. **Step 5:** Commit `feat: add live advanced ui`.

### Task 7 — Phase gate tooling (M)

- [x] **Step 1:** Contract tests pin `phase:live-advanced` → runner order (reset before the db battery, per the Phase 6 convention) → finalizer (AC id `AC-LIVE-012`, screenshots `live-host-*`, `live-team-*`, `live-report-*`, a `latency-profile.json` evidence file with the sample/percentile gates, declared enumerated 4xx); `test:e2e` grep-invert gains 'Live Advanced phase gate'.
- [x] **Step 2:** RED. **Step 3:** implement runner/finalizer/spec: single spec `Live Advanced phase gate` — host schedules an activity (upcoming list shows it), runs session 1 in team mode with two students (deterministic teams, streak badge after consecutive correct answers, pause mid-question freezes the timer and blocks an answer attempt, resume restores it, host-only distribution while open, outsider channel attempt denied and enumerated, finalize → team ranking + report page numbers equal DB-derived expectations), runs session 2 individual mode back-to-back for the sample budget, collects ≥30 timed answer samples + 2 finalize samples with cold start separated into `latency-profile.json`, asserts DB answer count equals submissions (no loss/duplication), reduced-motion toggle flips the root attribute, three-viewport screenshots, refresh recovery on both roles.
- [x] **Step 4:** GREEN (contract + unit). **Step 5:** Commit `test: add live advanced phase gate`.

### Review and gate

- [x] **Review Step 1:** Complete-range review of `f3762f0..HEAD`. Priorities: pause-window deadline math and answer rejection, team assignment determinism and total integrity, streak reset correctness, host-only surfaces (distribution/detail/schedule), state-version discipline on the new transitions, latency measurement honesty (no mocked clocks), reduced-motion accessibility.
- [x] **Review Step 2:** Fix Critical/Important findings with focused commits.
- [x] **Gate Step 1:** Disposable headless prechecks (evidence in scratchpad, retained on failure); iterate fix→precheck until green.
- [x] **Gate Step 2:** Clean `GATE_SHA`, run `pnpm phase:live-advanced` once per fix iteration.
- [x] **Gate Step 3:** After PASS close Phase 7 in `.superpowers/sdd/progress.md`, redeploy staging (bootstrap + push), and commit `docs: close live advanced phase`. Reservations to record: scheduled sessions never auto-start; capacity beyond the seeded 1+2+1 profile (larger classes) stays a Phase 8 staging validation; the UI restyle still waits for the owner's reference HTML.

## Plan self-review checklist

- Every new state/command respects the Live Core invariants (server-authoritative state_version, private channels, idempotent answers, atomic finalize) — the gate re-drives them through the new paths.
- AC-LIVE-012 maps to a decisive measured artifact (`latency-profile.json`) with finalizer-enforced gates, not prose.
- Team mode changes no economy math; pgTAP 033 proves ledger equality against an individual-mode control.
- All binding conventions from Phases 1–6 are embedded (reset before db battery, dedicated seed accounts, enumerated declared 4xx, closed negative contexts, deterministic anchors, one review, iterative precheck, formal gate per clean SHA, deferred-trigger and column-grant lessons).
