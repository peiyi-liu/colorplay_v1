# Teacher Tactical Observatory UI Optimization — Phase B Implementation Plan

Status: Phase B approved; Tasks 1–7 complete; Task 8 not started

Date: 2026-08-14

Design source: `docs/superpowers/specs/2026-08-14-teacher-tactical-observatory-ui-optimization.md`

Governance: `docs/adr/0007-teacher-owner-question-answer-projection.md` and the revised `AC-QUIZ-002`

Baseline: branch `ui/jrpg-teacher-ui`, HEAD `ff14759effbd7244b5588752735c3419425d1e59`

Single-file retention: this plan intentionally exceeds 500 lines because the dependency graph, protected-path/owner gates, Task 5 → Task 6 security ordering, and eight bounded task contracts must remain in one atomic review surface. Splitting them would allow the server exception, UI dependency or stop gates to drift independently. Product source files remain subject to the normal 500-line split rule.

## 1. Delivery boundary

Phase B is a targeted evolution of six existing teacher routes. Keep route paths, guards, query keys, repository calls, handlers, filters, CSV export and formal operation semantics. Each route page remains an adapter over existing typed hooks and repository modules; page composition and teacher-local CSS may change.

Never modify or overwrite pre-existing WIP outside the current task's declared ownership. Do not stage or commit until the owner separately authorizes that workflow. Never use `git add -A`, reset, stash, restore, checkout, clean, rebase or amend.

Protected paths for every task unless an owner decision gate explicitly opens them:

- `src/app/shell/**`, `src/app/router/**`
- `src/styles/globals.css`, `src/styles/tokens.css`
- `package.json`, `pnpm-lock.yaml`, `components.json`, global Tailwind/Vite configuration
- student Quiz, learning, auth, shop and Live participant payloads
- `LivePresenter` and existing Live phase projection

Do not add dependencies, fake statistics, sample data, presence states, fake avatars, dead controls, N+1 RPCs or client-authoritative results. Do not run `pnpm acceptance`. A file forecast above 500 lines is a mandatory split before implementation.

### Verification and future phase-gate traceability

- Every task's AC list is related-contract/future-phase-gate traceability, not a PASS claim.
- Task-level RTL, Vitest, pgTAP, lint, typecheck and harness checks show only the bounded implementation slice. They do not satisfy the full environment, role, viewport, network, headed/real-device or evidence-manifest requirements of an acceptance criterion.
- Phase B produces no complete acceptance evidence and never runs `pnpm acceptance`. `AC-UI-001` and `AC-UI-005` remain future phase-gate-only. `AC-UI-008` applies to student core screens and is not a completion claim for these teacher pages.
- `AC-A11Y-003` formally covers the broader teacher content navigation/upload/validation/publish flow. This batch adopts its keyboard principles but cannot claim that AC complete.
- Classroom-create checks related to `AC-UI-009`/`AC-UI-010` are task-level UX checks only; they do not prove the formal student-flow or real-device requirements.
- Task 8 can report only scoped regression results. Acceptance status remains NOT VERIFIED until the later approved phase gate.

## 2. Shared contracts for all tasks

### Interface and seams

- `TeacherWorkSurface` remains the small interface for scene header, title, toolbar, content and loading/empty/error/retry states.
- `TeacherMenu` remains the small interface for teacher identity, avatar upload, three destinations and confirmed sign-out.
- Existing TanStack Query hooks and repository interfaces remain the data seams. Pages adapt typed results; they do not create a second domain state.
- Existing `ui-table`, `Chip`, `Icon`, links, buttons, native disclosure semantics and `GamePager` remain the low-level primitives. No shadcn initialization or new design system.

### Visual and responsive contract

- Desktop design target: 1280x900 implementation review; acceptance-aligned checks also cover 1440x900.
- Mobile design target: 393x852; overflow smoke also covers 320px and acceptance-aligned 375x812.
- JRPG command-room scene is limited to the header. The work canvas is quiet deep navy, never pure black.
- General mobile tables become disclosure rows. Only the Live answer matrix keeps bounded horizontal scrolling.
- Every functional control is at least 44x44 CSS px. Focus order follows visual order; focus rings are visible and unclipped. Status is never color-only. `prefers-reduced-motion` removes nonessential transitions.
- Missing data uses an em dash, omitted summary or explicit empty state. It never becomes a fake zero.

### State contract

Every query region retains loading, empty, error and retry behavior. Mutations retain pending, disabled, field error and ambiguous-write handling. Loading preserves layout stability; error text never exposes stack or database details.

### Review and stop discipline

Each task uses TDD for behavior changes, then scoped verification, then exactly one reviewer and one review round. Resolve that review's findings within the same task and stop. Do not begin the next task automatically.

## 3. Dependency order

```text
Task 1 shared surface/tokens
  ├─> Task 2 analytics pilot
  ├─> Task 3 classes pilot
  │     └─> Task 4 classroom + student drill-down
  ├─> Task 7 Live report
  └─> Task 8 regression

Task 5 owner-only answer projection ─> Task 6 question-analysis UI ─> Task 8
Tasks 2, 3, 4 and 7 ────────────────────────────────────────────> Task 8
```

