# ColorPlay `colorplay-new` Integration and Production Design

## 1. Document control

- Design date: 2026-07-15
- Written-spec review date: 2026-07-16
- Design status: approved in five sections; awaiting written-spec approval
- Canonical repository: `peiyi-liu/colorplay`
- Canonical implementation baseline: `feat/playable-vertical-slice` at `394c58f`
- Frontend: React + TypeScript + Vite on Vercel
- Backend: Supabase Auth, PostgreSQL, RLS, Storage, Realtime, RPC, and Edge Functions
- Migration strategy: preserve the verified `colorplay` foundation, revise the unexecuted plans, then integrate `colorplay-new` capabilities as independently verifiable vertical slices

This design authorizes documentation alignment only after written-spec approval. It does not authorize product code, database migrations, hosted Supabase mutation, Production provisioning, or deployment.

## 2. Decisions and source precedence

The normative precedence remains:

1. `acceptance/ACCEPTANCE_CRITERIA.md`
2. Updated `spec/*.md`
3. `AGENTS.md`
4. Approved ADRs and this design
5. Verified `colorplay` implementation
6. `colorplay-new` as a product-content and UI reference

The completed foundation, playable quiz slice, and 45-question import pipeline remain authoritative. Completed plans and migrations are historical records and are not rewritten. Unexecuted economy and classroom plans will be superseded by versioned replacements after the normative specifications are aligned.

### 2.1 Approved migration method

The approved method is a hybrid migration:

1. Align specifications, acceptance criteria, environment decisions, and parity records.
2. Complete the secure backend value of the original economy and classroom plans through revised versioned plans.
3. Integrate valuable `colorplay-new` behavior as schema/RLS/RPC/UI/test vertical slices.
4. Reject insecure or mock implementation details instead of porting them.

Directly porting the Next.js application is rejected. Completing all old plans unchanged before examining new requirements is also rejected because it would cause route, schema, and UI rework.

### 2.2 Mandatory product capabilities

The final platform must include:

- authentication, profiles, and controlled roles;
- curriculum hierarchy and review cards;
- quiz, tiered hints, mistakes, and remediation;
- XP, Token, Level, Blook inventory, and shop;
- achievements;
- classrooms, memberships, assignments, and leaderboard;
- detailed learning progress;
- ColorPlay Live Core and Advanced;
- optional external Kahoot URL compatibility without an official API dependency;
- teacher content management, imports, and analytics;
- research export;
- Production deployment, monitoring, backup, and audit.

## 3. Audited legacy inputs

### 3.1 `colorplay-new` code

The following may be retained as reviewed product references:

- student and teacher information architecture;
- dashboards, chapters, review cards, mistakes, progress, achievements, shop, and leaderboard presentation;
- tiered-hint and remediation interaction ideas;
- teacher assignments, content import, question analysis, and classroom activity flows;
- six-chapter descriptions and candidate review-card, Blook, avatar, and badge content;
- the projected classroom challenge and waiting-room concept.

The following must not be transferred:

- Next.js App Router architecture;
- in-memory mock store or mock Auth fallback;
- browser-created teacher roles;
- browser-authoritative answers, score, XP, Token, purchases, or ranking;
- service-role fallback to an anonymous key;
- formal state in `localStorage`;
- hard-coded leaderboard, achievement, progress, or Kahoot PIN data;
- random teacher analytics;
- the legacy SQL schema or its policies;
- third-party QR generation that discloses activity URLs.

### 3.2 Legacy hosted Supabase audit

The project previously connected to `colorplay-new` contained:

- 2 Auth users and 2 profiles;
- 1 wallet and 4 pending mistake records;
- 2 chapters, 3 sections, and 3 generic knowledge points;
- 46 questions and 179 options;
- no attempts, hints, review cards, Kahoot configurations, or Storage buckets.

Blocking findings were verified through read-only requests:

- anonymous users could read a profile row;
- anonymous users could read `question_options.is_correct`;
- question identifiers were converted into spreadsheet date serials such as `36951`;
- section names contained serial values;
- one extra row had three options and no correct answer;
- one extra row had an empty prompt and no options.

Prompt comparison found 44 matches between the remote 46 rows and the verified 45-question pipeline. The two remote-only rows were invalid; the verified pipeline contained one corrected duplicate-code question absent from the remote database. Therefore, the remote database contains no unique valid question that must be migrated.

