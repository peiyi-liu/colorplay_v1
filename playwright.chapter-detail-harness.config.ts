import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /chapter-detail-(?:page|states)\.harness\.spec\.ts$/u,
  workers: 1,
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  use: { baseURL: 'http://localhost:4176' },
  webServer: {
    command: 'npx vite --host localhost --port 4176 --strictPort',
    url: 'http://localhost:4176/dev-harness/chapter-detail.html?scenario=in-progress',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
