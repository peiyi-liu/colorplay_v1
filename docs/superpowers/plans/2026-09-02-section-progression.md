# Section Progression Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace cross-chapter access with server-authoritative, within-chapter section/card progression and one truthful next-learning action.

**Architecture:** PostgreSQL owns one deep learning-path module that derives access, completion, attempt, mastery, blockers, and next action. Student metadata and card content use separate guarded projections; existing completion and Quiz commands re-check the same module transactionally. React consumes the typed snapshot and never reconstructs unlock rules.

**Tech Stack:** React, TypeScript, Vite, TanStack Query, Zod, Supabase PostgreSQL/RLS/RPC/Storage, pgTAP, Vitest/RTL, Playwright, pnpm.

**Spec:** `docs/superpowers/specs/2026-09-02-section-progression-design.md`

## Global Constraints

- Rules version is exactly `2026-09-progression-1`.
- Chapters are independent; only a chapter's own content readiness can block entry.
- Product 「小節」 means `section`; `subtopic` is internal grouping only.
- Section/card order is server-derived from section, subtopic, card sort order plus stable tie-breaker.
- Locked card body, media path, signed URL, and question answer data must not reach the browser.
- Section challenge unlocks after all current-required cards; its finalized attempt unlocks the next section regardless of percentage.
- Every required section's current-version best qualifying percentage must be at least 80% before chapter challenge creation.
- Chapter challenge finalized means completed; current-version best qualifying percentage at least 80% means mastered.
- Qualifying percentage is `correct_count / question_count * 100`; compare with integer cross-multiplication before rounding. Speed-weighted Quiz Score and aggregate mastery are excluded.
- Keep XP, Token, achievement, remediation, Quiz scoring, and Live rules unchanged.
- Preserve historical rows; no destructive cleanup or direct progress writes.
- Normalize legacy gaps compatibly: later completed cards never bypass the earliest missing required card; an early finalized section challenge becomes effective only after all required cards are complete, without rewriting facts or replaying rewards.
- Require a server-validated progression-impact classification for every current-version publish: compatible changes retain progress, material review changes require recompletion, and material challenge changes require current-version requalification; ambiguity fails closed.
- Consume the Phase 2B `content_versions.progression_impact` and hardened `publish_question`／`publish_review_card` contract; Phase 3 must not invent a second classifier or client-side override.
- Grandfather only students with a server-valid same-section challenge finalize fact committed before an inserted required card's immutable publication cutoff, regardless of score; use `finalized_before_publish` and compare server-only `finalize.section_event_order < publication.publication_cutoff_order`. Allocate both orders under the same section lock; timestamps are audit-only and an equal/missing/unprovable order fails closed. Never substitute mastery/projection state or grant exemption from review-only, post-cutoff progress, or client/admin toggles.
- Work only in a new protected package worktree based on the approved program-integration SHA. Do not touch Phase 0/1 worktrees.
- Exact-path stage only. No `git add -A`, reset, stash, push, deploy, hosted mutation, or shared Local Supabase reset without the brief's explicit grant.

## Pre-execution Gates

All progression product and migration-semantics decisions are resolved. This plan still does not authorize execution. Before Task 1:

1. verify the exact canonical SHA, dedicated protected worktree and bounded brief;
2. stop if `20260902000100_section_progression.sql` or test IDs `061`–`063` already exist, and update this plan docs-only;
3. confirm Phase 0/1 protected WIP is untouched and the shared Local Supabase window is exclusive before destructive tests.

Phase 2B must already provide the progression-impact columns, diff validation, migrated historical classification, inserted-card immutable cutoff/policy metadata and `AC-PROG-014` evidence. If the approved base lacks that contract, stop and complete or amend the separate Phase 2B plan; do not duplicate publishing logic in this Phase 3 migration.

## File Map and Interfaces

### Database module

