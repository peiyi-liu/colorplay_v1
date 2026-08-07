# Phase 0 Task 4 Report

## Summary

Split Feature CI into eight uniquely named, independently provisioned checks and
added a protected, exact-SHA owner-approval dispatch. Added reviewable desired
rulesets for `staging`, `main`, and `prod-*` tags with no bypass actors, deletion
or force-push path.

## Scope

- Phase 0 plan Task 4 and design §9.
- Repository workflow and desired-state configuration only. No GitHub ruleset,
  Environment, branch, status, or hosted setting was created or changed.

## Files

- `.github/workflows/ci.yml`
- `.github/workflows/owner-approval.yml`
- `.github/rulesets/staging.json`
- `.github/rulesets/main.json`
- `.github/rulesets/production-tags.json`
- `tests/contracts/delivery-config.test.ts`
- `tests/contracts/phase0-workflows.test.ts`
- `.superpowers/sdd/progress.md`

## Verification

- TDD RED: 8 contract failures identified the single legacy job, `main` PR
  target, missing isolated Local/E2E runners, owner workflow, and three rulesets.
- GREEN: delivery/workflow contracts passed 2 files / 14 tests.
- `pnpm lint`, `pnpm typecheck`, scoped Prettier, and `git diff --check` passed.
- Each CI job checks out, installs the packageManager-pinned pnpm, uses Node
  24.13.1, and performs a frozen install without a hosted secret.
- Owner approval uses `workflow_dispatch`, protected `staging-approval`, read-only
  PR metadata, exact current head verification, and a single status write; it
  does not checkout or execute PR code.
- Desired ruleset payloads were checked against the current GitHub repository
  rules API shape; local JSON contract tests verify all nine unique contexts.

## Risk

The ruleset files are desired state, not proof of hosted enforcement. Applying
them remains a future owner-gated mutation. The owner workflow also cannot be
considered effective until the protected Environment and hosted rulesets are
created and independently verified.
