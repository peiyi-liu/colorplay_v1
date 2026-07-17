# ColorPlay Phase 4 Assignments and ColorPlay Live Core Implementation Plan

> **For agentic workers:** Execute this plan task-by-task in one continuous session. Track every step with its checkbox and stage this plan's checkbox updates in the same task commit. One complete-range review after the final task, one disposable headless precheck, then one formal phase gate.

**Goal:** Deliver teacher-owned assignments with server-derived completion, and the first-party ColorPlay Live classroom challenge (create/join/lobby/question/answer/feedback/finalize) with private Realtime, reconnect recovery, duplicate-host protection, atomic rewards, and privacy-safe ranking, satisfying `AC-ASN-001`–`AC-ASN-006` and `AC-LIVE-001`–`AC-LIVE-012`.

**Architecture:** PostgreSQL owns assignment lifecycle, attempt limits, Live state machine, deadlines, hidden answers, scores, ranks, rewards, and audit. Live state transitions use `state_version` compare-and-set; PostgreSQL is the system of record and Realtime only transports committed state (`realtime.send` inside the transaction delivers after commit). Assignments reference authoritative quiz sessions instead of copying scores. React consumes strict privacy-safe projections; reconnecting clients reconcile through `get_live_session_state` by version.

**Tech Stack:** PostgreSQL/Supabase migrations, RLS, security-definer RPCs, `realtime.messages` RLS, pgTAP; React 19, TypeScript strict, React Router, TanStack Query, supabase-js Realtime channels, Zod, Vitest/RTL, Playwright, pnpm.

## Global Constraints

- Baseline is exactly `dc7704999ab2dc0223ea529fcabbef5281b6a40a` (Phase 3 closure); commit this plan before Task 1 as `docs: add Phase 4 assignments and live core plan`.
- Worktree: `/Users/guanyucheng/Desktop/pei-game/colorplay/.worktrees/colorplay-platform-foundation`. Do not modify prior migrations; additive migrations start at `20260717000400`, pgTAP files at `014`.
- Every behavior change is RED → GREEN; migrations start with a failing scoped pgTAP test; pgTAP counts are scoped to test-created UUIDs.
- Task-level checks: Prettier on changed files, lint, typecheck, affected tests only. No E2E/headed/evidence before the single phase gate. Runners and manual verification order reset → `scripts/supabase/wait-for-postgrest.sh` → seed.
- Integration cleanup uses `signOut({ scope: 'local' })`. Tests that mutate or exactly assert economy/assignment/Live state use the dedicated accounts added in Task 5; shared `studentOne/studentTwo` stay reserved for state-tolerant flows and the gate E2E (which resets first).
- Browser negative paths declare each expected 4xx (URL pattern, status, count) through the existing browser-health declaration API; 5xx is never declarable; negative-path browser contexts close immediately after their denial assertions.
- Browser code never receives correct options, other participants' raw answers, Email, student numbers, join-code plaintext (beyond one-time host receipts), hashes, or `service_role`. Client clocks, counters, scores, and versions are never trusted.
- Live rewards use the ledger source labels reserved in Phase 1 (`assignment`, `live`); no new economy source enum value is created. Unique `(user_id, source_type, source_id)` plus row locks keep finalize idempotent.
- Kahoot branding/assets/APIs are not used. Team mode, pause/resume, spectator, streak visuals, and capacity expansion remain Phase 7. Remediation purpose is reserved, not implemented.
- Do not touch hosted Supabase, Vercel, GitHub settings, or production. Do not run the deferred global `pnpm acceptance`.

## Locked interfaces

### Reward and rules versions (Task 1 writes these into `spec/05` §17 before any code)

- Live rules version `2026-07-live-1`: per correct answer, XP 75 / Token 25 when server response ≤ 5,000 ms, otherwise XP 50 / Token 15; incorrect/timeout 0/0. Rewards are written only by `finalize_live_session` as one XP row and one Token row per participant with `source_type = 'live'`, `source_id = live_session_id`. Live sessions do not consume the daily practice full-reward quota and never enter mastery.
- Assignment completion mints no additional ledger rows: the referenced session's own finalize rewards are the reward. Passing rule `score_at_least` with an integer threshold; completion/pass derive inside the referenced session's finalize transaction.
- Assignment attempts on quiz templates run ordinary quiz sessions with `purpose = 'assignment'`; those sessions keep the existing quiz reward rules including daily decay per template.

