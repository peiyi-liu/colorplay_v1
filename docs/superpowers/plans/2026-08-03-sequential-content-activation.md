# Sequential Content Activation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validate complete Google Sheets content for all six chapters, prove the Chapter 1→6 flow with a dedicated fixture student, and activate sequential mode only through an explicit atomic operator action.

**Architecture:** An offline manifest verifier catches incomplete generated content before database reset; a restricted database activation function repeats the authoritative checks transactionally. A dry-run-first maintenance script targets one exact fixture email, creates a database checkpoint, resets only that account’s mutable state, and a dedicated Playwright phase gate completes every chapter through the real UI before any owner-authorized activation.

**Tech Stack:** TypeScript/tsx, Node.js, PostgreSQL 15, Supabase CLI/pgTAP, Bash, Playwright, Vitest.

## Global Constraints

- This plan depends on the completed Assignment-retirement and JRPG-map/access plans.
- The owner-provided Google Sheets content is an external prerequisite for the final import and activation tasks. Current manifests are not ready: Chapters 1, 2, 5, and 6 have zero questions; Chapter 4 has 8 questions against a 10-question template; only Chapter 3 has review cards.
- Required chapter identities and order are exactly `chapter-1` through `chapter-6`, sort order `1` through `6`.
- Published chapter titles must be `認識色彩`, `色彩呈現`, `色彩表示`, `色彩感知`, `色彩認知`, and `色彩應用` at activation time; descriptions must be non-empty. A later small edit remains data-driven and does not alter building identity.
- Every chapter requires one published template, published questions at least equal to its configured `question_count`, at least one published review card, and a fully published course→chapter→section→subtopic parent chain.
- Content import must never change progression mode. Only the restricted activation function may change `open` to `sequential`.
- The fixture reset target is exactly `sequence.student@colorplay.test`; never select users by wildcard, suffix, role, or broad `@colorplay.test` match.
- Reset only the dedicated fixture student’s mutable Quiz, review, remediation/mistake, mastery, unlock, achievement, XP/Token, wallet, and Blook inventory state. Preserve auth user, profile identity, shared catalog/art, and all non-target users.
- Any reset against a non-ephemeral database requires an execution-time owner authorization after showing the resolved UUID, per-table counts, and checkpoint path. Design approval is not execution authorization.
- Teacher-hosted Live remains usable regardless of self-study unlock state and never grants a self-study unlock.
- The full sequence E2E must use the real review controls and correct-answer Quiz flow. Do not add a production test RPC, use force click, DOM dispatch, hidden navigation, or mutate `student.one`.
- Work in the isolated implementation worktree. Stage exact files only; never use `git add -A`. Do not push, deploy, reset a remote database, or activate production while merely implementing Tasks 1–4.
- Every commit uses `git commit -F` with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

## File Map and Stable Interfaces

### Readiness and activation

- Create `scripts/content/verify-sequential-readiness.ts` and its unit test.
- Modify `package.json` only to add `content:verify-sequential` and `phase:chapter-sequence` scripts.
- Create `supabase/migrations/20260803000400_activate_sequential_progression.sql`.
- Create `supabase/tests/047_sequential_activation.test.sql`.
- Modify `src/types/database.ts` through the standard Supabase type generator.

### Dedicated fixture reset

- Modify `tests/fixtures/users.ts`.
- Modify `tests/integration/auth-fixtures.test.ts` to include the new fixture in real sign-in/role coverage.
- Create `scripts/maintenance/reset-sequence-fixture.sh`.
- Create `scripts/maintenance/reset-sequence-fixture.sql`.
- Create `tests/contracts/reset-sequence-fixture.test.ts`.

### Phase gate

- Create `tests/e2e/chapter-sequence.spec.ts`.
- Create `scripts/acceptance/prepare-chapter-sequence-fixture.sql`.
- Create `scripts/acceptance/run-chapter-sequence.sh`.
- Create `scripts/acceptance/finalize-chapter-sequence.mjs`.
- Create `tests/contracts/chapter-sequence-phase-gate.test.ts`.

Stable operator interfaces:

```bash
pnpm content:verify-sequential

RESET_DATABASE_URL='postgresql://…' \
  bash scripts/maintenance/reset-sequence-fixture.sh --dry-run

RESET_DATABASE_URL='postgresql://…' \
  bash scripts/maintenance/reset-sequence-fixture.sh \
  --execute RESET_SEQUENCE_FIXTURE_2026_08

pnpm phase:chapter-sequence
```

Restricted SQL interfaces:

```sql
public.activate_course_sequential(p_course_id uuid) returns jsonb
public.reopen_course_progression(p_course_id uuid) returns jsonb
```

Neither function is executable by `anon` or `authenticated`. Operator calls use the database-owner connection after an approved checkpoint.

---

### Task 1: Add deterministic offline content readiness verification

**Files:**

- Create: `scripts/content/verify-sequential-readiness.ts`
- Create: `scripts/content/verify-sequential-readiness.test.ts`
- Modify: `package.json`

**Interfaces:**

- Consumes: `CONTENT_MANIFEST` and `REVIEW_MANIFEST` generated by the existing Google Sheets importers.
- Produces: exit zero plus a six-row readiness table, or exit one with stable issue codes.

- [ ] **Step 1: Write failing table-driven verifier tests**

Export a pure function:

```ts
export type ReadinessIssue = Readonly<{
  chapterCode: string;
  code:
    | 'CHAPTER_SET_INVALID'
    | 'QUESTION_COUNT_INSUFFICIENT'
    | 'REVIEW_CARDS_MISSING';
  message: string;
}>;

export function verifySequentialManifests(
  input: Readonly<{
    chapters: readonly {
      chapterCode: string;
      chapterNumber: number;
      questionCount: number;
    }[];
    reviewSubtopics: readonly {
      chapterCode: string;
      cardCount: number;
    }[];
    requiredQuestionCount: number;
  }>,
): readonly ReadinessIssue[];
```

Test exact success data with six ordered codes, `questionCount >= 10`, and at least one review card per code. Test missing/duplicate/out-of-order chapter, 9 questions against required 10, and zero aggregate review cards. Require issues sorted by chapter number and code so CI output is deterministic.

- [ ] **Step 2: Run the unit test to verify RED**

Run:

```bash
pnpm vitest run scripts/content/verify-sequential-readiness.test.ts
```

Expected: failure because the verifier does not exist.

- [ ] **Step 3: Implement the pure verifier and CLI**

The CLI imports the generated TypeScript fixtures through `tsx`, calls the pure function with `requiredQuestionCount: 10`, prints one row per chapter containing question and review-card counts, then prints each issue as:

```text
SEQUENTIAL_NOT_READY <chapter-code> <issue-code> <message>
```

Exit `1` when any issue exists and print `SEQUENTIAL_CONTENT_READY` only on success. This is a fast preflight; the database activation function remains authoritative for template configuration and publication-chain checks.

Add only these scripts to `package.json`:

```json
{
  "content:verify-sequential": "tsx scripts/content/verify-sequential-readiness.ts",
  "phase:chapter-sequence": "bash scripts/acceptance/run-chapter-sequence.sh"
}
```

- [ ] **Step 4: Verify GREEN and prove current content fails safely**

Run:

```bash
pnpm vitest run scripts/content/verify-sequential-readiness.test.ts
pnpm content:verify-sequential
```

Expected: unit tests pass; the CLI exits `1` and reports Chapters 1, 2, 4, 5, and 6 as not ready using the current generated manifests. This expected pre-activation failure is not a product-gate failure and must not be bypassed or weakened.

- [ ] **Step 5: Format-check and commit Task 1**

Run Prettier on the two TypeScript files and `package.json`, then `git diff --check`. Stage those three files only. Commit subject: `chore(content): add sequential readiness verifier`.

---

### Task 2: Add an atomic restricted activation operation

**Files:**

- Create: `supabase/migrations/20260803000400_activate_sequential_progression.sql`
- Create: `supabase/tests/047_sequential_activation.test.sql`
- Modify: `src/types/database.ts` through `pnpm exec supabase gen types typescript --local`.

**Interfaces:**

