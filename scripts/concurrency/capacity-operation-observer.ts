import { createCapacityOperationAccounting } from './capacity-game-diagnostics';
import { performance } from 'node:perf_hooks';
import type { BrowserContext, CDPSession, Page } from '@playwright/test';
import { z } from 'zod';
import {
  capacityFailure,
  requireCapacityScope,
  type CapacityScope,
} from './capacity-scope';
import {
  operationSampleSchema,
  type OperationSample,
} from './capacity-metrics';
import type { CapacityOperation } from './capacity-manifest';
const operationRequestSchema = z.object({
  requestId: z.string().max(200),
  timestamp: z.number().nonnegative(),
  request: z.object({
    url: z.string().max(4096),
    method: z.string().max(10),
  }),
});
const operationResponseSchema = z.object({
  requestId: z.string().max(200),
  response: z.object({
    status: z.number().int().min(100).max(599),
    fromDiskCache: z.boolean().optional(),
    fromServiceWorker: z.boolean().optional(),
  }),
});
const operationFinishSchema = z.object({
  requestId: z.string().max(200),
  timestamp: z.number().nonnegative(),
});
const operationFailedSchema = z.object({
  requestId: z.string().max(200),
  timestamp: z.number().nonnegative(),
});

export const capacityOperationEndpoints: Record<
  CapacityOperation,
  readonly string[]
