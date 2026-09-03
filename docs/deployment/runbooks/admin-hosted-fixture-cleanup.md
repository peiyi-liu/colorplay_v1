# Hosted Admin fixture cleanup

This runbook defines the cleanup boundary for the owner-gated Phase 1/Admin B
Staging verification. It does not authorize a deployment, fixture creation,
database write, Auth mutation, or cleanup run.

## Scope and invariants

The runner deletes only UUIDs listed in one reviewed manifest. It never locates
users by Email, account name, suffix, wildcard, role, time window, or project
inventory. It is deliberately separate from `cleanup-staging.mjs`, whose
`auth` mode removes every Auth user and is valid only inside an independently
authorized full Staging rebuild.

The manifest is rejected unless it binds all of the following:

- `environment: "staging"`, the exact 20-character Supabase project ref, and a
  unique non-secret run ID;
- the exact deployed Git SHA, Vercel deployment ID, expected migration head,
  and SHA-256 of the complete ordered migration ledger;
- every fixture Auth UUID and role label, with the exact same UUID set repeated
  under `profile_ids`;
- every Admin Auth UUID, plus every non-Admin denial actor that acquired one,
  paired with its immutable `admin_audit_principals` UUID;
- exact UUID lists for Admin sessions, invitations, security operations,
  command authorizations, command executions, and private teacher-account
  operations;
- a unique owner cleanup operation UUID used for the preserved audit record.

Unknown keys, duplicate UUIDs, an Admin without a principal mapping, a profile
set that differs from the Auth set, an environment mismatch, or a migration
mismatch fails closed. The database preflight also rejects an unlisted related
Admin row and any product-domain foreign-key row that refers to a target
profile/Auth UUID. The only permitted cascade rows are the automatic account
bootstrap state: zero token balance, the single default Blook, and the single
default avatar frame while the profile still selects those defaults, plus only
the achievement progress/unlock rows whose source is that default Blook event.
Any balance, purchase, extra entitlement, later achievement source, or
non-default equipment blocks cleanup.

The migration ledger digest is SHA-256 over the UTF-8 migration versions in
ascending order, joined with LF and without a trailing LF. Matching only
`max(version)` is insufficient: a missing older migration or same-head fork
must fail even when the displayed head is unchanged.

Audit events are append-only and remain as non-secret evidence. An Admin audit
principal is tombstoned rather than deleted. The verifier defines zero residue
as: no target Auth user, profile, active principal mapping, Admin identity,
session, invitation, security operation, command authorization/execution, or
teacher-account operation. Supabase-owned Auth factors/sessions are removed by
the exact Auth user deletion.

## Manifest shape

Values below are syntactic examples only. Create the real manifest in a private
temporary/evidence location and never commit it.

```json
{
  "schema_version": 1,
  "environment": "staging",
  "project_ref": "aaaaaaaaaaaaaaaaaaaa",
  "run_id": "admin-b-hosted-yyyymmdd-01",
  "git_sha": "0000000000000000000000000000000000000000",
  "deployment_id": "dpl_0000000000000000",
  "expected_migration_head": "20260903000400",
  "expected_migration_ledger_sha256": "0000000000000000000000000000000000000000000000000000000000000000",
  "cleanup_operation_id": "00000000-0000-4000-8000-000000000001",
  "auth_users": [
    {
      "label": "phase1-bootstrap-admin",
      "id": "00000000-0000-4000-8000-000000000002",
      "role": "admin"
    },
    {
      "label": "admin-b-created-teacher",
      "id": "00000000-0000-4000-8000-000000000003",
      "role": "teacher"
    }
  ],
  "profile_ids": [
    "00000000-0000-4000-8000-000000000002",
    "00000000-0000-4000-8000-000000000003"
  ],
  "admin_principals": [
    {
      "auth_user_id": "00000000-0000-4000-8000-000000000002",
      "audit_principal_id": "00000000-0000-4000-8000-000000000004"
    }
  ],
  "rows": {
    "admin_sessions": [],
    "admin_invitations": [],
    "admin_security_operations": [],
    "admin_command_authorizations": [],
    "admin_command_executions": [],
    "teacher_account_operations": []
  }
}
```