- Consumes: `course_progression_settings` and `chapter_content_is_available` from the access plan.
- Produces: database-owner-only activation and rollback functions with stable JSON result payloads.

- [ ] **Step 1: Write RED atomicity and permission tests**

In pgTAP, use a published six-chapter course. Test these cases:

```text
five chapters -> SEQUENTIAL_CONTENT_NOT_READY, mode stays open
duplicate/missing sort order -> same error, mode stays open
blank title or description -> same error, mode stays open
missing template -> same error, mode stays open
published questions below template.question_count -> same error, mode stays open
no published review card -> same error, mode stays open
draft section/subtopic parent -> same error, mode stays open
all conditions satisfied -> mode sequential, rules version returned
second activation -> idempotent sequential result
activation backfills next-chapter unlocks for existing canonically completed prerequisites
reopen -> mode open, unlock rows preserved
authenticated/anon cannot execute either operator function
```

Require SQLSTATE `P0001`, message `SEQUENTIAL_CONTENT_NOT_READY`, and a JSON detail array with per-chapter stable issue codes.

- [ ] **Step 2: Run the test to verify RED**

Run:

```bash
pnpm exec supabase db reset --local
pnpm exec supabase test db --local supabase/tests/047_sequential_activation.test.sql
```

Expected: missing-function failures.

- [ ] **Step 3: Implement the authoritative activation function**

Create `activate_course_sequential(p_course_id uuid)` as `security definer`, volatile PL/pgSQL with `set search_path = pg_catalog, public`. Lock the settings row `for update`; aggregate structured issues for:

```text
exactly six published chapters
stable codes chapter-1..chapter-6 exactly once
sort orders 1..6 exactly once
non-empty btrim(title) and btrim(description)
one published template per chapter
published question count >= template.question_count
>= 1 published review card
published course, section, and subtopic parents
```

If issues are non-empty, raise without updating. Otherwise update only:

```sql
mode = 'sequential',
rules_version = '2026-08-sequence-1',
updated_at = clock_timestamp()
```

Return:

```json
{
  "course_id": "<uuid>",
  "mode": "sequential",
  "rules_version": "2026-08-sequence-1",
  "chapter_count": 6,
  "backfilled_unlock_count": 0
}
```

Before updating the mode, scan existing student/chapter progress with `student_chapter_completion(user_id, chapter_id)` for Chapters 1–5 and idempotently insert the corresponding next-chapter unlock for every canonical completion. This protects progress earned before the access migration or mode switch. Return the number of rows newly inserted as `backfilled_unlock_count`; do not reset, delete, or otherwise alter any student progress.

`reopen_course_progression` changes only the mode back to `open`; it never deletes unlock rows.

Revoke all function privileges from `public, anon, authenticated`. Do not grant execute to browser roles and do not call either function from any client module.

- [ ] **Step 4: Verify GREEN, regenerate types, and commit**

Run the new pgTAP test, the access test `046`, the complete database suite, the generated-types contract, and Prettier. Generate `src/types/database.ts`, review its exact diff, then stage the migration, test, and generated type file. Commit subject: `feat(learning): add atomic sequence activation gate`.

---

### Task 3: Add a dedicated fixture student and dry-run-first reset tooling

**Files:**

- Modify: `tests/fixtures/users.ts`
- Modify: `tests/integration/auth-fixtures.test.ts`
- Create: `scripts/maintenance/reset-sequence-fixture.sh`
- Create: `scripts/maintenance/reset-sequence-fixture.sql`
- Create: `tests/contracts/reset-sequence-fixture.test.ts`

**Interfaces:**

- Consumes: database-owner URL from `RESET_DATABASE_URL`; exact fixture email from an immutable shell constant.
- Produces: JSON preflight counts and an owner-authorized, transactionally reset fixture account.

- [ ] **Step 1: Add the exact fixture and failing safety contract**

Add:

```ts
sequenceStudent: {
  email: 'sequence.student@colorplay.test',
  password: 'LocalOnly-SequenceStudent1!',
},
```

and role `student`. The existing `seed-auth.ts` already iterates `TEST_USERS`; do not add a separate auth creation path.

