import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /admin-console\.harness\.spec\.ts$/u,
  workers: 1,
  reporter: 'list',
  outputDir: 'test-results/admin-console',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:4193',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'pnpm exec vite --host 127.0.0.1 --port 4193 --strictPort',
    url: 'http://127.0.0.1:4193/dev-harness/admin-console.html',
    reuseExistingServer: false,
    env: {
      VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
      VITE_SUPABASE_ANON_KEY: 'admin-ui-harness-public-key',
    },
  },
});
