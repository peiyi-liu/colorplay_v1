# ColorPlay Phase 2 Achievements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task in one session. Do not use subagent-driven development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a server-authoritative, badge-only achievement catalog with transactional progress/unlocks, truthful deferred states, and a real student `/app/achievements` experience that satisfies `AC-ACH-001`–`AC-ACH-005`.

**Architecture:** PostgreSQL owns definitions, derived progress, unlocks, rule validation, RLS, and trusted source triggers. Achievement metrics are recomputed from authoritative quiz/economy state instead of accepting browser counters, so retries are idempotent and unlocks remain append-only. React consumes one privacy-safe RPC projection through a feature-local repository and TanStack Query; it never receives rule enums, rule parameters, trusted source IDs, or mutation access.

**Tech Stack:** PostgreSQL/Supabase migrations, RLS, security-definer functions and pgTAP; React 19, TypeScript strict, React Router, TanStack Query, Zod, Vitest, React Testing Library, Playwright, pnpm.

**Document size rationale:** This plan exceeds 500 lines because the owner requires one Phase 2 document with seven independently reviewable tasks, exact interfaces, RED/GREEN commands, AC traceability, commit commands, and the single review/gate protocol. Splitting it would break checkbox/commit tracking and the one-plan phase boundary; product source files remain subject to the normal 500-line limit.

## Global Constraints

- Baseline is exactly `c81d870b32bcf8e64c7f4a6b6beac6242ccb9150`; the complete Phase 2 review range starts at this SHA.
- Execute all tasks in the existing worktree `/Users/guanyucheng/Desktop/pei-game/colorplay/.worktrees/colorplay-platform-foundation` in one session without subagents.
- Before Task 1, commit this owner-approved plan as `docs: add Phase 2 achievements plan`; do not rewrite existing commits.
- Each task is one independently acceptable/rejectable deliverable and ends with one commit. Change that task's checkbox from `[ ]` to `[x]` in the same commit.
- Only one complete-range review occurs after the final task. Do not open per-task review rounds.
- Behavior changes use RED → GREEN. Migration tasks write the failing pgTAP/RLS test before the additive migration.
- Task-level checks are limited to Prettier for changed files, lint, typecheck, and affected tests. Do not run headed browser, E2E, screenshot/video/trace collection, or `pnpm phase:achievements` before the final phase gate.
- All integration test cleanup uses `client.auth.signOut({ scope: 'local' })`. A test whose product behavior is global sign-out must use dedicated Auth fixtures; this phase adds no such test.
- Every pgTAP row-count assertion is scoped to UUIDs created by that test. Global catalog assertions may identify the nine deterministic definition UUIDs or stable codes, never count unrelated rows.
- Do not modify prior migrations. All database changes are additive migrations beginning at `20260716000500`.
- Do not add achievement XP or Token rewards. No achievement path may insert `xp_transactions`, `wallet_transactions`, or update `wallets`.
- The browser cannot insert/update/delete definition, progress, or unlock rows and cannot execute the evaluator.
- The catalog contains exactly the nine approved stable codes. `case_expert` is absent.
- Phase 2 wires only existing authoritative dependencies: finalized quiz state, XP ledger state, and initial Blook ownership. Assignment, Live, mistake resolution, and mastery source types are reserved but have no trigger in this phase.
- Deferred definitions `mistakes_resolved_10`, `chapter_mastered_1`, `all_chapters_mastered`, and `live_complete_5` are returned as `not_started`/`未開始`; they never receive fabricated progress.
- Hidden definitions are omitted from the locked student payload. Initial catalog definitions are public; pgTAP adds a test-only hidden definition to verify privacy without changing the approved nine-item catalog.
- Final phase evidence is produced once, after a clean complete-range review, by `pnpm phase:achievements`. Full `pnpm acceptance` remains deferred.

## Locked Phase Interfaces

### Database enums

```sql
public.achievement_rule_type =
  'completed_task_count'
  | 'perfect_quiz_count'
  | 'resolved_mistake_count'
  | 'mastered_chapter_count'
  | 'level_reached'
  | 'correct_streak'
  | 'live_completed_count'
  | 'initial_blook_owned_count'

public.achievement_source_type =
  'quiz_finalize'
  | 'xp_ledger'
  | 'blook_acquired'
  | 'catalog_backfill'
  | 'assignment_finalize'
  | 'live_finalize'
  | 'mistake_resolved'
  | 'mastery_recomputed'

public.achievement_visibility = 'public' | 'hidden'
public.achievement_definition_status = 'active' | 'archived'
public.achievement_progress_state = 'not_started' | 'in_progress' | 'unlocked'
```

### Trusted database functions

```sql
public.achievement_metric_value(
  target_user_id uuid,
  target_rule_type public.achievement_rule_type
) returns integer

public.evaluate_achievements(
  target_user_id uuid,
  event_source_type public.achievement_source_type,
  event_source_id uuid
) returns jsonb

public.get_my_achievement_catalog() returns jsonb
```

`achievement_metric_value` returns `null` for a rule whose authoritative subsystem does not exist in Phase 2. `evaluate_achievements` is not executable by `public`, `anon`, or `authenticated`; trigger functions call it inside the source transaction. `get_my_achievement_catalog` is the only student-facing achievement RPC.

### Frontend types

```ts
export type AchievementState = 'not_started' | 'in_progress' | 'unlocked';

export type AchievementCatalogItem = Readonly<{
  badgeKey: string;
  description: string;
  displayName: string;
  progress: number | null;
  stableCode: string;
  state: AchievementState;
  target: number | null;
  unlockedAt: string | null;
}>;

export type AchievementCatalog = Readonly<{
  items: readonly AchievementCatalogItem[];
  totalCount: number;
  unlockedCount: number;
}>;

export type AchievementRepository = Readonly<{
  getCatalog(): Promise<AchievementCatalog>;
}>;
```

### Acceptance trace

