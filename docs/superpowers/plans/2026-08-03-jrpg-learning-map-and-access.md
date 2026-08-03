# JRPG Learning Map and Chapter Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the paged learning lobby with a detailed six-building JRPG village and add one server-authoritative, permanently recorded chapter-access service while the course remains in `open` mode.

**Architecture:** A forward-only Supabase access layer owns course mode, permanent unlock records, completion evaluation, structured blockers, the chapter-map projection, and guards for every self-study entry point. React consumes that projection through a typed repository/hook and renders a semantic two-step map; modular original pixel assets and scoped CSS provide the world without baking content text into images.

**Tech Stack:** PostgreSQL 15, Supabase RPC/RLS/pgTAP, React 19, TypeScript 5.8, TanStack Query, Zod, CSS, Vitest/Testing Library, Playwright, original generated pixel-art assets.

## Global Constraints

- The six stable identities are `chapter-1` through `chapter-6`; titles and descriptions always come from published database content and are never baked into artwork.
- The approved titles are `認識色彩`, `色彩呈現`, `色彩表示`, `色彩感知`, `色彩認知`, and `色彩應用`; the map must not use these strings as identity keys.
- Default progression mode is `open`. This plan must not activate `sequential` in any local, preview, or production course.
- Access and progress are separate. Access states are exactly `content_unavailable | locked | available | completed`; progress states remain `not_started | learning | developing | mastered`.
- Canonical completion is current published review completion `100%` and formal mastery `>= 80%`. Assignment is not part of the rule.
- Unlock insertion is server-only, idempotent, per student, permanent, and never deleted when content changes.
- Guard map entry, review read, review completion, ordinary challenge creation, after-school mastery start, and remediation start through the same database access function.
- Teacher-hosted Live is exempt and must not call, read, or grant self-study chapter unlocks.
- Locked direct RPC access raises SQLSTATE `P0001`, message `CHAPTER_LOCKED`, and JSON blockers in the PostgreSQL detail field.
- Do not change Quiz scoring, XP/Token formulas, Live scoring, leaderboard rules, Blook ownership, or teacher administration behavior.
- Map assets must be original high-detail 16-bit JRPG art, modular rather than flattened, contain no text, and total no more than approximately 1.2 MiB after optimization.
- Required viewports are `1280×720`, `812×375`, and `375×812`; every interactive target is at least `44×44` CSS pixels, focus is visible, no horizontal overflow occurs, and the top HUD remains above the map.
- Work in the isolated implementation worktree. Stage exact task files only; never use `git add -A`. Do not push or deploy.
- Every commit uses `git commit -F` with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

## File Map and Stable Interfaces

### Database

- Create `supabase/migrations/20260803000200_chapter_sequence_access.sql`: progression setting, unlock table, completion/access/blocker functions, chapter-map/review RPCs, grant triggers.
- Create `supabase/migrations/20260803000300_guard_self_study_commands.sql`: forward replacements of the four self-study command RPCs.
- Create `supabase/tests/046_chapter_sequence_access.test.sql`: access/projection/unlock/Live-isolation pgTAP contract.
- Modify `src/types/database.ts`: regenerate types after both migrations.

### Frontend data boundary

- Create `src/features/learning/api/chapter-map.ts` and `chapter-map.test.ts`.
- Create `src/features/learning/hooks/use-chapter-map.ts` and `use-chapter-map.test.tsx`.
- Modify `src/features/learning/api/learning-repository.ts` and its test.
- Modify `src/features/learning/api/mastery-repository.ts` and its test.
- Modify `src/features/quiz/api/quiz-repository.ts` and its test.
- Modify `src/features/learning/hooks/use-learning.ts` and its test.

### Map UI

- Create `src/features/learning/components/chapter-map.tsx` and test.
- Create `src/features/learning/components/chapter-map-building.tsx` and test.
- Create `src/features/learning/components/chapter-map-panel.tsx` and test.
- Modify `src/features/learning/pages/lobby-page.tsx` and test.
- Modify `src/features/learning/pages/chapter-detail-page.tsx` and test.
- Modify `src/features/learning/pages/mission-page.tsx` and test.
- Modify `src/styles/globals.css`.
- Delete `src/features/learning/components/learning-chapter-card.tsx` and its test only after `rg` confirms no remaining consumer.

### Artwork

- Create `src/assets/learning-map/forest-village-base.webp`.
- Create `src/assets/learning-map/chapter-1-school.png` through `chapter-6-master-hall.png`.
- Create `src/assets/learning-map/locked-cloud.png`, `construction-overlay.png`, `completion-emblem.png`, and `adventurer-idle.png`.
- Create `src/assets/learning-map/README.md` with prompt provenance, dimensions, optimization command, and byte totals.

