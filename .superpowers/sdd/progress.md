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

Status: STOP after Phase 3 closure; do not begin Assignments, Live, remediation, mastery, teacher analytics, privacy controls, or any other phase without a new project-owner instruction.
