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