Task 5 is the only task authorized to expand the server contract. Task 6 is blocked until Task 5's DB, generated type, repository and negative authorization tests pass.

## Task 1 — Shared TeacherWorkSurface and teacher-local tokens

### Goal and non-goals

Implement the approved tactical-observatory shell: bounded scene header, quiet work canvas, shared typography/spacing/material roles and responsive fixed TeacherMenu offsets. Keep the existing `TeacherWorkSurface` and `TeacherMenu` interfaces small.

Do not change navigation destinations, avatar upload, sign-out confirmation, AppShell, router, global tokens, global CSS or dependencies. Do not build page-specific analytics or roster layouts here.

### Ownership and expected paths

- Modify `src/features/teacher-content/components/teacher-work-surface.tsx`
- Modify `src/features/teacher-content/components/teacher-menu.tsx` only if shared semantics require it
- Modify `src/features/teacher-content/components/teacher-menu.test.tsx`
- Modify `src/features/teacher-content/teacher-workspace.css`
- Modify `src/features/teacher-content/teacher-workspace-mobile.css`
- Add a focused `teacher-work-surface.test.tsx` beside the module if state semantics lack direct coverage
- Modify teacher harness composition only in `src/features/teacher-content/pages/teacher-routes.harness.tsx` when required to expose states

### Existing modules to reuse

Reuse `AuthenticatedTeacherMenu`, `TeacherMenu`, `TeacherWorkSurface`, `Icon`, current state union, current avatar hook/repository and sign-out handler. Preserve the `menu`, `title`, `subtitle`, `eyebrow`, `toolbar`, `variant` and `state` interface unless a failing test proves a minimal additive field is necessary.

### Data and trust boundary

No data-contract change. Identity and avatar continue through existing authenticated modules. The surface displays state supplied by route adapters and performs no statistics, authorization or persistence.

### Desktop and mobile behavior

- Desktop: 240px fixed teacher navigation, bounded 164-200px scene header and 24-32px work-canvas inset.
- Mobile: fixed identity bar and bottom navigation with safe-area offsets; content reserves both regions. Header remains 116-180px and toolbar wraps below title without overlap.
- 320px and 393px must have no page-level horizontal overflow.

### States and accessibility

Loading has `role="status"`; error has `role="alert"` and optional 44px retry; empty remains distinguishable from loading. Toolbar and content remain in DOM/focus order. Preserve semantic `aside`, labelled navigation, one `h1`, decorative scene alt behavior, visible `:focus-visible`, WCAG 2.2 AA targets and reduced motion.

### Related contracts / future phase-gate traceability

Task-level checks relate to AC-UI-003, AC-UI-004, AC-UI-006, AC-UI-007, AC-UI-013, AC-UI-015, AC-A11Y-001, AC-A11Y-004 and AC-A11Y-005. AC-UI-001 remains future phase-gate-only; AC-A11Y-003 contributes keyboard principles only. AC-UI-008 is not claimed.

### TDD and verification

RED:

- Add RTL assertions for loading/empty/error/retry semantics, single page title, toolbar order and stable TeacherMenu labels.
- Add harness assertions that fixed navigation, header boundary, 44px controls and 320/393 overflow fail against the pre-task composition.

GREEN:

- Implement only the shared shell and teacher-local CSS required by those tests.
- Keep page-specific selectors out of shared files.

Commands:

```bash
pnpm exec vitest run src/features/teacher-content/components/teacher-menu.test.tsx src/features/teacher-content/components/teacher-work-surface.test.tsx
pnpm exec eslint src/features/teacher-content/components/teacher-work-surface.tsx src/features/teacher-content/components/teacher-menu.tsx src/features/teacher-content/components/teacher-menu.test.tsx
pnpm typecheck
pnpm exec playwright test tests/e2e/teacher-routes.harness.spec.ts --config=playwright.teacher-routes-harness.config.ts --project=chromium --grep "workspace is consistent"
git diff --check
```

### Stop checkpoint

Report exact files, before/after interface, commands and results. One reviewer checks shared/page leakage, focus/state semantics, fixed offsets and 500-line limits. Resolve once, rerun scoped checks and stop for owner approval.

## Task 2 — Teaching analytics pilot

### Goal and non-goals

Apply the approved family A hierarchy to `/teacher`: compact filter operation deck, conclusion-first class overview, question analysis as the primary detail and recent Live sessions as supporting content.

Do not change filter meaning, query keys, repositories, server projections, completion rules, route or Live-history pagination. Do not invent charts or metrics.

### Ownership and expected paths

- Modify `src/features/teacher-content/pages/teacher-analytics-page.tsx`
- Modify `src/features/teacher-content/components/teacher-analytics-v2-panels.tsx`
- Modify `src/features/teacher-content/pages/teacher-analytics-page.test.tsx`
- Modify `src/features/teacher-content/teacher-analytics.css`
- Modify `src/features/teacher-content/teacher-analytics-data.css`
- Modify `src/features/teacher-content/teacher-analytics-mobile.css`
- Modify analytics scenarios in `src/features/teacher-content/pages/teacher-routes.harness.tsx`
- Modify `tests/e2e/teacher-analytics.harness.spec.ts`