The legacy hosted project becomes Staging only after its inventory is archived, unsafe data is removed, and the current repository migrations rebuild it. A separate clean Supabase project will be Production.

## 4. Repository and feature boundaries

The Vite repository remains feature-oriented:

```text
src/
  app/{boundaries,providers,router,shell}/
  features/
    auth/
    profile/
    learning/
    quiz/
    remediation/
    progress/
    rewards/
    achievements/
    inventory/
    classrooms/
    assignments/
    leaderboard/
    live/
    teacher/
  components/
  lib/{config,errors,observability,supabase}/
  styles/
  types/
  test/
supabase/{migrations,functions,seeds,tests}/
scripts/{acceptance,content,deployment,migration,supabase,verify}/
tests/{acceptance,contracts,e2e,fixtures,integration,performance,visual}/
docs/{adr,content,deployment,migration,superpowers}/
artifacts/acceptance/  # ignored
```

### 4.1 Feature ownership

| Feature | Owns | Must not own |
|---|---|---|
| `auth` | session, sign-in/out, route guards | teacher-role assignment |
| `profile` | display name, public avatar, equipment summary | reward mutation |
| `learning` | curriculum, chapters, review cards | scoring |
| `quiz` | practice sessions, submission, result | public correct answers |
| `remediation` | mistake state and corrective practice | rewriting original answers |
| `progress` | server-derived progress read models | client-written percentages |
| `rewards` | XP/Token ledgers and levels | client rewards |
| `achievements` | catalog, progress, unlocks | UI-triggered unlocks |
| `inventory` | Blooks, purchase, equip | direct wallet updates |
| `classrooms` | classroom, membership, join code | content editing |
| `assignments` | assignment lifecycle and session references | duplicate scores |
| `leaderboard` | privacy-safe ranking projection | client scores |
| `live` | live activities, lobby, host state, realtime recovery | WebSocket as system of record |
| `teacher` | teacher workspace composition | bypassing feature repositories or RLS |

TanStack Query owns server state. Zustand may own ephemeral quiz/live UI state only. Formal data may not be stored in `localStorage`. Domain types do not directly expose database rows, and generated database types remain in `src/types/database.ts`.

## 5. Route design

### 5.1 Public and authentication

```text
/
/login
/join/:joinCode?
/unauthorized
*
```

The join route preserves intent but does not disclose classroom data before authentication.

### 5.2 Authenticated student routes

```text
/app
/app/chapters
/app/chapters/:chapterId
/app/chapters/:chapterId/topics/:topicId/review
/app/quiz/:sessionId
/app/quiz/:sessionId/result
/app/assignments
/app/assignments/:assignmentId
/app/mistakes
/app/progress
/app/achievements
/app/shop
/app/leaderboard
/app/profile
/app/live/join
/app/live/:sessionId
```

The existing `/app` chapter selector remains until the dashboard slice is implemented. That slice first adds `/app/chapters`, moves the existing chapter selector, then changes `/app` to the dashboard while preserving deep-link tests.

### 5.3 Teacher routes

```text
/teacher
/teacher/classes
/teacher/classes/:classroomId
/teacher/classes/:classroomId/assignments
/teacher/live
/teacher/live/:sessionId
/teacher/content
/teacher/content/imports/new
/teacher/content/imports/:importId
/teacher/analytics/:classroomId
/teacher/exports
/teacher/integrations/kahoot
```

Every teacher route requires both a React role guard and server-side role/ownership authorization. Student and teacher heavy routes use route-level lazy loading. The XLSX parser, analytics charts, and Realtime host code must not enter the student learning bundle.

## 6. Schema boundaries

Existing migrations remain immutable. New timestamped migrations extend the current profiles, content taxonomy, and quiz engine.

### 6.1 Learning and quiz

New learning tables include:

- `review_cards` and `review_card_media`;
- `content_versions` and `content_publication_events`;
- `hint_events`;
- `mistake_items` and `remediation_attempts`;
- `review_progress`, `subtopic_progress`, and `chapter_progress`.

Published content is versioned. Historical sessions continue to read frozen question/version data. The quiz engine gains `game_rules_version`, an optional assignment reference, and a purpose of `practice`, `assignment`, or `remediation`. Live sessions remain separate because their state machine differs from ordinary quizzes.

### 6.2 Economy and achievements

Economy tables are:

- `xp_transactions`;
- `wallets` and `wallet_transactions`;
- `blooks` and `user_blooks`.

