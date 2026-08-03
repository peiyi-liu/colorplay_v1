# Assignment Write Retirement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop every new Assignment write, including Assignment-linked Live creation, while preserving historical Assignment schema and read compatibility.

**Architecture:** Add one forward-only Supabase migration that keeps the existing RPC signatures but makes the three Assignment mutation entry points fail with a stable retirement error and rejects non-null `assignment_id` in Live creation. Rewrite the Assignment database contract around retirement and retain the existing pure-Live behavior with `assignment_id = null`.

**Tech Stack:** PostgreSQL 15, Supabase CLI/pgTAP, TypeScript contract tests, Vitest.

## Global Constraints

- This is a retirement safety change, not a schema cleanup: do not drop Assignment tables, columns, foreign keys, historical rows, read RPCs, or generated database types.
- Preserve `list_classroom_assignments(uuid)`, `list_my_assignments()`, `teacher_assignment_summary`, and historical reporting compatibility.
- New Assignment writes must fail with PostgreSQL SQLSTATE `P0001` and exact message `ASSIGNMENT_FEATURE_RETIRED`.
- `create_live_session` must continue to work when `p_assignment_id is null` and must reject any non-null `p_assignment_id` before inserting a Live session.
- Do not change Live participation, scoring, mastery contribution, presenter behavior, routes, APIs unrelated to Assignment retirement, or any `src/` product component.
- Do not delete existing historical Assignment-linked Live finalization behavior; preventing new links is sufficient for this phase.
- Work in the isolated implementation worktree. Stage exact task files only; never use `git add -A`.
- Every commit uses `git commit -F` and the repository-standard `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` trailer.

---

## File Map and Stable Interfaces

- Create `supabase/migrations/20260803000100_retire_assignment_writes.sql`: authoritative write-retirement migration.
- Modify `supabase/tests/015_assignment_commands.test.sql`: pgTAP retirement contract for the three Assignment mutations and preserved reads.
- Modify `supabase/tests/018_live_play.test.sql`: pure-Live regression plus rejection of a non-null Assignment link.
- Verify, do not modify, `src/app/router/create-app-router.test.tsx` and `tests/contracts/assignments-live-phase-gate.test.ts`: UI/route retirement contract.

The migration preserves these callable signatures:

```sql
public.create_assignment(
  uuid, text, public.assignment_activity_type, uuid,
  timestamptz, timestamptz, integer, integer
) returns jsonb

public.update_assignment_status(
  uuid, public.assignment_status, timestamptz
) returns jsonb

public.start_assignment_attempt(uuid, uuid) returns jsonb

public.create_live_session(
  uuid, uuid, uuid, text, integer
) returns jsonb
```

The first three always raise `ASSIGNMENT_FEATURE_RETIRED`. The fourth accepts only a null third argument.

---

### Task 1: Lock the Assignment mutation boundary

**Files:**

- Create: `supabase/migrations/20260803000100_retire_assignment_writes.sql`
- Modify: `supabase/tests/015_assignment_commands.test.sql`

**Interfaces:**

- Consumes: the four signatures in “File Map and Stable Interfaces”.
- Produces: stable SQLSTATE/message retirement behavior without removing RPC names or read models.

- [ ] **Step 1: Replace the old positive Assignment-write cases with failing retirement contracts**

Keep the existing fixture setup needed for teacher/student authentication and historical read rows. Replace mutation-success expectations with explicit `throws_ok` cases and row-count invariants:

```sql
select throws_ok(
  $$select public.create_assignment(
    :'classroom_id'::uuid,
    'Retired assignment',
    'quiz_template'::public.assignment_activity_type,
    :'template_id'::uuid,
    now(),
    now() + interval '1 day',
    10,
    100
  )$$,
  'P0001',
  'ASSIGNMENT_FEATURE_RETIRED',
  'create_assignment is retired'
);

select throws_ok(
  $$select public.update_assignment_status(
    :'historical_assignment_id'::uuid,
    'published'::public.assignment_status,
    now()
  )$$,
  'P0001',
  'ASSIGNMENT_FEATURE_RETIRED',
  'update_assignment_status is retired'
);

select throws_ok(
  $$select public.start_assignment_attempt(
    :'historical_assignment_id'::uuid,
    gen_random_uuid()
  )$$,
  'P0001',
  'ASSIGNMENT_FEATURE_RETIRED',
  'start_assignment_attempt is retired'
);
```

