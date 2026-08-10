import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /teacher-routes\.harness\.spec\.ts$/u,
  workers: 1,
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  use: { baseURL: 'http://localhost:4177' },
  webServer: {
    command: 'npx vite --host localhost --port 4177 --strictPort',
    url: 'http://localhost:4177/dev-harness/teacher-routes.html?scenario=dashboard',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
