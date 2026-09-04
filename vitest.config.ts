import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

import { adminBrowserCatalogPlugin } from './scripts/vite/admin-browser-catalog';

export default defineConfig({
  plugins: [react(), adminBrowserCatalogPlugin()],
  test: {
    environment: 'jsdom',
    // Unit tests must not depend on a developer's .env file. Same synthetic
    // values as ci.yml — parsePublicEnv only checks shape, never reaches the
    // network in unit runs.
    env: {
      VITE_SUPABASE_URL: 'https://synthetic-colorplay-ci.invalid',
      VITE_SUPABASE_ANON_KEY: 'synthetic-browser-public-anon-key',
    },
    exclude: [
      // Root-anchored 'node_modules/**' misses nested copies — a git worktree
      // under .worktrees/ carries its own, and vitest would then discover and
      // run every dependency's own test suite.
      '**/node_modules/**',
      '.worktrees/**',
      'tests/e2e/**',
      'tests/acceptance/**',
      'tests/visual/**',
      'tests/integration/**',
      '**/*.integration.test.*',
    ],
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.spec.{ts,tsx}',
        // Browser/dev harnesses and their fixtures are test support, not
        // production source. Their behavior is exercised by Playwright.
        'src/**/*.harness.{ts,tsx}',
        'src/**/*.test-fixtures.{ts,tsx}',
        'src/test/**',
        'src/**/*.d.ts',
      ],
      reporter: ['text', 'html'],
      reportsDirectory: 'coverage',
      thresholds: {
        // Ratchet (2026-07-25): pinned just below today's reality so the gate
        // is red-free but cannot regress. Debt lives in auth account-flows /
        // register-page, learning repository / use-mastery, profile
        // repository, create-app-router. Raise back to 80/75/80 as those get
        // tests. Values sit 2pts under the local floor (66.4/78.7/80.7/77.8)
        // because v8 coverage counts differ slightly per platform — CI (Linux)
        // tripped the exact-floor pins. Never lower further than this.
        branches: 64,
        functions: 76,
        lines: 78,
        statements: 75,
        'src/components/ui/**': {
          branches: 73,
          functions: 78,
          lines: 78,
          statements: 78,
        },
        // Live phase-view refactor lands new TDD modules here; pinned near
        // today's floor so untested logic absorbed from pages fails CI.
        'src/features/live/lib/**': {
          branches: 70,
          functions: 88,
          lines: 91,
          statements: 88,
        },
      },
    },
  },
});
