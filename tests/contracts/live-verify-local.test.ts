import { expect, it, vi } from 'vitest';
import {
  createCapacityReceipt,
  type CapacityReceipt,
} from '../../scripts/live/capacity-receipt';
import { parseCapacityConfig } from '../../scripts/live/capacity-config';
import { safeCapacityChildExit } from '../../scripts/live/capacity-process-diagnostics';
import { verifyLocal } from '../../scripts/live/verify-local';

const revision = 'a'.repeat(40);
const env = {
  COLORPLAY_LIVE_CONFIRM: 'LOCAL_LOW_DEVICE_ONLY',
  COLORPLAY_LIVE_EXPECTED_REVISION: revision,
  COLORPLAY_LIVE_APP_URL: 'http://127.0.0.1:56373',
  COLORPLAY_LIVE_SUPABASE_URL: 'http://127.0.0.1:56321',
  COLORPLAY_LIVE_DATABASE_URL:
    'postgresql://postgres:synthetic-secret-marker@127.0.0.1:56322/postgres',
  COLORPLAY_LIVE_ANON_KEY: 'sb_publishable_synthetic-marker',
  COLORPLAY_LIVE_SERVICE_KEY: 'sb_secret_synthetic-marker',
  COLORPLAY_LIVE_TEACHER_PASSWORD: 'synthetic-secret-marker',
};
const complete = (args: readonly string[]) => {
  const config = parseCapacityConfig(args, env);
  const receipt = createCapacityReceipt(config, revision);
  receipt.webRevision = config.profile === 'browser' ? revision : null;
  receipt.result = 'PASS';
  receipt.cleanup.status = 'verified';
  receipt.outsider = 'rejected';
  receipt.actors.forEach((actor) => {
    actor.status = 'completed';
    actor.requests = 3;
    actor.broadcasts = 1;
    if (actor.uiProof !== 'not_applicable')
      actor.uiProof = {
        login: true,
        join: true,
        answerRounds: actor.role === 'host' ? 0 : 3,
      };
  });
  receipt.rounds = [1, 2, 3].map((position) => ({
    position,
    answerCount: config.totalActors - 1,
    distinctParticipants: config.totalActors - 1,
    snapshotsMatched: true,
    timing: {
      count: config.totalActors - 1,
      max_ms: 100,
      p50_ms: 50,
      p95_ms: 90,
    },
  }));
  return receipt;
};
const setup = () => {
  const receipts = new Map<string, CapacityReceipt>();
  const execute = vi.fn((_file: string, args: readonly string[]) => {
    if (args[1] === 'tsx') {
      const capacityArgs = args.slice(3);
      const config = parseCapacityConfig(capacityArgs, env);
      receipts.set(config.resultPath, complete(capacityArgs));
    }
    return Promise.resolve(safeCapacityChildExit(0, null, false));
  });
  return {
    receipts,
    execute,
    dependencies: {
      allocate: () =>
        Promise.resolve({
          runPrefix: 'c40-v5-synthetic',
          directory: '/private/tmp/synthetic-verify',
        }),
      gitState: () => Promise.resolve({ repoSha: revision, dirty: false }),
      execute,
      marker: vi.fn(() => Promise.resolve({ environment: 'local', revision })),
      readReceipt: (path: string) => Promise.resolve(receipts.get(path)),
      checkpoint: vi.fn(() => Promise.resolve()),
    },
  };
};

it('runs checks, real browser CLI and a fresh same-profile 3→10→20→40 receipt chain', async () => {
  const test = setup();
  const summary = await verifyLocal(env, test.dependencies);
  expect(summary.result).toBe('PASS');
  expect(summary.steps.map((step) => step.result)).toEqual(
    Array(8).fill('PASS'),
  );
  expect(
    test.execute.mock.calls.slice(0, 3).map((call) => call[1].slice(0, 2)),
  ).toEqual([
    ['--config.verify-deps-before-run=false', 'lint'],
    ['--config.verify-deps-before-run=false', 'typecheck'],
    ['--config.verify-deps-before-run=false', 'exec'],
  ]);
  expect(
    summary.steps.slice(3).map((step) => [step.profile, step.actors]),
  ).toEqual([
    ['browser', 3],
    ['protocol', 3],
    ['protocol', 10],
    ['protocol', 20],
    ['protocol', 40],
  ]);
  const runs = test.execute.mock.calls.slice(3);
  expect(runs[0]?.[1]).toContain('browser');
  expect(runs[1]?.[1]).not.toContain('--previous-receipt');
  for (const [index, run] of runs.slice(2).entries()) {
    expect(run[1]).toContain(summary.steps[index + 4]?.receiptPath);
  }
  expect(JSON.stringify(summary)).not.toMatch(
    /synthetic-secret-marker|sb_secret|sb_publishable|postgresql/u,
  );
});

