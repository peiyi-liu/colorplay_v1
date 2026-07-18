# Phase 6: Teacher Content, Import, and Analytics

**Baseline:** `53698ab` (Phase 5 closed; staging live; teacher login portal shipped). Worktree clean at plan commit.
**Exit ACs (9):** `AC-TCH-001`–`AC-TCH-009`, plus 45-question baseline preservation (`AC-MIG-003`).
**Authoritative sources:** spec/06 §6 (XLSX 範本三工作表與欄位), §7–9 (validation/versioning/publication), spec/03 §content_versions/content_publication_events, design §11 (analytics views, em-dash rule, reproducible fact queries), acceptance/ACCEPTANCE_CRITERIA.md AC-TCH-001–009.

## Scope decisions (approved defaults)

- Content stays a single shared curriculum: every CRUD/publish command requires the teacher role and records `created_by`; cross-teacher denial applies to classroom-scoped analytics (owner-only), not curriculum rows. Kahoot `external_activities` management is teacher-owned per spec §15.
- Versioning: publishing a semantic change to a published question/review card bumps `version`, snapshots the frozen payload into `content_versions`, and appends to `content_publication_events`. Historical sessions already freeze versions; progress denominators already follow current versions (Phase 5), so no progress change is needed.
- XLSX parsing happens client-side with SheetJS for preview; the trusted `commit_content_import` RPC re-validates every row server-side inside one transaction and writes an `import_reports` row (staged → committed/failed). The server never trusts the client's validation verdict.
- XSS defense is layered: server rejects rows containing `<script` (and `on*=` handler patterns) in text fields with a per-row error; React text rendering stays the only render path (no `dangerouslySetInnerHTML` anywhere — contract-pinned).
- Import is additive-or-versioning: existing stable codes update as new versions (or no-op when identical); the verified 45-question baseline's stable codes can never be deleted by import. Deletion stays out of scope this phase (archive only).
- The sheet importer (`pnpm content:import`) remains the owner's bulk path; the XLSX flow is the in-app teacher path. Both converge on the same validation rules module.
- Analytics ship as the five spec views/RPCs with classroom/date/chapter/subtopic filters, `Asia/Taipei` date boundaries, and `—` for empty denominators; every number must be reproducible by an independent SQL query in pgTAP.

## Tasks

### Task 1 — Pin import/versioning rules (S)

- [x] **Step 1:** In spec/06 pin: import upsert-by-stable-code semantics (identical row → no-op, changed row → new version), the server-side script/handler rejection rule, and the import report shape (total/valid/errors/warnings + per-row sheet/row/field/code/message). No other spec change.
- [x] **Step 2:** Commit `docs: pin teacher import and versioning rules`.

### Task 2 — Versioning and publication schema (M)

- [x] **Step 1:** Failing pgTAP `026_content_versions`: `content_versions` (content type/id, version, frozen payload jsonb, hash, status, creator, timestamps; unique (content_type, content_id, version)) and `content_publication_events` (append-only publish/archive history with actor and request id); RLS teacher-read only; no direct mutation grants; anon denied.
- [x] **Step 2:** RED. **Step 3:** migration `20260719000100_content_versions.sql`. **Step 4:** GREEN + lint + typecheck. **Step 5:** Commit `feat: add content version history`.

### Task 3 — Teacher content commands (L)

- [x] **Step 1:** Failing pgTAP `027_teacher_content`: `upsert_question_draft`, `publish_question`, `archive_question`, `upsert_review_card_draft`, `publish_review_card`, `archive_review_card` — teacher-role only (students denied with generic errors), drafts invisible to students (existing RLS regression), publish bumps version + snapshots into `content_versions` + appends an event, editing the correct option of a published question creates a new version while an in-flight session still finalizes and displays against its frozen version (drive a session across the bump), archive hides from students without touching history, script/handler payloads rejected with `CONTENT_UNSAFE_TEXT`.
- [x] **Step 2:** RED. **Step 3:** migration `20260719000200_teacher_content_commands.sql`. **Step 4:** GREEN + 003/014/020–025 regression + lint + typecheck. **Step 5:** Commit `feat: add teacher content commands`.

### Task 4 — Shared validation rules and XLSX codec (M)

