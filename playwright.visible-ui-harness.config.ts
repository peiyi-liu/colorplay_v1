import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /visible-ui\.harness\.spec\.ts$/u,
  workers: 1,
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  use: { baseURL: 'http://localhost:4179' },
  webServer: {
    command: 'npx vite --host localhost --port 4179 --strictPort',
    url: 'http://localhost:4179/dev-harness/visible-ui.html?scenario=title',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
