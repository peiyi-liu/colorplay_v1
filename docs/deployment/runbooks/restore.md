# Isolated Local restore drill

Restore drills accept only `--target local` (or its Local default) and an
explicit backup directory outside the repository, home directory, and filesystem
root. Hosted URLs, project refs, broad paths, and the everyday `colorplay` Local
stack are rejected.

The runner verifies the encrypted manifest checksum before invoking age, then
verifies each encrypted payload checksum before decryption. It creates a unique
`mktemp -d` Supabase workdir and project/port set. Existing Supabase platform
roles make only duplicate `CREATE ROLE` statements idempotent; every other role
statement remains fail-closed. The disposable cluster's `supabase_admin`
superuser applies roles, schema, and data; hosted Production credentials are
never used as the restore target. Schema and data restore into a clean
`template0` database. Production data-only dumps include `pg_dump`'s
trigger-disable and trigger-enable statements so application triggers cannot
run against partially restored reference tables; the triggers are restored
before replay completes, and all SQL remains guarded by `ON_ERROR_STOP`.
Storage and aggregate inventory comparison then run fail-closed.
The runner records elapsed seconds, removes that exact project, and deletes only
the validated temporary root.

Daily `pnpm phase0:contracts` runs only deterministic contracts; it never starts
the true restore E2E. Fake-stack cleanup tests are regression checks, not proof
of a successful real drill.

After separately approving an exclusive Local Supabase/Docker window, checking
the exact committed source SHA and prerequisites (including AWS CLI), run the
single real synthetic drill explicitly:

```bash
PHASE0_RESTORE_E2E=1 pnpm phase0:restore:e2e
```

Without this opt-in the E2E entry exits before creating fixtures or contacting
Docker. It rejects tracked source WIP, preserves prior resource inventories,
uses actual source HEAD and migration bounds, and retains a sanitized receipt
outside Git. Do not retry a failed drill without new owner authorization.

The lower-level synthetic fixture/restore commands are:

```bash
pnpm phase0:backup:create -- --fixture synthetic \
  --output-root artifacts/phase0/synthetic-backup \
  --fake-upload-root artifacts/phase0/fake-s3
pnpm phase0:restore:local -- \
  --backup-root artifacts/phase0/synthetic-backup
```

The fixture identity is synthetic and disposable. A hosted Candidate rehearsal
must instead supply its recovery identity through the protected verification
environment and must never target a linked Supabase project.

The runner refuses an existing report and any colliding temporary project name.
It writes PASS only after bounded cleanup succeeds and verifies no owned
container/network remains and the temporary workdir is removed. Cleanup or
inventory-query failures are nonzero and never produce a success marker.
Production-only application/authorization probes remain explicitly `skipped`
for synthetic fixtures; this drill does not prove Production readiness.