Split analytics page/panels before either exceeds 500 lines; prefer page-local modules such as `components/teacher-analytics-filter-deck.tsx` and `components/teacher-analytics-question-insight.tsx` over a larger route file.

### Existing modules to reuse

Reuse `TeacherWorkSurface`, `AuthenticatedTeacherMenu`, `useOwnedClassrooms`, teacher content filter hooks, `useTeacherClassroomOverview`, `useTeacherAssessmentQuestions`, `useTeacherChapterCompletion`, `useTeacherLiveHistory`, `GamePager`, existing source selection and existing route links/handlers.

### Data and trust boundary

All figures remain server-backed. Chapter completion remains the existing server rule; Live contributes only to analysis, not chapter completion. Rates retain their actual denominator. Null and zero are distinct. No client-derived mastery, participation rate or class denominator.

### Desktop and mobile behavior

- Desktop first screen: compact filter deck, three-part conclusion strip, then a larger question-analysis region beside recent Live history.
- Mobile: valid selection is summarized while filter fields can disclose; question and Live rows become sequential disclosures. No horizontal table compression.

### States and accessibility

Each independent query region shows loading/empty/error/retry without blanking the persistent filters. Source tabs use button semantics and selected state beyond color. Dates and selects have programmatic labels. Disclosure controls expose `aria-expanded` and remain 44px. Charts remain absent unless an existing typed metric has a text/table alternative.

### Related contracts / future phase-gate traceability

Task-level checks relate to AC-TCH-001, AC-TCH-009, AC-AUTH-005, AC-AUTH-006, AC-UI-003, AC-UI-004, AC-UI-006, AC-UI-007, AC-UI-015, AC-A11Y-001 and AC-A11Y-004. AC-UI-001 remains future phase-gate-only; AC-A11Y-003 contributes keyboard principles only.

### TDD and verification

RED:

- Add RTL tests for first-screen ordering, region-local error/retry, honest nulls, source selection and unchanged query inputs.
- Add browser assertions for desktop hierarchy, mobile filter disclosure, mobile Live/question rows, keyboard order, 44px and no 320/393 overflow.

GREEN:

- Recompose existing panels and CSS; keep every existing hook and handler as the page adapter's source.

Commands:

```bash
pnpm exec vitest run src/features/teacher-content/pages/teacher-analytics-page.test.tsx src/features/teacher-content/api/teacher-content-repository.test.ts
pnpm exec eslint src/features/teacher-content/pages/teacher-analytics-page.tsx src/features/teacher-content/components/teacher-analytics-v2-panels.tsx src/features/teacher-content/pages/teacher-analytics-page.test.tsx
pnpm typecheck
pnpm exec playwright test tests/e2e/teacher-analytics.harness.spec.ts --config=playwright.teacher-routes-harness.config.ts --project=chromium
git diff --check
```

### Stop checkpoint

Report data-source preservation and viewport results. One reviewer checks fake metrics, query drift, mobile disclosure, null/zero handling and page/shared CSS leakage. Resolve once and stop.

## Task 3 — Classroom management pilot

### Goal and non-goals

Implement the approved compact class roster and class-creation operation strip. Preserve direct class-name entry and server creation semantics.

Do not add a required persistent visual label, rotate-code behavior, class editing, new repository methods or route changes. Do not infer ambiguous creation success.

### Ownership and expected paths

- Modify `src/features/classrooms/pages/teacher-classrooms-page.tsx`
- Modify `src/features/classrooms/pages/teacher-classrooms-page.test.tsx`
- Modify `src/features/classrooms/pages/teacher-classrooms-workspace.css`
- Modify classes scenario in `src/features/teacher-content/pages/teacher-routes.harness.tsx`
- Modify class assertions in `tests/e2e/teacher-routes.harness.spec.ts`

### Existing modules to reuse

Reuse `useOwnedClassrooms`, `useCreateClassroom`, `ClassroomRepository`, RHF/Zod validation, existing ambiguous-write copy, clipboard handler, `GamePager`, `TeacherWorkSurface`, `Chip` and existing detail/analytics links.

### Data and trust boundary

Class count, member count, join code and creation date come from `OwnedClassroom`. Creating a class remains the server-authoritative `create_classroom` mutation. The client validates input shape only and does not invent a receipt after an ambiguous write.

### Desktop and mobile behavior

- Desktop: bounded creation strip followed by a compact roster; avoid oversized cards and repeated frames.
- Mobile: class summary row shows name and student count; expansion reveals join code and existing actions. Clipboard failure leaves visible text manually copyable.

### States and accessibility

The class-name input has stable accessible name `新班級名稱`; placeholder, if used, is not its only name. Preserve field error, submit error, pending label, disabled button, stable width and 44px targets. List loading/error/retry uses the shared surface; empty explains that no class exists without a fake zero card. Expansion exposes `aria-expanded` and focus remains stable.

### Related contracts / future phase-gate traceability