Capture counts before the calls and assert no new rows afterward:

```sql
select is(
  (select count(*) from public.assignments),
  :'assignment_count_before'::bigint,
  'retired RPCs create no assignment rows'
);

select is(
  (select count(*) from public.assignment_attempts),
  :'attempt_count_before'::bigint,
  'retired RPCs create no attempt rows'
);
```

Retain or add positive assertions that historical data is still returned by `list_classroom_assignments`, `list_my_assignments`, and `teacher_assignment_summary`. Do not call a retired mutation to manufacture that history; insert the fixture row directly inside the rolled-back pgTAP transaction.

- [ ] **Step 2: Run the focused database test to verify RED**

Run:

```bash
pnpm exec supabase db reset --local
pnpm exec supabase test db --local supabase/tests/015_assignment_commands.test.sql
```

Expected: reset succeeds; the test fails because current mutation RPCs still write instead of raising `ASSIGNMENT_FEATURE_RETIRED`.

- [ ] **Step 3: Add the forward-only retirement migration**

In `20260803000100_retire_assignment_writes.sql`, use `create or replace function` with the exact current argument and return types. Each Assignment mutation body must be a minimal security-definer PL/pgSQL body:

```sql
begin
  raise exception using
    errcode = 'P0001',
    message = 'ASSIGNMENT_FEATURE_RETIRED';
end;
```

Preserve the existing `security definer`/`set search_path = ''` hardening and grants: revoke from `public, anon`, grant execute to `authenticated`. Keeping execute permission is intentional because it produces the same stable error for old clients instead of an environment-dependent permission error.

Do not redefine any Assignment read RPC and do not alter tables.

- [ ] **Step 4: Reset and verify the focused retirement contract GREEN**

Run:

```bash
pnpm exec supabase db reset --local
pnpm exec supabase test db --local supabase/tests/015_assignment_commands.test.sql
```

Expected: all pgTAP assertions pass, the three mutation RPCs still exist, every mutation raises the stable error, row counts are unchanged, and historical reads remain usable.

- [ ] **Step 5: Format-check and commit Task 1 exactly**

Run:

```bash
pnpm prettier --check supabase/migrations/20260803000100_retire_assignment_writes.sql supabase/tests/015_assignment_commands.test.sql
git diff --check
git add supabase/migrations/20260803000100_retire_assignment_writes.sql supabase/tests/015_assignment_commands.test.sql
```

Create `/tmp/assignment-retirement-task1-message.txt` with:

```text
feat(assignments): retire assignment mutation RPCs

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
```

Commit with `git commit -F /tmp/assignment-retirement-task1-message.txt`.

---

### Task 2: Close the Assignment-linked Live write path

**Files:**

- Modify: `supabase/migrations/20260803000100_retire_assignment_writes.sql`
- Modify: `supabase/tests/018_live_play.test.sql`

**Interfaces:**

- Consumes: current five-argument `public.create_live_session(uuid, uuid, uuid, text, integer)` implementation from `20260720000200_live_teams.sql`.
- Produces: unchanged pure-Live creation for null `p_assignment_id`; stable retirement error for a non-null value.

- [ ] **Step 1: Rewrite the linked-Assignment Live fixture as a rejection contract**

Remove the positive `create_assignment`/publish/start-attempt setup from `018_live_play.test.sql`. Keep the existing Live session, joining, answer, ranking, feedback, and finalization coverage, but create the session with:

```sql
public.create_live_session(
  :'live_activity_id'::uuid,
  :'classroom_id'::uuid,
  null,
  'individual',
  null
)
```

Add one isolated contract using a directly inserted historical Assignment ID:

```sql
select throws_ok(
  format(
    'select public.create_live_session(%L, %L, %L, %L, %s)',
    :'live_activity_id'::uuid,
    :'classroom_id'::uuid,
    :'historical_assignment_id'::uuid,
    'individual',
    null
  ),
  'P0001',
  'ASSIGNMENT_FEATURE_RETIRED',
  'new Live sessions cannot link an Assignment'
);
```

Assert the rejected call did not increase `live_sessions`. Remove only expectations that `finalize_live_session` creates an `assignment_attempt`; keep rewards, rankings, session transitions, idempotency, and null-assignment Live assertions.

