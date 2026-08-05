# ColorPlay Current Program

- Status: DESIGN IN PROGRESS — no Phase 0 hosted mutation is authorized yet
- Last updated: 2026-08-05 (Asia/Taipei)
- Current phase: Phase 0, environment and release foundation design
- Canonical entry point: this file
- Historical task ledger: `.superpowers/sdd/progress.md`

This tracker answers four questions for every new work session:

1. What has the owner approved?
2. What is being designed or implemented now?
3. What remains and what is blocked?
4. Which files and worktrees must be preserved?

Update this file after every owner decision, completed task, phase gate,
deployment, rollback, or material blocker. A status claim must name its evidence
and date. Never describe local work, a Vercel `READY` state, or an HTTP 200 alone
as a completed production release.

## Immediate next action

Complete the Phase 0 design discussion. Then write and review a dedicated design
spec before creating projects, changing DNS, uploading environment variables,
linking Supabase, resetting data, deploying, or modifying product code.

The first unresolved Phase 0 decision is the migration-history reconciliation
method and pass criteria for turning the current hosted Supabase project into
Staging while creating a clean Production project.

## Approved program structure

The owner approved seven independent design, plan, implementation, and release
batches. Each batch must pass its own Staging gate before Production promotion.

| Phase | Scope                                         | Status                                              |
| ----- | --------------------------------------------- | --------------------------------------------------- |
| 0     | Environment and release foundation            | Design in progress                                  |
| 1     | Admin identity and security core              | Decisions captured; spec not started                |
| 2     | Content SSOT and version publishing           | Decisions captured; spec not started                |
| 3     | Learning progression and assessment authority | Decisions captured; spec not started                |
| 4     | Learning Hall and chapter experience          | Visual/product decisions captured; spec not started |
| 5     | Live and teacher reporting                    | Product rules captured; spec not started            |
| 6     | Full-site JRPG visual unification             | Direction captured; spec not started                |

The required workflow for every phase is:

```text
brainstorm → approved design → committed spec → owner review
→ implementation plan → isolated implementation → Staging gate
→ explicit Production authorization
```

## Environment decision

### Target topology

| Environment | Git                        | Vercel                  | Domain                     | Supabase                                                                                                    | Data                                            |
| ----------- | -------------------------- | ----------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Local       | developer worktree         | local Vite              | loopback URL               | local CLI stack                                                                                             | deterministic synthetic fixtures                |
| Staging     | protected `staging` branch | `colorplay-staging-web` | `staging.colorplayapp.com` | existing project ref `onkxnkzeixpezetkmocf`, renamed `colorplay-staging` after the approved reset procedure | approved content plus fixture identities only   |
| Production  | protected `main`           | `colorplay-web`         | `colorplayapp.com`         | new clean `colorplay-production` project                                                                    | approved content and authorized real users only |

The owner adopted ADR 0002's clean-environment approach on 2026-08-05:

- The existing hosted `colorplay_v1` project becomes Staging only after backup,
  preservation review, migration reconciliation, and a separately approved
  destructive reset.
- A clean `colorplay-production` project is created from tracked migrations.
- `colorplayapp.com` remains on its current service until the new Production
  environment passes its gate; cutover must be explicit and reversible.
- Staging and Production never share Supabase URLs, keys, Auth users, database
  passwords, service credentials, SMTP credentials, or student records.
- Both environments use real hosted Vercel and Supabase services. "Real hosted"
  does not mean "shared Production data."

### Verified current state (2026-08-05)

- GitHub authority: `peiyi-liu/colorplay_v1`.
- Remote `main`: `24ee1ee` at the time of verification; re-check before use.
- Vercel currently exposes one project named `colorplay-staging`, but its latest
  Production URL is `https://colorplayapp.com`; the name does not reflect its
  present role.
- `staging.colorplayapp.com` does not resolve yet.
- Supabase currently exposes one healthy hosted project: `colorplay_v1`, ref
  `onkxnkzeixpezetkmocf`, Seoul region, PostgreSQL 17.
- The hosted database contains development history, including 27 profiles,
  57 Quiz Sessions, 23 Live Sessions, and 40 Mistake Items; no individual
  identity was inspected for this inventory.
- Hosted `content_versions` currently contains zero rows.
- Supabase Security Advisor reports a `security_definer_view` error for
  `public.quiz_session_question_state` plus warnings that require intentional
  authorization review.
- Hosted migration identifiers diverge from later tracked migration filenames;
  migration reconciliation is required before reset or cutover.

These facts are observations, not authorization to mutate hosted resources.

### Approved backup and clean-rebuild policy

Before the current hosted project is reset into Staging, the release operator
must produce all of the following:

- an encrypted database backup;
- a schema and migration-history comparison;
- aggregate row counts without exposing personal data;
- a Storage bucket and object inventory;
- a manifest recording the project ref, backup time, operator, checksums,
  encryption method, and planned destruction date.

