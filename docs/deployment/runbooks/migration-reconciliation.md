# Migration reconciliation

Repository migrations are the only schema authority. Freeze the Git SHA before
collecting evidence and do not rename or edit an existing migration.

## Sanitized inputs

Collect the hosted migration ledger with `supabase migration list`, a schema-only
dump, generated TypeScript database types, aggregate table counts, Auth user
count, Storage bucket object counts/bytes, custom role names, and extension
names. Do not export table rows, identities, session data, URLs with credentials,
or credential values. Store these temporary inputs outside Git.

Pass the sanitized JSON, schema file, generated types file, and frozen migration
directory to `pnpm phase0:migration:inventory`. Compare the Local replay inventory
and hosted inventory with `pnpm phase0:migration:compare`.

The gate blocks hosted-only, repo-only, semantically renamed/versioned, and
unclassified schema drift. A Supabase-managed schema difference is allowed only
after adding its exact before/after hashes, reason, and authoritative HTTPS
source to `docs/deployment/provider-managed-exclusions.json` in review.
Generated types and custom-role differences follow the same fail-closed rule:
the allowlist must bind the exact hash pair or exact role and direction. Schema
hashing removes PostgreSQL 17's random `\\restrict`/`\\unrestrict` session guard
tokens before comparison; no DDL is removed or normalized.

Never rewrite migration history or alter the hosted ledger merely to make the
comparison green. Resolve formal capability drift with a reviewed forward
migration; otherwise stop the rebuild or promotion.

For the approved two-slot cutover, a legacy Production comparison containing
only reviewed provider-managed drift plus name-matched semantic timestamp drift
may close the Task 14 classification step while remaining `blocked` for
in-place use. It does not authorize `migration repair`, ledger reuse, or a reset
of that project. Task 15 must replay the frozen repository chain from migration
zero on the clean Candidate; any hosted-only, repo-only, name mismatch, or
unclassified schema/type/role/extension difference still blocks that path.
