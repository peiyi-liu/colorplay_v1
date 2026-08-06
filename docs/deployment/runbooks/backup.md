# Production encrypted backup

## Contract

The daily job runs in the protected `production-backup` Environment and accepts
the database, Supabase Storage S3, B2 writer, age recipient, and owner capacity
budget only from protected variables/secrets. Creation uses the write-only B2
key; it has no download or delete operation. Verification runs in the separate
`production-backup-recovery` Environment with a read-only B2 key and the age
identity.

Each set contains encrypted roles, schema, data, Storage objects, and encrypted
manifest under `production/YYYY/MM/DD/<backup-id>/`. Every upload requests B2
Compliance Mode until 30 days after the batch upload. Plaintext exists only in a
0600 temporary directory and is removed by the exit trap. GitHub artifacts are
limited to secret-scanned aggregate metadata and verification results.

## Gates

Success requires all of the following:

- encrypted object and manifest checksums match;
- the verification environment can decrypt the sampled manifest;
- manifest Storage inventory checksum matches source evidence;
- Object Lock is Compliance Mode with 30-day retention;
- lifecycle policy is `production-30d-v1`;
- newest valid backup is no older than 26 hours;
- owner-configured usage is reported at 70%, 85%, and 95%;
- current usage plus the projected next set does not exceed the budget.

An RPO, checksum, decryption, inventory, lock, lifecycle, or projected-capacity
failure marks `backup-freshness` failed, opens or updates the deduplicated backup
incident, and freezes Production promotion. Do not delete locked objects or
silently fall back to a local-only backup.

## Local fixture

`pnpm phase0:backup:create -- --fixture synthetic --output-root <temp> \
--fake-upload-root <temp>` creates only synthetic payloads and an ephemeral
fixture recovery identity. The fake upload tree must contain `.age` files only
and must never be used as Production evidence.
