# ColorPlay Classroom and Leaderboard v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` in one continuous session to implement this plan task-by-task. Do not use `superpowers:subagent-driven-development`. Track every step with its checkbox and commit the completed task checkbox with that task.

**Goal:** Build owner-isolated classrooms, hashed and rotatable join codes, idempotent student membership, and a privacy-safe classroom leaderboard showing the authoritative XP Top 10 plus the signed-in student's own rank.

**Architecture:** PostgreSQL owns classroom authorization, membership, code verification, and XP ranking. Browser code receives only strict privacy-safe RPC projections through feature repositories and TanStack Query; React routes provide student join/leaderboard and teacher classroom-management flows without persisting join-code plaintext. Additive migrations extend the Phase 2 baseline, and one scoped phase runner reuses the shared evidence policy.

**Tech Stack:** PostgreSQL/Supabase Auth/RLS/security-definer RPCs, React 19, TypeScript strict mode, React Router, TanStack Query, Zod, Tailwind CSS, Vitest, React Testing Library, pgTAP, Playwright, pnpm.

## Global Constraints

- Baseline is exactly `65d8b705eba9c18aecdf033ef37048b340f639d6`; commit this plan before Task 1 without rewriting baseline or prior commits.
- This is the canonical replacement for the already `SUPERSEDED` `docs/superpowers/plans/2026-07-14-classroom-leaderboard.md`; never execute or edit the historical plan during Phase 3.
- Existing migrations are immutable. Phase 3 creates additive migrations beginning at `20260717000100`.
- Browser state is untrusted. It never decides membership, ownership, XP, rank, tie-breaking, or code validity and never receives Email, student number, raw answer data, join-code hashes, or a full classroom roster through the leaderboard interface.
- Frontend and Playwright browser contexts never receive `SUPABASE_SERVICE_ROLE_KEY`; no server secret is added to a `VITE_` variable.
- Join-code plaintext is returned only by successful create/rotate RPC responses, kept in component-local memory, and removed when the receipt is dismissed or the page reloads. The database stores only a SHA-256 digest of a server-generated 64-bit random code.
- A student can have one `(classroom_id, user_id)` membership row per classroom and active memberships in multiple classrooms. Repeated valid joins return the same membership; rotation invalidates the previous code.
- Leaderboard XP is the sum of authoritative positive `xp_transactions` at or after the member's immutable `joined_at`. Ordering is XP descending, first time the final XP total was reached ascending, then internal user UUID ascending.
- The leaderboard response is exactly Top 10 plus a separate self entry. It exposes only display name, active Blook identity, XP, rank, and `is_self`; internal user UUIDs are used for ordering but never returned.
- Task-level checks run only Prettier for changed files, lint, typecheck, pgTAP or affected Vitest/RTL/integration tests. Do not run Playwright, create evidence, or execute `pnpm phase:classroom-leaderboard` before the final phase section.
- Every behavior change follows RED → GREEN. Every migration is preceded by a failing pgTAP/RLS test whose counts are scoped to UUIDs created by that test.
- Integration cleanup uses `client.auth.signOut({ scope: 'local' })`. A test of global sign-out must use dedicated accounts; Phase 3 does not test global sign-out.
- New quiz-driving E2E code uses role-based locators and waits for `第 N / 10 題` before reading each prompt. It does not refactor or modify the existing Game Economy or Achievements E2E flows.
- One task equals one commit. Each task's final commit stages this plan after changing that task and all of its step checkboxes to `[x]`; the worktree must be clean between tasks.
- Request one complete-range review after all ten tasks. Produce phase evidence once, only after review fixes and one disposable headless precheck pass.
- Exit ACs are exactly `AC-AUTH-005`, `AC-AUTH-006`, `AC-AUTH-007`, `AC-GAME-008`, and `AC-GAME-009`.
- `AC-UI-006`, `AC-UI-007`, `AC-UI-009`, and `AC-UI-015` receive scoped supporting checks but are not claimed complete for the whole product. `AC-PERF-003` staging p95 and the full `AC-UI-001/002` release evidence remain Phase 8 work.
- Do not create assignment, Live, privacy-setting, or analytics tables, routes, controls, counters, or fabricated data. Future assignments and Live consume `classrooms.id` and the active-membership predicate; future privacy and analytics use new additive trusted projections rather than widening the Phase 3 leaderboard payload.
- Do not run the deferred global `pnpm acceptance`, production deployment, staging latency sampling, real-device checks, or remote Supabase/Vercel operations.

---

## Locked interfaces

### Database values

```sql
create type public.classroom_status as enum ('active', 'archived');
create type public.classroom_member_role as enum ('student', 'teacher');
create type public.classroom_member_status as enum ('active', 'inactive');
```

```sql
public.classrooms(
  id uuid primary key,
  owner_teacher_id uuid not null,
  name text not null,
  join_code_hash bytea not null,
  join_code_version integer not null,
  join_code_rotated_at timestamptz not null,
  status public.classroom_status not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
)

public.classroom_members(
  classroom_id uuid not null,
  user_id uuid not null,
  member_role public.classroom_member_role not null,
  status public.classroom_member_status not null,
  joined_at timestamptz not null,
  activated_at timestamptz not null,
  deactivated_at timestamptz,
  last_join_request_id uuid not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (classroom_id, user_id)
)
```

`joined_at` is immutable and represents the beginning of the Phase 3 leaderboard earning window. Creating a classroom inserts one active `teacher` membership for its owner; leaderboard ranking filters to active `student` memberships. This phase has no student leave control; `inactive` supports truthful seed/negative/reactivation tests and later trusted lifecycle commands without changing the primary key.

### Trusted SQL interfaces

```sql
public.is_active_classroom_member(p_classroom_id uuid, p_user_id uuid)
returns boolean

public.create_classroom(p_name text)
returns table (classroom_id uuid, classroom_name text, join_code text, join_code_version integer)

public.rotate_classroom_join_code(p_classroom_id uuid)
returns table (classroom_id uuid, join_code text, join_code_version integer)

public.join_classroom(p_join_code text, p_request_id uuid)
returns table (classroom_id uuid, classroom_name text, membership_status public.classroom_member_status, joined_at timestamptz)

public.list_my_classrooms()
returns table (classroom_id uuid, classroom_name text, membership_status public.classroom_member_status, joined_at timestamptz)

public.list_owned_classrooms()
returns table (classroom_id uuid, classroom_name text, classroom_status public.classroom_status, member_count bigint, join_code_version integer, created_at timestamptz)

public.list_owned_classroom_members(p_classroom_id uuid)
returns table (display_name text, active_blook_id uuid, membership_status public.classroom_member_status, joined_at timestamptz)

public.get_classroom_leaderboard(p_classroom_id uuid)
returns jsonb
```

Every security-definer function fixes `search_path`, revokes `PUBLIC` execute, grants only `authenticated`, derives the actor from `auth.uid()`, and checks role/ownership/membership internally.

### Leaderboard JSON contract

```ts
export type LeaderboardEntry = Readonly<{
  activeBlookId: string | null;
  displayName: string;
  isSelf: boolean;
  rank: number;
  totalXp: number;
}>;

export type ClassroomLeaderboard = Readonly<{
  classroomId: string;
  classroomName: string;
  generatedAt: string;
  selfEntry: LeaderboardEntry | null;
  topEntries: readonly LeaderboardEntry[];
}>;
```

The SQL JSON keys use snake case: `classroom_id`, `classroom_name`, `generated_at`, `self_entry`, `top_entries`, and entry keys `active_blook_id`, `display_name`, `is_self`, `rank`, `total_xp`. Zod strict objects reject added privacy-sensitive keys.

### Frontend repository interfaces