### End-to-end synchronization

- Modify `tests/e2e/helpers/quiz.ts`.
- Modify `tests/e2e/chapter-select.spec.ts`.
- Modify only lobby selectors in `tests/e2e/learning-experience.spec.ts` and `tests/e2e/teacher-content.spec.ts`.
- Create `tests/contracts/jrpg-learning-map.test.ts`.

The shared TypeScript contract is:

```ts
export type CourseProgressionMode = 'open' | 'sequential';
export type ChapterAccessState =
  'content_unavailable' | 'locked' | 'available' | 'completed';
export type ChapterProgressStatus =
  'not_started' | 'learning' | 'developing' | 'mastered';

export type ChapterAccessBlocker = Readonly<{
  chapterId: string;
  chapterTitle: string;
  code: 'CONTENT_UNAVAILABLE' | 'PREREQUISITE_REVIEW' | 'PREREQUISITE_MASTERY';
  current: number | null;
  required: number | null;
}>;

export type StudentChapterMapEntry = Readonly<{
  accessState: ChapterAccessState;
  blockers: readonly ChapterAccessBlocker[];
  chapterId: string;
  description: string;
  mastery: number | null;
  progressStatus: ChapterProgressStatus;
  reviewCompleted: number;
  reviewTotal: number | null;
  sortOrder: number;
  stableCode: string;
  templateId: string | null;
  templateQuestionCount: number | null;
  title: string;
}>;

export type StudentChapterMap = Readonly<{
  chapters: readonly StudentChapterMapEntry[];
  mode: CourseProgressionMode;
  rulesVersion: string;
}>;
```

The database rules version is exactly `2026-08-sequence-1`.

---

### Task 1: Build the central chapter access schema and projection

**Files:**

- Create: `supabase/migrations/20260803000200_chapter_sequence_access.sql`
- Create: `supabase/tests/046_chapter_sequence_access.test.sql`

**Interfaces:**

- Consumes: `public.learning_progress_for(uuid, uuid)` and the published course/chapter/template/question/review-card chain.
- Produces: `student_can_access_chapter`, `assert_student_chapter_access`, `chapter_access_blockers`, `get_student_chapter_map`, and `get_accessible_chapter_review`.

- [ ] **Step 1: Write the pgTAP contract for settings, RLS, and map shape**

Create fixtures for one published course with six ordered published chapters. Give Chapters 1–2 complete playable content, leave Chapter 3 without enough questions, and create two student profiles. Assert:

```sql
select has_table('public', 'course_progression_settings');
select has_table('public', 'student_chapter_unlocks');
select has_function('public', 'get_student_chapter_map', array[]::text[]);
select has_function('public', 'student_can_access_chapter', array['uuid']);
select has_function('public', 'assert_student_chapter_access', array['uuid']);
select has_function('public', 'get_accessible_chapter_review', array['uuid']);
```

Under authenticated Student A in default `open` mode, parse `get_student_chapter_map()` and assert exactly six ordered objects, rules version `2026-08-sequence-1`, Chapter 1/2 `available`, and Chapter 3 `content_unavailable` with blocker code `CONTENT_UNAVAILABLE`. Assert Student A cannot insert/update/delete `student_chapter_unlocks` directly.

- [ ] **Step 2: Write the sequential and permanent-unlock RED cases**

Inside the rolled-back test transaction, change the fixture course setting directly to `sequential`. Assert:

```text
Chapter 1: accessible without an unlock row
Chapter 2: locked for Student A before prerequisite completion
Chapter 2: CHAPTER_LOCKED / P0001 with JSON prerequisite detail
Chapter 2: accessible after one server-created unlock row
Chapter 2: still accessible after Chapter 1 review content/version changes
Student B: remains locked
Chapter 3: content_unavailable even when an unlock row exists
```

Also assert duplicate insert attempts result in one `(user_id, chapter_id)` row.

- [ ] **Step 3: Run the new test to verify RED**

Run:

```bash
pnpm exec supabase db reset --local
pnpm exec supabase test db --local supabase/tests/046_chapter_sequence_access.test.sql
```

Expected: failure because the tables and RPCs do not exist.

- [ ] **Step 4: Add settings and permanent-unlock tables**

Create the tables with these constraints:

```sql
create table public.course_progression_settings (
  course_id uuid primary key references public.courses(id) on delete cascade,
  mode text not null default 'open' check (mode in ('open', 'sequential')),
  rules_version text not null default '2026-08-sequence-1',
  updated_at timestamptz not null default clock_timestamp()
);

create table public.student_chapter_unlocks (
  user_id uuid not null references public.profiles(id) on delete cascade,
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  source_chapter_id uuid references public.chapters(id) on delete restrict,
  unlocked_at timestamptz not null default clock_timestamp(),
  rules_version text not null default '2026-08-sequence-1',
  primary key (user_id, chapter_id)
);
```