### Database enums and tables

```sql
create type public.assignment_status as enum ('draft','published','paused','archived');
create type public.assignment_activity_type as enum ('quiz_template','live_activity');
create type public.assignment_attempt_status as enum ('in_progress','completed','expired','abandoned');
create type public.quiz_session_purpose as enum ('practice','assignment','remediation');
create type public.live_session_state as enum ('draft','lobby','question_open','question_feedback','completed','cancelled');
create type public.live_participant_status as enum ('active','left','removed');
```

- `assignments(id, classroom_id, owner_teacher_id, title 1..120, activity_type, quiz_template_id?, live_activity_id?, available_from timestamptz?, deadline_at timestamptz?, attempt_limit int? >0, passing_rule jsonb, status, rules_version, created_at, updated_at)`; exactly one activity reference matches `activity_type`.
- `assignment_targets(assignment_id, user_id, created_at)` primary key `(assignment_id, user_id)`; targets snapshot active student members at publish and may be extended by the owner.
- `assignment_attempts(id, assignment_id, user_id, attempt_number, quiz_session_id?, live_session_id?, status, passed boolean?, started_at, completed_at?)`; unique `(assignment_id, user_id, attempt_number)`; unique partial index on the session references; at most one session reference at the schema level, and trusted commands always set exactly one.
- `alter table public.quiz_sessions add column purpose public.quiz_session_purpose not null default 'practice', add column assignment_attempt_id uuid` (additive; FK to attempts, null for practice).
- `live_activities(id, owner_teacher_id, title 1..120, quiz_template_id, question_time_limit_seconds int default 20 check between 5 and 120, status ('active','archived'), rules_version, created_at, updated_at)`.
- `live_sessions(id, live_activity_id, host_teacher_id, classroom_id, assignment_id?, state, join_code_hash bytea, join_code_version int, current_position int, state_version int not null default 1, question_count int, opened_at?, completed_at?, cancelled_at?, rules_version, created_at, updated_at)`.
- `live_participants(id, session_id, user_id, status, score int not null default 0, final_rank int?, joined_at, left_at?)`; unique `(session_id, user_id)`.
- `live_session_questions(id, session_id, position, question_stable_code, question_version, prompt, public_options jsonb, correct_option_id uuid, explanation, opened_at?, deadline_at?, closed_at?)`; unique `(session_id, position)`; `correct_option_id`/`explanation` are never column-granted to `authenticated`.
- `live_answers(id, session_question_id, participant_id, selected_option_id?, answer_status ('correct','incorrect','timeout'), response_ms int?, score_delta int, idempotency_key uuid, submitted_at)`; unique `(session_question_id, participant_id)` and `(participant_id, idempotency_key)`.

### Trusted commands (all security definer, fixed `search_path = pg_catalog, public`, revoke `public/anon`, verify `auth.uid()`, pgTAP negative tests)

```sql
-- assignments
public.create_assignment(...) / public.update_assignment_status(p_assignment_id uuid, p_status public.assignment_status, p_expected_updated_at timestamptz)
public.list_classroom_assignments(p_classroom_id uuid)      -- owner
public.list_my_assignments()                                 -- targeted student
public.start_assignment_attempt(p_assignment_id uuid, p_request_id uuid) -- locks; validates target/availability/deadline/limit; creates quiz session purpose='assignment'; idempotent per request id
-- finalize_quiz_session (replaced additively): when session.purpose='assignment', derive attempt completion/pass in the same transaction

-- live
public.create_live_activity(...) / public.create_live_session(p_live_activity_id uuid, p_classroom_id uuid, p_assignment_id uuid default null)
public.rotate_live_join_code(p_session_id uuid)
public.join_live_session(p_join_code text, p_request_id uuid)
public.get_live_session_state(p_session_id uuid)             -- role-aware safe projection with state_version
public.start_live_session(p_session_id uuid, p_expected_version int)      -- freezes questions
public.open_live_question(p_session_id uuid, p_expected_version int)
public.submit_live_answer(p_session_question_id uuid, p_selected_option_id uuid, p_idempotency_key uuid)
public.close_live_question(p_session_id uuid, p_expected_version int)     -- writes timeout answers, reveals per-option counts
public.advance_live_session(p_session_id uuid, p_expected_version int)
public.finalize_live_session(p_session_id uuid, p_expected_version int)   -- atomic: score/rank/rewards/achievements/assignment/audit
public.cancel_live_session(p_session_id uuid, p_expected_version int)
```

