# ColorPlay Current Program

- Status: LOCAL IMPLEMENTATION READY — hosted configuration and gates NOT
  EXECUTED; inherited repository gates and OWNER GATE 0 remain blocking
- Last updated: 2026-08-06 (Asia/Taipei)
- Current phase: Phase 0, local Tasks 1–12 implemented and strictly reviewed
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

Resolve the inherited repository gate debt recorded in
`.superpowers/sdd/phase0-task-12-report.md`, then complete OWNER GATE 0 by making
the separate encrypted age-key copy and creating distinct Staging/Production
SMTP credentials. Reverify provider capabilities read-only and obtain explicit
OWNER GATE 1 approval before Task 13. Hosted Tasks 13–18 remain unexecuted: do
not create or reconfigure Vercel/Supabase resources, change DNS, upload hosted
environment variables, reset data, deploy, promote, or push from this state.

## Approved program structure

The owner approved seven independent design, plan, implementation, and release
batches. Each batch must pass its own Staging gate before Production promotion.

| Phase | Scope                                         | Status                                              |
| ----- | --------------------------------------------- | --------------------------------------------------- |
| 0     | Environment and release foundation            | Local Tasks 1–12 ready; hosted Tasks 13–18 blocked  |
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

### Approved CI and deployment approval gates

- A Feature branch enters Staging only through a Pull Request to the protected
  `staging` branch. Required checks cover formatting, lint, typecheck, unit
  coverage, build, a clean Local Supabase replay, pgTAP and integration tests,
  Chromium E2E, and credential scanning. The owner must approve the Pull Request
  before merge.
- Merging `staging` automatically deploys that commit to
  `staging.colorplayapp.com`, then runs hosted smoke and the affected Phase's
  acceptance gate. Firefox, WebKit, responsive viewport, and human real-device
  acceptance belong to the Staging gate rather than every Feature Pull Request.
- Updating `main` never automatically releases Production. The approved Staging
  Git SHA is built as an isolated Production Candidate with Production
  configuration. Its release evidence binds the Git SHA, Vercel deployment ID,
  migration range, Supabase project ref, and test results.
- Promotion requires explicit owner approval through the GitHub Production
  Environment. The exact approved Candidate artifact is promoted; it is not
  rebuilt after approval. The protected `main` ref must finish at the same Git
  SHA served by Production.
- Any missing check, evidence binding, owner approval, or SHA match fails closed
  and cannot be bypassed by an HTTP 200 or Vercel `READY` state alone.

### Approved Production release record

- Each successful Production promotion creates a protected tag named
  `prod-YYYYMMDD-HHMM` that points to the exact Production Git SHA. A GitHub
  Release attached to that tag is the human-readable authoritative release
  record, while GitHub Deployment history preserves the Production Environment
  approval.
- The Release attaches a generated `release-record.json` and checksum. The
  record binds the Git SHA, Vercel deployment ID, Production Supabase project
  ref, migration range, Staging and Production gate runs, owner approval and
  timestamp, post-deploy smoke result, and previous rollback deployment ID.
- Release records contain no passwords, keys, Student data, or other personal
  information. The repository stores only the record schema, template, and
  generation and verification tooling.
- No documentation commit is added to `main` after promotion merely to record
  the release; doing so would make `main` differ from the deployed SHA.

### Approved monitoring, smoke, and rollback policy

- Immediate Production smoke is read-only. It verifies DNS, TLS, HTTP success,
  PRESS START, Login rendering, JavaScript and CSS loading, public health calls,
  absence of a Staging marker or redirect, and zero required-console or network
  errors. It never signs in with a test account or writes Production data.
- A critical smoke result is retried and must fail three consecutive times
  before the promotion is classified as failed. The workflow then restores the
  Vercel alias to the previous healthy deployment named in the release record
  and alerts the owner.
- Automatic rollback changes only the web artifact. It never runs a database
  down migration. Release migrations must be backward compatible with the
  previous web artifact. Suspected data corruption, authorization failure, or a
  security incident stops automation and enters the separately reviewed
  recovery procedure.
- Production and Staging receive scheduled read-only health checks. Sampling is
  more frequent during the first 30 minutes after a release and continues every
  30 minutes afterward. Persistent failure creates a GitHub Issue and notifies
  the owner; provider dashboards are supplementary rather than authoritative.
- A daily backup monitor verifies that the newest B2 backup is no more than 26
  hours old and that its checksum, Object Lock, and lifecycle metadata are
  valid. It alerts at 70%, 85%, and 95% of an owner-configured storage budget;
  the Backblaze free-tier allowance is never hardcoded. Vercel, Supabase, and B2
  native usage and error notifications are enabled when available.

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

### Approved Backblaze B2 backup target

Production backup sets are stored in a dedicated Backblaze B2 account rather
than in Supabase, Vercel, the Cloudflare account that controls Production DNS,
GitHub, or a local disk. The B2 account follows the approved two-person custody
policy and uses its own MFA, recovery material, billing alerts, and private
contact path.