Ledgers are immutable and use unique source constraints. Wallet cache must reconcile exactly to ledger transactions.

Achievement tables are:

- `achievement_definitions`;
- `achievement_progress`;
- `achievement_unlocks`.

Definitions use a validated enum rule type and versioned parameters, never arbitrary SQL or JavaScript. Unlocks are unique per user and definition. The first catalog grants badges only; it does not add XP or Token.

### 6.3 Classroom and assignments

Classroom tables are `classrooms` and `classroom_members`. Classroom join codes are stored as hashes and can be rotated. A student may belong to multiple classrooms but can have only one active membership per classroom.

Assignment tables are `assignments`, `assignment_targets`, and `assignment_attempts`. Attempts reference finalized quiz or live sessions rather than copying scores. Availability, deadline, attempt limit, passing rule, and completion are server-authoritative.

### 6.4 External activity compatibility

`external_activities` stores optional teacher-owned Kahoot links, associated classroom/chapter, availability, and status. It does not synchronize official reports, save fake fixed PINs, or treat external results as ColorPlay scores.

## 7. ColorPlay Live

ColorPlay Live replaces the legacy hard-coded Kahoot page as the first-party classroom challenge. It does not use Kahoot branding or APIs.

### 7.1 Tables

- `live_activities`: reusable teacher configuration;
- `live_sessions`: host, classroom, state, code hash, position, state version, timestamps, and rules version;
- `live_participants`: authenticated members, status, authoritative score, and final rank;
- `live_session_questions`: frozen question/version, public options, hidden answer, and server deadlines;
- `live_answers`: one authoritative answer per participant/question with idempotency key and server response time.

The state machine is:

```text
draft -> lobby -> question_open -> question_feedback
       -> question_open ... -> completed
draft/lobby/question states -> cancelled
```

### 7.2 Trusted commands

Secure functions include:

- `create_live_session`;
- `rotate_live_join_code`;
- `join_live_session`;
- `get_live_session_state`;
- `start_live_session`;
- `open_live_question`;
- `submit_live_answer`;
- `close_live_question`;
- `advance_live_session`;
- `finalize_live_session`;
- `cancel_live_session`.

Each function fixes `search_path`, revokes public execution, grants only the required authenticated role, verifies `auth.uid()`, role, ownership, and membership, locks relevant rows, checks state version, uses idempotency, and emits safe audit metadata.

### 7.3 Realtime boundary

Private topics use `live-session:<sessionId>`. RLS on `realtime.messages` allows the host to receive/send approved host events and active participants to receive server state and publish Presence. Outsiders cannot join. Students cannot broadcast host transitions.

Realtime carries only state version, public question payload, server deadline, counts, phase transitions, and result availability. It never carries a pre-close correct answer, individual student answers, Email, secrets, or reward mutations.

PostgreSQL is the system of record. Transactions commit before broadcasts. A reconnecting client calls `get_live_session_state` and reconciles by state version.

### 7.4 Answer and finalize flow

`submit_live_answer` authenticates the student, verifies participant membership, locks the open question, validates the option and server deadline, compares the hidden answer, inserts exactly one answer, updates authoritative score, commits, and then broadcasts only the aggregate count. Reusing an idempotency key returns the original result.

`finalize_live_session` locks the session, verifies host ownership, calculates scores/ranks, writes reward ledgers, evaluates achievements, updates assignment/progress models, records audit data, marks the session completed, commits, and broadcasts result readiness. Failure rolls back the entire operation.

## 8. RLS and trusted interfaces

All public tables enable RLS and default to deny. Anonymous users receive no product data. Column grants or privacy-safe views exclude `is_correct` and other hidden fields.

Students can read their own profile, sessions, answers, wallets, achievements, assignments, progress, and active Live projection. They cannot read other raw answers or mutate ledgers, ranks, rewards, roles, or host state.

Teachers can manage their own classrooms and content scopes and read authorized classroom analytics. Teacher A cannot read Teacher B data. Research export and sensitive analytics use secure functions with audit logs.

High-risk functions use unique actor/request and source constraints plus row locks/state versions. Browser time, attempt counters, scores, rewards, ranks, roles, or completion flags are ignored or rejected.

## 9. Learning progress and remediation rules

Progress uses independent measures rather than a fabricated combined percentage.

### 9.1 Review completion

```text
completed current published review-card versions
divided by current published review-card versions * 100
```