it.each([
  { COLORPLAY_LIVE_CONFIRM: undefined },
  { COLORPLAY_LIVE_CONFIRM: 'STAGING_LOW_DEVICE_DRY_RUN_ONLY' },
  { COLORPLAY_LIVE_APP_URL: 'https://hosted.invalid' },
  { COLORPLAY_LIVE_SUPABASE_URL: 'https://hosted.invalid' },
  {
    COLORPLAY_LIVE_DATABASE_URL:
      'postgresql://postgres:secret@hosted.invalid:5432/postgres',
  },
  { COLORPLAY_LIVE_DATABASE_URL: undefined },
  { COLORPLAY_LIVE_EXPECTED_REVISION: 'b'.repeat(40) },
])(
  'blocks missing or unsafe scope before commands/network: %j',
  async (override) => {
    const test = setup();
    const summary = await verifyLocal(
      { ...env, ...override },
      test.dependencies,
    );
    expect(summary.result).toBe('BLOCKED');
    expect(summary.steps.every((step) => step.result === 'NOT_RUN')).toBe(true);
    expect(test.execute).not.toHaveBeenCalled();
    expect(test.dependencies.marker).not.toHaveBeenCalled();
  },
);

it('requires a clean source before even fetching the App marker', async () => {
  const test = setup();
  test.dependencies.gitState = () =>
    Promise.resolve({ repoSha: revision, dirty: true });
  const summary = await verifyLocal(env, test.dependencies);
  expect(summary.result).toBe('BLOCKED');
  expect(test.dependencies.marker).not.toHaveBeenCalled();
  expect(test.execute).not.toHaveBeenCalled();
});

it.each([
  { environment: 'staging', revision },
  { environment: 'local', revision: 'b'.repeat(40) },
  { environment: 'local', revision: '' },
])(
  'blocks a wrong App marker without running checks or fixtures',
  async (marker) => {
    const test = setup();
    test.dependencies.marker.mockResolvedValue(marker);
    const summary = await verifyLocal(env, test.dependencies);
    expect(summary).toMatchObject({ result: 'BLOCKED', reason: 'environment' });
    expect(test.execute).not.toHaveBeenCalled();
  },
);

it('reports an unavailable App as BLOCKED and later profiles as NOT_RUN', async () => {
  const test = setup();
  test.dependencies.marker.mockRejectedValue(
    new Error('synthetic-secret-marker'),
  );
  const summary = await verifyLocal(env, test.dependencies);
  expect(summary.result).toBe('BLOCKED');
  expect(summary.steps.every((step) => step.result === 'NOT_RUN')).toBe(true);
  expect(JSON.stringify(summary)).not.toContain('synthetic-secret-marker');
});

it('stops after a failed check instead of attempting a Live leg or retrying', async () => {
  const test = setup();
  test.execute.mockResolvedValueOnce(safeCapacityChildExit(1, null, false));
  const summary = await verifyLocal(env, test.dependencies);
  expect(summary).toMatchObject({ result: 'FAIL', reason: 'checks' });
  expect(test.execute).toHaveBeenCalledTimes(1);
  expect(summary.steps[0]?.result).toBe('FAIL');
  expect(
    summary.steps.slice(1).every((step) => step.result === 'NOT_RUN'),
  ).toBe(true);
});

const changeReceipt = (
  test: ReturnType<typeof setup>,
  change: (receipt: CapacityReceipt) => void,
) => {
  test.dependencies.readReceipt = (path: string) => {
    const receipt = test.receipts.get(path);
    if (!receipt) throw new Error('SYNTHETIC_RECEIPT_MISSING');
    change(receipt);
    return Promise.resolve(receipt);
  };
};

it.each([
  'revision',
  'run',
  'profile',
  'actors',
  'web',
  'schema',
  'cleanup',
  'generator',
  'rounds',
  'outsider',
] as const)(
  'rejects exit0 with invalid %s evidence and does not escalate',
  async (kind) => {
    const test = setup();
    changeReceipt(test, (receipt) => {
      if (kind === 'revision') receipt.repoSha = 'b'.repeat(40);
      if (kind === 'run') receipt.runId = 'c40-reused-history';
      if (kind === 'profile') receipt.profile = 'protocol';
      if (kind === 'actors') receipt.totalActors = 10;
      if (kind === 'web') receipt.webRevision = 'b'.repeat(40);
      if (kind === 'schema') receipt.actors = [];
      if (kind === 'cleanup') receipt.cleanup.status = 'failed';
      if (kind === 'generator') receipt.generatorHealth.limited = true;
      if (kind === 'rounds') receipt.rounds = [];
      if (kind === 'outsider') receipt.outsider = 'not_run';
    });
    const summary = await verifyLocal(env, test.dependencies);
    expect(summary.result).toBe('BLOCKED');
    expect(test.execute).toHaveBeenCalledTimes(4);
    expect(
      summary.steps.slice(4).every((step) => step.result === 'NOT_RUN'),
    ).toBe(true);
  },
);