The backup bucket is private, has no public URL, custom domain, anonymous list
access, or browser CORS policy, and is used only for encrypted ColorPlay backup
artifacts. Every uploaded object receives a 30-day Backblaze Compliance Mode
Object Lock. The retention period cannot be shortened or bypassed by the backup
job, release operator, or routine account administration. Expiration automation
may delete a set only after its lock has expired and the rolling 30-day
retention condition is satisfied.

Client-side encryption occurs before upload, in addition to provider encryption
at rest. The client-side decryption material stays in the separate recovery
vault. Object names and manifests use non-personal identifiers and never expose
student, teacher, class, or email data.

Automation uses a bucket-scoped writer credential that cannot administer the
account, change retention, read unrelated objects, or delete backup sets. A
separate read-only recovery credential is activated only for integrity checks
and approved restore exercises. The primary B2 account credential is never used
by CI or a backup script. Access, failed uploads, retention state, capacity, and
unexpected deletion attempts are included in the sanitized backup evidence.

The owner accepts encrypted backup storage in the United States and selected
the Backblaze US West region. The account therefore stores data in Backblaze's
US West facilities and is not described as Taiwan- or Asia-resident. The
cross-border location must be reflected in the applicable privacy notice,
school authorization, and vendor-processing record before real student data is
uploaded.

On 2026-08-05, the owner reported that a dedicated Backblaze account had been
created in US West, that TOTP MFA is enabled, and that its recovery codes are
safely stored. An owner-supplied Backblaze screenshot dated the same day shows
an empty Private Bucket on a US West endpoint with provider-side encryption
enabled, lifecycle set to keep all versions, and a default Object Lock retention
of 30 days. Although the Bucket card does not identify the retention mode, a
subsequent owner-supplied file-details screenshot shows that the non-personal
canary is protected in Compliance Mode from its 2026-08-05 14:51 UTC upload
through 2026-09-04 14:51 GMT, confirming the approved 30-day immutable window.
The owner subsequently reported creating and securely storing a standard
Application Key restricted to this Bucket, `Write Only` access, and the
`production/` object-name prefix. Later that day, the owner ran a sanitized CLI
gate using that canary under `production/verification/`: the writer uploaded
inside the approved prefix and was rejected when attempting an outside-prefix
upload, read, and deletion. Temporary authentication data was cleared after the
gate.

The owner also reported creating and separately securing a second standard
Application Key restricted to the same Bucket and prefix with `Read Only` access
for approved integrity checks and recovery exercises. A second sanitized CLI
gate confirmed that this credential can list the approved prefix and download
the exact writer canary, while upload and deletion attempts are rejected.
Temporary authentication data was again cleared after the gate. Client-side
encrypted backup upload, free-tier capacity monitoring, the first observed
lifecycle execution, and a restore test remain outstanding. On 2026-08-05, the
owner reported saving and reopening a custom Lifecycle Rule scoped to
`production/` that hides objects 30 days after upload and deletes them one day
after hiding. The configuration is confirmed, but its scheduled execution has
not yet occurred.

The owner selected a free-only B2 posture and has not added a payment method.
Backblaze currently includes 10 GB of free storage without requiring billing
information; the owner reports that charge-based Caps and Alerts cannot be
configured in the account's current state. Free-tier fit is not yet proven for
30 daily encrypted backup sets. The backup design must measure projected retained
bytes before its first real upload and monitor actual account usage without
silently dropping a required backup. The owner-configured capacity budget alerts
at 70%, 85%, and 95%; a projected next backup beyond the remaining budget freezes
Production promotion and opens an incident rather than deleting locked sets or
silently missing the RPO. No Application Key ID, secret value, File ID, object
URL, or Bucket identifier is stored in this tracker.

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
- Every Question has a permanent stable identifier. The system generates it;
  content authors neither invent nor modify it. Google Sheets stores the
  generated value in a protected, visible column. Existing identifiers are
  retained, missing legacy values receive a one-time reviewed backfill, edits
  keep the original identifier, and only a genuinely new Question receives a
  new one. The value is persisted, never calculated from row number, position,
  or mutable Question text. Import fails closed on a missing, duplicate,
  malformed, or conflicting identifier.
- A bound Google Apps Script command named `產生題目識別碼` creates the value
  once for a new Question row, writes a fixed value into the protected
  identifier cell, and does not recalculate it. The website and content importer
  receive read-only Sheet access and only validate the identifier; they never
  write it back. The implementation deliverables include an owner setup guide
  for installing the script, protecting the column, granting the minimum Sheet
  permissions, and verifying generation plus rejection behavior.
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