```ts
export type ClassroomRepository = Readonly<{
  createClassroom(input: { name: string }): Promise<ClassroomCodeReceipt>;
  getOwnedMembers(classroomId: string): Promise<readonly ClassroomMember[]>;
  joinClassroom(input: {
    joinCode: string;
    requestId: string;
  }): Promise<JoinedClassroom>;
  listMine(): Promise<readonly StudentClassroom[]>;
  listOwned(): Promise<readonly OwnedClassroom[]>;
  rotateJoinCode(classroomId: string): Promise<ClassroomCodeReceipt>;
}>;

export type LeaderboardRepository = Readonly<{
  getClassroomLeaderboard(classroomId: string): Promise<ClassroomLeaderboard>;
}>;
```

### Routes

```text
/join/:joinCode                    authenticated join intent; login return preserved
/app/leaderboard                   student classroom list, manual join, and leaderboard entry
/app/leaderboard/:classroomId      member/owner-safe classroom leaderboard
/teacher/classes                   teacher-owned classroom list and create
/teacher/classes/:classroomId      teacher-owned members and code rotation
```

These paths follow the normative `spec/01-user-roles-and-flows.md` route contract exactly: `/teacher/classes` and `/teacher/classes/:classroomId` are the contracted Phase 3 teacher rows, and `/app/leaderboard` is the contracted Phase 3 student row. `/app/leaderboard/:classroomId` is an additive child of that contracted route, owned by the `leaderboard` feature. Phase 3 creates the top-level `/teacher` route tree with the existing role guard and route-level lazy loading so teacher management code stays out of the student bundle; the fuller `/teacher` workspace shell remains Phase 6 work.

`/join/:joinCode` never joins automatically. It displays a confirmation form and removes the code from the URL with a replace navigation after success.

### Exit traceability

| Exit AC       | Primary tasks              | Gate proof                                                                 |
| ------------- | -------------------------- | -------------------------------------------------------------------------- |
| `AC-AUTH-005` | 1, 2, 5, 8, 10             | Teacher RPC denial, `RequireRole`, direct student route/API negative cases |
| `AC-AUTH-006` | 1, 2, 3, 4, 5, 6, 8, 9, 10 | Teacher B, outsider, inactive-member, and anonymous isolation              |
| `AC-AUTH-007` | 2, 4, 5, 7, 10             | Valid join, ten-call replay, invalid/rotated code, real join UI            |
| `AC-GAME-008` | 3, 6, 9, 10                | Ledger-only rank, tie-breaks, Top 10 plus self, five-second UI update      |
| `AC-GAME-009` | 3, 6, 9, 10                | Strict safe projection, nonmember denial, response/DOM sensitive scan      |

---

### Task 1: Classroom tables, column privacy, and tenant RLS

- [x] **Task 1 delivery marker**

**Reviewer gate:** Accept only if the two approved tables exist with constraints/indexes, hash columns cannot be selected by students, direct browser mutations are denied, owner/member reads work, and Teacher A/Teacher B/outsider/anonymous negative cases pass.

**Files:**

- Read: `supabase/migrations/20260713000100_create_profiles.sql`
- Create: `supabase/migrations/20260717000100_classrooms.sql`
- Create: `supabase/tests/011_classrooms_rls.test.sql`
- Modify: `docs/superpowers/plans/2026-07-17-classroom-leaderboard-v2.md`

**Consumes:** `profiles.id`, trusted `profiles.role`, `profiles.active_blook_id`, Supabase `auth.uid()`.

**Produces:** the three enums and two tables in Locked interfaces; `is_active_classroom_member(uuid, uuid) -> boolean`; owner/member RLS predicates; indexes on `owner_teacher_id`, membership `user_id`, and active membership lookup. The helper recognizes active teacher and student memberships; callers that require a student additionally check `member_role = 'student'`.

**AC:** `AC-AUTH-005`, `AC-AUTH-006`.

- [x] **Step 1: Write the failing pgTAP/RLS test**

Create test-owned Teacher A, Teacher B, Student A, Student B, and outsider UUIDs. Assert table/enums/constraints/indexes; positive owner and active-member reads; zero rows or denial for Teacher B, outsider, and anonymous; denial for authenticated direct insert/update/delete; denial when selecting `join_code_hash`; and no policy named or defined with an unconditional `true` predicate. Scope every count with the five UUIDs.

```sql
select throws_ok(
  $$ select join_code_hash from public.classrooms $$,
  '42501',
  null,
  'join hash is not selectable through authenticated column grants'
);

select is(
  (select count(*) from public.classroom_members
   where classroom_id = :'classroom_a' and user_id = :'student_a'),
  1::bigint,
  'the test owns exactly one scoped membership'
);
```

- [x] **Step 2: Run the database test to prove RED**

```bash
pnpm exec supabase db reset --local
pnpm exec supabase test db supabase/tests/011_classrooms_rls.test.sql
```

Expected: FAIL because `public.classrooms` and `public.classroom_members` do not exist.

- [x] **Step 3: Implement the minimal schema and RLS boundary**

Create the enums/tables exactly as locked. Validate trimmed names at 1–80 characters, `join_code_version > 0`, `deactivated_at is null` for active members, owner role through trusted profile lookup, and immutable `owner_teacher_id`, `join_code_hash`, `joined_at`, and primary-key columns outside trusted functions. Grant authenticated users only safe classroom columns; never grant `join_code_hash`.

```sql
revoke all on public.classrooms, public.classroom_members from anon, authenticated;
grant select (id, owner_teacher_id, name, status, created_at, updated_at)
  on public.classrooms to authenticated;
grant select (
  classroom_id,
  user_id,
  member_role,
  status,
  joined_at,
  activated_at,
  deactivated_at,
  created_at,
  updated_at
) on public.classroom_members to authenticated;
```

`is_active_classroom_member` is `stable`, derives no browser claim, and is usable by later assignment/Live policies without exposing membership rows.

- [x] **Step 4: Run scoped GREEN checks**

```bash
pnpm exec supabase db reset --local
pnpm exec supabase test db supabase/tests/011_classrooms_rls.test.sql
pnpm lint
pnpm typecheck
```

Expected: scoped pgTAP passes; lint and typecheck exit 0.

- [x] **Step 5: Mark Task 1 complete and commit**

Change Task 1 and Steps 1–5 to `[x]`, then run:

```bash
git add supabase/migrations/20260717000100_classrooms.sql \
  supabase/tests/011_classrooms_rls.test.sql \
  docs/superpowers/plans/2026-07-17-classroom-leaderboard-v2.md
git commit -m "feat: add isolated classroom data boundary"
test -z "$(git status --porcelain=v1 --untracked-files=all)"
```

---

### Task 2: Trusted create, rotate, join, and safe classroom projections

- [x] **Task 2 delivery marker**

**Reviewer gate:** Accept only if plaintext codes are server-generated and returned once, only owners rotate codes, old codes stop working, valid join replay ten times creates one row, inactive membership reactivates without changing original `joined_at`, and no RPC returns a hash or Email.

**Files:**

- Create: `supabase/migrations/20260717000200_classroom_commands.sql`
- Create: `supabase/tests/012_classroom_commands.test.sql`
- Modify: `docs/superpowers/plans/2026-07-17-classroom-leaderboard-v2.md`

**Consumes:** Task 1 tables/enums/RLS/helper; `gen_random_bytes`, `digest`, `auth.uid()`, trusted profile role.

**Produces:** `create_classroom`, `rotate_classroom_join_code`, `join_classroom`, `list_my_classrooms`, `list_owned_classrooms`, and `list_owned_classroom_members` with the locked signatures.

**AC:** `AC-AUTH-005`, `AC-AUTH-006`, `AC-AUTH-007`.

- [x] **Step 1: Write failing command and idempotency pgTAP tests**

Use only test-owned UUIDs. Test Teacher A create success, Student create denial, Teacher B rotate denial, rotation version increment, old-code rejection, invalid format rejection without classroom disclosure, archived classroom rejection, outsider safe reads, and ten identical calls using one request UUID.