Completion requires an explicit action recorded through a secure command. A new card version requires recompletion only when `requires_recompletion` is true. No published cards display an em dash rather than zero.

### 9.2 Coverage, accuracy, and mastery

For each current published question version, only the student's latest qualifying answer counts. Qualifying answers come from completed practice, assignment, or remediation sessions. Abandoned, expired, unfinished, old-version, and Live answers do not count.

```text
coverage = answered current versions / current published versions * 100
accuracy = latest correct versions / answered current versions * 100
mastery = coverage * accuracy / 100
```

Statuses are `not_started` (no qualifying answer), `learning` (1-59), `developing` (60-79), and `mastered` (80-100). Chapter aggregation uses all current published question versions rather than averaging subtopic percentages. Chapter completion requires 100% review completion, mastery of at least 80, and no blocking required assignment. Rules version is `2026-07-progress-1`.

### 9.3 Hints and remediation

Formal quiz/assignment questions have one answer. Before answering, students may request up to three hints through `request_question_hint`; the server records `hint_events`. Hints do not reduce score or rewards in the first version and may not reveal the answer.

Multiple attempts are permitted only in remediation. Remediation preserves the original score, grants no Token, grants XP at the existing 20% practice rule, may resolve/reopen mistake items, and may update mastery through a qualifying finalized attempt.

## 10. Achievement rules

The first catalog is:

| Stable code | Display name | Server condition |
|---|---|---|
| `first_task_complete` | 初出茅廬 | first completed quiz or assignment |
| `first_perfect_quiz` | 百發百中 | first completed quiz at 100% accuracy |
| `mistakes_resolved_10` | 不屈不撓 | ten distinct resolved mistake items |
| `chapter_mastered_1` | 章節精熟 | first mastered chapter |
| `all_chapters_mastered` | 色彩大師 | all six chapters mastered |
| `level_10` | 登峰造極 | authoritative level at least 10 |
| `correct_streak_20` | 連擊之王 | twenty consecutive qualifying correct answers |
| `live_complete_5` | 課堂挑戰者 | five completed Live sessions |
| `blooks_owned_6` | 收藏家 | six initial Blooks owned |

Unlocks never revoke. Correct streak includes formal quiz, assignment, and Live answers; incorrect/timeout resets it; remediation does not count. The unsupported legacy `case_expert` candidate is rejected because no approved case-mission subsystem exists.

## 11. Teacher analytics

Filters include classroom, date range, chapter, section/subtopic, question, and activity mode. Display uses `Asia/Taipei`; storage uses UTC.

Canonical metrics are:

- completed session attempts;
- distinct active students;
- first formal answer accuracy;
- current mastery under the approved formula;
- mean non-timeout server response time;
- timeout terminal answers divided by expected answers;
- answered questions with a hint divided by answered questions;
- resolved remediation items divided by entered remediation items;
- completed assigned students divided by active assigned members;
- Live participants divided by active classroom members;
- option selections divided by submitted answers;
- incorrect plus timeout divided by terminal answers.

Views/functions are `teacher_classroom_summary`, `teacher_question_analysis`, `teacher_subtopic_mastery`, `teacher_assignment_summary`, and `teacher_live_session_report`. They must be reproducible from fact tables. Empty denominators render an em dash, not a misleading zero. Random or client-calculated formal analytics are forbidden.

## 12. Error, retry, and recovery

Trusted endpoints return a safe error envelope with `code`, `message`, `requestId`, and `retryable`. Codes use stable domains such as `AUTH`, `PERMISSION`, `VALIDATION`, `CONFLICT`, `RATE_LIMIT`, `QUIZ`, `LIVE`, `ECONOMY`, `IMPORT`, and `UNAVAILABLE`. SQL, stack traces, answers, secrets, and unrelated identifiers are never returned.

Read queries retry at most twice with exponential backoff and jitter. Authentication, permission, validation, and not-found errors do not retry. Rate limiting respects retry metadata. Non-idempotent mutations do not blindly retry; user retry retains the original idempotency key and first queries command status after an uncertain timeout.

Live disconnect pauses submissions, reconnects the private channel, fetches authoritative state, and reconciles by state version. Sessions survive host disconnect. Duplicate host tabs cannot advance the same version twice. Long host absence transitions by server policy to paused/expired without rewards.

Every route defines loading, empty, recoverable error, permission, offline/reconnecting, pending, and success states. Existing content may remain visible while refresh fails, with a stale/error indication. Quiz/Live UI never displays speculative formal results.