Task-level checks relate to AC-AUTH-005, AC-AUTH-006, AC-UI-003, AC-UI-004, AC-UI-006, AC-UI-007, AC-UI-015, AC-A11Y-001 and AC-A11Y-004. Input/action grouping and keyboard viewport checks borrow AC-UI-009/010 principles only; they cannot complete those criteria. AC-A11Y-003 contributes keyboard principles only.

### TDD and verification

RED:

- Add RTL tests for accessible input naming without depending on placeholder, invalid input, pending/disabled, ambiguous write, empty and mobile disclosure semantics.
- Add browser checks for 393 composition, keyboard focus, 44px and input/action visibility under the harness viewport.

GREEN:

- Recompose the page and CSS while preserving the existing form handler, repository mutation and link targets.

Commands:

```bash
pnpm exec vitest run src/features/classrooms/pages/teacher-classrooms-page.test.tsx src/features/classrooms/api/classroom-repository.test.ts
pnpm exec eslint src/features/classrooms/pages/teacher-classrooms-page.tsx src/features/classrooms/pages/teacher-classrooms-page.test.tsx
pnpm typecheck
pnpm exec playwright test tests/e2e/teacher-routes.harness.spec.ts --config=playwright.teacher-routes-harness.config.ts --project=chromium --grep "classes|classroom management"
git diff --check
```

### Stop checkpoint

Report form semantics, preserved mutation behavior and viewport results. One reviewer checks ambiguous writes, keyboard/mobile composition, dead controls and route drift. Resolve once and stop.

## Task 4 — Classroom detail and student progress

### Goal and non-goals

Implement the family B drill-down rhythm: compact class identity, member roster disclosures, then student identity/four-fact summary/chapter details.

Do not add presence, online/offline, learning-now status, fake avatars, initials fields, new student metrics or N+1 RPC calls. Do not reintroduce percentile, class population, performance grade or remediation severity.

### Ownership and expected paths

- Modify `src/features/classrooms/pages/teacher-classroom-detail-page.tsx`
- Modify `src/features/classrooms/pages/teacher-classroom-detail-page.test.tsx`
- Modify `src/features/classrooms/pages/teacher-student-progress-page.tsx`
- Modify `src/features/classrooms/pages/teacher-student-progress-page.test.tsx`
- Modify `src/features/classrooms/pages/teacher-classrooms-workspace.css`
- Modify `src/features/classrooms/types.ts` only for documentation or a proven existing-field adapter; no new domain field
- Modify classroom/student scenarios in `src/features/teacher-content/pages/teacher-routes.harness.tsx`
- Modify matching assertions in `tests/e2e/teacher-routes.harness.spec.ts`

No new Blook repository call is planned. If a reviewed, already-loaded formal asset catalog can map `activeBlookId` without new I/O, a small teacher-local adapter may be added under `src/features/classrooms/lib/`; otherwise imagery is omitted.

### Existing modules to reuse

Reuse `useOwnedClassroomMembers`, `useOwnedClassrooms`, `useStudentProgress`, `ClassroomRepository`, `ClassroomMember`, `StudentProgressSnapshot`, `TeacherWorkSurface`, `Chip`, existing back/detail links and existing chapter status formatter.

### Data and trust boundary

- `membershipStatus` means membership eligibility only. Use「有效」or no badge for `active`; use「已停用」for `inactive`. Never render「學習中」、「離線」or presence.
- Student imagery only comes from `activeBlookId` plus a formal asset mapping already available to the slice. Unknown/missing mapping means no image.
- Student summary is exactly `classRank`, `classXp`, `avgAccuracy`, and `unfinishedMistakeCount / totalMistakeCount`. Null is an em dash. Do not use `openMistakeCount` as a fifth summary or derive subjective labels.
- Keep the current one member-list RPC and one selected-student progress RPC. Do not call per member.

### Desktop and mobile behavior

- Classroom desktop: identity strip and one full-width roster table. Mobile: name, school id and membership state in summary; nickname and 查看細節 in expansion.
- Student desktop: four-fact summary then chapter table. Mobile: chapter/status/combined accuracy summary with review completion and source accuracies on expansion.

### States and accessibility

Both routes retain loading, empty, permission/error and retry. Inactive notice is textual. Disclosure controls expose `aria-expanded`; tables retain captions; chapter nulls remain readable. Back action and 查看細節 are 44px with visible focus. Omitted imagery creates no empty or unlabeled control.

### Related contracts / future phase-gate traceability

Task-level checks relate to AC-AUTH-005, AC-AUTH-006, AC-PROG-006, AC-UI-003, AC-UI-004, AC-UI-006, AC-UI-007, AC-UI-015, AC-A11Y-001 and AC-A11Y-004. AC-A11Y-003 contributes keyboard principles only.

### TDD and verification

RED:

- Add RTL cases proving active/inactive membership copy, absence of presence terms, omission of unknown Blook imagery, exact four metrics, null placeholders and mobile disclosure semantics.
- Add repository-call-count assertions preventing member-by-member RPCs.
- Add browser checks at 1280x900 and 393x852 plus 320px overflow.

GREEN:

- Recompose both route adapters and shared classroom-local CSS. Add an asset adapter only if the formal mapping is already available and covered by tests.

Commands:

