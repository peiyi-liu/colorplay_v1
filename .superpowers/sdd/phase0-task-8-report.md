# Phase 0 Task 8 Report

## Summary

Added a browser-backed read-only smoke, 30-minute Staging/Production monitoring,
deduplicated incident reporting, and checksum-bound web-only rollback. The smoke
blocks every non-GET/HEAD request before the network and stores only sanitized
counts/statuses.

## Scope

- Phase 0 plan Task 8 and design §12.
- Local fixture servers and fake Vercel command only. No hosted domain, Vercel
  deployment, issue, alias, account, form, or hosted state was accessed/changed.

## Files

- `scripts/release/read-only-smoke.mjs`
- `scripts/release/read-only-smoke.d.mts`
- `scripts/release/rollback-web.sh`
- `.github/workflows/health-monitor.yml`
- `docs/deployment/runbooks/incident.md`
- `tests/contracts/phase0-smoke.test.ts`
- `tests/e2e/release-read-only-smoke.spec.ts`
- `package.json`
- `.superpowers/sdd/progress.md`

## Verification

- TDD RED: 8/8 smoke/rollback cases failed while modules were absent.
- GREEN: smoke contracts passed 1 file / 9 tests; Chromium E2E passed 2/2.
- Local fixture servers observed only GET/HEAD. A deliberate form POST was
  blocked before reaching the server; Service Workers are disabled in the smoke
  context to close that interception bypass.
- Production required zero Staging markers; Staging required exactly one. PRESS
  START, Login, script assets, console, and required network errors were checked.
- Rollback tests proved one/two failures do nothing, the third web failure calls
  only the verified previous deployment ID, and security/data-corruption enter
  manual incident recovery.
- `shellcheck`, `pnpm lint`, `pnpm typecheck`, scoped Prettier, and `git diff
  --check` passed. The rollback script contains no data-layer command.

## Risk

Hosted DNS/TLS/redirect behavior, monitoring schedule, issue permissions, six
post-promotion samples, and real Vercel rollback remain unexecuted. Production
rollback must stay blocked until the current deployment ID and signed release
record are independently bound by the later owner-gated workflow.
