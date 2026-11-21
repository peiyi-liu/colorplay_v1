import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import { CAPACITY_TEST_TIMEOUT_MS } from '../../tests/e2e/helpers/staging-capacity-stage-runner';

import { installCapacityProcessDiagnostics } from './capacity-process-diagnostics';
import { parseCapacityConfig, type CapacityConfig } from './capacity-config';
import { readCapacityGitState } from './capacity-preflight';
import { runLowDeviceCapacity } from './capacity-run';

export const runCapacityFromArgs = async (
  args: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
  onLocalConfig?: (config: CapacityConfig) => void,
) => {
  const git = await readCapacityGitState();
  const revision =
    args.includes('--revision') || env.COLORPLAY_LIVE_EXPECTED_REVISION
      ? []
      : ['--revision', git.repoSha];
  const config = parseCapacityConfig(
    [...args.filter((argument) => argument !== '--'), ...revision],
    env,
  );
  if (!config.dryRun && !git.dirty && git.repoSha === config.expectedRevision)
    onLocalConfig?.(config);
  return {
    receipt: await runLowDeviceCapacity(config, git, env),
    resultPath: config.resultPath,
  };
};

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const watchdog = setTimeout(() => {
    process.stderr.write('LIVE_CAPACITY_OUTER_TIMEOUT\n');
    process.exit(1);
  }, CAPACITY_TEST_TIMEOUT_MS);
  // Does not prolong a successful process; still bounds orphaned handles.
  watchdog.unref();
  try {
    const { receipt, resultPath } = await runCapacityFromArgs(
      process.argv.slice(2),
      process.env,
      (config) => {
        installCapacityProcessDiagnostics(config);
      },
    );
    process.stdout.write(
      `${JSON.stringify({ result: receipt.result, reason: receipt.failureReason, environment: receipt.environment, profile: receipt.profile, actors: receipt.totalActors, browserContexts: receipt.browserContexts, resultPath, physicalDeviceProof: false, replacesAcLive012: false })}\n`,
    );
    if (receipt.result !== 'PASS' && receipt.result !== 'NOT_RUN')
      process.exitCode = 1;
  } catch {
    process.stdout.write(
      `${JSON.stringify({ result: 'BLOCKED', reason: 'configuration', physicalDeviceProof: false, replacesAcLive012: false })}\n`,
    );
    process.exitCode = 1;
  }
}