- [x] **Step 1:** Failing unit tests for `scripts/content/validation-rules.mjs` (extracted from the importers: code format, prompt/option/explanation caps, answer-in-options, duplicate detection, script rejection — one module now serving sheet import, XLSX import, and mirrored server checks) and for `src/features/teacher-content/api/xlsx-codec.ts` (SheetJS: template workbook has exactly the three spec sheets 章節/複習卡/題庫 with the spec column headers; parse returns typed rows + per-row errors incl. missing sheet, duplicate 題號, empty prompt, zero/two correct answers, oversized row count cap 500, unsafe script text; malformed file → clean error).
- [x] **Step 2:** RED. **Step 3:** implement (add `xlsx` dependency; refactor `import-questions.mjs`/`import-review-cards.mjs` onto the shared rules without changing outputs — regenerated files must be byte-identical). **Step 4:** GREEN + content-import contract regression + lint + typecheck. **Step 5:** Commit `feat: add shared content validation and xlsx codec`.

### Task 5 — Trusted import commands (L)

- [x] **Step 1:** Failing pgTAP `028_content_import`: `import_reports` table (teacher, filename, counts, status staged/committed/failed, per-row errors jsonb, timestamps; RLS own-teacher read) and `commit_content_import(p_rows jsonb, p_request_id, p_filename)` — teacher-only, idempotent by request id, re-validates every row server-side (invalid correct answer such as `X`/blank/points-at-empty-option → per-row error and **no row committed**, never defaulting to A), valid rows upsert chapters/sections/subtopics/questions/options/review cards by stable code with version bumps through the Task 3 machinery, the whole commit is one transaction (fault-injection trigger proves zero partial rows and a `failed` report), the 45 baseline stable codes survive any import, and student visibility only changes at publish.
- [x] **Step 2:** RED. **Step 3:** migration `20260719000300_content_import.sql`. **Step 4:** GREEN + full `pnpm test:db` + lint + typecheck. **Step 5:** Commit `feat: add transactional content import`.

### Task 6 — Analytics projections (L)

- [x] **Step 1:** Failing pgTAP `029_teacher_analytics`: `teacher_classroom_summary` (attempts, unique students, average accuracy, worst subtopic), `teacher_question_analysis`, `teacher_subtopic_mastery`, `teacher_assignment_summary`, `teacher_live_session_report` — all owner-classroom-scoped (other teachers/outsiders read zero rows), filterable by classroom/date range/chapter/subtopic, date boundaries interpreted in `Asia/Taipei` and queried in UTC (assert a boundary case both sides of midnight), empty denominators return null (— in UI) never a misleading zero, and every metric equals an independent inline SQL recomputation over deterministic seeded facts.
- [x] **Step 2:** RED. **Step 3:** migration `20260719000400_teacher_analytics.sql`. **Step 4:** GREEN + lint + typecheck. **Step 5:** Commit `feat: add authoritative teacher analytics`.

### Task 7 — External activities (S)

- [x] **Step 1:** Failing pgTAP `030_external_activities`: teacher-owned `external_activities` (Kahoot URL, optional classroom/chapter, availability/status; https-only URL check; owner CRUD via commands; students read only available rows of their classrooms).
- [x] **Step 2:** RED. **Step 3:** migration `20260719000500_external_activities.sql`. **Step 4:** GREEN + lint + typecheck. **Step 5:** Commit `feat: add external activity links`.

### Task 8 — Teacher data layer (M)

- [x] **Step 1:** Failing Vitest: `teacher-content` repository (drafts list incl. drafts via teacher read policy, upsert/publish/archive, import staging + commit, report list, analytics queries, external activities) with strict zod and stable error codes; hooks with invalidation. _(Hooks land with the UI tasks that consume them; review-card and external-activity repository methods land with Task 10 where their forms live.)_
- [x] **Step 2:** RED. **Step 3:** implement + regenerate database types. **Step 4:** GREEN + lint + typecheck. **Step 5:** Commit `feat: add teacher content data layer`.

### Task 9 — Teacher dashboard and analytics UI (M)

- [x] **Step 1:** Failing RTL: `/teacher` becomes a real dashboard (summary cards from `teacher_classroom_summary`, worst-subtopic callout, em-dash empty states) and `/teacher/analytics` with classroom/date/chapter/subtopic filters driving the five projections; loading/empty/error states.
- [x] **Step 2:** RED. **Step 3:** implement (lazy routes; nav link 教學分析). **Step 4:** GREEN + lint + typecheck. **Step 5:** Commit `feat: add teacher dashboard and analytics`.

### Task 10 — Content workspace UI (L)

- [x] **Step 1:** Failing RTL: `/teacher/content` — question and review-card lists with draft/published/version badges, draft editor forms (question with 2–4 options + single correct; review card with optional media URL + alt), publish/archive with confirm dialogs and version feedback, per-field validation mirroring the shared rules. _(Included pgTAP 031 + migration 20260719000600: teacher SELECT on draft question options and review card media, students stay published-only.)_
- [x] **Step 2:** RED. **Step 3:** implement. **Step 4:** GREEN + lint + typecheck. **Step 5:** Commit `feat: add teacher content workspace`.

