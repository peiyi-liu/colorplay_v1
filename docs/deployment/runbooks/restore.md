# Isolated Local restore drill

Restore drills accept only `--target local` (or its Local default) and an
explicit backup directory outside the repository, home directory, and filesystem
root. Hosted URLs, project refs, broad paths, and the everyday `colorplay` Local
stack are rejected.

The runner verifies the encrypted manifest checksum before invoking age, then
verifies each encrypted payload checksum before decryption. It creates a unique
`mktemp -d` Supabase workdir and project/port set. Existing Supabase platform
roles make only duplicate `CREATE ROLE` statements idempotent; every other role
statement remains fail-closed. Schema and data restore into a clean
`template0` database inside that disposable cluster, followed by Storage and
aggregate inventory comparison. The runner records elapsed seconds, removes
that exact project, and deletes only the validated temporary root.

Run a synthetic drill with:

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
