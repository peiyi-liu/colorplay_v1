# Phase 0 Task 14 Report

## Outcome

Task 14 passed for the approved two-slot Candidate path. The first real
Production backup and isolated Local restore drill passed at frozen source SHA
`9af07ee9ee883d5813a3c2d1deb5e72d3af5fd20`. Current Production remains
unchanged. Its historical ledger is intentionally ineligible for in-place
repair because nine migrations have semantically equivalent names under
different timestamps; Task 15 must replay the repository chain from migration
zero on the clean Candidate.

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

## Verification

- `pnpm test:db`: 48 pgTAP files / 1080 assertions; runtime smoke 3/3;
  integration 12 files / 24 tests, all passed.
- `pnpm phase0:contracts`: 11 files / 108 tests passed.
- `pnpm vitest run`: 135 files / 964 tests passed.
- Focused migration/restore contracts: 2 files / 25 tests passed.
- `pnpm lint`, `pnpm typecheck`, scoped Prettier, ShellCheck, and
  `git diff --check` passed.
- The loopback smoke contract passed 10/10 outside the filesystem sandbox; the
  sandbox itself rejects `listen(127.0.0.1)` with `EPERM`.

## Remaining boundary

No commit in this task has been pushed. No DNS, Vercel deployment, Candidate,
Staging merge, Production migration, reset, promotion, or product-data write was
performed. The next action is owner authorization to push the exact Task 14
closure SHA, rerun protected CI/approval, and only then begin Task 15 on the
clean Candidate.
