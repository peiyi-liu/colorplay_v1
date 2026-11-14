import { fileURLToPath } from 'node:url';

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: fileURLToPath(new URL('../../tests/e2e', import.meta.url)),
  testMatch: 'live-low-device.spec.ts',
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 12 * 60_000,
  use: { screenshot: 'off', trace: 'off', video: 'off' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Existing Local services only. No webServer, build, container or DB reset.
});