| Acceptance ID | Primary tasks | Phase evidence                                           |
| ------------- | ------------- | -------------------------------------------------------- |
| `AC-ACH-001`  | 1, 4, 6       | exact nine-item catalog and badge UI                     |
| `AC-ACH-002`  | 2, 3, 4       | authoritative progress and transactional unlocks         |
| `AC-ACH-003`  | 1, 2, 3       | RLS, no browser evaluator, append-only/idempotent unlock |
| `AC-ACH-004`  | 1, 2, 4, 6    | deferred truthfulness and hidden-rule privacy            |
| `AC-ACH-005`  | 3, 6, 7       | real quiz/economy events and headed phase evidence       |

---

### Task 1: Add the versioned achievement catalog, storage, and RLS boundary

**Reviewer gate:** Accept only if the three tables, validated enum rule contract, exact nine definitions, append-only unlock boundary, indexes, and own-read/no-write RLS behavior are all proven by scoped pgTAP. Reject if the browser can read raw rule parameters or mutate any achievement table.

**Files:**

- Create: `supabase/tests/008_achievement_catalog.test.sql`
- Create: `supabase/migrations/20260716000500_achievement_catalog.sql`
- Modify: `docs/superpowers/plans/2026-07-16-achievements.md`

**Consumes:** `auth.users`, `public.profiles`, `public.xp_transactions`, `public.user_blooks`; the nine stable codes and conditions in the approved design/spec.

**Produces:** the five enums in Locked Phase Interfaces; `public.achievement_definitions`, `public.achievement_progress`, `public.achievement_unlocks`; deterministic definition UUIDs `60000000-0000-0000-0000-000000000001` through `...0009`; `public.validate_achievement_rule_parameters(rule_type, rule_version, parameters) returns boolean`.

**Corresponding AC:** `AC-ACH-001`, `AC-ACH-003`, `AC-ACH-004`.

**Task evidence:** command output only; no evidence directory.

- [x] **Step 1: Write the failing catalog/RLS pgTAP test**

  Add assertions that:

  - all three tables and five enums exist;
  - the nine deterministic UUID/stable-code pairs exist and `case_expert` does not;
  - every definition has `rule_version = 1`, `status = 'active'`, badge display metadata, and no reward columns;
  - each rule type accepts only an object with the exact positive integer `target` required by its definition; extra keys, missing target, non-integer target, and unsupported rule version are rejected;
  - all three tables have RLS enabled;
  - Student A can read only Student A progress/unlocks and Student B reads zero rows for Student A UUIDs;
  - authenticated users cannot directly select raw definitions and cannot insert/update/delete any of the three tables;
  - an unlock update/delete raises `ACHIEVEMENT_UNLOCK_IMMUTABLE` even under a privileged test role;
  - indexes exist on `achievement_progress(user_id, achievement_definition_id)` and `achievement_unlocks(user_id, achievement_definition_id)`.

  Use deterministic users `11000000-0000-0000-0000-000000000001/2` and only count rows whose IDs belong to those fixtures or the nine catalog UUIDs.

- [x] **Step 2: Run the new pgTAP test to prove RED**

  Run:

  ```bash
  pnpm exec supabase test db --local supabase/tests/008_achievement_catalog.test.sql
  ```

  Expected: FAIL because `public.achievement_definitions` and the achievement enums do not exist. A connection/configuration error is not an acceptable RED result.

- [x] **Step 3: Add the minimal additive catalog migration**

  Implement the locked enums and tables with these keys and constraints:

  ```sql
  create table public.achievement_definitions (
    id uuid primary key,
    stable_code text unique not null,
    display_name text not null,
    description text not null,
    badge_key text not null,
    rule_type public.achievement_rule_type not null,
    rule_version integer not null check (rule_version > 0),
    rule_parameters jsonb not null,
    visibility public.achievement_visibility not null,
    status public.achievement_definition_status not null,
    sort_order integer unique not null check (sort_order > 0),
    created_at timestamptz not null default now(),
    check (public.validate_achievement_rule_parameters(
      rule_type, rule_version, rule_parameters
    ))
  );

  create table public.achievement_progress (
    user_id uuid not null references public.profiles(id) on delete cascade,
    achievement_definition_id uuid not null
      references public.achievement_definitions(id) on delete restrict,
    definition_version integer not null,
    current_value integer not null check (current_value >= 0),
    target_value integer not null check (target_value > 0),
    state public.achievement_progress_state not null,
    last_source_type public.achievement_source_type,
    last_source_id uuid,
    computed_at timestamptz not null default clock_timestamp(),
    primary key (user_id, achievement_definition_id),
    check ((last_source_type is null) = (last_source_id is null))
  );

  create table public.achievement_unlocks (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    achievement_definition_id uuid not null
      references public.achievement_definitions(id) on delete restrict,
    definition_version integer not null,
    source_type public.achievement_source_type not null,
    source_id uuid not null,
    unlocked_at timestamptz not null default clock_timestamp(),
    unique (user_id, achievement_definition_id)
  );
  ```

  Seed the exact catalog in approved order. `badge_key` equals the stable code:

  | UUID suffix | Stable code             | Display name | Description              | Rule type                   | Target |
  | ----------- | ----------------------- | ------------ | ------------------------ | --------------------------- | -----: |
  | `001`       | `first_task_complete`   | 初出茅廬     | 完成第一次正式挑戰       | `completed_task_count`      |      1 |
  | `002`       | `first_perfect_quiz`    | 百發百中     | 在一次正式測驗中全數答對 | `perfect_quiz_count`        |      1 |
  | `003`       | `mistakes_resolved_10`  | 不屈不撓     | 解決 10 個不同錯題       | `resolved_mistake_count`    |     10 |
  | `004`       | `chapter_mastered_1`    | 章節精熟     | 精熟第一個章節           | `mastered_chapter_count`    |      1 |
  | `005`       | `all_chapters_mastered` | 色彩大師     | 精熟全部六個章節         | `mastered_chapter_count`    |      6 |
  | `006`       | `level_10`              | 登峰造極     | 達到 Level 10            | `level_reached`             |     10 |
  | `007`       | `correct_streak_20`     | 連擊之王     | 連續答對 20 題           | `correct_streak`            |     20 |
  | `008`       | `live_complete_5`       | 課堂挑戰者   | 完成 5 場 ColorPlay Live | `live_completed_count`      |      5 |
  | `009`       | `blooks_owned_6`        | 收藏家       | 擁有六隻初始 Blook       | `initial_blook_owned_count` |      6 |

  All nine use `visibility = 'public'`, `status = 'active'`, `rule_version = 1`, and badge-only display metadata. Enable RLS, grant authenticated users only `select` on progress/unlocks, add own-row select policies, and give authenticated users no direct definitions grant. Add an immutable trigger to reject unlock update/delete.

