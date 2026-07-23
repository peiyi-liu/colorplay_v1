# ColorPlay Specification and Migration Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: The project owner selected `superpowers:executing-plans` on 2026-07-16. Execute all eight tasks in one session on this worktree; do not use `superpowers:subagent-driven-development` or per-task subagents for this phase. Follow AGENTS.md sections 2 and 8: read only this plan plus the files a task names, never re-read the whole spec suite per task. Keep the task checkboxes current, complete one task per commit, and perform one review after all tasks.

**Goal:** Align the normative ColorPlay specifications, migration records, environment contract, acceptance suite, and project governance with the approved `colorplay-new` integration and Production design before any new product implementation begins.

**Architecture:** Phase 0 is documentation and verification-tooling work. It preserves the verified React/Vite/Supabase implementation, records why insecure legacy behavior is rejected, defines Local/Staging/Production boundaries, expands measurable acceptance coverage, and makes document metadata reproducible. It does not create product source, Supabase migrations, hosted resources, deployments, or acceptance artifacts.

**Tech Stack:** Markdown, JSON, Node.js ESM, Vitest, pnpm, Git.

## Global constraints

- Canonical worktree: `/Users/guanyucheng/Desktop/pei-game/colorplay/.worktrees/colorplay-platform-foundation`.
- Canonical implementation baseline: commit `394c58f` on `feat/playable-vertical-slice`; execute this plan on the approved design commit and its descendants.
- Normative input: `docs/superpowers/specs/2026-07-15-colorplay-new-integration-and-production-design.md`.
- `colorplay-new` and the audited hosted database are reference inputs only. Do not copy source code, SQL, secrets, invalid rows, mock state, hard-coded rankings, or browser-authoritative behavior.
- Existing migrations, completed plans, and `legacy/colorplay-original.html` are immutable.
- Do not create or change `src/**`, `supabase/**`, product tests, remote Supabase resources, GitHub settings, or Vercel settings.
- Do not run `pnpm acceptance`, Foundation Task 16, database tests, E2E tests, headed browsers, screenshots, video, or traces in this phase.
- Documentation tasks follow `AGENTS.md` section 7: use a pre-change failing assertion and a post-change validation, not behavioral RED/GREEN TDD. Task 1 and the acceptance-harness changes in Task 7 are executable tooling and therefore use TDD.
- This plan file starts untracked. Before Task 1, commit it unchanged as `docs: add phase 0 alignment plan`. The manifest generator excludes `docs/superpowers/plans/**`, so this commit never affects manifest checks, and the Task 8 clean-worktree check requires it.
- Every task ends in one focused commit. Do not rewrite already completed commits.
- Never print environment values. Documentation may name `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; it must reject every server secret from the browser boundary.
- Planned acceptance additions total 38 IDs, taking the normative count from 84 to 122 without renaming any existing ID.

---

### Task 1: Add a reproducible document-manifest generator

**Reviewer gate:** Accept only if one command discovers the approved document source set, calculates stable sizes and SHA-256 hashes, counts all unique acceptance headings, writes the manifest, and can fail closed when the checked-in manifest is stale. The implementation must not depend on generated evidence or environment values.

**Files:**

- Create: `scripts/verify/generate-document-manifest.mjs`
- Create: `scripts/verify/generate-document-manifest.d.mts`
- Create: `tests/contracts/document-manifest.test.ts`
- Modify: `package.json`

**Consumes interfaces:**

- Markdown sources selected from `AGENTS.md`, `README.md`, `acceptance/*.md`, `spec/*.md`, `docs/adr/*.md`, `docs/deployment/*.md`, `docs/migration/*.md`, and `docs/superpowers/specs/*.md`.
- Acceptance headings parsed by `countAcceptanceIds()` from `scripts/verify/count-acceptance.mjs`.
- Existing `DOCUMENT_MANIFEST.json` schema fields: package metadata, document counts, acceptance counts, byte total, real-device IDs, and sorted file metadata.

**Produces interfaces:**

- `buildDocumentManifest({ generatedAt, rootDirectory })` returns the complete manifest object without mutating the filesystem.
- `collectDocumentPaths(rootDirectory)` returns normalized, lexicographically sorted repository-relative paths and excludes `docs/superpowers/plans/**`, `.superpowers/**`, generated artifacts, and non-Markdown files.
- CLI modes `--write` and `--check`; `--check` compares all generated fields while preserving the checked-in `generated_at` value for a stable comparison.
- `pnpm document:manifest` and `pnpm document:manifest:check` scripts.

**Corresponding spec / acceptance:** Approved design sections 15–17; `spec/08-testing-and-evidence.md`; `AC-DOC-001`, `AC-DOC-003`.

**Required evidence:** Focused Vitest output, the generated path list asserted by tests, and `git diff --check`. No evidence directory.

- [x] **Step 1: Write the failing contract test**

  Test exact source inclusion/exclusion, sorted output, SHA-256 generation, byte totals, unique acceptance counting, `--check` stale-manifest rejection, and absence of environment values.

  Exercise the generator against temporary fixture directories only. Do not assert that the repository's checked-in `DOCUMENT_MANIFEST.json` is current: it is intentionally regenerated only in Task 7, and the full test suite must stay green between Task 1 and Task 7.

  Run:

  ```bash
  pnpm test -- tests/contracts/document-manifest.test.ts
  ```

  Expected failure: Vitest cannot import `scripts/verify/generate-document-manifest.mjs`.

- [x] **Step 2: Implement the minimum generator and type declaration**

  Use only Node built-ins. `--write` sets an ISO-8601 `generated_at`; tests pass an explicit timestamp. `--check` exits non-zero with `DOCUMENT_MANIFEST_STALE` when any path, count, size, or hash differs. Reject duplicate acceptance headings with `DOCUMENT_ACCEPTANCE_ID_DUPLICATE`. Preserve `real_device_required_criteria` as `AC-UI-010` and `AC-UI-012`.

- [x] **Step 3: Add package scripts and verify success**

  Run:

  ```bash
  pnpm test -- tests/contracts/document-manifest.test.ts
  pnpm lint
  pnpm typecheck
  git diff --check
  ```

  Expected success: focused tests pass, lint/typecheck exit 0, and no whitespace error is reported. Do not run `pnpm document:manifest` yet because later tasks intentionally change the source set.

- [x] **Step 4: Commit**

  ```bash
  git add package.json scripts/verify/generate-document-manifest.mjs scripts/verify/generate-document-manifest.d.mts tests/contracts/document-manifest.test.ts
  git commit -m "test: add document manifest generator"
  ```

---

### Task 2: Record migration decisions and audited legacy inputs

**Reviewer gate:** Accept only if every audited `colorplay-new` capability and content family has a disposition, the legacy database counts and invalid rows are recorded without credentials or personal identifiers, and the ADR makes the clean-Production/rebuilt-Staging decision irreversible without a replacement ADR.

**Files:**

- Create: `docs/adr/0002-colorplay-new-integration-and-production-environments.md`
- Create: `docs/migration/colorplay-new-feature-parity.md`
- Create: `docs/migration/colorplay-new-content-ledger.md`
- Create: `docs/migration/legacy-supabase-inventory.md`

**Consumes interfaces:**

- Approved design sections 2–3 and 11–14.
- Read-only audit facts: 2 Auth users, 2 profiles, 1 wallet, 4 mistake rows, 2 chapters, 3 sections, 3 knowledge points, 46 questions, 179 options, and no attempts/hints/review cards/Kahoot configurations/Storage buckets.
- Verified import baseline: 45 questions, with 37 in chapter 3 and 8 in chapter 4.

**Produces interfaces:**

- ADR decision: new clean Supabase project is Production; the old project becomes Staging only after inventory, destructive reset, migration replay, and synthetic-only reseeding; the repository migrations are the schema authority.
- Feature parity rows with exact columns `Legacy surface`, `Verified behavior`, `Disposition`, `Target route/feature`, `Owning phase`, `Acceptance IDs`, and `Reason`.
- Content ledger rows with exact columns `Content family`, `Source location`, `Candidate count`, `Rights/owner check`, `Validation rule`, `Disposition`, and `Owning phase`.
- Sanitized legacy inventory with table counts, verified security findings, invalid data classes, keep/reject decision, and reset prerequisites.

**Corresponding spec / acceptance:** Approved design sections 2–3, 11, 13–14; `spec/06-content-and-question-bank.md`; `spec/10-migration-roadmap.md`; `AC-MIG-001`–`AC-MIG-005`, `AC-SEC-007`, `AC-DOC-001`.

**Required evidence:** Four-file diff, path/exact-column assertions, secret-name scan, and `git diff --check`. No raw database response and no environment file.

- [x] **Step 1: Run the pre-change failing assertion**

  ```bash
  node - <<'NODE'
  const { existsSync } = require('node:fs');
  const paths = [
    'docs/adr/0002-colorplay-new-integration-and-production-environments.md',
    'docs/migration/colorplay-new-feature-parity.md',
    'docs/migration/colorplay-new-content-ledger.md',
    'docs/migration/legacy-supabase-inventory.md',
  ];
  if (!paths.every(existsSync)) process.exit(1);
  NODE
  ```

  Expected failure: exit 1 because all four records are absent.

- [x] **Step 2: Write the minimum complete records**

  Cover every audited student page, teacher page, cross-cutting behavior, content family, invalid remote row class, security defect, and migration decision from the approved design. Mark operational actions as `NOT EXECUTED` rather than implying remote work occurred. Record audit counts only; omit emails, UUIDs, URLs, keys, tokens, and row payloads.

- [x] **Step 3: Verify structure, completeness, and confidentiality**

  ```bash
  node - <<'NODE'
  const { readFileSync } = require('node:fs');
  const parity = readFileSync('docs/migration/colorplay-new-feature-parity.md', 'utf8');
  const ledger = readFileSync('docs/migration/colorplay-new-content-ledger.md', 'utf8');
  const inventory = readFileSync('docs/migration/legacy-supabase-inventory.md', 'utf8');
  const adr = readFileSync('docs/adr/0002-colorplay-new-integration-and-production-environments.md', 'utf8');
  for (const text of ['Legacy surface', 'Disposition', 'Owning phase', 'Acceptance IDs']) if (!parity.includes(text)) process.exit(1);
  for (const text of ['Content family', 'Candidate count', 'Validation rule', 'Rights/owner check']) if (!ledger.includes(text)) process.exit(1);
  for (const text of ['46', '179', '45', 'anonymous', 'is_correct']) if (!inventory.includes(text)) process.exit(1);
  for (const text of ['Production', 'Staging', 'migration', '394c58f']) if (!adr.includes(text)) process.exit(1);
  NODE
  ! rg -ni '(service_role[[:space:]]*=|anon_key[[:space:]]*=|eyJ[A-Za-z0-9_-]+\.|@[A-Za-z0-9.-]+\.[A-Za-z]{2,})' docs/adr/0002-colorplay-new-integration-and-production-environments.md docs/migration
  git diff --check
  ```

  Expected success: all required facts and table columns exist, the sensitive-value scan returns no match, and the diff check exits 0.

- [x] **Step 4: Commit**

  ```bash
  git add docs/adr/0002-colorplay-new-integration-and-production-environments.md docs/migration/colorplay-new-feature-parity.md docs/migration/colorplay-new-content-ledger.md docs/migration/legacy-supabase-inventory.md
  git commit -m "docs: record legacy migration decisions"
  ```

---

### Task 3: Define the Local, Staging, and Production operating contract

**Reviewer gate:** Accept only if frontend deployment, Auth URL, Supabase target, data policy, secret scope, write authority, backup, alerting, rollback, and manual owner actions are explicit for all three environments. Preview must map only to Staging and `main` only to Production.

**Files:**

- Create: `docs/deployment/environment-matrix.md`
- Create: `docs/deployment/production-readiness.md`
- Modify: `docs/deployment/vercel.md`

**Consumes interfaces:**

- Approved design sections 12–15.
- ADR 0002 from Task 2.
- Existing `vercel.json`, `.github/workflows/ci.yml`, and the public browser-variable allowlist.

**Produces interfaces:**

- Environment matrix covering frontend target, Supabase project, Auth Site URL/redirect policy, allowed data, browser variables, server-secret owner, migration authority, test policy, and deployment source.
- Production readiness checklist with named control owner roles, entry evidence, rollback, RPO 24 hours, RTO 8 hours, daily provider backup, weekly encrypted logical backup, Storage backup, quarterly restore drill, SMTP, monitoring, and incident contacts.
- Vercel contract updated to state Preview → rebuilt Staging, Production/main → new clean Production, `npm run build`, `dist`, SPA fallback, and that database deployment remains a protected separate gate.

**Corresponding spec / acceptance:** Approved design sections 12–15; `spec/02-system-architecture.md`; `spec/04-security-and-privacy.md`; `spec/09-nonfunctional-requirements.md`; `AC-ENV-001`–`AC-ENV-008`, `AC-SEC-004`, `AC-SEC-007`, `AC-REL-001`.

**Required evidence:** Environment matrix diff, exact configuration-name assertions, explicit `NOT EXECUTED` production actions, and secret-boundary scan. No remote dashboard evidence.

- [x] **Step 1: Run the pre-change failing assertion**

  ```bash
  test -f docs/deployment/environment-matrix.md && test -f docs/deployment/production-readiness.md
  ```

  Expected failure: exit 1 because both documents are absent.

- [x] **Step 2: Write the minimum environment and release contracts**

  Define the two browser-safe variables by name only. State that Production starts from migration zero, receives approved content only, contains no seed users, uses exact Auth redirect URLs and custom SMTP, and cannot be targeted by automated mutation tests. State that hosted project creation, environment-value upload, custom domain selection, and contact assignment remain explicit account-owner actions with state `NOT EXECUTED`.

- [x] **Step 3: Verify all environment boundaries**

  ```bash
  for value in Local Staging Production Preview main VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY "RPO 24" "RTO 8"; do
    rg -q "$value" docs/deployment/environment-matrix.md docs/deployment/production-readiness.md docs/deployment/vercel.md
  done
  rg -q 'npm run build' docs/deployment/vercel.md
  rg -q 'dist' docs/deployment/vercel.md
  rg -q 'SPA fallback' docs/deployment/vercel.md
  ! rg -ni 'VITE_[A-Z0-9_]*(SERVICE|SECRET|PASSWORD|DATABASE)' docs/deployment
  git diff --check
  ```

  Expected success: every required environment/control string exists, no forbidden browser-secret variable exists, and the diff check exits 0.

- [x] **Step 4: Commit**

  ```bash
  git add docs/deployment/environment-matrix.md docs/deployment/production-readiness.md docs/deployment/vercel.md
  git commit -m "docs: define production environment contract"
  ```

---

### Task 4: Align roles, routes, architecture, and security specifications

**Reviewer gate:** Accept only if every approved public/student/teacher route has an owner and guard, ColorPlay Live is first-party, the React/Supabase feature boundary is explicit, and authorization is enforced both in UI routing and at the database/function boundary.

**Files:**

- Modify: `spec/README.md`
- Modify: `spec/01-user-roles-and-flows.md`
- Modify: `spec/02-system-architecture.md`
- Modify: `spec/04-security-and-privacy.md`

**Consumes interfaces:**

- Approved design sections 4–5, 7–8, 11–13.
- ADR 0002 and environment matrix from Tasks 2–3.
- Existing authenticated `/app` quiz path and role model.

**Produces interfaces:**

- Route contract for public, student, teacher, join-intent recovery, unauthorized, and not-found flows.
- Feature ownership and dependency rules for `auth`, `profile`, `learning`, `quiz`, `remediation`, `progress`, `rewards`, `achievements`, `inventory`, `classrooms`, `assignments`, `leaderboard`, `live`, and `teacher`.
- API boundary deciding Query/PostgREST reads, transactional RPC writes, Edge Function workloads, private Realtime topics, idempotency keys, state versions, error codes, loading/retry behavior, and audit metadata.
- Security rules for Auth roles, ownership, cross-class denial, hidden answers, server time, no formal `localStorage`, secret lifecycle, Production data, and no official Kahoot API dependency.
- Teacher analytics contract with filters for classroom, date range, chapter, section/subtopic, question, and activity mode; canonical metrics for completed attempts, distinct active students, first-answer accuracy, current mastery, mean non-timeout server response, timeout rate, hint rate, remediation resolution, assignment completion, and Live participation.
- Audit contract for role changes, classroom/membership changes, content publication/import, reward/shop mutations, assignment lifecycle, Live host commands/finalization, and research export. Each event records UTC time, actor, action, target, request/correlation ID, result, rules/content version, and safe metadata without Email, answer payloads, tokens, or secrets.

**Corresponding spec / acceptance:** Approved design sections 4–5, 7–8, 11–13; `AC-AUTH-001`–`AC-AUTH-007`, `AC-SEC-001`–`AC-SEC-007`, `AC-LIVE-001`–`AC-LIVE-012`, `AC-PROG-006`, `AC-ENV-003`–`AC-ENV-007`.

**Required evidence:** Route-to-feature table diff, trust-boundary table diff, automated required-heading checks, and `git diff --check`.

- [x] **Step 1: Run the pre-change failing assertion**

  ```bash
  node - <<'NODE'
  const { readFileSync } = require('node:fs');
  const files = ['spec/01-user-roles-and-flows.md', 'spec/02-system-architecture.md', 'spec/04-security-and-privacy.md'];
  const text = files.map((path) => readFileSync(path, 'utf8')).join('\n');
  for (const required of ['/app/live/:sessionId', '/teacher/live/:sessionId', 'ColorPlay Live', 'realtime.messages', 'state_version', 'external_activities']) {
    if (!text.includes(required)) process.exit(1);
  }
  NODE
  ```

  Expected failure: exit 1 because the approved route and Live boundaries are not yet normative.

- [x] **Step 2: Apply the minimum normative changes**

  Preserve existing implemented routes and mark future routes by owning phase rather than presenting them as implemented. Specify retry only for safe reads and idempotent mutations. Specify terminal behavior for `UNAUTHENTICATED`, `FORBIDDEN`, `CONFLICT`, `EXPIRED`, `RATE_LIMITED`, and `INTERNAL_ERROR`. State that Realtime is transport, PostgreSQL is the system of record, and outsiders cannot subscribe to a Live session.

- [x] **Step 3: Verify routes, guards, and trust boundaries**

  ```bash
  for value in '/app/chapters' '/app/assignments' '/app/live/:sessionId' '/teacher/classes/:classroomId' '/teacher/live/:sessionId' '/teacher/integrations/kahoot'; do
    rg -Fq "$value" spec/01-user-roles-and-flows.md
  done
  for value in 'server-authoritative' 'idempotency' 'state_version' 'realtime.messages' 'system of record'; do
    rg -Fiq "$value" spec/02-system-architecture.md spec/04-security-and-privacy.md
  done
  ! rg -ni 'service_role.*VITE_|VITE_.*service_role' spec
  git diff --check
  ```

  Expected success: all route and boundary assertions pass, no server key is assigned to a browser variable, and the diff check exits 0.

- [x] **Step 4: Commit**

  ```bash
  git add spec/README.md spec/01-user-roles-and-flows.md spec/02-system-architecture.md spec/04-security-and-privacy.md
  git commit -m "docs: align platform routes and trust boundaries"
  ```

---

### Task 5: Align data, game, progress, assignment, Live, and content rules

**Reviewer gate:** Accept only if schemas and secure functions have clear ownership, every derived metric has an exact formula/version, achievements cannot mint rewards in the first catalog, assignments reference authoritative sessions, and content/history rules prevent answer leakage or retroactive score changes.

**Files:**

- Modify: `spec/03-data-model-and-rls.md`
- Modify: `spec/05-game-mechanics.md`
- Modify: `spec/06-content-and-question-bank.md`

**Consumes interfaces:**

- Approved design sections 6–10.
- Existing quiz session/answer model and 45-question verified import.
- Feature and trust boundaries from Task 4.

**Produces interfaces:**

- Schema/RLS/function contract for content versions, review cards, hints, mistakes/remediation, progress, immutable economy ledgers, Blooks, achievements, classrooms, assignments, external activities, and Live.
- Exact progress rules: coverage, accuracy, mastery, four statuses, current published versions, `2026-07-progress-1`, and exclusion of Live from mastery.
- Quiz rules: one formal answer, up to three hints, remediation-only repeated attempts, no first-version hint penalty, immutable original outcomes, and `game_rules_version`.
- Achievement catalog rules: nine initial badge-only definitions, server-derived progress, unique unlock, versioned enum rule types, and no client-triggered unlock.
- Assignment and Live rules: ownership, deadlines in UTC/display in Asia/Taipei, attempt limits, frozen question versions, state machine, server deadlines, idempotent answers, atomic finalization, privacy-safe ranks, and optional external Kahoot URL compatibility only.

**Corresponding spec / acceptance:** Approved design sections 6–10; `AC-QUIZ-001`–`AC-QUIZ-012`, `AC-GAME-001`–`AC-GAME-009`, `AC-LEARN-001`–`AC-LEARN-004`, `AC-ACH-001`–`AC-ACH-005`, `AC-PROG-001`–`AC-PROG-006`, `AC-ASN-001`–`AC-ASN-006`, `AC-LIVE-001`–`AC-LIVE-012`, `AC-MIG-003`.

**Required evidence:** Schema ownership/RLS matrix diff, formula assertions, function-name assertions, and `git diff --check`.

- [x] **Step 1: Run the pre-change failing assertion**

  ```bash
  node - <<'NODE'
  const { readFileSync } = require('node:fs');
  const text = ['spec/03-data-model-and-rls.md', 'spec/05-game-mechanics.md', 'spec/06-content-and-question-bank.md'].map((path) => readFileSync(path, 'utf8')).join('\n');
  for (const required of ['achievement_definitions', 'assignment_attempts', 'live_session_questions', 'remediation_attempts', '2026-07-progress-1', 'mastery = coverage']) {
    if (!text.includes(required)) process.exit(1);
  }
  NODE
  ```

  Expected failure: exit 1 because the approved schemas and formulas are absent from the normative specifications.

- [x] **Step 2: Apply the minimum normative changes**

  Include table purpose, critical keys/unique constraints, write authority, read scope, retention/history behavior, and required secure functions. Do not provide executable migration SQL. Keep existing XP/Token/Level values unless the approved design explicitly changes them. Preserve the verified 45-question import as the only approved question baseline.

  The nine stable achievement definitions are exact: `first_task_complete` (first completed quiz or assignment), `first_perfect_quiz` (first completed quiz at 100% accuracy), `mistakes_resolved_10` (ten distinct resolved mistakes), `chapter_mastered_1` (first mastered chapter), `all_chapters_mastered` (all six chapters), `level_10` (authoritative level at least 10), `correct_streak_20` (twenty qualifying correct answers), `live_complete_5` (five completed Live sessions), and `blooks_owned_6` (all six initial Blooks). `case_expert` is explicitly rejected because no case-mission subsystem is approved.

- [x] **Step 3: Verify formulas, tables, and secure commands**

  ```bash
  for value in review_cards content_versions hint_events mistake_items remediation_attempts achievement_definitions achievement_unlocks assignment_attempts external_activities live_answers; do
    rg -q "$value" spec/03-data-model-and-rls.md
  done
  for value in 'coverage' 'accuracy' 'mastery' '2026-07-progress-1' 'badge' 'three hints' 'Live'; do
    rg -Fiq "$value" spec/05-game-mechanics.md spec/06-content-and-question-bank.md
  done
  for value in create_live_session submit_live_answer finalize_live_session purchase_blook equip_blook; do
    rg -q "$value" spec/03-data-model-and-rls.md
  done
  git diff --check
  ```

  Expected success: all required schema, formula, and function terms exist and the diff check exits 0.

- [x] **Step 4: Commit**

  ```bash
  git add spec/03-data-model-and-rls.md spec/05-game-mechanics.md spec/06-content-and-question-bank.md
  git commit -m "docs: align learning and game domain contracts"
  ```

---

### Task 6: Align governance, testing policy, and the phase roadmap

**Reviewer gate:** Accept only if contributors have one unambiguous next-plan sequence, old unexecuted plans cannot be mistaken for active plans, phase/task evidence rules remain distinct, and Task 16 plus full acceptance stay deferred to Phase 8.

**Files:**

- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `spec/08-testing-and-evidence.md`
- Modify: `spec/10-migration-roadmap.md`
- Modify: `docs/superpowers/plans/2026-07-14-game-economy.md`
- Modify: `docs/superpowers/plans/2026-07-14-classroom-leaderboard.md`
- Modify: `docs/superpowers/specs/2026-07-15-colorplay-new-integration-and-production-design.md`

**Consumes interfaces:**

- Approved design sections 14–18.
- ADR 0001 Task 16 deferral and ADR 0002 migration/environment decision.
- Existing graded workflow in `AGENTS.md`.

**Produces interfaces:**

- Project map includes all feature boundaries, migration/deployment documents, three environments, first-party ColorPlay Live, and the Phase 0–8 sequence.
- Task evidence remains lint/typecheck/affected tests with no task screenshot directory; phase evidence remains full real-stack/browser evidence once per phase; human real-device checks remain release gates.
- Both 2026-07-14 unexecuted plans receive a top-level `SUPERSEDED` notice naming their versioned successors and prohibiting execution.
- Written design metadata records approval on 2026-07-16 and authorization of Phase 0 planning only.

**Corresponding spec / acceptance:** Approved design sections 14–18; `spec/08-testing-and-evidence.md`; `spec/10-migration-roadmap.md`; `AC-DOC-001`, `AC-DOC-003`, `AC-ENV-003`, `AC-MIG-004`, `AC-MIG-005`.

**Required evidence:** Governance/roadmap diff, supersession assertion, phase-order assertion, and `git diff --check`. No phase acceptance run.

- [x] **Step 1: Run the pre-change failing assertion**

  ```bash
  node - <<'NODE'
  const { readFileSync } = require('node:fs');
  const economy = readFileSync('docs/superpowers/plans/2026-07-14-game-economy.md', 'utf8');
  const classroom = readFileSync('docs/superpowers/plans/2026-07-14-classroom-leaderboard.md', 'utf8');
  const roadmap = readFileSync('spec/10-migration-roadmap.md', 'utf8');
  if (!economy.startsWith('> **SUPERSEDED')) process.exit(1);
  if (!classroom.startsWith('> **SUPERSEDED')) process.exit(1);
  if (!roadmap.includes('Phase 8') || !roadmap.includes('ColorPlay Live Core')) process.exit(1);
  NODE
  ```

  Expected failure: exit 1 because the old plans still appear executable and the revised roadmap is not normative.

- [x] **Step 2: Apply the minimum governance and roadmap changes**

  Retain completed foundation/playable plan history. Name the future plans exactly as `2026-07-16-game-economy-v2.md`, `2026-07-16-achievements.md`, and `2026-07-16-classroom-leaderboard-v2.md`; do not create them in this task. State that each future phase requires its own approved design/plan before implementation. Do not claim Phase 0 is complete until Task 8 passes.

- [x] **Step 3: Verify policy consistency**

  ```bash
  rg -q '^> \*\*SUPERSEDED' docs/superpowers/plans/2026-07-14-game-economy.md
  rg -q '^> \*\*SUPERSEDED' docs/superpowers/plans/2026-07-14-classroom-leaderboard.md
  for phase in 0 1 2 3 4 5 6 7 8; do rg -q "Phase $phase" spec/10-migration-roadmap.md; done
  rg -q 'Task 16' AGENTS.md README.md spec/08-testing-and-evidence.md spec/10-migration-roadmap.md
  rg -q -e '(do not run|不得執行|不執行).*acceptance' -e 'acceptance.*(不得執行|不執行)' AGENTS.md spec/08-testing-and-evidence.md
  git diff --check
  ```

  Expected success: both old plans are visibly superseded, all nine phases are present, Task 16/full acceptance deferral is explicit, and the diff check exits 0.

- [x] **Step 4: Commit**

  ```bash
  git add AGENTS.md README.md spec/08-testing-and-evidence.md spec/10-migration-roadmap.md docs/superpowers/plans/2026-07-14-game-economy.md docs/superpowers/plans/2026-07-14-classroom-leaderboard.md docs/superpowers/specs/2026-07-15-colorplay-new-integration-and-production-design.md
  git commit -m "docs: align governance and delivery roadmap"
  ```

---

### Task 7: Add the 38 acceptance criteria and synchronize acceptance tooling

**Reviewer gate:** Accept only if the normative file contains exactly 122 unique headings, every new criterion is measurable and names required evidence, no old ID changes, and the acceptance run creators fail closed against the centralized expected count.

**Files:**

- Modify: `acceptance/ACCEPTANCE_CRITERIA.md`
- Modify: `scripts/verify/count-acceptance.mjs`
- Modify: `scripts/verify/count-acceptance.d.mts`
- Modify: `scripts/acceptance/create-run.mjs`
- Modify: `scripts/acceptance/finalize-phase-1.mjs`
- Modify: `tests/contracts/evidence-manifest.test.ts`
- Modify: `tests/contracts/phase-1-gate.test.ts`
- Modify (generated by Task 1 tool): `DOCUMENT_MANIFEST.json`

**Consumes interfaces:**

- Existing 84 acceptance IDs unchanged.
- Approved design section 16 exact categories and ID ranges.
- `EXPECTED_ACCEPTANCE_COUNT` exported by `scripts/verify/count-acceptance.mjs` as the single expected-count authority.

**Produces interfaces:**

- Exactly 122 unique acceptance headings.
- `AC-ACH-001`–`005`: server authority, duplicate unlock idempotency, exact progress, hidden-rule privacy, and client-tamper rejection.
- `AC-PROG-001`–`006`: review completion, coverage, accuracy/mastery, current-version behavior, remediation behavior, and teacher/class authorization.
- `AC-ASN-001`–`006`: teacher ownership, lifecycle, attempt limit, authoritative completion, UTC/Taipei deadline behavior, and cross-class denial.
- `AC-LIVE-001`–`012`: create/join, private channel, host transitions, hidden answers, server deadline, answer idempotency, reconnect, single-host conflict, atomic finalization, ranking, assignment/economy integration, and capacity/latency.
- `AC-ENV-005`–`008`: Vercel scope mapping, clean Production/no seed users, secret lifecycle/rotation, and backup/restore.
- `AC-MIG-001`–`005`: inventory, invalid-row rejection, verified 45-question preservation, complete parity dispositions, and insecure-code exclusion.

**Corresponding spec / acceptance:** Approved design sections 15–17; updated `spec/01`–`06`, `spec/08`, and `spec/10`; all 38 IDs listed above plus `AC-DOC-001` and `AC-DOC-003`.

**Required evidence:** Before/after ID set comparison proving the original 84 are unchanged, focused contract tests, exact count output `122`, generated manifest diff, and `git diff --check`. No acceptance artifact run.

- [x] **Step 1: Change the tests first and verify failure**

  Update focused expectations from 84 to `EXPECTED_ACCEPTANCE_COUNT`, assert the constant is 122, and assert all 38 exact new IDs are present. Update the phase-gate contract to reject a finalizer that embeds the superseded count.

  Run:

  ```bash
  pnpm test -- tests/contracts/evidence-manifest.test.ts tests/contracts/phase-1-gate.test.ts
  ```

  Expected failure: acceptance metadata still has 84 IDs and the scripts do not export/use the new centralized count.

- [x] **Step 2: Add all criteria in the established acceptance format**

  Each criterion must state Blocking status, precondition, action, observable expected result, and exact evidence class. `AC-LIVE-012` uses the already approved initial staging profile rather than inventing a scale claim: one host, two active students, one outsider, at least 30 answer/finalize samples, answer p95 at or below 800 ms, finalize p95 at or below 1,000 ms, zero lost/duplicate authoritative answers, and zero outsider channel access. Phase 7 may tighten capacity through a separately approved specification change. Environment and migration criteria distinguish documented design from actually executed hosted proof.

- [x] **Step 3: Centralize count enforcement and regenerate the manifest**

  Export `EXPECTED_ACCEPTANCE_COUNT = 122` from the counter module and declaration. Import it in both acceptance scripts. Keep duplicate-ID rejection. Run the Task 1 generator only after all normative acceptance edits are complete.

  ```bash
  pnpm document:manifest
  ```

  Expected success: `DOCUMENT_MANIFEST.json` is regenerated from the discovered source files and reports 122 acceptance criteria without manual count edits.

- [x] **Step 4: Verify success and old-ID preservation**

  ```bash
  test "$(pnpm --silent acceptance:count)" = "122"
  pnpm test -- tests/contracts/document-manifest.test.ts tests/contracts/evidence-manifest.test.ts tests/contracts/phase-1-gate.test.ts
  pnpm document:manifest:check
  node - <<'NODE'
  const { execFileSync } = require('node:child_process');
  const { readFileSync } = require('node:fs');
  const ids = (text) => [...text.matchAll(/^## (AC-[A-Z0-9]+-[0-9]{3})/gm)].map((match) => match[1]);
  const before = ids(execFileSync('git', ['show', 'HEAD:acceptance/ACCEPTANCE_CRITERIA.md'], { encoding: 'utf8' }));
  const after = new Set(ids(readFileSync('acceptance/ACCEPTANCE_CRITERIA.md', 'utf8')));
  if (before.length !== 84 || before.some((id) => !after.has(id)) || after.size !== 122) process.exit(1);
  NODE
  git diff --check
  ```

  Expected success: count is 122, all focused tests pass, the manifest is current, all original IDs still exist, and the diff check exits 0. Run this check before Task 7 is committed, as ordered above.

- [x] **Step 5: Commit**

  ```bash
  git add acceptance/ACCEPTANCE_CRITERIA.md scripts/verify/count-acceptance.mjs scripts/verify/count-acceptance.d.mts scripts/acceptance/create-run.mjs scripts/acceptance/finalize-phase-1.mjs tests/contracts/evidence-manifest.test.ts tests/contracts/phase-1-gate.test.ts DOCUMENT_MANIFEST.json
  git commit -m "docs: add integration acceptance coverage"
  ```

---

### Task 8: Complete Phase 0 traceability and self-review

**Reviewer gate:** Accept only if all approved design requirements map to a normative spec and acceptance ID, the manifest is current, no conflicting active plan remains, focused tooling checks pass, and the progress record states precisely what is complete and what still requires a separately approved plan.

**Files:**

- Modify: `.superpowers/sdd/progress.md`
- Modify (generator only if source hashes changed): `DOCUMENT_MANIFEST.json`

**Consumes interfaces:**

- All Task 1–7 commits.
- Approved design sections 1–18.
- Updated acceptance count and document-manifest generator.

**Produces interfaces:**

- Progress record closes Phase 0, lists its eight commits, records 122 normative criteria, and names the next planning order: Game Economy v2, Achievements, Classroom/Leaderboard v2.
- Explicit boundary: no product feature, migration, hosted mutation, deployment, Task 16, or full acceptance was executed in Phase 0.
- Final self-review result covering route ownership, schema ownership, trust boundaries, environment separation, migration dispositions, phase ownership, acceptance traceability, and conflicting-plan detection.

**Corresponding spec / acceptance:** Entire approved design; updated `spec/01`–`06`, `spec/08`, `spec/10`; `AC-DOC-001`, `AC-DOC-003`, `AC-MIG-001`–`AC-MIG-005`, `AC-ENV-003`–`AC-ENV-008`.

**Required evidence:** Command/result summary in the task report or commit message body, final document diff summary, clean manifest check, and one code review after commit. No screenshot, video, trace, database, or browser evidence.

- [x] **Step 1: Run the pre-close failing assertion**

  ```bash
  rg -q '^Phase 0 specification alignment: COMPLETE' .superpowers/sdd/progress.md
  ```

  Expected failure: the progress record has not yet closed Phase 0.

- [x] **Step 2: Run the full Phase 0 self-review before changing status**

  ```bash
  git diff --name-only -z 030a44a | xargs -0 pnpm exec prettier --check --ignore-unknown
  pnpm lint
  pnpm typecheck
  pnpm test -- tests/contracts/document-manifest.test.ts tests/contracts/evidence-manifest.test.ts tests/contracts/phase-1-gate.test.ts
  test "$(pnpm --silent acceptance:count)" = "122"
  pnpm document:manifest:check
  node - <<'NODE'
  const { readFileSync } = require('node:fs');
  const { execFileSync } = require('node:child_process');
  const paths = execFileSync('git', ['diff', '--name-only', '030a44a', '--', '*.md'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  const blocked = ['T' + 'BD', 'T' + 'ODO', 'place' + 'holder'];
  const hits = [];
  for (const path of paths) {
    const text = readFileSync(path, 'utf8').toLowerCase();
    for (const word of blocked) if (text.includes(word.toLowerCase())) hits.push(`${path}:${word}`);
  }
  if (hits.length) {
    process.stderr.write(`${hits.join('\n')}\n`);
    process.exit(1);
  }
  NODE
  head -n 1 docs/superpowers/plans/2026-07-14-game-economy.md | rg -q '^> \*\*SUPERSEDED'
  head -n 1 docs/superpowers/plans/2026-07-14-classroom-leaderboard.md | rg -q '^> \*\*SUPERSEDED'
  git diff --check
  ```

  Expected success: formatting, lint, typecheck, focused tests, count, manifest, unresolved-marker scan, superseded-plan check, and diff check all pass. The old plans retain historical content below an unambiguous first-line supersession notice.

  > 2026-07-16 owner 核准：全域 `format:check` 於基準 `030a44a` 即已失敗（8 個本階段未變更的檔案），Phase 0 改用變更檔案範圍檢查。

- [x] **Step 3: Update the progress record and regenerate/check metadata if needed**

  Record exact Task 1–7 commit SHAs and command results. If a manifest-tracked source changed after Task 7, run:

  ```bash
  pnpm document:manifest
  pnpm document:manifest:check
  ```

  Expected success: manifest check exits 0 and the progress file states `Phase 0 specification alignment: COMPLETE` without claiming any product phase complete.

- [x] **Step 4: Commit the closure record**

  ```bash
  git add .superpowers/sdd/progress.md DOCUMENT_MANIFEST.json
  git commit -m "docs: close specification alignment phase"
  ```

- [x] **Step 5: Verify the committed state and request one review**

  ```bash
  git status --short
  git log -8 --oneline
  pnpm document:manifest:check
  ```

  Expected success: worktree is clean, eight focused Phase 0 commits are visible, and the manifest check exits 0. Then use `superpowers:requesting-code-review` once for the complete Phase 0 commit range. Do not begin Game Economy v2 planning or implementation in the same execution without a new project-owner instruction.

## Acceptance traceability by task

| Acceptance ID                                                            | Owning task                                                                                   |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `AC-MIG-001`                                                             | Task 2 defines the sanitized inventory; Task 7 makes it normative; Task 8 reconciles coverage |
| `AC-MIG-002`                                                             | Task 2 defines invalid-row exclusion; Task 7 makes it normative; Task 8 reconciles coverage   |
| `AC-MIG-003`                                                             | Tasks 2 and 5 preserve the verified 45-question baseline; Task 7 makes it normative           |
| `AC-MIG-004`                                                             | Tasks 2 and 6 require complete parity dispositions; Task 7 makes it normative                 |
| `AC-MIG-005`                                                             | Tasks 2 and 6 prohibit insecure source transfer; Task 7 makes it normative                    |
| `AC-ENV-005`                                                             | Task 3 defines Vercel scope mapping; Task 7 makes it normative                                |
| `AC-ENV-006`                                                             | Task 3 defines clean Production and no seed users; Task 7 makes it normative                  |
| `AC-ENV-007`                                                             | Tasks 3–4 define secret lifecycle and rotation; Task 7 makes it normative                     |
| `AC-ENV-008`                                                             | Task 3 defines backup and restore controls; Task 7 makes it normative                         |
| `AC-ACH-001`                                                             | Task 5 defines server-authoritative unlocks; Task 7 makes it normative                        |
| `AC-ACH-002`                                                             | Task 5 defines unlock idempotency; Task 7 makes it normative                                  |
| `AC-ACH-003`                                                             | Task 5 defines truthful progress; Task 7 makes it normative                                   |
| `AC-ACH-004`                                                             | Task 5 defines hidden-rule privacy; Task 7 makes it normative                                 |
| `AC-ACH-005`                                                             | Task 5 defines client-tamper rejection; Task 7 makes it normative                             |
| `AC-PROG-001`                                                            | Task 5 defines review completion; Task 7 makes it normative                                   |
| `AC-PROG-002`                                                            | Task 5 defines current-version coverage; Task 7 makes it normative                            |
| `AC-PROG-003`                                                            | Task 5 defines accuracy and mastery formulas; Task 7 makes it normative                       |
| `AC-PROG-004`                                                            | Task 5 defines content-version behavior; Task 7 makes it normative                            |
| `AC-PROG-005`                                                            | Task 5 defines remediation effects; Task 7 makes it normative                                 |
| `AC-PROG-006`                                                            | Tasks 4–5 define teacher/class authorization; Task 7 makes it normative                       |
| `AC-ASN-001`                                                             | Task 5 defines teacher ownership; Task 7 makes it normative                                   |
| `AC-ASN-002`                                                             | Task 5 defines assignment lifecycle; Task 7 makes it normative                                |
| `AC-ASN-003`                                                             | Task 5 defines attempt-limit authority; Task 7 makes it normative                             |
| `AC-ASN-004`                                                             | Task 5 defines server completion; Task 7 makes it normative                                   |
| `AC-ASN-005`                                                             | Task 5 defines deadline/timezone behavior; Task 7 makes it normative                          |
| `AC-ASN-006`                                                             | Task 5 defines cross-class denial; Task 7 makes it normative                                  |
| `AC-LIVE-001`                                                            | Tasks 4–5 define authenticated create/join; Task 7 makes it normative                         |
| `AC-LIVE-002`                                                            | Task 4 defines private Realtime authorization; Task 7 makes it normative                      |
| `AC-LIVE-003`                                                            | Tasks 4–5 define host-only transitions; Task 7 makes it normative                             |
| `AC-LIVE-004`                                                            | Tasks 4–5 define hidden-answer payloads; Task 7 makes it normative                            |
| `AC-LIVE-005`                                                            | Tasks 4–5 define server deadlines; Task 7 makes it normative                                  |
| `AC-LIVE-006`                                                            | Tasks 4–5 define answer idempotency; Task 7 makes it normative                                |
| `AC-LIVE-007`                                                            | Task 4 defines reconnect recovery; Task 7 makes it normative                                  |
| `AC-LIVE-008`                                                            | Tasks 4–5 define single-host conflict handling; Task 7 makes it normative                     |
| `AC-LIVE-009`                                                            | Task 5 defines atomic finalization; Task 7 makes it normative                                 |
| `AC-LIVE-010`                                                            | Task 5 defines privacy-safe ranking; Task 7 makes it normative                                |
| `AC-LIVE-011`                                                            | Task 5 defines assignment/economy integration; Task 7 makes it normative                      |
| `AC-LIVE-012`                                                            | Task 7 defines measurable capacity/latency evidence                                           |
| Existing `AC-AUTH-*`, `AC-LEARN-*`, `AC-QUIZ-*`, `AC-GAME-*`, `AC-SEC-*` | Tasks 4–5 verify compatibility; IDs and existing assertions remain unchanged                  |
| Existing `AC-ENV-001`–`AC-ENV-004`                                       | Tasks 3 and 6 align environment and evidence policy; assertions remain unchanged              |
| `AC-DOC-001`, `AC-DOC-003`                                               | Tasks 1, 6, 7, and 8 provide manifest, roadmap, and traceability controls                     |

## Phase 0 completion boundary

Phase 0 is complete only after all eight task commits and the final review. Completion means the project has one approved, internally consistent specification baseline and a verifiable migration/environment contract. It does not mean Economy, Achievements, Classroom, Assignments, ColorPlay Live, learning-progress UI, teacher tools, research export, hosted Supabase, Vercel, or Production release is implemented or accepted.