The repository-local `adminPrimary` and `adminSecondary` identities are
forbidden on non-local projects and must not appear in this manifest.
Every dedicated Hosted fixture must instead carry server-owned Auth
`app_metadata` values `colorplay_fixture_environment=staging`, the exact
`colorplay_fixture_run_id`, and its exact `colorplay_fixture_label`. A UUID
whose metadata does not match is treated as a real/non-target user and blocks
both preflight and deletion.

## Protected environment inputs

Provide these values through the operator's protected environment; never paste
their values into chat, the manifest, shell history, logs, or artifacts:

- `STAGING_SUPABASE_SERVICE_ROLE_KEY`
- `STAGING_DATABASE_URL`

The following non-secret target assertions must also be set and must match the
manifest exactly:

- `STAGING_PROJECT_REF`
- `STAGING_EXPECTED_PROJECT_REF`
- `STAGING_SUPABASE_URL`
- `STAGING_GIT_SHA`
- `STAGING_DEPLOYMENT_ID`

The database URL must use the direct
`db.<project-ref>.supabase.co:5432/postgres` endpoint. The runner parses it in
memory and forwards connection fields to the pinned PostgreSQL container as
environment variables; the password is never put in a command argument or
printed. Direct psql is restricted to transactions declared read-only and is
used only for dry-run/verify. The database mutation is available solely through
the migration-defined `cleanup_hosted_admin_fixtures` RPC, which is revoked
from `public`, `anon`, and `authenticated` and granted only to `service_role`.
Database and Auth failures emit stable codes only.

## Dry-run, execute, verify

First run the read-only preflight. It writes a mode-0600 receipt to a new path;
an existing receipt is never overwritten.

```bash
pnpm staging:admin-fixture-cleanup -- \
  --manifest /private/path/admin-fixtures.json \
  --receipt /private/path/admin-fixtures.receipt.json
```

The receipt contains only target identifiers already present in the manifest,
the manifest SHA-256, timestamps, migration head, migration-ledger SHA-256, and
aggregate target counts. It expires after 30 minutes. Review the dry-run result
before requesting the one-time owner authorization.

Execution additionally requires the exact confirmation string and the
protected execution flag. This example shows variable names only:

```bash
STAGING_ADMIN_FIXTURE_CLEANUP_EXECUTE=yes \
pnpm staging:admin-fixture-cleanup -- \
  --execute \
  --manifest /private/path/admin-fixtures.json \
  --receipt /private/path/admin-fixtures.receipt.json \
  --confirmation CLEANUP_ADMIN_FIXTURES:<project-ref>:<run-id>
```

The runner revalidates the receipt and Auth metadata, then invokes the
service-role-only RPC. The RPC revalidates the ordered migration ledger and
Auth metadata inside its transaction, takes a run-scoped advisory lock, applies
the relationship guards, deletes exact database rows, and tombstones Admin
principals atomically. The runner then deletes only the listed Auth UUIDs
through the Admin API and immediately performs read-only zero-residue
verification. It is idempotent for recovery from an Auth API interruption:
already-absent exact rows/users are accepted, while any new unlisted related row
blocks the retry. The append-only audit event records only
`database_cleanup_complete`; it does not claim cross-system success before Auth
deletion and final verification finish.

A later read-only verification is available without a receipt:

```bash
pnpm staging:admin-fixture-cleanup -- \
  --verify \
  --manifest /private/path/admin-fixtures.json
```

Success output is limited to
`ADMIN_FIXTURE_CLEANUP_DRY_RUN_COMPLETE` or
`ADMIN_FIXTURE_CLEANUP_VERIFIED`. Do not mark Task 7 complete until the latter
is recorded together with the exact deployment/migration evidence.