- [x] **Step 4: Reset local Supabase and prove GREEN**

  Run:

  ```bash
  pnpm exec supabase db reset --local
  pnpm exec supabase test db --local supabase/tests/008_achievement_catalog.test.sql
  pnpm exec prettier --check --ignore-unknown supabase/tests/008_achievement_catalog.test.sql supabase/migrations/20260716000500_achievement_catalog.sql
  git diff --check
  ```

  Expected: reset applies `20260716000500`; the scoped pgTAP file reports PASS; formatting and diff checks exit 0.

- [x] **Step 5: Mark Task 1 complete and commit**

  ```bash
  git add supabase/tests/008_achievement_catalog.test.sql \
    supabase/migrations/20260716000500_achievement_catalog.sql \
    docs/superpowers/plans/2026-07-16-achievements.md
  git commit -m "feat: add achievement catalog and RLS boundary"
  ```

---

### Task 2: Implement derived metrics, idempotent evaluation, and the privacy-safe catalog RPC

**Reviewer gate:** Accept only if every supported metric is recomputed from authoritative tables, deferred metrics return no synthetic value, repeated evaluation creates no duplicate unlock or ledger write, and hidden locked rules are absent from the student payload.

**Files:**

- Create: `supabase/tests/009_achievement_engine.test.sql`
- Create: `supabase/migrations/20260716000600_achievement_engine.sql`
- Modify: `docs/superpowers/plans/2026-07-16-achievements.md`

**Consumes:** Task 1 enums/tables; `quiz_sessions.status/correct_count/question_count`, `quiz_answers.answer_status/answered_at`, `xp_transactions.amount`, `blooks.sort_order`, `user_blooks`.

**Produces:** the three functions in Locked Phase Interfaces; supported derived metrics for five initial achievements; privacy-safe JSON catalog projection.

**Corresponding AC:** `AC-ACH-002`, `AC-ACH-003`, `AC-ACH-004`.

**Task evidence:** command output only; no evidence directory.

- [x] **Step 1: Write the failing engine pgTAP test**

  Build deterministic fixtures under users `12000000-0000-0000-0000-000000000001/2` and assert:

  - `completed_task_count` counts only completed quizzes for the target user;
  - `perfect_quiz_count` counts only completed sessions where `correct_count = question_count`;
  - `level_reached` equals `(sum(target user xp_transactions.amount) / 500) + 1`;
  - `correct_streak` returns the maximum consecutive correct run over answers belonging to completed quiz sessions ordered by `answered_at, id`; incorrect and timeout split the run;
  - `initial_blook_owned_count` counts only owned Blooks with `sort_order between 1 and 6`;
  - deferred rule types return `null` and create no progress/unlock rows;
  - evaluator replay with one source UUID leaves one progress row and one unlock row for each qualifying definition and does not change `computed_at` when the metric did not change;
  - evaluator inserts no user-scoped XP or wallet transaction and does not change the user's wallet balance;
  - the student RPC returns the nine public definitions in `sort_order`, returns the four deferred items as `state = 'not_started'`, and excludes `rule_type`, `rule_parameters`, `source_type`, and `source_id` from serialized JSON;
  - a test-only hidden definition is absent while locked and appears only after its server-created unlock;
  - anonymous and authenticated roles cannot execute `evaluate_achievements`, while authenticated own-user execution of `get_my_achievement_catalog()` succeeds.

- [x] **Step 2: Run the engine test to prove RED**

  Run:

  ```bash
  pnpm exec supabase test db --local supabase/tests/009_achievement_engine.test.sql
  ```

  Expected: FAIL because `public.achievement_metric_value`, `public.evaluate_achievements`, and `public.get_my_achievement_catalog` do not exist.

- [x] **Step 3: Implement authoritative metric derivation**

  Add `achievement_metric_value` as a `security definer` function with `set search_path = pg_catalog, public`. It must branch only on the enum and run these authoritative queries:

  ```sql
  -- completed_task_count
  count(*) from public.quiz_sessions
  where user_id = target_user_id and status = 'completed'

  -- perfect_quiz_count
  count(*) from public.quiz_sessions
  where user_id = target_user_id
    and status = 'completed'
    and correct_count = question_count

  -- level_reached
  (coalesce(sum(amount), 0) / 500) + 1
  from public.xp_transactions where user_id = target_user_id

  -- initial_blook_owned_count
  count(*) from public.user_blooks ub
  join public.blooks b on b.id = ub.blook_id
  where ub.user_id = target_user_id and b.sort_order between 1 and 6
  ```

  For `correct_streak`, join `quiz_answers` to completed `quiz_sessions`, order by `answered_at, answer id`, split groups at every non-correct answer, and return the maximum correct group length. Return `null` for `resolved_mistake_count`, `mastered_chapter_count`, and `live_completed_count` in this phase.