Add `sequenceStudent` to the integration test's `fixtureLabels` array so real GoTrue sign-in and the profile role are checked alongside the existing fixtures.

The contract reads both maintenance files and requires:

```text
exact email sequence.student@colorplay.test
default mode --dry-run
exact confirmation RESET_SEQUENCE_FIXTURE_2026_08
checkpoint created before execution
resolved target count exactly 1
transaction with rollback-on-error
preflight and postflight counts
no LIKE, ILIKE, wildcard, role-wide, or domain-wide selector
no delete from auth.users, profiles, blooks, courses, chapters, sections, subtopics, questions, review_cards
```

- [ ] **Step 2: Run the fixture/contract tests to verify RED**

Run:

```bash
pnpm vitest run tests/contracts/reset-sequence-fixture.test.ts tests/integration/auth-fixtures.test.ts
```

Expected: missing fixture/script failures.

- [ ] **Step 3: Implement the wrapper with a mandatory checkpoint**

`reset-sequence-fixture.sh` uses `set -euo pipefail`, never echoes `RESET_DATABASE_URL`, and accepts only:

```text
--dry-run
--execute RESET_SEQUENCE_FIXTURE_2026_08
```

Any other invocation exits `64`. Before either mode, resolve the exact email through `auth.users` and require count `1`. Print the UUID and per-table counts. For execute mode, create:

```bash
checkpoint_path="/tmp/colorplay-sequence-fixture-$(date -u +%Y%m%dT%H%M%SZ).dump"
pg_dump "$RESET_DATABASE_URL" --format=custom --file="$checkpoint_path"
test -s "$checkpoint_path"
```

Print the checkpoint path before calling the SQL file. Do not accept an environment variable as the target email or confirmation text.

- [ ] **Step 4: Implement exact transactional reset SQL**

Resolve the target UUID from equality on the literal email and abort unless exactly one row exists. Take a transaction-scoped advisory lock. Print before/after counts for:

```text
remediation_attempts through the target’s mistake/session rows
mistake_items
quiz_answers and quiz_session_questions through quiz_sessions
quiz_sessions
review_progress
mastery_hint_events and mastery_attempts through mastery_sessions
mastery_sessions
student_chapter_unlocks
achievement_unlocks
xp_transactions
wallet_transactions
user_blooks
wallets
```

Because economy ledgers have immutable update/delete triggers, use `set local session_replication_role = replica` only inside this database-owner transaction, reset the one target, then set it back to `origin` before commit. Delete all target XP/wallet ledger rows, set target wallet balance to `0`, delete target-owned non-default Blooks, ensure only the published `little_fox` default row exists with source `default`, and set only the target profile’s `active_blook_id` to that default.

Delete dependent learning rows in foreign-key-safe order. Never touch Live, classroom membership, auth, profile identity, or shared catalog/content rows. End with assertions that mutable target counts are zero/baseline and a query proving all other user row counts are unchanged from captured preflight aggregates.

- [ ] **Step 5: Verify on a clean local database only**

Run:

```bash
pnpm exec supabase db reset --local
source scripts/supabase/load-local-environment.sh
# Load RESET_DATABASE_URL from `pnpm exec supabase status -o env` without printing it.
pnpm exec tsx scripts/supabase/seed-auth.ts
RESET_DATABASE_URL="$RESET_DATABASE_URL" bash scripts/maintenance/reset-sequence-fixture.sh --dry-run
RESET_DATABASE_URL="$RESET_DATABASE_URL" bash scripts/maintenance/reset-sequence-fixture.sh --execute RESET_SEQUENCE_FIXTURE_2026_08
```

Expected: dry run writes nothing; execute creates a non-empty checkpoint; only the exact fixture returns to zero XP/Tokens, default Blook, and no learning/unlock history; login still works.

- [ ] **Step 6: Run safety tests and commit Task 3**

Run fixture integration, reset contract, typecheck, lint, and Prettier. Stage exact Task 3 files. Commit subject: `test(fixtures): add isolated chapter sequence student`.

---

### Task 4: Build the real Chapter 1→6 acceptance gate

**Files:**

