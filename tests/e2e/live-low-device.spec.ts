import { test } from '@playwright/test';

import { runCapacityFromArgs } from '../../scripts/live/run-capacity';

// Secrets and join codes must never appear in Playwright recordings.
test.use({ screenshot: 'off', trace: 'off', video: 'off' });
test('Local low-device Live: three browser contexts or hybrid actors', async ({
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'NOT RUN: low-device profiles use one Chromium process',
  );
  test.skip(
    !process.env.COLORPLAY_LIVE_RUN_ID ||
      !process.env.COLORPLAY_LIVE_EXPECTED_REVISION ||
      process.env.COLORPLAY_LIVE_CONFIRM !== 'LOCAL_LOW_DEVICE_ONLY',
    'NOT RUN: explicit Local run scope is required; skipped is not PASS',
  );
  const profile = process.env.COLORPLAY_LIVE_PROFILE ?? 'browser';
  if (profile !== 'browser' && profile !== 'hybrid')
    throw new Error('LIVE_CAPACITY_BROWSER_PROFILE_INVALID');
  try {
    const { receipt } = await runCapacityFromArgs([
      '--environment',
      'local',
      '--profile',
      profile,
      '--actors',
      process.env.COLORPLAY_LIVE_ACTORS ?? '3',
      ...(process.env.COLORPLAY_LIVE_PREVIOUS_RECEIPT
        ? ['--previous-receipt', process.env.COLORPLAY_LIVE_PREVIOUS_RECEIPT]
        : []),
    ]);
    if (receipt.result !== 'PASS')
      throw new Error('LIVE_CAPACITY_BROWSER_NOT_PASSED');
  } catch {
    throw new Error('LIVE_CAPACITY_BROWSER_NOT_PASSED');
  }
});
