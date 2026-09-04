import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /live-presenter\.harness\.spec\.ts$/u,
  workers: 1,
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  use: { baseURL: 'http://localhost:4178' },
  webServer: {
    command: 'npx vite --host localhost --port 4178 --strictPort',
    url: 'http://localhost:4178/dev-harness/live-presenter.html?scenario=draft',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
