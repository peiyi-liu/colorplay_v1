import {
  createCapacityRunDiagnostics,
  type CapacityStopSource,
} from './capacity-run-diagnostics';
import { performance } from 'node:perf_hooks';
import {
  newCapacityReceipt,
  finalizeCapacityReceipt,
  type CapacityReceipt,
} from './capacity-receipt';
import { createCapacityCandidate } from './capacity-publication';
import { summarizeOperations } from './capacity-metrics';
import { capacityFailure } from './capacity-scope';
import { createCapacityJourneys } from './capacity-journeys';
import type { CapacityRuntime } from './capacity-runtime';
export const CAPACITY_OUTER_BUDGET_MS = 1500000;
export const CAPACITY_CLEANUP_BUDGET_MS = 30000;
export interface CapacityRunnerPorts {
  now?: () => number;
  startedAtMs?: number;
  createJourneys?: typeof createCapacityJourneys;
}
export const runOneCapacityLeg = async (
  runtime: CapacityRuntime,
  parentSignal: AbortSignal,
  ports: CapacityRunnerPorts = {},
): Promise<CapacityReceipt> => {
  const now = ports.now ?? (() => performance.now()),
    started = ports.startedAtMs ?? now(),
    outerDeadline = started + CAPACITY_OUTER_BUDGET_MS,
    businessDeadline = outerDeadline - CAPACITY_CLEANUP_BUDGET_MS;
  const controller = new AbortController(),
    signal = AbortSignal.any([parentSignal, controller.signal]);
  const diagnostics = createCapacityRunDiagnostics(runtime.leg.actors, now);
  let requestedSource: CapacityStopSource = 'UNKNOWN';
  let stopping = false,
    timedOut = false;
  const pending = new Set<Promise<unknown>>();
  const stop = (source: CapacityStopSource = 'UNKNOWN') => {
    requestedSource = source;
    diagnostics.abortRequest(source);
    stopping = true;
    controller.abort();
  };
  const timer = setTimeout(
    () => {
      timedOut = true;
      stop('BUSINESS_DEADLINE');
    },
    Math.max(0, businessDeadline - now()),
  );
  const check = () => {
    if (signal.aborted || stopping || now() >= businessDeadline)
      return capacityFailure();
  };
  const receipt = newCapacityReceipt(
    runtime.manifest,
    runtime.scope,
    runtime.leg.legId,
    runtime.request.runId,
    runtime.predecessorSha256,
  );
  receipt.bundle = runtime.bundle;
  receipt.controls.functionalAuthority = true;
  let sequence = runtime.request.retention.sequence,
    previous = runtime.request.retention.previousProofSha256;
  let completedCohorts: (40 | 60)[] = [
    ...runtime.request.retention.completedRegistrationCohorts,
  ];
  const work = (ports.createJourneys ?? createCapacityJourneys)(
    runtime,
    signal,
    () => {
      stop('COLLECTOR_INVALID');
    },
    diagnostics,
  );
  const signalObserved = () => {
    diagnostics.signal(
      parentSignal.aborted ? 'PARENT_SIGNAL' : requestedSource,
    );
  };
  if (signal.aborted)
    diagnostics.signal(
      parentSignal.aborted ? 'PARENT_SIGNAL' : requestedSource,
      true,
    );
  else signal.addEventListener('abort', signalObserved, { once: true });
  const bounded = async <T>(
    promise: Promise<T>,
    deadline: number,
  ): Promise<T> => {
    pending.add(promise);
    void promise.finally(() => pending.delete(promise)).catch(() => undefined);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const expired = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(
        () => {
          reject(new Error('CAPACITY_EVIDENCE_INVALID'));
        },
        Math.max(0, deadline - now()),
      );
    });
    try {
      return await Promise.race([promise, expired]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  };
  const retention = async (
    checkpoint: 'before' | 'after' | 'partial_failure',
    ownedSignal = signal,
  ) => {
    const proof = await runtime.retention(
      {
        checkpoint,
        sequence,
        previousProofSha256: previous,
        completedRegistrationCohorts: completedCohorts,
      },
      ownedSignal,
    );
    await runtime.journal.write(`retention-${checkpoint}`, proof);
    previous = proof.readOnlyProofSha256;
    sequence++;
    return proof;
  };
  let journeyPassed = false;
  let cleanupDeadline: number;
  try {
    check();
    await bounded(runtime.preflight(), businessDeadline);
    check();
    await bounded(retention('before'), businessDeadline);
    check();
    const result = await bounded(work.run(), businessDeadline).catch(
      (error: unknown) => {
        diagnostics.journeyFailure(error, signal);
        throw error;
      },
    );
    check();
    journeyPassed = true;
    receipt.metrics = summarizeOperations(
      result.samples,
      runtime.leg.actors,
      result.completed,
    );
    receipt.barriers = runtime.leg.barriers.map((name, index) => ({
      name,
      measurement: result.barriers[index] ?? null,
    }));
    receipt.controls = {
      ...receipt.controls,
      ownership: true,
      journey: true,
      readback: true,
      outsider: result.outsider,
      unexpectedErrors: result.unexpectedErrors,
    };
    receipt.rateLimit = {
      observed429Count: 0,
      source: 'NOT_OBSERVED',
      retryAfterSeconds: null,
      observedAtUtc: null,
      nextEligibleAtUtc: null,
      evidenceSha256: null,
      automaticRetryCount: 0,
    };
    if (runtime.leg.scenario === 'fresh_registration')
      completedCohorts = runtime.leg.actors === 40 ? [40] : [40, 60];
    await bounded(retention('after'), businessDeadline);
    check();
    receipt.controls.retention = true;
  } catch {
    if (now() >= businessDeadline) timedOut = true;
    receipt.controls.journey = false;
    receipt.controls.retention = null;
    if (!signal.aborted && now() < businessDeadline) {
      try {
        await bounded(retention('partial_failure'), businessDeadline);
      } catch {
        /* Unknown ownership remains retained; no broad cleanup. */
      }
    }
  } finally {
    diagnostics.finallyEnter();
    clearTimeout(timer);
    stopping = true;
    // End business before resource closure, but keep the original absolute outer
    // deadline. Nothing gets an extra cleanup grace period.
    cleanupDeadline = Math.min(
      outerDeadline,
      now() + CAPACITY_CLEANUP_BUDGET_MS,
    );
    try {
      const health = work.health();
      receipt.health = health;
      diagnostics.stopRequest('FINALLY');
      const closed = work.stop();
      const results = await bounded(
        Promise.allSettled([closed, ...pending]),
        cleanupDeadline,
      );
      const closedOk = results[0].status === 'fulfilled';
      diagnostics.stopComplete(closedOk ? 'FULFILLED' : 'UNKNOWN');
      receipt.controls.cleanup = closedOk;
      receipt.controls.resourcesClosed = closedOk ? true : null;
      receipt.controls.settled = true;
    } catch {
      diagnostics.stopComplete('UNKNOWN');
      receipt.controls.cleanup = false;
      receipt.controls.resourcesClosed = null;
      receipt.controls.settled = null;
    } finally {
      stop('FINALLY');
    }
  }
  signal.removeEventListener('abort', signalObserved);
  receipt.elapsedMs = Math.max(0, now() - started);
  receipt.timedOut = timedOut;
  receipt.runAborted =
    parentSignal.aborted || (!journeyPassed && signal.aborted);
  let final = finalizeCapacityReceipt(receipt, runtime.manifest, runtime.scope);
  try {
    diagnostics.seal();
    const diagnostic = diagnostics.snapshot();
    await bounded(
      runtime.journal.write('capacity-run-diagnostics', diagnostic),
      cleanupDeadline,
    );
    if (diagnostics.snapshot().collection !== 'OBSERVED')
      return capacityFailure();
    await bounded(
      runtime.journal.write(
        'capacity-result-candidate',
        createCapacityCandidate(final),
      ),
      cleanupDeadline,
    );
    if (now() >= cleanupDeadline || parentSignal.aborted) {
      final.timedOut = now() >= cleanupDeadline;
      final.runAborted = parentSignal.aborted;
      final.elapsedMs = Math.max(0, now() - started);
      final = finalizeCapacityReceipt(final, runtime.manifest, runtime.scope);
    }
  } catch {
    final.timedOut = true;
    final.controls.settled = null;
    final.elapsedMs = Math.max(0, now() - started);
    final = finalizeCapacityReceipt(final, runtime.manifest, runtime.scope);
  }
  return final;
};