Enable RLS on both. Grant authenticated select on own unlock rows and no authenticated mutation privileges. Settings are authenticated read-only. Backfill one `open` settings row for every existing course with `insert ... on conflict do nothing`.

- [ ] **Step 5: Implement one canonical completion and access calculation**

Add internal `security definer`, locked-search-path functions:

```sql
public.student_chapter_completion(p_user_id uuid, p_chapter_id uuid)
returns table (
  review_completed integer,
  review_total integer,
  mastery numeric,
  progress_status text,
  is_complete boolean
)
```

It selects the `scope = 'chapter'` row from `learning_progress_for(p_user_id, p_chapter_id)` and defines `is_complete` only as:

```sql
review_total > 0
and review_completed = review_total
and mastery >= 80
```

Add `public.chapter_content_is_available(uuid)` requiring a published course/chapter, one published template, published questions through published section/subtopic parents with count at least `template.question_count`, and at least one published review card through the same parent chain.

Implement `student_can_access_chapter(uuid)`:

```text
false when content is unavailable
true in open mode
true for sort_order = 1 in sequential mode
true when an own unlock row exists in sequential mode
false otherwise
```

Implement `chapter_access_blockers(uuid)` as JSON using the immediately preceding published chapter. Use `PREREQUISITE_REVIEW` with current count and required total, and `PREREQUISITE_MASTERY` with current percent and required `80`; use only `CONTENT_UNAVAILABLE` for unavailable content.

Implement `assert_student_chapter_access(uuid)` to raise:

```sql
raise exception using
  errcode = 'P0001',
  message = 'CHAPTER_LOCKED',
  detail = public.chapter_access_blockers(p_chapter_id)::text;
```

- [ ] **Step 6: Implement the map and guarded review RPCs**

`get_student_chapter_map()` returns one JSON object matching the TypeScript interface exactly. It includes all six published chapters for the current published course ordered by `sort_order`, a nullable published template, canonical progress, access blockers, and these state rules:

```text
content unavailable -> content_unavailable
canonical completion true -> completed
student_can_access_chapter true -> available
otherwise -> locked
```

`get_accessible_chapter_review(p_chapter_id uuid)` first calls `assert_student_chapter_access`, then returns the currently published section/subtopic/review-card/media tree in the same snake_case shape already parsed by `chapterReviewSchema`.

Revoke internal helper execution from `public, anon, authenticated`; grant only the two public RPCs to `authenticated`. `assert_student_chapter_access` remains callable only by the guarded security-definer commands, not directly by clients.

- [ ] **Step 7: Verify Task 1 GREEN and commit**

Run:

```bash
pnpm exec supabase db reset --local
pnpm exec supabase test db --local supabase/tests/046_chapter_sequence_access.test.sql
pnpm prettier --check supabase/migrations/20260803000200_chapter_sequence_access.sql supabase/tests/046_chapter_sequence_access.test.sql
git diff --check
git add supabase/migrations/20260803000200_chapter_sequence_access.sql supabase/tests/046_chapter_sequence_access.test.sql
```

Expected: all new pgTAP assertions pass. Commit subject: `feat(learning): add chapter access service`.

---

### Task 2: Guard self-study commands and grant the next chapter atomically

**Files:**

- Modify: `supabase/migrations/20260803000200_chapter_sequence_access.sql`
- Create: `supabase/migrations/20260803000300_guard_self_study_commands.sql`
- Modify: `supabase/tests/046_chapter_sequence_access.test.sql`
- Modify: `src/types/database.ts`
- Test: `tests/contracts/database-types.test.sh`

**Interfaces:**

- Consumes: `assert_student_chapter_access(uuid)` and `student_chapter_completion(uuid, uuid)` from Task 1.
- Produces: guarded `complete_review_card`, `create_quiz_session`, `start_mastery_session`, `start_remediation_session`; trigger-driven `grant_next_chapter_if_completed`.

- [ ] **Step 1: Add failing direct-bypass and grant tests**

In sequential mode, authenticate a student with only Chapter 1 available and assert all four Chapter 2 calls fail with `CHAPTER_LOCKED` before writes:

```text
get_accessible_chapter_review(chapter_2)
complete_review_card(chapter_2_card, request_id)
create_quiz_session(chapter_2_template, request_id)
start_mastery_session(chapter_2)
start_remediation_session(chapter_2_subtopic, request_id)
```

