import { defineConfig, devices } from '@playwright/test';

const taskEvidenceRoot =
  process.env.PLAYWRIGHT_EVIDENCE_ROOT ??
  'artifacts/acceptance/phase-1a-task-05';
const video =
  process.env.PLAYWRIGHT_VIDEO === 'on' ? 'on' : 'retain-on-failure';

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
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4173',
    screenshot: 'only-on-failure',
    trace: 'on',
    video,
  },
  webServer: {
    command: 'pnpm dev --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
  },
});