it.each(['NOT_RUN', 'FAIL', 'BLOCKED', 'INCONCLUSIVE'] as const)(
  'never treats a capacity %s receipt as full PASS despite exit0',
  async (result) => {
    const test = setup();
    changeReceipt(test, (receipt) => {
      receipt.result = result;
    });
    const summary = await verifyLocal(env, test.dependencies);
    expect(summary.result).toBe(result === 'NOT_RUN' ? 'BLOCKED' : result);
    expect(test.execute).toHaveBeenCalledTimes(4);
  },
);

it('stops at protocol10 failure and leaves protocol20/40 NOT_RUN', async () => {
  const test = setup();
  changeReceipt(test, (receipt) => {
    if (receipt.profile === 'protocol' && receipt.totalActors === 10)
      receipt.result = 'FAIL';
  });
  const summary = await verifyLocal(env, test.dependencies);
  expect(summary.result).toBe('FAIL');
  expect(test.execute).toHaveBeenCalledTimes(6);
  expect(summary.steps.slice(6).map((step) => step.result)).toEqual([
    'NOT_RUN',
    'NOT_RUN',
  ]);
});

it('does not accept a PASS receipt when the command itself failed', async () => {
  const test = setup();
  const execute = test.execute.getMockImplementation();
  if (!execute) throw new Error('SYNTHETIC_EXECUTOR_MISSING');
  test.execute.mockImplementation(async (file, args) => {
    await execute(file, args);
    return safeCapacityChildExit(args[1] === 'tsx' ? 1 : 0, null, false);
  });
  const summary = await verifyLocal(env, test.dependencies);
  expect(summary.result).toBe('FAIL');
  expect(test.execute).toHaveBeenCalledTimes(4);
});

it('rejects dry-run/extra arguments through the real shell entry without printing secrets', async () => {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  try {
    await promisify(execFile)(
      'bash',
      ['scripts/live/verify-local.sh', '--dry-run'],
      {
        env: {
          ...process.env,
          COLORPLAY_LIVE_TEACHER_PASSWORD: 'synthetic-secret-marker',
        },
      },
    );
    throw new Error('VERIFY_MUST_REJECT');
  } catch (error) {
    if (!(error instanceof Error) || !('stdout' in error) || !('code' in error))
      throw error;
    expect(error.code).toBe(1);
    expect(String(error.stdout)).toContain('"result":"BLOCKED"');
    expect(String(error.stdout)).not.toContain('synthetic-secret-marker');
  }
});

it('retains native child exit metadata on each capacity leg', async () => {
  const test = setup();
  const summary = await verifyLocal(env, test.dependencies);
  expect(summary.steps[3]?.childExit).toEqual({
    exitCode: 0,
    signal: null,
    spawnError: false,
  });
});

it.each([
  { exitCode: 1, signal: null, spawnError: false },
  { exitCode: null, signal: 'SIGTERM' as const, spawnError: false },
  { exitCode: null, signal: 'SIGKILL' as const, spawnError: false },
  { exitCode: null, signal: null, spawnError: true },
  { exitCode: 0, signal: null, spawnError: false },
])(
  'retains early child termination metadata and leaves RUNNING evidence unmodified',
  async (exit) => {
    const test = setup();
    const execute = test.execute.getMockImplementation();
    if (!execute) throw new Error('SYNTHETIC_EXECUTOR_MISSING');
    test.execute.mockImplementation(async (file, args) => {
      await execute(file, args);
      return args[1] === 'tsx' ? exit : safeCapacityChildExit(0, null, false);
    });
    changeReceipt(test, (receipt) => {
      receipt.result = 'RUNNING';
      receipt.cleanup.status = 'not_run';
    });
    const summary = await verifyLocal(env, test.dependencies);
    expect(summary.result).toBe('FAIL');
    expect(summary.steps[3]?.childExit).toEqual(exit);
    expect(test.execute).toHaveBeenCalledTimes(4);
    expect(
      summary.steps.slice(4).every((step) => step.result === 'NOT_RUN'),
    ).toBe(true);
    expect([...test.receipts.values()][0]).toMatchObject({
      result: 'RUNNING',
      cleanup: { status: 'not_run' },
    });
  },
);