The clean Staging rebuild restores none of the current Auth users, profiles,
progress, Quiz Sessions, Live Sessions, Mistake Items, mastery records, XP,
Token, inventory, or rewards. It recreates only reviewed fixture identities,
the separately provisioned Staging Admin and teacher identities, and approved
content from tracked inputs.

The encrypted backup is retained outside the repository for 30 days solely for
verification and recovery. Passing the Staging gate does not automatically
delete it: destruction still requires explicit owner authorization, must verify
the backup target and retention deadline, and must leave a non-secret audit
record. No password, private key, database credential, or backup payload enters
Git history, logs, artifacts, or the Program Tracker.

## Approved Admin and security decisions

- `admin` is a distinct account role, not a teacher elevated temporarily.
- Admin signs in through the existing teacher portal and is routed to `/admin`.
- Student and teacher access to `/admin` is rejected server-side.
- Admin must enroll and use TOTP MFA; there is no email bypass.
- Each Admin has one privileged session: 15-minute idle expiry, 8-hour absolute
  expiry, and fresh TOTP after 10 minutes for critical operations.
- Server-side `admin_sessions` state invalidates prior privileged sessions; a
  client-only logout or stale JWT is insufficient.
- The first Admin is provisioned out of band by the owner. Existing Admins may
  issue expiring, one-time invitations. The last active Admin cannot be removed.
- `/admin` uses domain management pages plus a safe database browser. It does
  not provide raw SQL or unrestricted cell editing.
- Personal data is masked by default. Revealing or exporting it requires a
  stated purpose, fresh MFA when required, and an immutable audit record.
- Password hashes, session tokens, TOTP secrets, API keys, and service-role
  credentials are never displayed or exported.
- Formal records use archive/deactivate semantics. Permanent deletion is not
  available in `/admin`; only the owner may run a separately reviewed
  maintenance procedure after confirming backup status.
- XP, Token, mastery, attempts, roles, and MFA are changed only through named,
  audited commands. Ledger history is corrected with compensating entries, not
  rewritten.
- Staging Admins may operate dedicated fixture personas. Production Admin
  previews of real student or teacher pages are read-only and visibly labeled.

## Approved content and publication decisions

- Google Sheets is the authoring source for chapter names, sections, review
  cards, section-question banks, and chapter-final question banks.
- Content is imported into Staging, validated, and frozen as an immutable,
  versioned release candidate.
- Production does not allow direct editing of an already published content
  version. The owner reviews a diff and re-verifies TOTP before publishing.
- A failed publication leaves the previous complete version active. Rollback
  selects a previously complete version; it does not partially rewrite rows.
- Updating content does not rewrite completed remediation or mastery history.
- Publishing a new version immediately cancels in-progress autonomous Quiz
  Sessions and Live Sessions using old content.
- A canceled autonomous Quiz Session produces no score, failure, Mistake Item,
  reward, attempt, or mastery change; it retains audit evidence only.
- A canceled Live Session uses the approved safe settlement: retain only
  server-confirmed per-question points, XP, and Token already earned; omit
  completion, rank, streak, badge, mastery, formal grade, and class-average
  effects; mark the result and leaderboard unofficial; settle idempotently.

## Approved learning progression decisions

The six formal chapters are:

1. 認識色彩
2. 色彩呈現
3. 色彩表示
4. 色彩感知
5. 色彩認知
6. 色彩應用

Chapter completion is server-authoritative and requires all of the following:

- all review cards completed;
- every section challenge completed with mastery at or above 80%;
- the chapter-final challenge completed with mastery at or above 80%.

Completing Chapter N permanently unlocks Chapter N+1. Unlocked or completed
chapters never relock. Direct URLs and RPCs must return a locked result and the
unmet conditions rather than exposing answerable content.

Learning Map, review cards, section challenges, chapter-final challenges, and
post-class practice are sequentially gated. Teacher-hosted Live remains
available regardless of the Participant's personal chapter progress. Assignment
is removed from the product and stops accepting new writes; structural cleanup
is a separate migration.

Assessment rules currently approved:

- Pilot question counts: five per section challenge and ten per chapter final.
- Formal content defaults: ten per section challenge and twenty-five per chapter
  final, adjustable only by publishing a new content version.
- A versioned blueprint provides concept coverage, unique questions per attempt,
  randomized question and option order, and preference for questions absent
  from the previous formal attempt.
- Question-bank shortage fails the readiness gate; it never silently reduces
  concept coverage.
- The highest valid formal-attempt score across versions is official mastery;
  the UI also shows the latest-version score and both version identifiers.
- Below 80%, the student must review every incorrect question, their answer, the
  correct answer, and the explanation, then explicitly select `完成閱讀` for
  each remediation card before a formal retake opens. No correction question is
  required.

