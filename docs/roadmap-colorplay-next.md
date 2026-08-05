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

The first unresolved Phase 0 decision is the external encrypted backup target,
account isolation, and overwrite-protection policy.

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

### Approved migration reconciliation policy

Repository migrations are the only schema authority. Before any hosted reset,
the release operator freezes a repo SHA and compares all of the following:

- migration filenames and checksums in Git;
- the hosted migration ledger;
- the schema produced by replaying Git migrations from an empty local database;
- the current hosted schema.

Every difference is classified as semantically equivalent with a different
version, hosted-only and untracked, repo-only and unapplied, or a
Supabase-managed schema/extension difference. Existing committed migration
files are not renamed, and `migration repair` is not used merely to make the
ledger appear green.

After the encrypted backup is verified, Staging is rebuilt by replaying the
frozen repository migration chain in order. Auth users and sessions, Storage
objects, and cluster-level custom roles receive separate explicit inventory and
cleanup because a linked database reset cannot be assumed to remove them.

Migration reconciliation passes only when:

- migration-zero local reset succeeds;
- the Staging migration list exactly matches the frozen repo list;
- schema diff is empty after documented Supabase-managed exclusions;
- no prior Auth user, session, or Storage object remains;
- Security Advisor has no unresolved error and every warning has an explicit
  disposition plus relevant authorization tests;
- regenerated database types have no unexpected difference.

### Approved two-slot hosted cutover

The Free Plan's two Supabase project slots are rotated without interrupting the
current Production site:

1. Keep the current `colorplayapp.com` deployment and existing hosted Supabase
   project unchanged.
2. Create the second Supabase project as a clean Production Candidate.
3. Create the separate `colorplay-staging-web` Vercel project, temporarily point
   it at the Candidate, and attach `staging.colorplayapp.com`.
4. Replay repository migrations, create fixture identities, and run the full
   Staging gate against the Candidate.
5. After that gate passes, reset the Candidate again, replay the frozen
   migration chain without fixtures, import only approved formal content, and
   rerun the clean Production data and security gates.
6. Build the Production Vercel artifact with the new Production Supabase public
   values. Deploy it first to an isolated candidate URL and perform only
   non-mutating Production smoke checks.
7. After explicit owner approval, atomically promote that exact artifact to
   `colorplayapp.com`. Keep the previous Vercel deployment addressable for
   rollback and use backward-compatible database changes.
8. Only after the new Production site is verified may the old Supabase project
   enter its approved backup, cleanup, and reset procedure. It then becomes the
   permanent `colorplay-staging` project.
9. Repoint `colorplay-staging-web` to permanent Staging, recreate fixtures, and
   rerun the Staging gate.
10. After stability is established, rename the existing Production Vercel
    project from the misleading `colorplay-staging` name to `colorplay-web`.
    Renaming a project is not used as a domain-cutover mechanism.

At no point may both public sites write to the same Supabase project. A Vercel
`READY` result or an HTTP 200 does not authorize promotion; the release record
must bind the tested artifact, Git SHA, migration range, environment, Supabase
project ref, and owner approval.

### Approved DNS ownership and change procedure

Cloudflare remains the authoritative DNS provider for `colorplayapp.com`.
Nameservers are not moved to Vercel, and the existing apex and `www` records are
not changed merely to introduce Staging.

The Staging DNS sequence is:

1. Add `staging.colorplayapp.com` to the new `colorplay-staging-web` Vercel
   project first.
2. Read the exact CNAME and any TXT verification value returned by Vercel at
   that time. Do not hardcode a remembered target.
3. Capture the relevant Cloudflare DNS records and TTLs before mutation.
4. Present the exact proposed additions to the owner. The owner performs or
   explicitly authorizes the Cloudflare mutation.
5. Create the Staging record as `DNS only`; do not enable the Cloudflare proxy
   during initial domain and TLS verification.
6. Wait for DNS propagation and Vercel domain/certificate readiness, then verify
   resolution, HTTPS certificate validity, HTTP-to-HTTPS behavior, a visible
   Staging environment marker, and absence of redirects to Production.
7. Record the operator, previous and new values, UTC time, TTL, Vercel project,
   and verification result in the release record.

Production deployment promotion occurs inside the existing Vercel project and
does not require a DNS cutover. Renaming that project after stability does not
move `colorplayapp.com`. Cloudflare proxying, WAF, or CDN policy is a separate
future decision and is not enabled implicitly.

### Approved Auth URL and SMTP isolation contract

Auth redirects and transactional email are isolated by environment. A redirect
allowlist is not shared across Local, Staging, and Production, and Vercel Preview
URLs do not receive sign-in, OTP, or password-recovery links.

- Local uses `http://127.0.0.1:4173` as its tracked Site URL. Its redirect
  allowlist is limited to loopback hosts on the two approved ports: `4173` for
  the built-app server and `5173` for the Vite development server. The Supabase
  CLI Mailpit instance captures all Local Auth email; Local does not use an
  external SMTP credential.
- Staging uses `https://staging.colorplayapp.com` as its Site URL and permits
  only the exact Staging callback and recovery routes used by the application,
  including `https://staging.colorplayapp.com/reset-password`. Auth email is
  sent as `ColorPlay Staging <staging@colorplayapp.com>` through a dedicated
  Staging SMTP credential. Vercel Preview deployments do not test email-link
  flows; those acceptance tests run on the stable Staging domain.