- Create `supabase/migrations/20260902000100_section_progression.sql`.
- Create `supabase/tests/061_section_progression.test.sql`.
- Create `supabase/tests/062_section_progression_rls.test.sql`.
- Modify `supabase/tests/047_chapter_sequence_access.test.sql` to assert retirement of cross-chapter gating without deleting historical coverage.
- Modify `src/types/database.ts` only through the standard local type generator.

Public interface:

```sql
get_student_learning_path(p_chapter_id uuid) returns jsonb
get_review_card_content(p_review_card_id uuid) returns jsonb
complete_review_card(p_review_card_id uuid, p_request_id uuid) returns jsonb
create_quiz_session(p_template_id uuid, p_client_request_id uuid) returns jsonb
```

Internal module interface:

```sql
learning_internal_path_state(p_user_id uuid, p_chapter_id uuid) returns jsonb
learning_internal_card_access(p_user_id uuid, p_review_card_id uuid) returns jsonb
learning_internal_assert_template_access(p_user_id uuid, p_template_id uuid) returns jsonb
```

### Frontend adapter and UI

- Create `src/features/learning/api/learning-path-contract.ts`.
- Create `src/features/learning/api/learning-path-repository.ts` and test.
- Modify `src/features/learning/api/learning-repository.ts` to remove full-chapter student content fetching and expose the content adapter.
- Modify `src/features/learning/hooks/use-learning.ts` and tests.
- Modify `src/features/learning/pages/chapter-detail-view-model.ts` and adapter tests.
- Modify `src/features/learning/pages/chapter-detail-page.tsx` and test.
- Modify `src/features/learning/pages/chapter-review-library.tsx` and test.
- Modify `src/features/learning/pages/chapter-review-node.tsx` and test.
- Modify `src/features/learning/pages/chapter-review-reader.tsx` and test.
- Modify chapter-map repository/view-model/tests to remove cross-chapter blockers.

External TypeScript interface:

```ts
export interface LearningPathRepository {
  getPath(chapterId: string): Promise<LearningPathSnapshot>;
  getCardContent(reviewCardId: string): Promise<ReviewCardContent>;
  completeCard(input: {
    reviewCardId: string;
    requestId: string;
  }): Promise<LearningPathSnapshot>;
}
```

### Acceptance

- Create `tests/contracts/section-progression-contract.test.ts`.
- Create `tests/e2e/section-progression.spec.ts`.
- Modify only stale assertions in `tests/e2e/chapter-sequence.spec.ts`; retain negative direct-access coverage.

---

### Task 1: Derive one authoritative learning-path snapshot

**Files:**

- Create: `supabase/migrations/20260902000100_section_progression.sql`
- Test: `supabase/tests/061_section_progression.test.sql`
- Modify: `src/types/database.ts`

**Interfaces:**

- Consumes: published course/chapter/section/subtopic/card/template/question rows, `review_progress`, finalized `quiz_sessions`.
- Produces: `learning_internal_path_state` and `get_student_learning_path` with the exact state/next-action unions from the spec.

- [ ] **Step 1: Write RED pgTAP state-table tests**

Seed two independent chapters and two sections with three cards each. Assert exact JSON for: no progress, each card completion boundary, challenge available, below-threshold attempted, next section, all sections mastered, chapter completed below 80, chapter mastered. Test 79/100 below threshold and 4/5 exactly at threshold without rounding, plus two chapters whose states never affect one another. Add a legacy fixture with card 1 and card 3 completed, card 2 missing, and a finalized challenge predating full review; assert card 2 remains the next action and the old challenge becomes effective only after card 2 completes. Add compatible typo, material review, material correct-answer and missing-classification version cases. For an inserted card, cover pre-cutoff low-score finalized, review-only, post-cutoff finalized and new-user cohorts; only the first is `grandfather_exempt`.

```sql
select is(
  public.learning_internal_path_state(:'student_id', :'chapter_b_id')
    #>> '{sections,0,cards,0,access_state}',
  'available',
  'chapter B starts independently of chapter A'
);
```