```sql
select lives_ok(
  $$ select * from public.join_classroom(:'valid_code', :'request_id') $$,
  'valid join succeeds'
);

select is(
  (select count(*) from public.classroom_members
   where classroom_id = :'classroom_a' and user_id = :'student_a'),
  1::bigint,
  'ten replayed joins still produce one membership row'
);
```

Assert `joined_at` is unchanged across active replay and inactive reactivation, while `activated_at` advances only on reactivation. Inspect returned columns and routine grants so hash, Email, raw role metadata, and arbitrary profile fields cannot appear.

- [x] **Step 2: Run the command test to prove RED**

```bash
pnpm exec supabase db reset --local
pnpm exec supabase test db supabase/tests/012_classroom_commands.test.sql
```

Expected: FAIL with missing `create_classroom`, `rotate_classroom_join_code`, and `join_classroom` routines.

- [x] **Step 3: Implement code normalization, hashing, commands, and projections**

Generate 16 uppercase hexadecimal characters from `extensions.gen_random_bytes(8)`, display them as four groups separated by hyphens, normalize by removing hyphens, and store only `extensions.digest(normalized_code, 'sha256')`. On Supabase, pgcrypto lives in the `extensions` schema, which the fixed `search_path = pg_catalog, public` excludes — always call both functions fully qualified and add an idempotent `create extension if not exists pgcrypto with schema extensions;` at the top of the migration; do not widen any function's search_path. Add a unique index on `classrooms(join_code_hash)` and retry generation on that index. Compare digests inside the trusted join function and return a generic invalid-code error for malformed, unknown, rotated, or archived codes.

```sql
perform set_config('search_path', 'pg_catalog, public', true);
if auth.uid() is null then
  raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
end if;
```

Lock the classroom row during rotation and join. `create_classroom` inserts the owner as one active `teacher` membership in the same transaction. Use the membership primary key for student join race safety. Active replay returns the existing row without changing `joined_at`; an inactive student row becomes active and retains its original `joined_at`. Read RPCs project only their declared columns, and owned student member lists exclude the owner's teacher membership.

- [x] **Step 4: Run scoped GREEN checks**

```bash
pnpm exec supabase db reset --local
pnpm exec supabase test db supabase/tests/011_classrooms_rls.test.sql
pnpm exec supabase test db supabase/tests/012_classroom_commands.test.sql
pnpm lint
pnpm typecheck
```

Expected: both scoped database files pass; lint and typecheck exit 0.

- [x] **Step 5: Mark Task 2 complete and commit**

```bash
git add supabase/migrations/20260717000200_classroom_commands.sql \
  supabase/tests/012_classroom_commands.test.sql \
  docs/superpowers/plans/2026-07-17-classroom-leaderboard-v2.md
git commit -m "feat: add trusted classroom membership commands"
test -z "$(git status --porcelain=v1 --untracked-files=all)"
```

---

### Task 3: Authoritative Top 10 plus self leaderboard RPC

- [x] **Task 3 delivery marker**

**Reviewer gate:** Accept only if the query ranks all active members from XP ledger rows earned after their `joined_at`, applies the exact three-part ordering, returns at most ten top entries plus self, permits only active members and the owning teacher, and has no Email/user UUID/full-roster leak.

**Files:**

- Read: `supabase/migrations/20260716000100_game_economy_ledgers.sql`
- Read: `supabase/migrations/20260716000300_blook_inventory.sql`
- Create: `supabase/migrations/20260717000300_classroom_leaderboard.sql`
- Create: `supabase/tests/013_classroom_leaderboard.test.sql`
- Modify: `docs/superpowers/plans/2026-07-17-classroom-leaderboard-v2.md`

**Consumes:** Task 1 membership window; Task 2 ownership/membership authorization; Phase 1 `xp_transactions`; `profiles.display_name` and `profiles.active_blook_id`.

**Produces:** `get_classroom_leaderboard(uuid) -> jsonb` with the exact locked JSON contract; internal ranked CTE using user UUID only as the final hidden tie-breaker.

**AC:** `AC-AUTH-006`, `AC-GAME-008`, `AC-GAME-009`.

- [x] **Step 1: Write failing ranking/privacy pgTAP tests**

Create 12 test-owned active student members plus the owner's active teacher membership, XP transactions before and after each student's `joined_at`, equal-XP students reaching totals at different times, and equal-XP/equal-time rows resolved by internal UUID. Assert exact ranks, Top 10 length, rank-12 self entry, owner view with `self_entry = null`, owner exclusion from ranking, and response-key allowlists.

```sql
select is(
  jsonb_array_length((public.get_classroom_leaderboard(:'classroom_id'))->'top_entries'),
  10,
  'projection contains exactly Top 10'
);

select is(
  ((public.get_classroom_leaderboard(:'classroom_id'))->'self_entry'->>'rank')::integer,
  12,
  'member outside Top 10 receives own exact rank'
);
```

Assert outsider, inactive member, Teacher B, and anonymous access fails or returns no product data. Convert the JSON to text and assert it contains none of the test Emails, student numbers, raw member UUID strings, answer fields, or transaction rows. Count only transactions with test-owned source UUIDs.

- [x] **Step 2: Run the leaderboard test to prove RED**

```bash
pnpm exec supabase db reset --local
pnpm exec supabase test db supabase/tests/013_classroom_leaderboard.test.sql
```

Expected: FAIL because `get_classroom_leaderboard` does not exist.

- [x] **Step 3: Implement the ranked ledger aggregation**

Build one SQL/security-definer function. Lock no browser-supplied score, ignore client clocks, and aggregate only persisted ledger amounts:

```sql
sum(x.amount) filter (where x.created_at >= m.joined_at) as total_xp
```

Use zero for members without transactions. For positive totals, `first_reached_at` is the timestamp of the last contributing ledger row in cumulative order; for zero it is `joined_at`. Apply:

```sql
row_number() over (
  order by total_xp desc, first_reached_at asc, user_id asc
)
```

Build JSON only after ranks exist, with `top_entries` limited to rank 1–10 and a separately selected caller entry. Set `generated_at` from database time. Do not expose the ranked CTE or grant direct access to a leaderboard view.

- [x] **Step 4: Run scoped GREEN checks**

```bash
pnpm exec supabase db reset --local
pnpm exec supabase test db supabase/tests/013_classroom_leaderboard.test.sql
pnpm lint
pnpm typecheck
```

Expected: leaderboard pgTAP passes all ranking and negative privacy assertions; lint/typecheck exit 0.

- [x] **Step 5: Mark Task 3 complete and commit**

```bash
git add supabase/migrations/20260717000300_classroom_leaderboard.sql \
  supabase/tests/013_classroom_leaderboard.test.sql \
  docs/superpowers/plans/2026-07-17-classroom-leaderboard-v2.md
git commit -m "feat: add authoritative classroom leaderboard"
test -z "$(git status --porcelain=v1 --untracked-files=all)"
```

---

### Task 4: Deterministic local fixtures and generated database types

- [x] **Task 4 delivery marker**

**Reviewer gate:** Accept only if reset plus Auth seed creates two owner-separated classrooms, at least two active student memberships and one outsider, stores no plaintext fixture code, keeps production credentials absent, and generated TypeScript exactly matches local schema.

**Files:**

- Modify: `tests/fixtures/users.ts`
- Modify: `scripts/supabase/seed-auth.ts`
- Modify: `src/types/database.ts`
- Modify: `tests/contracts/database-types.test.sh`
- Create: `tests/integration/classroom-seed.integration.test.ts`
- Modify: `docs/superpowers/plans/2026-07-17-classroom-leaderboard-v2.md`

**Consumes:** Task 2 RPCs; existing `TEST_USERS`; local-only service-role environment inside the seed process.

**Produces:** `teacherTwo`, `classroomRepositoryTeacher`, and `classroomRepositoryStudent` local/staging-only identities; two deterministic owner-separated classroom fixtures; regenerated `Database` types for all Phase 3 routines/tables.

**AC:** `AC-AUTH-006`, `AC-AUTH-007`.