- Create: `tests/e2e/chapter-sequence.spec.ts`
- Create: `scripts/acceptance/prepare-chapter-sequence-fixture.sql`
- Create: `scripts/acceptance/run-chapter-sequence.sh`
- Create: `scripts/acceptance/finalize-chapter-sequence.mjs`
- Create: `tests/contracts/chapter-sequence-phase-gate.test.ts`

**Interfaces:**

- Consumes: `TEST_USERS.sequenceStudent`, generated correct answers, real map/review/Quiz/Live UIs, the acceptance-only mastery fixture, and the local reset command.
- Produces: immutable evidence under `artifacts/acceptance/chapter-sequence-<git-sha>/`.

- [ ] **Step 1: Write the failing phase-gate contract**

Require the runner to reject a dirty worktree and an existing evidence directory, capture git SHA, reset only the local database, seed auth, run the offline readiness check, invoke the reset script in execute mode against local only, prepare the exact fixture mastery snapshot, activate the local course through database-owner SQL, run headed Chromium with trace/video, sanitize artifacts, verify source state unchanged, and finalize a manifest.

Require the E2E source to reference `TEST_USERS.sequenceStudent`, all three viewports, generated correct answers, `進入複習與進度`, `開始挑戰`, `CHAPTER_LOCKED` behavior, reload/re-login persistence, and teacher-hosted Live bypass. Require the SQL fixture to use only the exact sequence fixture email, leave `review_progress` and `student_chapter_unlocks` empty, and insert no XP/Token ledger rows. Reject `force: true`, `dispatchEvent`, `page.evaluate` navigation, and `studentOne`.

- [ ] **Step 2: Run the contract to verify RED**

Run `pnpm vitest run tests/contracts/chapter-sequence-phase-gate.test.ts`.

Expected: missing runner/spec/finalizer failures.

- [ ] **Step 3: Build a deterministic acceptance-only 80% mastery snapshot**

The SQL file runs only after local reset and exact fixture reset. Resolve `sequence.student@colorplay.test` by equality and abort unless exactly one auth/profile row exists. For each published chapter, deterministically choose the first `ceil(published_question_count * 0.80)` current questions ordered by `stable_code`, split them into completed `practice` Quiz sessions of at most ten questions, and insert frozen session questions plus correct answers.

Use complete current table columns: each session has a deterministic `client_request_id`, current template ID/title, `status = 'completed'`, `answered_count = correct_count = question_count`, zero XP/Tokens, and non-null completion time. Each session-question freezes prompt, explanation, version, options without `is_correct`, and the correct option ID. Each answer uses that same correct option for selected/correct IDs, `answer_status = 'correct'`, deterministic idempotency key, and zero provisional rewards.

The fixture must end with:

```sql
select bool_and(snapshot.mastery >= 80)
from public.learning_progress_for(:'sequence_user_id'::uuid, null) snapshot
where snapshot.scope = 'chapter';

select count(*) = 0
from public.review_progress
where user_id = :'sequence_user_id'::uuid;

select count(*) = 0
from public.student_chapter_unlocks
where user_id = :'sequence_user_id'::uuid;
```

This file is test setup, not a migration or callable RPC. It creates no function, grant, client API, economy ledger row, or production backdoor. Database pgTAP remains responsible for proving Quiz-terminal grant behavior; the UI phase uses the review terminal event to grant each next chapter deterministically.

- [ ] **Step 4: Implement the sequence E2E through real UI controls**

For each chapter 1 through 6:

1. On the map, assert the current building is available and the next building is locked before completion.
2. Select the locked next building and verify exact review/mastery blockers and no entry link.
3. Directly navigate to its detail route and verify redirect to `/app?chapter=<id>&reason=locked` with the same panel blockers.
4. Re-select the current building and click `進入複習與進度`.
5. Assert the prepared formal mastery is at least `80%` while review remains incomplete, so the next building is still locked.
6. Click the existing title-row `開始挑戰` link and complete one current real challenge.
7. For each Quiz question, read its prompt, look up the correct visible option from `GENERATED_CORRECT_ANSWERS`, select it, submit, and continue through the result page.
8. Return to the chapter detail, expand and complete every published review card with its real completion button; the last completion is the terminal event that grants the next chapter.
9. Return to the map and assert the current building is completed and the next building is available.