- [ ] **Step 2: Run the single pgTAP file and verify RED**

Run: `pnpm exec supabase test db --local supabase/tests/061_section_progression.test.sql`

Expected: missing-function failures only. If the Local stack is not exclusively available, stop without reset and report `NOT RUN`.

- [ ] **Step 3: Implement the internal state function**

Use a stable SQL/PLpgSQL function with explicit `p_user_id`; order nodes server-side, derive the per-user current-required set (excluding only server-derived `grandfather_exempt` cards), completion, finalized section attempts and best qualifying percentage from `correct_count` and `question_count`. Derive inserted-card eligibility directly from valid committed finalize facts and immutable `finalized_before_publish` publication metadata by comparing `finalize.section_event_order < publication.publication_cutoff_order`; never infer order from a client or timestamp alone. Compare the 80% threshold with integer cross-multiplication. Return metadata for locked cards but omit content/media keys entirely. Derive exactly one `next_action` using spec §5 precedence.

- [ ] **Step 4: Add the user-scoped read wrapper**

`get_student_learning_path` verifies `auth.uid()`, published/content-ready chapter, calls the internal function with the caller ID, fixes `search_path`, revokes public execute, and grants only `authenticated`.

- [ ] **Step 5: Generate types and run GREEN**

Run the repository's standard local Supabase type generation command, then:

```bash
pnpm exec supabase test db --local supabase/tests/061_section_progression.test.sql
pnpm typecheck
git diff --check
```

Expected: all pass and generated types contain only the two new function signatures.

- [ ] **Step 6: Commit exact files**

```bash
git add supabase/migrations/20260902000100_section_progression.sql supabase/tests/061_section_progression.test.sql src/types/database.ts
git commit -m "feat(learning): derive section progression state"
```

### Task 2: Separate safe metadata from guarded card content

**Files:**

- Modify: `supabase/migrations/20260902000100_section_progression.sql`
- Test: `supabase/tests/062_section_progression_rls.test.sql`
- Test: `tests/contracts/section-progression-contract.test.ts`

**Interfaces:**

- Consumes: `learning_internal_card_access` derived from Task 1.
- Produces: `get_review_card_content` and default-deny direct student table/Storage access.

- [ ] **Step 1: Write RED RLS and payload tests**

Cover anonymous, owner student, another student, teacher, Admin projection, completed/current/locked/`grandfather_exempt` cards, direct table select, guessed ID, and Storage object. Prove only the eligible owner can fetch the exempt card body/media and that a forged client state cannot create access. Assert absent JSON keys rather than null values:

```sql
select ok(
  not (public.get_student_learning_path(:'chapter_id')::text ~
    'content|asset_path|signed_url'),
  'path metadata does not serialize protected card content'
);
```

- [ ] **Step 2: Run RED checks**

```bash
pnpm exec supabase test db --local supabase/tests/062_section_progression_rls.test.sql
pnpm vitest run tests/contracts/section-progression-contract.test.ts
```

Expected: failure because direct published-card reads remain available and the guarded content function is missing.

- [ ] **Step 3: Implement guarded content and tighten grants**

Add `get_review_card_content`; re-check access per request, return one current card, and generate media delivery only after authorization. Replace broad student SELECT with role-aware policies/projections. Preserve authorized Teacher/Admin content paths explicitly.

- [ ] **Step 4: Prove no browser leakage**

Run both Task 2 tests. Search built and source fixtures for production content keys only through the contract test; do not globally ban legitimate server-side column names.

- [ ] **Step 5: Commit exact files**

```bash
git add supabase/migrations/20260902000100_section_progression.sql supabase/tests/062_section_progression_rls.test.sql tests/contracts/section-progression-contract.test.ts
git commit -m "feat(learning): guard review card delivery"
```

### Task 3: Enforce card order in the completion command

**Files:**