- [x] **Step 1: Write failing fixture and type contracts**

Extend the database type contract to require the three Phase 3 migrations' tables, enums, and RPC signatures. Add a real-local integration test that queries only fixture-owned UUIDs and asserts two distinct owners, expected active memberships, outsider absence, and no readable `join_code_hash`. Clean authenticated clients in `finally`:

```ts
await client.auth.signOut({ scope: 'local' });
```

- [x] **Step 2: Run contracts to prove RED**

```bash
bash tests/contracts/database-types.test.sh
pnpm exec supabase db reset --local
source scripts/supabase/load-local-environment.sh
load_local_supabase_environment < <(pnpm exec supabase status -o env 2>/dev/null)
export SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY
pnpm exec tsx scripts/supabase/seed-auth.ts
unset SUPABASE_SERVICE_ROLE_KEY
pnpm exec vitest run --config vitest.integration.config.ts tests/integration/classroom-seed.integration.test.ts
```

Expected: database-type contract FAILS because generated types lack Phase 3; seed integration FAILS because the dedicated identities/fixtures do not exist.

- [x] **Step 3: Add minimal fixtures and regenerate types**

Add dedicated test identities with `role: 'teacher'` or `role: 'student'` and non-production example Emails. After Auth/profile reconciliation, seed classrooms through trusted calls or equivalent server-side fixture setup that computes hashes and never stores plaintext in source or table rows. Make rerunning the seed converge on the same fixture IDs/relationships.

```bash
pnpm exec supabase gen types typescript --local > src/types/database.ts
pnpm exec prettier --write src/types/database.ts
```

This is a mechanical generated-file rewrite; do not hand-edit generated declarations.

- [x] **Step 4: Reset, seed, and prove GREEN**

```bash
pnpm exec supabase db reset --local
source scripts/supabase/load-local-environment.sh
load_local_supabase_environment < <(pnpm exec supabase status -o env 2>/dev/null)
export SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY
pnpm exec tsx scripts/supabase/seed-auth.ts
unset SUPABASE_SERVICE_ROLE_KEY
bash tests/contracts/database-types.test.sh
pnpm exec vitest run --config vitest.integration.config.ts tests/integration/classroom-seed.integration.test.ts
pnpm lint
pnpm typecheck
```

Expected: type contract and scoped real-local fixture integration pass; lint/typecheck exit 0.

- [x] **Step 5: Mark Task 4 complete and commit**

```bash
git add tests/fixtures/users.ts scripts/supabase/seed-auth.ts \
  src/types/database.ts tests/contracts/database-types.test.sh \
  tests/integration/classroom-seed.integration.test.ts \
  docs/superpowers/plans/2026-07-17-classroom-leaderboard-v2.md
git commit -m "test: add isolated classroom fixtures and types"
test -z "$(git status --porcelain=v1 --untracked-files=all)"
```

---

### Task 5: Classroom repository and query/mutation hooks

- [x] **Task 5 delivery marker**

**Reviewer gate:** Accept only if strict parsers reject extra/privacy-sensitive fields, error mapping is actionable without leaking code existence, join uses one generated request UUID, create/rotate cannot auto-retry into duplicate side effects, Query invalidation is scoped, and real-local integration covers owner/member/cross-tenant behavior.

**Files:**

- Read: `src/features/achievements/api/achievement-repository.ts`
- Read: `src/features/achievements/hooks/use-achievements.ts`
- Create: `src/features/classrooms/types.ts`
- Create: `src/features/classrooms/api/classroom-repository.ts`
- Create: `src/features/classrooms/api/classroom-repository.test.ts`
- Create: `src/features/classrooms/api/classroom-repository.integration.test.ts`
- Create: `src/features/classrooms/hooks/use-classrooms.ts`
- Create: `src/features/classrooms/hooks/use-classrooms.test.tsx`
- Modify: `docs/superpowers/plans/2026-07-17-classroom-leaderboard-v2.md`

**Consumes:** Task 2 RPCs and Task 4 generated `Database` types/dedicated users; existing Supabase client and Query provider patterns.

**Produces:** the locked `ClassroomRepository`; `StudentClassroom`, `OwnedClassroom`, `ClassroomMember`, `ClassroomCodeReceipt`, `JoinedClassroom`, `ClassroomRepositoryError`; hooks `useMyClassrooms`, `useOwnedClassrooms`, `useOwnedClassroomMembers`, `useCreateClassroom`, `useRotateClassroomJoinCode`, and `useJoinClassroom`.

**AC:** `AC-AUTH-005`, `AC-AUTH-006`, `AC-AUTH-007`.

- [x] **Step 1: Write failing repository and hook tests**

Unit-test exact snake-case to camel-case mapping, trimmed classroom name validation, join-code receipt shape, generic invalid-code errors, strict rejection of `email`, `join_code_hash`, raw profile objects, and malformed timestamps. Hook tests assert pending lock, error-in-context, success invalidation, and stable query keys.

```ts
export const classroomKeys = {
  mine: ['classrooms', 'mine'] as const,
  owned: ['classrooms', 'owned'] as const,
  ownedMembers: (classroomId: string) =>
    ['classrooms', 'owned', classroomId, 'members'] as const,
};
```

The integration test signs in dedicated teacher/student identities, creates and joins a uniquely named classroom, calls all projections, verifies Teacher B/outsider denial, replays one request UUID ten times, and always uses local-only sign-out cleanup.

- [x] **Step 2: Run focused tests to prove RED**

```bash
pnpm exec vitest run src/features/classrooms/api/classroom-repository.test.ts \
  src/features/classrooms/hooks/use-classrooms.test.tsx
pnpm exec supabase db reset --local
source scripts/supabase/load-local-environment.sh
load_local_supabase_environment < <(pnpm exec supabase status -o env 2>/dev/null)
export SUPABASE_URL SUPABASE_ANON_KEY
pnpm exec vitest run --config vitest.integration.config.ts \
  src/features/classrooms/api/classroom-repository.integration.test.ts
```

Expected: FAIL because repository, types, and hooks do not exist.

- [x] **Step 3: Implement the minimal repository and hooks**

Use Zod strict objects for every RPC response. Normalize UI input but let the server decide validity. Generate join `requestId` with `crypto.randomUUID()` at mutation invocation and retain it for TanStack Query's retry of that join. Set create/rotate mutation retry to false because their one-time plaintext receipt cannot be recovered safely from an automatic replay. Never put `joinCode` in a query key or cache.

```ts
export type ClassroomRepository = Readonly<{
  createClassroom(input: { name: string }): Promise<ClassroomCodeReceipt>;
  getOwnedMembers(classroomId: string): Promise<readonly ClassroomMember[]>;
  joinClassroom(input: {
    joinCode: string;
    requestId: string;
  }): Promise<JoinedClassroom>;
  listMine(): Promise<readonly StudentClassroom[]>;
  listOwned(): Promise<readonly OwnedClassroom[]>;
  rotateJoinCode(classroomId: string): Promise<ClassroomCodeReceipt>;
}>;
```

Retry read queries under existing Query defaults. Join retries reuse the same input/request ID. Create/rotate do not auto-retry and instruct the teacher to inspect the owned-class list or rotate again after an ambiguous network failure. All terminal errors remain in the initiating form.

- [x] **Step 4: Reset/seed and prove GREEN**

```bash
pnpm exec supabase db reset --local
source scripts/supabase/load-local-environment.sh
load_local_supabase_environment < <(pnpm exec supabase status -o env 2>/dev/null)
export SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY
pnpm exec tsx scripts/supabase/seed-auth.ts
unset SUPABASE_SERVICE_ROLE_KEY
pnpm exec vitest run \
  src/features/classrooms/api/classroom-repository.test.ts \
  src/features/classrooms/hooks/use-classrooms.test.tsx
pnpm exec vitest run --config vitest.integration.config.ts \
  src/features/classrooms/api/classroom-repository.integration.test.ts
pnpm lint
pnpm typecheck
```

