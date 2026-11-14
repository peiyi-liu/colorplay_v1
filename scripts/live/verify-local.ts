import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { writeSafeJson } from '../../tests/e2e/helpers/staging-capacity-checkpoint';
import { parseCapacityConfig, requireLocalExecution } from './capacity-config';
import { readLocalSecrets } from './capacity-local-client';
import {
  capacityRepositoryRoot,
  readCapacityGitState,
} from './capacity-preflight';
import { sanitizeCapacityReceipt } from './capacity-receipt';
import {
  capacityChildPassed,
  safeCapacityChildExit,
  type CapacityChildExit,
} from './capacity-process-diagnostics';

type Result =
  'NOT_RUN' | 'RUNNING' | 'PASS' | 'FAIL' | 'BLOCKED' | 'INCONCLUSIVE';
interface Step {
  name:
    | 'lint'
    | 'typecheck'
    | 'tests'
    | 'browser3'
    | 'protocol3'
    | 'protocol10'
    | 'protocol20'
    | 'protocol40';
  result: Result;
  profile?: 'browser' | 'protocol';
  actors?: number;
  receiptPath?: string;
  childExit?: CapacityChildExit;
}
export interface VerificationSummary {
  result: Result;
  environment: 'local';
  repoSha: string | null;
  runPrefix: string;
  directory: string;
  reason: 'scope' | 'environment' | 'checks' | 'receipt' | 'command' | null;
  steps: Step[];
  physicalDeviceProof: false;
  replacesAcLive012: false;
}
interface Dependencies {
  allocate: () => Promise<{ runPrefix: string; directory: string }>;
  gitState: typeof readCapacityGitState;
  execute: (
    file: string,
    args: readonly string[],
    env: NodeJS.ProcessEnv,
  ) => Promise<CapacityChildExit>;
  marker: (appUrl: string) => Promise<unknown>;
  readReceipt: (path: string) => Promise<unknown>;
  checkpoint: (summary: VerificationSummary) => Promise<void>;
}
const defaults: Dependencies = {
  allocate: async () => ({
    runPrefix: `c40-v5-${randomBytes(6).toString('hex')}`,
    directory: await mkdtemp('/private/tmp/colorplay-live-verify-'),
  }),
  gitState: readCapacityGitState,
  execute: (file, args, env) =>
    new Promise<CapacityChildExit>((done) => {
      // No buffering/logging of SDK diagnostics and no maxBuffer-triggered kill:
      // the real capacity CLI retains its run/cleanup/outer watchdog ownership.
      const child = spawn(file, [...args], {
        cwd: capacityRepositoryRoot,
        env,
        stdio: 'ignore',
      });
      let failed = false;
      child.once('error', () => {
        failed = true;
      });
      child.once('close', (code, signal) => {
        done(safeCapacityChildExit(code, signal, failed));
      });
    }),
  marker: async (appUrl) => {
    const response = await fetch(
      `${appUrl.replace(/\/$/u, '')}/admin-release.json`,
      {
        redirect: 'error',
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!response.ok) throw new Error('LIVE_VERIFY_MARKER_UNAVAILABLE');
    return response.json() as Promise<unknown>;
  },
  readReceipt: async (path) =>
    JSON.parse(await readFile(path, 'utf8')) as unknown,
  checkpoint: async (summary) => {
    const path = `${summary.directory}/result.json`;
    await writeSafeJson(path, summary);
    process.stdout.write(
      `${JSON.stringify({ result: summary.result, completed: summary.steps.filter((step) => step.result === 'PASS').length, resultPath: path })}\n`,
    );
  },
};
const legs = [
  ['browser3', 'browser', 3],
  ['protocol3', 'protocol', 3],
  ['protocol10', 'protocol', 10],
  ['protocol20', 'protocol', 20],
  ['protocol40', 'protocol', 40],
] as const;

export async function verifyLocal(
  env: NodeJS.ProcessEnv = process.env,
  overrides: Partial<Dependencies> = {},
): Promise<VerificationSummary> {
  const dependencies = { ...defaults, ...overrides };
  const scope = await dependencies.allocate();
  const summary: VerificationSummary = {
    ...scope,
    repoSha: null,
    environment: 'local',
    result: 'RUNNING',
    reason: null,
    steps: [
      { name: 'lint', result: 'NOT_RUN' },
      { name: 'typecheck', result: 'NOT_RUN' },
      { name: 'tests', result: 'NOT_RUN' },
      ...legs.map(([name, profile, actors]) => ({
        name,
        profile,
        actors,
        result: 'NOT_RUN' as const,
      })),
    ],
    physicalDeviceProof: false,
    replacesAcLive012: false,
  };
  const save = () => dependencies.checkpoint(summary);
  const stop = async (
    result: Result,
    reason: VerificationSummary['reason'],
  ) => {
    summary.result = result;
    summary.reason = reason;
    await save();
    return summary;
  };
  const argsFor = (
    profile: 'browser' | 'protocol',
    actors: number,
    previous?: string,
  ) => [
    '--environment',
    'local',
    '--profile',
    profile,
    '--actors',
    String(actors),
    '--run-id',
    `${scope.runPrefix}-${profile === 'browser' ? 'b' : 'p'}${String(actors)}`,
    '--revision',
    env.COLORPLAY_LIVE_EXPECTED_REVISION ?? '',
    ...(previous ? ['--previous-receipt', previous] : []),
  ];
  try {
    if (
      !env.COLORPLAY_LIVE_APP_URL ||
      !env.COLORPLAY_LIVE_SUPABASE_URL ||
      !env.COLORPLAY_LIVE_DATABASE_URL
    )
      return await stop('BLOCKED', 'scope');
    readLocalSecrets(env);
    const config = parseCapacityConfig(argsFor('browser', 3), env);
    requireLocalExecution(config);
    const git = await dependencies.gitState();
    if (git.dirty || git.repoSha !== config.expectedRevision)
      return await stop('BLOCKED', 'scope');
    summary.repoSha = git.repoSha;
    let marker: unknown;
    try {
      marker = await dependencies.marker(config.appUrl);
    } catch {
      return await stop('BLOCKED', 'environment');
    }
    if (
      typeof marker !== 'object' ||
      marker === null ||
      !('revision' in marker) ||
      marker.revision !== git.repoSha ||
      !('environment' in marker) ||
      !['local', 'development'].includes(String(marker.environment))
    )
      return await stop('BLOCKED', 'environment');
  } catch {
    return await stop('BLOCKED', 'scope');
  }
  await save();
  const checks = [
    ['lint'],
    ['typecheck'],
    [
      'exec',
      'vitest',
      'run',
      'src/features/live',
      'tests/contracts/live-',
      'tests/contracts/staging-capacity',
      '--maxWorkers=2',
    ],
  ];
  for (const [index, args] of checks.entries()) {
    const step = summary.steps[index];
    if (!step) return stop('FAIL', 'checks');
    step.result = 'RUNNING';
    await save();
    const execution = await dependencies
      .execute('pnpm', ['--config.verify-deps-before-run=false', ...args], env)
      .catch(() => safeCapacityChildExit(null, null, true));
    const passed = capacityChildPassed(execution);
    step.result = passed ? 'PASS' : 'FAIL';
    if (!passed) return stop('FAIL', 'checks');
    await save();
  }
  let previous: string | undefined;
  for (const [index, [name, profile, actors]] of legs.entries()) {
    const step = summary.steps[index + checks.length];
    if (step?.name !== name) return stop('FAIL', 'command');
    const args = argsFor(
      profile,
      actors,
      profile === 'protocol' ? previous : undefined,
    );
    const config = parseCapacityConfig(args, env);
    step.receiptPath = config.resultPath;
    step.result = 'RUNNING';
    await save();
    // Use the real CLI, including its existing 8m run / 150s cleanup / 12m outer
    // bounds. No dry-run, skip, extra retry, browser bypass or new timeout.
    const execution = await dependencies
      .execute(
        process.execPath,
        ['--import', 'tsx', 'scripts/live/run-capacity.ts', ...args],
        env,
      )
      .catch(() => safeCapacityChildExit(null, null, true));
    step.childExit = safeCapacityChildExit(
      execution.exitCode,
      execution.signal,
      execution.spawnError,
    );
    const passed = capacityChildPassed(step.childExit);
    await save();
    try {
      const receipt = sanitizeCapacityReceipt(
        await dependencies.readReceipt(config.resultPath),
      );
      if (
        receipt.environment !== 'local' ||
        receipt.profile !== profile ||
        receipt.totalActors !== actors ||
        receipt.repoSha !== summary.repoSha ||
        receipt.runId !== config.runId ||
        (profile === 'browser' && receipt.webRevision !== summary.repoSha)
      )
        throw new Error('LIVE_VERIFY_RECEIPT_SCOPE_INVALID');
      if (!passed || receipt.result !== 'PASS') {
        step.result =
          receipt.result === 'BLOCKED' || receipt.result === 'NOT_RUN'
            ? 'BLOCKED'
            : receipt.result === 'INCONCLUSIVE'
              ? 'INCONCLUSIVE'
              : 'FAIL';
        return await stop(step.result, 'receipt');
      }
      step.result = 'PASS';
      if (profile === 'protocol') previous = config.resultPath;
    } catch {
      step.result = passed ? 'BLOCKED' : 'FAIL';
      return stop(step.result, 'receipt');
    }
    await save();
  }
  summary.result = 'PASS';
  await save();
  return summary;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    if (process.argv.length !== 2)
      throw new Error('LIVE_VERIFY_ARGUMENTS_INVALID');
    const summary = await verifyLocal();
    if (summary.result !== 'PASS') process.exitCode = 1;
  } catch {
    process.stdout.write(
      '{"result":"BLOCKED","reason":"verification","physicalDeviceProof":false,"replacesAcLive012":false}\n',
    );
    process.exitCode = 1;
  }
}
