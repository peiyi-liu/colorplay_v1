# Phase 0 Task 14 Report

## Outcome

Task 14 is **reopened and blocked from Task 15** after independent review. The
first real Production backup and isolated Local restore drill passed at frozen
source SHA `9af07ee9ee883d5813a3c2d1deb5e72d3af5fd20`, but those runs predate the
trusted-harness, provider-read lifecycle, role/Auth/authorization, and
application-startup checks now required by the corrected implementation.
Current Production remains unchanged. Its historical ledger remains ineligible
for in-place repair because nine migrations have semantically equivalent names
under different timestamps. After the corrected Task 14 gate passes, Task 15
must replay the repository chain from migration zero on the clean Candidate.

Local gates now pass in full at commit `d274da0` and remediation from a second
independent review (Codex CLI, single pass) is committed. **This still only
covers local gates and remediation — corrected hosted proof from a protected
ref has not been produced, so Task 14 overall remains not complete and Task 15
must not start.** See "Local gate rerun and second review" below.

## Backup and restore evidence

- Backup run: [31158344282](https://github.com/peiyi-liu/colorplay_v1/actions/runs/31158344282), `success`.
- Immutable prefix: `production/2026/08/07/backup-20260807T074026Z/`.
- Backup created: `2026-08-07T07:40:31.288Z`; verification age:
  `0.01336` hours, below the 26-hour gate.
- Encrypted set size: `1,813,206` bytes. A conservative 30-day daily-backup
  projection is `54,396,180` bytes plus the pre-existing 37-byte canary, or
  approximately `0.6044%` of the owner-configured `9,000,000,000`-byte budget.
- Object Lock: `COMPLIANCE`, 30 days, expiring
  `2026-09-06T07:40:26.000Z`; checksum, decryption, inventory, lock, freshness,
  and capacity decisions all passed.
- Restore run: [31158754421](https://github.com/peiyi-liu/colorplay_v1/actions/runs/31158754421), `success` with
  `LOCAL_RESTORE_VERIFIED`. The restore operation reported approximately 104
  seconds, far below the 8-hour team RTO target.
- A local regression exposed leaked disposable Docker networks after partial
  startup. Cleanup now removes the exact guarded network; the focused real
  restore contract passed without creating another network. Twenty-six older
  disposable networks remain local cleanup debt and were not bulk-deleted.

## Migration reconciliation

- Repository migrations: 57; Hosted ledger entries: 57.
- Exact version matches: 48.
- Semantic name matches with historical timestamp differences: 9:

| Migration name                   | Hosted version   | Repository version |
| -------------------------------- | ---------------- | ------------------ |
| `live_scoring_v2`                | `20260721172757` | `20260724000100`   |
| `live_presenter`                 | `20260722004914` | `20260724000200`   |
| `live_student_experience`        | `20260722014433` | `20260724000300`   |
| `live_report_loop`               | `20260722021546` | `20260724000400`   |
| `live_section_activities`        | `20260722142602` | `20260724000500`   |
| `shop_catalog_v2`                | `20260722161824` | `20260723000400`   |
| `classroom_member_projection_v2` | `20260725153809` | `20260726000100`   |
| `teacher_student_progress`       | `20260725153938` | `20260726000200`   |
| `classroom_join_code_visible`    | `20260727092437` | `20260728000100`   |

The comparator therefore returns `MIGRATION_DRIFT_BLOCKED` with nine
`semantic_equivalent_version_filename` entries and one reviewed
`supabase_managed_schema_extension_difference`. It reports zero
`hosted_only_untracked` and zero `repo_only_unapplied`. This is a deliberate
block on reusing or repairing the legacy ledger, not an unresolved hosted-only
schema authority. Existing migrations were not renamed and `migration repair`
was not used.

Reviewed provider differences are bound to exact schema/type hashes in
`docs/deployment/provider-managed-exclusions.json`: Supabase-managed Auth
indexes and Storage service objects, the Hosted `cli_login_postgres` role, and
Local's default `pg_net` extension. Generated types were regenerated from the
isolated migration-zero schema after the forward migration and match that
schema byte-for-byte.

## Security Advisor disposition

The unchanged Production project reported 1 error, 79 warnings, and 3
informational findings:

- The `security_definer_view` error on `quiz_session_question_state` is fixed by
  forward migration `20260807000100_security_advisor_remediation.sql`. The view
  now uses `security_invoker`; authenticated users receive only safe-column
  privileges, and an owner-bound helper reveals an explanation only after that
  user answered. Cross-student and anonymous access are denied by pgTAP.
- The mutable search path warning on `live_topic_session_id(text)` is fixed by
  the same forward migration.
- All 77 authenticated SECURITY DEFINER warnings exactly match the intended RPC
  surface. Their ACLs are explicit, their search paths are fixed, and existing
  authorization/RLS tests passed. They are retained rather than disabling the
  product API.
- Leaked-password protection is unavailable on the approved Supabase Free plan.
  The warning is accepted until a plan upgrade, with MFA and the approved
  password policy as compensating controls.
- The three RLS-with-no-policy informational findings remain intentionally
  fail-closed behind tested RPC paths.

Production still shows the old Advisor result because Task 14 did not mutate
it. Task 15 must apply the forward migration to Candidate and read Security
Advisor back with zero unresolved error before Staging acceptance.

## Repository changes and commits

- `11d92ec` — safe Security Advisor remediation and pgTAP coverage.
- `42982af` — exact provider-drift classification and schema-dump
  canonicalization.
- `3f1c80c` — bounded restore network cleanup.
- `0c206ee` — isolated generated database types refresh.
- `4a5044a` — trusted restore harness, complete recoverability inventory,
  provider-read B2 lifecycle verification, and aggregate inventory disposition.
- `d274da0` — sanitized restore stack-start failures and stopped probe-skip
  reports from claiming `passed` (see "Local gate rerun and second review").

## Independent review remediation

The complete-range review found that the earlier restore workflow checked out
the caller-supplied backup SHA while recovery secrets were job-wide, database
restore stderr could reach Actions logs, the restore comparison omitted custom
roles/Auth/authorization semantics and application startup, and the lifecycle
label was declared rather than read from Backblaze. Those findings invalidate
the earlier completion claim even though runs `31158344282` and `31158754421`
were green.

The corrected implementation executes recovery only from protected `main` or
`staging` workflow code, binds the decrypted manifest to the requested prefix
and source SHA, scopes recovery secrets to the download step, captures restore
errors in mode-0600 temporary logs, and emits only sanitized failure sentinels.
It compares custom role attributes, aggregate Auth invariants, a deterministic
RLS/policy/ACL/function-authorization hash, row counts, migrations and Storage;
then probes anonymous/authenticated visibility and starts the built application
locally. It also reads the actual `production/` Backblaze lifecycle rule and
requires exactly 30 days uploading-to-hiding plus 1 day hiding-to-delete, while
recording sanitized aggregate-count/Auth/Storage disposition.

The corrected hosted proof cannot be produced from the unprotected feature
branch. It requires owner-authorized push, protected CI/approval and merge to
`staging`, a recovery key that includes `listBuckets`, then fresh backup and
restore runs from the protected ref.

## Local gate rerun and second review (2026-08-09)

A prior handoff left three files modified but uncommitted:
`scripts/backup/restore-local.sh`, `tests/contracts/phase0-backup.test.ts`,
`tests/contracts/phase0-restore.test.ts`. This session reran every local gate
against those changes, ran one independent review round, applied the one
finding it produced, and committed.

**Docker resource audit (read-only, before any gate ran).** The prior "no
residual resources" claim in this task's history was inaccurate. Read-only
inspection found two categories of pre-existing Docker state, neither of
which blocked the DB gate because both are fully isolated from the shared
`project_id=colorplay` stack (ports 54321/54322):

- 12 orphaned `supabase_network_colorplay_restore_<pid>` networks (`5538`,
  `23997`, `24151`, `49365`, `51815`, `55866`, `69294`, `73197`, `75789`,
  `89535`, `91522`, `96625`), each inspected individually and confirmed to
  have zero attached containers and no owning process. These are cleanup
  debt from `docker network rm` calls in `restore-local.sh`'s `cleanup()`
  trap that silently no-op on failure (`|| true`); they are unresolved and
  require explicit owner-authorized deletion, not claimed as zero.
- A separate, fully running isolated replay stack under project id
  `colorplay_task14_9af07ee` (5 healthy containers + 1 network with 5
  attached containers, up 2 days), corresponding to a deliberately retained
  worktree at `/private/tmp/colorplay-task14-local-replay.yzlSSs`. Not new
  debris; left running, not stopped or removed by this session.

**DB gate.** Preflight confirmed no other `test:db`/reset/seed/integration/e2e
process held the shared stack and the target was local `colorplay` on port
54322. `pnpm test:db` ran `supabase db reset --local` against that shared
instance only (Phase 1 Task 13 was coordinated off Local Supabase for this
window) and passed: 48 pgTAP files / 1080 assertions, runtime smoke 3/3,
integration 12 files / 24 tests, GoTrue auth health 200, 10/10 containers
healthy/running, secret scan 0 findings, exit 0. The cleanup trap removed its
own temporary SQL fixture and unset `SUPABASE_*` env vars. Only `db`/`auth`/
`storage`/`realtime` restarted (expected reset scope); `studio`/`pg_meta`/
`rest`/`kong`/`edge_runtime`/`inbucket` were untouched. No new restore
network/container debris was created by this run.

**`database-inventory.json` invariant.** Traced end to end:
`collect-manifest-input.mjs` lists `database-inventory.json.age` as
*optional*, not required, in the manifest's `dump_files` — the manifest
schema itself does not force this file to exist. However
`create-backup.sh`'s `create_production_backup()` path generates it
unconditionally (no fallback; `set -euo pipefail` aborts the whole backup on
failure), so every backup produced by the real production path is guaranteed
to carry it. When the file is absent, `restore-local.sh`'s `else` branch
compares a `public.synthetic_fixture` table; against a real production-like
schema that table does not exist, the comparison query fails, and `set -e`
aborts the script — i.e. the missing-file path is fail-closed for anything
that is not a deliberately constructed synthetic test fixture. This
enforcement is implicit (a query against a nonexistent table failing under
`set -e`), not an explicit check, and `phase0-restore.test.ts` only asserts
the literal string `database-inventory.json` appears in the script source —
there is no behavioral test for the missing-file/non-synthetic-schema case.
Both are recorded as a non-blocking follow-up, not fixed in this pass (adding
that behavioral test is scope beyond the three changed files).

**Second independent review.** Single reviewer, single round, via `codex
review` (non-interactive Codex CLI, no `--uncommitted`/prompt conflict
worked around by letting Codex read `git diff` itself), scoped to exactly the
three files and the same four questions above. No Stop-hook review was
separately triggered, so there is exactly one review round for this diff.
Finding (P2): the `else`/skip path was fail-closed for restore *correctness*,
but `restore-local.sh`'s final report unconditionally wrote
`role_inventory`, `authorization_probe`, and `application_startup` as
`'passed'` even when the probe path never ran — a synthetic-fixture restore
(the one exercised by the passing contract test) would produce a report that
falsely claims those checks executed.

**Fix.** Threaded the existing `application_probe_required` flag into the
report-writing step so those three fields record `'skipped'` when the probe
branch did not run and `'passed'` only when it did. TDD: updated
`phase0-restore.test.ts`'s RTO-report assertions to expect `'skipped'` first
(confirmed RED — `expected 'passed' to be 'skipped'`), then applied the
minimal fix (confirmed GREEN).

**Scoped verification after the fix.** ShellCheck clean;
`phase0-backup.test.ts` + `phase0-restore.test.ts` together 23/23 passed on
two independent reruns (one transient unrelated failure on a run
immediately following the DB gate reset was not reproducible and is recorded
as environmental, not a logic defect — isolated reruns of the same test
passed cleanly at 59s and 65s); full `pnpm phase0:contracts` 11 files / 111
tests passed; `pnpm lint`, `pnpm typecheck`, scoped Prettier, and
`git diff --check` all passed. Chromium gate (3/3) and the full `pnpm vitest
run` (135/967) were verified earlier in this same session, before this
review's fix, and were not rerun again per the no-unnecessary-rerun
instruction — the fix only touches the report-writing branch already
covered by the focused restore/backup rerun above.

Committed as `d274da0` (three files, no `.env`/secrets/artifacts).

## Verification

- `pnpm test:db`: 48 pgTAP files / 1080 assertions; runtime smoke 3/3;
  integration 12 files / 24 tests, all passed (rerun 2026-08-09, see above).
- `pnpm phase0:contracts`: 11 files / 111 tests passed (rerun after fix).
- `pnpm vitest run`: 135 files / 967 tests passed (run before the review fix;
  not rerun after, see scoped-verification note above).
- Focused `phase0-backup.test.ts` + `phase0-restore.test.ts`: 2 files / 23
  tests passed (rerun after fix, twice).
- Chromium gate: 3/3 passed (`release-read-only-smoke.spec.ts` x2,
  `environment-marker.spec.ts` x1); required creating this worktree's missing
  `.env` (gitignored, per-worktree, not carried by `git worktree add`) with
  the same local Supabase demo values as the primary worktree — root-caused
  via `APP_CONFIG_INVALID` before the fix, not a Task 14 code defect.
- `pnpm lint`, `pnpm typecheck`, scoped Prettier, ShellCheck, and
  `git diff --check` passed.
- The loopback smoke contract passed 10/10 outside the filesystem sandbox; the
  sandbox itself rejects `listen(127.0.0.1)` with `EPERM`.

## Remaining boundary

No commit in this task has been pushed. No DNS, Vercel deployment, Candidate,
Staging merge, Production migration, reset, promotion, or product-data write
was performed. **Task 14 overall is still not complete and Task 15 must not
start**, even though local gates are now green and remediation is committed
at `d274da0`.

Docker cleanup debt is real, not zero, and does not block local gates: 12
orphaned `supabase_network_colorplay_restore_<pid>` networks (see above, all
individually confirmed zero-container/no-owner) remain undeleted pending
explicit owner-authorized cleanup; deletion was not performed or authorized
in this session. The separate `colorplay_task14_9af07ee` isolated replay
stack (5 containers + network, healthy, running) was left untouched.

After owner review of this checkpoint, the next hosted actions are: owner
authorization to push the exact remediation SHA (`d274da0`, on top of
`428dc78`), rerun protected CI/approval, merge to protected `staging`,
rotate the recovery credential to add only the required `listBuckets`
capability, and rerun both corrected hosted backup and restore workflows
from the protected ref. A manual `staging.colorplayapp.com` domain bypass
recorded elsewhere in this branch's history does not substitute for that
PR → staging → CI gate sequence.