After each unlock, reload. After Chapters 2 and 5, sign out/in and verify the stored unlock persists. After Chapter 6, assert all six completed and Chapter 6 is selected by default.

Use normal pointer clicks and keyboard Tab/Enter coverage. Never force a click or jump directly to a Quiz session.

- [ ] **Step 5: Add the Live bypass case without changing self-study state**

Before Chapter 2 unlock, use `learningTeacher` to create a normal one-click Live session for Chapter 2 and let `sequenceStudent` join through the existing Live UI. Assert entry and one answer work while Chapter 2 self-study stays locked before and after Live. Do not require Assignment, team, or schedule fields.

- [ ] **Step 6: Add viewport/accessibility/rendered measurements**

At `1280×720`, `812×375`, and `375×812`, collect:

```text
scrollWidth <= viewport
each building/action bounding box >=44×44 and right edge inside viewport
panel/action pointer-clickable and scrollable into view
focus ring visible and not under HUD
desktop/mobile information fields identical
locked cloud partly covers building but not semantic sign
reduced-motion cloud/adventurer computed animation = none
console errors = 0; page errors = 0
```

Capture available, locked, unavailable, completed, and all-complete map screenshots.

- [ ] **Step 7: Implement runner and evidence finalizer**

Follow the established `run-learning-experience.sh` evidence layout. The runner order is exact:

```text
clean worktree -> readiness verifier -> format/lint/typecheck/unit/build/db tests
-> local db reset -> load local env -> seed auth -> local fixture reset
-> deterministic local mastery fixture -> local atomic sequential activation
-> headed Playwright
-> artifact sanitization -> source-state check -> manifest finalization
```

The finalizer requires every command exit code zero, expected screenshots/traces/videos, `supabase_environment: local`, `fixture_email: sequence.student@colorplay.test`, progression mode `sequential`, six completion checkpoints, Live-bypass evidence, and three viewport measurements.

- [ ] **Step 8: Verify the phase-gate contract and commit Task 4**

Run the contract, unit-test the finalizer using temporary fixture directories, then Prettier and lint. Stage exactly the five Task 4 files. Commit subject: `test(e2e): add six-chapter sequence phase gate`.

Do not run the full phase gate yet because the current content verifier must fail until the owner-provided Sheets content exists.

---

### Task 5: Import the owner-provided six-chapter content and pass locally

**Files:** Generated by the existing import pipeline after the external content is supplied:

- Modify: `scripts/content/import-fixes.json` only for owner-approved mappings/media corrections required by the supplied sheets
- Modify: `supabase/seeds/content-questions.sql`
- Modify: `supabase/seeds/content-question-hints.sql`
- Modify: `supabase/seeds/content-review-cards.sql`
- Modify: `tests/fixtures/question-answers.generated.ts`
- Modify: `tests/fixtures/question-hints.generated.ts`
- Modify: `tests/fixtures/content-manifest.generated.ts`
- Modify: `tests/fixtures/review-manifest.generated.ts`
- Modify: `docs/content/import-review.md`
- Modify: `docs/content/review-import-report.md`

**Interfaces:**

- Consumes: the owner-supplied Google Sheets rows for all six chapters and explicit review of any import warning.
- Produces: deterministic seed/manifests that pass both offline and authoritative database readiness gates.

- [ ] **Step 1: Confirm the external prerequisite without changing code**

The provided Sheets export must contain questions and review cards for all six chapter codes, plus owner-approved final chapter titles/descriptions. If it does not, stop here and report the exact missing chapter/field from `content:verify-sequential`; do not lower template counts, invent questions, duplicate cards, or activate around the failure.

- [ ] **Step 2: Run the existing deterministic imports**

Run:

```bash
pnpm content:import
pnpm content:verify-sequential
```

Expected: both importers exit zero, readiness prints six chapter rows and `SEQUENTIAL_CONTENT_READY`.

- [ ] **Step 3: Review every generated content delta**