```bash
pnpm exec vitest run src/features/classrooms/pages/teacher-classroom-detail-page.test.tsx src/features/classrooms/pages/teacher-student-progress-page.test.tsx src/features/classrooms/api/classroom-repository.test.ts src/features/classrooms/hooks/use-classrooms.test.tsx
pnpm exec eslint src/features/classrooms/pages/teacher-classroom-detail-page.tsx src/features/classrooms/pages/teacher-student-progress-page.tsx src/features/classrooms/pages/teacher-classroom-detail-page.test.tsx src/features/classrooms/pages/teacher-student-progress-page.test.tsx
pnpm typecheck
pnpm exec playwright test tests/e2e/teacher-routes.harness.spec.ts --config=playwright.teacher-routes-harness.config.ts --project=chromium --grep "classroom-detail|student-progress"
git diff --check
```

### Stop checkpoint

Report membership semantics, image decision, RPC count and responsive results. One reviewer checks presence leakage, fake imagery/metrics, null honesty, cross-page CSS and 500-line limits. Resolve once and stop.

## Task 5 — Classroom-owner-only correct-answer RPC/projection

### Goal and non-goals

Implement ADR 0007's narrow, on-demand, server-authoritative teacher answer projection for one stable question in one owned classroom. Keep the existing answer-free `QuestionDetail` and `teacher_question_detail` behavior unchanged, and obey the revised student/public/pre-submit scope of AC-QUIZ-002.

Do not expose answer flags through student Quiz, current Live session state, `teacher_question_detail`, general analytics, Live report or any unrelated payload. Do not implement the visual answer state in this task.

### Ownership and expected paths

- Add `supabase/migrations/20260814000100_teacher_question_answer_detail.sql` or the next migration identifier available at task start; never rename an already-applied migration
- Add `supabase/tests/054_teacher_question_answer_detail.test.sql` or the next collision-free pgTAP filename
- Modify generated `src/types/database.ts` only by the established generation command after migration verification
- Modify `src/features/teacher-content/api/teacher-content-repository.ts`
- Modify `src/features/teacher-content/api/teacher-content-repository.test.ts`
- Modify `src/features/teacher-content/hooks/use-teacher-content.ts`
- Add/update focused hook tests if the answer query's enable/retry contract is not covered by repository tests

This task touches paths otherwise protected in UI tasks because the owner explicitly expanded Phase B for this server slice. It must be implemented as its own checkpoint before Task 6.

### Existing modules to reuse

Reuse the server ownership predicate used by existing owner-scoped teacher projections, stable question identity, Supabase typed client, `TeacherContentError`, `retryRead`, repository dependency injection and TanStack Query conventions. Do not reuse or widen the answer-free schema.

### Data contract and trust boundary

Define ADR 0007's dedicated interface with only classroom identity and stable question identity as input. Its result is the narrow `options[]` of `option_key`, `option_text`, `is_correct`, mapped to a separate teacher-only TypeScript type with `options[].isCorrect`. Do not add prompt or another shared question field to this answer seam.

Server behavior:

- authenticate with `auth.uid()`;
- verify teacher role and that caller owns `p_classroom_id`;
- resolve only the requested published `section_quiz` stable question available to that teacher report context;
- return no row or a generic permission denial without leaking existence when authorization fails;
- revoke from `public`/`anon`, grant only the minimum authenticated execution needed while enforcing ownership inside the function;
- never use `security definer` without a fixed `search_path` and explicit owner check.

Required negative matrix: anonymous, student, non-owner teacher on the same requested identifier, Teacher B crossing into Teacher A classroom and owner requesting a question outside the authorized classroom/report context. All fail closed. A same-classroom owner succeeds.

### Desktop/mobile and states

No visual implementation. The new hook is disabled until both classroom ID and stable code exist. Pending/error/denied remain data states for Task 6; it returns no synthetic answer.

### Accessibility

Not directly applicable to the server slice. Task 6 owns visual semantics. Preserve generic error mapping so UI does not expose security details.

### Related contracts / future phase-gate traceability

ADR 0007 governs this task. Task-level checks relate to revised AC-QUIZ-002, AC-AUTH-004, AC-AUTH-005, AC-AUTH-006, AC-PROG-006 and AC-SEC-003. They do not mark any criterion PASS; endpoint/role/ownership/stage network evidence remains for a future phase gate.

### TDD and verification

RED:

- Write pgTAP positive owner and all cross-role/cross-class negative cases before the migration.
- Add repository tests that the new Zod schema requires `is_correct`, maps it only to the new teacher-only type and rejects malformed responses.
- Add contract searches/assertions proving `is_correct` is still absent from existing answer-free `QuestionDetail`, student Quiz and active Live payload schemas.

GREEN:

- Add the narrow function, regenerate types, implement one repository method and one hook/query key.
- Do not edit Task 6 UI.

Commands:

```bash
SUPABASE_TELEMETRY_DISABLED=1 pnpm exec supabase db reset --local
SUPABASE_TELEMETRY_DISABLED=1 pnpm exec supabase test db --local
bash tests/contracts/database-types.test.sh
pnpm exec vitest run src/features/teacher-content/api/teacher-content-repository.test.ts
pnpm exec eslint src/features/teacher-content/api/teacher-content-repository.ts src/features/teacher-content/api/teacher-content-repository.test.ts src/features/teacher-content/hooks/use-teacher-content.ts
pnpm typecheck
git diff --check
```

