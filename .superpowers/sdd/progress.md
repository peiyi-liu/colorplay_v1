# ColorPlay Platform Foundation SDD Progress

Plan: `docs/superpowers/plans/2026-07-13-colorplay-platform-foundation.md`
Branch: `feat/colorplay-platform-foundation`
Task 1: complete (commits dbbe485..d8f7172, spec PASS, quality Approved, review clean)
Task 2: complete (commits d8f7172..fa5b714, spec compliant, quality Approved, review clean after one fix wave)
Task 3: complete (commit 16beb07, spec compliant, quality Approved, review clean)
Task 4: complete (commit ce4a375, spec compliant, quality Approved)
Task 4 Minor: resolved in Task 6; `tests/e2e/foundation-routes.spec.ts` now uses Playwright fixtures/projects and configured baseURL.
Task 5: complete (commit 64033d6, spec compliant, quality Approved, root visual approval + review clean)
Task 5 residual risk: one moderate dev-only Lighthouse transitive advisory; 0 High/Critical.
Task 6: complete (commits 26746bb, 1922c38, c2f87f8; fully compliant, quality Approved after two confidentiality/retention fix waves; 84 IDs honest, both prior Important findings closed)
Task 7: complete (commit 7237160; compliant, quality Approved; real Supabase 2.109.1 stack/reset, pgTAP 3/3, GoTrue 1/1, sanitized evidence)
Task 8: complete (commits e2b0f63, d7a364f; fully compliant, quality Approved after Ubuntu visual-baseline fix; CI-equivalent Noble Chromium 16/16)
Phase 1A: complete and independently reviewed
Task 9: complete (commit b4558fe; compliant, quality Approved; pgTAP 8/8 plus independent 21-assertion adversarial grant/RLS/trigger probe)
Task 10: complete (commits f3fc7b0, 3874b5b, f477721; compliant, quality Approved after boundary/parser fix waves; 4 real identities, idempotent role reconciliation, stopped-stack unit isolation)
Task 11: complete (commits da281e1, feee6c7; compliant, quality Approved after error/evidence hardening; real Auth lifecycle 4/4, exact sanitized 7-entry network evidence)
Task 12: complete (commit 7863bea; spec compliant, quality Approved in the single M-level review; lint/typecheck/unit 120/120 and real-local headless Auth guard 1/1; no task screenshot evidence generated)
Task 13: complete (commits 0735f57, 19c3be1; single M-level review completed and both findings fixed with TDD; lint/typecheck, focused 17/17, real-local headless login 1/1; no task visual evidence generated)
Task 14: complete (commits 069f84d, d5931b8; single M-level review completed and both Medium findings fixed with TDD; lint/typecheck/focused 9/9, real RLS integration 3/3, pgTAP 12/12, headless profile E2E 3/3; no task visual evidence generated)
Task 15: complete (commits 2596df5, 85eb17f, ec4b351; single M-level review completed and all findings plus fail-closed branch fixed with TDD; lint/typecheck/unit 163/163, real integration 7/7, headless lifecycle/shared-device 6/6; no task visual evidence generated)
Task 16: DEFERRED per `docs/adr/0001-playable-path-reprioritization.md` (heavy Phase 1 acceptance gate + GitHub/Vercel wiring postponed to pre-release; committed harness code 986fa65/35eab65 kept but `pnpm acceptance` not run)
Foundation plan: closed at Task 15.
Playable vertical slice: COMPLETE (commits b1e9e11..3e4a361; all 6 tasks + review; /app = chapter select, quiz runner, results)
Content import: COMPLETE (commits 8b2c0f6, 154fcc7; 45 real questions from teacher spreadsheet via `pnpm content:import`; self-adapting test fixtures; do NOT re-add demo seed questions)
Verification state at 2026-07-14: e2e 47/47, unit 203/203, db 13/13, lint/typecheck green; run e2e via `bash scripts/test-e2e-local.sh`
The former NEXT status above was superseded by the owner-approved specification-alignment design and plan.

## Phase 0 specification alignment

Phase 0 specification alignment: COMPLETE

Plan: `docs/superpowers/plans/2026-07-16-colorplay-specification-alignment.md`
Plan commit: `a0c0ca7`
Task 1: complete (`dd6e1b9`; reproducible document-manifest generator and contract tests)
Task 2: complete (`7e98a2f`; legacy migration decisions and sanitized inventory)
Task 3: complete (`f05c95b`; Local, Staging, Production, and Vercel environment contract)
Task 4: complete (`07abf6d`; routes, feature boundaries, and browser/server trust boundaries)
Task 5: complete (`7b10113`; learning, progress, rewards, assignment, and Live contracts)
Task 6: complete (`7302d78`; governance and Phase 0–8 delivery roadmap)
Task 7: complete (`34467ad`; 38 new criteria, 122 total acceptance IDs, and manifest reconciliation)
Task 8: complete in the closure commit containing this progress record; no product phase is marked complete by this entry.

Closure verification on 2026-07-16: Phase 0 changed-file Prettier check passed against `030a44a`; lint and typecheck passed; Vitest passed 35 files and 207 tests; acceptance metadata reported 122 IDs; document-manifest check, unresolved-marker scan, superseded-plan checks, and `git diff --check` passed. No acceptance suite, database tests, E2E tests, browser evidence, hosted-resource changes, or remote deployment actions were run in Phase 0.

### Existing repository formatting debt

Repository-wide `pnpm format:check` was already red at baseline `030a44a` for these eight Phase 0-unchanged files:

- `docs/content/import-review.md`
- `docs/content/README.md`
- `scripts/content/import-questions.mjs`
- `tests/e2e/login.spec.ts`
- `tests/e2e/quiz-runner.spec.ts`
- `tests/e2e/session-lifecycle.spec.ts`
- `tests/fixtures/content-manifest.generated.ts`
- `tests/fixtures/question-answers.generated.ts`

`git diff --stat 030a44a -- <the eight paths above>` produced no output and exited 0, confirming that Phase 0 did not change them. The `Check formatting` step in `.github/workflows/ci.yml` therefore fails globally in the existing state; Phase 0 did not introduce that failure.

The two `tests/fixtures/*.generated.ts` files are generated by `scripts/content/import-questions.mjs`. Formatting only their checked-in copies will regress on the next `content:import`; the durable correction is to pass generated output through Prettier in the generator. That is M-level Phase 1 prerequisite work and is outside Phase 0. The owner separately authorized an S-level, post-review formatting-only maintenance commit for the eight files; it is excluded from the Phase 0 review range.

Phase 0 review: pending one complete-range review after the closure commit.
Status: STOP after the authorized review and formatting-only maintenance commit; do not begin Game Economy v2 without a new project-owner instruction.

## Phase 1 Game Economy v2

Phase 1 Game Economy v2: COMPLETE

Plan: `docs/superpowers/plans/2026-07-16-game-economy-v2.md`
Plan commit: `a6770d1`
Task 1: complete (`56bb3a3`; content import formats generated fixtures through Prettier)
Task 2: complete (`0a361f7`; immutable XP and Token ledgers, wallet cache, and reconciliation)
Task 3: complete (`38d7204`; authoritative quiz-finalize reward transaction)
Task 4: complete (`60378d5`; daily reward decay and level rules)
Task 5: complete (`26317d4`; student economy summary repository and integration)
Task 6: complete (`a1b5547`; six starter Blooks, inventory, purchase, and equip boundaries)
Task 7: complete (`346768f`; student economy and result UI)
Task 8: complete (`6ae6409`; Blook shop and inventory UI)
Task 9: complete (`efb7087`; Game Economy phase gate and evidence finalizer)

Complete-range review: completed against baseline `a6770d1`; findings were corrected in `c51553a`. Database test isolation was hardened in `18cb23c`, and parallel Auth integration sessions were isolated in `0fb723e`.

Four formal gate failures were resolved before the successful fifth run:

1. The first run used global pgTAP row counts that included seeded Auth fixtures. Commit `18cb23c` scoped assertions to test-owned UUIDs without weakening expected behavior.
2. The second run exposed parallel integration tests calling global sign-out against shared users. Commit `0fb723e` added dedicated Auth lifecycle fixtures and local-only cleanup where sign-out itself was not the behavior under test.
3. The third run exposed a foundation aggregate-view inconsistency: the original `submit_quiz_answer` never updated stored session aggregates, so the in-progress view returned zero after valid answers. Commit `c3ebd8d` added the authoritative live aggregate view while preserving finalize-time stored values; `35e01e8` kept pre-checks outside the evidence pipeline, and `2cd9c37`/`d74eb43` corrected strict E2E locator ambiguity found during pre-check.
4. The fourth run applied text regexes directly to compressed WebM bytes and reported an eight-character binary false positive that did not match a test identity. Commit `abd2e7a` validates PNG/WebM magic bytes, scans container metadata rather than compressed payload bytes, and preserves all sensitive-string checks for text evidence and textual trace entries.

Phase gate PASS on 2026-07-16 at clean SHA `abd2e7aab022b74879ffe868656c137030df20d0`: Prettier, lint, typecheck, 43 Vitest files/286 tests, production build, 184 pgTAP assertions, 7 integration files/18 tests, and the headed Chromium Game Economy flow all passed. The known 667.69 kB main-chunk warning remains non-blocking and is assigned to later route-level code splitting.

Manifest: `artifacts/acceptance/game-economy-v2-abd2e7aab022b74879ffe868656c137030df20d0/manifest.json` (`decision: PASS`; `AC-GAME-001`–`AC-GAME-007`, `AC-SEC-001`, and `AC-SEC-002`).

Status: STOP after Phase 1 closure; do not begin Phase 2 without a new project-owner instruction.

## Phase 2 Achievements

Phase 2 Achievements: COMPLETE

Plan: `docs/superpowers/plans/2026-07-16-achievements.md`
Plan commit: `bf7b0df`
Task 1: complete (`acfaa64`; versioned achievement catalog, nine badge-only definitions, RLS, and four truthful catalog-only entries)
Task 2: complete (`c59d2bb`; trusted server-side achievement progress derivation)
Task 3: complete (`ffc8499`; transactional, replay-safe unlocks from quiz finalize and economy events)
Task 4: complete (`201db00`; privacy-safe achievement catalog repository and real-local integration)
Task 5: complete (`8000e8f`; TanStack Query achievement catalog boundary)
Task 6: complete (`bfd6b88`; student badge route and responsive UI)
Task 7: complete (`0b64055`; shared evidence policy and Achievements phase gate)

Complete-range review covered `c81d870..0b64055`. Important findings were corrected in `f72a670`: PostgreSQL UTC `+00:00` timestamps are accepted without accepting non-UTC offsets; evidence paths are containment-checked before reads; required binary evidence enforces its expected extension; and the generic E2E command excludes the acceptance-only Achievements gate. The reviewed clean SHA was `f72a67004f0597eb7d90fcb4f2c1c85fd3f14bf0`.

The first formal gate reached the headed Achievements flow but exposed an E2E synchronization race: the test could read the previous prompt immediately after clicking `我理解了，下一題`. Owner-approved S-level commit `f53b67c` waits for `第 N / 10 題` before reading each prompt. Its focused verification passed 49 contract assertions and one headless acceptance-mode Chromium run using disposable evidence outside `artifacts/acceptance/`; the failed `achievements-f72a6700*` evidence was deleted.

The second formal gate passed on 2026-07-17 at clean SHA `f53b67c11a7d444d4f12b97f85eeed6d87c31373`: Prettier, lint, typecheck, 49 Vitest files/345 tests, production build, 11 database files/300 pgTAP assertions, the isolated runtime smoke 3/3, 8 integration files/19 tests, Auth seed, and the headed Chromium Achievements flow all passed. The known 667.90 kB main-chunk warning remains non-blocking and is assigned to later route-level code splitting.

Manifest: `artifacts/acceptance/achievements-f53b67c11a7d444d4f12b97f85eeed6d87c31373/manifest.json` (`decision: PASS`; `AC-ACH-001`–`AC-ACH-005`).

The four catalog-only dependencies remain truthful `not_started` entries until their owning phases exist:

- `mistakes_resolved_10` depends on the future remediation and mistake-resolution phase.
- `chapter_mastered_1` depends on the future mastery phase.
- `all_chapters_mastered` depends on the future mastery phase.
- `live_complete_5` depends on the future Live phase.

Forward note: `completed_task_count` and `correct_streak` currently derive from all completed quiz sessions. When later phases add assignment/remediation session purposes and Live answers, those derivations must be revisited with a `rule_version` bump so remediation attempts never count.

Status: STOP after Phase 2 closure; do not begin Classroom/Leaderboard, Assignments, Live, remediation, mastery, or any other phase without a new project-owner instruction.

## Phase 3 Classroom and Leaderboard v2

Phase 3 Classroom and Leaderboard v2: COMPLETE

Plan: `docs/superpowers/plans/2026-07-17-classroom-leaderboard-v2.md`
Plan commit: `039a012`
Task 1: complete (`0964058`; isolated classroom tables, column privacy, tenant RLS)
Task 2: complete (`3bcd35c`; trusted create/rotate/join commands and safe projections)
Task 3: complete (`e16f9c1`; authoritative Top 10 plus self leaderboard RPC)
Task 4: complete (`83c1371`; deterministic classroom fixtures and generated types)
Task 5: complete (`afeee04`; classroom repository and query/mutation hooks)
Task 6: complete (`577554f`; privacy-safe leaderboard repository and hook)
Task 7: complete (`3d42f9f`; student join routes with preserved join intent)
Task 8: complete (`5d822e6`; teacher classroom management under `/teacher/classes`)
Task 9: complete (`cf8a25b`; classroom leaderboard page at `/app/leaderboard/:classroomId`)
Task 10: complete (`4881f69`; Phase 3 runner, finalizer, and acceptance E2E)

Complete-range review covered `65d8b70..4881f69`. Two Important findings were corrected in `cb90250`: manual Playwright contexts received an explicit `baseURL`, and the teacher view verifies a single membership row after repeated joins.

Gate history (each failure produced one focused, owner-authorized fix; no assertion was weakened):

- Precheck 1 failed: URL parsed before teacher navigation completed; `ebe21d9` waits for the `/teacher/classes/<UUID>` route.
- Precheck 2 failed: browser health treated the intentional stale-join-code 400 and navigation-cancelled background queries as defects; `24549ca` adds declared expected browser failures (enumerated 4xx only, each must be observed exactly) and settles queries before navigation.
- Precheck 3 failed: the owner's one-declaration constraint conflicted with required outsider/Teacher B denials; `4763cc9` enumerates all three denial declarations (`join_classroom` 400, `get_classroom_leaderboard` 403, `list_owned_classroom_members` 403).
- Formal gate 1 failed at Auth seed: PostgREST schema cache raced the post-reset seed (HTTP 503, ~9 s reconnect); `5ccc8ff` adds the shared bounded readiness probe `scripts/supabase/wait-for-postgrest.sh`, and every future runner must order reset → probe → seed.
- Formal gate 2 failed in the integration suite: economy and inventory integration tests shared `studentOne`, so a parallel real quiz plus Blook purchase (750 XP / 150 Token) raced the economy test's exact zero assertions; `ceb0f23` gives both files dedicated seed accounts (`economyStudentOne/Two`, `inventoryStudentOne/Two`), verified by two consecutive reset+seed+integration runs (23/23 both).
- Formal gate 3 failed headed-only: 6.2 s after the outsider's declared leaderboard 403, a window visibility change made TanStack Query refetch the errored query and emit a second undeclared 403 (trace network events confirm both came from the outsider page); `a5edd25` closes negative-path browser contexts immediately after their denial assertions while keeping their health recordings for the final strict checks.
- Formal gate 4 passed on 2026-07-17 at clean SHA `a5edd25e55db8300729385a16b911ebe0444c179`: Prettier, lint, typecheck, 63 Vitest files/427 tests, production build, 14 database files/398 pgTAP assertions plus runtime smoke 3/3, 11 integration files/23 tests, PostgREST readiness probe, Auth seed, and the headed Chromium classroom flow (teacher, two students, outsider, Teacher B) all passed with zero unexpected browser-health events and all three declared denials observed exactly once.

Manifest: `artifacts/acceptance/classroom-leaderboard-a5edd25e55db8300729385a16b911ebe0444c179/manifest.json` (`decision: PASS`; `AC-AUTH-005`–`AC-AUTH-007`, `AC-GAME-008`, `AC-GAME-009`).

Conventions added in this phase (binding on later phases):

- Runners order reset → `scripts/supabase/wait-for-postgrest.sh` → seed; never seed against an unprobed PostgREST.
- Any integration test that mutates or asserts exact economy state uses dedicated seed accounts; shared `studentOne/studentTwo` stay reserved for state-tolerant flows.
- Browser negative paths declare each expected 4xx (URL pattern, status, count); declarations must be observed exactly, 5xx is never declarable, and no status-level or global filter exists.
- Negative-path browser contexts close immediately after their denial assertions; idle errored windows refetch on headed visibility changes and emit undeclared denials.

Reservations recorded per the plan:

- Assignments and Live reference `classrooms.id` and call the active-membership predicate in their own phases.
- Leaderboard privacy modes require an additive trusted setting/projection and are not inferred from the browser.
- Analytics receives a separately authorized aggregate interface and never broadens the leaderboard response.
- If a later trusted leave lifecycle creates inactive earning intervals, leaderboard membership-window derivation must be versioned and expanded before such intervals are enabled.
- `AC-PERF-003` staging 30-sample p95, full `AC-UI-001/002`, real-device, and production evidence remain unverified until Phase 8.

The known ~668 kB main-chunk warning remains non-blocking and assigned to later route-level code splitting. Executor note: after Codex quota exhaustion, the owner instructed Claude Code to complete the phase tail (formal gates 2–4, their fixes, and this closure) under the same plan and constraints.

Status: Phase 3 closed; the owner then authorized Claude Code to continue planning and executing the remaining phases ("可以繼續往下規劃，完成這個專案"), with per-phase closure reports.

## Phase 4 Assignments and ColorPlay Live Core

Phase 4 Assignments and ColorPlay Live Core: COMPLETE

Plan: `docs/superpowers/plans/2026-07-17-assignments-live-core.md`
Plan commit: `77242d1` (baseline `dc77049`)
Task 1: complete (`98ab11b`; pinned assignment reward rules and Live scoring `2026-07-live-1`)
Task 2: complete (`2e0ca1d`; assignment tables, targets, attempts, quiz-session purpose column)
Task 3: complete (`5aefeda`; trusted assignment lifecycle commands and finalize derivation)
Task 4: complete (`ca9dfa7`; assignment repository, hooks, and generated types)
Task 5: complete (`48b84f5`; teacher assignment management under the classroom detail)
Task 6: complete (`066c7dc`; student assignment list, detail, attempt flow, result banner)
Task 7: complete (`3f938aa`; live tables, enums, RLS, hidden-answer column privacy)
Task 8: complete (`4276c47`; live activity/session setup commands and question freezing)
Task 9: complete (`250f719`, expectation aligned in `fa9b02a`; live play commands and atomic finalize)
Task 10: complete (`00998fd`; private realtime topic, RLS on `realtime.messages`, in-transaction broadcasts)
Task 11: complete (`900b680`; live repository with pre-feedback reveal-leak rejection, session/commands hooks)
Task 12: complete (`30fcfc2`; join page, player session page, host console)
Task 13: complete (`4ecf41f`; Phase 4 runner, finalizer, contract pins, acceptance E2E)

Complete-range review covered `dc77049..4ecf41f` (three parallel finder angles plus direct verification; 24 candidates, 10 confirmed). All ten were corrected in `cdfb0e0`, including three gate-blocking defects (host answered-count never updated — submits now broadcast the count at the same state version and the session hook patches equal-version progress; the finalizer still carried the Phase 3 grep label; the round-3 reload pressured the 5 s speed-bonus window) and two security findings (participants could pre-read all frozen questions from the lobby — migration `20260717001100` gates participant selects on `opened_at`; a reused `client_request_id` could bind a foreign practice session to an assignment — migration `20260717001200` adds the fresh-session guard). Recorded, not fixed: replace-forward migration duplication (established pattern), a fourth finalizer copy (refactor deferred), per-participant finalize loops, declared-failure array-order coupling, completed-replay `participant_count` drift, and submit broadcasts being outside `019`'s counted window.

Gate history (each failure produced one focused fix; no assertion was weakened):

