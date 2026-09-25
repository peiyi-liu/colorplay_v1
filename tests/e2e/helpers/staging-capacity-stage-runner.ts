import { CapacityHarnessError, type CapacityStage } from './staging-capacity';
import { writeCapacityStageCheckpoint } from './staging-capacity-checkpoint';

export const CAPACITY_TEST_TIMEOUT_MS = 12 * 60_000;
export const CAPACITY_RUN_TIMEOUT_MS = 8 * 60_000;
export const CAPACITY_OPERATION_SETTLE_TIMEOUT_MS = 45_000;
export const CAPACITY_CLEANUP_TIMEOUT_MS = 150_000;

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
  onCheckpointError?: () => void;
  onTimeout: () => void;
  result: Record<string, unknown>;
  resultPath: string;
}>;

export function createCapacityStageRunner({
  now = Date.now,
  onCheckpointError = () => undefined,
  onTimeout,
  result,
  resultPath,
}: CapacityStageRunnerOptions) {
  const deadlineAt = now() + CAPACITY_RUN_TIMEOUT_MS;
  let activeStage: CapacityStage = 'release_marker';
  let activeOperation: Promise<unknown> | undefined;

  const reportCheckpointError = () => {
    try {
      onCheckpointError();
    } catch {
      // Result persistence must never prevent cleanup.
    }
  };

  const checkpoint = async (
    status: 'cleanup' | 'failed' | 'finished',
  ): Promise<void> => {
    try {
      await writeCapacityStageCheckpoint(
        resultPath,
        result,
        activeStage,
        status,
      );
    } catch {
      reportCheckpointError();
    }
  };

  const requiredCheckpoint = async (
    status: 'completed' | 'running',
  ): Promise<void> => {
    try {
      await writeCapacityStageCheckpoint(
        resultPath,
        result,
        activeStage,
        status,
      );
    } catch {
      reportCheckpointError();
      throw new CapacityHarnessError('CAPACITY_CHECKPOINT_WRITE_FAILED');
    }
  };

  return {
    checkpoint,
    currentStage: () => activeStage,
    run: async <T>(stage: CapacityStage, operation: () => Promise<T> | T) => {
      activeStage = stage;
      await requiredCheckpoint('running');
      const timeoutMs = Math.min(
        capacityStageTimeoutMs(stage),
        Math.max(1, deadlineAt - now()),
      );
      const operationPromise = Promise.resolve().then(operation);
      activeOperation = operationPromise;
      void operationPromise.then(
        () => {
          if (activeOperation === operationPromise) {
            activeOperation = undefined;
          }
        },
        () => {
          if (activeOperation === operationPromise) {
            activeOperation = undefined;
          }
        },
      );
      try {
        const value = await runWithCapacityTimeout(
          () => operationPromise,
          timeoutMs,
          onTimeout,
        );
        await requiredCheckpoint('completed');
        return value;
      } catch (error) {
        await checkpoint('failed');
        throw error;
      }
    },
    settlePendingOperation: async () => {
      const operation = activeOperation;
      if (operation === undefined) return;
      try {
        await runWithCapacityTimeout(
          () => operation,
          CAPACITY_OPERATION_SETTLE_TIMEOUT_MS,
        );
      } catch (error) {
        if (
          error instanceof CapacityHarnessError &&
          error.publicCode === 'CAPACITY_STAGE_TIMEOUT'
        ) {
          throw new CapacityHarnessError('CAPACITY_OPERATION_SETTLE_TIMEOUT');
        }
        // The original operation error was already recorded by run().
      } finally {
        if (activeOperation === operation) activeOperation = undefined;
      }
    },
  };
}