- Modify: `supabase/migrations/20260902000100_section_progression.sql`
- Modify: `supabase/tests/061_section_progression.test.sql`
- Modify: `supabase/tests/021_review_progress.test.sql`

**Interfaces:**

- Consumes: `learning_internal_card_access`.
- Produces: compatible `complete_review_card` signature returning the refreshed snapshot.

- [ ] **Step 1: Add RED transaction/idempotency cases**

Test later-card ID, next-section ID, archived/stale version, two concurrent completion requests, same request replay, new request against completed card, predecessor completing between stale read and mutation, voluntary completion of an own `grandfather_exempt` card, and spoofed exemption by an ineligible user. The exempt card remains non-completed until explicit submission, then creates exactly one normal completion without changing its pre-existing gate or primary next action.

- [ ] **Step 2: Run targeted RED tests**

Run test files 021 and 061; expect the later-card and concurrency assertions to fail on the old command.

- [ ] **Step 3: Replace command implementation**

Lock the actor/card sequence facts, call the internal access module inside the same transaction, accept either the sole current `available` card or an own current `grandfather_exempt` card, insert once, and return the post-commit logical snapshot. Map denials to `REVIEW_CARD_LOCKED`, `REVIEW_SEQUENCE_REQUIRED`, or `LEARNING_VERSION_CHANGED` without leaking existence.

- [ ] **Step 4: Run GREEN and mutation replay**

