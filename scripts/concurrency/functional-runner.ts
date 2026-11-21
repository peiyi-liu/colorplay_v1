import { performance } from 'node:perf_hooks';
import { z } from 'zod';
import { fail, functionalFailureCode, type FunctionalScope } from './config';
import { requireFunctionalReady } from './local-runtime';
import type { PrivateJournal } from './private-journal';
import {
  finishFunctionalReceipt,
  functionalCandidateSchema,
  functionalStages,
  newFunctionalReceipt,
  validateStageProof,
  type FunctionalStage,
} from './functional-receipt';
export const FUNCTIONAL_OUTER_MS = 25 * 60_000;
export const FUNCTIONAL_CLEANUP_MS = 30_000;
export interface FunctionalRunPorts {
  preflight: (signal: AbortSignal) => Promise<FunctionalScope>;
  canonicalBaseline: (
    scope: FunctionalScope,
    signal: AbortSignal,
  ) => Promise<void>;
  stage: (stage: FunctionalStage, signal: AbortSignal) => Promise<unknown>;
  close: () => Promise<{ resourcesClosed: boolean; settled: boolean }>;
  journal: PrivateJournal;
  artifactSha256: string;
  mediaOraclePresent: boolean;
  now?: () => number;
}
const boundedStop = async <T>(work: Promise<T>, durationMs: number) => {
  if (durationMs <= 0) {
    void work.catch(() => undefined);
    return { done: false as const };
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work.then((value) => ({ done: true as const, value })),
      new Promise<{ done: false }>((resolve) => {
        timer = setTimeout(() => {
          resolve({ done: false });
        }, durationMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
};
export const runFunctional = async (ports: FunctionalRunPorts) => {
  if (!ports.mediaOraclePresent) return fail('FUNCTIONAL_PREFLIGHT_FAILED');
  const now = ports.now ?? (() => performance.now());
  const started = now();
  const controller = new AbortController();
  const pending = new Set<Promise<unknown>>();
  let rejectAbort: () => void = () => undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = () => {
      reject(new Error('FUNCTIONAL_ABORTED'));
    };
  });
  void aborted.catch(() => undefined);
  controller.signal.addEventListener('abort', rejectAbort, { once: true });
  const businessTimer = setTimeout(() => {
    controller.abort();
  }, FUNCTIONAL_OUTER_MS - FUNCTIONAL_CLEANUP_MS);
  const observe = <T>(operation: () => Promise<T>) => {
    const work = Promise.resolve().then(operation);
    pending.add(work);
    void work.then(
      () => {
        pending.delete(work);
      },
      () => {
        pending.delete(work);
      },
    );
    return work;
  };
  const run = <T>(operation: () => Promise<T>) =>
    Promise.race([observe(operation), aborted]);
  let scope: FunctionalScope;
  try {
    scope = await run(() => ports.preflight(controller.signal));
    requireFunctionalReady(scope);
  } catch {
    clearTimeout(businessTimer);
    controller.abort();
    controller.signal.removeEventListener('abort', rejectAbort);
    const closing = observe(() => ports.close());
    await boundedStop(
      Promise.allSettled([closing, ...pending]),
      Math.min(FUNCTIONAL_CLEANUP_MS, FUNCTIONAL_OUTER_MS - (now() - started)),
    );
    return fail('FUNCTIONAL_PREFLIGHT_FAILED');
  }
  const receipt = newFunctionalReceipt(scope, ports.artifactSha256);
  try {
    for (const [index, stage] of functionalStages.entries()) {
      const row = receipt.stages[index];
      if (!row) return fail('FUNCTIONAL_OPERATION_FAILED');
      const stageStarted = now();
      row.status = 'running';
      await run(() =>
        ports.journal.write(`stage-${stage.replaceAll('_', '-')}-intent`, {
          stage,
        }),
      );
      try {
        if (stage === 'canonical_baseline')
          await run(() => ports.canonicalBaseline(scope, controller.signal));
        row.proof = validateStageProof(
          stage,
          await run(() => ports.stage(stage, controller.signal)),
        );
        row.elapsedMs = Math.max(0, now() - stageStarted);
        await run(() =>
          ports.journal.write(`stage-${stage.replaceAll('_', '-')}-confirmed`, {
            stage,
            elapsedMs: row.elapsedMs,
            proof: row.proof,
          }),
        );
        row.status = 'pass';
      } catch (error) {
        row.status = 'fail';
        row.elapsedMs = Math.max(0, now() - stageStarted);
        receipt.failureStage = stage;
        // Do not let a broken journal hide the original failure or create an unhandled task.
        await run(() =>
          ports.journal.write(`stage-${stage.replaceAll('_', '-')}-failure`, {
            stage,
            code: controller.signal.aborted
              ? 'FUNCTIONAL_ABORTED'
              : functionalFailureCode(error),
          }),
        ).catch(() => undefined);
        break;
      }
    }
  } catch {
    const unfinished = receipt.stages.find((row) => row.status === 'running');
    if (unfinished) unfinished.status = 'fail';
    receipt.failureStage = unfinished?.stage ?? 'cleanup';
  }
  receipt.timedOut = controller.signal.aborted;
  clearTimeout(businessTimer);
  controller.abort();
  controller.signal.removeEventListener('abort', rejectAbort);
  const cleanupDeadline = Math.min(
    started + FUNCTIONAL_OUTER_MS,
    now() + FUNCTIONAL_CLEANUP_MS,
  );
  try {
    const closed = observe(() => ports.close());
    const settle = async () => {
      const result = await closed;
      await Promise.allSettled([...pending]);
      return result;
    };
    const outcome = await boundedStop(settle(), cleanupDeadline - now());
    if (!outcome.done) {
      receipt.cleanup = {
        status: 'unavailable',
        resourcesClosed: null,
        settled: false,
      };
      receipt.timedOut = true;
    } else {
      const proof = z
        .strictObject({
          resourcesClosed: z.literal(true),
          settled: z.literal(true),
        })
        .parse(outcome.value);
      receipt.cleanup = { status: 'verified', ...proof };
    }
  } catch {
    receipt.cleanup = {
      status: 'failed',
      resourcesClosed: false,
      settled: pending.size === 0,
    };
  }
  if (receipt.cleanup.status !== 'verified') receipt.failureStage ??= 'cleanup';
  let final = finishFunctionalReceipt(receipt);
  const candidate = functionalCandidateSchema.parse({
    schemaVersion: 1,
    result: 'PENDING_EXTERNAL_ATTESTATION',
    receipt: Object.fromEntries(
      Object.entries(final).filter(([key]) => key !== 'result'),
    ),
  });
  try {
    if (cleanupDeadline <= now()) {
      final = {
        ...final,
        result: 'INCONCLUSIVE',
        failureStage: final.failureStage ?? 'cleanup',
      };
    } else if (
      !(
        await boundedStop(
          observe(() =>
            ports.journal.write('functional-result-candidate', candidate),
          ),
          cleanupDeadline - now(),
        )
      ).done
    )
      final = { ...final, result: 'INCONCLUSIVE', failureStage: 'cleanup' };
    if (cleanupDeadline <= now())
      final = { ...final, result: 'INCONCLUSIVE', failureStage: 'cleanup' };
  } catch {
    final = { ...final, result: 'FAIL', failureStage: 'cleanup' };
  }
  return Object.freeze(final);
};
