# Staging rebuild and exact-SHA deployment

The retired `bootstrap-staging-db.mjs` is intentionally unusable. Do not restore
its Management API or hand-written migration-ledger behavior.

## Rebuild authorization

Before a rebuild, freeze the Git SHA and exact Staging project ref. Produce a
fresh hosted-mutation record for action `rebuild-staging`, a passing encrypted
backup verification result, and a passing migration reconciliation result.
Owner authorization and all evidence must refer to the same target and SHA.

Run `scripts/staging/rebuild-staging.sh --preflight-only` first. Execution also
requires `STAGING_REBUILD_EXECUTE=yes`. The script revalidates the target and
evidence before every checkpoint, and records completion under a private state
directory. A restart may resume a completed checkpoint only after the same
verification succeeds again.

The checkpoints are database reset through the pinned Supabase CLI, Auth
cleanup, Storage API cleanup, migration replay verification, approved content
import, and fixture creation. Auth and Storage must both report zero objects
before fixtures are created. Never insert migration ledger rows manually.

## Deployment

A protected push to `staging` deploys only `github.sha` to the separately bound
`colorplay-staging-web` Vercel project and the separately configured Staging
Supabase ref. The only alias is `staging.colorplayapp.com`. Edge Functions are
enumerated from that checkout and recorded with the deployment ID and SHA.

The hosted gate checks the visible Staging marker, read-only runtime health,
Learning Experience acceptance, Chromium/Firefox/WebKit at 1280×720, 812×375,
and 375×812, cross-tenant RLS negatives, console/network health, then pauses for
the protected real-device approval. Only after that approval is `staging-gate`
set to success.