A Teacher may grant a permanent, chapter-specific access exception to one
Student after entering a reason and confirming the action. The exception does
not mark any chapter complete, change mastery or rewards, satisfy an omitted
prerequisite, or cascade to later chapters. Completing the manually accessible
chapter may unlock its next chapter through the normal completion rule. Teachers
cannot revoke the exception. An Admin may reverse a mistaken grant only while
the Student has no active Quiz Session and no durable chapter activity after
the grant, including review completion, submitted answers, formal attempts,
remediation, rewards, or downstream unlocks. Reversal requires fresh MFA, a
reason, and a compensating immutable audit record; the original grant record is
retained. Once any disqualifying activity exists, the exception remains
permanent.

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
- Every incorrect answer from a non-Live assessment is added to `我的錯題`;
  Teacher-hosted Live answers are excluded. Below 80%, the Student must review
  every incorrect question, their answer, the correct answer, and the
  explanation, then explicitly select `完成閱讀` for each assigned remediation
  card before a formal retake opens. No correction question is required.
- Completing the assigned mistake review awards neither XP nor 金幣, does not
  change mastery, and does not unlock the next chapter. It only completes the
  remediation gate. The Student may continue reviewing without immediately
  retaking, but must later earn at least 80% on a valid formal attempt to satisfy
  the mastery requirement.

Economy and reward presentation decisions currently approved:

- The existing per-answer reward amounts remain in both autonomous Quiz and
  Live: a server-confirmed correct answer awards 50 XP and 15 金幣, increased to
  75 XP and 25 金幣 when answered within five seconds. An incorrect or timed-out
  answer awards neither XP nor 金幣. Session totals continue to scale with the
  number of qualifying correct answers; there is no new fixed session cap.
- Mastery remains accuracy-only; response speed never changes mastery.
- For each Student and logical autonomous challenge, only the first completed
  session on an Asia/Taipei calendar day receives full XP and 金幣. Later
  completions that day remain valid for mastery and formal-retake purposes but
  award 20% XP and zero 金幣.
- Every valid Teacher-hosted Live Session awards full speed-sensitive XP and
  金幣 for server-confirmed answers. Each Student may settle each Live Session
  only once; retries, reconnects, and repeated finalization are idempotent.
  Session creation and settlement remain auditable, and anomalous high-frequency
  activity is surfaced for Admin review instead of applying a daily reward cap.
- Every user-facing web label, result explanation, purchase control, accessible
  name, and HUD summary uses `金幣` instead of `Token` or `代幣`.
- Existing internal database columns, RPC payload fields, TypeScript property
  names, and ledger source identifiers that contain `token` remain unchanged;
  this is a presentation-language change, not a schema migration.

Achievement decisions currently approved:

| Badge      | Server-authoritative trigger                                                |
| ---------- | --------------------------------------------------------------------------- |
| 初出茅廬   | Complete the first valid non-Live formal challenge                          |
| 百發百中   | Answer every question correctly in one valid formal challenge               |
| 不屈不撓   | Complete explanation review for ten distinct Mistake Items                  |
| 章節精熟   | Complete and master the first chapter                                       |
| 色彩大師   | Complete and master all six chapters                                        |
| 登峰造極   | Reach Level 10                                                              |
| 連擊之王   | Answer twenty consecutive questions correctly in non-Live formal challenges |
| 課堂挑戰者 | Complete five valid Teacher-hosted Live Sessions                            |
| 收藏家     | Own all six initial characters                                              |

The nine existing badge identities remain. Unlocking a badge awards no extra XP
or 金幣; badges are recognition and progress markers rather than a second reward
ledger. `不屈不撓` deduplicates by the Question's permanent stable identifier:
the same Question counts at most once per Student across assessments, formal
retakes, and content versions. It counts only after the Student explicitly
completes its explanation review; repeated review never increments it. Minor
wording edits that retain the stable identifier remain the same Question.

## Approved Learning Hall and JRPG direction

- Student learning experiences use a detailed full-screen JRPG pixel-art Forest
  Kingdom Village rather than a centered letterboxed card.
- The top HUD and map form one visual surface. The HUD consistently shows the
  compact avatar, level, XP, 金幣, primary navigation, and MENU.
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

### Phase 0 release-foundation worktree

- Path: `.worktrees/phase0-release-foundation`
- Branch: `phase0/release-foundation`
- Plan base: `2295fd6c430fc4a843d2da3e391fd0d48b902704`
- State: local Tasks 1–12 implemented and strictly reviewed; no hosted mutation,
  push, deployment, DNS change, reset, Candidate, or Production promotion
- Preserve exact-path staging. The inherited formatting, coverage, and four
  Chromium E2E failures are recorded with plan-base reproductions in the Task 12
  report and must not be hidden by lowering gates.

Use exact-path staging. Never use `git add -A`, destructive reset, broad restore,
stash, or branch switching in a dirty shared worktree.

## Remaining decisions

### Phase 0

- No unresolved design choice. Local repository implementation is ready, but
  hosted execution is blocked until inherited repository gates are repaired,
  OWNER GATE 0 is complete, provider capabilities are freshly reverified, and
  the owner explicitly approves the exact Task 13 mutations.
- OWNER GATE 0 still lacks a separate encrypted age-key copy and distinct
  Staging/Production SMTP credentials. The Apple Note copy alone is not the
  approved independent recovery copy.

### Later phases

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
