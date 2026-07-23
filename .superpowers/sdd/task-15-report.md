# Task 15 Report

## Summary

Restored Supabase sessions now retain safe intended routes, while successful logout cancels and removes the own-profile Query cache before Auth becomes anonymous. Logout is keyboard-accessible, navigates to `/login` with replacement, preserves authenticated state/cache on repository failure, and prevents protected history or account A profile data from reappearing when account B uses the same browser page.

## Acceptance criteria

- `AC-AUTH-001`, `AC-AUTH-003`
- `AC-LEARN-004` protected `/app` route subset
- `AC-REL-002` safe profile retry-state checkpoint

## Files

- Auth lifecycle/cache cleanup: `src/features/auth/context/auth-context.tsx`, `src/features/auth/components/auth-bootstrap.tsx`, and focused tests.
- Logout UI/navigation/focus: `src/app/shell/app-shell.tsx`, `src/styles/globals.css`, and shell tests.
- Real-local proofs and typed health tracking: `tests/e2e/session-lifecycle.spec.ts`, `tests/e2e/shared-device.spec.ts`, `tests/e2e/browser-health.ts`, and its contract test.

## Commands and results

- `pnpm lint`; `pnpm typecheck` — passed.
- Focused Auth/shell/browser-health Vitest — 3 files / 33 tests passed; `pnpm test` — 24 files / 163 tests passed.
- Real-local Auth/profile integration — 2 files / 7 tests passed.
- Fresh local Supabase reset and deterministic Auth seed, then exact headless lifecycle/shared-device Playwright run — Chromium, Firefox, and WebKit passed (6/6), with screenshot/video/trace off, browser `service_role` unset, public Vite env bound to local Supabase, and no task evidence retained.

## Risks

- The user-scoped predicate currently covers the sole persisted Query family, `['profile', 'me']`; future authenticated cache families must be added before use.
- Chromium reports Supabase auth-js's successfully completed no-body local logout response as `net::ERR_ABORTED`; E2E ignores at most one only when the exact failed Playwright Request object also has a successful response.

## Sole review fixes

- A null Auth event buffered during a rejected sign-out is reconciled with `getSession`: confirmed anonymous or failed recovery resolves after ordered fail-closed cache cleanup, while a confirmed session is reasserted with cache intact and rejects the repository error.
- The mounted root shell resets successful sign-out flags before replacement navigation, so a same-page account B can sign out after account A.
- Both browser specs share request-identity health tracking constrained to Chromium, exact local POST logout URL, exact abort error, one occurrence, and a matching successful response.