- [x] **Step 4: Implement idempotent evaluation and the safe RPC**

  `evaluate_achievements` must:

  1. verify the target profile exists;
  2. lock the target user's existing progress rows in stable definition order;
  3. iterate active definitions;
  4. skip a `null` metric without inserting progress;
  5. clamp display progress with `least(metric, target)`, then upsert `current_value`, definition target, state, and source only when the clamped value/state advances;
  6. insert an unlock when `current_value >= target`, using `on conflict (user_id, achievement_definition_id) do nothing`;
  7. return a deterministic JSON object containing current unlocked stable codes, not client-supplied values.

  `get_my_achievement_catalog()` must require `auth.uid()`, left join the caller's progress/unlocks to active public definitions, default missing progress to `not_started`, return `null` progress/target for a hidden definition, omit locked hidden definitions, and never project rule/source fields. Revoke evaluator and metric execution from `public`, `anon`, and `authenticated`; grant only the safe RPC to `authenticated`.

- [x] **Step 5: Reset and prove the engine GREEN**

  Run:

  ```bash
  pnpm exec supabase db reset --local
  pnpm exec supabase test db --local \
    supabase/tests/008_achievement_catalog.test.sql \
    supabase/tests/009_achievement_engine.test.sql
  pnpm exec prettier --check --ignore-unknown \
    supabase/tests/009_achievement_engine.test.sql \
    supabase/migrations/20260716000600_achievement_engine.sql
  git diff --check
  ```

  Expected: both pgTAP files PASS; duplicate evaluation and per-user ledger invariants remain green.

- [x] **Step 6: Mark Task 2 complete and commit**

  ```bash
  git add supabase/tests/009_achievement_engine.test.sql \
    supabase/migrations/20260716000600_achievement_engine.sql \
    docs/superpowers/plans/2026-07-16-achievements.md
  git commit -m "feat: derive achievement progress on the server"
  ```

---

### Task 3: Connect quiz finalize and economy events transactionally

**Reviewer gate:** Accept only if real `finalize_quiz_session`, XP ledger insertion, and initial-Blook acquisition trigger evaluation inside the source transaction; retry and rollback leave no duplicate/partial unlock; no deferred source has a trigger.

**Files:**

- Create: `supabase/tests/010_achievement_events.test.sql`
- Create: `supabase/migrations/20260716000700_achievement_event_triggers.sql`
- Modify: `docs/superpowers/plans/2026-07-16-achievements.md`

**Consumes:** `evaluate_achievements`; existing `finalize_quiz_session`, `xp_transactions`, `user_blooks`, and their unique/idempotent source contracts.

**Produces:** internal trigger functions `evaluate_quiz_finalize_achievements()`, `evaluate_xp_achievement_event()`, `evaluate_blook_achievement_event()` and three source-table triggers.

**Corresponding AC:** `AC-ACH-002`, `AC-ACH-003`, `AC-ACH-005`.

**Task evidence:** command output only; no evidence directory.

- [x] **Step 1: Write the failing event/transaction pgTAP test**

  With deterministic users/session/source UUIDs owned by this test, assert:

  - finalizing one quiz unlocks `first_task_complete` in the same transaction;
  - a perfect finalize also unlocks `first_perfect_quiz`;
  - two completed ten-answer quizzes with one uninterrupted correct run unlock `correct_streak_20`; an incorrect/timeout fixture breaks the run;
  - user XP reaching 4,500 yields authoritative Level 10 and unlocks `level_10`;
  - acquiring the sixth of Blooks `sort_order 1..6` unlocks `blooks_owned_6`;
  - retrying finalize and reusing an existing source produces one user/definition unlock;
  - a savepoint that inserts an achievement-triggering economy row and then rolls back leaves no progress/unlock change;
  - the four deferred definitions have zero user-scoped progress/unlocks after quiz, XP, and Blook events;
  - the target user's XP/wallet transaction counts before and after evaluator execution differ only by the explicitly inserted source fixtures, never by an achievement reward;
  - Student B sees zero Student A achievement rows and cannot forge an unlock;
  - no trigger exists for `assignment_finalize`, `live_finalize`, `mistake_resolved`, or `mastery_recomputed`;
  - an existing profile evaluated through the migration's `catalog_backfill` source receives derived current state without reward writes.

- [x] **Step 2: Run the event test to prove RED**

  Run:

  ```bash
  pnpm exec supabase test db --local supabase/tests/010_achievement_events.test.sql
  ```

  Expected: FAIL because authoritative source events do not yet create progress/unlocks.

- [x] **Step 3: Add minimal source triggers**

  Create exactly these triggers:

  ```sql
  create trigger quiz_finalize_achievement_evaluation
  after update of status on public.quiz_sessions
  for each row
  when (old.status = 'in_progress' and new.status = 'completed')
  execute function public.evaluate_quiz_finalize_achievements();

  create trigger xp_achievement_evaluation
  after insert on public.xp_transactions
  for each row
  execute function public.evaluate_xp_achievement_event();

  create trigger blook_achievement_evaluation
  after insert on public.user_blooks
  for each row
  execute function public.evaluate_blook_achievement_event();
  ```

  Each trigger function is `security definer`, fixes `search_path`, and is revoked from `public`, `anon`, and `authenticated`. The quiz trigger passes `new.user_id/new.id`; the XP trigger passes `new.user_id/new.id`; `user_blooks` has no surrogate ID, so the Blook trigger passes `new.user_id/new.blook_id`. At the end of the migration, evaluate every existing profile once with `source_type = 'catalog_backfill'` and `source_id = profile.id`; this is a derived-state backfill and must not write reward ledgers. Do not replace `finalize_quiz_session`, `purchase_blook`, or any prior migration: database triggers preserve their existing transactional rollback and idempotency behavior.

- [x] **Step 4: Reset and prove event behavior GREEN**

  Run:

  ```bash
  pnpm exec supabase db reset --local
  pnpm exec supabase test db --local \
    supabase/tests/008_achievement_catalog.test.sql \
    supabase/tests/009_achievement_engine.test.sql \
    supabase/tests/010_achievement_events.test.sql
  pnpm exec prettier --check --ignore-unknown \
    supabase/tests/010_achievement_events.test.sql \
    supabase/migrations/20260716000700_achievement_event_triggers.sql
  git diff --check
  ```

  Expected: all three achievement pgTAP files PASS; trigger retry, rollback, RLS, and no-reward assertions are green.