Join codes reuse the Phase 3 pattern: `extensions.gen_random_bytes(8)` → 16 uppercase hex shown in four groups, stored only as `extensions.digest(normalized,'sha256')`, unique index, generic invalid-code error. Every state transition requires the exact `p_expected_version`, increments `state_version` by one, and stale versions raise `CONFLICT` without changes. Ranking tie-break: score desc, time of last correct answer asc, participant `user_id` asc (hidden).

### Realtime boundary

- Topic `live-session:<session_id>` (private channel). `realtime.messages` RLS: host may receive/send on own session topic; active participants may receive and use Presence; outsiders have no policy. Students cannot broadcast host transitions (no student send policy for broadcast).
- Server functions emit via `realtime.send` after state writes in the same transaction (delivery is post-commit): payload only `state_version`, `state`, `current_position`, public question payload, server deadline, answered/participant counts, and result-ready flags. Never correct options before close, individual answers, Email, or rewards.
- Clients reconcile every message and every reconnect by calling `get_live_session_state` when the received `state_version` is not exactly `local_version + 1`.

### Routes (exact `spec/01` Phase 4 rows)

```text
/app/assignments                              targeted student list
/app/assignments/:assignmentId                student detail + start attempt (enters quiz runner)
/app/live/join                                student code entry
/app/live/:sessionId                          participant lobby/question/feedback/result
/teacher/classes/:classroomId/assignments     owning teacher assignment management
/teacher/live                                 teacher live activity list/create/start
/teacher/live/:sessionId                      host console
```

### Exit traceability

| Exit AC       | Primary tasks  | Decisive proof                                                                                                   |
| ------------- | -------------- | ---------------------------------------------------------------------------------------------------------------- |
| `AC-ASN-001`  | 2, 3, 5        | owner-only create/update pgTAP + teacher UI + cross-teacher denial                                               |
| `AC-ASN-002`  | 3              | lifecycle transition matrix incl. `archived → published` rejection                                               |
| `AC-ASN-003`  | 3, 4           | concurrent attempt starts + idempotent request id under limit                                                    |
| `AC-ASN-004`  | 3, 4, 6        | fake client completion ignored; finalize derives completion once                                                 |
| `AC-ASN-005`  | 3, 5, 6        | UTC authority + Taipei display + client-clock immunity                                                           |
| `AC-ASN-006`  | 2, 3, 4        | cross-class read/start/submit denial without metadata leaks                                                      |
| `AC-LIVE-001` | 7, 8, 11, 12   | authenticated create/join, hashed codes, outsider denial                                                         |
| `AC-LIVE-002` | 10, 13         | private topic policies; outsider subscribe fails; student host-event denied                                      |
| `AC-LIVE-003` | 8, 9           | version CAS transitions; non-host and stale-version rejection                                                    |
| `AC-LIVE-004` | 7, 9, 13       | no correct option in grants/projections/Realtime/bundle before close                                             |
| `AC-LIVE-005` | 9              | server deadlines; timeout writes; client clock immunity                                                          |
| `AC-LIVE-006` | 9              | one authoritative answer; same-key replay returns original                                                       |
| `AC-LIVE-007` | 10, 11, 12, 13 | refresh/reconnect reconciliation by state version                                                                |
| `AC-LIVE-008` | 9, 13          | duplicate host tab CAS conflict, no double broadcast                                                             |
| `AC-LIVE-009` | 9              | injected mid-transaction fault leaves zero partial rows; retry completes once                                    |
| `AC-LIVE-010` | 9, 12, 13      | DB-reproducible rank/tie-break; privacy-safe payloads                                                            |
| `AC-LIVE-011` | 9              | linked assignment completes once; ledgers reconcile; no mastery effect                                           |
| `AC-LIVE-012` | 13             | ≥30 answer samples, answer p95 ≤ 800 ms, finalize p95 ≤ 1,000 ms, zero lost/duplicate answers, outsider access 0 |

