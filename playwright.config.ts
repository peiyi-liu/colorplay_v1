import { defineConfig, devices } from '@playwright/test';

const localRunId = `playwright-local-${new Date()
  .toISOString()
  .replaceAll(':', '-')
  .replaceAll('.', '-')}-${String(process.pid)}`;
const taskEvidenceRoot =
  process.env.PLAYWRIGHT_EVIDENCE_ROOT ?? `artifacts/acceptance/${localRunId}`;
const playwrightBaseUrl = process.env.PLAYWRIGHT_BASE_URL;
const acceptanceEvidence = process.env.PLAYWRIGHT_ACCEPTANCE === 'on';
const realAuthAvailable = Boolean(
  process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY,
);
const authGuardSpec = /auth-guards\.spec\.ts$/u;
const chromiumOnlyLoginSpec = /login\.spec\.ts$/u;
const video =
  process.env.PLAYWRIGHT_VIDEO === 'on' || acceptanceEvidence
    ? 'on'
    : 'retain-on-failure';
const trace =
  process.env.PLAYWRIGHT_TRACE === 'on' || acceptanceEvidence
    ? 'on'
    : 'on-first-retry';

export default defineConfig({
  testDir: './tests',
  outputDir: `${taskEvidenceRoot}/playwright`,
  reporter: [['list'], ['./tests/e2e/task-4-evidence-reporter.ts']],
  // 多個 spec 共用同一批 seed 帳號，而 Supabase 登出會撤銷該使用者的所有
  // session；平行執行會互相打斷，因此序列化。
  workers: 1,
  projects: [
    {
      name: 'chromium',
      ...(realAuthAvailable ? {} : { testIgnore: authGuardSpec }),
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      testIgnore: [
        /\.visual\.spec\.ts$/u,
        authGuardSpec,
        chromiumOnlyLoginSpec,
      ],
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      testIgnore: [
        /\.visual\.spec\.ts$/u,
        authGuardSpec,
        chromiumOnlyLoginSpec,
      ],
      use: { ...devices['Desktop Safari'] },
    },
  ],
  use: {
    baseURL: playwrightBaseUrl ?? 'http://127.0.0.1:4173',
    screenshot: 'only-on-failure',
    trace,
    video,
  },
  ...(playwrightBaseUrl
    ? {}
    : {
        webServer: {
          command: 'pnpm dev --host 127.0.0.1 --port 4173',
          url: 'http://127.0.0.1:4173',
          reuseExistingServer: false,
        },
      }),
});
