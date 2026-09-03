# Phase 0 Task 10 Report

## Summary

Added protected Production Candidate creation and exact-artifact promotion.
Candidate and Promotion use separate GitHub Environments and separate Vercel
credentials; Promotion cannot build or create a second deployment.

## Scope

- Phase 0 plan Task 10 and design §§4, 5, 9, and 11.
- Repository workflows, verifiers, contracts, and runbook only. No Candidate was
  created, no artifact was promoted, and no hosted branch/domain was changed.

## Files

- `.github/workflows/production-candidate.yml`
- `.github/workflows/production-promote.yml`
- `scripts/release/verify-candidate.mjs`
- `scripts/release/verify-main-parity.mjs`
- `docs/deployment/runbooks/production-release.md`
- `tests/contracts/phase0-production-release.test.ts`
- `.superpowers/sdd/progress.md`

## Verification

- TDD RED: 12/12 Candidate, Promotion, and parity tests failed before the new
  files existed.
- GREEN: Production release, evidence schema, and smoke contracts passed 3
  files / 42 tests.
- Candidate verification is checksum-bound and rejects SHA/project/deployment
  mismatch, a Staging gate older than 24 hours, backup evidence older than 26
  hours, Staging marker/redirect, missing deployment protection, fixture
  identities, and non-formal content inventory.
- Candidate requires the exact successful CI/status contexts and matching gate
  run URLs, builds Production config in `colorplay-web`, and deploys with
  `--prod --skip-domain`.
- Promotion obtains only `PROMOTION_VERCEL_TOKEN` inside the protected
  `production` Environment, verifies the draft checksum, promotes the recorded
  deployment, runs three immediate read-only samples, regenerates the final
  record from the actual Environment approval audit, then fast-forwards `main`.
- UTC tag/GitHub Release occur only after main, Vercel source, and local tag SHA
  parity. Post-promote failure invokes the checksum-bound web rollback and marks
  the GitHub deployment failed.
- `pnpm lint`, `pnpm typecheck`, scoped Prettier, YAML parse, and `git diff
  --check` passed.

## Risk

Vercel `promote`/`inspect` behavior, GitHub Environment approval API output,
protected-ref pushes, candidate protection, Production inventory, three-sample
smoke, rollback, tag, and GitHub Release remain unexecuted. OWNER GATE 0 and
explicit hosted authorization remain required before any of them run.