---

### Task 1: Pin Live/assignment reward rules in the normative spec

**Reviewer gate:** Accept only if `spec/05` §17 states the exact `2026-07-live-1` values, the no-double-reward assignment rule, the quota/mastery exclusions above, and the document manifest is regenerated; no other normative change.

**Files:** Modify `spec/05-game-mechanics.md`, `DOCUMENT_MANIFEST.json` (generated), this plan.

- [x] **Step 1:** Failing assertion: `rg -q '2026-07-live-1' spec/05-game-mechanics.md` exits 1.
- [x] **Step 2:** Write the reward values and exclusions into §17 exactly as locked above; run `pnpm document:manifest && pnpm document:manifest:check`.
- [x] **Step 3:** Verify `rg -q '2026-07-live-1' spec/05-game-mechanics.md`, Prettier on changed files, `git diff --check`.
- [x] **Step 4:** Commit `docs: pin live and assignment reward rules`.

### Task 2: Assignment schema, quiz-session purpose, and tenant RLS

**Reviewer gate:** Accept only if the three assignment tables and enums exist with the locked constraints, `quiz_sessions` gains `purpose`/`assignment_attempt_id` additively with existing rows defaulting to `practice`, students cannot read unassigned or cross-class assignments, and no direct browser writes exist.

**Files:** Create `supabase/migrations/20260717000400_assignments.sql`, `supabase/tests/014_assignments_rls.test.sql`; modify this plan.

- [x] **Step 1:** Failing pgTAP: tables/enums/columns/constraints/indexes (`assignments(classroom_id, status, deadline_at)`), owner read/write scope, targeted-student read scope, Teacher B/non-target/anonymous zero rows, direct insert/update/delete denial (42501), one-activity-reference check, unique attempt number. Deterministic test UUID prefix `14…`.
- [x] **Step 2:** RED via `supabase db reset --local` + focused `supabase test db`.
- [x] **Step 3:** Implement the migration exactly as locked; RLS default-deny; column grants exclude nothing sensitive but writes stay revoked.
- [x] **Step 4:** GREEN: focused pgTAP (014 plus existing 004–006 quiz files stay green), lint, typecheck.
- [x] **Step 5:** Commit `feat: add assignment data boundary`.

### Task 3: Trusted assignment commands and finalize derivation

**Reviewer gate:** Accept only if lifecycle transitions match `AC-ASN-002` exactly (draft→published→paused→published→archived; archived is terminal), `start_assignment_attempt` enforces target/availability/UTC deadline/attempt limit under row locks with request-id idempotency, fake client completion is impossible, and the replaced `finalize_quiz_session` derives attempt completion/pass exactly once in-transaction while all Phase 1–3 pgTAP stays green.

**Files:** Create `supabase/migrations/20260717000500_assignment_commands.sql`, `supabase/tests/015_assignment_commands.test.sql`; modify this plan.

- [x] **Step 1:** Failing pgTAP: owner-only create/status transitions (legal matrix + `archived→published` CONFLICT), non-owner/student denial, target validation, before-availability and after-deadline rejection (server UTC), concurrent starts beyond the remaining limit (advisory/row lock; successful attempts never exceed limit), ten same-request-id replays return one attempt, cross-class attempt/read denial without metadata leakage, completion only after real finalize with `passed` derived from `passing_rule`, replayed finalize returns stored result without a second completion, and reward ledgers unchanged by assignment completion itself.
- [x] **Step 2:** RED.
- [x] **Step 3:** Implement commands and replace `finalize_quiz_session` additively (new migration; preserves every existing behavior and appends the assignment-derivation step; argument list unchanged).
- [x] **Step 4:** GREEN: pgTAP 014+015 plus 004/005/006/008/009/010 regression, lint, typecheck.
- [x] **Step 5:** Commit `feat: add trusted assignment lifecycle`.

### Task 4: Assignment repositories, hooks, fixtures, and generated types