- [x] **Step 5: Mark Task 3 complete and commit**

  ```bash
  git add supabase/tests/010_achievement_events.test.sql \
    supabase/migrations/20260716000700_achievement_event_triggers.sql \
    docs/superpowers/plans/2026-07-16-achievements.md
  git commit -m "feat: evaluate achievements from trusted events"
  ```

---

### Task 4: Add generated database types and the achievement repository

**Reviewer gate:** Accept only if the repository validates the safe RPC payload, returns the locked TypeScript interface, rejects malformed/privacy-leaking payloads, and a real local integration reads the truthful nine-item catalog with local-only sign-out cleanup.

**Files:**

- Modify (generated): `src/types/database.ts`
- Create: `src/features/achievements/types.ts`
- Create: `src/features/achievements/api/achievement-repository.ts`
- Create: `src/features/achievements/api/achievement-repository.test.ts`
- Create: `src/features/achievements/api/achievement-repository.integration.test.ts`
- Modify: `tests/contracts/database-types.test.sh`
- Modify: `docs/superpowers/plans/2026-07-16-achievements.md`

**Consumes:** `get_my_achievement_catalog()` JSON contract; Supabase client and existing repository error conventions.

**Produces:** `AchievementState`, `AchievementCatalogItem`, `AchievementCatalog`, `AchievementRepository`; `createAchievementRepository(client): AchievementRepository`.

**Corresponding AC:** `AC-ACH-001`, `AC-ACH-002`, `AC-ACH-004`.

**Task evidence:** command output only; no evidence directory.

- [x] **Step 1: Write repository unit tests before implementation**

  Test that `getCatalog()`:

  - calls only `client.rpc('get_my_achievement_catalog')`;
  - maps snake_case JSON to the locked camelCase interfaces;
  - accepts `not_started`, `in_progress`, and `unlocked` with UTC ISO timestamps;
  - requires a non-empty, duplicate-free item list and consistent `unlocked_count/total_count` without hard-coding catalog length in product code;
  - rejects negative progress, progress above target, unlocked rows without timestamp, deferred `not_started` rows with fabricated positive progress, duplicate stable codes, and any item containing `rule_type`, `rule_parameters`, `source_type`, or `source_id`;
  - converts RPC failure and invalid payload to named achievement repository errors without `any`.

- [x] **Step 2: Run repository tests to prove RED**

  Run:

  ```bash
  pnpm exec vitest run src/features/achievements/api/achievement-repository.test.ts
  ```

  Expected: FAIL because the achievement types/repository do not exist.

- [x] **Step 3: Regenerate database types and implement the minimal repository**

  After resetting local Supabase through Task 3, regenerate:

  ```bash
  pnpm exec supabase gen types typescript --local > src/types/database.ts
  pnpm exec prettier --write src/types/database.ts
  ```

  Implement a strict Zod RPC schema and map it to the Locked Phase Interfaces. The raw schema uses:

  ```ts
  type AchievementRpcItem = Readonly<{
    badge_key: string;
    description: string;
    display_name: string;
    progress: number | null;
    stable_code: string;
    state: 'not_started' | 'in_progress' | 'unlocked';
    target: number | null;
    unlocked_at: string | null;
  }>;
  ```

  Reject unknown keys with `.strict()` at the root and item levels so hidden rule/source fields cannot silently enter the browser model.

- [x] **Step 4: Add the real local integration test**

  Sign in `TEST_USERS.studentTwo`, call the real repository, assert exactly the approved nine stable codes, verify the four deferred codes are `not_started`, and query no admin/service interface. Always clean up in `finally`:

  ```ts
  await client.auth.signOut({ scope: 'local' });
  ```

- [x] **Step 5: Reset/seed and prove repository GREEN**

  Run:

  ```bash
  pnpm exec supabase db reset --local
  source scripts/supabase/load-local-environment.sh
  load_local_supabase_environment \
    < <(pnpm exec supabase status -o env 2>/dev/null)
  export SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY
  pnpm exec tsx scripts/supabase/seed-auth.ts
  unset SUPABASE_SERVICE_ROLE_KEY
  pnpm exec vitest run src/features/achievements/api/achievement-repository.test.ts
  pnpm exec vitest run --config vitest.integration.config.ts \
    src/features/achievements/api/achievement-repository.integration.test.ts
  bash tests/contracts/database-types.test.sh
  pnpm lint
  pnpm typecheck
  ```

  Expected: unit and real-local integration tests PASS; generated database contract, lint, and typecheck exit 0.

- [x] **Step 6: Mark Task 4 complete and commit**

  ```bash
  git add src/types/database.ts \
    src/features/achievements/types.ts \
    src/features/achievements/api/achievement-repository.ts \
    src/features/achievements/api/achievement-repository.test.ts \
    src/features/achievements/api/achievement-repository.integration.test.ts \
    tests/contracts/database-types.test.sh \
    docs/superpowers/plans/2026-07-16-achievements.md
  git commit -m "feat: add achievement catalog repository"
  ```

---

### Task 5: Add the TanStack Query achievement boundary

**Reviewer gate:** Accept only if the hook has one stable query key, supports repository injection in tests, exposes loading/error/data without parallel client state, and invalidation can be reused after trusted quiz/economy mutations.

**Files:**

- Create: `src/features/achievements/hooks/use-achievements.ts`
- Create: `src/features/achievements/hooks/use-achievements.test.tsx`
- Modify: `docs/superpowers/plans/2026-07-16-achievements.md`

**Consumes:** `AchievementRepository.getCatalog()` from Task 4; existing QueryClient provider.

**Produces:** `achievementQueryKey = ['achievements', 'catalog'] as const`; `useAchievements(repository?: AchievementRepository)`.

**Corresponding AC:** `AC-ACH-002`, `AC-ACH-004`.

