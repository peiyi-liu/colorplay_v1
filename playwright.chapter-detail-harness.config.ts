import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch:
    /chapter-(?:detail-(?:page|states)|review-reader(?:-pagination)?)\.harness\.spec\.ts$/u,
  workers: 1,
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  use: { baseURL: 'http://127.0.0.1:4176' },
  webServer: {
    command: 'npx vite --host 127.0.0.1 --port 4176 --strictPort',
    url: 'http://127.0.0.1:4176/dev-harness/chapter-detail.html?scenario=in-progress',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