If a focused hook test file is added, include its exact path in the Vitest command. No staging/production command.

### Stop checkpoint

Report migration/function name, typed result, grants, positive/negative test matrix, generated-type diff and explicit forbidden-payload checks. One reviewer reviews only this server slice for IDOR, role/class leakage, `security definer`, answer propagation and type integrity. Resolve one round, rerun DB/repository/type checks and stop. Task 6 remains blocked until owner accepts this checkpoint.

## Task 6 — Question-analysis UI with authoritative answers

### Goal and non-goals

Implement the approved family B question-analysis composition and show the correct answer in an expanded question only through ADR 0007 and Task 5's dedicated hook. Continue to obey revised AC-QUIZ-002 for every student/public/pre-submit path.

Do not change routes, source tabs, error-rate ordering, existing answer-free `QuestionDetail`, general analytics payloads or server authority. Do not render a guessed answer while Task 5 is pending/error/denied.

### Ownership and expected paths

- Modify `src/features/teacher-content/pages/teacher-question-analysis-page.tsx`
- Modify `src/features/teacher-content/pages/teacher-question-analysis-page.test.tsx`
- Modify question-analysis selectors in `src/features/teacher-content/teacher-analytics-data.css`
- Modify mobile selectors in `src/features/teacher-content/teacher-analytics-mobile.css`
- Modify questions scenario in `src/features/teacher-content/pages/teacher-routes.harness.tsx`
- Modify question assertions in `tests/e2e/teacher-analytics.harness.spec.ts` and/or `tests/e2e/teacher-routes.harness.spec.ts`

Task 5 owns repository/hook/type files. Task 6 consumes them and must not widen them.

### Existing modules to reuse

Reuse `useTeacherAssessmentQuestions`, existing chapter/subtopic grouping, existing answer-free `useTeacherQuestionDetail` for prompt/options if still needed, Task 5's owner-only answer hook, `TeacherWorkSurface`, native details/disclosure behavior and current 查看/收合 handler.

### Data and trust boundary

Error rate and ordering remain from existing typed analysis. Correct state and correct-answer label come only from Task 5. If the answer query is disabled, pending, empty, error or denied, display the normal answer-free question detail without correct marking and optionally a generic unavailable status; never color, reorder or infer options.

### Desktop and mobile behavior

- Desktop: unboxed chapter heading, compact subtopic disclosures, then order/code/prompt/error rate/action table. Expanded row contains options and authoritative correct marking.
- Mobile: question summary contains order/code, prompt and error rate; 44px 查看/收合 reveals options. Correct option has explicit text/icon in addition to gold/yellow styling.

### States and accessibility

Preserve page loading/empty/error/retry. Answer-detail loading is localized to the expanded row. Use `aria-expanded`, stable control names, one active expansion state if that is current behavior and textual「正確答案」semantics. Focus remains on the triggering control after load/collapse. Color never carries correctness alone.

### Related contracts / future phase-gate traceability

ADR 0007 governs answer display. Task-level checks relate to revised AC-QUIZ-002, AC-AUTH-005, AC-AUTH-006, AC-UI-003, AC-UI-004, AC-UI-006, AC-UI-007, AC-UI-015, AC-A11Y-001 and AC-A11Y-004. AC-A11Y-003 contributes keyboard principles only.

### TDD and verification

RED:

- Add RTL cases for authoritative correct marking, no marking during pending/error/denied, no option reorder, answer-free fallback and keyboard disclosure.
- Add browser assertions for explicit correct label/icon, desktop table, mobile disclosure, focus, 44px and overflow.

GREEN:

- Recompose the page and CSS, consuming only the Task 5 interface.

Commands:

```bash
pnpm exec vitest run src/features/teacher-content/pages/teacher-question-analysis-page.test.tsx src/features/teacher-content/api/teacher-content-repository.test.ts
pnpm exec eslint src/features/teacher-content/pages/teacher-question-analysis-page.tsx src/features/teacher-content/pages/teacher-question-analysis-page.test.tsx
pnpm typecheck
pnpm exec playwright test tests/e2e/teacher-analytics.harness.spec.ts tests/e2e/teacher-routes.harness.spec.ts --config=playwright.teacher-routes-harness.config.ts --project=chromium --grep "question|題目"
git diff --check
```

### Stop checkpoint

Report Task 5 dependency SHA/state, answer-source proof, fallback states and responsive results. One reviewer checks inference/leakage, accessible correctness, focus, mobile composition and unchanged answer-free interface. Resolve once and stop.

## Task 7 — Live course report

### Goal and non-goals

Implement family C debrief-first composition: participant count, overall accuracy, hardest question and top three before detailed questions, matrix/export and remaining ranking.

Do not change Live session/report RPCs, repository types, CSV semantics, ranking authority, LivePresenter, active Live payloads or route. Do not add metrics not derivable from the loaded report.

### Ownership and expected paths