**Task evidence:** command output only; no evidence directory.

- [x] **Step 1: Write failing hook tests**

  Cover successful fetch, loading, named repository error, one fetch for two consumers under the same QueryClient, and refetch after:

  ```ts
  queryClient.invalidateQueries({ queryKey: achievementQueryKey });
  ```

- [x] **Step 2: Run hook tests to prove RED**

  Run:

  ```bash
  pnpm exec vitest run src/features/achievements/hooks/use-achievements.test.tsx
  ```

  Expected: FAIL because the hook/query key does not exist.

- [x] **Step 3: Implement the minimal hook**

  Use `useQuery({ queryKey: achievementQueryKey, queryFn: repository.getCatalog })`; use the production Supabase-backed repository by default and allow explicit repository injection only as a TypeScript parameter for unit tests. Do not use Zustand/localStorage for achievement state.

- [x] **Step 4: Prove hook GREEN**

  Run:

  ```bash
  pnpm exec vitest run src/features/achievements/hooks/use-achievements.test.tsx
  pnpm lint
  pnpm typecheck
  pnpm exec prettier --check \
    src/features/achievements/hooks/use-achievements.ts \
    src/features/achievements/hooks/use-achievements.test.tsx
  ```

  Expected: focused hook tests, lint, typecheck, and formatting PASS.

- [x] **Step 5: Mark Task 5 complete and commit**

  ```bash
  git add src/features/achievements/hooks/use-achievements.ts \
    src/features/achievements/hooks/use-achievements.test.tsx \
    docs/superpowers/plans/2026-07-16-achievements.md
  git commit -m "feat: add achievement catalog query hook"
  ```

---

### Task 6: Deliver `/app/achievements` and truthful badge UI

**Reviewer gate:** Accept only if the authenticated route renders server data, all states have non-color labels, four unsupported rules visibly say `未開始`, unlocked timestamps are localized, loading/error/retry are accessible, and no client code contains thresholds/rule evaluation.

**Files:**

- Create: `src/features/achievements/components/achievement-card.tsx`
- Create: `src/features/achievements/components/achievement-card.test.tsx`
- Create: `src/features/achievements/pages/achievements-page.tsx`
- Create: `src/features/achievements/pages/achievements-page.test.tsx`
- Create: `src/features/achievements/pages/achievements-route.tsx`
- Modify: `src/app/router/create-app-router.tsx`
- Modify: `src/app/router/create-app-router.test.tsx`
- Modify: `src/app/shell/app-shell.tsx`
- Modify: `src/app/shell/app-shell.test.tsx`
- Modify: `docs/superpowers/plans/2026-07-16-achievements.md`

**Consumes:** `useAchievements`, Locked Phase Interfaces, authenticated AppShell/route error/loading conventions.

**Produces:** authenticated route `/app/achievements`; navigation link `成就徽章`; responsive badge grid and accessible state cards.

**Corresponding AC:** `AC-ACH-001`, `AC-ACH-004`, `AC-ACH-005`.

**Task evidence:** component/route test output only; UI screenshots/video/trace are deferred to the single phase gate.

- [x] **Step 1: Write failing card/page/route/shell tests**

  Assert:

  - unlocked card shows `已解鎖`, badge name/description, and an `Asia/Taipei` unlock date;
  - in-progress public card shows a semantic `<progress>` and text such as `3 / 10`;
  - deferred card shows `未開始`, no fabricated percentage, and no unlock action;
  - the page heading is `成就徽章`, summary is `已解鎖 X / 9`, and cards preserve catalog order;
  - loading uses the existing route loading boundary, error has a retry button, and empty/malformed catalog is an error rather than fake badges;
  - `/app/achievements` is under the authenticated route and `/app` shell navigation contains `成就徽章` exactly once;
  - card states are conveyed by text/icon in addition to color;
  - frontend source contains none of `rule_type`, `rule_parameters`, `evaluate_achievements`, or hard-coded numeric unlock checks.

- [x] **Step 2: Run UI tests to prove RED**

  Run:

  ```bash
  pnpm exec vitest run \
    src/features/achievements/components/achievement-card.test.tsx \
    src/features/achievements/pages/achievements-page.test.tsx \
    src/app/router/create-app-router.test.tsx \
    src/app/shell/app-shell.test.tsx
  ```

  Expected: FAIL because the page, card, route, and navigation link do not exist.

- [x] **Step 3: Implement the smallest truthful UI**

  `AchievementCard` renders only the server projection. `AchievementsPage` calls `useAchievements`, renders the server count and items, and retries with the query's `refetch`. `achievements-route.tsx` exports React Router's lazy `Component`; `/app/achievements` dynamically imports that route module using existing loading/error conventions. Add the AppShell link and style the grid/cards with Tailwind utility classes plus existing CSS-variable tokens; do not add a second styling system or a feature stylesheet.

  Required state copy:

  ```text
  unlocked    -> 已解鎖
  in_progress -> 進行中
  not_started -> 未開始
  ```

  The layout uses a one-column mobile grid, two columns at tablet width, and three columns at desktop width. It uses existing CSS variables/tokens, has one page-level primary action at most, and never derives progress from quiz/economy client state.

- [x] **Step 4: Prove UI GREEN without browser evidence**

  Run:

  ```bash
  pnpm exec vitest run \
    src/features/achievements/components/achievement-card.test.tsx \
    src/features/achievements/pages/achievements-page.test.tsx \
    src/app/router/create-app-router.test.tsx \
    src/app/shell/app-shell.test.tsx
  pnpm lint
  pnpm typecheck
  pnpm exec prettier --check --ignore-unknown \
    src/features/achievements \
    src/app/router/create-app-router.tsx \
    src/app/router/create-app-router.test.tsx \
    src/app/shell/app-shell.tsx \
    src/app/shell/app-shell.test.tsx
  ```

  Expected: focused component/route/shell tests, lint, typecheck, and formatting PASS. No Playwright command runs in this task.