Run 021/061 twice without resetting between the two test invocations; both must pass and leave one completion row per current identity.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260902000100_section_progression.sql supabase/tests/061_section_progression.test.sql supabase/tests/021_review_progress.test.sql
git commit -m "feat(learning): enforce ordered review completion"
```

### Task 4: Gate challenge creation and project finalized results

**Files:**

- Modify: `supabase/migrations/20260902000100_section_progression.sql`
- Modify: `supabase/tests/004_quiz_engine_rls.test.sql`
- Modify: `supabase/tests/025_learning_progress.test.sql`
- Modify: `supabase/tests/047_chapter_sequence_access.test.sql`

**Interfaces:**

- Consumes: template `section_id`, bank kind, current card requirements, finalized session facts.
- Produces: guarded existing `create_quiz_session`; progression projection updated only by existing finalize transaction.

- [ ] **Step 1: Add RED matrix**

Test section challenge before/after cards, wrong-section template, low-score finalized unlock, abandoned no-unlock, all section 80% chapter gate, 79.999 denial, chapter low/high status, idempotent finalize, and concurrent publish/finalize allocation of distinct monotonic `section_event_order` values. Prove only `finalize.section_event_order < publication.publication_cutoff_order` qualifies; equal, absent, client-supplied, and post-cutoff values do not.

- [ ] **Step 2: Run targeted DB tests and verify RED**

Run 004, 025, and 047. Expected failures must be new progression assertions, not unrelated setup errors.

- [ ] **Step 3: Add one shared template-access assertion**

Have `create_quiz_session` call `learning_internal_assert_template_access`; derive scope from template, never request fields. Keep question selection and scoring implementation unchanged. Make a successful section-challenge finalize allocate and persist its server-only `section_event_order` under the same section lock used by publication, then update/read progression from committed session aggregates in the same transaction.

- [ ] **Step 4: Retire cross-chapter activation from decisions**

Keep historical unlock rows/tables readable for audit, but remove them from current path state and self-study command authorization. Update test 047 to prove Chapter B access is independent while direct locked items inside B remain denied.

- [ ] **Step 5: Run GREEN and commit**

```bash
pnpm exec supabase test db --local supabase/tests/004_quiz_engine_rls.test.sql supabase/tests/025_learning_progress.test.sql supabase/tests/047_chapter_sequence_access.test.sql supabase/tests/061_section_progression.test.sql
git add supabase/migrations/20260902000100_section_progression.sql supabase/tests/004_quiz_engine_rls.test.sql supabase/tests/025_learning_progress.test.sql supabase/tests/047_chapter_sequence_access.test.sql supabase/tests/061_section_progression.test.sql
git commit -m "feat(quiz): enforce section and chapter challenge gates"
```

### Task 5: Add the typed frontend seam

**Files:**

- Create: `src/features/learning/api/learning-path-contract.ts`
- Create: `src/features/learning/api/learning-path-repository.ts`
- Test: `src/features/learning/api/learning-path-repository.test.ts`
- Modify: `src/features/learning/api/learning-repository.ts`
- Modify: `src/features/learning/hooks/use-learning.ts`
- Test: `src/features/learning/hooks/use-learning.test.tsx`

**Interfaces:**

- Consumes: three public DB functions from Tasks 1–3.
- Produces: `LearningPathRepository`; UI only knows typed snapshot/content/complete results.

- [ ] **Step 1: Write RED Zod/adaptor tests**

Test every enum/next-action variant, missing locked content, unknown fields tolerated only where intentionally loose, malformed UUID/state rejected, denial code mapping, and cache invalidation after completion.

- [ ] **Step 2: Run RED unit tests**

Run the two new/modified test files; expect missing module/export failures.

- [ ] **Step 3: Implement contract and adapter**

Keep Zod schemas in `learning-path-contract.ts`; DB mapping in repository; React Query keys/invalidation in hooks. Remove `listChapterReview` as the student full-content source. Map stable server denials without reconstructing access rules.

- [ ] **Step 4: Run GREEN, lint, typecheck**

```bash
pnpm vitest run src/features/learning/api/learning-path-repository.test.ts src/features/learning/hooks/use-learning.test.tsx
pnpm lint
pnpm typecheck
```

- [ ] **Step 5: Commit**

Stage only the six listed files and commit `feat(learning): consume authoritative learning path`.

### Task 6: Render locked nodes, last-page completion, and one next action

**Files:**

- Modify: `src/features/learning/pages/chapter-detail-view-model.ts`
- Modify/Test: `src/features/learning/pages/chapter-detail-adapter.ts` and `.test.ts`
- Modify/Test: `src/features/learning/pages/chapter-detail-page.tsx` and `.test.tsx`
- Modify/Test: `src/features/learning/pages/chapter-review-library.tsx` and `.test.tsx`
- Modify/Test: `src/features/learning/pages/chapter-review-node.tsx` and `.test.tsx`
- Modify/Test: `src/features/learning/pages/chapter-review-reader.tsx` and `.test.tsx`
- Modify/Test: chapter map repository/components and their existing tests.

**Interfaces:**

- Consumes: `LearningPathSnapshot` and per-card content.
- Produces: spec §9 UI with exactly one primary `next_action`.

- [ ] **Step 1: Write RED exhaustive view-model tests**

Create fixtures for every card/section/chapter state and next action. Assert locked nodes have no button/link, completed nodes remain reviewable, one section challenge follows selected section, and chapter states separate completed/mastered. Cover `grandfather_exempt` as a readable secondary action labelled「新增內容（非必修）」that is neither locked nor completed and never replaces the primary next action.

- [ ] **Step 2: Write RED reader test**

Assert an incomplete card has no enabled「完成複習」before the final page, final page exposes it, merely navigating does not call mutation, click does, and completed review renders no mutation control.

- [ ] **Step 3: Implement the UI without client progression logic**

Render state and blocker from snapshot. The only logic allowed locally is pagination/focus/selection. Map `next_action.kind` exhaustively to the approved labels/targets; no `find(!completed)` or mastery threshold calculation in components.

- [ ] **Step 4: Run affected tests and accessibility assertions**

Run all listed learning page/component tests, lint, and typecheck. Assert primary action count equals one for actionable states and zero only for mastered/content-unavailable terminal states.

- [ ] **Step 5: Commit**

Stage only the listed learning UI/test files and commit `feat(learning): guide the next section action`.

### Task 7: Close the Local slice gate

**Files:**

- Create: `tests/e2e/section-progression.spec.ts`
- Modify: `tests/e2e/chapter-sequence.spec.ts`
- Modify: relevant chapter-detail harness fixtures only if they mirror the new contract.

**Interfaces:**

- Consumes: completed DB/frontend implementation.
- Produces: automated evidence for `AC-PROG-007`–`AC-PROG-015`.

- [ ] **Step 1: Build a deterministic two-section fixture through SQL seed helpers**

Use dedicated test users and unique stable codes; never mutate `student01` or real hosted users. Include three cards/section, section/chapter banks, low/high answer paths, and the four inserted-card cohorts: pre-cutoff low-score finalized, pre-cutoff review-only, post-cutoff finalized, and post-cutoff new user.

- [ ] **Step 2: Implement browser/network flow**

Walk card pages and explicit completion, prove locked content absent from responses, run low section attempt, next section, retry to 80, low chapter completion, retry mastery, refresh and stale second tab. Publish the inserted card through the protected command; prove only the pre-cutoff finalized cohort receives readable `grandfather_exempt` content, remains unblocked, and can voluntarily create one completion, while the other cohorts must follow card order. Run at 375×812, 768×1024, and 1440×900 in the approved phase gate; task-level development may use Chromium only.

- [ ] **Step 3: Run scoped gates**

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:db
pnpm exec playwright test tests/e2e/section-progression.spec.ts tests/e2e/chapter-sequence.spec.ts --project=chromium
```

