import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /teacher-(?:analytics|routes|live-round)\.harness\.spec\.ts$/u,
  workers: 1,
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  use: { baseURL: 'http://127.0.0.1:4177' },
  webServer: {
    command:
      '../../node_modules/.bin/vite --host 127.0.0.1 --port 4177 --strictPort',
    url: 'http://127.0.0.1:4177/dev-harness/teacher-routes.html?scenario=analytics',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