- [x] **Step 5: Mark Task 6 complete and commit**

  ```bash
  git add src/features/achievements \
    src/app/router/create-app-router.tsx \
    src/app/router/create-app-router.test.tsx \
    src/app/shell/app-shell.tsx \
    src/app/shell/app-shell.test.tsx \
    docs/superpowers/plans/2026-07-16-achievements.md
  git commit -m "feat: add student achievement badge UI"
  ```

---

### Task 7: Generalize the Phase 1 evidence policy and add the Phase 2 gate

**Reviewer gate:** Accept only if Game Economy keeps its existing content-aware evidence protections, Achievements has one clean fail-closed runner/finalizer/manifest, headed UI evidence uses real local Supabase, and task-level validation does not execute the gate.

**Files:**

- Create: `scripts/acceptance/evidence-policy.mjs`
- Create: `scripts/acceptance/evidence-policy.d.mts`
- Modify: `scripts/acceptance/finalize-game-economy-v2.mjs`
- Create: `scripts/acceptance/finalize-achievements.mjs`
- Create: `scripts/acceptance/finalize-achievements.d.mts`
- Create: `scripts/acceptance/run-achievements.sh`
- Create: `tests/contracts/evidence-policy.test.ts`
- Create: `tests/contracts/achievements-phase-gate.test.ts`
- Create: `tests/e2e/achievements.spec.ts`
- Modify: `package.json`
- Modify: `docs/superpowers/plans/2026-07-16-achievements.md`

**Consumes:** Phase 1 runner/finalizer behavior, content-aware PNG/WebM/trace/text scanning fixed in `abd2e7a`, browser-health utilities, the real achievement route/repository, local Auth fixtures.

**Produces:** reusable `assertEvidenceSafe`/`requireNonEmptyEvidence`; `pnpm phase:achievements`; deterministic Phase 2 PASS manifest covering exactly `AC-ACH-001`–`AC-ACH-005`.

**Corresponding AC:** `AC-ACH-001`, `AC-ACH-002`, `AC-ACH-003`, `AC-ACH-004`, `AC-ACH-005`.

**Task evidence:** contract output and Playwright `--list` only. The evidence directory is created only by the final phase gate after review.

- [x] **Step 1: Write failing shared-policy and phase-gate contracts**

  Move no implementation first. Tests must require:

  - the shared policy accepts email-shaped bytes inside a magic-valid WebM payload;
  - it validates PNG/WebM magic and scans their textual metadata/container fields;
  - it scans JSON/log/txt/md/html and textual trace ZIP entries with every Phase 1 sensitive pattern;
  - `finalize-game-economy-v2.mjs` imports the shared policy and all existing Game Economy contract tests remain unchanged and green after extraction;
  - package script `phase:achievements` equals `bash scripts/acceptance/run-achievements.sh`;
  - the Achievements runner fails on dirty worktree/non-local Supabase and runs, in order: format, lint, typecheck, unit, build, database, reset, Auth seed, headed Chromium Achievements E2E, finalizer;
  - service role is unset before Playwright and never printed;
  - finalizer requires three screenshots (`375x812`, `768x1024`, `1440x900`), one video, one trace, zero browser-health errors, all command reports, clean source SHA, and exactly five AC IDs;
  - missing/corrupt/sensitive evidence fails closed and PASS manifest paths are relative/sanitized/deterministic;
  - the E2E source has no `page.route`, browser API mock, service role, direct achievement table mutation, or skipped test.

- [x] **Step 2: Run contracts to prove RED**

  Run:

  ```bash
  pnpm exec vitest run \
    tests/contracts/evidence-policy.test.ts \
    tests/contracts/achievements-phase-gate.test.ts \
    tests/contracts/game-economy-phase-gate.test.ts
  ```

  Expected: new shared-policy/Achievements contracts FAIL because their files and package entry point do not exist; the existing Game Economy contract remains green.

- [x] **Step 3: Extract the Phase 1 content-aware evidence policy**

  Export:

  ```ts
  export function containsSensitiveValue(source: Buffer): boolean;
  export function requireNonEmptyEvidence(
    paths: readonly string[],
  ): Promise<void>;
  export function assertEvidenceSafe(
    input: Readonly<{
      evidencePaths: readonly string[];
      root: string;
      tracePaths: readonly string[];
    }>,
  ): Promise<void>;
  ```

  Move, without weakening, PNG/WebM magic validation, PNG textual chunks, WebM container text elements, text-sensitive patterns, trace textual-entry detection, and relative-path scanning from the Game Economy finalizer. Update that finalizer to import the shared functions. Its public manifest and error codes remain unchanged.

- [x] **Step 4: Implement the Achievements runner/finalizer and headed flow**

  Add package script:

  ```json
  "phase:achievements": "bash scripts/acceptance/run-achievements.sh"
  ```

  The headed spec must:

  1. sign in with a seeded student fixture;
  2. open `/app/achievements` and verify nine public badges plus four `未開始` cards;
  3. complete one real perfect ten-question quiz through the browser;
  4. return to `/app/achievements` and verify `first_task_complete` and `first_perfect_quiz` are unlocked from server state;
  5. reload and verify unlock persistence/idempotency;
  6. use an anon Supabase client to prove direct achievement insert/update is rejected, without service role;
  7. verify browser health has zero unexpected console/page/network/server errors;
  8. in acceptance mode only, capture the badge page at the three required viewports and write browser-health JSON. Playwright configuration supplies video and trace.

  The finalizer emits `artifacts/acceptance/achievements-<clean-full-sha>/manifest.json` with `decision: PASS` and exactly the five owner-supplied achievement AC IDs.