- Precheck 1 (the spec's first complete run) hung 480 s: the spec clicked a classroom link by the classroom's name, but the classes page names that link 管理班級; fixed in `8014d62`.
- Precheck 2 failed at student join: the spec skipped the host's 開啟等待室 step, so joins were correctly rejected with `LIVE_JOIN_INVALID_CODE` while the session was still `draft`; the spec now opens the lobby (`8014d62`).
- Precheck 3 failed at the host lobby count: joining never broadcast, so lobby views held a stale participant count until the first transition — a real product gap. Migration `20260717001300` broadcasts the active participant count at the unchanged `state_version`, the session hook patches equal-version progress counts in place, and `019` now counts the join broadcast (18 assertions) (`8014d62`).
- Precheck 4 failed the final health check: the post-login navigation aborted the in-flight chapter manifest fetch; sign-in now settles the chapter query before navigating away (`8014d62`).
- Precheck 5 exposed the worst defect: when the duplicate-tab probe clicked a stale 下一題, a landing broadcast had morphed the button in place, so the click fired the swapped 收題並公布答案 with a fresh version and closed round 7 with zero answers. The host action button is now keyed by transition (a stale click dies on the detached node), and the spec races both host tabs' advances concurrently — the compare-and-set admits exactly one, and the conflict alert must appear on exactly one tab, whichever loses (`8014d62`). Precheck 6 then passed headless.
- Formal gate 1 failed at `format:check`: one file drifted during the review wave; formatted in `1886804`.
- Formal gate 2 passed the headed E2E but failed evidence collection: the finalizer required exactly one video while the host context records two pages (console plus duplicate tab); `91e5c51` expects both.
- Formal gate 3 failed headed-only: background tabs stop painting, so the duplicate tab's click never satisfied the animation-frame stability wait and dispatched only after the winner's broadcast had detached the keyed button; both racing clicks now dispatch with `force: true`, validated by a headed disposable precheck before re-running the gate (`f16902b`).
- Formal gate 4 passed on 2026-07-18 at clean SHA `f16902b63b02a4bc29ae2e50584ea9d666a878ce`: Prettier, lint, typecheck, 71 Vitest files/470 tests, production build, 20 database files/610 pgTAP assertions plus runtime smoke 3/3, 13 integration files/25 tests, PostgREST readiness probe, Auth seed, and the headed Chromium flow (teacher assignment lifecycle, student assignment completion through the real quiz runner with reward banner, two 10-round live matches with two students, mid-question reload reconciliation, outsider denial, and the dual-host-tab version-conflict race) all passed. Live latency over 40 answer samples: answer p95 6 ms (≤ 800), finalize p95 11 ms (≤ 1000), zero lost or duplicate answers, zero outsider access; browser health recorded zero unexpected events with both declared 400s (`join_live_session`, `advance_live_session`) observed exactly once.

Manifest: `artifacts/acceptance/assignments-live-f16902b63b02a4bc29ae2e50584ea9d666a878ce/manifest.json` (`decision: PASS`; `AC-ASN-001`–`AC-ASN-006`, `AC-LIVE-001`–`AC-LIVE-012`).

Conventions added in this phase (binding on later phases):

- In-state live progress (answered counts, participant counts) broadcasts at the unchanged `state_version`; clients patch equal-version payloads in place and refetch only on newer versions.
- Trusted commands that admit or progress participants must broadcast anything a live view renders; a view with no broadcast source is a defect, not a polling candidate.
- Action buttons whose meaning changes with server state are keyed by that meaning so stale clicks die instead of retargeting.
- Concurrent-conflict E2E scenarios dispatch racing commands together (forced clicks, background-tab throttling in mind) and assert the outcome invariant (exactly one winner, conflict surfaced on the loser) rather than scripting who loses.

Reservations recorded per the plan:

- Phase 7 advanced Live scope (team modes, power-ups, media questions, pacing analytics) stays deferred.
- The `remediation` quiz-session purpose value is reserved and unused until the remediation phase.
- `AC-LIVE-012` latency figures are local-loop evidence; staging revalidation with real network latency is owed at Phase 8.
- The ~668 kB main-chunk warning remains non-blocking and assigned to later route-level code splitting.
- Live joins during `question_open`/`question_feedback` only re-admit existing participants; first-time admission after the lobby closes is a product decision deferred to Phase 7.
- Concurrent same-version join broadcasts can momentarily deliver a lower participant count; any transition heals it, and lobby-only exposure keeps the risk cosmetic.

Status: Phase 4 closed.

## Phase 5 Learning Experience

Phase 5 Learning Experience: COMPLETE

Plan: `docs/superpowers/plans/2026-07-18-learning-experience.md`
Plan commit: `8f1f791` (baseline `69ac50f`)
Content source: the owner's Google Sheet gained a 複習大廳 tab (2026-07-18 instruction: keep importing from it as it grows).
Task 1: complete (`8954f01`; pinned remediation values 15/10/0 under 2026-07-progress-1 and the review-sheet import format)
Task 3: complete (`039af5e`; review card and media schema, published-chain RLS)
Task 4: complete (`b60d415`; trusted explicit completion, recompletion semantics, completion projection)
Task 5: complete (`c90847a`; tiered hints, sequential trusted serving, hidden content, event freezing)
Task 2: complete (`238a588`; review-card importer with merged-cell carry-forward, hint drafts via import-fixes, explicit seed ordering)
Task 6: complete (`e2d3cb3`; mistake items from formal finalize with open/resolved/reopened lifecycle)
Task 7: complete (`a8b71bd`; remediation sessions frozen from open mistakes, 20% XP, zero Tokens, no quota interaction, originals untouched)
Task 8: complete (`68cf50e`; authoritative coverage/accuracy/mastery projections and the owner-scoped classroom summary)
Task 9: complete (`3c6049a`; learning repository/hooks, chapter detail, review reader with media fallback)
Task 10: complete (`0067a4b`; runner hint panel, mistakes page, remediation banners, rules-version widening)
Task 11: complete (`8b2e144`; progress dashboard, nav entry, teacher classroom progress page)
Task 12: complete (`3a31a21`; runner, finalizer, contract pins, acceptance spec, dedicated learning fixtures, chapter-4 hint drafts)

Execution order note: Tasks 3/4/5 ran before Task 2 because `sql_paths` loads every seed at reset — generated seeds may not precede their schema. Seed loading is now an explicit ordered list, a convention binding on later phases.

Complete-range review of `69ac50f..HEAD` was conducted directly (no finder agents): priorities were formula exactness against design §9 (verified by exact-value pgTAP in 025), version freezing (022/025 old-version exclusion cases), original-score immutability (024 bit-identical assertion), hint leak surface (no student SELECT on `question_hints`, payload key allowlist), RLS on all five new tables, remediation reward integrity (ledger, wallet, quota isolation in 024), and import determinism (identical-UUID re-import test). No blocking findings; the automated scan confirmed every security-definer function pins `search_path` and all six new commands carry revoke/grant pairs.

Gate history:

- Precheck 1 hung 480 s at the first navigation: the spec used the quiz template title 色彩體系與應用 as the chapter title; the chapter is actually named 色彩表示 (`9dcecf0`).
- Precheck 2 failed on a strict-mode violation: the new nav entry 學習進度 collided with the classroom detail's 學習進度 link; the teacher click is now scoped to the 班級成員 region (`fc29b6e`). Precheck 3 passed headless.
- Formal gate passed first run on 2026-07-18 at clean SHA `fc29b6e3d9bddd1183b1c7e2966aa3e1e26d2146`: Prettier, lint, typecheck, 79 Vitest files/503 tests, production build (route-level lazy splitting brought the main chunk from ~668 kB to ~386 kB, retiring the long-standing warning), 25 database files/730 pgTAP assertions plus runtime smoke, 13 integration files/25 tests, PostgREST readiness probe, Auth seed, and the headed Chromium flow all passed. The flow: a dedicated student completes all three review cards (media visible with alt text, draft probe card absent, refresh restores state), plays the deterministic 8-question chapter-4 quiz with tiered hints (levels served in order, the two-level question's third request is the run's only declared 400, hints provably cost nothing: 6 fast correct answers still earn 450 XP/150 Token), collects exactly two deliberate mistakes, resolves both through remediation (+30 XP, Token unchanged, originals untouched), sees server-computed 100%/已精熟 on the dashboard next to a 尚未開始 chapter with em-dash denominators, and joins a freshly created classroom whose owner reads the exact mastery row while another teacher reads zero rows and no email appears anywhere.

Manifest: `artifacts/acceptance/learning-experience-fc29b6e3d9bddd1183b1c7e2966aa3e1e26d2146/manifest.json` (`decision: PASS`; `AC-LEARN-001`–`AC-LEARN-004`, `AC-PROG-001`–`AC-PROG-006`).

Conventions added in this phase (binding on later phases):

- `supabase/config.toml` seed loading is an explicit ordered list; never rely on glob order, and land schema before any seed that references it.
- Deterministic E2E content targets use a chapter whose question count is at or below the template ceiling so every question always appears; hint/mistake fixtures generate prompt-keyed maps for the spec.
- Hint drafts (like explanation drafts) live in `import-fixes.json` as AI drafts flagged for teacher review; the sheet wins once it grows matching columns.

Reservations recorded per the plan:

- Storage-backed review media and teacher upload arrive with Phase 6; the single seeded media row uses a bundled static asset flagged 平台示意圖 in the import report.
- The full teacher analytics suite (question/subtopic/assignment/live views) is Phase 6; this phase shipped exactly the classroom mastery summary proving AC-PROG-006.
- Hint drafts for six questions (3-1-01/06/09, 4-1-02/04/05) and 45 explanation drafts remain pending teacher review; the review-import report lists three incomplete sheet rows (3-2 cards missing titles) for the teacher to finish.
- The owner keeps updating the sheet; re-imports are re-runnable and must preserve the verified 45-question baseline stable codes.

Status: Phase 5 closed. Next: staging setup with the owner (Supabase access token, legacy-project reset authorization, GitHub repo, Vercel), then Phase 6 Teacher Content, Import, and Analytics.

## Phase 6: Teacher Content, Import, and Analytics (2026-07-18)

Plan: `docs/superpowers/plans/2026-07-18-teacher-content.md` (`16c40da`, baseline `53698ab`). Scope pinned in spec/06 (`7f8ea86`): upsert-by-stable-code import semantics (identical→no-op, changed published→new version, draft→in-place, missing→create, never delete), server-side script/handler rejection, and the import report shape.

Task 1: complete (`7f8ea86`; import/versioning rules pinned in spec/06)
Task 2: complete (`b6f0617`; `content_versions` frozen snapshots + append-only `content_publication_events`, teacher-read-only RLS)
Task 3: complete (`8c146ee`; six teacher commands — draft upsert/publish/archive for questions and review cards; publish bumps the version, snapshots the payload, appends an event; an in-flight student session provably stays on its frozen version while v2 publishes)
Task 4: complete (`fc75ae5`; shared validation-rules module + SheetJS XLSX codec with the three spec worksheets; `2e85954` re-ran both importers through the shared rules with byte-identical output)
Task 5: complete (`ac3765b`; `commit_content_import` — teacher-only, request-idempotent, server re-validates every row, all-or-nothing with fault-injection proof that a mid-commit failure writes zero content yet persists the failed report; imported questions land as drafts; the 45-question baseline survives any import)
Task 6: complete (`550ae1a`; five analytics projections over `teacher_answer_facts` with classroom/date/chapter/subtopic filters, Asia/Taipei midnight boundaries asserted on both sides, null-not-zero empty denominators, every number recomputed independently in pgTAP)
Task 7: complete (`d6c9981`; https-only external activity links, owner-managed, members read available rows only)
Task 8: complete (`553d5d4`; teacher-content repository with strict zod and stable error codes; database types regenerated)
Task 9: complete (`ef1992c`; `/teacher` real dashboard with classroom picker, summary cards, worst-subtopic callout, em-dash empty states; `/teacher/analytics` with the four filters driving all five projections; nav entry 教學分析)
Task 10: complete (`a88ab00`; content workspace with status/version badges, question and review-card editors mirroring the shared rules client-side, publish/archive confirm dialogs with version feedback; `da475dc` teacher SELECT on draft options/media with students still published-only)
Task 11: complete (`3d46fea`, `1e213e2`; import wizard — real template download, client parse preview with per-row errors, commit blocked while any error exists, success and failed-commit reports rendered as inert text)
Task 12: complete (`5f3df2a`; runner/finalizer/contract pins and the single `Teacher Content phase gate` spec; dedicated `contentTeacher`/`contentStudent` fixtures)

Review: focused complete-range pass of `53698ab..HEAD` per the tiered flow — zero `dangerouslySetInnerHTML` anywhere, every new command behind `assert_content_teacher` with revoke/grant pairs and pinned `search_path`, import atomicity and baseline preservation carried by pgTAP 028, timezone math by 029. No Critical findings from the read; the prechecks then caught two real defects the rollback-only pgTAP suite could not see:

- The single-choice option triggers are `INITIALLY DEFERRED`, so they fire at COMMIT under the api role, and the internal validator was revoked from `authenticated` — every teacher content write through PostgREST failed 403 while pgTAP stayed green (transactions roll back, deferred triggers never fire). Fixed by making the two trigger functions `security definer` (`fbbfbbf`); 031 now forces `set constraints all immediate` under the api role so the gap stays covered.
- Column grants hide `questions.explanation` and `question_options.is_correct` from api roles (students must never read answers), which also blanked the teacher workspace. The listing moved to a teacher-only `teacher_list_questions()` RPC; students calling it get `CONTENT_TEACHER_ONLY` (`1a629d5`).

Gate history:

- Prechecks 1–8 (headless, evidence in scratchpad): missing seed accounts for the new fixtures; the two defects above; first-publish feedback wrongly reading 內容未變更 (the receipt's `changed` compares semantic payloads only — the UI now treats a draft's first publish as a publication); the summary metric relabelled 完成挑戰次數 (the SQL counts distinct completed sessions; the 3×1-answer pgTAP scenario could not distinguish the two semantics); a leaderboard settle-before-navigate wait (aborted-request health); and exact label matching (`題目` is a substring of the editor form's aria-label). Precheck 9 passed headless in 14.8 s.
- Formal gate run 1 FAILED: `pnpm test:db` ran against content committed by the earlier browser run (the imported question changed chapter 3's template pool, so 022 collided on seeded hints). The runner now resets the database before the db battery — one reset serves both since pgTAP rolls back and the auth seed is idempotent; the order is re-pinned in the contract with this rationale (`a8d09f7`).
- Formal gate run 2 PASS on 2026-07-18 at clean SHA `a8d09f71c9641e91c9c183d47a5754e69fef2d27`: Prettier, lint, typecheck, 87 Vitest files/553 tests, production build, reset, 32 pgTAP files/803 assertions + runtime smoke + 13 integration files/25 tests, PostgREST probe, auth seed, and the headed Chromium flow (23.4 s). The flow: the teacher downloads the real template (saved as evidence and re-read in-test to the three spec sheets), uploads an invalid workbook (正解 X and a script prompt blocked per-row, commit disabled, `window.__xss` undefined), uploads a valid one (preview → commit → server report), the imported question and review card land as drafts invisible to the student until publish, a script-bearing draft attempt is blocked in the browser and a published-code collision is the run's only declared 400, the student answers chapter 4 with one deliberate mistake while the teacher publishes v2 of that very question mid-session (the frozen session finishes on v1), the dashboard reads 1 challenge/1 student/87.5% with a real worst-subtopic callout and survives refresh, question analysis pins the wrong answer at 0.0% under the frozen prompt, a 2020 date range collapses every projection to 此範圍尚無資料/—, teacher B sees neither the classroom nor its numbers, the student bounces off `/teacher/content` to `/unauthorized`, and three-viewport screenshots plus the `.xlsx` artifact finalize the evidence.

Manifest: `artifacts/acceptance/teacher-content-a8d09f71c9641e91c9c183d47a5754e69fef2d27/manifest.json` (`decision: PASS`; `AC-TCH-001`–`AC-TCH-009`, `AC-MIG-003`).

Conventions added in this phase (binding on later phases):

- Deferred constraint triggers execute under the api role at COMMIT: their functions must be `security definer` (or granted), and pgTAP must exercise them with `set constraints all immediate` under `set local role authenticated`.
- Tables with column-level grants cannot back teacher UIs through direct selects; teacher-privileged reads go through teacher-only RPCs.
- Phase gate runners reset the database before `pnpm test:db` whenever the browser flow commits content.

Reservations recorded per the plan:

- Review media stays URL-only (`asset_path` accepts https URLs); Storage upload is future work.
- Content deletion stays out of scope — archive is the only removal, and history/versions are never deleted.
- `content_imports` uses two statuses (`committed`/`failed`); no `uploaded` stage exists because parsing is client-side and only the commit RPC touches the server.
- The whole-UI restyle waits for the owner's reference HTML file; current pages stay on the existing shell styles.
- The import wizard allows re-submitting an already committed workbook; a fresh request id makes it a harmless idempotent no-op by stable code.

Status: Phase 6 closed. Next: Phase 7 (Live advanced) and Phase 8 (production release); staging redeployed with the teacher backend for owner testing.

## Phase 7: ColorPlay Live Advanced (2026-07-18)

Plan: `docs/superpowers/plans/2026-07-18-live-advanced.md` (`d0cdee0`, baseline `f3762f0`). Approved rules pinned in spec/05 §ColorPlay Live Advanced（2026-07-live-2）(`6950934`).

Task 1: complete (`6950934`; paused state machine, team assignment/scoring, streak reset, distribution windows, scheduling, report privacy, latency budgets pinned)
Task 2: complete (`bb5d40c`; host-only pause/resume from `question_open`, frozen remaining window, resumed deadlines exclude the paused gap, answers rejected while paused, state-version discipline, paused refresh recovery; 016 enum contract extended)
Task 3: complete (`0d74e62`; session `mode`/`team_count`, deterministic smallest-team join assignment, `live_team_totals` hidden until feedback, individual ledger proven identical — 750 XP for ten fast correct answers)
Task 4: complete (`4d8bad2`; host-only during-open distribution, post-finalize `teacher_live_session_detail` with per-question aggregates and email-free ranking, `schedule_live_activity`, server-owned `current_streak` maintained by an immediate owner-run trigger on every answer row incl. close-time timeout fills, `profiles.reduced_motion` own-row only)
Task 5: complete (`85d48fa`; live repository pause/resume/distribution/totals/detail/schedule, streak-bearing answer receipts, team-mode session creation, paused-state mapping; profile reduced-motion read/write; types regenerated)
Task 6: complete (`504ebe9`; host pause button + paused banner + live distribution panel, shared team scoreboard on host and student feedback/final views, streak celebration badge, reduced-motion via `prefers-reduced-motion` + server-backed root attribute, scheduling form with an upcoming list, lazy session report page; `5b8f4d6` state payload carries mode/team_count so clients never guess)
Task 7: complete (`faf2c3d`; runner/finalizer/contract with the reset-before-db-battery order and a finalizer-enforced `latency-profile.json`)

Review: focused pass over `f3762f0..HEAD` per the tiered flow. The replace-hazard the review priorities named was real and caught by precheck: the streak rewrite of `submit_live_answer` was based on the pre-hardening body and silently dropped the answered-count broadcast the host console depends on (`75d9f93` history: fixed in `fbbfbbf`-style follow-up `修` commit; 032 now asserts the broadcast survives any future replacement). Remaining precheck fixes were spec-level: the real join-denial message, row-scoped activity actions, controlled-checkbox click semantics, and a wait-for-new-round guard so a stale click never re-answers the previous question (headed-only race).

Gate history:

- Prechecks 1–4 headless (evidence in scratchpad): join message mismatch; integration-test activity rows forcing strict-mode scoping; controlled reduced-motion checkbox; then PASS in 16.4 s (precheck 5).
- Formal run 1 FAILED at `pnpm test`: a legacy answer mock resolving `undefined` became an unhandled rejection once receipts carry streaks (`b1823c7`).
- Formal run 2 FAILED at round 10: the broadcast/refetch race answered a stale question — fixed with the wait-for-new-round guard (`75d9f93`).
- Formal run 3 PASS on 2026-07-18 at clean SHA `75d9f931a572eb082160875e2af2631ea158355f`: Prettier, lint, typecheck, 89 Vitest files/576 tests, production build, reset, 35 pgTAP files/864 assertions + smoke + 13 integration files/25 tests, PostgREST probe, auth seed, headed Chromium flow (19.4 s). The flow: the host schedules the activity (listed as 即將進行, never auto-starting), runs a two-team session with both dedicated students (server-assigned teams), pauses mid-question with both roles surviving reloads on the frozen state, resumes into a restored countdown, watches the host-only live distribution, the outsider join is the run's only declared 400 with zero participant rows, student A's streak badge fires at 連擊 x2, team totals appear only from feedback onward, finalize yields the team scoreboard + report page whose per-question numbers (100.0%/50.0%) and answered-total equal the 20 authoritative submissions, a second individual session completes the sample budget, and the reduced-motion toggle flips the root attribute on and off.

AC-LIVE-012 measured profile (finalizer-enforced): 36 warm answer samples (plus 4 cold-start samples recorded separately), answer p95 63 ms / max 85 ms against the 800 ms budget; finalize p95 77 ms against 1000 ms across 2 sessions; 40 submissions with 0 lost, 0 duplicated, 0 outsider participant rows.

Manifest: `artifacts/acceptance/live-advanced-75d9f931a572eb082160875e2af2631ea158355f/manifest.json` (`decision: PASS`; `AC-LIVE-012`).

Conventions added in this phase (binding on later phases):

- Replacing a trusted command must start from its LATEST definition; every behavior a later migration added (broadcasts especially) needs a pgTAP assertion that survives replacement.
- Realtime-driven multi-page specs wait for the new round/position marker before acting; legend visibility alone is not a settle signal.
- Controlled checkboxes in specs are driven by `click()` with an effect assertion, never `check()`.

Reservations recorded per the plan:

- Scheduled activities never auto-start; the host must open the lobby manually.
- Capacity beyond the seeded 1 host + 2 students + 1 outsider profile (larger classes) stays a Phase 8 staging validation item.
- The whole-UI restyle still waits for the owner's reference HTML.

Status: Phase 7 closed. Next: Phase 8 (Research and Production release); staging redeployed with Live Advanced for owner testing.


## Phase 8-UI GGAME UI Restyle

Phase 8-UI GGAME UI Restyle: COMPLETE

Plan: `docs/superpowers/plans/2026-07-19-ui-restyle.md`
Design: `docs/superpowers/specs/2026-07-18-ui-restyle-design.md`
GATE_SHA: `d60f34e`（manifest: artifacts/acceptance/ui-restyle-d60f34e…/manifest.json；13 commands 0 failed、18 screenshots）
Tasks 0–12＋owner 回饋增補 11a–11e 全數完成（每 task 一 commit，範圍 7a22016..d60f34e）。
Gate 內容：format/lint/typecheck/unit(649)/coverage(ui 100% lines)/build/token-scan/db reset/pgTAP+integration(920+25)/跨 phase e2e 完整電池(47)/headed gate spec(三 viewport＋GGAME 並列參考＋axe 0 serious＋console 0)。

Reservations（gate 報告）:
- PR 百分位與排行榜邊框反映：排行榜 RPC 需補班級人數/邊框欄位。
- 精熟任務不發 XP/Token（spec/05 finalize-only 政策；擴充需另 pin 規格）。
- 全域 branches coverage 71.78%（既有債務；gate 覆蓋門檻依設計限 src/components/ui/）。
- 學號登入為下一 phase（獨立 ADR）。
- AC-UI-010/012 真機證據待人工。

## Phase 9-AUTH：帳號制認證（2026-07-20）

- Owner 以帳號規則文字規格裁定 ADR 0003（Accepted）：真實 Email OTP 認證＋
  註冊頁、帳號（學號）登入走 auth-login Edge Function、教師帳號開發後台建立、
  自助忘記／重設密碼。
- 交付：migration `20260723000100_account_identity`（profiles.full_name/
  login_account＋欄位級 service_role 授權）、Edge Functions auth-login／
  student-register／auth-recover、/register /forgot-password /reset-password
  三頁與 login 改版、create-teacher.mjs、pgTAP 038、auth-account e2e 旅程。
- 驗證（本機）：lint／format／typecheck 綠；unit 106 檔 652 綠；pgTAP 38 檔
  all ok＋integration 25 綠；e2e 完整 battery 48 passed／2 skipped（auth 旅程
  僅 chromium）。commit 9b29000 已推 origin。
- 待人工授權的部署步驟見 docs/staging-runbook.md §4（git push 至 colorplay_v1、
  supabase db push／functions deploy、seed 補值、Dashboard Auth 設定）。

## Owner UI 調整批次（2026-07-21，20 項）

- 全部落地：登入背景暖黃、icon 淡色底、選項淡黃、移除答題提示、答對/答錯/逾時
  色碼、挑戰完成暖黃＋移除獎勵規則文案、側欄 active 跟隨路由、精熟任務答對回饋卡
  ＋重新練習開新 session、購買邊框即裝備、錯題含正確答案（list_my_mistakes RPC＋
  pgTAP 039）、進度表放大＋章節編號、成就徽章 colorplay-new 卡片版、複習卡 GAME(1)
  摺疊式、商店擴充 14 blooks／6 frames、移除個人資料側欄入口、加入碼行距。
- 驗證：lint/format/typecheck 綠；unit 648；test:db exit 0（pgTAP 40 檔＋整合 25）；
  e2e battery 48 passed/2 skipped（shared-device 語意隨個人資料入口遷移更新）；
  visual 基線更新（owner 核准之配色變更）。
- Staging：migrations 至 20260723000300、Vercel c591ef0 部署。
- 回報項：題庫來自教師題庫試算表（import-questions.mjs，45 題發布＋1 題 draft
  fixture）；「洪非比此紅O-O」不存在於題庫，待 owner 提供截圖；大廳與任務實戰共用
  章節題庫（會重複，設計如此）；我的作業（教師指派）≠任務實戰（自主精熟），建議保留。

---

# SDD Progress Ledger — 2026-07-26 full-site-design-refactor
Plan: docs/superpowers/plans/2026-07-26-full-site-design-refactor.md
Branch: feat/design-refactor-full-site
Task 0: fix wave dispatched (reviewer Important×2: helper 抽取、manifest try/finally). Minor backlog for final review: (a) audit fixture classroom 殘留本機 DB side effect（capture-screens ensureAuditClassroomWithMember）。
Task 0: complete (commits 807baa0+93c2fba, spec compliant after 1 fix wave, quality Approved). Minor backlog: (b) teacher-tab-submit-bad 殘餘 4 行選擇器重複（建議 fillLoginForm 原語）; (c) quiz-runner feedback heading 顯式斷言改隱式 wait（可讀性）。
Task 1: complete (commit 3b0823f, quality Approved after controller adjudication——reviewer 兩 Critical 經查核解消：chip.test.tsx 既有且已覆蓋 teacher tone（6d74f77）、Co-Authored-By 尾行實查存在；implementer 報告 RED 標示不實列為報告瑕疵). 
Task 2: complete (commit b1dc53d, spec compliant, quality Approved, review clean——教師紫徽章＋學習進度導覽移除為實際變更，其餘 3 項驗證為既有)
Task 3: complete (commits 625f547+8ae407b, spec compliant, quality Approved after 1 fix wave; ProgressBar tone=primary 偏差裁定為正確修 bug). 法證紀錄: teacher-content.spec.ts:369 `article.chapter-card` 在 main 即斷（UI v2 99a0c9b 改名 lobby-chapter 未同步 spec），乾淨 DB 單跑證實非本分支造成——**指派 Task 5 一併同步該 locator**。implementer 修正的 4 locator 經 controller 直接比對一致。
Task 4: complete (commit c76cb64, spec compliant——「已存在」聲稱全數查證屬實, quality Approved, review clean). Minor backlog: (d) 教師送出鍵 disabled 態變灰的行為變更無測試覆蓋（作者已揭露、reviewer 判良性）。
Task 5: complete (commit ba8dbd2, lobby 逐項核對「既有已符合」抽查屬實, quality Approved, review clean; 額外同步 learning-experience.spec:142 同類舊 locator——scope 擴充已記錄). Minor backlog: (e) globals.css 405-441/927 孤兒 .chapter-card CSS 待清; (f) lobby 第 4 統計欄「持有代幣」為 owner 既有功能、DC 僅 3 欄——保留待 owner 裁量。
Task 6: complete (commit e3c9fc0, spec compliant token-level 驗證, quality Approved, review clean). Minor backlog: (g) .page-card--spacious 在極窄寬不縮 padding 待抽查; (h) 小節列 0 完成仍顯示「已學習」——DC 逐字 vs 語意，待 owner; (i) 既有 .page-card 雙規則技債。**Task 10 注意：lobby-page.tsx:240 仍連 /app/progress，刪路由時一併清**。
Task 7: complete (zero-diff——missionSelect/mission 既有實作已逐項符合 DC，implementer 以 Playwright 逐狀態截圖驗證＋controller 抽查 4 項 token 級屬實；無 commit). Backlog: (j) capture-screens.mjs 對 0.3s fade-in 動畫的時序偽影待 harness 修（Task 14 前）。
Task 8: complete (commit 14065aa, 4 項真實差異修正驗證屬實, quality Approved; Co-Authored-By 尾行 controller 實查存在).
Task 9: complete (commit 526774d, 2 項色彩精度修正驗證屬實, quality Approved, review clean). Minor backlog: (k) frame shop 外框區未做四態（不在 DC 逐字清單）; (l) achievements/frame-shop grid 缺 min(100%,N) 防溢出——併入 Task 14 393 pass 檢查。
Task 10: complete (commits cd5eceb+e47af33, spec compliant, quality Approved; Important 補修=acceptance 閘門對齊批示 #2, contract 5/5 綠). 受影響 AC 編號待 owner 文件更新: AC-PROG-001/002/003/005. Minor backlog: (m) 章節 dash/reload 兩 e2e 斷言失去覆蓋; (n) leaderboard Blook 第 4 欄 vs DC 3 欄——owner 既有功能保留.
Task 11: complete (commit 7819e07, quality Approved; 真實修正: screen_only 選項文字外露 sr-only→visually-hidden＋回歸測試; liveFeedback runner skip 理由查證成立). **Task 12 指派: launchLiveSessionFromTeacherHome 選擇器與 live-smoke.spec 重複——抽至 tests/e2e/helpers/live.ts 供兩者共用**. Backlog: (o) rose token 家族 500/700=coral 而 600 獨立值不一致; (p) 393 截圖實為 463px 寬——Task 14 必查。
Task 12: complete (commit 2207180, quality Approved, review clean, zero findings; live.ts helper 抽取完成、runner 五個教師 Live setup 全補、tHost 底色改用 --surface-host).
Task 13: complete (commit 11b59f8, spec compliant token-exact, quality Approved; tClasses/tClassDetail 重刻、複製鍵含容錯、e2e contract 保留驗證). Minor backlog: (q) clipboard reject 無測試; (r) 2s revert timer 無 cleanup; (s) 複製鍵缺 aria-label=複製加入碼(DC 2093); (t) 班級名稱錯誤訊息移到按鈕後——視覺鄰近性. 
Task 14: complete (commits b297508+f256964+36742be, GATE PASS——736 unit/typecheck/lint/test:db 1063+25/visual 7-7 綠, 393 溢位 6→0, quality Approved). Minor backlog: (u) Linux visual baseline 4 張過期（darwin only 更新）——fast-follow; (v) #main-content grid 修正未 media 隔離（經查安全）; (w) tContent 整頁與 Live 控台次要鍵無 class（DC 規格從未落地）——另立任務。
FINAL REVIEW (fable): READY——零 Critical/Important；獨立重驗 unit 736/736+typecheck+lint 綠；backlog triage 完成（9 項延後 fast-follow、其餘不修/已結案）。
SHIPPED: main merge deb601a pushed 2026-07-26; Vercel production build triggered (dpl_G4t3PxibdiDKju4wqfoWjZp7qvuK).
UAT 0727 batch: shipped (commits f-branch→merge 741dc85). 9 項全數完成；排行榜列色根因=specificity 同級後載覆蓋；join 深連結意圖在固定導向下不再自動恢復（owner 明示「一律」，已記錄取捨）。
UAT R2 batch: shipped (merge 0b974f3, Vercel READY). 排行榜直達僅暱稱＋page-stack 節奏；classrooms 清單頁退場。待 owner 澄清：班級加入碼「可在班級管理查看且固定不改」與現制（一次性顯示＋輪替鍵）不符。
UAT 0728 warm-palette batch: shipped (merge 1b9afc9, Vercel dpl_8bsjicXqWuwqi3Q4cTE2JrLK4Efk READY). 六項全數完成：全站去黑（ink 暖咖啡）＋淡黃紙張＋教師紫→暖橘 #c2410c＋章節低飽和漸層；複習卡預設收合＋圖解 380px；課後實戰小節前綴（subtopicCodes/subtopicRangeLabel）；錯題已解決附答案（correctOptionText 既有欄位）；排行榜標題去班名。darwin visual 基線 7/7 重生（S 級：暖色改版）。無 migration。驗證：736 unit/typecheck/lint 綠＋6 畫面截圖抽查。

## JRPG Pixel P0 (plan: docs/superpowers/plans/2026-07-31-jrpg-pixel-p0-foundation.md, branch feature/v2-major-update)
Task 1: complete (commit c7811b8, spec ✅, quality Approved)
Task 2: complete (commit 88a8fe6, spec ✅, quality Approved)
Task 3: complete (commit 981ceba, spec ✅, quality Approved)
Task 4: complete (commit fdd4a9f, spec ✅, quality Approved; Minor: report line-number claim off, TDD evidence summarized not raw)
Task 5: complete (commit bfca8a6, spec ✅, quality Approved; Minor: report GREEN duration line missing unit)
Task 6: complete (commit 05fd446, spec ✅, quality Approved; Minor: font download referenced mutable main ref, binary committed so build unaffected)
Task 7: complete (gate green after fix 79287db; lint 0 err, typecheck pass, tests 756/756, src/features+src/app diff empty; fix subagent hook-bypass attempt REFUSED, file-level eslint-disable used instead)
Final review (opus): NOT READY -> fix wave 5d175da (F1-F5+OFL+status) -> re-review APPROVED. P0 COMPLETE at 5d175da (10 commits c5343c1..5d175da; lint/typecheck clean, tests 760 incl. new, format:check 6 pre-existing failures unrelated). Deferred to 批次①+: Cubic11 子集化, RpgWindow aria/heading-level, .rpg-window 樣式移 ui.css 議題, CONTEXT.md 章節位置, DOCUMENT_MANIFEST 重生, 6 個既有 format 失敗, design-system 頁面檔逐批遷移.

## JRPG Pixel Batch-1 (plan: docs/superpowers/plans/2026-07-31-jrpg-pixel-batch1-worldset.md)
B1 Task 1: complete (commit 7d87c18, spec ✅, quality Approved)
B1 Task 2: complete (commit 9917f57, spec ✅, quality Approved)
B1 Task 3: complete (commit b0bc833, spec ✅, quality Approved; reset ternary split verified behavior-identical)
B1 Task 4: complete (commit b5ea9ff, spec ✅, quality Approved)
B1 Task 5: complete (gate green 760/760, 8/8 screenshots; heading-contrast defect found and fixed ba1e358, visually confirmed)
Final review (opus): NOT READY (1 Critical night-text contrast + 4 Important) -> fix wave 58c9a7a (8 fixes) -> re-review APPROVED. BATCH-1 COMPLETE at 58c9a7a (7 commits d2b4580..58c9a7a; 760+ tests green; screenshots verified incl. contrast 7.6-8.6:1). Deferred minors: day-scene column seam (#10), portal label 40px (pre-existing #9), reset ternary duplication (#11), scene-class namespacing.

## JRPG Pixel Batch-2 (plan: docs/superpowers/plans/2026-07-31-jrpg-pixel-batch2-battle-loot.md, commit bc6828e)
B2 Task 1: complete (commit 46fefed, spec ✅, quality Approved; Minor: dev-eyeball note (c) not logged in report, header-h1 color redundancy plan-mandated)
B2 Task 2: complete (commit 14f3bab, spec ✅, quality Approved; ⚠️ Co-Authored-By trailer verified by controller; Minor: atb track px 值 plan-mandated)
B2 Task 3: complete (commit f7ece90, spec ✅, quality Approved; Minor: comboCount 排序假設無註記、slash infinite loop plan-mandated; 774/774 全綠; note: task-3-report.md 覆蓋了舊 P0 report,P0 紀錄仍在本 ledger)
B2 Task 4: complete (commits 21e07ba+abe063e, spec ✅, quality Approved after 1 fix wave——controller 查核 ⚠️ 發現 totals p 淺底×白字對比缺陷,fix 改夜空 chip,重審 APPROVED; Minor: count-up 與開蓋未編排 plan-mandated、useCountUp target 變更閃爍理論性)
B2 Task 5: complete (commits 662e849+485b80f, spec ✅, quality Approved after 1 fix wave——Important(plan-mandated) 測試 repo 隔離缺口,fix 補 default stub repos,重審 APPROVED; deviation 核可: DI props 型別 ?: T | undefined 因 exactOptionalPropertyTypes; Minor: fanfare 與補救 role=status 並存 a11y 後續)
B2 Task 6: complete (gate PASS after 2 fix waves——814ec23 回顧卡 ink 恢復＋bef923f 狀態徽章語意色恢復,根因皆為 .scene-night 容器色繼承外溢; 靜態/單元 783/783、hex 0、字串 5/5、quiz-runner e2e chromium+firefox 綠(webkit 既有 flake、全電池 18 個範圍外失敗記錄為 content seed 漂移不追修)、截圖桌機+393 PASS、對比實測全 ≥4.5:1(徽章 5.12–6.09,卡文 12.5+,chips 14.56); 證據 artifacts/design-audit/batch2/)
Final review (opus): With fixes (3 Critical 夜景繼承對比 C1-C3 + 3 Important I1-I3) -> fix wave f2b6c0c+1d2d27e (結構性修法:三個殘留淺色面轉夜窗+scene-night .primary-action 字色+eyebrow gold-deep+成就 fromFinalize 閘門+useCountUp adjust-during-render) -> gate 複驗 PASS (對比 4.72-14.56:1, MapStepper 可辨, 6 截圖無回歸, console 0) -> re-review APPROVED (M2 偏離判正當,未用 eslint-disable)。
BATCH-2 COMPLETE at 1d2d27e (12 commits bc6828e..1d2d27e; 783+ tests green; 證據 artifacts/design-audit/batch2/)。
Deferred minors: M1 victory-banner text-shadow 破 app-shell 扁平不變式(e2e 只走 /login 未紅)、M3 ▶ 塞 36px 圓徽章換行、M4 寶箱幾何造型(素材批換裝)、M5 economy/achievements 查詢可加 enabled、slash infinite loop 慢網路重播、fanfare+補救雙 role=status(a11y 批)。
E2E 現況紀錄: quiz-runner chromium+firefox 綠; webkit 既有 flake; 全電池另 18 個範圍外失敗判為平行 session content seed 漂移未追修——本批 gate 未含全綠 e2e 電池,下批勿當基線。
Owner 0731 裁定: 批②視覺=CSS-first(A); 後續批③-⑤照現有 spec(主題化包裝,不做可行走地圖)。

JRPG Pixel Batch-3 (plan: docs/superpowers/plans/2026-07-31-jrpg-pixel-batch3-map-feedback.md)
B3 Task 1: complete (commit 1aac34f, spec ✅, quality Approved; Minor: variantOrder fallback 死碼、anagram seed 撞色理論性)
B3 Task 2: complete (commit d1c17de, spec ✅, quality Approved; Minor: mission spiritForSeed 三次呼叫 plan-mandated、chapterTitle fallback 分支未測 plan-mandated)
B3 Task 3: complete (commit 299040b, spec ✅, quality Approved; Minor: developing 態無測試(brief 範圍內)、degrade 測試未斷言無 alert(程式碼已核無 alert 路徑))
B3 Task 4: complete (commit 4bd1fcf, spec ✅, quality Approved; Minor: torchStates 雙呼叫 plan-mandated、torch index key plan-mandated; ⚠️ subtopic-tag/mastery-ring 夜底可讀性交 Task 5 gate 實測)
B3 Task 5 (Batch Gate): FAIL on contrast, all else PASS (commits under review 1aac34f..4bd1fcf, base 1d2d27e)。靜態全套綠(lint 0 err/typecheck 綠/vitest 794/794)；raw hex 0＋tokens.css 未動；載重字串 12 組全數前後一致；quiz-runner e2e chromium+firefox 綠，其餘 4 個目標 spec(chapter-select/learning-experience/playable-slice/ui-restyle)紅——以隔離 git worktree 於 base 1d2d27e 重跑同批命令證實逐字相同失敗(非本批 diff 造成;歸因平行 session 內容種子漂移＋learning-experience 需 PLAYWRIGHT_ACCEPTANCE=on 專用 acceptance 跑法＋ui-restyle 舊 locator 早於本批即已過期)；6 張截圖(桌機+375)全數符合(四態节点：2/4 於現有種子可見+其餘經 swatch 對比與 CSS 核可;hero 旗標/樓層窗雙線框/火把列/無溢出/無白底白字皆符合；375 與 quiz-feedback 截圖中出現 skip-link 浮現屬 Playwright fullPage 截圖已知瑕疵,非本批缺陷,已查證 activeElement 非 skip-link 且 CSS 未被本批觸碰)；對比實測 36 組(全部 rendered getComputedStyle,含 swatch 補測未於現有種子出現之狀態/色調)——Task 4 delegate 兩項(subtopic-tag 11.83/14.67、mastery-ring__track 13.29)皆通過；**4 組未達 4.5:1**:世界地圖小節列 4.30(邊界)、戰鬥回饋導師名銜三色於 .battle-scene 夜底分別 2.90/3.22/1.93(嚴重,根因 globals.css:5675-5699 未覆寫 feedback-card__mentor-name 於夜景,d1c17de 新增未覆蓋)——回報不修(gate 範圍),建議另立 fix wave。console 乾淨(0 error/0 pageerror)。證據 artifacts/design-audit/batch3/(含 contrast.md)。
B3 Task 5: complete (gate PASS after 1 fix wave——4460d65 夜戰導師名銜三色轉夜底安全階(--pixel-danger/--hue-ch1/--hue-ch4)+羊皮紙小節列 ink-700,根因=批② .battle-scene .feedback-card 夜窗未被計畫假設覆蓋; 複測 d108cd4: 36 對比全 ≥4.58、mission 淺卡名銜無回歸、6 截圖重拍無回歸; e2e quiz-runner chromium+firefox 綠,4 spec 失敗經 base worktree 對照證明為既有/環境因素非本批; unit 793+/lint/typecheck 綠; raw hex 0; 載重字串計數前後一致; console 0; 證據 artifacts/design-audit/batch3/)
B3 Final review (opus): With fixes (3 Important: I1 .mission-select__item p 基礎規則 4.30:1 description fallback 未修到、I2 map-node--not_started opacity:0.7 合成後編號 ~4.2:1 且 gate 量法量不到、I3 兩檔 prettier 失敗+工作區糾纏風險) -> fix wave 8c634d4(prettier style commit)+675aff3(base p 改 ink-700、刪 opacity、degrade 測試補 no-alert 斷言) -> gate round-2 複測中
B3 Minor triage (終審裁定): fix-now=T3 no-alert 斷言(已入 675aff3); wont-fix=T1 fallback(noUncheckedIndexedAccess 型別義務)、T4 index key(定長裝飾列正確); defer=T1 anagram、T2 三次呼叫、T2 fallback 分支測試、T3 developing 態測試、T4 雙呼叫
B3 Deferred minors (終審新增): M4 航路虛線被 item 遮 90%(z-index/per-item ::before)、M5 火把列換行非行內(素材批前定案)、M6 精靈與魔物剪影過近(素材批)、M7 torchStates 死 export、M8 全精熟時 hero 消失、M9 scene-dungeon 無 min-height、M10 idle 0.15s/拍 偏快(plan nit)、M11 statusLabels re-export 間接層(plan nit)、gate 腳本 opacity 合成教學(批④前)、gold-deep 4.58 無餘裕註記
B3 Final re-review (opus): APPROVED——I1/I2/I3/T3 全數獨立驗證解消;19/19 綠;38 對比 0<4.5(floor 4.58)。
BATCH-3 COMPLETE at 82993ba (10 commits 1aac34f..82993ba; base 1d2d27e)。
B3 continuity notes (批④前): (1) gate opacity 合成 helper 未在 groupOpacity≠1 的配對上驗證過混色數學——批④先拿 0.5 route line 或合成 swatch 打一針; (2) gate-capture.mjs 已移出 repo 至 session scratchpad(/private/tmp/claude-501/-Users-guanyucheng-Desktop-pei-game/3f272b88-7d31-4c33-b819-1575b720f92b/scratchpad/),session 結束會蒸發——批④ gate 如要沿用需先另存(勿放 repo 內 .mjs 以免 eslint 掃到)。

JRPG Pixel Batch-4 (plan: docs/superpowers/plans/2026-07-31-jrpg-pixel-batch4-village.md, base 82993ba)
B4 Task 1: complete (commit 649e889, spec ✅, quality Approved; Minor: shop-keeper 無文字未顯式斷言; 375px/e2e 實跑歸 Task 5 gate)
B4 Task 2: complete (commit adcfc6a, spec ✅, quality Approved; Minor: codex-monster textContent 未顯式斷言(同 T1 同構)、測試自建 harness 非沿用既有 render)
B4 Task 3: complete (commit 22b12ed, spec ✅, quality Approved; Minor: 測試尾行冗餘 plan-mandated、tbody th 死選擇器承襲既有 pattern; 375px 歸 Task 5 gate)
B4 Task 4: complete (commits b2863bd+fd79b30, spec ✅ after 1 fix wave——reviewer 抓到 className 單行破 prettier CI gate(unit/lint/typecheck 測不到), fix=prettier --write, quality Approved, 複審零新發現)
B4 Task 5 (Batch Gate): FAIL on contrast, all else PASS (commits under review 649e889/adcfc6a/22b12ed/b2863bd+fd79b30, base 82993ba)。靜態全套綠(lint 0 err/typecheck 綠/vitest 798/798)；raw hex 0＋tokens.css/tokens.test.ts 未動；載重字串 11 組(shop 6＋mistakes 5)前後計數一致，leaderboard-table.tsx／achievement-card.tsx 零接觸 diff 空白確認；目標 4 spec(game-economy/achievements/learning-experience/classroom-leaderboard)chromium 全紅——以隔離 git worktree 於 base 82993ba 重跑同批命令證實逐字相同失敗(achievements `不屈不撓` toContainText、classroom-leaderboard signIn 導覽、game-economy `+750 XP`、learning-experience 十二色相環 img，四者訊息與 locator 完全一致)，判定與批④ diff 及平行 session 工作樹改動皆無關(base worktree 為乾淨 82993ba checkout，不含平行 session 未提交變更，仍同樣四紅)——環境/內容種子漂移，非本批引入。9 張截圖(桌機+375+shop-dialog)全數符合視覺檢查點：木架卡成形、店主釘牌可辨、購買夜窗開啟且未點確認購買(僅點取消，經濟狀態未變動)、木板佈告欄+羊皮紙名條分層、金銀銅三階可辨(銀銅為 swatch，現有種子僅 2 生)、石膏(locked)vs 光柱(unlocked)可辨、無溢出。對比實測 38 組(36 checklist＋opacity 續連驗證針＋1 組本 gate 另行發現)：驗證針 PASS(0 delta，助手混色數學與瀏覽器 getComputedStyle 逐位元組相符)；36 組中 35 組 ≥4.5:1，**3 組未達標**——(a) `mistake-group__badge` 4.25:1，查證為 cd5eceb 既有規則(批④未觸碰)非本批範圍；(b) hall-of-medals unlocked 卡 description 於光柱最亮採樣點 4.499:1(批④引入，僅差 0.001，另有方法論風險——`medal-beam` keyframes 使光柱 opacity 於 1↔0.55 間 infinite alternate 動畫，靜態單幀量測無法排除週期內更低對比)；(c) **guild-board eyebrow 徽章 1.03:1(嚴重)**——`src/styles/globals.css:4581-4583`(22b12ed 引入)只改 `color` 為 `--pixel-parchment` 未改 base pill 自身淡黃底(`color-mix(#f5c400 22%, white)`)，實測近乎全透明字，桌機+375 螢幕截圖裁切皆確認為鬼字(ghost text)——同一批次 `.battle-scene`/`.victory-scene` 的「終審 I2」pill 深色 token 教訓存在但未套用到 guild-board。三項回報不修(gate 範圍)，建議另立 fix wave。console 乾淨(4 頁 0 error/0 pageerror)。證據 artifacts/design-audit/batch4/(含 contrast.md、gate-capture-batch4-raw.json、9 張截圖)。
B4 Task 5: complete (gate PASS after 1 fix wave——862cc5f: guild/dungeon eyebrow pill 轉透明(根因=淡黃 pill 底只改字色,含批③潛在同構缺陷一併修)+光柱下 description ink-900+badge 實色底; 複測 8657162: 4 對 4.58/4.82/12.02/5.09 全過、淺景 eyebrow 無回歸 11.83; opacity 合成驗證針 0 delta PASS; e2e 4 spec 紅全數經 base-worktree 對照歸因既有/環境; unit 798/lint/typecheck/prettier 綠; raw hex 0; 字串計數一致; console 0; 證據 artifacts/design-audit/batch4/)
B4 Final review (opus): With fixes (I1 兩個 4.297 淺景配對——achievements 頁描述+shop 外框 hint,計畫 checklist 漏列致 gate 未量; I2 外框分頁零截圖零配對; triage fix-now=T1/T2 裝飾 textless 顯式斷言) -> fix wave bf70538 (ink-700 兩處+這是你 nowrap+取消鍵顯式底+eyebrow 正典修法註解+2 測試斷言) -> gate round-2 複測 PASS：5 對獨立 rendered 複測(9.037/9.037/4.772/12.525/12.525)全過(含 achievement-card__date 光柱尾端首次量測、beam alpha≈0.0089);外框分頁新增 shop-frames-desktop/375.png(20 張外框卡+hint 可辨,無溢出);375 這是你 chip 確認 nowrap 單行、自身不溢出(另記錄一項與本波無關的 leaderboard-table 375px 6px 溢出,未修,超出範圍);contrast.md 補 M7 方法論註記(光柱 pseudo-element 疊字面上,現行合成法偏樂觀,留待未來 gate 補測兩端 keyframe)。證據 artifacts/design-audit/batch4/(gate-reverify-bf70538-raw.json、shop-frames-*.png)。
B4 Deferred minors (終審): M2 已以註解解、M3 tbody th 死選擇器、M5 兩處同權重順序依賴(achievements vs scene-day bg / shop-tab tie)、M7 beam 前景合成偏樂觀(方法註記)、M8 date 配對補量、M9 mistake-list__body 無 CSS、guild eyebrow 4.58 零餘裕(token 級待素材批)、blook-card/shop-tab 選擇器可改 .blook-shop 前綴更防禦
B4 gate round-2 (f6fd090): 5 對 9.04/9.04/4.77/12.53/12.53 全過; 外框分頁補 2 截圖+配對(20 卡可讀無溢出); 這是你 nowrap 單行; M7 方法註記入 contrast.md; ledger 隨 commit(解 M1)。新發現(既有,範圍外): .leaderboard-table 375px 造成 6px 頁寬溢出——批⑤或另案。
B4 Final re-review (opus): APPROVED——I1/I2/T1/T2/M1/M2/M4/M6/M7/M8 全數獨立驗證解消;21/21 綠;specificity 全數非順序依賴;無平行 session 混入。
BATCH-4 COMPLETE at f6fd090 之後以本 ledger commit 收尾 (11 commits 649e889..HEAD; base 82993ba)。
B4 continuity notes (批⑤前): (D1) contrast.md M7 註記前提要改無條件——positioned z-index:auto 依 CSS2.1 App.E step 8 必然畫在 in-flow 文字之上,非「某些瀏覽器」;量 beam 面必採雙 keyframe 極值+前景合成。 (D2) achievement-card__date 4.772 量在漸層淺端(f=0.682 已入 tint→tint-2 坡),tint-2 端 coral 卡估 4.29——既有非批④,列 backlog 與 gradient 面量測規約一起處理。 (既有) .leaderboard-table 375px 6px 頁寬溢出。

JRPG Pixel Batch-5a (plan: docs/superpowers/plans/2026-07-31-jrpg-pixel-batch5a-live-raid.md, base 5fe46ef)
B5a Task 1: complete (commits 5c91298+d18a3b8, spec ✅ after 1 fix wave——reviewer 抓到舊 .live-join form (0,1,1) 蓋新 margin, fix=選擇器升 (0,2,0), quality Approved; Minor: watch 行 scoped eslint-disable(react-hooks/incompatible-library)經審查判正當——RHF watch 為 plugin 硬編碼不相容且本 repo 無 compiler pass、brief 鎖定 watch API; 舊 .live-join 殘留框線惰性存在記 design-audit)

B5a Task 2: complete (commits 6fc3ea3+8dc73ef, spec ✅ after 1 fix wave, quality Approved; 實作者抓到計畫 CSS 三處真缺陷(> div > div > p 外溢淺卡/FeedbackPhase 題文漏設/淺卡無自身 color 反白)獲 reviewer 全數 uphold; 兩 Critical 經 controller 裁定為計畫文本缺陷——C1 badge 字色=對比鐵律優先於 match-base 字面(取夜景 ink), C2 scoreboard=零樣式裸 section 誤列淺卡(顯式夜 ink); 計畫文本已修正並隨 commit)
B5a Task 3: complete (commit 9a4e0fb, spec ✅, quality Approved; Important(plan-mandated) 旗尾 clip-path 對長名/換行名裁切風險→交 Task 4 gate 1080p 實測裁決; Minor: podium-gems position:relative 惰性(brief 原文)、trailer 由 controller 親查=present)
B5a Task 4 (Batch Gate): FAIL on e2e + contrast, all else PASS(commits under review 5c91298..9a4e0fb, base 5fe46ef)。靜態全套綠(lint 0 err/typecheck 綠/vitest 801/801)；raw hex 0(僅 1 處 CSS 註解引用既有 token 十六進位值供除錯說明,非新硬編碼)＋tokens.css/tokens.test.ts 未動；載重字串 11 組(join 3＋session 4＋presenter 4)前後計數一致,結構 diff 空。**e2e FAIL(環境既有,非本批引入)**：`live-smoke.spec.ts` 卡在 `createClassroom` 等待 `getByLabel('一次性班級加入碼')` 逾時 240s——溯源證實 `tests/e2e/helpers/classrooms.ts` 對 owner 2026-07-27 裁定(`teacher-classrooms-page.test.tsx:81-82`「固定碼常駐於班級卡...不再彈一次性 receipt」)已過期未同步；`joinClassroomByCode` 導向的 `/join/:code` 亦已是 `create-app-router.test.tsx:241` 明文的「已移除路由」(0730 設計交付批移除,見該批 ledger「移除...join...」)。以隔離 git worktree 於 base 5fe46ef 重跑同批命令證實逐字相同失敗(同一 locator/同一 240s timeout)——判定為既有 test-infra 落後,非本批 diff 造成(本批零接觸 classrooms/)。9 張截圖(join-desktop/375、student-lobby/question/feedback、presenter-lobby/question/reveal/podium-1080p)全數符合視覺檢查點：石板點亮(3 碼)、旗幟牆(含 28 字長名單行不裁切)、投影 bar/code/count、四色軍勢格、階梯緣長條圖、Top5 英雄榜、頒獎台雙步(僅 2 參與者故無季軍)；發現一項本批新缺陷——`podium-gems`(globals.css:6550,commit 9a4e0fb)clip-path 與 box-shadow 側寶石相剋,側邊珊瑚/翡翠寶石被裁到不可見,現場僅見單一藍寶石(像素級截圖佐證);camp-fire 態本輪未觸達(late-join 時序未排入本次 capture,記錄不算)。**Wall-chip 旗尾裁切裁決:PASS**(28 字近上限長名,DOM 量測 scrollHeight===clientHeight===58,單行未換行;像素裁切放大圖確認文字完整,taper 前緣有小量淨空;現行 960px 牆寬+30 字 DB 上限下換行情境不可達,PASS 為緊邊際 PASS,非寬裕值,結構性風險原樣保留供未來牆寬/字數上限變動參考)。對比實測 40 組：**5 組 <4.5:1**——4 組確認為既有規則(`.live-presenter__option(--rose/--emerald)`即`.ui-option(--rose/--emerald)`3.91/3.33、reveal correct 態 chart label/count 3.18、`.live-standing-card__cheer`3.02,均為 diff 外既有選擇器,經 git diff 逐一核對未被本批觸碰)；1 組為本批新曝光——`.live-explanation`(既有 10%-alpha 半透明底,globals.css:2393-2404,未被 diff 觸碰)首次疊在本批新引入的夜景(`.live-guild-raid`)之上,合成後 4.03:1(gate 腳本首次量測誤植 1.0,已用 `__blendOver` 修正複測)；上述 5 組與 3 組 synthetic 皆屬 screen_only 預設不可達的 FeedbackPhase 分支,實際課堂目前看不到。console 乾淨(join+session 全程/presenter 全程 0 error/0 pageerror)。證據 artifacts/design-audit/batch5a/(含 contrast.md、gate-capture-batch5a-raw.json、10 張截圖)。
B5a Task 4 gate (round-1 df392f2): FAIL on Step4(e2e)+Step6(contrast) -> fix wave 0e91d55(三寶石改單元素 clip-path:path() 三子路徑+漸層;live-explanation 補羊皮紙底+ink-900 12.53:1) -> round-2 複測 PASS：真實場次重跑截圖確認三寶石(珊瑚/鈷藍/翡翠)三顆全數可見(像素級裁圖 podium-gems-crop-after-0e91d55.png 佐證,對照 before 圖僅單顆);live-explanation strong/p 複測 12.525/12.525 雙雙過線;四組既有 sub-4.5 配對(rose/emerald 3.91/3.33、reveal correct 態 3.18、standing-card__cheer 3.02)與頒獎台名次/姓名/分數配對(12.904)逐一比對 round-1 數值全數不變,證實 fix wave 未波及無關選擇器。**B5a Task 4 gate 最終裁決:PASS**(e2e RED 仍歸因既有 test-infra 落後,非本批亦非本波修正範圍,不列入 blocking)。證據更新 artifacts/design-audit/batch5a/(contrast.md 新增 Re-verify 節、gate-capture-batch5a-raw.json 覆蓋為複測值、before/after 寶石裁圖)。
B5a 範圍外發現(既有,非本批造成): (1) tests/e2e/helpers/classrooms.ts 對 2026-07-27 owner 裁定(移除一次性收據 modal 與 /join/:code 路由)已過時,導致 live-smoke 卡在建立班級——base worktree 對照證實既有,需另案修 helper; (2) 四個既有 sub-4.5 對比配對(git diff 證實本批未動)待另案; (3) wall-chip 旗尾 clip 邊際 ~2.7px:28 字長名實測未裁(現行 DB 30 字上限+960px 牆寬下風險休眠),記素材批注意。
B5a Task 4: complete (gate PASS after 1 fix wave; round-2 複測 9903e56——三寶石 8x crop 三顆到齊、explanation 12.525 兩對、四項既有 sub-4.5 無惡化、podium 文字 12.9 無回歸;10 截圖含 1080p 四態;console 0;Step4 e2e 仍紅但歸因既有 helper 漂移)
B5a Final review (opus): With fixes (C1 legend 跨框落夜底 1.36:1——非 screen_only 時即題目本身; I2 煙火錨在 flex:1 stage 飛到畫面角落; I3 contrast.md D1 判準寫錯(測「有無文字子節點」而非重疊文字框); M1 wall-chip 順序依賴; M3 舊 .live-join 圓角淺框殘留) -> fix wave 8558e70(legend float 13.29:1、煙火重新校準距 podium 25/41px 零文字重疊、D1 改寫、wall-chip 升 specificity、join 去框) -> **APPROVED**。

B5a Close-out(真實場次複測 8558e70,gate-capture-batch5a.mjs 不變,唯 answerCorrectly 改走原生 DOM click 見下)：
- Final review: **APPROVED**。
- I2 裁定紀錄：final review 原建議的錨點修法(`.live-presenter__podium` 加 `position:relative` + 負 top 偏移)經查證是 no-op——兩個 `.podium-fireworks` span 在 JSX 上是 `.live-presenter__podium`(ol)的手足而非子孫,CSS containing block 只認祖先,對 ol 加 position 對這兩個 span 沒有任何效果;實測(該建議修法套用後)煙火與 podium 的距離仍是 ~669px(左)/~682px(右),跟修前幾乎一樣,只是從「飛到畫面角落」變成「飛到另一個位置」。改採的替代修法(保留原本就是真祖先的 `.live-presenter__podium-stage` 的 position:relative,改用量測 podium 相對 stage 的實際落點校正 `.podium-fireworks--left/--right` 的 top/left/right 定值)已被接受並實測 25px/41px 淨空、零文字重疊——本次真實場次複測(1920×1080)截圖確認兩顆煙火皆貼近各自名次卡,PASS。
- D4(煙火定值註解)：已在 `.podium-fireworks--left/--right` 規則前補一行,列出三個會讓這組定值失準的觸發條件(viewport 高度≠1080、≤720px 時 `.live-presenter__podium` 轉 column 排列、podium 寬度變動),並註明結構性修法(煙火改為 podium 自身的 pseudo-element,定位基準隨 podium 走)留給素材批。
- Legend(C1)複測：真實場次(非治具)量得 13.290:1,與 final-review 附的治具(static harness)數字完全一致;`isLegendInsideFieldset` 幾何驗證 true。PASS。
- **新發現(本次複測意外挖到,非原兩項待查清單內,嚴重度判定應優先處理)**：C1 的 `legend { float: left }` 修法本身造成新的嚴重回歸——screen_only 固定文案「題目在投影幕上，選出你的答案！」在常見筆電寬度(1280px 視窗,fieldset 924px)下,legend 無寬度限制 shrink-to-fit 到 ~872px,只留 52px 給旁邊的 `.live-options` 2×2 按鈕格,導致四顆答案鈕整組擠壓重疊(rose/sky、amber/emerald 各自重疊 36px,`getBoundingClientRect` 與 `student-question.png` 真實截圖皆證實)——**真實學生在此寬度下無法可靠點到想選的答案**。此為 screen_only(課堂預設模式)下每一題都會重現的問題,不是邊緣案例。gate 腳本本身為了推進場次至頒獎台,改用原生 DOM `element.click()` 繞過壞掉的座標命中測試(僅供本次證據蒐集,不代表真實使用者可正常作答)。回報不修(gate 範圍),**建議此發現應阻擋 close-out,優先於本波已修的兩項**。
- 範圍外既有項目維持：(a) tests/e2e/helpers/classrooms.ts 對 2026-07-27 owner 裁定已過時(阻擋 Live e2e 電池全綠,需另案修 helper); (b) 四組既有 sub-4.5 配對——其中 2 組(screen_only 模式下 `.ui-option--rose/--emerald` 的形狀符號,文字視覺隱藏)實為非文字圖形物件,應套用 3:1 門檻而非 4.5:1,3.914/3.329 皆過線;另 2 組(reveal correct 態 chart label/count 3.178、`.live-standing-card__cheer` 3.021)為真實文字,4.5:1 門檻下仍不合格,維持既有、非本批範圍;presenter 端同色配對(`.live-presenter__option--rose/--emerald`)因文字未隱藏,4.5:1 門檻下仍是真實文字失敗,與上述 screen_only 判定不同,一併記錄避免混淆。
- 證據更新 artifacts/design-audit/batch5a/(contrast.md 新增 Close-out 節、student-question.png 與 presenter-podium-1080p.png 重新真實場次截圖、podium-fireworks-crop.png 新增)。
B5a Task 4 close-out + C1 回歸: gate 收尾 aa9b346(重拍兩張與 HEAD 不符的截圖、煙火校準失效條件註記、evidence grade 標註)時發現 **8558e70 的 C1 修法造成 Critical 版型回歸**——`.question-card legend{width:100%}` 疊 float:left 成為全寬浮動框,.live-options(BFC)縮到殘餘 ~50px 並溢出卡片,四個選項鈕擠成細條(終審「BFC 會被推到下方」推論有誤,實測為縮寬)。fix wave 2 = 829f12b(移除 float,改給 legend 自身不透明 --color-surface 底+左右 padding,零版型變動),真機實測 1280/375 兩視窗:grid 全寬、四鈕 430x176 / 125.5x176 皆 >=44px、無溢出;legend 對比 13.29:1;18 點 elementFromPoint 證實跨線處恆命中自身白底。截圖已重拍。
B5a Minor(defer 素材批): legend 白底帶跨在卡片上緣形成標籤板外觀,與圓角卡邊略不協調。
B5a Final re-review (opus): APPROVED——C1 修正版判為「更好的一類修法」(不對抗 legend 原生排版,改讓跨線安全;水平 padding+border-box 使零版型變動可證,非僅實測;非 screen_only 長題文換行時仍成立)。終審自陳 BFC 推論錯誤:CSS2.1 §9.5 的不重疊是靠「縮寬到浮動框旁」達成,只有 min-content 放不下才會掉到下方;.live-options 為 grid,tracks 可縮到 0 故無下限而縮成 50px。
BATCH-5A COMPLETE at HEAD (13 commits 5c91298..91941cc; base 5fe46ef)。
B5a continuity (批⑤b gate brief 必寫): (1) gate 腳本當初為繞過 float 回歸的破碎 hit-testing 改用原生 element.click(),必須改回座標點擊——否則「按鈕重疊/縮到觸控下限以下」這類回歸再次對 gate 隱形(本輪新增的 rect>=44px 幾何斷言只覆蓋一半); (2) tests/e2e/helpers/classrooms.ts 過時(等已移除的一次性加入碼 modal 與 /join/:code),Live e2e 電池自 0730 起實質未執行——批⑤b 開工前先修; (3) 四個既有 sub-4.5 已分流:screen_only 的 .ui-option--rose/--emerald 為視覺隱藏文字+形狀符號(非文字 3:1 標準,通過),投影端同色配對才是真失敗。

## E2E helper 修復 (2026-08-01, commit 966ba62)
tests/e2e/helpers/classrooms.ts 對 0727/0730 裁定過時已修:createClassroom 改讀班級卡上的固定加入碼(locator 收斂到該班 article)、joinClassroomByCode 改對應現行入班路徑、rotateClassroomJoinCode 依現況處理;callers(live-smoke.spec.ts、capture-screens.mjs)同步。**live-smoke 實測 PASS(1 passed 14.0s)**——Live e2e 電池自 0730 以來首次真的跑通。
其他三支仍紅,經查與本 helper 無關(各自獨立既有問題,批⑤b 前可一併處理): (a) classroom-leaderboard 與 assignments-live 皆卡在教師角色導覽 aria-label 不一致(app-shell.tsx:150 vs :178);(b) assignments 功能本身已於 0730 移除但 spec 仍在;(c) live-advanced 自帶一份同樣過時的「一次性班級加入碼」選擇器(從未 import 共用 helper)。
capture-screens.mjs 僅靜態驗證(語法+共用函式已由 live-smoke 證實),未實跑。

## JRPG Pixel Asset Batch (plan: docs/superpowers/plans/2026-08-01-jrpg-pixel-asset-batch.md, base 866d1cd)
Owner 核准 2026-08-01 10:52。美術來源=方案 C(Gemini 生成打樣→owner 篩選→量產);Task 3 結束有 owner checkpoint,未定稿不進 Task 4。GEMINI_API_KEY 已由 owner 填入且經 models.list 實測有效(gemini-2.5-flash-image/gemini-3-pro-image-preview 均可用);生成 venv 已建於 session scratchpad assetgen/。
A1 Task 1: complete (commits ed7a3d7+dbbed3c, spec ✅, quality Approved after 1 fix wave——CONTEXT 詞彙格式對齊檔內慣例+palette 補 ch5 #ff8b75 成 29 色;後者裁定為 plan-text defect(JSON 自稱章節 tokens 超集卻漏 ch5),計畫文/spec07/ADR 全部 28→29 同 commit 修正。Minor deferred: ADR 0006 扁平列表 vs 前 5 篇 H2 結構、spec/07 插入點取結構正確位置非 brief 字面錨點(已裁定正確))
A1 Task 2: complete (commit 442fd11, spec ✅ byte-identical 轉錄, quality Approved, review clean; TDD 紅綠證據＋reviewer 親跑 selftest 過。Minor deferred(全 plan-mandated): --size 格式錯誤裸 ValueError、selftest 只測距離 0 量化、getpixel 效能)
A1 Task 3: BLOCKED on owner (2026-08-01 11:29)——README 骨架已 commit 34d6640;生成 0/13:GEMINI_API_KEY 為免費層,gemini-2.5-flash image 生成配額 limit:0(429 RESOURCE_EXHAUSTED,帳務門檻非速率),models.list 可通過故 precheck 未攔到。待 owner 對該 Google 專案開帳單或換有帳單的 key 後重跑 Step 3 起。教訓:precheck 應含一次真實生成呼叫,非僅 models.list(重跑時補)。
A1 Task 3 UNBLOCK(2026-08-01 11:35 owner 裁定): 改走 ADR 0006 退路 A 機器輔助版——Claude 直接程式化手繪像素網格(PIL 輸出 @1x PNG,色盤由建構保證⊆29 色,免量化;pixelize 保留備用、check-sprites 守門不變)。打樣→owner 篩選→量產節奏不變;Gemini 路線降為備選(若 owner 日後開帳單可切回)。ADR 0006/計畫文 amendment 待與下個 commit 併入。
A1 Task 3 打樣 round 1: 13/13 手繪完成(2 輪自我迭代,色盤驗證 13/13 PASS,contact-sheet-round1.png)。**Owner 篩選(12:23): spirit-1 圓球精靈、monster-2 三角史萊姆、chest-1 金箍寶箱定稿;village-1 退修(平頂太現代,要三角斜屋頂+尖塔的中世紀村莊感,round 2 再呈)**。Anchor=定稿 @1x 網格源碼(scratchpad assetgen/ 渲染腳本)+PNG(複製至 artifacts/design-audit/asset-batch/anchor/)。Task 4(魔物+寶箱)可開工——所需 anchor 已全數定稿;僅 Task 6 的村莊剪影待 round 2。
A1 Task 4: complete (commit b74bc25, spec ✅, quality Approved, review clean——reviewer 獨立驗證 5 檔範圍/PNG 尺寸與硬 alpha/palette gate/CSS 與 brief 逐位元組一致/raw hex 0/keyframes 未動/TSX-tokens 零 diff;transform matrix 三角驗算證實量測真實性;Vite 4KB 內聯為真實預設行為,base64 位元組驗證判定為更強的替代法。Minor deferred: (a) README 表缺獨立 reference 欄(schema 先天),(b) **開蓋視覺=蓋子離體漂浮非鉸鏈開啟**(plan-mandated 不動 [data-open]——新素材讓舊幾何缺陷顯形,記給後續動畫幾何 polish,建議 Task 8 fix wave 或另案),(c) 三條 background:none 可合併(照 brief 字面,不算缺陷))
A1 Task 5: complete (commit 7ea0350, spec ✅, quality Approved, review clean——reviewer 獨立重算火把對比(10.03/5.09 對 --pixel-night 逐位吻合)、×16 放大證實三精靈同剪影僅換色+配件、synthetic class-swap 判定為方法上健全(純 class selector 無複合態)。Minor deferred: (a) 綠精靈斜葉配件與體色同族對比弱,辨識靠體色(主題上可辯護),(b) hero 零重疊 6 targets 僅列印 1 組 rect(報告簿記薄,非造假))
A1 Task 6: complete (commit 97764e4, spec ✅, quality Approved after 1 evidence fix wave——skyline 兩張證據截圖由 controller 以元素截圖+PIL 裁底重拍,原審查者複核 RESOLVED(像素採樣證實內容=視窗下緣+剪影帶,#10142e/#171c3f 與素材調色盤一致)。原審查亮點見下行) (原審查詳情: commit 97764e4, spec ✅——reviewer 逐位驗證 tile 色 clamp bit-perfect/對比重算 4.58與7.19 逐位吻合/isolation 修法裁定正確且僅及 auth 四頁/44px shop-tab 主動修裁定安全但記程序註記。**Important 待修: task6-login-skyline-{desktop,375}.png 兩張證據截圖內容裝錯(為表單裁圖非剪影區)——需重拍;因 Task 7 佔用 app 環境,fix wave 排 Task 7 完成後**。Minor deferred: (a) 44px 修法屬 verify-only brief 的越界(已裁定安全), (b) codex 用 brief 授權的 opacity(0.75) 與批③舊註解「禁 opacity 灰階」存在慣例張力(裝飾性剪影無數值 gate,記給未來剪影工作), (c) 剪影視覺偏淡觀察(前層色=頁底色+RpgWindow 遮蔽,owner 日後裁量), (d) 375px leaderboard 右緣溢出=既有(B4 已知))
A1 Task 8 (Batch Gate): PASS after 1 fix wave (round-1 FAIL 唯一 blocking=兩支 tests/contracts phase-gate 守門未隨 4ce541f 同步(base 綠 HEAD 紅溯源明確);fix eab8624 重釘無弱化(stale pin→not.toContain 釘住 0730 移除+等價現實重釘),delta 複驗 116 檔/801 測試全綠+零接觸斷言重確認+lint/typecheck 綠。Round-1 其餘全過:TSX/tokens zero-diff、raw hex 0、17 sprites 5074B/160KB 預算、login 1421B/32KB、quiz-runner chromium+firefox+live-smoke 綠、兩支已知紅簽名與 ledger 記載逐字吻合非本批回歸、559 對比配對(19<門檻全數分類:18 既有 selectors 本批未觸+1 判斷項)、幾何 18/18、44px 0 違規、煙火 1080↔1366 追隨證實、RM 雙通道獨立性證明、console 0、2 輪座標點擊 quiz+1 輪雙學生 live、35 截圖+contrast.md 入 gate/。**留給 opus 裁量: unlit rune-slot 2.55:1(aria-hidden 裝飾,lit 5.09 信號清晰)**)
A1 Final review (opus): With fixes——I1(唯一 Important,非產品缺陷): 4ce541f 刪除 375 截圖但兩支 acceptance finalizer 仍硬性要求→驗收管線結構性永紅+assignments contract 同檔釘矛盾兩面(gate 的 non-weakening 審查逐行正確但未問 pin 指向物是否還存在——流程教訓已記:re-pin 審查要多問一步「被釘的 artifact 還在嗎/還有誰要求它」)。Minor M1-M8+backlog triage 20 項(詳 review transcript)。裁決: unlit rune-slot 2.55=可接受(aria-hidden 裝飾豁免成立,1.4.11 判定確定性;但記 design-debt:一階提亮刻邊即可救,base 態曾 7:1)。
A1 Final fix wave: 29ee773(finalizer 對齊+contract 矛盾解消+glob 清理;phase:classroom-leaderboard 實跑卡 DIRTY_WORKTREE 前置——runner 拒髒工作區,且本批自產 untracked artifacts/ 210 項使該 gate 對任何產證據批次結構性不可達,以 contract fixture 呼叫真 finalizer 斷言 PASS 替代,缺口記錄待乾淨工作區補跑)+bff0e6a(spec/07 管線指向 ADR/計畫 header 修訂註記/hero 盒算術 14×14→16×16 三處修正/check-sprites docstring 實話化/codex 註解恢復批③ I2 教訓+通道區分/ADR 0006 H2 重構/網格源碼歸檔)。
A1 Final re-review (opus): Ready to merge YES,唯一前置=grids.py/render.py 未隨歸檔(py_compile 假信心:只驗語法不解 import)→controller 補 200de03:兩模組歸檔+task6/7 全部 9 檔再生 byte-identical 驗證(cmp)+README 再生聲明修正+覆寫風險註記。
**ASSET BATCH COMPLETE at 200de03 (15 commits 866d1cd..200de03; opus Ready-to-merge 條件已滿足並超額驗證)。**
A1 Design-debt 清單(結批移交,非本批 blocking): (1) unlit rune 刻邊 2.55(一階提亮救,owner 下次視覺 pass); (2) 寶箱開蓋鉸鏈幾何(新素材揭露的既有 transform 缺陷,動畫幾何 pass); (3) login 剪影偏淡(前層=頁底色+RpgWindow 遮蔽,owner 裁量); (4) ≤720px 投影煙火 pseudo 可能撐出捲軸(media query 存在但 gate 只測 1080/1366); (5) .scene-day 容器級 image-rendering:pixelated 會繼承——未來 10C 題目附圖/教師上傳圖落在日景會被 nearest-neighbour 毀畫質,屆時收斂 selector 或註記刻意; (6) 死 CSS(.battle-monster__eye--left/right、podium-stage relative)與 .podium-fireworks spans 待下個可動 TSX 的批次一併退役; (7) pixelize quantize 路徑全未用+選擇性未測——外源圖後製前先補 selftest; (8) 既有對比債(locked-card 2.80/victory eyebrow 3.11/375 leaderboard 溢出); (9) phase:classroom-leaderboard 真實 headed 驗收待乾淨工作區(注意 artifacts/ 未 gitignore 會自阻); (10) assignments-live/live-advanced 修復=重寫 session 互動模型(0726 一鍵式重構),learning-experience.spec 同構過時——批⑤b 前一併 sizing。
A1 Task 7: complete (commits c6bbd11+199b7f8, spec ✅, quality Approved after 1 docs fix wave——reviewer 逐項獨立重驗(WCAG 白字vs#8a651f=5.30 worst-case 方向正確、煙火偏移由 podium-step CSS 反推吻合、vitest 96/96 親跑、PNG 逐像素)。D4 根治證實:1366×768 位移 (−277,−156) 下 offsets/gaps 不變。營地態首次真實捕獲(late-join 真場次)。Important 修結:雙人頒獎台邊際限制+不對稱根因+三重量測觸發條件已記 README(199b7f8,複核 RESOLVED)。Minor deferred: (a) 報告只列最終數字無 worked example,(b) reduced-motion 靜態煙火全不透明度(plan-mandated,較舊 span 版 0.9 略響),(c) .live-presenter__podium-stage position:relative 成死碼(保留待清))
A1 Task 9: complete (commit 4ce541f, spec ✅, quality Approved, review clean——reviewer 親驗檔案範圍/trailer/0730 引用/產品字串零動/rotateJoinCode API 無漂移/INVALID_CLASSROOM_CODE 對應真實 migration。classroom-leaderboard 實測綠;assignments-live+live-advanced 殘紅歸因獲證實=0726 Task 12 一鍵式 Live 建立表單重構(活動標題/排程/隊伍數欄位已不存在於 src/)。**後續任務 sizing 警示(reviewer Important,plan-mandated): 兩支殘紅需「重寫 session 互動模型」非「修 selector」——retained 段落編碼的活動表格+開新場次模型已整個不存在**。Minor 記錄: report 聲稱檔內註解實未寫入(誠實度小瑕疵,理由本身經 reviewer 獨立證實成立)、run-assignments-live.sh:131 殘留 assignment-detail-*.png glob(無害,範圍外)。learning-experience.spec 同構問題已記錄未動(範圍外)。docs 修訂 commit cda21b3(ADR 0006 手繪裁定+計畫文生成步驟修訂)隨後落地)
A1 Task 3: complete (commit 34d6640 README 骨架;打樣 13/13+village round 2——round 1 平頂根因=vrect 參數序 bug 使三角屋頂從未繪出,round 2 修復後全排斜頂+尖塔;**owner 四項全定稿(12:31): spirit-1/monster-2/chest-1/village-2**,anchor 四檔已入 artifacts/design-audit/asset-batch/anchor/;@1x 網格源碼在 session scratchpad assetgen/。程序註記:美術打樣以 owner checkpoint 為審查,未走 task-reviewer(唯一 commit 為 README 骨架,無程式;裁定記錄於此)。Gemini BLOCKED 紀錄與手繪改道見上兩行)

## GameStage Shell Batch (2026-08-01)

B5 Task 1: complete (commit 51363cf, inventory 36 entries)
B5 Task 1: complete (commits 51363cf+7384159+bd15648, review clean after 2-fix wave: toast/teacher-table dispositions re-routed to Task 8)
B5 Task 2: complete (--stage-void #0a0d20 pinned, TDD red-green)
B5 Task 2: review clean (4720aba)
B5 Task 3: complete (stage structure, visual-spec screenshots expected-red until Task 9)
B5 Task 3: complete (ceb2d27, review clean after ledger note) — NOTE for Task 9: app-shell.visual.spec.ts:67 locator `.app-shell *`(forbidden-flat-styles check) now matches 0 elements after rename → vacuous pass; Task 9 must repoint to `.game-stage *` alongside snapshot regen. Also two .app-shell:has() selectors migrated to .game-stage:has() (login accent / live immersive nav-hiding), behavior preserved.
B5 Task 4: complete (rotate banner, portrait-only, session dismiss)
B5 Task 4: review clean (0a324fb+366d538, flushSync removed in favor of act()-wrapped test trigger)
B5 Task 5: complete (HUD command bar + MENU sign-out, rails retired, e2e sign-out sync). 座標點擊實測 7 學生+4 教師路由全通、MENU/Escape/登出跳轉皆綠、對比 parchment-on-night≈14.2:1／night-on-parchment(active)≈14.2:1／MENU 鈕≈15.6:1 全數 ≥4.5:1、375 寬 sticky 底列 44px 觸控全過、console 0。`.game-stage:has(.live-session-shell)` 選擇器已隨 rails 退役遷移為 `.hud-command`。**發現既有殘紅(非本批造成)**：session-lifecycle.spec.ts／shared-device.spec.ts 兩檔卡在更早的 0730 批次移除「個人資料」連結/`/app/profile` 路由(git blame 顯示該行 e2e 最後同步於 07-19,router 現無此路由)，於 signOutViaHud 之前就逾時失敗；已用暫時性 ad-hoc spec(簽入前刪除)獨立證實 signOutViaHud 對學生／教師兩身分皆可正確登出，兩檔本身的修復需另案（回填/移除 個人資料 依賴，屬 Task 5 範圍外）。
B5 Task 5: review clean (5c90a33). Minor backlog: hud-menu no click-outside close; MENU open does not move focus into panel (both brief-inherited). GATE NOTE: session-lifecycle/shared-device e2e red = PRE-EXISTING (/app/profile route + 個人資料 link removed in earlier batch, specs never synced; failure point before sign-out). Task 10 must treat as known-red w/ base-identical failure check, not this batch.
B5 Task 6: complete (top HUD status/resource/sage windows, legacy header+brand retired)
B5 Task 6: review clean (f0087f9). Notes: gold-on-night contrast measured 5.09:1 (brief estimate wrong, gold text kept); orphan .app-header__lobby/.app-header__teacher CSS retired; narrow-viewport .economy-summary override removed (dead — .hud-top rule always wins, 375px verified live).
B5 Task 7: complete (press-start title screen at /)
B5 Task 7: review clean (3a9b9f6, press-start title screen; dimmest blink frame 7.57:1)
B5 Task 8: complete (overlays anchored to stage; presenter/toast dispositions recorded; teacher tables guarded). `.live-result-screen` fixed→absolute+z-index 70(錨 `.game-stage`,實測 1440×900 貼滿舞台內容區未觸 letterbox,z 序蓋過 hud-command 50)；`.live-presenter` 保留 fixed(投影全螢幕例外,補註解)；`.ui-toast-container` **訂正原盤點建議**——真查 DOM 發現與 `.game-stage` 是 `#root` 手足非子孫(ToastProvider 掛在 app 根),absolute 無法真錨定,改為保留 fixed+多行結構性理由註解,列 design-debt(未來需搬 ToastProvider 掛載點進 AppShell)；100dvh 兩處皆非本任務範圍,複核無新 hits；教師寬表格：`teacher-analytics-page.tsx` 三張表新缺口補 `.teacher-analytics-section{overflow-x:auto}`,四頁(`/teacher/classes`、`/classes/:id`、`/analytics`、`/live/:id/report`)於 1024×768/1440×900 實測皆未溢出舞台(`.live-matrix-scroll` 容器內部依設計捲動非破版)。e2e 迴歸 live-smoke+quiz-runner 2/2 PASS(走 build+preview)。vitest 811/812(1 個 create-app-router 全套件平行 flake,單獨重跑 18/18 綠,非本批引入)。證據 artifacts/design-audit/stage-shell/task8/。
B5 Task 8: review clean (d434e6f). Toast kept fixed w/ verified DOM-sibling rationale (design-debt: ToastProvider mount move); .teacher-analytics-section overflow guard verified wraps all 3 tables.
B5 Task 9: complete (stage-geometry visual baseline, 812x375 point, snapshots regenerated + manually inspected, .app-shell* locator repointed). Geometry assertion (16:9±2% in stage mode / full-width in portrait) added to every viewport in the login-reference loop and PASSED at all 5 viewports (320x812, 375x812, 768x1024, 812x375, 1440x900) both pre- and post-regen — confirms Tasks 3-8's letterbox math is correct. 5 chromium-darwin snapshots regenerated (4 replaced + login-812x375 new); pixel-sampled the new 812x375 image to confirm void(rgb(10,13,32))→stage cream padding→double-line frame→card, matching globals.css exactly; no broken layout in any image. **發現既有殘紅(非本批造成)**：「every foundation route has one clearly labelled primary CTA」測試在 320×812 對 `/` 路由持續失敗——PRESS START 標題畫面的 `.title-screen__logo`（"ColorPlay"，pixel font + letter-spacing 0.06em）字型載入後量測寬度 381.6px，把 document scrollWidth 撐到 367px > clientWidth 320px（`getBoundingClientRect` 逐元素排查確認元兇，非本次改動觸發，未改動即可重現同一失敗行號位移前的版本）。懷疑是 Task 7（press-start title screen）引入；修復需動 `title-page.tsx`/`globals.css`（title-screen 字級/letter-spacing 收斂），不在 Task 9 檔案範圍（僅 spec+snapshots）內，留待下一任務或 owner 裁量。
B5 Task 9 fix wave (coordinator-authorized cross-file, CSS-only): root cause pinned via getBoundingClientRect sweep — `.title-screen`（`.game-stage__scene` 的 flex column 子項）預設 `min-width:auto`,「ColorPlay」單詞不可斷詞逼出 335.8px 內容寬,逐層把祖先自動撐寬到 367.8px,document scrollWidth 隨之溢出 320px clientWidth,與字級無直接關聯(先前 max-width:100% 因父層寬度不定而失效)。修正三處，均只動 `globals.css`：(1) `.title-screen` 加 `min-width: 0` 阻斷該撐寬鏈,讓 flex stretch 真正生效收回 320px；(2) `.title-screen__logo` 的 `clamp(2.5rem, 6vw, 4rem)` 改 `clamp(1.5rem, 8vw, 4rem)`（比座標建議的 11vw 再收，8vw 在 320/375 寬有安全餘裕；≥768px 的 vw 值全被 4rem 上限截住,1440/812×375 觀感零改變,實測 fontSize 仍 64px、logo 620px 級距飽滿）；(3) `overflow-wrap: anywhere` 作保底(正常寬度不觸發,僅防未來極窄場景真溢出)。TSX/文字串零接觸,無動畫。驗證：一次性量測 spec(320/375/812×375/1440 四寬,`document.fonts.ready` 後讀 scrollWidth/clientWidth/logo rect)全數 scrollWidth===clientWidth；`pnpm exec playwright test tests/e2e/app-shell.visual.spec.ts` **8/8 全綠**(含先前紅的 CTA-route 測試)；因 `/login` 不使用 `.title-screen` 類別,5 張既有 chromium-darwin snapshot 全數位元組不變(免 `--update-snapshots`,重跑本身即為證據)。人工目檢 320px 與 1440px 兩張 `/` 截圖：320px logo 置中不溢出、留白正常；1440px logo 仍達 4rem 大字滿版,視覺與修復前一致。`npx prettier --check src/styles/globals.css` 通過。
B5 Task 9: review clean (d3112f5+6c788c3). Fix wave: title-screen 320px overflow (min-width:auto propagation) fixed CSS-only; side effect accepted: 800-1066px band logo reaches 4rem cap earlier (no overflow, gate re-checks). Visual spec 8/8 green, .app-shell* locator repointed to .game-stage*, 812x375 viewport live.

## GameStage Shell Batch — GATE (Task 10)

**Verdict: BLOCKED (Step 1 靜態電池 FAIL, batch-attributable). Steps 2–6 not run.** Commits under gate: 51363cf..6c788c3 (base e0334fa; Tasks 1–9, 13 commits).

**Step 1 靜態電池**：
- `pnpm exec vitest run` → PASS（119 files / 812 tests all green）
- `pnpm typecheck`（`tsc -b --pretty false`）→ PASS
- `npx prettier --check`（shell 檔＋title-page＋tokens.css/test＋app-shell.visual.spec.ts＋e2e/helpers/auth.ts）→ PASS
- `pnpm lint`（`eslint . --max-warnings 0`）→ **FAIL, 8 errors**：`src/app/shell/app-shell.test.tsx:39`(`no-unnecessary-type-assertion`)、`src/app/shell/rotate-banner.test.tsx:20,25`(`no-unnecessary-type-assertion`/`no-confusing-void-expression`)、`src/test/setup.ts:18-26`(1×`no-unnecessary-type-assertion` + 4×`no-empty-function`，matchMedia polyfill 整段)。

**歸因（雙 clean worktree 對照法，同素材批 gate 慣例）**：`git worktree add … 6c788c3` 逐字重現同 8 error（排除 working tree 內另一 session 無關 WIP 干擾）；`git worktree add … e0334fa`（base）`pnpm lint` → **exit 0, 0 error**，三個受影響檔案（含 `src/test/setup.ts`）在 base 完全乾淨；`git blame` 逐行核對，8 行全部落在同一 commit **`0a324fb`（Task 4: portrait rotate-hint soft banner）**，在批範圍內。ESLint config 於 base..tip 間未變動，`typescript-eslint` 版本兩端一致(8.63.0)，排除規則/依賴漂移。**結論：100% 可歸因本批，非既有債務。**

**Steps 2–6 未執行**：依 brief「可歸因缺陷 FAIL 則 STOP、回報 BLOCKED、不代為修正產品碼」，Step 1 已確立可歸因失敗，e2e 電池／真跑視覺互動三情境（1440×900／812×375／375×812，學生＋教師）／對比電池／雙通道 reduced-motion＋console 皆未執行，`artifacts/design-audit/stage-shell/gate/` 無新證據產出。

**已知紅基準（本次未驗證，留待下輪 gate）**：assignments-live／live-advanced（session 模型重寫）、session-lifecycle／shared-device（個人資料連結/`/app/profile` 路由已移除，Task 5 已記錄非本批造成）、learning-experience／game-economy／achievements（環境/種子漂移，素材批已證）、classroom-leaderboard（教師導覽 aria-label 既有 bug）——**皆需在下一輪 gate（lint 修復後重跑）逐一重新核對失敗訊息與 base 逐字相同**，本輪未做。

**建議修法**（未套用，留給修復任務）：`app-shell.test.tsx:39`/`rotate-banner.test.tsx:20` 的 mock 物件型別斷言在目前寫法下被判定多餘，需視個案改窄 mock 型別或移除中介 `unknown`；`rotate-banner.test.tsx:25` 的箭頭函式加大括號即可（ESLint 訊息已指出修法）；`setup.ts` 四個空 method 可依專案既有慣例加 eslint-disable 註解或改 `() => undefined`。4/8 error 可被 `eslint --fix` 自動修，其餘（void-expression）需手動加括號。

**遞延事項（沿用批⑤a／⑤b 既有記錄，未受本輪影響）**：教師端深度＝批⑤b（0% 未開工）；design-debt：toast anchor 需 ToastProvider 掛載點搬移（Task 8 已記）；asset-batch design-debt(6) 維持遞延（標的非外殼範圍）。

**環境備註**：執行時 working tree 另有一組非本批、非本 session 的未 commit 變更（`.gitignore`／`package.json` `content:*` scripts／`docs/content/*`／`scripts/content/import-fixes.json`／`src/features/auth/pages/login-page.tsx`／`supabase/seeds/content-*.sql`，研判為題庫 SSOT 平行 session WIP），已核實與本次 lint 錯誤清單無關、未觸碰。診斷用兩個暫時 git worktree（tip/base）已清除，未留痕。

詳見 `.superpowers/sdd/task-10-report.md`。

B5 Gate fix wave 1: lint 8 errors from 0a324fb resolved (src/app/shell/app-shell.test.tsx, src/app/shell/rotate-banner.test.tsx, src/test/setup.ts)

## GameStage Shell Batch — GATE Round 2 (Task 10, final verdict)

**Verdict: PASS.** Batch tip now `e74a681` (fix wave 1 folded in; 51363cf..6c788c3 + e74a681). Full Step 1–5 rerun after fix wave 1 landed (`docs(sdd): close game stage shell batch with gate results` commit's BLOCKED verdict is superseded by this entry).

**Step 1 靜態電池（重確認）**：`pnpm lint` PASS（exit 0）、`pnpm typecheck` PASS、`pnpm exec vitest run` PASS（119 files/812 tests）、`npx prettier --check`（本批範圍）PASS。

**Step 2 e2e 電池**：quiz-runner chromium+firefox 2/2 PASS。Must-pass 集 5 支中 app-shell.visual(8)/live-smoke/auth-account 3 支全綠；`playable-slice.spec.ts`／`ui-restyle.spec.ts` 2 支紅，經 commit 日期＋`git blame`＋diff 範圍三方比對，證實根因分別是 `login-page.tsx` 的「固定導向 UAT 0727 #5」邏輯（commit 9917f57e, 07-31）與品牌標題簡化（commit c0f7baf9, 07-23）——兩者皆早於本批 base(e0334fa, 08-01) 且本批對 `login-page.tsx` 零接觸，**100% pre-existing，非本批缺陷**。已知紅集 8 支全紅：6 支為 phase-gate acceptance-mode 守門（裸跑必紅，非測試邏輯問題，符合既有慣例）；shared-device 失敗簽名與 brief 原記載逐字相符（個人資料連結，0730 批移除）；**session-lifecycle 失敗簽名有漂移**——實際卡在更早的 checkpoint URL 還原斷言（同一固定導向根因），非 brief 原記載的個人資料連結，但同樣證實 100% pre-existing（該 spec 第 44 行前本批零接觸，`login-page.tsx` 亦零接觸）——已在 task-10-report.md 記錄此簽名訂正供後續 gate 更新既知紅記載。

**Step 3 真跑視覺/互動電池**（拋棄式 ad-hoc Playwright 腳本，仿 B5 Task 5 先例，簽入前已刪除；證據於 `artifacts/design-audit/stage-shell/gate/`，未 commit）：1440×900 letterbox 16:9 精確(誤差0%)置中(誤差0px)、void 實測 `rgb(10,13,32)`=`#0a0d20`、雙線框驗證；學生 7＋教師 4 導覽項座標點擊全數正確落地；MENU→登出雙身分全流程 PASS；`/`→PRESS START→登入→lobby 全流程 PASS。812×375：stage 高=375 精確、HUD 全 8(學生)/5(教師)項恰 44px、scene 可卷動。375×812：banner 開/關兩態+sessionStorage persist+reload 後仍隱藏皆 PASS，×鈕 44×44，RWD 全幅，指令列 sticky 底確認。

**Step 4 對比電池**：17 組 rendered 實測（含 fallback 登出鈕經 CSS 源碼比對衍生同值），**全數 ≥4.5:1**，無失敗；PRESS START 最暗閃爍幀(opacity 0.7) 7.56:1。

**Step 5 雙通道 reduced-motion＋console**：本批唯一新動畫(`.title-screen__start`)兩通道(`prefers-reduced-motion`+`data-reduced-motion`)皆正確停止。**附帶發現非本批 design-debt**：登入頁既有裝飾 `.press-start`(commit 7d87c183/9917f57e, 07-31)只被 `prefers-reduced-motion` 通道涵蓋，`data-reduced-motion='true'` 通道未覆蓋——本批零接觸該 CSS 區塊，記為既有債務待未來動畫批次補上。全程 console error/warning/pageerror 0 筆。

**環境前置記錄**：本機 Supabase stack 執行前為 stopped，已 `supabase start` 重啟；e2e env 透過既有 `scripts/supabase/load-local-environment.sh` 載入，比照 `scripts/test-e2e-local.sh` 慣例。

**遞延事項（不變）**：教師端深度＝批⑤b（0% 未開工）；design-debt：toast anchor 需 ToastProvider 掛載點搬移（Task 8 已記）＋本輪新增「登入頁 press-start 缺 data-reduced-motion 通道」；asset-batch design-debt(6) 維持遞延（標的非外殼範圍）。

詳見 `.superpowers/sdd/task-10-report.md`（Round 2 章節，含完整量測表與截圖清單）。

**BATCH COMPLETE.**

## GameStage Shell Batch — Final-review fix wave

B5 Final-review fix wave: F1 nav containment, F2 skip-link z75, F3 economy pill reset, F4 fallback corner, F5 report correction, F6 escape focus return, F7 comments (deferred to 批⑤b: teacher nav tiering/active state, aria-controls dangling, skip-link absolute scroll edge, toast anchor move, hud-menu click-outside/focus-trap)

**驗證**：`pnpm exec vitest run src/app/shell` PASS（4 files/24 tests）；`pnpm exec vitest run` 全量 PASS（119 files/812 tests）；`pnpm lint`／`pnpm typecheck` 皆 exit 0；`pnpm exec playwright test tests/e2e/app-shell.visual.spec.ts` 8/8 PASS、快照零變更；獨立 Playwright 真跑量測（登入 `student.one`／`teacher`）證實 812×375／375×812 下 7 項學生導覽＋MENU 全數在容器內、≥44px、1440×900 視覺不變，skip-link focus 後 `elementFromPoint` 落在自己身上，economy pill 背景實測 transparent，fallback 登出鈕非全寬且 `align-self:flex-end`，MENU Escape 焦點確實回到切換鈕；證據於 `artifacts/design-audit/stage-shell/final-fix/`（未 commit）。詳見 `.superpowers/sdd/task-10-report.md`「Final-review fix wave」章節。

**FINAL-REVIEW FIX WAVE COMPLETE.**
B5 BATCH COMPLETE at 812f967 (amended from 8cad249, message-only): opus whole-branch review Ready-to-merge=Yes after final fix wave (F1 nav containment Critical + F2-F7). Batch commits 51363cf..812f967 (16+1). Deferred to 批⑤b: teacher nav tiering/active state, aria-controls dangling, skip-link absolute scroll edge, toast anchor (ToastProvider mount move), hud-menu click-outside/focus-trap, login-page .press-start data-reduced-motion channel (forbidden file this batch). NOT merged/pushed per owner constraint (勿推 main).
B5 現場調整批(owner 21:59 #1 滿版): letterbox 16:9 框移除→舞台滿版貼齊視窗(橫向模式保留 fixed viewport+HUD 釘住+scene 內卷動); visual spec 幾何斷言改滿版(寬恆=viewport、橫向高亦=viewport), snapshots 2 張再生(8/8 綠)。註: snapshots 一如 Task 9 係於含平行 session 未提交 login-page.tsx 的工作樹產生。owner 21:59 #2(減少上下捲動→橫向/分頁)已記 spec §1.9, 範圍待 owner 定(併批⑤b 或獨立分頁批)。

## Student Paging Batch (2026-08-01)

P1 Task 1: complete (inventory 29 entries)
P1 Task 1: review clean (47eaf58). FACT: chapter-select.spec already RED at base 238dba9 (chromium verified) — Task 3 rewrites it page-aware + current copy (asset-batch stale-spec revival precedent). Trigger pages: lobby(6>3)/shop(20>8)/achievements(9>8).
P1 Task 2: complete (GamePager overflow-only pager, 5/5 TDD)
P1 Task 2: review clean (010108d; reviewer typo claim adjudicated FALSE by controller grep — file and diff both correct 箭頭; trailer verified)
P1 Task 3: complete (lobby paging + chapter-select.spec revived page-aware)
P1 Task 3: review clean (c4a933e, amended from acf8ede msg-only). chapter-select.spec REVIVED green (two copy drifts fixed: 開始挑戰→開始任務/繼續學習、鎖定中/敬請期待→尚未解鎖/完成前一章節後解鎖). DESIGN-DEBT for final fix wave: GamePager ArrowLeft to page1 → disabled button drops focus to body → next ArrowRight lost (fix in game-pager.tsx: move focus to opposite arrow when current becomes disabled).
P1 Task 4: complete (mission select + dungeon floors paging)
P1 Task 4: review clean (9c83d2f). Real playable=2 (only ch3/ch4 have questions) — mission-select no overflow at wide; floors all single-subtopic, no chrome anywhere at current seeds. Note: "6 playable" premise was controller dispatch context, not brief.
P1 Task 5: complete (shop racks paging both tabs)
P1 Task 5: review clean (55553b6). Shop pages 3pp wide both tabs; ui-restyle confirmed pre-base red (login-page c0f7baf9 07-23, matches shell-gate blame) — controller premise wrong, implementer A/B verified signature unchanged.
P1 Task 6: complete (mistake codex in-group + resolved paging)
P1 Task 6: review clean (24d868c). WARNING for parallel sessions & gate: student.one local-DB state MUTATED during real-app measurement — mistakes baseline was 33 open/0 resolved, now ~3+11+11 open/8 resolved, plus remediation XP at 20% rate accrued. learning-experience.spec exact-XP assertions (already env-red) drift further; gate must compare signatures accordingly. Future measurement mutating grade/token state should use disposable accounts.
P1 Task 7: complete (hall of medals paging)
P1 Task 7: review clean (d5066ca). 9 achievements → 2pp wide/3pp narrow; achievements.spec untouched per §F.

## Student Paging Batch — GATE (Task 8)

**Verdict: PASS.** Commits under gate: 47eaf58..d5066ca (base 238dba9; 7 commits — inventory/plan docs, GamePager component, 5 page-wiring commits). Evidence in `artifacts/design-audit/student-paging/gate/` (untracked, not committed): `battery-results.json`, `base-scroll-results.json`, `battery-log.txt`, `known-red-tip.log`/`known-red-base.log` (+ `.norm.log` diffed copies), `classroom-leaderboard-acceptance/`.

**Step 1 靜態電池**：`pnpm exec vitest run` → **823/823 PASS**（120 files）；`pnpm lint`（`eslint . --max-warnings 0`）→ **PASS, 0 errors**；`pnpm typecheck`（`tsc -b`）→ **PASS**；`npx prettier --check` 本批全部動過檔（game-pager.tsx/.test.tsx + 5 頁面 + 其 test + chapter-select.spec.ts + globals.css）→ **PASS**。

**Step 2 e2e 電池**：
- Must-pass 集（chapter-select／quiz-runner chromium／live-smoke／auth-account／app-shell.visual／classroom-leaderboard，皆 `--project=chromium`）：**13/13 PASS**（app-shell.visual 8 個子測試＋其餘 5 支各 1）。`classroom-leaderboard.spec.ts` 本質是 acceptance-mode phase-gate 測試（與 game-economy/achievements 同構），裸跑會擲 `CLASSROOM_LEADERBOARD_ACCEPTANCE_MODE_REQUIRED`；改用 `PLAYWRIGHT_ACCEPTANCE=on`＋`PLAYWRIGHT_EVIDENCE_ROOT` 跑其真實斷言（沿用既有 DB 狀態、未跑完整 db-reset/seed pipeline）後 **PASS**，證實非本批缺陷。quiz-runner `--project=firefox` 另跑 **1/1 PASS**。
- 既知紅集（assignments-live／live-advanced／session-lifecycle／shared-device／game-economy／achievements／learning-experience／ui-restyle，`--project=chromium`）：**8/8 全紅，且與 base 逐字相符**。方法：`git worktree add` 建立 base(238dba9) 乾淨副本，`tsc -b && vite build` 後以獨立 port(4174) `vite preview` 起服務、`PLAYWRIGHT_BASE_URL` 指向該服務跑同一組 8 支，`diff` 正規化後（拿掉時間戳/port/worktree 路徑雜訊）**逐字比對零差異**（僅時間 ms 與 port 號不同）。**訂正計數**：8 支的真實拆分＝5 支 acceptance-mode 守門 throw（achievements/assignments-live/game-economy/learning-experience/live-advanced）＋session-lifecycle＋shared-device＋ui-restyle＝8（先前記載誤把 classroom-leaderboard 裸跑算進這 6 支，但 classroom-leaderboard 屬 must-pass 集、不在此 8 支已知紅集合內，雖同構守門 throw 但應獨立計）。session-lifecycle 卡在 checkpoint URL 還原斷言（`Expected /\/app\?chapter=color-theory#checkpoint$/`，實際落在 `/app`）；shared-device 卡在等待 `個人資料` 連結逾時——兩者與既有紅寶書記載（Task 9/10 gate）簽名一致，均為 0730 批以前既有缺陷，本批對 login-page.tsx／session-lifecycle.spec.ts／shared-device.spec.ts 零接觸；ui-restyle 卡在 `/login` 找不到「ColorPlay 認證入口」文案，係 07-23 (`c0f7baf9`) 品牌標題簡化早於本批 base 即已過期，與 Task 5 review 記載簽名一致。learning-experience 因裸跑即在 acceptance-mode gate 擲錯（未跑到 XP 斷言），故 Task 6 記載的 DB 漂移風險本輪未觸發，留待下次 acceptance 模式全跑時比對。

**Step 3 真跑電池**（拋棄式 Playwright script，`@playwright/test` chromium launcher 直接驅動，已於 session scratchpad 完成任務後不留痕；dev server `pnpm dev` port 5173）：三情境（1440×900／812×375／375×812）× 5 頁全跑。
- **分頁 chrome 出現條件**：全數與容量算式相符——lobby 兩寬幅皆 2pp（6 章節 vs pageSize 3/2）、mission-select 於≥768寬（含 812×375，（0802 訂正：useStageWide 已於 cb969e4 改為寬度+橫向雙條件，與 CSS 對齊））因 playable=2=pageSize2 **無 chrome**、375×812 窄幅則 2pp（pageSize1）；dungeon 三情境**皆無 chrome**（目前各小節題數 ≤ pageSize，與先前任務記載一致）；shop 兩籤在寬/812×375 皆 3pp、375×812 皆 5pp；mistakes 目前真實資料為 2 個小節內分頁群組（3-2:3pp/3pp/5pp、3-3:3pp/3pp/4pp 隨寬幅）+ 已解決 2pp/2pp/2pp（資料量已隨 Task 6/7 真跑測試變動，非批次代碼問題，頁數公式本身正確）；achievements 9 項於三情境皆 2pp/2pp/3pp。
- **座標點擊換頁**：所有頁面代表性 pager 皆座標點擊「下一頁」直到末頁、再點「上一頁」返回首頁全數成功，`第 n / N 頁` 逐步正確遞增/遞減（如 shop 375×812：1/5→2/5→3/5→4/5→5/5→...→1/5）。**方法論修正記錄**：初版腳本用預滾動座標直接點擊，在 375×812（內容常溢出視窗且需捲動）多次點空未命中；修正為「先 `scrollIntoView({behavior:'instant'})` 再讀取 post-scroll rect」兩段式，修正後三情境全數命中，佐證此為量測腳本問題非產品缺陷（唯一失手案例是 dungeon 連結搜尋迴圈，同一根因同一修法解決）。
- **鍵盤 ←/→**：於 lobby(2p/3p)、mission-select(2p，375×812)、achievements(2p/3p) 上重跑，聚焦「下一頁」鈕後 ArrowRight→ArrowLeft。3 頁情境（多一頁緩衝）全數正確來回；**2 頁情境**（lobby 於 1440×900/812×375、mission-select 於 375×812、achievements 於 1440×900/812×375）ArrowRight 到末頁後 ArrowLeft **未生效**（狀態卡在末頁）——瀏覽器原生行為：焦點所在的「下一頁」鈕在到達末頁後變 disabled，disabled 元素無法持有焦點，焦點掉回 `<body>`，之後的 ArrowLeft 事件不再從 `.game-pager` 內部冒泡，故 handler 收不到。**此為既有紅寶書已記錄的 design-debt 的鏡像案例**（P1 Task 3 review 記載的是「頁1 按 ArrowLeft→prev 鈕 disabled→焦點掉隊→後續 ArrowRight 失效」；本輪座標實測證實同一根因對稱地適用於任一方向到達邊界頁——**訂正/擴充**該筆記錄為雙向對稱，不只 ArrowLeft 單向），修法同樣是「當前鈕變 disabled 時把焦點移到另一顆箭頭」，維持遞延至最終修復波（未在本 gate 任務修動產品碼，符合「不代為修正」約束）。
- **`第 n / N 頁` aria-live**：即時 DOM 檢查 `.game-pager__status` 的 `aria-live` 屬性 = `"polite"`（原始碼與實測一致）。
- **箭頭 ≥44px**：三情境 × 全部 pager，共 44 顆箭頭量測，寬高最小值皆恰為 44px（CSS `min-width/min-height:44px` 生效），**零筆低於 44px**。
- **縱向捲動量測（批次核心目的驗證）**：見下方前後對照表。**console 全程 0 錯誤**（`console.error`/`pageerror` 監聽貫穿三情境全部頁面切換與點擊操作）。

**捲動量測前後對照表**（`.game-stage__scene` scrollHeight−clientHeight，375×812 為 `document.documentElement`；base=238dba9、tip=d5066ca，皆用 student.one 真實資料，測量時間相近但非同一秒，mistakes/achievements 絕對值受 Task 6/7 真跑測試造成的 DB 資料量變動影響，趨勢仍具參考力）：

| 頁面 | 1440×900 base→tip | 812×375 base→tip | 375×812 base→tip |
|---|---|---|---|
| lobby | 77→**0** | 795→**462** | 1313→**497** |
| mission-select | 0→0（無 chrome，兩者皆已 2 項全顯） | 406→406（無 chrome） | 436→**188** |
| dungeon | 213→213（無 chrome，設計如此） | 738→738（無 chrome） | 845→845（無 chrome） |
| shop・角色 | 1286→**321** | 2491→**1189** | 6663→**1275** |
| shop・外框 | 1284→**346** | 2469→**1201** | 6502→**1274** |
| mistakes | 3299→**1835** | 3824→**2360** | 5870→**2526** |
| achievements | 63→**115**（↑52，見下） | 983→**826** | 1505→**528** |

**已知例外（誠實記錄，非缺陷）**：achievements 於 1440×900 捲動量不減反增（63→115，仍遠小於一屏高度）。推測成因：9 項於 grid 固定欄數下本就只佔約 3 列；分頁後每頁 8 項的列數與未分頁 9 項相同（皆 ceil(n/欄數)=3 列），內容區高度幾乎不變，但新增的 `.game-pager__nav`（箭頭 44px + 間距）疊加約 50px 淨高——分頁「省列數」的效益在此特定項目數/欄數組合下為零，chrome 開銷即為淨增（無列數縮減可抵銷）。批次其餘 6/7 個頁面 × 情境組合捲動量全數顯著下降（shop 375×812 降幅最大：6663→1275，−81%），批次核心目的（消除長捲動）整體達成，此為單一邊界組合的可預期副效應，不影響其餘量測結論，記為 design-debt 觀察（非本 gate 修復範圍）。

**Step 4 對比電池**：131 筆 rendered 實測（三情境 × 每頁每個 pager 的 enabled 下一頁箭頭／disabled 上一頁箭頭／status／dot-on／dot-off，含 shop 兩籤＋mistakes 多群組），**全數 ≥4.5:1**（實測範圍 11.48:1–15.53:1，最低為 shop/achievements 系列 11.48:1，最高為 lobby/mistakes 系列 15.53:1）。Disabled 箭頭（非互動）比照量測入表，數值與 enabled 相同（顏色不受 disabled 影響，僅 opacity 0.45 視覺變化，對比公式取的是文字/圖形色與背景色，opacity 未納入計算——如需嚴謹計入視覺不透明度需另外複合背景色，此處記錄結構化色彩對比而非最終像素取樣值，供後續如需精算的起點）。

**Step 5 reduced-motion 雙通道**：`.game-pager__page` 於「頁面實際換頁後」的 `getComputedStyle().animationName` 在 1440×900／375×812 兩寬幅、兩通道（`prefers-reduced-motion:reduce` context option／`document.documentElement.dataset.reducedMotion='true'`）下皆為 **`none`**，四組全過。

**環境前置記錄**：本機 Supabase stack 執行前為 stopped，已 `supabase start` 重啟。working tree 另有一組非本批、非本 session 的未 commit 變更（`.gitignore`／`package.json`／`docs/content/*`／`scripts/content/*`／`login-page.tsx`／`supabase/seeds/content-*.sql`，研判為題庫 SSOT 平行 session WIP，沿用歷次 gate 慣例，已核實與本次結果無關、未觸碰、未 stage）。診斷用兩個暫時 git worktree（base 238dba9，分別用於 known-red 比對與 scroll 基線量測）已清除，未留痕。

**遞延事項（final-review fix wave 後狀態，見下方附錄）**：
1. ~~GamePager 邊界頁焦點流失（設計債，雙向對稱）~~ — **已修復**：`goToPage` 於邊界換頁時，若原本聚焦的箭頭即將 disabled，改把焦點移交給另一顆箭頭；`game-pager.test.tsx` 新增 RED→GREEN 迴歸測試（連續 ArrowRight 到尾頁後 ArrowLeft 仍生效）。
2. achievements 1440×900 捲動量 +52px — **CLOSED，裁定 ACCEPTED 孤立例外**：3 欄 grid 下 `ceil(9/3)=ceil(8/3)=3` 列，分頁在此項目數/欄數組合下完全無列數可省；pageSize 容量維持 8（不因此個案下修容量表）。不再列為待決。
3. shop 兩籤切換分頁狀態 — **CLOSED，非缺陷**：`ShopPage` 對角色籤直接掛 `<GamePager>`、對外框籤掛 `<FrameShopSection>`（內部另掛一顆 `<GamePager>`）——同一 JSX 位置兩種不同 element type，切籤即整棵子樹 unmount/remount，兩顆 pager 各自重新掛載回 `rawPage=0`；`page = Math.min(rawPage, pageCount-1)` 且 `pageCount = Math.max(1, …)` 保證 `page` 恆落在 `[0, pageCount-1]`，「切籤後停在空頁」情境結構上不可能發生（unreachable by clamp）。
4. dungeon（chapter-detail）多子主題分頁路徑 — **KNOWN-UNVERIFIED（真瀏覽器）**：目前所有已種子章節小節皆為單子主題，「同一小節內多個 GamePager」的分支只被單元測試覆蓋，從未在真瀏覽器對多子主題真實資料跑過。待 SSOT 題庫匯入管線帶入多子主題小節後補測，屬 follow-up 非本波範圍。
5. 教師端深度＝批⑤b（0% 未開工，沿用既有記錄）。

詳見 `.superpowers/sdd/paging-task-8-report.md`（含 `## Final-review fix wave` 附錄）。

**BATCH COMPLETE.**
P1 BATCH COMPLETE at cb969e4: opus whole-branch review Ready-to-merge=YES after final fix wave (F1 deferred arrow-focus handoff, F2 WIDE_QUERY landscape alignment, F3 ledger corrections, F4 remount comment, F5 e2e sync points). Batch commits 47eaf58..cb969e4 (9). Open non-blocking: rawPage staleness edge, disabled-arrow contrast exempt-noted, mission-select narrow 1/pp UX (owner-visible), lobby summary-compression spec sub-item dropped (scroll target met by paging alone), dungeon multi-subtopic KNOWN-UNVERIFIED until SSOT import. NOT merged/pushed per owner constraint.

## Teacher Workspace Batch (2026-08-02)

Task 1: assertion inventory + docs commit
Task 1: complete (commit cbd4a1e, review clean; Minor: inventory 行號偏移 91-110 實際 vs 93-104 記載，結論不受影響)
Task 2: complete (commit 319dc68, review clean; gate 待驗: .hud-menu__panel tabIndex=-1 聚焦外框視覺)
Task 3: complete (commit b31485a, review clean; Minor: forge 註解措辭與 DOM 略有出入—Live 控制台在 grid 外; gate 待驗: 夜窗對比/1024 兩欄 rendered)
Task 4: complete (commits 1ed5fc0+40e13a5, review clean after fix; Important 修復: 測試綁定 rank↔嚴重度)
Task 5: complete (commit 15e2c58, review clean)
Task 6: complete (commit ebf9128, review clean; Minor/gate 待驗: header muted p on parchment ≈4.68:1 壓線)
Task 7: complete (commit 1b5ce07, review clean)
Task 8: complete (commit 08820cf, review clean; info: medal ?? 'bronze' fallback 不可達防禦碼)
Task 9: complete (commits dc802f6+196fc31, review clean after fix; sizing 結論: assignments-live M/2 tasks, live-advanced L/4-5 tasks 需 owner 先裁 team/schedule 範疇, learning-experience S/2 tasks 優先)

### Task 10 收批（Gate 全電池＋真跑量測）

單元：`npx vitest run` 120 files / 831 tests 全綠。

e2e 子集（`tests/e2e/teacher-content.spec.ts classroom-leaderboard.spec.ts live-smoke.spec.ts app-shell.visual.spec.ts accessibility.spec.ts chapter-select.spec.ts` --project=chromium）：app-shell.visual 8/8 PASS 無快照 diff（符合 Task 1 盤點：不含教師頁快照）；accessibility 5/5 PASS；chapter-select 1/1 PASS。teacher-content.spec.ts 裸跑擲 `TEACHER_CONTENT_ACCEPTANCE_MODE_REQUIRED`（acceptance-mode 守門，預期）；`PLAYWRIGHT_ACCEPTANCE=on` 後於「匯入內容」heading 逾時——追查 `git show cbd4a1e^:src/app/router/create-app-router.tsx` 證實該路由/頁面早在本批 Task 1 之前（07-30 設計交付批）就已移除，src/ 全域找不到「匯入內容」字串，與本批 Task 1-9 無關，既知紅、不修、不在子集責任內。classroom-leaderboard.spec.ts 裸跑同構守門錯誤（預期）；補上 `SUPABASE_URL`/`SUPABASE_ANON_KEY`（本機 `supabase status`）＋`PLAYWRIGHT_EVIDENCE_ROOT` 後 1/1 PASS，證實非缺陷（沿用既有慣例，見本檔 655 行同類先例）。

live-smoke.spec.ts：**FAIL**（`createClassroom` 輔助函式 240s timeout）。根因：Task 5（commit 15e2c58）為 `/teacher/classes` 班級列表加上 `GamePager` 分頁；列表固定依 `created_at` 升冪排序（既有 migration `20260717000200`），`GamePager` 永遠從第 1 頁起始且無「新建項目所在頁自動導頁」邏輯；`live.host.teacher@colorplay.test` 帳號已累積 17-18 間班級（跨批次驗證殘留，超過 1 頁），新建的「Live冒煙班級」因此落在最後一頁，helper 的 `.last()` 只在當頁渲染的 DOM 內找，逾時找不到。這既是 Task 5 引入的真實迴歸，也是真實產品缺陷：任何累積班級數 >1 頁的教師新建班級後，新班級在列表上不可見，除非手動翻頁到底。修法（排序反轉／新建後自動跳頁／toast 捷徑）屬 JS 邏輯與產品決策，超出 Task 10「量測不改樣式，唯一例外聚焦補丁」的 CSS-only 回修授權，**不擅自修**——記為 BLOCKING，建議另立 fix wave，先由 owner 裁決 UX 方向。

Step 3 真跑量測（`teacher@colorplay.test` + `live.host.teacher@colorplay.test`，1440px 起手，rendered `getComputedStyle`，沿祖先鏈正確 alpha 疊色）：

對比全數 ≥4.5:1——dashboard/detail header intro p（muted on parchment）4.68／4.69（Task 6 壓線項確認過關）；夜窗 title 14.56、description 7.74（Task 3 待驗項過關）；analytics `.teacher-analytics-section > h2`（賢者窗語彙，`.sage-title-bar` 本身在 src/ 零消費者、死 CSS，非本批引入，僅記錄不清理）12.53；`.teacher-error-card__severity`（coral-700，於 `teacher@colorplay.test` 資料下量得，liveHostTeacher 當前無觸發嚴重度卡片）5.12（Task 4 待驗項過關）；票券碼 `.classroom-card__code-value` 11.48；classroom detail `.sage-page-header h1` 12.53；live-launch `.live-launch__field label`（gold-deep）5.30（Task 7 待驗項過關）。

觸控：`.pixel-command` 指令鈕 437.13×56、MENU 鈕 71.61×44、`GamePager` 箭頭 44×44、Live `footer.live-presenter__controls` 唯一鈕（lobby「開始第一題」）192×52 皆已達標；**`.classroom-card__copy` 複製鈕 50×32 未達 44px**——回修：globals.css 檔尾追加 `.classroom-card__copy { min-height: 44px; }`（僅此一條，字級/內距/顏色不動），重跑後 50×44 過關。

`.hud-menu__panel:focus` 視覺確認（Task 2 待驗項）：programmatic focus（tabIndex=-1）下 `getComputedStyle(...).outlineStyle === 'none'`，截圖亦無外框——**不需要**預授權的 focus-outline 補丁，未套用。

1024/1440 溢出：classroom-detail／classes-list／analytics／live-launch-forge 四頁兩寬度下 `document.documentElement.scrollWidth === clientWidth`（零橫向溢出）；`.ui-table` 首欄 classroom-detail 80.28/91.19px、analytics 285.2/322px；`git diff cbd4a1e..196fc31 -- src/styles/globals.css` 確認 `.ui-table` 零改動，故「與 base 相同」在本批下必然成立。

Debt 移交：1) **live-smoke.spec.ts 迴歸（BLOCKING，未修，見上）**；2) sizing 報告結論（Task 9）：assignments-live M/2 tasks、live-advanced L/4-5 tasks 需 owner 先裁 team/schedule 範疇，learning-experience S/2 tasks 優先；3) toast 錨定另議；4) skip-link 卷動邊界低影響未做；5) `.sage-title-bar` 死 CSS，僅記錄不清理。

Commits（Teacher Workspace Batch 全批）：cbd4a1e 319dc68 b31485a 1ed5fc0 40e13a5 15e2c58 ebf9128 1b5ce07 08820cf dc802f6 196fc31 + 本收批 commit。

**BATCH GATE: CONDITIONAL** — 單元／視覺快照／可及性／對比／觸控全綠（觸控 1 項回修後過關）；e2e 發現 1 項 Task 5 迴歸（live-smoke，累積班級 >1 頁時新建班級在列表上不可見）未修、阻擋 clean merge，待 owner 裁決 fix wave 範圍後再議合併。詳見 `.superpowers/sdd/teacher-task-10-gate-report.md`。

### Fix Wave 1（live-smoke 迴歸修復，2026-08-02）

Owner 裁定：`GamePager` 增加 optional 受控跳頁機制 `followTail?: boolean`（預設 false，向後相容擴充，學生端五頁零接觸）——items.length 增加時自動跳到含最後一項的頁；`TeacherClassroomsPage` 掛上此 prop，建班成功→owned 清單 invalidate→refetch 多一筆→自動跳末頁，新班級卡片立即可見。TDD：`game-pager.test.tsx` 新增 2 條（followTail 增項跳末頁／未傳 followTail 增項不跳頁），`teacher-classrooms-page.test.tsx` 新增 1 條（7 班溢出→提交表單建第 8 班，mutation stub 驅動 owned 清單 refetch→新卡片可見、頁碼「第 2 / 2 頁」），皆先紅後綠（暫時 `git stash` 掉實作檔取得紅色輸出、`stash pop` 復原取得綠色輸出，未動測試檔）。commit f477e4a（4 檔，118 insertions，`npx prettier --check` 過；eslint 對本次改動零新增錯誤，teacher-classrooms-page.test.tsx lint 2 筆為本批 Task 5（15e2c58）引入，已於終審 fix wave 修正）。`npx vitest run src/components/ui/game-pager.test.tsx src/features/classrooms/pages/teacher-classrooms-page.test.tsx` 15/15 PASS；`npx vitest run src/features/classrooms` 35/35 PASS（無回歸）。`npx playwright test tests/e2e/live-smoke.spec.ts --project=chromium`（本機 Supabase stack 已起、補 `SUPABASE_URL`/`SUPABASE_ANON_KEY` 沿既有慣例）**1/1 PASS**（5.0s），live-smoke 迴歸關閉，Teacher Workspace Batch 由 CONDITIONAL 轉為可合併狀態（webServer 內建 `tsc -b && vite build` 亦綠，型別/建置無新增問題）。詳見 `.superpowers/sdd/teacher-fixwave-1-report.md`。
Task 10: complete (commit a73b60a, gate PASS after fix wave; 44px 補丁 .classroom-card__copy min-height)
Fix wave 1: complete (commits f477e4a+d0ab54c, owner 裁定 followTail; live-smoke 1/1 轉綠; Minor: followTail 跳頁未經 goToPage 焦點交接—窄路徑)

### Final review fix wave（opus 終審，2026-08-02）

C1 lint error 修正（teacher-classrooms-page.test.tsx sevenClassrooms fixture 174-175 行 `String(index + 1)`）＋M4 CSS 註解更正（globals.css `.teacher-dashboard-grid--forge` 上方）＋兩處歸屬更正（progress.md fix wave 行、teacher-task-10-gate-report.md `.sage-title-bar` 兩處）。debt 移交清單增補：

- I1: `tests/e2e/helpers/classrooms.ts` 的 `findClassroomIdByName`/`readClassroomJoinCode` 仍假設整份清單在 DOM——分頁後目標班級不在當頁會 silent null/逾時（目前靠 created_at 升冪巧合豁免）；`capture-screens.mjs` 兩呼叫端受影響。
- M1: `.sage-title-bar`（`src/styles/globals.css`，Task 3 引入）死 CSS 零消費者——下批決定接用或移除。
- M2: `.sage-page-header h1` font-size 22px 在 detail/progress 兩頁被 `.teacher-dashboard-header__intro h1` 的 clamp 壓過（specificity），僅 live report 生效——同類異尺寸，視覺一致性 debt。
- M3: `GamePager` followTail 跳頁走 `setRawPage` 未經 `goToPage` 焦點交接（`src/components/ui/game-pager.tsx`）——焦點停在即將 disabled 箭頭時會掉回 body（窄路徑）。
- M4-spec: spec §2 工坊台「三欄／Live 置左主位」未落地（已核准計畫即為全寬置頂＋兩欄）——下批若要三欄需重新提案。
- token: `--font-pixel-latin` 無 `@font-face` 全站 fallback monospace（既有 repo 級 debt，票券碼同受影響）。
- 對比壓線: `--color-muted` on `--pixel-parchment-card` 實測 4.68:1（達標但無餘裕）。

### Final approval (2026-08-02)
Opus 終審 Ready-to-merge @ a61ce0a（54f20a4..a61ce0a，15 commits）。四 gate 全綠（eslint 0 err / vitest 834 / tsc 0 / prettier）；鐵律全數通過（LivePresenter 0 行、ui-table 0 命中、濃度全頁 ≤3、commit 隔離 15/15）。debt 7 筆已列於 Final review fix wave 節，I1（classrooms e2e helper 分頁假設）優先。紅 spec 重寫待 owner 依 2026-08-02-red-spec-sizing.md 裁定。

## Live Team Removal Batch (2026-08-02)

Task 1: assertion inventory + docs commit
Task 1: complete (commits 6e7f5a9+640a252, review clean after fix; Important 修復: inventory mapActivity 措辭)
Task 2: complete (commit ae3b807, review clean; Minor 移交: globals.css:6542 歷史註解殘留 live-team-scoreboard 字樣)
Task 3: complete (commit a7452ed, review clean)
Task 4: complete (commits bdc6bf2+943ffed, review clean after fix; Important 修復: createSession receipt 保留鍵覆蓋測試補回)

Task 5 (Gate＋ledger 收批): **PASS**（commits under review 6e7f5a9..943ffed，base 02788ce）。全套驗證：vitest 120 files/830 tests 全綠（舊基線 834−4，符合 team 測試刪減預期）；`tsc -b --pretty false` 0 錯；`eslint . --max-warnings 0` 0 錯/警告；e2e 3 支 chromium 全綠——`chapter-select.spec.ts` 1/1、`classroom-leaderboard.spec.ts`／`live-smoke.spec.ts` 補上 `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`PLAYWRIGHT_ACCEPTANCE=on` 後各 1/1 PASS（裸跑時 classroom-leaderboard 擲 `CLASSROOM_LEADERBOARD_ACCEPTANCE_MODE_REQUIRED`、live-smoke 因 `SUPABASE_URL` 未設定被 skip，皆既有 phase-gate/skip 設計，非本批缺陷，見 progress.md:655 同類先例）。

頒獎台真跑目檢：沿 live-smoke 流程（liveHostTeacher 建班開場＋liveStudentOne 全程作答至 10/10）另跑一支拋棄式 spec（僅存在於本次執行期間，跑畢即刪，未提交），單一參與者結算後截圖學生頒獎台（`挑戰結束！`／第 1 名／1497 分卡片）與投影頒獎台（`最終頒獎台`／冠軍卡置中／`結算成績`已消失換`離開投影`），兩張版面皆無空洞或錯位——team scoreboard 移除後單卡置中收攏正常，未留殘餘空白區塊；`console`/`pageerror` 兩側各 0 筆（腳本內建斷言，執行輸出 `PODIUM_CHECK_RESULT {"presenterConsoleErrors":[],"studentConsoleErrors":[]}`）。截圖：`$SCRATCH/podium-check/presenter-podium.png`、`$SCRATCH/podium-check/student-podium.png`（拋棄式 scratchpad，未入庫）。

被刪字串清單（Task 2-4 累計）：元件 `LiveTeamScoreboard`（`live-team-scoreboard.tsx` 整檔刪除）；`live-session-page.tsx` 三處 waiting-for-next／reveal／completed 引用點；`teacher-live-report-page.tsx` team-mode header 行＋排名清單「・第 N 隊」尾綴；`live-phase-view.ts` 的 `showScoreboard` 欄位／型別；`live-repository.ts` 的 `getTeamTotals`／`scheduleActivity` 函式；`use-live-commands.ts` 的 `useLiveTeamTotals`／`useScheduleLiveActivity` hooks；`types.ts` 的 `LiveSessionMode`／`LiveTeamTotal` 型別與 `mode`/`teamCount`/`teamNumber`/`scheduledFor` 前端欄位；`listMyActivities` select 字串與 `activityRowSchema` 的 `scheduled_for` 鍵。全部經 `grep -rln` 於 `src/` 複驗 0 命中殘留。

DB 能力保留無人呼叫：strict-schema 鐵律下，`sessionReceiptSchema`／`stateSchema`／`sessionDetailSchema`／`activitySchema` 四支 RPC 回應 schema 保留 `mode`/`team_count`/`team_number`/`scheduled_for` 鍵（後端仍回傳，parse 需要）；僅 `listMyActivities` 的前端可控 select 字串＋`activityRowSchema` 這一側移除 `scheduled_for`（RPC 側保留鍵×4、select 側移除×1，與 Self-Review 紀錄的策略定案一致）。後端 `public.live_team_totals(p_session_id uuid)`（`20260720000200_live_teams.sql:238`）與 `public.schedule_live_activity(uuid, timestamptz)`（`20260720000300_live_insights.sql:399`）兩支 DB function 本批未動，前端呼叫端已於 Task 4 全數移除（`getTeamTotals`/`scheduleActivity`），現為死能力；對應 pgTAP（`supabase/tests/033_live_teams.test.sql`、`034_live_insights.test.sql`）仍在跑，覆蓋未失效。

Debt 移交：(1) 後端 team/schedule RPC（`live_team_totals`／`schedule_live_activity`）與其 pgTAP 屬死能力，未來 DB 清理另議，本批不動；(2) 紅 spec 重寫批（`live-advanced.spec.ts` 等 phase-gate acceptance spec）將以無 team 版本重寫，非本批範圍；(3) Task 2 移交的 `globals.css:6542` 歷史註解殘留 `live-team-scoreboard` 字樣，未清。

**Live Team Removal Batch 最終裁決：PASS，Ready-to-merge。** 全批 commits：`6e7f5a9 640a252 ae3b807 a7452ed bdc6bf2 943ffed`（Task 5 為純驗證，無 src 異動，本 ledger 收批 commit 另計）。
Task 5: complete (commit f2833ff, gate PASS: vitest 830/120 files, tsc 0, eslint 0, e2e 3/3, podium 截圖乾淨 console 0)

### Final approval (2026-08-02)
Opus 終審 Ready-to-merge @ f2833ff（e3708c4..f2833ff，7 commits）。零必修；Minor 移交：globals.css:6542 懸空註解參照（升級記載）、live-pages.test.tsx:571 空行殘留。鐵律全過：DB/LivePresenter/live-advanced 零接觸、strict-schema 四保留鍵在位、被刪字串不超清單、commit 隔離 7/7。vitest 830/tsc 0/eslint 0 複驗一致。

## HUD Menu Reorg Batch (2026-08-02)

Task 1: assertion inventory + docs commit
Task 1: complete (commit 44d822e, review clean; 關鍵: 綠 e2e 零受影響/快照零重拍/面板 night-deep gold active 5.6 需 gate 實測)
Task 2: fix round 1/5 (1 addressed, 0 open; commit e90ed79)
Task 2: complete (commits 44d822e..e90ed79, independent review clean; shell 28/28)
Task 3: openHudMenu helper complete (commit 379a422; panel-era nav helper, snapshots zero diff)
Task 3: playable-slice relogin assertion sync complete (commit 12fa5b8; 非 HUD 回歸、歸因 4ed21f8 UAT 0727 #5，原跨帳號安全語意保留)
Task 3: minor (deferred): tests/e2e/helpers/auth.ts 模組註解仍稱 helper 不含 expect，交 Final review 裁定
Task 3: complete (commits 379a422..12fa5b8, review approved; focused 1/1, Chromium subset 10/10, prettier pass)
Task 4: minor (deferred): teacher unit test 未直接斷言 economy/inventory hooks 零呼叫，Task 5 browser gate 覆蓋教師零經濟
Task 4: minor (deferred): equipped/fallback 頭像 DOM 未分態單元覆蓋，Task 5 以兩態真實截圖驗證
Task 4: complete (commit d049743, review approved; shell 30/30, tsc 0, eslint 0, prettier pass)

Task 5 (Gate＋ledger 收批): **PASS（fallback 分支為明確揭露的 network-intercept simulation，非 genuine 未裝備帳號）**。全套 fresh gate：`npx vitest run` 120 files / 833 tests 全綠；`npx tsc -b --pretty false` exit 0、零 diagnostics；`npx eslint . --max-warnings 0` exit 0、零 errors/warnings；指定六支 Chromium e2e 實際展開 13/13 PASS（`app-shell.visual` 8/8，`classroom-leaderboard`／`live-smoke`／`auth-account`／`chapter-select`／`playable-slice` 各 1/1）。本機 public Supabase env 由 `supabase status -o env` 經 `scripts/supabase/load-local-environment.sh` 載入，service-role vars 已 unset、值未輸出；沿用既有 `http://localhost:5173`，未重啟 server。e2e 證據位於 `/tmp/hudreorg-e2e.Er8DA3`。

真跑量測使用 `TEST_USERS.studentOne`／`TEST_USERS.teacher`、rendered `getComputedStyle` 前景＋祖先背景 alpha 疊色；學生/教師各在 375×667、812×375 驗證列上全部互動項、MENU、開面板後全部 nav link 與登出鈕。結果：

| viewport | role | scrollWidth / viewport | leftmost x | rightmost right | top identity right | min touch | min contrast | console/pageerror | inventory RPC |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 375×667 | student | 375 / 375 | 8 | 367 | 323.72 | 44px | 5.09:1 | 0 / 0 | 2 |
| 375×667 | teacher | 375 / 375 | 8 | 367 | 191.08 | 44px | 5.59:1 | 0 / 0 | 0 |
| 812×375 | student | 812 / 812 | 8 | 804 | 323.72 | 44px | 5.09:1 | 0 / 0 | 2 |
| 812×375 | teacher | 812 / 812 | 8 | 804 | 191.08 | 44px | 5.59:1 | 0 / 0 | 0 |

全部 bounding boxes 皆 `x >= 0` 且 `right <= viewport`，所有受測互動項高度 ≥44px；教師兩寬度 `.hud-economy-group` 0 個且 inventory RPC 0，學生兩寬度 `.hud-top__identity` 0 個。對比各類最小值/實際色：面板 default 15.97:1（`rgb(244, 241, 228)` on `rgb(16, 20, 46)`）、active gold 5.59:1（`rgb(184, 134, 47)` on `rgb(16, 20, 46)`）、教師歡迎 14.24:1、學生 Level 14.24:1、XP 14.24:1（後三者 `rgb(246, 238, 216)` on `rgb(23, 28, 63)`）、Token 5.09:1（`rgb(184, 134, 47)` on `rgb(23, 28, 63)`）；全數 ≥4.5:1。

頭像兩態證據：genuine equipped=`inventoryStudentOne`，`BlookArt=true`／`hero=false`，截圖 `/tmp/hudreorg-task5.mFwxuv/avatar-equipped-inventoryStudentOne.png`。只讀掃描 `TEST_USER_ROLES` 全 16 個學生 fixture 的穩定 DOM 全為 equipped（`BlookArt=true`／`hero=false`）；這與 `profiles.active_blook_id NOT NULL`、新 profile 預設 `little_fox`、repository strict contract 恰一 equipped 相符，故**不存在 genuine 未裝備 fixture**。第二張以 `inventoryStudentTwo` 單一 disposable context 只攔截 `get_my_blook_inventory`、回 handled 200 invalid shape 模擬 inventory-error fallback，不改 DB/fixture；兩次攔截後 `hero=true`／`BlookArt=false`、console/pageerror 0/0，截圖 `/tmp/hudreorg-task5.mFwxuv/avatar-fallback-simulated-inventoryStudentTwo.png`。此圖只證明 error fallback，不宣稱 genuine unequipped。

Debt/minors 移交：(1) `tests/e2e/helpers/auth.ts` 模組註解仍稱 helper 不含 `expect()`，但 `openHudMenu` 已使用 `expect`；documentation-only minor；(2) 教師 hooks 零呼叫未有直接 unit assertion，本 gate 以兩 viewport 的 DOM absence＋inventory RPC 0 補 browser 證據；(3) genuine unequipped state 在現行 schema/repository/fixtures 不可表示，若產品要支援須另案裁定 schema contract，不能靠 gate 改帳號湊證據。無 `globals.css` 回修、無產品碼異動。

Commits（HUD Menu Reorg Batch 收批前完整清單）：`44d822ec5d4a04223c43e283925b7e5639ddf128 fd953b508cd33fa0444319e16a0b3b85129298a4 4c753d191ee9995ac3f5b1f2d7d4cb850ee1b365 e90ed791bd2d5c43c3300cd4e1be1ddbcfdf2d12 2460242ebe19a40d52645f76188eff7a661e6f75 379a422630ffc03a98c5405ecd6d5513b1bd57ba 12fa5b86a819b9158757e6fa7c79595916929270 838dbd03b03adefda7b128d9f33a24a60fbd722e d04974336dce88de4da419bef03c0fb24f37c40b 146fd765f92a9026f43c0abbe0970ae20fd6af86`；本 Task 5 收批 commit 另計。

**HUD Menu Reorg Batch 最終裁決：PASS，Ready-to-merge；fallback 證據限制已揭露，不得解讀為 genuine 未裝備帳號。** 完整命令、輸出、量測 script path、自評見 `.superpowers/sdd/hudreorg-task-5-report.md`（報告不提交）。

Task 5: fix round 1/5 (logout right-edge addressed, 1 Important closed, 0 open)。初版 `/tmp` 量測已收集 `.hud-menu__logout` 至 `panelItemBoxes` 並納入 44px gate，卻以 `rowBoxes + panelNavBoxes` 聚合 containment，故登出鈕未進 right-edge failure condition；修正為 `containmentBoxes = rowBoxes + panelItemBoxes`，逐項產出 `outOfBoundsBoxes` 並以非空為 failure，top identity 另以 `identityOutOfBounds` 獨立判定，touch gate 維持 row＋全部 panel items。

Corrected focused measurement fresh rerun（同一 live 5173、public local Supabase env，service-role unset、值未輸出）：375×667 student/teacher 均 `outOfBoundsBoxes=[]`、identity=false、leftmost 8、rightmost 367、min touch 44px、min contrast 5.09/5.59、console/pageerror 0/0；812×375 student/teacher 均 `outOfBoundsBoxes=[]`、identity=false、leftmost 8、rightmost 804、min touch 44px、min contrast 5.09/5.59、console/pageerror 0/0。logout 個別座標於 375 寬為 x=182/right=352、812 寬為 x=619/right=789，皆完整落在 viewport；`scrollWidth` 仍分別為 375/812。fallback 與全套 gate 不受 aggregation 修正影響，未重跑；產品碼/CSS 零異動。完整 fix-round command/output 見未提交 `.superpowers/sdd/hudreorg-task-5-report.md`。

Task 5: complete (commits c6239dc..ac34e3a, scoped re-review clean; full gate PASS, corrected four-cell containment PASS)

### Final review (2026-08-02)

Whole-branch review range `44d822e..3739031`。最終 reviewer 先發現 812×375 學生 MENU 垂直不可達（panel `-59..319`、首項 `-44..0`）；唯一 final fix wave `3739031 fix(shell): keep hud menu reachable in short landscape` 加入 short-landscape viewport-aware max-height＋內部捲動，scoped re-review 判定 **ADDRESSED**、無新 Critical/Important。修後 812×375 學生 panel `16..319`，首項 `31..75`、末項 `scrollIntoViewIfNeeded()` 後 `260..304`；四格 horizontal/vertical/unreachable lists 全空。

| 鐵律 | 終審結果 |
| --- | --- |
| 行為與檔案邊界 | PASS：route/API/RPC/scoring、LivePresenter 零 diff；inventory/economy 僅既有 hook 唯讀消費。 |
| 載重字串 | PASS：11 個導覽標籤在 production 各恰 1 次且路徑/分配正確；`MENU`/`登出`/displayName 與列上 `主要導覽`/`教師導覽` 不漂移；新增 payload 僅 `歡迎，` 與單一 `aria-label="更多導覽"`（另一 grep 命中為 source comment）。 |
| MENU 機制 | PASS：hidden、aria-controls、click-outside、focus-in、Escape 回 toggle 零改；7 個 panel NavLink 均 `onClick={closeMenu}`。 |
| 測試授權 | PASS：shell assertion 同步均在 inventory；`playable-slice:138` 依 owner 授權與 `4ed21f8` UAT 0727 #5 同步，跨帳號拒絕語意保留；八支 known-red blob 零變。 |
| Commit 隔離 | PASS：`44d822e..3739031` 共 13 commits，13/13 有指定 Co-Author trailer；逐 commit stat 無 `.gitignore`、docs/content、package、login-page、seed、artifacts、live、contracts 等禁止檔。 |
| Fresh gates | PASS：Vitest 120 files/833 tests；tsc 0；eslint 0；指定六支 Chromium 13/13；snapshots 零 diff；四格 scrollWidth=viewport、rightmost 367/804、min touch 44px、min contrast 5.09:1、console/pageerror 0。 |
| Avatar 證據 | PASS with disclosed limitation：genuine equipped BlookArt 圖成立；schema `active_blook_id NOT NULL`＋strict exactly-one-equipped 使 genuine unequipped fixture 不可表示，第二張僅為 disposable network-intercept inventory-error hero fallback，未冒充 genuine、未改資料。 |

Deferred non-blocking debt：(1) `tests/e2e/helpers/auth.ts` 模組註解仍稱 helper 不含 `expect()`；(2) teacher hooks 零呼叫欠直接 unit assertion，但 source 分支與兩 viewport inventory RPC 0 已佐證；(3) equipped/fallback 欠分態 unit coverage，現有 genuine equipped＋simulated error fallback browser 證據足夠本批。三項均經 final reviewer 判定 Minor，不阻擋。

**Final review verdict：PASS，Ready-to-merge。** 本工作未 push、未 merge、未 deploy；`feature/v2-major-update` 保持原樣交 owner 決定整合。
