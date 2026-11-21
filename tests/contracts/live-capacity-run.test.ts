import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import prettier from 'prettier';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { parseCapacityConfig } from '../../scripts/live/capacity-config';
import { runLowDeviceCapacity } from '../../scripts/live/capacity-run';

const revision = 'a'.repeat(40);
const directories: string[] = [];
const resultPath = async () => {
  const directory = await mkdtemp(
    join(tmpdir(), 'live-capacity-run-contract-'),
  );
  directories.push(directory);
  return join(directory, 'receipt.json');
};
afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { force: true, recursive: true })),
  );
});

describe('low-device runner preflight and safe receipts', () => {
  it('blocks a missing Local scope without any requests, keeping its checkpoint private', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const config = {
      ...parseCapacityConfig(['--revision', revision], {}),
      resultPath: await resultPath(),
    };
    const receipt = await runLowDeviceCapacity(
      config,
      { repoSha: revision, dirty: false },
      { COLORPLAY_LIVE_SERVICE_KEY: 'SECRET_MARKER' },
    );
    expect(receipt).toMatchObject({
      result: 'BLOCKED',
      failureReason: 'configuration',
      cleanup: { status: 'not_run' },
    });
    expect(fetch).not.toHaveBeenCalled();
    expect((await stat(config.resultPath)).mode & 0o777).toBe(0o600);
    expect(await readFile(config.resultPath, 'utf8')).not.toContain(
      'SECRET_MARKER',
    );
  });

  it('blocks a dirty or mismatched source revision before Local mutations', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const config = {
      ...parseCapacityConfig(['--revision', revision], {}),
      resultPath: await resultPath(),
    };
    expect(
      await runLowDeviceCapacity(
        config,
        { repoSha: revision, dirty: true },
        {},
      ),
    ).toMatchObject({ result: 'BLOCKED', failureReason: 'revision' });
    expect(
      await runLowDeviceCapacity(
        { ...config, resultPath: await resultPath() },
        { repoSha: 'b'.repeat(40), dirty: false },
        {},
      ),
    ).toMatchObject({ result: 'BLOCKED', failureReason: 'revision' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps a validated Staging dry-run NOT RUN with zero Hosted requests', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const config = {
      ...parseCapacityConfig(
        [
          '--environment',
          'staging',
          '--run-id',
          'c40-dry-run-contract',
          '--revision',
          revision,
          '--dry-run',
        ],
        { COLORPLAY_LIVE_CONFIRM: 'STAGING_LOW_DEVICE_DRY_RUN_ONLY' },
      ),
      resultPath: await resultPath(),
    };
    const receipt = await runLowDeviceCapacity(
      config,
      { repoSha: revision, dirty: true },
      {},
    );
    expect(receipt).toMatchObject({
      result: 'NOT_RUN',
      environment: 'staging',
      cleanup: { status: 'not_run' },
    });
    expect(fetch).not.toHaveBeenCalled();
    await expect(
      runLowDeviceCapacity(
        { ...config, dryRun: false },
        { repoSha: revision, dirty: false },
        {},
      ),
    ).rejects.toThrow('LIVE_CAPACITY_HOSTED_NOT_AUTHORIZED');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('includes new scripts in Prettier while retaining the root prototype exclusion', async () => {
    expect(
      await prettier.getFileInfo('scripts/live/capacity-config.ts', {
        ignorePath: '.prettierignore',
      }),
    ).toMatchObject({ ignored: false });
    expect(
      await prettier.getFileInfo('live/example.ts', {
        ignorePath: '.prettierignore',
      }),
    ).toMatchObject({ ignored: true });
  });
});

it('preserves prior receipts when a run marker/output is reused', async () => {
  const config = {
    ...parseCapacityConfig(['--revision', revision, '--dry-run'], {}),
    resultPath: await resultPath(),
  };
  await runLowDeviceCapacity(config, { repoSha: revision, dirty: false }, {});
  const original = await readFile(config.resultPath, 'utf8');
  await expect(
    runLowDeviceCapacity(config, { repoSha: revision, dirty: false }, {}),
  ).rejects.toThrow('LIVE_CAPACITY_RUN_ID_REUSED');
  expect(await readFile(config.resultPath, 'utf8')).toBe(original);
});