Expected: unit/hook/real-local integration tests pass; lint/typecheck exit 0.

- [x] **Step 5: Mark Task 5 complete and commit**

```bash
git add src/features/classrooms \
  docs/superpowers/plans/2026-07-17-classroom-leaderboard-v2.md
git commit -m "feat: add classroom data interfaces"
test -z "$(git status --porcelain=v1 --untracked-files=all)"
```

---

### Task 6: Privacy-safe leaderboard repository and hook

- [ ] **Task 6 delivery marker**

**Reviewer gate:** Accept only if runtime validation permits exactly the locked safe fields, rejects Email/raw UUID/extra keys, preserves rank/XP integers and UTC time, and real-local integration proves member/owner success plus outsider/Teacher B denial.

**Files:**

- Read: `src/features/achievements/api/achievement-repository.ts`
- Read: `src/features/achievements/hooks/use-achievements.ts`
- Create: `src/features/leaderboard/types.ts`
- Create: `src/features/leaderboard/api/leaderboard-repository.ts`
- Create: `src/features/leaderboard/api/leaderboard-repository.test.ts`
- Create: `src/features/leaderboard/api/leaderboard-repository.integration.test.ts`
- Create: `src/features/leaderboard/hooks/use-classroom-leaderboard.ts`
- Create: `src/features/leaderboard/hooks/use-classroom-leaderboard.test.tsx`
- Modify: `docs/superpowers/plans/2026-07-17-classroom-leaderboard-v2.md`

**Consumes:** Task 3 RPC JSON contract, Task 4 generated types/dedicated users, existing Query client.

**Produces:** locked `LeaderboardEntry`, `ClassroomLeaderboard`, `LeaderboardRepository`; `leaderboardKeys.classroom(classroomId)`; `useClassroomLeaderboard(classroomId)`.

**AC:** `AC-AUTH-006`, `AC-GAME-008`, `AC-GAME-009`.

- [ ] **Step 1: Write failing parser/repository/hook tests**

Test exact mapping, Top 10 maximum, rank 1-based positive integer, nonnegative safe-integer XP, UTC `generated_at`, nullable Blook/self, and strict rejection of `email`, `student_number`, `user_id`, `answers`, or an eleventh top entry. Hook tests assert class-scoped keys, disabled query for invalid UUID, loading/error/retry, and no previous classroom data retained when the ID changes.

- [ ] **Step 2: Run tests to prove RED**

```bash
pnpm exec vitest run src/features/leaderboard/api/leaderboard-repository.test.ts \
  src/features/leaderboard/hooks/use-classroom-leaderboard.test.tsx
pnpm exec supabase db reset --local
source scripts/supabase/load-local-environment.sh
load_local_supabase_environment < <(pnpm exec supabase status -o env 2>/dev/null)
export SUPABASE_URL SUPABASE_ANON_KEY
pnpm exec vitest run --config vitest.integration.config.ts \
  src/features/leaderboard/api/leaderboard-repository.integration.test.ts
```

Expected: FAIL because leaderboard feature modules do not exist.

- [ ] **Step 3: Implement strict parsing, repository, and hook**

```ts
export const leaderboardKeys = {
  classroom: (classroomId: string) =>
    ['leaderboard', 'classroom', classroomId] as const,
};
```

Call only `get_classroom_leaderboard`. Convert snake case once in the repository, preserve server rank/order, and never sort or calculate XP in TypeScript. Return `LeaderboardRepositoryError` with safe codes for unauthorized, unavailable, and invalid-response states.

- [ ] **Step 4: Reset/seed and prove GREEN**

```bash
pnpm exec supabase db reset --local
source scripts/supabase/load-local-environment.sh
load_local_supabase_environment < <(pnpm exec supabase status -o env 2>/dev/null)
export SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY
pnpm exec tsx scripts/supabase/seed-auth.ts
unset SUPABASE_SERVICE_ROLE_KEY
pnpm exec vitest run \
  src/features/leaderboard/api/leaderboard-repository.test.ts \
  src/features/leaderboard/hooks/use-classroom-leaderboard.test.tsx
pnpm exec vitest run --config vitest.integration.config.ts \
  src/features/leaderboard/api/leaderboard-repository.integration.test.ts
pnpm lint
pnpm typecheck
```

Expected: repository/hook/integration tests pass with no raw identifier in returned objects; lint/typecheck exit 0.

- [ ] **Step 5: Mark Task 6 complete and commit**

```bash
git add src/features/leaderboard \
  docs/superpowers/plans/2026-07-17-classroom-leaderboard-v2.md
git commit -m "feat: add privacy-safe leaderboard data interface"
test -z "$(git status --porcelain=v1 --untracked-files=all)"
```

---

### Task 7: Student classroom list, manual join, and preserved join intent

- [ ] **Task 7 delivery marker**

**Reviewer gate:** Accept only if `/join/:joinCode` survives authentication without auto-joining, manual and URL join use one form interaction group, success removes the code from browser URL/history, pending prevents duplicate clicks, and errors/loading/empty states remain in context.

**Files:**

- Create: `src/features/classrooms/components/join-classroom-form.tsx`
- Create: `src/features/classrooms/components/join-classroom-form.test.tsx`
- Create: `src/features/classrooms/pages/student-classrooms-page.tsx`
- Create: `src/features/classrooms/pages/student-classrooms-page.test.tsx`
- Create: `src/features/classrooms/pages/join-classroom-route.tsx`
- Create: `src/features/classrooms/pages/join-classroom-route.test.tsx`
- Modify: `src/features/auth/components/require-auth.tsx`
- Modify: `src/features/auth/components/require-auth.test.tsx`
- Modify: `src/features/auth/pages/login-page.tsx`
- Modify: `src/features/auth/pages/login-page.test.tsx`
- Modify: `src/app/router/create-app-router.tsx`
- Modify: `src/app/router/create-app-router.test.tsx`
- Modify: `src/app/shell/app-shell.tsx`
- Modify: `src/app/shell/app-shell.test.tsx`
- Modify: `docs/superpowers/plans/2026-07-17-classroom-leaderboard-v2.md`

**Consumes:** Task 5 hooks; existing auth context, `RequireAuth`, router, App shell, form/error/loading conventions.

**Produces:** routes `/join/:joinCode` and `/app/leaderboard` (student classroom list, manual join, and per-classroom leaderboard links); safe internal `returnTo` login state; reusable `JoinClassroomForm` with `{ initialJoinCode?: string; onJoined(classroomId: string): void }`.

**AC:** `AC-AUTH-007`; scoped support for `AC-UI-006`, `AC-UI-009`, `AC-UI-015`.

- [ ] **Step 1: Write failing RTL/router tests**

Cover unauthenticated deep-link redirect and post-login return, rejection of external/protocol-relative `returnTo`, visible confirmation rather than automatic mutation, join code field and primary submit in one `data-interaction-group`, single request while pending, understandable invalid/expired-code error, empty memberships, retryable query error, and success replace-navigation to the joined classroom leaderboard.

```tsx
expect(screen.getByRole('textbox', { name: '班級加入碼' })).toBeVisible();
expect(screen.getByRole('button', { name: '加入班級' })).toBeDisabled();
expect(joinClassroom).toHaveBeenCalledTimes(1);
```

- [ ] **Step 2: Run tests to prove RED**

```bash
pnpm exec vitest run \
  src/features/classrooms/components/join-classroom-form.test.tsx \
  src/features/classrooms/pages/student-classrooms-page.test.tsx \
  src/features/classrooms/pages/join-classroom-route.test.tsx \
  src/features/auth/components/require-auth.test.tsx \
  src/features/auth/pages/login-page.test.tsx \
  src/app/router/create-app-router.test.tsx \
  src/app/shell/app-shell.test.tsx
```

Expected: new component/page tests fail because files/routes do not exist; existing auth/router tests expose missing return-intent behavior.

- [ ] **Step 3: Implement the minimal student join experience**