The first item is already provided by Task 1; keep it in the matrix. Then assert review 100% without mastery leaves Chapter 2 locked, mastery 80 without review 100% leaves it locked, and the transition that satisfies both inserts exactly one unlock for Chapter 2. Repeat the terminal call with the same request ID and assert the unlock count remains one.

Create a Live session, submit/finalize Live answers for the locked chapter, and assert it neither fails because of the chapter gate nor inserts a self-study unlock.

- [ ] **Step 2: Run the expanded pgTAP test to verify RED**

Run `pnpm exec supabase test db --local supabase/tests/046_chapter_sequence_access.test.sql`.

Expected: direct command bypasses still succeed and/or no unlock is granted.

- [ ] **Step 3: Add the idempotent server-only grant function and triggers**

Implement:

```sql
public.grant_next_chapter_if_completed(
  p_user_id uuid,
  p_source_chapter_id uuid
) returns void
```

It exits unless `student_chapter_completion(...).is_complete`, selects the next published same-course chapter by greater `sort_order`, and performs:

```sql
insert into public.student_chapter_unlocks (
  user_id, chapter_id, source_chapter_id, rules_version
)
values (
  p_user_id, next_chapter_id, p_source_chapter_id, '2026-08-sequence-1'
)
on conflict (user_id, chapter_id) do nothing;
```

The grant runs in both `open` and `sequential` modes. `open` mode ignores unlock rows for access, but recording completed prerequisites before activation prevents a future mode switch from relocking already-earned progress. Add a pgTAP case proving completion in `open` mode records the next unlock without changing open-mode access behavior.

Add two server triggers:

- `after insert on review_progress`: resolve the card’s chapter and call the grant function.
- `after update of status on quiz_sessions when new.status = 'completed' and old.status <> 'completed' and new.purpose = 'practice'`: resolve the template’s chapter and call the grant function.

Do not attach triggers to Live tables. Remediation is guarded but is not a qualifying grant event because it does not change formal mastery.

- [ ] **Step 4: Forward-replace each guarded command with its latest body**

Copy the latest complete implementation of each RPC into `20260803000300_guard_self_study_commands.sql`, preserving every existing validation, idempotency key, payload, reward, and grant. Insert only these access calls after the content relation is resolved and before any write:

```sql
perform public.assert_student_chapter_access(card_chapter_id);
perform public.assert_student_chapter_access(template_record.chapter_id);
perform public.assert_student_chapter_access(p_chapter_id);
perform public.assert_student_chapter_access(subtopic_chapter_id);
```

The source bodies are:

- `complete_review_card`: `20260718000200_review_progress.sql`.
- `create_quiz_session`: `20260714000300_quiz_engine.sql`.
- `start_mastery_session`: `20260722000100_mastery_sessions.sql`.
- `start_remediation_session`: `20260718000500_remediation.sql`.

Preserve exact argument/return signatures and existing grants. Never add a guard to Live RPCs.

- [ ] **Step 5: Regenerate database types and run database regressions**

After a clean reset, generate to a temporary file and compare before replacing the checked-in output:

```bash
pnpm exec supabase gen types typescript --local > /tmp/database.generated.ts
diff -u src/types/database.ts /tmp/database.generated.ts || true
cp /tmp/database.generated.ts src/types/database.ts
pnpm prettier --write src/types/database.ts
```

Review the generated file, then replace `src/types/database.ts` with the formatter-generated output using the project’s standard generation workflow. Do not hand-edit function signatures.

Run:

```bash
pnpm exec supabase db reset --local
pnpm exec supabase test db --local supabase/tests/046_chapter_sequence_access.test.sql
pnpm exec supabase test db --local supabase/tests/004_quiz_engine_rls.test.sql
pnpm exec supabase test db --local supabase/tests/006_quiz_rewards.test.sql
pnpm exec supabase test db --local supabase/tests/025_learning_progress.test.sql
pnpm exec supabase test db --local supabase/tests/036_mastery_sessions.test.sql
bash tests/contracts/database-types.test.sh
```

Expected: all listed tests and the generated-type diff contract pass.

- [ ] **Step 6: Format-check and commit Task 2**

Run Prettier on the two migrations, pgTAP test, and generated TypeScript, then stage exactly those four files. Commit subject: `feat(learning): enforce sequential access in self study`.

---

### Task 3: Add the typed chapter-map repository and locked-error handling

**Files:**