Check exact chapter titles/descriptions, skipped rows, duplicate renames, AI draft explanations/hints, media alt text, per-chapter question counts, review-card counts, and deterministic UUIDs. Any unresolved `待教師確認`, missing required field, or skipped required chapter row returns to the owner for correction; it is not accepted as a warning.

- [ ] **Step 4: Run the clean local phase gate**

Commit the reviewed generated content first so the gate’s clean-worktree precondition holds. Commit subject: `content(learning): import six-chapter sequence curriculum`.

Then run:

```bash
pnpm phase:chapter-sequence
```

Expected: readiness, all engineering gates, local reset, local atomic activation, six real UI completions, Live bypass, all viewports, console checks, and evidence finalization pass.

- [ ] **Step 5: Review evidence and record the activation candidate**

Record the git SHA, evidence manifest path, local database test count, six per-chapter counts, screenshots, and final map mode in the SDD ledger. The candidate is eligible for deployment review but is not yet authorized for remote fixture reset or production activation.

---

### Task 6: Owner-authorized remote rollout and explicit sequential activation

**Files:** No source changes. SDD ledger/evidence updates use the repository’s established progress section and an isolated documentation commit only after verification.

**Interfaces:**

- Consumes: deployed candidate SHA, green local phase manifest, owner authorization for the exact remote target and fixture reset.
- Produces: production `sequential` mode with a recoverable checkpoint, or a safe return to `open` without deleting unlocks.

- [ ] **Step 1: Verify the deployed SHA and perform read-only preflight**

Confirm the deployed database contains the four sequence migrations and the application serves the candidate SHA. Run the readiness query and activation function’s validation path inside a rolled-back transaction; verify current mode is `open` and all six content rows pass. Do not use a student account or write product data.

- [ ] **Step 2: Show the destructive target and obtain execution-time authorization**

Run only:

```bash
RESET_DATABASE_URL="$REMOTE_DATABASE_URL" \
  bash scripts/maintenance/reset-sequence-fixture.sh --dry-run
```

Show the owner the environment identity, exact resolved email/UUID, per-table counts, intended checkpoint command/path, and confirmation token. Wait for a new explicit authorization for this exact output. Prior design approval does not satisfy this step.

- [ ] **Step 3: Create checkpoint and reset only the approved fixture**

After authorization, run the exact execute command. Preserve the resulting dump outside the repository and verify its checksum. Compare postflight counts with preflight and prove no non-target user aggregate changed.

- [ ] **Step 4: Activate sequential mode atomically**

Using the database-owner connection, run one transaction that calls:

```sql
select public.activate_course_sequential(
  '20000000-0000-0000-0000-000000000001'::uuid
);
```

Commit only when the returned payload reports `mode: sequential`, rules version `2026-08-sequence-1`, and `chapter_count: 6`. On any exception, roll back; mode must remain `open`.

- [ ] **Step 5: Run read-only production smoke and keep rollback ready**

Without logging in as a student or creating data, verify the public site returns HTTP 200 and login/title screens render. Use database-owner read queries to verify mode, chapter count, and that only the fixture was reset. If a production regression requires rollback, call `reopen_course_progression(course_id)`; do not delete unlock rows.

- [ ] **Step 6: Record final evidence in one documentation-only commit**

Record deployment ID/SHA, checkpoint path/checksum, exact reset target and counts, activation response, read-only smoke results, and rollback readiness. Stage only the ledger/evidence index files and commit subject `docs(sdd): close chapter sequence activation gate`. Do not mix generated content, product code, or unrelated WIP into this commit.

Final review checklist:

```text
[ ] all six exact titles/descriptions came from published content
[ ] offline and DB readiness both passed
[ ] activation was explicit and atomic; import never changed mode
[ ] only sequence.student@colorplay.test was reset
[ ] checkpoint exists and restore command was recorded
[ ] real Chapter 1→6 UI flow passed
[ ] Live bypassed gating and granted no unlock
[ ] permanent unlocks survived reload/re-login
[ ] three viewport/a11y/console gates passed
[ ] no non-fixture account or shared content/catalog row changed
```