Expected: all pass. If unrelated baseline failures exist, report them separately; do not skip or weaken assertions.

- [ ] **Step 4: One review round and fixes**

One reviewer checks trust boundary, missing negative cases, semantic conflicts in Quiz/finalize, and UI state completeness. Fix that one round and rerun only affected commands plus lint/typecheck.

- [ ] **Step 5: Commit**

Stage exact E2E/harness paths and any review fixes; commit `test(learning): cover section progression flow`.

### Task 8: Owner-gated activation and Hosted proof

**Files:**

- Create only after approval: a sanitized evidence manifest under the phase-approved artifact location (not committed).
- Modify docs tracker/handoff only after the actual gate result and without overwriting existing entries.

**Interfaces:**

- Consumes: owner migration decisions, merged Phase 0, exact canonical SHA, fresh Staging binding.
- Produces: one Local phase gate and one separately authorized Staging gate.

- [ ] **Step 1: Run read-only historical inconsistency report**

Count out-of-order completions, pre-review challenge attempts, version mismatches, and inserted-card impact. Apply compatibility normalization to the first two and progression-impact classification to version mismatches without deleting or rewriting facts. For inserted cards, verify the immutable cutoff and `finalized_before_publish` cohort directly from valid committed finalize facts; never substitute mastery/projection state or use a mutable exemption list.

- [ ] **Step 2: Obtain exclusive Local Supabase window and run phase gate**

Record base/candidate SHA and run the complete affected DB/browser matrix once.

- [ ] **Step 3: Stop for explicit Hosted mutation authorization**

Do not infer permission from plan approval. Present exact deployment SHA, Supabase ref, fixture IDs, planned writes, and cleanup.

- [ ] **Step 4: Execute authorized Staging flow and cleanup**

Verify bundle target/migration head, run real Auth/profile bootstrap and progression flows, then remove every created fixture and confirm zero remaining rows.

- [ ] **Step 5: Record truthful gate result**

Use PASS/FAIL/NOT VERIFIED per acceptance rules. Never promote or claim Production completion from this task.

## Self-Review Result

- Spec coverage: all progression product/migration-policy decisions are resolved and map to Tasks 1–8; exact-base, Phase 2B, worktree and database gates remain explicit execution prerequisites.
- Placeholder scan: no TODO/TBD implementation step; every command/path is concrete for snapshot `f0638b0`.
- Type consistency: `LearningPathSnapshot`, `LearningPathRepository`, DB functions, and next-action names are identical across tasks.