Use React Hook Form/Zod for code shape and server errors for authority. `RequireAuth` records only a same-origin path beginning with one `/`; login consumes and clears it. The join-intent page requires explicit confirmation, passes one stable request UUID to the mutation, and navigates with `{ replace: true }` after success.

```ts
const safeReturnTo =
  typeof returnTo === 'string' &&
  returnTo.startsWith('/') &&
  !returnTo.startsWith('//')
    ? returnTo
    : '/app';
```

Show classroom cards with a leaderboard link. Keep the one-time URL code out of localStorage, sessionStorage, Query keys, logs, analytics, and error text.

- [ ] **Step 4: Run focused GREEN checks**

```bash
pnpm exec vitest run \
  src/features/classrooms/components/join-classroom-form.test.tsx \
  src/features/classrooms/pages/student-classrooms-page.test.tsx \
  src/features/classrooms/pages/join-classroom-route.test.tsx \
  src/features/auth/components/require-auth.test.tsx \
  src/features/auth/pages/login-page.test.tsx \
  src/app/router/create-app-router.test.tsx \
  src/app/shell/app-shell.test.tsx
pnpm lint
pnpm typecheck
```

Expected: focused RTL/router tests pass; lint/typecheck exit 0.

- [ ] **Step 5: Mark Task 7 complete and commit**

```bash
git add src/features/classrooms src/features/auth/components/require-auth.tsx \
  src/features/auth/components/require-auth.test.tsx \
  src/features/auth/pages/login-page.tsx src/features/auth/pages/login-page.test.tsx \
  src/app/router/create-app-router.tsx src/app/router/create-app-router.test.tsx \
  src/app/shell/app-shell.tsx src/app/shell/app-shell.test.tsx \
  docs/superpowers/plans/2026-07-17-classroom-leaderboard-v2.md
git commit -m "feat: add student classroom join routes"
test -z "$(git status --porcelain=v1 --untracked-files=all)"
```

---

### Task 8: Teacher-owned classroom management UI and routes

- [ ] **Task 8 delivery marker**

**Reviewer gate:** Accept only if teacher routes have `RequireRole` protection, create/rotate use server receipts, plaintext code is shown once and discarded, member projection contains no Email, and student/Teacher B cannot obtain data by direct route or repository call.

**Files:**

- Read: `src/features/auth/components/require-role.tsx`
- Create: `src/features/classrooms/components/classroom-code-receipt.tsx`
- Create: `src/features/classrooms/components/classroom-code-receipt.test.tsx`
- Create: `src/features/classrooms/pages/teacher-classrooms-page.tsx`
- Create: `src/features/classrooms/pages/teacher-classrooms-page.test.tsx`
- Create: `src/features/classrooms/pages/teacher-classroom-detail-page.tsx`
- Create: `src/features/classrooms/pages/teacher-classroom-detail-page.test.tsx`
- Modify: `src/app/router/create-app-router.tsx`
- Modify: `src/app/router/create-app-router.test.tsx`
- Modify: `src/app/shell/app-shell.tsx`
- Modify: `src/app/shell/app-shell.test.tsx`
- Modify: `docs/superpowers/plans/2026-07-17-classroom-leaderboard-v2.md`

**Consumes:** Task 5 teacher hooks; existing `RequireRole`; shared route loading/error boundaries and Tailwind tokens.

**Produces:** the top-level `/teacher` route tree (role-guarded, route-level lazy loaded) with `/teacher/classes` and `/teacher/classes/:classroomId`; local-only `ClassroomCodeReceipt` presentation; owned-class/member UI.

**AC:** `AC-AUTH-005`, `AC-AUTH-006`; scoped support for `AC-UI-006`, `AC-UI-015`.

- [ ] **Step 1: Write failing teacher UI/router tests**

Cover student unauthorized route, teacher empty/loading/error/retry, 1–80 character create form, one primary submit, create pending lock, receipt visibility, dismissal clears plaintext, reload has no code, rotate confirmation, and owner-safe member rows containing display name/Blook/status/join date but no Email or user UUID.

- [ ] **Step 2: Run tests to prove RED**

```bash
pnpm exec vitest run \
  src/features/classrooms/components/classroom-code-receipt.test.tsx \
  src/features/classrooms/pages/teacher-classrooms-page.test.tsx \
  src/features/classrooms/pages/teacher-classroom-detail-page.test.tsx \
  src/app/router/create-app-router.test.tsx \
  src/app/shell/app-shell.test.tsx
```

Expected: FAIL because teacher classroom pages/routes and code receipt do not exist.

- [ ] **Step 3: Implement the minimal teacher management UI**

Wrap both routes in the existing authenticated teacher guard. Keep `ClassroomCodeReceipt` in local component state only:

```ts
const [codeReceipt, setCodeReceipt] = useState<ClassroomCodeReceipt | null>(
  null,
);
```

Dismissal sets `null`; no cache write or persistence is allowed. Display explicit copy guidance and rotation consequences. Class creation and code rotation are distinct confirmation interactions. Query errors render retry; mutation errors remain adjacent to their initiating control.

- [ ] **Step 4: Run focused GREEN checks**

```bash
pnpm exec vitest run \
  src/features/classrooms/components/classroom-code-receipt.test.tsx \
  src/features/classrooms/pages/teacher-classrooms-page.test.tsx \
  src/features/classrooms/pages/teacher-classroom-detail-page.test.tsx \
  src/app/router/create-app-router.test.tsx \
  src/app/shell/app-shell.test.tsx
pnpm lint
pnpm typecheck
```

Expected: teacher UI/router tests pass; lint/typecheck exit 0.

- [ ] **Step 5: Mark Task 8 complete and commit**

```bash
git add src/features/classrooms src/app/router/create-app-router.tsx \
  src/app/router/create-app-router.test.tsx src/app/shell/app-shell.tsx \
  src/app/shell/app-shell.test.tsx \
  docs/superpowers/plans/2026-07-17-classroom-leaderboard-v2.md
git commit -m "feat: add teacher classroom management"
test -z "$(git status --porcelain=v1 --untracked-files=all)"
```

---

### Task 9: Student and owner-safe leaderboard page

- [ ] **Task 9 delivery marker**

**Reviewer gate:** Accept only if UI renders server order without recalculation, Top 10 and out-of-list self are distinguishable, no Email/raw identifier appears in DOM or serialized query data, nonmembers see a safe denial, and loading/empty/error/retry states are explicit.

**Files:**

- Read: `src/features/inventory/hooks/use-blook-inventory.ts`
- Read: `src/features/inventory/types.ts`
- Create: `src/features/leaderboard/components/leaderboard-table.tsx`
- Create: `src/features/leaderboard/components/leaderboard-table.test.tsx`
- Create: `src/features/leaderboard/pages/classroom-leaderboard-page.tsx`
- Create: `src/features/leaderboard/pages/classroom-leaderboard-page.test.tsx`
- Create: `src/features/leaderboard/pages/classroom-leaderboard-route.tsx`
- Modify: `src/app/router/create-app-router.tsx`
- Modify: `src/app/router/create-app-router.test.tsx`
- Modify: `docs/superpowers/plans/2026-07-17-classroom-leaderboard-v2.md`

**Consumes:** Task 6 hook/types; Task 7 classroom link; published catalog items returned by the existing `useBlookInventory` hook, used only to resolve `activeBlookId` to its existing safe presentation.

**Produces:** `/app/leaderboard/:classroomId`; semantic Top 10 list/table; separate self-rank card only when self is outside Top 10.

**AC:** `AC-AUTH-006`, `AC-GAME-008`, `AC-GAME-009`; scoped support for `AC-UI-006`, `AC-UI-007`, `AC-UI-015`.

- [ ] **Step 1: Write failing leaderboard component/page tests**