> = {
  published_content: ['get_student_chapter_map'],
  submit_answer: ['submit_quiz_answer', 'submit_live_answer'],
  finalize_quiz: ['finalize_quiz_session'],
  leaderboard: ['get_classroom_leaderboard'],
  teacher_dashboard: ['teacher_classroom_overview'],
};
export const capacityOperationForRequest = (
  scope: CapacityScope,
  url: string,
  method: string,
): CapacityOperation | null => {
  try {
    const target = new URL(url);
    if (
      target.origin !== scope.supabaseUrl ||
      target.username ||
      target.password ||
      target.search ||
      target.hash ||
      method !== 'POST'
    )
      return null;
    return (
      (Object.keys(capacityOperationEndpoints) as CapacityOperation[]).find(
        (op) =>
          capacityOperationEndpoints[op].some(
            (name) => target.pathname === `/rest/v1/rpc/${name}`,
          ),
      ) ?? null
    );
  } catch {
    return null;
  }
};
interface Attempt {
  start: number;
  end: number | null;
  status: number | null;
  cached: boolean;
}
interface Window {
  operation: CapacityOperation;
  attempts: Attempt[];
  cache: OperationSample['cache'];
  replayOf: string | null;
  during: boolean;
}
export const createCapacityOperationObserver = async (
  scope: CapacityScope,
  context: BrowserContext,
  page: Page,
  actorIndex: number,
  signal: AbortSignal,
  nextId: () => string,
  businessActive: () => boolean,
  now = () => performance.now(),
) => {
  requireCapacityScope(scope);
  if (signal.aborted || actorIndex < 0 || actorIndex > 59)
    return capacityFailure();
  const cdp: CDPSession = await context.newCDPSession(page),
    rows: OperationSample[] = [];
  const records = new Map<string, Attempt>();
  const accounting = createCapacityOperationAccounting(actorIndex);
  const aborted = () => signal.aborted;
  const isAvailable = () => available;
  let active: Window | null = null,
    available = true,
    disposed = false,
    physicalRequests = 0,
    unattributedRequests = 0;
  const changed = new Set<() => void>();
  const notify = () => {
    for (const fn of changed) fn();
  };
  const request = (raw: unknown) => {
    if (disposed) accounting.unavailable();
    try {
      const value = operationRequestSchema.parse(raw);
      const op = capacityOperationForRequest(
        scope,
        value.request.url,
        value.request.method,
      );
      if (!op) return;
      physicalRequests++;
      accounting.note(op, active?.operation ?? null);
      if (disposed) accounting.unavailable();
      if (records.size >= 4096) {
        available = false;
        accounting.unavailable();
        return;
      }
      if (active?.operation !== op) {
        unattributedRequests++;
        return;
      }
      if (records.has(value.requestId)) {
        available = false;
        return;
      }
      const attempt = {
        start: value.timestamp * 1000,
        end: null,
        status: null,
        cached: false,
      };
      records.set(value.requestId, attempt);
      active.attempts.push(attempt);
      if (active.attempts.length > 64) available = false;
    } catch {
      accounting.unavailable();
      available = false;
    }
  };
  const response = (raw: unknown) => {
    try {
      const value = operationResponseSchema.parse(raw);
      const attempt = records.get(value.requestId);
      if (!attempt) return;
      attempt.status = value.response.status;
      attempt.cached = value.response.fromDiskCache === true;
      if (value.response.fromServiceWorker) available = false;
    } catch {
      accounting.unavailable();
      available = false;
    }
  };
  const finish = (raw: unknown) => {
    try {
      const value = operationFinishSchema.parse(raw);
      const a = records.get(value.requestId);
      if (!a) return;
      a.end = value.timestamp * 1000;
      if (a.end < a.start) available = false;
      records.delete(value.requestId);
      notify();
    } catch {
      accounting.unavailable();
      available = false;
    }
  };
  const failed = (raw: unknown) => {
    try {
      const value = operationFailedSchema.parse(raw);
      const a = records.get(value.requestId);
      if (!a) return;
      a.status = 0;
      a.end = value.timestamp * 1000;
      records.delete(value.requestId);
      notify();
    } catch {
      accounting.unavailable();
      available = false;
    }
  };
  const abort = () => {
    available = false;
    notify();
  };
  signal.addEventListener('abort', abort, { once: true });
  const listeners = [
    ['Network.requestWillBeSent', request],
    ['Network.responseReceived', response],
    ['Network.loadingFinished', finish],
    ['Network.loadingFailed', failed],
  ] as const;
  for (const [event, listener] of listeners) cdp.on(event, listener);
  try {
    await cdp.send('Network.enable', { maxPostDataSize: 0 });
  } catch {
    available = false;
  }
  const settle = () =>
    new Promise<void>((resolve) => {
      if (records.size === 0 || signal.aborted || disposed) {
        resolve();
        return;
      }
      const deadline = setTimeout(() => {
        available = false;
        done();
      }, 15000);
      const done = () => {
        if (records.size === 0 || signal.aborted || disposed || !available) {
          clearTimeout(deadline);
          changed.delete(done);
          resolve();
        }
      };
      changed.add(done);
      done();
    });
  return {
    run: async <T>(
      operation: CapacityOperation,
      cache: OperationSample['cache'],
      action: () => Promise<T>,
      replayOf: string | null = null,
    ): Promise<T> => {
      if (active || disposed || signal.aborted || !available)
        return capacityFailure();
      const window: Window = {
        operation,
        attempts: [],
        cache,
        replayOf,
        during: businessActive(),
      };
      active = window;
      let outcome: 'success' | 'error' = 'success';
      try {
        return await action();
      } catch {
        outcome = 'error';
        return capacityFailure();
      } finally {
        await settle();
        const attempts = window.attempts,
          first = attempts[0],
          last = attempts.at(-1),
          status = last?.status;
        const success =
          attempts.length === 0
            ? outcome === 'success' && !aborted() && isAvailable()
            : outcome === 'success' &&
              isAvailable() &&
              !aborted() &&
              status !== null &&
              status !== undefined &&
              status >= 200 &&
              status < 300 &&
              attempts.every((a) => a.end !== null);
        const sample = operationSampleSchema.parse({
          id: nextId(),
          actorIndex,
          operation,
          startedAtMs: first?.start ?? 0,
          finishedAtMs: last?.end ?? first?.start ?? 0,
          status: success ? 'success' : aborted() ? 'timeout' : 'error',
          reason: success
            ? null
            : status === 401
              ? 'auth'
              : status === 403
                ? 'permission'
                : status === 429
                  ? 'rate_limited'
                  : status !== undefined && status !== null && status >= 500
                    ? 'unavailable'
                    : 'unknown',
          attempts: attempts.map((a) => ({
            startedAtMs: a.start,
            finishedAtMs: a.end,
          })),
          cache: first ? cache : outcome === 'success' ? 'hit' : 'unavailable',
          replayOf,
          duringStudentBusinessLoad: window.during && businessActive(),
        });
        rows.push(sample);
        active = null;
        void now; // Node's separate business window is never subtracted from CDP clocks.
      }
    },
    diagnostics: accounting.seal,
    samples: () => rows.map((row) => structuredClone(row)),
    snapshot: () => ({
      available: available && !disposed,
      pending: records.size,
      physicalRequests,
      unattributedRequests,
    }),
    dispose: async () => {
      disposed = true;
      signal.removeEventListener('abort', abort);
      for (const [event, listener] of listeners) cdp.off(event, listener);
      notify();
      try {
        await cdp.detach();
      } catch {
        if (!page.isClosed()) return capacityFailure();
      }
    },
  };
};