## Approved Learning Hall and JRPG direction

- Student learning experiences use a detailed full-screen JRPG pixel-art Forest
  Kingdom Village rather than a centered letterboxed card.
- The top HUD and map form one visual surface. The HUD consistently shows the
  compact avatar, level, XP, Token, primary navigation, and MENU.
- The map contains six fixed chapter buildings aligned to their terrain plots.
- Selecting a building selects it only; the chapter panel separately exposes
  `進入複習與進度` and, when eligible, `開始挑戰`.
- Map states are distinct: available, in progress, completed, locked by mist,
  content preparing, and load failure.
- Locked buildings use a cloud or mist barrier. Content preparing must use a
  different construction/seal treatment and must not impersonate a learner
  lock.
- The guide character moves near the selected building and communicates through
  an RPG Window. The current-location text is omitted.
- Desktop places the chapter panel at the map's lower right; short landscape
  places it below and right of the map; portrait places it below at full width.
- Chapter interiors use a building scene plus JRPG quest board for sections,
  review cards, challenges, remediation, progress, and rewards.
- Completing a challenge returns to the map. New chapter unlocks receive a
  short presentation. Returning students resume the last viewed chapter.
- Only the Shop displays full character art with Chinese character names. HUD,
  map summaries, rankings, and student summaries keep compact avatars.
- All requested routes will eventually share the JRPG visual language and use
  deliberate scene transitions rather than abrupt page replacement.

## Protected work in progress

Do not overwrite, stash, reset, or accidentally stage unrelated changes.

### Primary worktree

- Path: repository root
- Branch at verification: `feature/v2-major-update`
- HEAD at verification: `89180f3`
- State: dirty and behind its remote tracking branch by six commits
- Known unrelated WIP includes `.gitignore`, content review/import files,
  `package.json`, `scripts/content/import-fixes.json`,
  `src/features/auth/pages/login-page.tsx`, content seeds, generated content
  helpers, design artifacts, and agent/tool metadata.

### Learning Map worktree

- Path: `.worktrees/shop-avatar-hud-top`
- Branch: `codex/shop-avatar-hud-top`
- HEAD at verification: `9cc63c4`
- Protected uncommitted Learning changes:
  - `tests/e2e/chapter-select.spec.ts`
  - `tests/e2e/helpers/quiz.ts`
  - `tests/e2e/learning-experience.spec.ts`

Use exact-path staging. Never use `git add -A`, destructive reset, broad restore,
stash, or branch switching in a dirty shared worktree.

## Remaining decisions

### Phase 0

- Migration-history reconciliation method and pass criteria.
- Vercel project rename/new-project order and zero-downtime domain cutover.
- DNS ownership and change procedure for `staging.colorplayapp.com`.
- Auth Site URL, redirect, SMTP, and email-template values per environment.
- Secrets ownership, rotation, incident response, and recovery contacts.
- Production backup/restore objective and evidence compatible with the selected
  Supabase plan.
- CI jobs and human approval gates for Staging and Production.
- Release record format, monitoring, rollback, and post-deploy smoke.

### Later phases

- Teacher manual unlock semantics, expiry, reversal, and audit presentation.
- Exact XP, Token, badge, and anti-farming rules for autonomous and Live work.
- Teacher report calculations and privacy-preserving exports.
- Admin information architecture and per-table sensitivity catalog.
- Detailed map motion, transitions, guide dialogue, and chapter-interior layouts.
- Real-device acceptance supplied by a human before formal release.

## Restart checklist

Every new agent or work session must:

1. Read `AGENTS.md`, `CONTEXT.md`, and this tracker.
2. Read only the current phase's approved spec, plan, and directly relevant ADRs.
3. Re-check Git branch, HEAD, remote SHA, worktrees, and dirty files.
4. Re-check Vercel projects/deployments/domains and Supabase projects before
   reporting any hosted state.
5. Keep confirmed facts, owner decisions, inferences, and open questions
   explicitly separate.
6. Continue from `Immediate next action`; do not restart completed phases or
   revive superseded plans.
7. Update this tracker when status changes, with commit/deployment/migration
   evidence where applicable.

## Definition of tracker statuses

- `Decisions captured`: owner choices are recorded, but no standalone spec has
  been written or approved.
- `Design in progress`: the brainstorming gate is active; implementation is not
  authorized.
- `Planned`: an approved spec and implementation plan exist.
- `In progress`: implementation has begun on an isolated, named branch or
  worktree.
- `Staging accepted`: the exact Staging SHA and migration range passed the named
  automated and human gates.
- `Production released`: the exact Production SHA, migration range, Vercel
  deployment, domain smoke, and non-mutating production verification are
  recorded.
- `Blocked`: a named external decision, credential, service state, or unresolved
  product contradiction prevents meaningful progress.