**Reviewer gate:** Accept only if strict Zod parsers reject foreign/extra fields, attempt start reuses one generated request UUID across retries, dedicated fixture accounts isolate all exact-state assertions, and real-local integration proves target/limit/deadline/cross-class behavior.

**Files:** Modify `tests/fixtures/users.ts`, `scripts/supabase/seed-auth.ts`, `src/types/database.ts` (generated), `tests/contracts/database-types.test.sh`; create `src/features/assignments/types.ts`, `src/features/assignments/api/assignment-repository.ts` (+ unit + integration tests), `src/features/assignments/hooks/use-assignments.ts` (+ tests); modify this plan.

- [x] **Step 1:** Add fixtures `assignmentTeacher` (teacher), `assignmentStudentOne/Two` (students) to `TEST_USERS`/roles/seed labels. Failing unit/hook tests: exact RPC names/args, camelCase mapping, Taipei display fields left to UI (repository returns UTC ISO), strict rejection of `email`/hash/raw rows; failing integration: dedicated teacher creates a uniquely named classroom + assignment via RPC, students join, list/start/limit/deadline/cross-class assertions, `scope:'local'` cleanup.
- [x] **Step 2:** RED (unit + `bash tests/contracts/database-types.test.sh`).
- [x] **Step 3:** Regenerate types (`supabase gen types … > src/types/database.ts`, Prettier); implement repository/hooks; query keys `assignmentKeys.mine/classroom(classroomId)`; mutations never auto-retry into duplicate attempts (retry reuses the same request id).
- [x] **Step 4:** GREEN: reset → probe → seed → unit + focused integration ×2 consecutively, type contract, lint, typecheck.
- [x] **Step 5:** Commit `feat: add assignment data interfaces`.

### Task 5: Teacher assignment management UI

**Reviewer gate:** Accept only if `/teacher/classes/:classroomId/assignments` is owner-guarded (UI and API), create/publish/pause/archive are distinct confirmed actions with pending locks, deadlines display `Asia/Taipei` while storing UTC, and cross-teacher access renders the safe denial.

**Files:** Create `src/features/assignments/pages/teacher-assignments-page.tsx` (+ test); modify router/create-app-router (+ test), teacher classroom detail page link, this plan.

- [ ] **Step 1:** Failing RTL/router tests: role guard, list/empty/loading/error/retry, RHF+Zod create form (title 1–120, optional availability/deadline with Taipei rendering of a known UTC fixture, attempt limit ≥1, passing threshold), one primary action per view, status transitions with confirmation, Teacher B denial via repository error, no Email/raw IDs in DOM.
- [ ] **Step 2:** RED. **Step 3:** implement minimal page + route (lazy, inside `/teacher` tree). **Step 4:** GREEN + lint + typecheck. **Step 5:** Commit `feat: add teacher assignment management`.

### Task 6: Student assignment experience

**Reviewer gate:** Accept only if `/app/assignments` lists only targeted published assignments with truthful availability/deadline/attempts-left, starting an attempt enters the existing quiz runner (purpose `assignment`) with one request UUID, the result surfaces server-derived completion/pass, and expired/limit-reached states disable start with clear copy.

**Files:** Create `src/features/assignments/pages/student-assignments-page.tsx`, `src/features/assignments/pages/student-assignment-detail-page.tsx` (+ tests); modify router (+ test), app-shell nav (`我的作業`) (+ test), quiz result page (+ test) to show assignment completion/pass when the session has an attempt; modify this plan.

- [ ] **Step 1:** Failing RTL/router tests incl. deep link, deadline shown in Taipei, attempts-left math from server fields only, start disabled when expired/exhausted, result page `已完成/通過` states from server payload, no client-side deadline computation from `Date.now()` beyond display.
- [ ] **Step 2:** RED. **Step 3:** implement minimal pages/routes reusing quiz runner + result. **Step 4:** GREEN + lint + typecheck. **Step 5:** Commit `feat: add student assignment flow`.

### Task 7: Live schema and tenant RLS

**Reviewer gate:** Accept only if the five Live tables and enums exist with the locked constraints/indexes (`live_sessions(session/state_version)`, participants `(session_id, user_id)`, answers `(session_question_id, participant_id)`), `correct_option_id`/`explanation` are excluded from authenticated column grants, participants read only safe projections of their sessions, hosts read own sessions, and outsiders/anonymous read nothing.