- [ ] **Step 2: Run the focused Live database test to verify RED**

Run:

```bash
pnpm exec supabase test db --local supabase/tests/018_live_play.test.sql
```

Expected: the new non-null-link test fails because `create_live_session` still accepts the historical Assignment ID; pure-Live assertions continue to pass.

- [ ] **Step 3: Replace `create_live_session` with one guarded implementation**

Copy the latest full five-argument function body from `20260720000200_live_teams.sql` into the new migration, preserving its authorization, mode, time-limit, section ownership, return payload, grants, and `security definer` settings. Add exactly this guard after caller authentication/teacher authorization and before any insert:

```sql
if p_assignment_id is not null then
  raise exception using
    errcode = 'P0001',
    message = 'ASSIGNMENT_FEATURE_RETIRED';
end if;
```

Do not modify `finalize_live_session`; it must remain capable of reading historical linked sessions.

- [ ] **Step 4: Run Assignment and Live database regressions**

Run:

```bash
pnpm exec supabase db reset --local
pnpm exec supabase test db --local supabase/tests/015_assignment_commands.test.sql
pnpm exec supabase test db --local supabase/tests/017_live_setup.test.sql
pnpm exec supabase test db --local supabase/tests/018_live_play.test.sql
pnpm exec supabase test db --local supabase/tests/033_live_teams.test.sql
```

Expected: all assertions pass. Existing callers with null `assignment_id` retain current behavior; only new linked sessions fail.

- [ ] **Step 5: Format-check, review the precise delta, and commit Task 2**

Run:

```bash
pnpm prettier --check supabase/migrations/20260803000100_retire_assignment_writes.sql supabase/tests/018_live_play.test.sql
git diff --check
git diff -- supabase/migrations/20260803000100_retire_assignment_writes.sql supabase/tests/018_live_play.test.sql
git add supabase/migrations/20260803000100_retire_assignment_writes.sql supabase/tests/018_live_play.test.sql
```

Create `/tmp/assignment-retirement-task2-message.txt` with:

```text
test(live): reject retired assignment links

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
```

Commit with `git commit -F /tmp/assignment-retirement-task2-message.txt`.

---

### Task 3: Run the retirement phase gate and final review

**Files:** No repository changes expected.

**Interfaces:**

- Consumes: Task 1 and Task 2 database contracts.
- Produces: evidence that Assignment writes are closed without regressing the removed UI contract or Live.

- [ ] **Step 1: Run the complete local database suite**

Run:

```bash
pnpm exec supabase db reset --local
pnpm exec supabase test db --local
```

Expected: the reset and every pgTAP file pass.

- [ ] **Step 2: Run the route, contract, repository, and static gates**

Run:

```bash
pnpm vitest run src/app/router/create-app-router.test.tsx tests/contracts/assignments-live-phase-gate.test.ts src/features/live/api/live-repository.test.ts
pnpm typecheck
pnpm lint
pnpm build
```

Expected: all commands exit zero. In particular, the removed Assignment routes still resolve to 404 and pure Live client payloads still use `p_assignment_id: null`.

- [ ] **Step 3: Review exact scope and history compatibility**

Run:

```bash
git diff HEAD~2..HEAD --stat
git diff HEAD~2..HEAD -- src supabase/migrations supabase/tests tests/contracts
rg -n "drop (table|function).*assignment|delete from public\.assignments" supabase/migrations/20260803000100_retire_assignment_writes.sql
```

Expected: only the migration and two database tests changed; the final search returns no matches; no `src/` product code changed.

Check the migration manually against this exact list:

```text
[ ] create_assignment -> P0001 / ASSIGNMENT_FEATURE_RETIRED
[ ] update_assignment_status -> P0001 / ASSIGNMENT_FEATURE_RETIRED
[ ] start_assignment_attempt -> P0001 / ASSIGNMENT_FEATURE_RETIRED
[ ] create_live_session(non-null assignment) -> same error before insert
[ ] create_live_session(null assignment) -> unchanged
[ ] historical reads and finalize compatibility preserved
[ ] no table/function drops and no historical deletes
```

- [ ] **Step 4: Record the verified SHAs for the next plan**

Run `git log -2 --oneline` and copy the two Task commit SHAs into the implementation handoff. Do not push or deploy as part of this plan.