- Modify `src/features/live/pages/teacher-live-report-page.tsx`
- Modify `src/features/live/pages/teacher-live-report-page.test.tsx`
- Modify `src/features/live/pages/teacher-live-report-page.css`
- Add a page-local pure summary module and test, for example `src/features/live/lib/teacher-live-report-summary.ts` and `.test.ts`, to keep the route under 500 lines
- Modify live-report scenario in `src/features/teacher-content/pages/teacher-routes.harness.tsx`
- Modify live-report assertions in `tests/e2e/teacher-routes.harness.spec.ts`

### Existing modules to reuse

Reuse `useLiveSessionDetail`, `LiveSessionDetail`, `TeacherWorkSurface`, `buildMatrixCsv`, `matrixCellLabel`, existing download handler, ranking data and current report route/back link.

### Data and trust boundary

The pure summary module accepts `LiveSessionDetail` and applies exactly:

- participants = `report.participants.length`;
- overall accuracy = `sum(question.correct) / sum(question.answered) * 100`, omitted when total answered is zero;
- hardest question = first report-order question having the minimum non-null `correctRate`, omitted when none;
- top three = entries from `report.ranking` whose authoritative rank is 1-3, ordered by rank; never recompute from score or participants.

No data becomes fake zero. No backend field is added. Tie handling preserves report question order.

### Desktop and mobile behavior

- Desktop first screen contains debrief summary and top three, followed by question analysis, bounded answer matrix/CSV and remaining ranking.
- Mobile podium uses a shared baseline with first center/highest, second left/lower and third right/lowest; rank text remains explicit. Question rows become disclosures. Matrix alone scrolls horizontally inside a labelled boundary with an edge cue/sticky identity column where feasible.

### States and accessibility

Retain report loading, unavailable/error and retry when the existing query permits refetch; empty/partial summaries are omitted individually. Podium DOM/focus order remains rank order even if CSS places first in the center. Matrix has an accessible name; CSV is in the same operation group. Disclosures expose `aria-expanded`. No rank/status relies on placement or color alone.

### Related contracts / future phase-gate traceability

Task-level checks relate to AC-AUTH-005, AC-AUTH-006, AC-UI-003, AC-UI-004, AC-UI-006, AC-UI-007, AC-UI-015, AC-A11Y-001 and AC-A11Y-004. AC-UI-001 remains future phase-gate-only; AC-A11Y-003 contributes keyboard principles only.

### TDD and verification

RED:

- Unit-test all four derivations, zero answered, all-null `correctRate`, ties, incomplete ranking and no-data omission.
- RTL-test section order, matrix/export preservation, mobile disclosure semantics and no fake zero.
- Browser-test podium baseline/height order, bounded matrix overflow and 393/320 document width.

GREEN:

- Add the pure summary module, recompose the page and update page-local CSS only.

Commands:

```bash
pnpm exec vitest run src/features/live/lib/teacher-live-report-summary.test.ts src/features/live/pages/teacher-live-report-page.test.tsx src/features/live/lib/report-export.test.ts
pnpm exec eslint src/features/live/lib/teacher-live-report-summary.ts src/features/live/lib/teacher-live-report-summary.test.ts src/features/live/pages/teacher-live-report-page.tsx src/features/live/pages/teacher-live-report-page.test.tsx
pnpm typecheck
pnpm exec playwright test tests/e2e/teacher-routes.harness.spec.ts --config=playwright.teacher-routes-harness.config.ts --project=chromium --grep "live-report|Live report"
git diff --check
```

### Stop checkpoint

Report formulas, omitted states, matrix/CSV preservation and viewport results. One reviewer checks derivation drift, ranking authority, fake zeros, matrix containment, semantics and 500-line limits. Resolve once and stop.

## Task 8 — Scoped regression and browser verification

### Goal and non-goals

Verify the integrated six-page Phase B result without changing behavior to make checks green. This task may claim only scoped regression results; it is neither an acceptance nor Phase 8 release gate.

Do not run `pnpm acceptance`, deploy, write hosted services, alter snapshots without owner approval, weaken assertions, skip failures or edit student/AppShell/shared router code.

### Ownership and expected paths

- Modify `tests/e2e/teacher-routes.harness.spec.ts` only for missing cross-route behavior assertions identified by the approved plan
- Modify `tests/e2e/teacher-analytics.harness.spec.ts` only for analytics-specific coverage
- Modify `playwright.teacher-routes-harness.config.ts` only if a bounded verification need cannot be expressed by CLI; otherwise leave it unchanged
- No product file is expected

### Existing modules to reuse

Reuse `teacher-routes.harness`, existing seven scenarios, runtime-error observer, viewport assertions, current Vitest suites, local Supabase test scripts and existing Playwright configuration.

### Data and trust boundary

Verification must distinguish harness composition from production truth. Re-run Task 5's real local DB authorization tests. Assert answer fields are absent from answer-free/student/active-Live interfaces and only present in the dedicated teacher owner projection. No hosted DB or Supabase operation.

### Desktop and mobile behavior

