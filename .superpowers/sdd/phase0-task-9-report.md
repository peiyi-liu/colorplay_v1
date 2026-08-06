# Phase 0 Task 9 Report

## Summary

Retired the destructive Staging bootstrap and added a fail-closed, resumable
Staging rebuild contract plus exact-SHA Staging deployment and hosted acceptance
workflow. The implementation is repository desired state only.

## Scope

- Phase 0 plan Task 9 and design §13.
- Local contract/static verification only. No Supabase, Vercel, DNS, GitHub
  Environment, protected branch, hosted domain, or fixture account was changed.

## Files

- `scripts/staging/bootstrap-staging-db.mjs`
- `scripts/staging/rebuild-staging.sh`
- `scripts/staging/cleanup-staging.mjs`
- `.github/workflows/staging-deploy.yml`
- `docs/deployment/runbooks/staging-rebuild.md`
- `tests/contracts/phase0-staging-deploy.test.ts`
- `.superpowers/sdd/progress.md`

## Verification

- TDD RED: 8/8 cases failed while the old destructive bootstrap remained and
  the guarded rebuild/workflow did not exist.
- GREEN: Phase 0 Staging/workflow contracts passed 2 files / 15 tests.
- The retired entry always exits non-zero with `UNSAFE_BOOTSTRAP_RETIRED` and
  contains no network, SQL, Auth, API-key, or hosted credential access.
- Rebuild preflight rejects target/SHA/owner/backup/drift/mutation-record
  mismatch before any checkpoint. Every resumable checkpoint re-runs preflight.
- Auth and Storage are cleaned through Supabase administrative APIs and must
  both be zero before fixture creation. Migration replay uses the pinned CLI;
  no migration-ledger row is inserted manually.
- Staging workflow binds the Vercel project ID to `colorplay-staging-web`, checks
  out `github.sha`, deploys tracked Edge Functions from that checkout, aliases
  only `staging.colorplayapp.com`, then requires read-only marker/health,
  three-browser/RWD, Learning Experience cross-account denial, and protected
  real-device approval before setting `staging-gate`.
- `shellcheck`, `pnpm lint`, `pnpm typecheck`, scoped Prettier, and `git diff
  --check` passed.
- Final self-review corrected the smoke CLI flags and replaced an unsupported
  hosted-inventory invocation with a pinned CLI migration-list parity check;
  regression assertions cover both failures.

## Risk

The workflow, Vercel API binding check, hosted rebuild, hosted acceptance, and
real-device approval have not run. They cannot be treated as deployment
evidence until OWNER GATE 0 and the later hosted tasks are authorized.
