import { defineConfig, devices } from '@playwright/test';

const port = process.env.COLORPLAY_TEACHER_HARNESS_PORT ?? '4177';
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests/e2e',
  testMatch:
    /teacher-(?:analytics|avatar-optimizer|routes|live-round|workspace-states)\.harness\.spec\.ts$/u,
  workers: 1,
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  use: { baseURL },
  webServer: {
    command: `../../node_modules/.bin/vite --host 127.0.0.1 --port ${port} --strictPort`,
    url: `${baseURL}/dev-harness/teacher-routes.html?scenario=analytics`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