**Files:** Create `supabase/migrations/20260717000600_live_schema.sql`, `supabase/tests/016_live_rls.test.sql`; modify this plan.

- [ ] **Step 1:** Failing scoped pgTAP for tables/enums/uniques/indexes/grants/policies incl. hidden-column grant denial (42501 selecting `correct_option_id` as authenticated) and cross-tenant zero rows. **Step 2:** RED. **Step 3:** implement. **Step 4:** GREEN + lint + typecheck. **Step 5:** Commit `feat: add live session data boundary`.

### Task 8: Live setup commands — activity, session, join, state, start

**Reviewer gate:** Accept only if only classroom-owning teachers create activities/sessions, join validates hashed codes and active membership idempotently, `get_live_session_state` returns role-aware safe projections with `state_version`, `start_live_session` freezes the question set (positions, versions, public options, hidden answers, per-question deadline seconds) under version CAS, and every negative case is pgTAP-proven.

**Files:** Create `supabase/migrations/20260717000700_live_setup_commands.sql`, `supabase/tests/017_live_setup.test.sql`; modify this plan.

- [ ] **Step 1:** Failing pgTAP: create/rotate/join/state/start positive + host-only, non-member join denial, wrong/rotated code generic error, ten join replays → one participant, stale/duplicate start CAS conflict, frozen questions match the template's published versions, participant state payload has no correct option, host payload has counts but no raw member answers. **Step 2:** RED. **Step 3:** implement (code hashing per Phase 3 pattern with `extensions.` qualification). **Step 4:** GREEN (016+017 + classroom files regression) + lint + typecheck. **Step 5:** Commit `feat: add live session setup commands`.

### Task 9: Live play commands — open, answer, close, advance, finalize, cancel

**Reviewer gate:** Accept only if answers are single/authoritative/idempotent with server deadlines and response times, close writes timeout answers and reveals aggregates, advance/finalize/cancel obey the state machine with CAS, finalize atomically writes score/rank/one XP+one Token row per participant (`source 'live'`)/achievement events/linked-assignment completion/audit metadata and an injected mid-transaction fault leaves zero partial rows, and Live never touches mastery or the daily practice quota.

**Files:** Create `supabase/migrations/20260717000800_live_play_commands.sql`, `supabase/tests/018_live_play.test.sql`; modify this plan.

- [ ] **Step 1:** Failing pgTAP: full state-machine walk (legal + every illegal transition), non-host command denial, answer before open/after deadline rejection, hidden-answer comparison, fast/slow/wrong/timeout scoring per `2026-07-live-1`, same-key ten replays → one answer + original result, concurrent different-key/option requests do not overwrite, close writes timeouts + per-option counts + reveals correct id only in feedback payload, rank tie-break reproducibility (score desc, last correct time asc, user id asc), finalize once → one XP + one Token row per participant and unique-source replay safety, linked assignment attempt completes exactly once, wallet reconciliation zero, no `review_progress`/mastery effect, fault injection via a temporary test-owned trigger on `wallets` proves full rollback, retry after trigger removal completes once, cancel from each active state.
- [ ] **Step 2:** RED. **Step 3:** implement with row locks (session, participant, question), version CAS, `on conflict do nothing` backstops, and audit-safe metadata. **Step 4:** GREEN (016–018 + 005/006 economy regression + 009/010 achievements regression) + lint + typecheck. **Step 5:** Commit `feat: add live play and atomic finalize`.

### Task 10: Private Realtime authorization and committed-state broadcasts

**Reviewer gate:** Accept only if `realtime.messages` policies allow exactly host send/receive and active-participant receive/Presence on `live-session:<id>`, outsiders match no policy, broadcasts happen via `realtime.send` inside the trusted commands after state writes, and payloads carry only the safe fields locked above.

**Files:** Create `supabase/migrations/20260717000900_live_realtime.sql`, `supabase/tests/019_live_realtime.test.sql`; modify this plan.

