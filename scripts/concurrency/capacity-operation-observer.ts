import {
  captureOperationTiming,
  type CapacityOperationTiming,
} from './capacity-operation-timing-diagnostics';
import { types } from 'node:util';
import {
  createCapacityOperationLifecycle,
  operationFailureCodes,
} from './capacity-operation-diagnostics';
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
// Pure URL classification only; this function does not admit a capacity scope.
export const capacityOperationForRequest = (
  scope: Pick<CapacityScope, 'supabaseUrl'>,
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
const operationFailureProjection = (raw: unknown) => {
  try {
    if (!raw || typeof raw !== 'object' || types.isProxy(raw)) return 'OTHER';
    const descriptor = Object.getOwnPropertyDescriptor(raw, 'errorText');
    const text: unknown =
      descriptor && 'value' in descriptor ? descriptor.value : null;
    if (typeof text !== 'string') return 'OTHER';
    const code = text.startsWith('net::') ? text.slice(5) : text;
    return (
      operationFailureCodes.find(
        (known) => known !== 'OTHER' && known === code,
      ) ?? 'OTHER'
    );
  } catch {
    return 'OTHER';
  }
};
export const createCapacityOperationObserver = async (
  scope: CapacityScope,
  context: BrowserContext,
  page: Page,
  actorIndex: number,
  signal: AbortSignal,
  nextId: () => string,
  businessActive: () => boolean,
  now = () => performance.now(),
  timing?: CapacityOperationTiming,
) => {
  requireCapacityScope(scope);
  if (signal.aborted || actorIndex < 0 || actorIndex > 59)
    return capacityFailure();
  const cdp: CDPSession = await context.newCDPSession(page),
    rows: OperationSample[] = [];
  const records = new Map<string, Attempt>();
  const accounting = createCapacityOperationAccounting(actorIndex);
  const lifecycle = createCapacityOperationLifecycle(now);
  const aborted = () => signal.aborted;
  const isAvailable = () => available;
  let active: Window | null = null,
    available = true,
    disposed = false,
    physicalRequests = 0,
    unattributedRequests = 0;
  const changed = new Set<() => void>();
  const observe = (
    event: Parameters<typeof lifecycle.record>[0],
    attempt?: Attempt,
    cdpAtMs: number | null = null,
    reason: Parameters<typeof lifecycle.record>[4] = 'NONE',
    failureCode: Parameters<typeof lifecycle.record>[6] = null,
  ) => {
    lifecycle.record(
      event,
      {
        available: available && !disposed,
        disposed,
        pending: records.size,
        activeOperation: active?.operation ?? null,
        cache: active?.cache ?? null,
        during: active?.during ?? null,
      },
      attempt,
      cdpAtMs,
      reason,
      records.values(),
      failureCode,
    );
  };
  const notify = () => {
    for (const fn of changed) fn();
  };
  const request = (raw: unknown) => {
    let validated = false;
    if (disposed) accounting.unavailable();
    try {
      const value = operationRequestSchema.parse(raw);
      validated = true;
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
        observe('INVALID', undefined, value.timestamp * 1000, 'REQUEST_CAP');
        return;
      }
      if (active?.operation !== op) {
        unattributedRequests++;
        observe('UNATTRIBUTED', undefined, value.timestamp * 1000);
        return;
      }
      if (records.has(value.requestId)) {
        available = false;
        observe(
          'INVALID',
          records.get(value.requestId),
          value.timestamp * 1000,
          'REQUEST_DUPLICATE',
        );
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
      if (op === 'published_content' && active.cache === 'cold')
        captureOperationTiming(() =>
          timing?.request(attempt, value.timestamp * 1000),
        );
      lifecycle.track(attempt, op);
      observe('REQUEST', attempt, value.timestamp * 1000);
      if (active.attempts.length > 64) {
        available = false;
        observe('INVALID', attempt, value.timestamp * 1000, 'ATTEMPT_CAP');
      }
    } catch {
      accounting.unavailable();
      available = false;
      observe(
        'INVALID',
        undefined,
        null,
        validated ? 'REQUEST_CALLBACK' : 'REQUEST_SCHEMA',
      );
    }
  };
  const response = (raw: unknown) => {
    let validated = false;
    try {
      const value = operationResponseSchema.parse(raw);
      validated = true;
      const attempt = records.get(value.requestId);
      if (!attempt) return;
      attempt.status = value.response.status;
      captureOperationTiming(() => timing?.response(attempt, raw));
      attempt.cached = value.response.fromDiskCache === true;
      if (value.response.fromServiceWorker) {
        available = false;
        observe('INVALID', attempt, null, 'SERVICE_WORKER');
      }
      observe('RESPONSE', attempt);
    } catch {
      accounting.unavailable();
      available = false;
      observe(
        'INVALID',
        undefined,
        null,
        validated ? 'RESPONSE_CALLBACK' : 'RESPONSE_SCHEMA',
      );
    }
  };
  const finish = (raw: unknown) => {
    let validated = false;
    try {
      const value = operationFinishSchema.parse(raw);
      validated = true;
      const a = records.get(value.requestId);
      if (!a) return;
      a.end = value.timestamp * 1000;
      captureOperationTiming(() => timing?.finished(a, value.timestamp * 1000));
      if (a.end < a.start) {
        available = false;
        observe('INVALID', a, a.end, 'FINISH_BEFORE_START');
      }
      records.delete(value.requestId);
      notify();
      observe('FINISH', a, a.end);
    } catch {
      accounting.unavailable();
      available = false;
      observe(
        'INVALID',
        undefined,
        null,
        validated ? 'FINISH_CALLBACK' : 'FINISH_SCHEMA',
      );
    }
  };
  const failed = (raw: unknown) => {
    let validated = false;
    try {
      const value = operationFailedSchema.parse(raw);
      validated = true;
      const a = records.get(value.requestId);
      if (!a) return;
      captureOperationTiming(() => timing?.failed(a, value.timestamp * 1000));
      a.status = 0;
      a.end = value.timestamp * 1000;
      records.delete(value.requestId);
      notify();
      observe('FAILED', a, a.end, 'NONE', operationFailureProjection(raw));
    } catch {
      accounting.unavailable();
      available = false;
      observe(
        'INVALID',
        undefined,
        null,
        validated ? 'FAILED_CALLBACK' : 'FAILED_SCHEMA',
      );
    }
  };
  const abort = () => {
    available = false;
    observe('INVALID', undefined, null, 'ABORT');
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
    observe('INVALID', undefined, null, 'NETWORK_ENABLE');
  }
  const settle = () =>
    new Promise<void>((resolve) => {
      observe('SETTLE_ENTERED');
      if (records.size === 0 || signal.aborted || disposed) {
        resolve();
        observe('SETTLE_DONE');
        return;
      }
      const deadline = setTimeout(() => {
        available = false;
        observe('INVALID', undefined, null, 'SETTLE_DEADLINE');
        done();
      }, 15000);
      const done = () => {
        if (records.size === 0 || signal.aborted || disposed || !available) {
          clearTimeout(deadline);
          changed.delete(done);
          resolve();
          observe('SETTLE_DONE');
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
      if (active || disposed || signal.aborted || !available) {
        observe('RUN_REFUSED');
        return capacityFailure();
      }
      const window: Window = {
        operation,
        attempts: [],
        cache,
        replayOf,
        during: businessActive(),
      };
      active = window;
      observe('RUN_ENTERED');
      let outcome: 'success' | 'error' = 'success';
      try {
        return await action();
      } catch {
        outcome = 'error';
        return capacityFailure();
      } finally {
        observe(outcome === 'success' ? 'ACTION_RETURNED' : 'ACTION_FAILED');
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
        observe('SAMPLE_ENTERED');
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
        observe('SAMPLE');
        void now; // Node's separate business window is never subtracted from CDP clocks.
      }
    },
    diagnostics: accounting.seal,
    operationLifecycle: lifecycle.seal,
    samples: () => rows.map((row) => structuredClone(row)),
    snapshot: () => ({
      available: available && !disposed,
      pending: records.size,
      physicalRequests,
      unattributedRequests,
    }),
    dispose: async () => {
      captureOperationTiming(() => timing?.dispose());
      disposed = true;
      observe('DISPOSE');
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