Check all six pages at 1280x900 and 393x852. Add 320px overflow smoke and acceptance-aligned 375x812/1440x900 checks for representative teacher analytics/table routes. Verify fixed TeacherMenu across long pages, no whole-page horizontal overflow, mobile disclosures and bounded Live matrix.

### States and accessibility

Cycle content, loading, empty, error/retry, pending/disabled where the harness supports them; add deterministic harness states only when they exercise an existing formal interface and never as product data. Verify keyboard-only navigation, focus order/visibility, 44px controls, explicit status labels, reduced motion and console/page errors.

### Related contracts / future phase-gate traceability

Scoped regression relates to AC-TCH-001, AC-TCH-009, AC-AUTH-004, AC-AUTH-005, AC-AUTH-006, revised AC-QUIZ-002, AC-PROG-006, AC-UI-003, AC-UI-004, AC-UI-006, AC-UI-007, AC-UI-013, AC-UI-015, AC-A11Y-001, AC-A11Y-004 and AC-A11Y-005. AC-UI-001/005 remain future phase-gate-only. AC-A11Y-003 and AC-UI-009/010 contribute principles only. AC-UI-008 is not claimed.

### TDD and verification

RED:

- Before any production change in this task, add only missing regression assertions and confirm they expose a real uncovered contract. Do not manufacture a failing test for already-covered behavior.

GREEN:

- Task 8 should normally require no product edit. If regression finds a defect, stop and return it to the owning task rather than fixing across ownership boundaries here.

Commands:

```bash
pnpm exec vitest run src/features/teacher-content/api/teacher-avatar-repository.test.ts src/features/teacher-content/api/teacher-content-repository.test.ts src/features/teacher-content/components/teacher-menu.test.tsx src/features/teacher-content/pages/teacher-analytics-page.test.tsx src/features/teacher-content/pages/teacher-question-analysis-page.test.tsx src/features/classrooms/pages/teacher-classroom-detail-page.test.tsx src/features/classrooms/pages/teacher-classrooms-page.test.tsx src/features/classrooms/pages/teacher-student-progress-page.test.tsx src/features/live/pages/teacher-live-report-page.test.tsx src/features/live/lib/teacher-live-report-summary.test.ts
pnpm exec eslint src/features/teacher-content src/features/classrooms/pages/teacher-classroom-detail-page.tsx src/features/classrooms/pages/teacher-classrooms-page.tsx src/features/classrooms/pages/teacher-student-progress-page.tsx src/features/live/pages/teacher-live-report-page.tsx src/features/live/lib/teacher-live-report-summary.ts tests/e2e/teacher-analytics.harness.spec.ts tests/e2e/teacher-routes.harness.spec.ts
pnpm typecheck
SUPABASE_TELEMETRY_DISABLED=1 pnpm exec supabase test db --local
pnpm exec playwright test tests/e2e/teacher-analytics.harness.spec.ts tests/e2e/teacher-routes.harness.spec.ts --config=playwright.teacher-routes-harness.config.ts --project=chromium
git diff --check
```

Do not run `pnpm acceptance`. A timeout, environment denial or skipped check is not green; report it as not verified.

### Stop checkpoint

Report the scoped regression matrix by page, viewport, state, role and result; list any non-green command honestly and do not label the result an AC PASS. One reviewer performs the single integrated review for cross-route consistency, trusted answer isolation, data honesty, accessibility, responsive behavior, protected-path drift and 500-line limits. Resolve only findings within the approved Phase B ownership, rerun scoped checks and stop for owner acceptance.

## 4. Owner decision gates

No owner decision is currently required to approve this plan.

If implementation proves any of the following unavoidable, stop and request one owner decision rather than broadening scope:

- shared AppShell, global tokens/CSS, router or dependency changes;
- a new server field beyond the dedicated correct-answer projection;
- a new Blook asset query or repository method;
- a route or formal operation-semantic change;
- a visual snapshot baseline update outside the scoped teacher harness.

## 5. Planned path ownership summary

Shared teacher-only paths:

- `src/features/teacher-content/components/teacher-work-surface.tsx`
- `src/features/teacher-content/components/teacher-menu.tsx` and focused tests
- `src/features/teacher-content/teacher-workspace*.css`
- `src/features/teacher-content/pages/teacher-routes.harness.tsx`
- `tests/e2e/teacher-{analytics,routes}.harness.spec.ts`

Page-specific paths:

- Analytics: `src/features/teacher-content/pages/teacher-analytics-page*`, `components/teacher-analytics-*`, `teacher-analytics*.css`
- Classes/drill-down: `src/features/classrooms/pages/teacher-{classrooms,classroom-detail,student-progress}-page*`, `teacher-classrooms-workspace.css`
- Questions: `src/features/teacher-content/pages/teacher-question-analysis-page*` and page-local analytics CSS selectors
- Live report: `src/features/live/pages/teacher-live-report-page*`, its CSS and `src/features/live/lib/teacher-live-report-summary*`

Explicit server-slice paths for Task 5 only:

- one new migration and one new pgTAP file
- generated `src/types/database.ts`
- `src/features/teacher-content/api/teacher-content-repository*`
- `src/features/teacher-content/hooks/use-teacher-content*`

Protected paths remain excluded unless an owner gate opens them.
