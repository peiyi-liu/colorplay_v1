# Phase 0 Task 2 Report

## Summary

Added a typed build-time Local/Staging/Production constant and a visible,
non-interactive `STAGING 測試環境` status marker. AppShell mounts the marker
without changing routing, auth, or product behavior; Local and Production render
nothing.

## Scope

- Phase 0 design §§2, 8, 14–16; AC-UI-015 focus visibility.
- Browser runtime configuration remains limited to the existing Supabase URL and
  anon key.

## Files

- `src/lib/config/deployment-environment.ts`
- `src/deployment-environment.d.ts`
- `src/app/shell/environment-marker.tsx`
- `src/app/shell/environment-marker.test.tsx`
- `src/app/shell/app-shell.tsx`
- `src/app/shell/app-shell.test.tsx`
- `src/styles/globals.css`
- `vite.config.ts`
- `tests/contracts/phase0-public-env.test.ts`
- `tests/e2e/environment-marker.spec.ts`
- `.superpowers/sdd/progress.md`

## Verification

- TDD RED: marker modules absent; Vite define and AppShell mount assertions failed.
- Unit/contract GREEN: 3 files / 22 tests passed.
- Staging build and Chromium marker gate: 1/1 passed across 375×812, 812×375,
  and 1280×720; visible, contained, pointer-events none, rendered contrast ≥4.5.
- Production build and Chromium marker gate: 1/1 passed; marker count remained zero
  at all three viewports.
- Focus-safety RED/GREEN: the first browser test proved marker z-index 76 covered
  the focused skip link at 75; marker z-index 39 restored the correct stacking.
- `pnpm lint`, `pnpm typecheck`, and scoped Prettier check passed.

## Risk

The browser gate requires explicit synthetic public config in a clean worktree;
without it the existing app correctly fails closed with `APP_CONFIG_INVALID`.
Hosted Staging/Production values remain future protected-environment inputs.
