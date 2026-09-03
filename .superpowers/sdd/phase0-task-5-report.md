# Phase 0 Task 5 Report

## Summary

Added deterministic migration inventories and fail-closed reconciliation. The
Local collector reads the actual Local Supabase ledger, schema, generated types,
exact aggregate counts, Auth count, Storage aggregates, custom roles, and
extensions without exporting rows or credentials.

## Scope

- Phase 0 plan Task 5 and design §6.
- Local Supabase only. No linked/hosted project, migration ledger, schema, or
  hosted data was read or changed.

## Files

- `scripts/migration/create-inventory.mjs`
- `scripts/migration/create-inventory.d.mts`
- `scripts/migration/compare-inventory.mjs`
- `scripts/migration/compare-inventory.d.mts`
- `docs/deployment/provider-managed-exclusions.json`
- `docs/deployment/runbooks/migration-reconciliation.md`
- `tests/contracts/phase0-migration-inventory.test.ts`
- `package.json`
- `.superpowers/sdd/progress.md`

## Verification

- TDD RED: 7/7 cases failed while collector/comparator modules were absent.
- Contract GREEN: 1 file / 8 tests passed, covering deterministic hashes and
  sorting, immutable migration files, forbidden row/secret/repair input, all
  four drift classes, and exact provider-managed exclusions.
- Clean Local Supabase gate: pgTAP 47 files / 1070 tests; runtime smoke 1 file /
  3 tests; integration 12 files / 24 tests; all passed.
- The plan command created a real Local inventory, then self-comparison printed
  `MIGRATION_DRIFT_ZERO` with `decision: pass` and an empty drift array.
- `pnpm lint`, `pnpm typecheck`, scoped Prettier, and `git diff --check` passed.
- Local review found no Critical or Important issue after adding exact table
  counts, frozen SHA/repo checksum parity, custom-role checks, and extension
  exclusion checks.

## Risk

Hosted reconciliation remains unexecuted. Supabase-managed exclusions are empty
by default and require a reviewed exact before/after value, reason, and HTTPS
source; unknown schema, type, role, or extension drift blocks. Existing
migrations and the Local ledger were not rewritten.