- [ ] **Step 1:** Failing pgTAP: policy existence/scope on `realtime.messages` for the topic pattern, participant/host/outsider matrix, and assertions that each transition command emitted exactly one message row whose payload JSON contains `state_version`/`state`/counts and never `correct_option_id`, Email, or answers before close. **Step 2:** RED. **Step 3:** implement policies + `realtime.send` calls inside Task 8/9 functions (replace additively in this migration). **Step 4:** GREEN (016–019) + lint + typecheck. **Step 5:** Commit `feat: authorize private live realtime`.

### Task 11: Live repositories, realtime hook, and reconnect reconciliation

**Reviewer gate:** Accept only if host and participant repositories call exactly the trusted commands with strict parsers, the channel hook subscribes to the private topic, reconciles by `state_version` (gap → `get_live_session_state`), never stores formal state in localStorage, and real-local integration proves join/idempotency/state/version recovery with dedicated accounts.

**Files:** Create `src/features/live/types.ts`, `src/features/live/api/live-repository.ts` (+ unit + integration tests), `src/features/live/hooks/use-live-session.ts` (+ tests); modify `tests/fixtures/users.ts` + `scripts/supabase/seed-auth.ts` (add `liveHostTeacher`, `liveStudentOne/Two`), `src/types/database.ts` (generated), `tests/contracts/database-types.test.sh`; modify this plan.

- [ ] **Step 1:** Failing unit/hook tests (exact RPC args, strict payload rejection incl. `correct_option_id` leak, version-gap reconciliation triggering a state fetch, no localStorage) and failing integration (host creates activity+session for a fresh classroom, students join with replay, start/open/answer/close/advance/finalize through repositories, score/rank match `2026-07-live-1`, `scope:'local'` cleanup).
- [ ] **Step 2:** RED. **Step 3:** regenerate types; implement. **Step 4:** GREEN: reset→probe→seed → unit + integration ×2 consecutively, type contract, lint, typecheck. **Step 5:** Commit `feat: add live data interfaces`.

### Task 12: Host console and student Live experience

**Reviewer gate:** Accept only if `/teacher/live` + `/teacher/live/:sessionId` and `/app/live/join` + `/app/live/:sessionId` render only server projections (lobby roster counts, question with server countdown, per-option feedback, final privacy-safe podium), the host console gates every transition on the current version with pending locks, answer submission locks after one choice, reconnect/refresh restores the exact phase, and no client recomputes scores/deadlines.

**Files:** Create host pages `src/features/live/pages/teacher-live-page.tsx`, `teacher-live-session-page.tsx`, student pages `live-join-page.tsx`, `live-session-page.tsx` (+ tests each); modify router (+ test), app-shell nav (`Live 課堂`) (+ test), styles; modify this plan.

- [ ] **Step 1:** Failing RTL/router tests: role guards, lobby join-code one-time display for host, participant lobby presence counts, question phase with `<progress>` countdown fed by server deadline, one primary answer action then locked state, feedback distribution + correct reveal only in feedback, podium top 3 + own rank, cancelled/completed terminal states, refresh restore via injected repository state, deep links, reduced client logic (no `Date.now()` scoring, no local rank sort).
- [ ] **Step 2:** RED. **Step 3:** implement minimal components (lazy routes in both trees). **Step 4:** GREEN + lint + typecheck. **Step 5:** Commit `feat: add live host and player experience`.

### Task 13: Phase 4 gate — runner, finalizer, and multi-context acceptance flow

**Reviewer gate:** Accept only if the runner reuses the shared evidence policy and probe with the exact command order, the acceptance-only E2E drives host + two students + one outsider through assignments and a full Live match in real browser contexts with declared 4xx only, latency sampling records ≥30 answer submissions with answer p95 ≤ 800 ms and finalize p95 ≤ 1,000 ms into the report, duplicate-host-tab and reconnect checks pass, and the finalizer emits a sanitized PASS manifest for exactly the 18 exit ACs.

**Files:** Create `tests/e2e/assignments-live.spec.ts` (single test titled exactly `Assignments and Live Core phase gate`), `tests/contracts/assignments-live-phase-gate.test.ts`, `scripts/acceptance/run-assignments-live.sh`, `scripts/acceptance/finalize-assignments-live.mjs` (+ `.d.mts`); modify `package.json` (add `phase:assignments-live` and extend the `test:e2e` `--grep-invert` alternation with the new gate title, keeping the three existing exclusions); modify this plan.