Use an intentionally non-alphabetic server order and assert DOM order is unchanged. Cover ranks 1–10, self rank 12, self already in Top 10 without duplicate card, owner response with null self, Blook fallback, zero XP, retry, unauthorized, and a recursive assertion that rendered/query fixture keys contain none of `email`, `student_number`, `user_id`, or answer fields.

- [ ] **Step 2: Run tests to prove RED**

```bash
pnpm exec vitest run \
  src/features/leaderboard/components/leaderboard-table.test.tsx \
  src/features/leaderboard/pages/classroom-leaderboard-page.test.tsx \
  src/app/router/create-app-router.test.tsx
```

Expected: FAIL because leaderboard UI and route do not exist.

- [ ] **Step 3: Implement the minimal leaderboard UI**

Render `topEntries` as received. Use rank text plus a visible self label rather than color alone. Show the separate self card only when `selfEntry.rank > 10`. Resolve `activeBlookId` against the existing published Blook catalog and render its established name/visual; use the existing default Blook presentation when null or unavailable. Do not display internal IDs, another user's ownership state, or add client-side score/sort code.

```tsx
{
  leaderboard.selfEntry && leaderboard.selfEntry.rank > 10 ? (
    <SelfRankCard entry={leaderboard.selfEntry} />
  ) : null;
}
```

Keep the classroom name/location visible. Error responses do not reveal whether an inaccessible classroom exists.

- [ ] **Step 4: Run focused GREEN checks**

```bash
pnpm exec vitest run \
  src/features/leaderboard/components/leaderboard-table.test.tsx \
  src/features/leaderboard/pages/classroom-leaderboard-page.test.tsx \
  src/app/router/create-app-router.test.tsx
pnpm lint
pnpm typecheck
```

Expected: leaderboard RTL/router tests pass; lint/typecheck exit 0.

- [ ] **Step 5: Mark Task 9 complete and commit**

```bash
git add src/features/leaderboard src/app/router/create-app-router.tsx \
  src/app/router/create-app-router.test.tsx \
  docs/superpowers/plans/2026-07-17-classroom-leaderboard-v2.md
git commit -m "feat: add classroom leaderboard experience"
test -z "$(git status --porcelain=v1 --untracked-files=all)"
```

---

### Task 10: Phase 3 runner, finalizer, and real-browser acceptance flow

- [ ] **Task 10 delivery marker**

**Reviewer gate:** Accept only if the phase contract fails closed, reuses `evidence-policy.mjs`, preserves existing Game Economy/Achievements contract assertions, drives teacher/two-student/outsider UI with real local Supabase, uses the established per-question wait, and produces a deterministic PASS manifest for exactly the five exit ACs.

**Files:**

- Read: `scripts/acceptance/evidence-policy.mjs`
- Read: `scripts/acceptance/run-achievements.sh`
- Read: `scripts/acceptance/finalize-achievements.mjs`
- Read: `tests/e2e/game-economy.spec.ts`
- Read: `tests/e2e/achievements.spec.ts`
- Create: `tests/e2e/classroom-leaderboard.spec.ts`
- Create: `tests/contracts/classroom-leaderboard-phase-gate.test.ts`
- Create: `scripts/acceptance/run-classroom-leaderboard.sh`
- Create: `scripts/acceptance/finalize-classroom-leaderboard.mjs`
- Create: `scripts/acceptance/finalize-classroom-leaderboard.d.mts`
- Modify: `package.json`
- Modify: `docs/superpowers/plans/2026-07-17-classroom-leaderboard-v2.md`

**Consumes:** Tasks 1–9; `scripts/acceptance/evidence-policy.mjs`; Phase 2 runner/finalizer conventions; existing browser-health helper, generated correct-answer fixture, and test users.

**Produces:** `pnpm phase:classroom-leaderboard`; acceptance-only E2E titled `Classroom and Leaderboard v2 phase gate`; sanitized manifest under `artifacts/acceptance/classroom-leaderboard-<SHA>/manifest.json`.

**AC:** `AC-AUTH-005`, `AC-AUTH-006`, `AC-AUTH-007`, `AC-GAME-008`, `AC-GAME-009`.

- [ ] **Step 1: Write failing phase/finalizer contracts**

Require package script equality, generic `test:e2e` exclusion of the acceptance-only title, exact ordered runner commands, clean/local SHA metadata, exactly the five AC IDs, reports, browser-health JSON, three viewports for join/leaderboard/teacher management, one WebM, and one trace ZIP. Reuse `assertEvidenceSafe`/`requireNonEmptyEvidence` by import. Preserve and rerun all existing content-type, traversal, wrong-extension, dirty-tree, wrong-environment, missing-file, nonzero-command, and sensitive text/trace assertions.

```ts
expect(manifest.acceptance_ids).toEqual([
  'AC-AUTH-005',
  'AC-AUTH-006',
  'AC-AUTH-007',
  'AC-GAME-008',
  'AC-GAME-009',
]);
```

- [ ] **Step 2: Run contracts to prove RED**

```bash
pnpm exec vitest run \
  tests/contracts/evidence-policy.test.ts \
  tests/contracts/game-economy-phase-gate.test.ts \
  tests/contracts/achievements-phase-gate.test.ts \
  tests/contracts/classroom-leaderboard-phase-gate.test.ts
```

Expected: existing three contract files pass; new Phase 3 contract FAILS because runner/finalizer/package entry do not exist.

- [ ] **Step 3: Implement runner and finalizer by extraction reuse**

Add:

```json
"phase:classroom-leaderboard": "bash scripts/acceptance/run-classroom-leaderboard.sh"
```

The runner verifies a clean SHA, creates `artifacts/acceptance/classroom-leaderboard-<SHA>`, records command durations/exit codes, and runs once in this order: format, lint, typecheck, unit, build, database tests, integration tests, local reset, Auth seed, then headed Chromium filtered to the Phase 3 title. It exports acceptance/evidence variables only for the browser command and always unsets service role first. Finalizer imports the shared evidence policy, validates evidence by content type, scans textual trace entries, and writes a manifest only after every command and browser-health field pass.

Extend the generic `test:e2e` grep-invert expression with `Classroom and Leaderboard v2 phase gate` so ordinary E2E never enters an acceptance-only fail-fast test.

- [ ] **Step 4: Write the acceptance-only E2E flow**

Fail fast unless `PLAYWRIGHT_ACCEPTANCE=on` and `PLAYWRIGHT_EVIDENCE_ROOT` exists. Use separate browser contexts for Teacher A, Student A, Student B, and outsider. Drive:

1. Student direct teacher route denial.
2. Teacher creates a uniquely named classroom, records the one-time code, rotates it, and sees the old code invalidated.
3. Student A rejects old code then joins with new code; repeated UI submission remains locked and the resulting member list contains one row.
4. Student B joins; outsider cannot read the class or leaderboard.
5. Both members complete real ten-question quizzes after membership. Each loop must use:

```ts
for (let position = 1; position <= 10; position += 1) {
  await expect(page.getByLabel('挑戰進度')).toContainText(
    `第 ${String(position)} / 10 題`,
  );
  const prompt = await page.locator('.question-card legend').innerText();
  const answer = GENERATED_CORRECT_ANSWERS.get(prompt);
  if (!answer) throw new Error('CLASSROOM_LEADERBOARD_ANSWER_MISSING');
  await page.getByRole('radio', { name: answer }).check();
  await page.getByRole('button', { name: '送出答案' }).click();
  await expect(page.getByRole('heading', { name: '✓ 答對了' })).toBeVisible();
  await page
    .getByRole('button', {
      name: position === 10 ? '結算並查看結果' : '我理解了，下一題',
    })
    .click();
}
```

6. Leaderboard order/XP matches the returned authoritative projection, contains current rank, updates within five seconds, and contains no fixture Email/student number/raw member UUID.
7. Teacher member view is owner-only; Teacher B seeded context cannot open it.
8. Capture join, leaderboard, and teacher-management states at 375×812, 768×1024, and 1440×900 using role-based locators. Assert console errors, page errors, unexpected failed requests, and unexpected server errors are all zero.

