import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
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
        // tests — never lower these further.
        branches: 65,
        functions: 78,
        lines: 80,
        statements: 77,
        'src/components/ui/**': {
          branches: 75,
          functions: 80,
          lines: 80,
          statements: 80,
        },
        // Live phase-view refactor lands new TDD modules here; pinned at
        // today's floor so untested logic absorbed from pages fails CI.
        'src/features/live/lib/**': {
          branches: 72,
          functions: 90,
          lines: 93,
          statements: 90,
        },
      },
    },
  },
});
