import { defineConfig, devices } from '@playwright/test';

const localRunId = `playwright-local-${new Date()
  .toISOString()
  .replaceAll(':', '-')
  .replaceAll('.', '-')}-${String(process.pid)}`;
const taskEvidenceRoot =
  process.env.PLAYWRIGHT_EVIDENCE_ROOT ?? `artifacts/acceptance/${localRunId}`;
const acceptanceEvidence = process.env.PLAYWRIGHT_ACCEPTANCE === 'on';
const video =
  process.env.PLAYWRIGHT_VIDEO === 'on' || acceptanceEvidence
    ? 'on'
    : 'retain-on-failure';
const trace =
  process.env.PLAYWRIGHT_TRACE === 'on' || acceptanceEvidence
    ? 'on'
    : 'on-first-retry';

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: `${taskEvidenceRoot}/playwright`,
  reporter: [['list'], ['./tests/e2e/task-4-evidence-reporter.ts']],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      testIgnore: /\.visual\.spec\.ts$/u,
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      testIgnore: /\.visual\.spec\.ts$/u,
      use: { ...devices['Desktop Safari'] },
    },
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4173',
    screenshot: 'only-on-failure',
    trace,
    video,
  },
  webServer: {
    command: 'pnpm dev --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
  },
});