## 13. Environments and deployment

### 13.1 Environment mapping

| Context | Frontend | Supabase | Data |
|---|---|---|---|
| Local | Vite dev/preview | Supabase CLI | deterministic seed only |
| Preview/Staging | Vercel Preview | rebuilt legacy hosted project | synthetic/test only |
| Production | Vercel Production | new clean project | approved formal data only |

Vercel Preview receives Staging `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Production receives distinct Production values. Service-role, database password, JWT secret, and SMTP credentials never use `VITE_` and never enter the browser bundle.

The GitHub repository is `peiyi-liu/colorplay`; `main` is the Production branch; Vercel uses `npm run build`, `dist`, and SPA fallback to `index.html`.

### 13.2 Database release

Feature CI rebuilds local Supabase and tests migrations. An approved release candidate deploys to Staging and passes phase acceptance. Production migrations require protected-environment approval and a smoke check before the `main` frontend release. Migrations are backward-compatible where possible; failures use a forward fix rather than untracked Dashboard edits.

Production starts from migration zero, receives no Staging Auth users, and imports only approved content. Initial Auth Site URL is the canonical Vercel Production URL and is replaced consistently when a custom domain is configured. Production redirects are exact; preview wildcard redirects exist only on Staging. Production uses custom SMTP.

### 13.3 Operations

The initial service objectives are RPO 24 hours and RTO 8 hours. Production requires daily provider backups, weekly encrypted logical backup, separate Storage asset backup, and a quarterly restore drill. Primary and backup operations contacts receive alerts for deployment, migration, Auth, RPC, Live, import/export, ledger reconciliation, capacity, and backup failures.

## 14. Roadmap and phase gates

Foundation Task 16 and the full `pnpm acceptance` gate remain deferred under ADR 0001 until Phase 8 Production release. The previously committed acceptance harness is preserved, but no intermediate task may present its result as Production readiness.

### Phase 0: specification and migration alignment

Create the Production/Staging ADR, parity matrix, content ledger, legacy inventory, environment matrix, updated normative specifications/acceptance/manifest, and plan supersession records. No product code changes. Exit requires complete route decisions, trust boundaries, phase ownership, and acceptance coverage.

### Phase 1: Game Economy v2

Implement ledgers, finalize rewards, daily decay, level, reconciliation, six Blooks, purchase/equip, and UI. Reserve source types for achievements, assignments, and Live. Exit covers AC-GAME-001 through AC-GAME-007 and AC-SEC-001/002.

### Phase 2: Achievements

Implement the catalog, server progress, transactional unlocks, badge UI, and quiz/economy events. Exit requires tamper resistance, truthfulness, idempotency, and hidden-rule privacy.

### Phase 3: Classroom and Leaderboard v2

Implement classrooms, membership, hashed/rotatable codes, teacher ownership, Top 10 plus self rank, and privacy-safe projection. Reserve assignment, Live, privacy-setting, and analytics dimensions. Exit requires positive and cross-tenant negative RLS tests and exact ledger ranking.

### Phase 4: Assignments and ColorPlay Live Core

Implement assignment lifecycle plus authenticated Live create/join/lobby/start/question/answer/feedback/finalize, private Realtime, reconnect, duplicate-host protection, ranking, and integrations. Exit requires one host, two students, and one outsider in real browser contexts plus atomic rollback tests.

### Phase 5: Learning Experience

Implement chapter detail, review cards, tiered hints, mistakes, remediation, progress, dashboard, and achievement progress UI. Exit requires exact formulas, published-content safety, route recovery, and no original-score rewriting.

### Phase 6: Teacher Content, Import, and Analytics

Implement teacher dashboard, versioned content/review-card CRUD, XLSX validation/preview/commit, analytics, reports, and optional external Kahoot URL management. Exit covers legal/invalid imports, rollback, XSS, exact metrics, and cross-teacher denial.

### Phase 7: ColorPlay Live Advanced

Implement pause/resume, real-time distributions, reusable/scheduled activities, advanced reports, team mode, streak visuals, reduced motion, and capacity/latency testing. It remains first-party and does not copy Kahoot branding or assets.

### Phase 8: Research and Production release

Implement pseudonymous research export, retention/deletion, complete audit, Production provisioning/content, SMTP, monitoring, backup, full acceptance, and human real-device evidence. Release requires no unresolved Critical/High security issue, no Production seed user, zero browser secret findings, and a completed restore drill.

## 15. Testing and evidence

Behavioral code follows TDD. Migrations begin with failing pgTAP/RLS tests; components/hooks with failing Vitest/RTL tests; repositories with contract/integration tests. Task-level verification is lint, typecheck, and affected tests only, with no task screenshot directory and no `pnpm acceptance`.

Each phase runs full unit/integration, local Supabase reset, pgTAP/RLS, Playwright Chromium/Firefox/WebKit, three viewports, a headed core flow, accessibility, visual evidence, zero console/network errors, an evidence manifest, and one code review. Real software keyboard and Android Back evidence remain human release-gate checks.

Live tests use one host, two students, and one outsider and cover concurrent answers, duplicate idempotency, host/student refresh, WebSocket disconnect, state conflict, deadline edges, unauthorized channels, rollback, and capacity.

Evidence resides under ignored `artifacts/acceptance/<run-id>/` with sanitized manifest, summary, screenshots, videos, traces, network, database, accessibility, performance, and security artifacts. No artifact stores JWTs, Email, correct answers, or server secrets.

## 16. Acceptance additions

Phase 0 adds the following exact categories and IDs to the normative acceptance file:

- `AC-ACH-001` through `AC-ACH-005`: authority, idempotency, progress truthfulness, hidden privacy, client tampering;
- `AC-PROG-001` through `AC-PROG-006`: review completion, coverage, accuracy/mastery, version handling, remediation, teacher authorization;
- `AC-ASN-001` through `AC-ASN-006`: ownership, lifecycle, attempt limit, server completion, deadline/timezone, cross-class denial;
- `AC-LIVE-001` through `AC-LIVE-012`: create/join, private channel, host transitions, hidden payload, server time, idempotency, reconnect, duplicate hosts, atomic finalize, ranking, integration, capacity;
- existing `AC-ENV-001` through `AC-ENV-004` remain authoritative for reproducible build, local reset, environment isolation, and browser-secret exclusion;
- `AC-ENV-005` through `AC-ENV-008`: Vercel scope mapping, Production data hygiene/no seed users, secret lifecycle/rotation, backup/restore;
- `AC-MIG-001` through `AC-MIG-005`: inventory, invalid-row exclusion, 45-question preservation, complete parity decisions, no insecure code copy.

Existing acceptance IDs remain unchanged. `DOCUMENT_MANIFEST.json` is regenerated from the updated source rather than edited to fabricate counts.

## 17. Required documentation changes

After this written design is approved, `superpowers:writing-plans` creates a Phase 0 documentation-alignment plan. That plan updates:

- `docs/adr/0002-colorplay-new-integration-and-production-environments.md`;
- `AGENTS.md`;
- `README.md`;
- `spec/01-user-roles-and-flows.md`;
- `spec/02-system-architecture.md`;
- `spec/03-data-model-and-rls.md`;
- `spec/04-security-and-privacy.md`;
- `spec/05-game-mechanics.md`;
- `spec/06-content-and-question-bank.md`;
- `spec/08-testing-and-evidence.md`;
- `spec/10-migration-roadmap.md`;
- `acceptance/ACCEPTANCE_CRITERIA.md`;
- `DOCUMENT_MANIFEST.json`;
- `docs/migration/colorplay-new-feature-parity.md`;
- `docs/migration/colorplay-new-content-ledger.md`;
- `docs/migration/legacy-supabase-inventory.md`;
- `docs/deployment/environment-matrix.md`;
- `docs/deployment/production-readiness.md`.

After the aligned normative documents are approved, `superpowers:writing-plans` creates versioned plans beginning with:

- `docs/superpowers/plans/2026-07-16-game-economy-v2.md`;
- `docs/superpowers/plans/2026-07-16-achievements.md`;
- `docs/superpowers/plans/2026-07-16-classroom-leaderboard-v2.md`.

The unexecuted 2026-07-14 economy/classroom plans receive a supersession header and remain in Git history. The completed foundation and playable-slice plans are not rewritten.

## 18. Explicit exclusions

This design does not authorize:

- importing `colorplay-new` source code wholesale;
- reusing the unsafe legacy hosted schema in Production;
- official Kahoot Reports API integration;
- anonymous Live participation;
- cases, marketplace, loot boxes, real-money Token exchange, or student-created Live rooms;
- Product code or schema changes before Phase 0 plan approval;
- Production data or deployment before the Phase 8 gate.