### Task 11 — Import wizard UI (M)

- [x] **Step 1:** Failing RTL: `/teacher/import` — real template download (SheetJS blob), file upload, validation preview table (total/valid/error/warning + per-row sheet/row/field/code/message), commit button disabled while any error exists, commit success report, failed-commit state; XSS sample renders as inert text everywhere.
- [x] **Step 2:** RED. **Step 3:** implement. **Step 4:** GREEN + lint + typecheck. **Step 5:** Commit `feat: add xlsx import wizard`.

### Task 12 — Phase gate tooling (M)

- [x] **Step 1:** Contract tests pin package script `phase:teacher-content` → runner order → finalizer (9 ACs, screenshot names `teacher-dashboard-*`, `import-preview-*`, `content-workspace-*`, an `.xlsx` file artifact validated by re-reading its sheet names in-test, declared enumerated 4xx for the invalid-import negative path); `test:e2e` grep-invert gains 'Teacher Content phase gate'. _(Declared 4xx: a draft upsert colliding with a published stable code → 400 on `upsert_question_draft`; dedicated `contentTeacher`/`contentStudent` seed accounts added.)_
- [x] **Step 2:** RED. **Step 3:** implement runner/finalizer/spec: single spec `Teacher Content phase gate` — teacher downloads the template (artifact saved + re-parsed), edits it in-memory into a valid + an invalid workbook via the shared codec, uploads invalid (per-row errors incl. correct-answer `X`; commit blocked), uploads valid (preview → commit → success), publishes a new question version after a student session froze the old one (history intact), student sees only published content and `window.__xss` stays undefined after a script-bearing draft attempt, dashboard/analytics numbers asserted equal to DB-derived expectations with filters and an empty-state `—`, teacher B/outsider denied, three-viewport screenshots, refresh recovery.
- [x] **Step 4:** GREEN (contract + unit). **Step 5:** Commit `test: add teacher content phase gate`.

### Review and gate

- [x] **Review Step 1:** Complete-range review of `53698ab..HEAD` (exclude generated/lockfile/artifacts). Priorities: import transaction atomicity, version-freezing correctness across the publish boundary, XSS surfaces, teacher-role authorization on every new command, analytics formula exactness and timezone handling, baseline preservation. _(Focused pass per the tiered AGENTS.md flow: zero `dangerouslySetInnerHTML`, every new command behind `assert_content_teacher` + revokes; two minor observations — re-commit after success is an idempotent no-op, media deletion deferred with archive.)_
- [x] **Review Step 2:** Fix Critical/Important findings with focused commits. _(None Critical from the read; the prechecks then surfaced and fixed: deferred option triggers firing as the api role (`security definer`, pgTAP `set constraints all immediate` coverage), column grants hiding explanation/is_correct from the workspace (`teacher_list_questions()` RPC), first-publish feedback, summary metric label, leaderboard settle, exact label match.)_
- [x] **Gate Step 1:** Disposable headless prechecks (evidence in scratchpad, retained on failure); iterate fix→precheck until green. _(9 iterations; final headless PASS 14.8s.)_
- [x] **Gate Step 2:** Clean `GATE_SHA`, run `pnpm phase:teacher-content` once per fix iteration. _(First formal run FAILED: `test:db` ran on content left by the browser run — the runner now resets before the db battery, order re-pinned in the contract with rationale. Second run PASS at `a8d09f7`.)_
- [x] **Gate Step 3:** After PASS close Phase 6 in `.superpowers/sdd/progress.md`, redeploy staging (bootstrap + push), and commit `docs: close teacher content phase`. Reservations to record: media upload to Storage (URL-only this phase), content deletion (archive only), the pending UI restyle against the owner's reference HTML.

## Plan self-review checklist

- Every table/command matches spec/03 and spec/06; the XLSX sheets/columns are exactly spec/06 §6.
- AC-TCH-001–009 each map to a decisive DB proof and a browser proof; AC-MIG-003 (45-question preservation) is asserted in pgTAP 028 and the gate.
- Only trusted commands mutate content; the client never commits its own validation verdict.
- All Phase 1–5 binding conventions are embedded (reset→probe→seed, dedicated accounts, enumerated declared 4xx, closed negative contexts, explicit seed ordering, deterministic content anchors, one review, iterative precheck, formal gate per clean SHA).