- [x] **Step 5: Prove gate tooling GREEN without executing the gate**

  Run:

  ```bash
  pnpm exec vitest run \
    tests/contracts/evidence-policy.test.ts \
    tests/contracts/achievements-phase-gate.test.ts \
    tests/contracts/game-economy-phase-gate.test.ts
  pnpm exec playwright test --list tests/e2e/achievements.spec.ts \
    --project=chromium
  pnpm lint
  pnpm typecheck
  pnpm exec prettier --check --ignore-unknown \
    scripts/acceptance/evidence-policy.mjs \
    scripts/acceptance/evidence-policy.d.mts \
    scripts/acceptance/finalize-game-economy-v2.mjs \
    scripts/acceptance/finalize-achievements.mjs \
    scripts/acceptance/finalize-achievements.d.mts \
    scripts/acceptance/run-achievements.sh \
    tests/contracts/evidence-policy.test.ts \
    tests/contracts/achievements-phase-gate.test.ts \
    tests/e2e/achievements.spec.ts \
    package.json
  ```

  Expected: all three contract files PASS, Playwright lists exactly one Achievements phase-gate test without running it, and lint/typecheck/formatting pass. No `artifacts/acceptance/achievements-*` directory exists.

- [x] **Step 6: Mark Task 7 complete and commit**

  ```bash
  git add scripts/acceptance/evidence-policy.mjs \
    scripts/acceptance/evidence-policy.d.mts \
    scripts/acceptance/finalize-game-economy-v2.mjs \
    scripts/acceptance/finalize-achievements.mjs \
    scripts/acceptance/finalize-achievements.d.mts \
    scripts/acceptance/run-achievements.sh \
    tests/contracts/evidence-policy.test.ts \
    tests/contracts/achievements-phase-gate.test.ts \
    tests/e2e/achievements.spec.ts \
    package.json docs/superpowers/plans/2026-07-16-achievements.md
  git commit -m "test: add Achievements phase gate"
  ```

---

## Complete-range review and single Phase 2 gate

These steps execute only after all seven task commits exist and the worktree is clean.

- [ ] **Review Step 1: Verify the review range and request one complete-range review**

  ```bash
  test "$(git rev-parse c81d870)" = \
    "c81d870b32bcf8e64c7f4a6b6beac6242ccb9150"
  test -z "$(git status --porcelain=v1 --untracked-files=all)"
  git diff --stat c81d870..HEAD
  git log --oneline --reverse c81d870..HEAD
  ```

  Use `superpowers:requesting-code-review` once for `c81d870..HEAD`. The reviewer checks only Phase 2 files and excludes generated `src/types/database.ts`, artifacts, dist, coverage, and lockfile noise. Review priorities are authoritative derivation, transaction rollback, RLS/execute grants, hidden-rule privacy, no reward writes, deferred truthfulness, integration cleanup, scoped pgTAP counts, and evidence-policy regression.

- [ ] **Review Step 2: Resolve review findings**

  Fix every Critical or Important finding with focused RED → GREEN where behavior changes. Commit each coherent review-fix wave without rewriting task commits. Minor findings that do not affect the five AC IDs may be recorded in the final progress entry with owner-visible risk.

  Re-run only lint, typecheck, and tests affected by review fixes. Do not execute E2E or `pnpm phase:achievements` here.

- [ ] **Gate Step 1: Record the reviewed clean SHA**

  ```bash
  test -z "$(git status --porcelain=v1 --untracked-files=all)"
  REVIEWED_SHA="$(git rev-parse HEAD)"
  printf '%s\n' "$REVIEWED_SHA"
  ```

- [ ] **Gate Step 2: Execute the Phase 2 gate exactly once**

  ```bash
  pnpm phase:achievements
  ```

  Expected: one clean local run passes format, lint, typecheck, unit, build, database/RLS tests, Auth seed, and the headed Chromium flow; the finalizer prints the single manifest path under `artifacts/acceptance/achievements-<REVIEWED_SHA>/manifest.json` with `decision: PASS` and `AC-ACH-001`–`AC-ACH-005`.

  If the command fails, stop and report the failing step/root cause. Do not rerun without a new owner instruction.

- [ ] **Gate Step 3: Close Phase 2 only after PASS**

  Update `.superpowers/sdd/progress.md` with:

  - plan commit and seven task commit SHAs;
  - complete-range review range/findings/fix commits;
  - reviewed clean SHA;
  - gate command result and manifest path;
  - AC coverage `AC-ACH-001`–`AC-ACH-005`;
  - the four catalog-only dependencies and their owning future phases;
  - a forward note: `completed_task_count` and `correct_streak` currently derive from all completed quiz sessions; when later phases add assignment/remediation session purposes and Live answers, those derivations must be revisited with a `rule_version` bump so remediation attempts never count;
  - the known main-chunk warning if still emitted.

  Then run:

  ```bash
  pnpm exec prettier --check .superpowers/sdd/progress.md
  git diff --check
  git add -f .superpowers/sdd/progress.md
  git commit -m "docs: close Achievements phase"
  test -z "$(git status --porcelain=v1 --untracked-files=all)"
  ```

  Stop after this commit. Do not plan or implement Classroom/Leaderboard, Assignments, Live, remediation, mastery, or any other phase.

## Plan self-review checklist

- Every Phase 2 scope item maps to at least one task and one of `AC-ACH-001`–`AC-ACH-005`.
- All existing-source achievements have real trusted derivations; the four unavailable-source achievements remain catalog-only and truthfully `not_started`.
- The plan creates only the three approved achievement tables; views/functions/triggers do not introduce an event-counter table.
- All source types are enum values, all rule parameters are versioned/validated, and no SQL/JavaScript rule body is stored.
- Browser interfaces expose no raw rule/source fields and provide no mutation/evaluator call.
- Achievement unlock is unique, append-only, transaction-bound, badge-only, and replay-safe.
- Every migration has a preceding failing pgTAP test; every TypeScript behavior has a preceding failing Vitest/RTL test.
- Integration cleanup, pgTAP scoping, task-level command limits, one review, and one phase gate reflect Phase 1 lessons.
- Every referenced existing path/command exists at baseline; every new path is declared under a task's Create list before use.
- No unresolved marker, vague implementation instruction, skipped assertion, mock backend, or premature evidence run remains.
