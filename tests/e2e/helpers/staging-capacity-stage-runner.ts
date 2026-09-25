import {
  CapacityHarnessError,
  type CapacityStage,
  writeCapacityStageCheckpoint,
} from './staging-capacity';

export const CAPACITY_TEST_TIMEOUT_MS = 12 * 60_000;
export const CAPACITY_RUN_TIMEOUT_MS = 8 * 60_000;

const STAGE_TIMEOUT_MS: Readonly<Partial<Record<CapacityStage, number>>> = {
  account_setup: 180_000,
  browser_diagnostics: 30_000,
  browser_setup: 60_000,
  login: 120_000,
  release_marker: 30_000,
};

export const capacityStageTimeoutMs = (stage: CapacityStage): number =>
  STAGE_TIMEOUT_MS[stage] ?? 60_000;

export async function runWithCapacityTimeout<T>(
  operation: () => Promise<T> | T,
  timeoutMs: number,
  onTimeout: () => void = () => undefined,
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new CapacityHarnessError('CAPACITY_TIMEOUT_INVALID');
  }
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      try {
        onTimeout();
      } finally {
        reject(new CapacityHarnessError('CAPACITY_STAGE_TIMEOUT'));
      }
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      timeoutPromise,
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

type CapacityStageRunnerOptions = Readonly<{
  now?: () => number;
  onTimeout: () => void;
  result: Record<string, unknown>;
  resultPath: string;
}>;

export function createCapacityStageRunner({
  now = Date.now,
  onTimeout,
  result,
  resultPath,
}: CapacityStageRunnerOptions) {
  const deadlineAt = now() + CAPACITY_RUN_TIMEOUT_MS;
  let activeStage: CapacityStage = 'release_marker';

  return {
    currentStage: () => activeStage,
    run: async <T>(stage: CapacityStage, operation: () => Promise<T> | T) => {
      activeStage = stage;
      await writeCapacityStageCheckpoint(resultPath, result, stage, 'running');
      const timeoutMs = Math.min(
        capacityStageTimeoutMs(stage),
        Math.max(1, deadlineAt - now()),
      );
      try {
        const value = await runWithCapacityTimeout(
          operation,
          timeoutMs,
          onTimeout,
        );
        await writeCapacityStageCheckpoint(
          resultPath,
          result,
          stage,
          'completed',
        );
        return value;
      } catch (error) {
        await writeCapacityStageCheckpoint(resultPath, result, stage, 'failed');
        throw error;
      }
    },
  };
}