- Create: `src/features/learning/api/chapter-map.ts`
- Create: `src/features/learning/api/chapter-map.test.ts`
- Create: `src/features/learning/hooks/use-chapter-map.ts`
- Create: `src/features/learning/hooks/use-chapter-map.test.tsx`
- Modify: `src/features/learning/api/learning-repository.ts`
- Modify: `src/features/learning/api/learning-repository.test.ts`
- Modify: `src/features/learning/api/mastery-repository.ts`
- Modify: `src/features/learning/api/mastery-repository.test.ts`
- Modify: `src/features/quiz/api/quiz-repository.ts`
- Modify: `src/features/quiz/api/quiz-repository.test.ts`
- Modify: `src/features/learning/hooks/use-learning.ts`
- Modify: `src/features/learning/hooks/use-learning.test.tsx`

**Interfaces:**

- Consumes: `get_student_chapter_map` and `get_accessible_chapter_review` RPC payloads.
- Produces: the shared TypeScript contract and `useStudentChapterMap()` query keyed by `['learning', 'chapter-map']`.

- [ ] **Step 1: Write RED parser/repository tests with the exact payload**

Test a complete six-entry snake_case payload, malformed state, malformed blocker, RPC error, and `CHAPTER_LOCKED`. Require camel-case output matching the interface at the top of this plan. Test that `fetchStudentChapterMap(client)` calls:

```ts
client.rpc('get_student_chapter_map');
```

and that `listChapterReview(chapterId)` calls:

```ts
client.rpc('get_accessible_chapter_review', { p_chapter_id: chapterId });
```

Require all three repository error mappers—learning, mastery, and quiz—to map a Supabase error containing `CHAPTER_LOCKED` to their typed `CHAPTER_LOCKED` code without mapping other errors differently.

- [ ] **Step 2: Run the focused tests to verify RED**

Run:

```bash
pnpm vitest run src/features/learning/api/chapter-map.test.ts src/features/learning/api/learning-repository.test.ts src/features/learning/api/mastery-repository.test.ts src/features/quiz/api/quiz-repository.test.ts
```

Expected: failures for missing module/RPC and missing error code.

- [ ] **Step 3: Implement the Zod boundary and repository**

In `chapter-map.ts`, export the types exactly as defined above, a strict Zod schema for the server payload, and:

```ts
export async function fetchStudentChapterMap(
  client: SupabaseClient<Database>,
): Promise<StudentChapterMap>;
```

Sort chapters by `sortOrder` after parsing even though the server is ordered. Throw `new LearningError('INVALID_RESPONSE')` for malformed data and `new LearningError('UNAVAILABLE')` for other RPC errors.

Add `CHAPTER_LOCKED` with copy `請先完成上一章的複習與挑戰。` to the learning/mastery/quiz error unions. Replace the direct `sections` query in `listChapterReview` with the guarded RPC, leaving its existing parsing/mapping output unchanged.

- [ ] **Step 4: Add the query hook and invalidation**

Implement:

```ts
export const studentChapterMapKey = ['learning', 'chapter-map'] as const;

export function useStudentChapterMap(): UseQueryResult<
  StudentChapterMap,
  LearningError
>;
```

Retry only `UNAVAILABLE` twice. On successful review completion and successful formal quiz finalization, invalidate `studentChapterMapKey` so a newly granted building appears without re-login. Do not invalidate or grant from Live completion.

- [ ] **Step 5: Verify GREEN and commit Task 3**

Run the focused API/hook tests plus Prettier and typecheck. Stage only the files listed in Task 3. Commit subject: `feat(learning): consume chapter map access projection`.

---

### Task 4: Generate, optimize, and inspect the modular JRPG assets

**Files:**

- Create: `src/assets/learning-map/forest-village-base.webp`
- Create: `src/assets/learning-map/chapter-1-school.png`
- Create: `src/assets/learning-map/chapter-2-workshop.png`
- Create: `src/assets/learning-map/chapter-3-library-tower.png`
- Create: `src/assets/learning-map/chapter-4-observatory.png`
- Create: `src/assets/learning-map/chapter-5-forest-academy.png`
- Create: `src/assets/learning-map/chapter-6-master-hall.png`
- Create: `src/assets/learning-map/locked-cloud.png`
- Create: `src/assets/learning-map/construction-overlay.png`
- Create: `src/assets/learning-map/completion-emblem.png`
- Create: `src/assets/learning-map/adventurer-idle.png`
- Create: `src/assets/learning-map/README.md`
- Create: `tests/contracts/jrpg-learning-map.test.ts`

**Interfaces:**

- Consumes: the approved original forest-kingdom art direction.
- Produces: fixed importable asset paths with transparent sprite edges and no embedded copy.

- [ ] **Step 1: Write a failing asset contract**

The contract reads each file, verifies it exists and is non-empty, asserts the base is WebP and sprites are PNG, checks the combined byte total is `<= 1_258_291`, and scans binary metadata/filenames to ensure no reference screenshot is present. It also reads `README.md` and requires dimensions, prompt provenance, optimization commands, byte table, and the statement `No text is baked into these assets.`