Before the test ends, use a separate Node-side authenticated Teacher A Supabase client to rotate once more without logging or rendering the returned code, then sign out locally. This invalidates every code visible in the trace/video while keeping service role out of the browser and test process.

Do not call a service/admin endpoint from browser code and do not duplicate existing E2E helper architecture.

- [ ] **Step 5: Run task-level contract GREEN checks only**

```bash
pnpm exec vitest run \
  tests/contracts/evidence-policy.test.ts \
  tests/contracts/game-economy-phase-gate.test.ts \
  tests/contracts/achievements-phase-gate.test.ts \
  tests/contracts/classroom-leaderboard-phase-gate.test.ts
pnpm exec prettier --check \
  tests/e2e/classroom-leaderboard.spec.ts \
  tests/contracts/classroom-leaderboard-phase-gate.test.ts \
  scripts/acceptance/run-classroom-leaderboard.sh \
  scripts/acceptance/finalize-classroom-leaderboard.mjs \
  scripts/acceptance/finalize-classroom-leaderboard.d.mts \
  package.json
pnpm lint
pnpm typecheck
```

Expected: all shared and phase contracts pass without weakening an existing assertion; Prettier/lint/typecheck exit 0. Do not run Playwright here.

- [ ] **Step 6: Mark Task 10 complete and commit**

```bash
git add tests/e2e/classroom-leaderboard.spec.ts \
  tests/contracts/classroom-leaderboard-phase-gate.test.ts \
  scripts/acceptance/run-classroom-leaderboard.sh \
  scripts/acceptance/finalize-classroom-leaderboard.mjs \
  scripts/acceptance/finalize-classroom-leaderboard.d.mts package.json \
  docs/superpowers/plans/2026-07-17-classroom-leaderboard-v2.md
git commit -m "test: add Classroom and Leaderboard phase gate"
test -z "$(git status --porcelain=v1 --untracked-files=all)"
```

---

## Complete-range review, disposable precheck, and single Phase 3 gate

These steps execute only after the plan commit and all ten task commits exist and the worktree is clean.

- [ ] **Review Step 1: Verify range and request one complete-range review**

```bash
test "$(git rev-parse 65d8b70)" = \
  "65d8b705eba9c18aecdf033ef37048b340f639d6"
test -z "$(git status --porcelain=v1 --untracked-files=all)"
git diff --stat 65d8b70..HEAD
git log --oneline --reverse 65d8b70..HEAD
```

Use `superpowers:requesting-code-review` once for `65d8b70..HEAD`. Exclude `src/types/database.ts`, lockfile, artifacts, dist, coverage, visual images, and other generated noise. Review priorities are hash/plaintext handling, role/ownership checks, active membership and replay behavior, cross-tenant RLS, exact ledger window/rank, safe JSON keys, join-intent leakage, local-only sign-out, and fail-closed evidence reuse.

- [ ] **Review Step 2: Resolve review findings**

Fix every Critical or Important finding with focused RED → GREEN when behavior changes. Commit coherent review fixes without rewriting task commits. Rerun only affected lint/typecheck/tests. Do not execute E2E or the phase gate during review fixes.

- [ ] **Gate Step 1: Run one disposable acceptance-mode headless precheck**

Reset/seed, then run the new E2E once without `--headed`. Evidence must be outside `artifacts/acceptance`, must not use the formal run naming pattern, and must be deleted by a trap whether the command passes or fails.

```bash
pnpm exec supabase db reset --local
source scripts/supabase/load-local-environment.sh
load_local_supabase_environment < <(pnpm exec supabase status -o env 2>/dev/null)
export SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY
pnpm exec tsx scripts/supabase/seed-auth.ts
unset SUPABASE_SERVICE_ROLE_KEY

precheck_tmp="$(mktemp -d)"
precheck_root="$precheck_tmp/classroom-leaderboard-precheck"
cleanup_precheck() { rm -rf "$precheck_tmp"; }
trap cleanup_precheck EXIT
PLAYWRIGHT_ACCEPTANCE=on \
PLAYWRIGHT_VIDEO=on \
PLAYWRIGHT_TRACE=on \
PLAYWRIGHT_EVIDENCE_ROOT="$precheck_root" \
bash scripts/test-e2e-local.sh --project=chromium \
  --grep='Classroom and Leaderboard v2 phase gate'
cleanup_precheck
trap - EXIT
test -z "$(git status --porcelain=v1 --untracked-files=all)"
```

Expected: one Chromium test passes headlessly; no finalizer runs; temporary evidence is deleted; worktree remains clean. If it fails, diagnose and obtain owner authorization before another precheck or formal gate.

- [ ] **Gate Step 2: Record the clean gate SHA and execute the formal gate once**

```bash
test -z "$(git status --porcelain=v1 --untracked-files=all)"
GATE_SHA="$(git rev-parse HEAD)"
printf '%s\n' "$GATE_SHA"
pnpm phase:classroom-leaderboard
```

Expected: format, lint, typecheck, unit, build, all database/RLS tests, integration, Auth seed, and headed Chromium flow pass. Finalizer prints one manifest path under `artifacts/acceptance/classroom-leaderboard-<GATE_SHA>/manifest.json` with `decision: PASS` and exactly the five exit AC IDs. If it fails, stop and report the failing stage/root cause; do not rerun without owner instruction.

- [ ] **Gate Step 3: Close Phase 3 only after PASS**

Update `.superpowers/sdd/progress.md` with plan/task/review-fix SHAs, reviewed and gate SHAs, manifest path, command totals, five exit ACs, known warnings, and these reservations:

- assignments and Live reference `classrooms.id` and call the active-membership predicate in their own phases;
- leaderboard privacy modes require an additive trusted setting/projection and are not inferred from the browser;
- analytics receives a separately authorized aggregate interface and never broadens the leaderboard response;
- if a later trusted leave lifecycle creates inactive earning intervals, leaderboard membership-window derivation must be versioned and expanded before such intervals are enabled;
- `AC-PERF-003` staging 30-sample p95, full `AC-UI-001/002`, real-device, and production evidence remain unverified until Phase 8.

Then run:

```bash
pnpm exec prettier --check \
  .superpowers/sdd/progress.md \
  docs/superpowers/plans/2026-07-17-classroom-leaderboard-v2.md
git diff --check
git add -f .superpowers/sdd/progress.md \
  docs/superpowers/plans/2026-07-17-classroom-leaderboard-v2.md
git commit -m "docs: close Classroom and Leaderboard v2 phase"
test -z "$(git status --porcelain=v1 --untracked-files=all)"
```

Stop after closure. Do not plan or implement Assignments, Live, remediation, mastery, teacher analytics, privacy controls, or another phase.

## Plan self-review checklist

- All Phase 3 scope maps to one of Tasks 1–10 and at least one exit AC.
- Positive owner/member and negative Teacher B/outsider/anonymous paths exist at database, repository, route, and phase-gate levels where applicable.
- Join plaintext appears only in create/rotate RPC receipts and ephemeral UI; the hash is excluded by grants, projections, fixtures, logs, and evidence.
- Membership supports multi-class students, one row per class/user, active replay, and safe inactive reactivation without fabricating a leave UI.
- Ranking uses authoritative XP ledger rows after immutable `joined_at`, exact tie-breaking, Top 10 plus self, and no browser calculation.
- SQL and TypeScript leaderboard contracts use the same field names and nullability; strict parsers reject extra keys.
- Assignment, Live, privacy, and analytics boundaries are reserved without creating their product behavior.
- Every migration begins with failing scoped pgTAP; every TypeScript/React behavior begins with failing Vitest/RTL.
- Integration sign-out is local-only; E2E answer loops wait for each displayed question number and use role-based locators.
- Shared evidence-policy and prior phase contract tests remain unchanged and green; headless precheck evidence is disposable and the formal gate runs once.
- No deferred full-release criterion is claimed as a Phase 3 PASS.
