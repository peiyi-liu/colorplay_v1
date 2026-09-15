import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4198';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /student-scroll\.harness\.spec\.ts$/u,
  workers: 1,
  reporter: 'list',
  outputDir: 'test-results/student-scroll',
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  use: { baseURL, screenshot: 'off', trace: 'off', video: 'off' },
  ...(process.env.PLAYWRIGHT_BASE_URL
    ? {}
    : {
        webServer: {
          command: 'pnpm exec vite --host 127.0.0.1 --port 4198 --strictPort',
          url: `${baseURL}/dev-harness/quiz-session.html?scenario=correct`,
          reuseExistingServer: false,
          timeout: 60_000,
        },
      }),
});