- [ ] **Step 2: Run the contract to verify RED**

Run `pnpm vitest run tests/contracts/jrpg-learning-map.test.ts`.

Expected: missing-file failures.

- [ ] **Step 3: Use the imagegen skill to create original source artwork**

At execution time, explicitly invoke the available `imagegen` skill. Generate one detailed 16-bit forest-village base with stone paths, river, bridge, fountain, foliage, props, shadows, and no buildings or text; then generate transparent sprites for the six increasingly prestigious buildings, cloud, construction fence, completion emblem, and a two-frame fixed adventurer idle sheet.

Use this shared prompt constraint verbatim for every generation:

```text
Original high-detail 16-bit JRPG pixel art for a forest-kingdom learning village. Crisp deliberate pixel clusters, coherent three-quarter top-down lighting, rich but readable detail, transparent background for sprites, no words, no letters, no numbers, no logos, no copyrighted characters, and do not reproduce or crop the supplied reference screenshot.
```

Building order is school, artisan workshop, library tower, observatory, forest academy, royal master hall. Their visual prestige increases by order; their imagery must not imply the current mutable chapter titles.

- [ ] **Step 4: Optimize and visually inspect every file**

Keep lossless transparency for sprites. Use the repository-available image optimizer; record the exact commands and before/after bytes in `README.md`. Inspect each image at original resolution and at the three target viewport scales for transparent halos, clipped roofs/shadows, inconsistent light, unreadable cloud/lock layering, and non-integer scaling blur.

Expected: total assets `<= 1.2 MiB`, no embedded text, and no edge defects. A CSS placeholder or flattened screenshot does not pass this task.

- [ ] **Step 5: Verify the contract and commit artwork separately**

Run the asset contract, Prettier on `README.md`/contract, and `git diff --check`. Stage only `src/assets/learning-map/*` and `tests/contracts/jrpg-learning-map.test.ts`. Commit subject: `feat(learning): add jrpg village map artwork`.

---

### Task 5: Implement the semantic two-step map and information panel

**Files:**

- Create: `src/features/learning/components/chapter-map.tsx`
- Create: `src/features/learning/components/chapter-map.test.tsx`
- Create: `src/features/learning/components/chapter-map-building.tsx`
- Create: `src/features/learning/components/chapter-map-building.test.tsx`
- Create: `src/features/learning/components/chapter-map-panel.tsx`
- Create: `src/features/learning/components/chapter-map-panel.test.tsx`
- Modify: `src/features/learning/pages/lobby-page.tsx`
- Modify: `src/features/learning/pages/lobby-page.test.tsx`
- Modify: `src/styles/globals.css`
- Delete: `src/features/learning/components/learning-chapter-card.tsx`
- Delete: `src/features/learning/components/learning-chapter-card.test.tsx`

**Interfaces:**

- Consumes: `StudentChapterMapEntry[]`, modular assets, `StudentSummaryCard`, and existing equipped-Blook display.
- Produces: ordered building buttons and one shared live-region panel with a single entry action.

- [ ] **Step 1: Write RED component tests for all four states and selection**

Render six entries and assert:

```text
ordered list contains six real buttons
accessible name includes chapter number, title, and state
default = first accessible incomplete; Chapter 6 if all complete
click/Enter selects without navigation or product write
available/completed panel link = 進入複習與進度
locked panel has prerequisite review/mastery numbers and no link
content_unavailable panel says 內容準備中 and no link
selected state uses aria-pressed
panel uses aria-live=polite and does not steal focus
decorative base/buildings/cloud/adventurer are aria-hidden
no text 目前位置 exists
missing image still leaves button, state, panel, and action usable
```

Mock the equipped inventory hook and require the compact `BlookArt` badge near the default selected building without a location-text label.

- [ ] **Step 2: Write RED page tests for loading, failure, query selection, and retry**

`LobbyPage` must use `useStudentChapterMap`, keep `StudentSummaryCard`, show `章節狀態暫時無法確認` plus `重新載入` on RPC failure, and honor `?chapter=<uuid>&reason=locked` by selecting that building and exposing its blockers. It must not render `GamePager`, `.chapter-card`, or a direct quiz link.

- [ ] **Step 3: Run the focused UI tests to verify RED**

Run:

```bash
pnpm vitest run src/features/learning/components/chapter-map.test.tsx src/features/learning/components/chapter-map-building.test.tsx src/features/learning/components/chapter-map-panel.test.tsx src/features/learning/pages/lobby-page.test.tsx
```

