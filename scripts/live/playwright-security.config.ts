import { defineConfig } from '@playwright/test';

import config from './playwright.config';

// One synthetic browser context, two owned loopback origins, no Live services.
export default defineConfig({
  ...config,
  testMatch: 'live-capacity-security.spec.ts',
  timeout: 20_000,
});