- Production uses `https://colorplayapp.com` as its Site URL and permits only
  exact Production callback and recovery routes, including
  `https://colorplayapp.com/reset-password`. Auth email is sent as
  `ColorPlay <noreply@colorplayapp.com>` through a dedicated Production SMTP
  credential. Local, Staging, and Preview origins are not accepted redirects.

The two hosted environments use separately verified SMTP credentials and do
not share secrets. The email templates remain tracked and reviewable. SMTP link
tracking must be disabled so the provider does not rewrite single-use Auth
links. Sender-domain SPF/DKIM verification and an end-to-end OTP and recovery
gate are required before either hosted environment is accepted.

Admin TOTP MFA remains a separate factor. It is not delivered by email and has
no email bypass.

### Approved infrastructure custody and secret lifecycle

Infrastructure uses two-person custody without shared daily credentials:

- The owner is the primary account owner for GitHub, Cloudflare, Vercel,
  Supabase, Resend, and the encrypted recovery vault.
- One separately identified emergency recovery custodian holds only the access
  needed to recover ownership when the primary owner is unavailable or locked
  out. Where a provider supports member accounts, the custodian uses a distinct
  account and MFA. Where it does not, the custodian holds a sealed encrypted
  recovery package that is never used for routine work.
- Release operators use individually attributable, least-privilege access for
  the shortest practical period. Temporary access is revoked when the approved
  operation ends.
- Product `/admin` authority does not imply infrastructure access. An
  application Admin cannot read or manage Cloudflare, Vercel, Supabase, Resend,
  GitHub, backup, or deployment credentials.

Browser-publishable Supabase configuration is documented separately from
server secrets. Database passwords, service-role or secret keys, JWT signing
material, SMTP credentials, provider access tokens, backup encryption keys,
MFA recovery codes, and monitoring write keys stay only in the appropriate
provider secret store or encrypted recovery vault. They never enter Git,
issue text, chat transcripts, logs, screenshots, acceptance artifacts, or the
browser bundle. A backup encryption key is not stored beside the backup.

Secret rotation is event-driven rather than ceremonial. Rotation is mandatory
after suspected disclosure, accidental use in the wrong environment, provider
security notice, personnel or role change, loss of a device, use of an
emergency recovery package, or an authorization-boundary change. Rotation
revokes active sessions and obsolete credentials before the replacement is
accepted, updates dependent services in trust order, redeploys the exact
reviewed artifact when necessary, and reruns the affected Auth, secret-scan,
and connectivity gates.

Once per year, the owner and recovery custodian perform a non-disclosing access
inventory and recovery exercise. It verifies that both people can execute the
documented recovery path without revealing secret values in evidence. The
custodian's identity and private contact route are stored outside the
repository and must be assigned before any new hosted project is accepted.

An infrastructure incident freezes Production promotion until containment.
The response record contains only a sanitized timeline: detection source,
affected systems and scopes, revoked credentials and sessions by identifier,
rotation completion, redeployed artifact, verification evidence, owner
decision, and follow-up actions. It never contains the compromised or new
secret values.

### Approved Free Plan backup and restore objective

Production uses an external encrypted backup workflow because the selected
Supabase Free Plan does not provide the required downloadable backup and
point-in-time recovery guarantees. The operational objectives are:

- recovery point objective (RPO): at most 24 hours of committed data loss;
- recovery time objective (RTO): service restoration within 8 hours;
- the RTO is a team operating target, not a Supabase Free Plan service-level
  guarantee, and no seconds-level point-in-time recovery is claimed.

Once per day, an isolated backup job exports database roles, schema, and data as
separate logical artifacts using the reviewed Supabase CLI workflow. The job
also copies every Supabase Storage object separately because a database dump
contains Storage metadata but not the object payloads. Its manifest records the
environment, project ref, frozen repository SHA and migration range, UTC backup
time, CLI version, bucket and object inventory, byte sizes, and cryptographic
checksums without recording credentials or personal-data contents.

Each backup set is encrypted before it leaves the controlled job environment,
stored outside Supabase and Vercel, and retained on a rolling 30-day schedule.
The backup encryption key is kept in the approved recovery vault and never
beside the encrypted backup. Backup access is limited to the infrastructure
owner and emergency recovery custodian. Expired sets are deleted with a
non-secret audit record; backup data is never reused for analytics, development,
or test fixtures.

A job is successful only when all expected artifacts exist, checksums verify,
the encrypted set can be opened in the verification environment, and the
manifest matches the source inventory. A missing or invalid backup that would
breach the 24-hour RPO alerts the owner and recovery custodian, freezes
Production promotion, and remains an incident until a valid replacement exists.

Once per quarter, the newest backup is fully restored into an isolated Local
Supabase environment with external email and outbound integrations disabled.
The exercise verifies migrations, roles, Auth records, representative table
counts and invariants, Storage inventory and sampled object checksums, RLS and
authorization gates, and application startup. Before a major Production
release, the same restore path is rehearsed against the isolated Hosted
Candidate used by the approved two-slot procedure.

Restore evidence contains only checksums, aggregate counts, timings, pass/fail
results, and operator approvals. The recovery record names the selected backup,
restored repository SHA and migration range, actual data-loss window, actual
recovery duration, and any manual configuration that had to be recreated.
Repository migrations remain the schema authority; a backup is recovery data,
not a competing source of schema changes.

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

- External backup target, account isolation, and overwrite protection.
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
