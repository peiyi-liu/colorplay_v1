import { defineConfig, devices } from '@playwright/test';

const taskEvidenceRoot = 'artifacts/acceptance/phase-1a-task-04';

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: `${taskEvidenceRoot}/playwright`,
  reporter: [['list'], ['./tests/e2e/task-4-evidence-reporter.ts']],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    screenshot: 'only-on-failure',
    trace: 'on',
  },
  webServer: {
    command: 'pnpm dev --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
  },
});