Expected: missing-component and old-card failures.

- [ ] **Step 4: Implement the building and panel components**

`ChapterMapBuilding` receives:

```ts
Readonly<{
  chapter: StudentChapterMapEntry;
  onSelect: (chapterId: string) => void;
  selected: boolean;
}>;
```

It renders a button inside an ordered-list item. Use a stable asset mapping keyed only by `stableCode`; fall back to a semantic CSS building when an image errors. Cloud/fence/emblem are decorative overlays, while visible state text remains HTML.

`ChapterMapPanel` receives the selected entry and renders identical title, description, status, `reviewCompleted / reviewTotal`, mastery with `80%` threshold, access/completion label, blockers, and either:

```tsx
<Link to={`/app/chapters/${chapter.chapterId}`}>進入複習與進度</Link>
```

or no link. Do not expose `開始挑戰` on the map.

- [ ] **Step 5: Implement `ChapterMap` and replace the lobby**

Maintain selection in local state. Choose the first entry with `accessState === 'available'`; if none, choose the last completed entry, and select Chapter 6 when all six are completed. A valid `chapter` query parameter overrides this initial choice.

Render `StudentSummaryCard`, the map heading `學習地圖`, the complete village, ordered buildings, equipped badge, fixed adventurer, and shared panel. Selection must not invalidate queries or write to Supabase.

After `rg -n "LearningChapterCard|learning-chapter-card" src tests` confirms only the obsolete component/test remain, delete them.

- [ ] **Step 6: Add scoped responsive CSS and motion rules**

Append one `/* JRPG learning map */` section. Use CSS Grid for the scene and semantic panel:

```css
.chapter-map__scene {
  position: relative;
  overflow: clip;
}
.chapter-map__buildings {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.chapter-map__building-button,
.chapter-map__entry-action {
  min-width: 44px;
  min-height: 44px;
}
@media (max-width: 48rem) and (orientation: landscape) {
  .chapter-map {
    grid-template-columns: minmax(0, 3fr) minmax(17rem, 2fr);
  }
}
@media (max-width: 30rem) and (orientation: portrait) {
  .chapter-map__buildings {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (prefers-reduced-motion: reduce) {
  .chapter-map__cloud,
  .chapter-map__adventurer {
    animation: none;
  }
}
```

Use `image-rendering: pixelated`; do not use CSS `order` to move the top HUD. Ensure the panel can scroll in short landscape and focus outlines are not clipped. Remove only lobby-specific old card/grid rules; retain generic `.pastel-grid` because achievements still uses it.

- [ ] **Step 7: Verify GREEN, accessibility, and commit Task 5**

Run focused component/page tests, `pnpm typecheck`, Prettier on touched files, and `git diff --check`. Stage exact Task 5 files only. Commit subject: `feat(learning): replace lobby with jrpg chapter map`.

---

### Task 6: Guard stale deep links and preserve existing detail actions

**Files:**

- Modify: `src/features/learning/pages/chapter-detail-page.tsx`
- Modify: `src/features/learning/pages/chapter-detail-page.test.tsx`
- Modify: `src/features/learning/pages/mission-page.tsx`
- Modify: `src/features/learning/pages/mission-page.test.tsx`
- Modify: `src/features/quiz/pages/quiz-session.tsx`
- Modify: `src/features/quiz/pages/quiz-session.test.tsx`
- Modify: `src/features/learning/hooks/use-learning.ts`
- Modify: `src/features/learning/hooks/use-learning.test.tsx`

**Interfaces:**

- Consumes: map access states and typed `CHAPTER_LOCKED` failures.
- Produces: fail-closed redirects to `/app?chapter=<id>&reason=locked`; unchanged detail-page `開始挑戰` placement for accessible playable chapters.

- [ ] **Step 1: Write RED route-behavior tests**

Assert an accessible chapter detail still renders the existing title-row `開始挑戰` link next to its chapter title. Assert a locked map state or guarded-review `CHAPTER_LOCKED` redirects with `replace` to the exact map query and does not briefly render review cards. Assert transient `UNAVAILABLE` shows `章節狀態暫時無法確認` and a retry button rather than guessing access.

For `MissionPage`, assert only available/completed chapters expose mastery start; locked/unavailable chapters expose blocker/status copy and no start control. A direct locked `start_mastery_session` error returns to the same selected map panel.

For `QuizSessionPage`, mount `/app/quiz/new?template=<locked-template-id>`, make creation reject with typed `CHAPTER_LOCKED`, and assert it resolves the chapter through `useStudentChapterMap` then replaces the route with `/app?chapter=<chapter-id>&reason=locked`. It must not retry creation or render a Quiz question. A transient `UNAVAILABLE` remains on the existing retryable error UI.

