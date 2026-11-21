import {
  CAPACITY_CLEANUP_TIMEOUT_MS,
  CAPACITY_OPERATION_SETTLE_TIMEOUT_MS,
  CAPACITY_RUN_TIMEOUT_MS,
  runWithCapacityTimeout,
} from '../../tests/e2e/helpers/staging-capacity-stage-runner';

interface LifecycleOptions {
  operate: (signal: AbortSignal) => Promise<void>;
  close: () => Promise<void>;
  cleanup: (signal: AbortSignal) => Promise<void>;
  controller?: AbortController;
  generatorLimited?: () => boolean;
  runTimeoutMs?: number;
  settleTimeoutMs?: number;
  cleanupTimeoutMs?: number;
}
export const runCapacityLifecycle = async (options: LifecycleOptions) => {
  const controller = options.controller ?? new AbortController();
  let operationPassed = false;
  const state = { operationSettled: false, closed: false };
  const pending = Promise.resolve().then(() =>
    options.operate(controller.signal),
  );
  void pending.then(
    () => {
      state.operationSettled = true;
    },
    () => {
      state.operationSettled = true;
    },
  );
  try {
    await runWithCapacityTimeout(
      () => pending,
      options.runTimeoutMs ?? CAPACITY_RUN_TIMEOUT_MS,
      () => {
        controller.abort();
      },
    );
    operationPassed = true;
  } catch {
    /* Only safe lifecycle states reach the receipt. */
  }
  controller.abort();

  try {
    // Closing transports and settling the original operation share one 45s
    // budget; a timeout never authorizes deletion while setup may still run.
    await runWithCapacityTimeout(async () => {
      await options.close();
      state.closed = true;
      await pending.catch(() => undefined);
    }, options.settleTimeoutMs ?? CAPACITY_OPERATION_SETTLE_TIMEOUT_MS);
  } catch {
    /* Fail closed below, retaining exact-run ownership for recovery. */
  }
  if (!state.closed || !state.operationSettled)
    return { result: 'FAIL' as const, cleanup: 'blocked' as const };
  const cleanupController = new AbortController();
  try {
    await runWithCapacityTimeout(
      () => options.cleanup(cleanupController.signal),
      options.cleanupTimeoutMs ?? CAPACITY_CLEANUP_TIMEOUT_MS,
      () => {
        cleanupController.abort();
      },
    );
  } catch {
    return { result: 'FAIL' as const, cleanup: 'failed' as const };
  } finally {
    cleanupController.abort();
  }
  return {
    result: options.generatorLimited?.()
      ? ('INCONCLUSIVE' as const)
      : operationPassed
        ? ('PASS' as const)
        : ('FAIL' as const),
    cleanup: 'verified' as const,
  };
};

// Do not let Promise.all's early rejection hide still-running actor requests.
export const settleCapacityOperations = async <T>(
  operations: readonly (() => Promise<T>)[],
): Promise<T[]> => {
  const settled = await Promise.allSettled(
    operations.map((operation) => Promise.resolve().then(operation)),
  );
  if (settled.some((result) => result.status === 'rejected'))
    throw new Error('LIVE_CAPACITY_ACTOR_OPERATION_FAILED');
  return settled.flatMap((result) =>
    result.status === 'fulfilled' ? [result.value] : [],
  );
};
