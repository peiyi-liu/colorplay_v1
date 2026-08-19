import { defineConfig, devices } from '@playwright/test';

const localRunId = `playwright-local-${new Date()
  .toISOString()
  .replaceAll(':', '-')
  .replaceAll('.', '-')}-${String(process.pid)}`;
const precheckMode = process.env.GAME_ECONOMY_PRECHECK === 'on';
const taskEvidenceRoot = precheckMode
  ? 'test-results/game-economy-precheck'
  : (process.env.PLAYWRIGHT_EVIDENCE_ROOT ??
    `artifacts/acceptance/${localRunId}`);
const playwrightBaseUrl = process.env.PLAYWRIGHT_BASE_URL;
const acceptanceEvidence = process.env.PLAYWRIGHT_ACCEPTANCE === 'on';
const evidenceReporters: [string][] = [
  ['list'],
  ['./tests/e2e/task-4-evidence-reporter.ts'],
];
const realAuthAvailable = Boolean(
  process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY,
);
const authGuardSpec = /auth-guards\.spec\.ts$/u;
const chromiumOnlyLoginSpec = /login\.spec\.ts$/u;
// Task 14：admin TOTP enrollment 是一次性動作（同一 factor 綁定後無法
// 重綁），跨瀏覽器 project 重跑會在第二個 project 卡在已綁定狀態；
// 比照 chromiumOnlyLoginSpec 只在 chromium 執行一次。
const chromiumOnlyAdminSpec = /admin-(security|viewports)\.spec\.ts$/u;
const video = precheckMode
  ? 'off'
  : process.env.PLAYWRIGHT_VIDEO === 'on' || acceptanceEvidence
    ? 'on'
    : 'retain-on-failure';
const trace = precheckMode
  ? 'off'
  : process.env.PLAYWRIGHT_TRACE === 'on' || acceptanceEvidence
    ? 'on'
    : 'on-first-retry';

export default defineConfig({
  testDir: './tests',
  outputDir: `${taskEvidenceRoot}/playwright`,
  reporter: precheckMode ? [['list']] : evidenceReporters,
  // 多個 spec 共用同一批 seed 帳號，而 Supabase 登出會撤銷該使用者的所有
  // session；平行執行會互相打斷，因此序列化。
  workers: 1,
  projects: [
    {
      name: 'chromium',
      ...(realAuthAvailable
        ? {}
        : { testIgnore: [authGuardSpec, chromiumOnlyAdminSpec] }),
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      testIgnore: [
        /\.visual\.spec\.ts$/u,
        authGuardSpec,
        chromiumOnlyLoginSpec,
        chromiumOnlyAdminSpec,
      ],
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      testIgnore: [
        /\.visual\.spec\.ts$/u,
        authGuardSpec,
        chromiumOnlyLoginSpec,
        chromiumOnlyAdminSpec,
      ],
      use: { ...devices['Desktop Safari'] },
    },
  ],
  use: {
    baseURL: playwrightBaseUrl ?? 'http://127.0.0.1:4173',
    screenshot: precheckMode ? 'off' : 'only-on-failure',
    trace,
    video,
  },
  ...(playwrightBaseUrl
    ? {}
    : {
        webServer: {
          // 對 production build 跑 E2E：dev server 的隨選編譯延遲會吃掉
          // 20 秒答題預算（firefox 冷載入尤甚），造成計時型 flake。
          command:
            'pnpm build && pnpm preview --host 127.0.0.1 --port 4173 --strictPort',
          url: 'http://127.0.0.1:4173',
          reuseExistingServer: false,
          timeout: 180_000,
        },
      }),
});