- [ ] **Step 1:** Failing contracts: package entry, runner order (format→lint→typecheck→unit→build→db→integration→reset→probe→seed→headed E2E→finalizer), dirty-tree/wrong-env refusal, service-role unset before Playwright, exactly 18 AC IDs, three viewports (assignment detail, live question, host console), one video + one trace, latency report fields (`answer_samples ≥ 30`, `answer_p95_ms ≤ 800`, `finalize_p95_ms ≤ 1000`, `lost_or_duplicate_answers = 0`, `outsider_access = 0`), declared-4xx enumeration only, E2E source has per-question waits/role locators/no `page.route`/no skip, existing three phase contracts unchanged and green.
- [ ] **Step 2:** RED.
- [ ] **Step 3:** Implement runner/finalizer by reuse; E2E flow: teacher creates a 15-question live activity + linked assignment → student direct teacher-route denial (declared) → students join by code (old-code rejection declared 400) → full Live match with both students answering all questions from the generated fixture (30 answer samples timed via request timings) → mid-match student reload reconciles to the open question → duplicate host tab stale advance shows conflict recovery (declared 409 if surfaced as HTTP; otherwise UI assertion only) → finalize → podium/rank assertions + no Email/UUID in DOM → assignment pages show completion → outsider join/leaderboard denials (declared) → negative contexts close immediately → three viewport screenshots + browser-health JSON + latency report.
- [ ] **Step 4:** Task-level GREEN: contracts, `bash -n` runner, Prettier, lint, typecheck, `playwright test --list` shows exactly one gate test. No gate execution.
- [ ] **Step 5:** Commit `test: add assignments and live phase gate`.

---

## Complete-range review, disposable precheck, and single Phase 4 gate

- [ ] **Review Step 1:** Verify `git rev-parse dc77049` matches the full baseline SHA, clean worktree, then run one complete-range review of `dc77049..HEAD` (exclude generated types/lockfile/artifacts). Priorities: state-machine/CAS correctness, hidden-answer exposure, finalize atomicity and idempotent ledgers, assignment derivation, Realtime policy scope, deadline/timezone authority, fixture isolation, declared-4xx exactness.
- [ ] **Review Step 2:** Fix Critical/Important findings with focused RED→GREEN commits; rerun only affected checks.
- [ ] **Gate Step 1:** One disposable acceptance-mode headless precheck (mktemp evidence root outside `artifacts/acceptance`, trap cleanup, no finalizer). If it fails, stop and report; a second precheck needs owner authorization unless the failure is a plan-required negative path missing its precise declaration.
- [ ] **Gate Step 2:** Record clean `GATE_SHA`, run `pnpm phase:assignments-live` exactly once. On failure: stop, report root cause, no rerun without owner instruction.
- [ ] **Gate Step 3:** After PASS, close Phase 4 in `.superpowers/sdd/progress.md` (plan/task/review SHAs, gate SHA, manifest path, 18 ACs, gate-history root causes, reservations: Phase 7 advanced Live scope, remediation purpose reserved, `AC-LIVE-012` staging revalidation at Phase 8, main-chunk warning) and commit `docs: close assignments and live core phase`. Stop; do not begin Phase 5.

## Plan self-review checklist

- Every schema/function/route/reward value matches `spec/01/03/05`, the approved design §6–8, and the Phase 1–3 conventions; no unapproved rule value remains (Task 1 closes the only spec gap first).
- Migrations `20260717000400–000900` and pgTAP `014–019` collide with nothing at baseline; every referenced path/command exists or is created by a prior task.
- All 18 exit ACs map to tasks and to gate evidence; no AC is claimed without a decisive proof.
- Economy integrity: only `finalize_quiz_session`/`finalize_live_session` mint rewards, unique sources everywhere, wallet reconciliation asserted, no mastery/daily-quota contamination from Live.
- All Phase 1–3 binding conventions are embedded: reset→probe→seed, dedicated mutating-test accounts, declared enumerated 4xx, negative contexts close early, per-question waits, one review, one disposable precheck, one gate.
