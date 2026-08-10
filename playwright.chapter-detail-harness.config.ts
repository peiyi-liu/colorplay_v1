import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /chapter-detail-page\.harness\.spec\.ts$/u,
  workers: 1,
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  use: { baseURL: 'http://localhost:5173' },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173/dev-harness/chapter-detail.html?scenario=in-progress',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