- [ ] **Step 2: Run page/hook tests to verify RED**

Run the chapter-detail, mission, quiz-session, and `use-learning` tests. Expected: current pages derive playability locally and do not handle `CHAPTER_LOCKED`.

- [ ] **Step 3: Implement fail-closed page behavior**

Read access only from `useStudentChapterMap`. Do not derive it from `PublishedChapter.isPlayable` or client progress arithmetic. For a locked ID, navigate to:

```ts
`/app?chapter=${encodeURIComponent(chapterId)}&reason=locked`;
```

Keep `開始挑戰` in the detail title row when `templateId` exists and access is `available` or `completed`; no review-completion prerequisite is added.

On new Quiz creation failure, find the chapter-map entry by exact `templateId` and perform the same replace navigation. If the template is absent from the authoritative map, retain the existing invalid/unavailable error instead of guessing a chapter.

- [ ] **Step 4: Verify GREEN and commit Task 6**

Run focused tests, TypeScript, and Prettier. Stage only Task 6 files. Commit subject: `fix(learning): enforce access on chapter deep links`.

---

### Task 7: Synchronize E2E selectors and run the rendered phase gate

**Files:**

- Modify: `tests/e2e/helpers/quiz.ts`
- Modify: `tests/e2e/chapter-select.spec.ts`
- Modify: `tests/e2e/learning-experience.spec.ts`
- Modify: `tests/e2e/teacher-content.spec.ts`

**Interfaces:**

- Consumes: semantic building buttons and the `進入複習與進度` panel action.
- Produces: map-era quiz helper and viewport evidence without activating sequential mode.

- [ ] **Step 1: Rewrite the helper and chapter-select assertions before product verification**

`startQuizFromLobby` must select a building, click `進入複習與進度`, then click the detail-page `開始挑戰`. When `templateId` is supplied, locate the map entry whose typed data maps to that template; do not use `.chapter-card`, force click, DOM dispatch, or a hidden direct URL.

Rewrite `chapter-select.spec.ts` to assert six ordered building buttons, data-driven titles, two-step entry, distinct unavailable/locked semantics, and zero console/page errors. Update only obsolete `.chapter-card`/pager selectors in the two related phase specs; preserve their business assertions.

- [ ] **Step 2: Run focused unit/contract and E2E tests**

Probe `http://localhost:5173` and reuse a healthy server; otherwise start this worktree’s server without killing another session. Keep the course in `open` mode. Run:

```bash
pnpm vitest run src/features/learning tests/contracts/jrpg-learning-map.test.ts
PLAYWRIGHT_ACCEPTANCE=on pnpm playwright test tests/e2e/chapter-select.spec.ts tests/e2e/learning-experience.spec.ts tests/e2e/teacher-content.spec.ts --project=chromium
```

Expected: all pass; no screenshots are accepted by update, and no data reset occurs in this plan.

- [ ] **Step 3: Measure all three rendered viewports with a disposable script**

Place the measurement script and screenshots under `/tmp`, not the repository. For `1280×720`, `812×375`, and `375×812`, assert:

```text
document.documentElement.scrollWidth <= window.innerWidth
six building buttons and panel action each have width/height >= 44
each boundingBox right edge <= viewport width
selected focus outline is visible and not clipped
panel/action can scroll into view and pointer click succeeds
HUD bottom <= map top in visual order
desktop and mobile panels contain the same title/description/status/review/mastery/access fields
cloud/fence/emblem stacking matches access state
console errors = 0 and page errors = 0
```

Save paths for one screenshot per viewport plus locked, unavailable, completed, and artwork-fallback states. Obtain owner visual approval of the actual generated artwork; wireframes do not satisfy this gate.

- [ ] **Step 4: Run full engineering gates**

Run:

```bash
pnpm exec supabase db reset --local
pnpm exec supabase test db --local
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

Expected: every command exits zero.

- [ ] **Step 5: Final exact-diff review and commit E2E synchronization**

Review `git diff --stat` and each E2E assertion. Confirm no business assertion changed beyond the obsolete lobby interaction and no generated snapshot was updated. Stage exactly the four E2E files and commit subject `test(e2e): align learning flows with chapter map`.

Finally verify:

```text
[ ] progression mode remains open
[ ] six map entries and identical responsive information
[ ] no hard-coded chapter titles in map components/assets
[ ] all self-study entry points share the DB guard
[ ] Live has no access guard and grants no unlock
[ ] stored unlocks are permanent/idempotent
[ ] Assignment is absent from completion
[ ] assets <= 1.2 MiB and owner-approved
[ ] no product data reset, push, or deploy occurred
```
