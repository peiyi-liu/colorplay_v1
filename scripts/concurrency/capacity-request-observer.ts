import { z } from 'zod';
import type { BrowserContext, CDPSession, Page } from '@playwright/test';
import {
  capacityFailure,
  requireCapacityScope,
  type CapacityScope,
} from './capacity-scope';
const actionResponseSchema = z.object({
  requestId: z.string().max(200),
  response: z.object({ status: z.number().int().min(100).max(599) }),
});
const actionFinishedSchema = z.object({
  requestId: z.string().max(200),
  timestamp: z.number().nonnegative(),
});
const actionFailedSchema = z.object({
  requestId: z.string().max(200),
  canceled: z.boolean().optional(),
});

export const capacityActionPhases = [
  'entry',
  'login',
  'post_registration_login',
  'otp_send',
  'otp_verify',
  'registration_complete',
] as const;
export type CapacityActionPhase = (typeof capacityActionPhases)[number];
export interface CapacityActionObservation {
  actorIndex: number;
  phase: CapacityActionPhase;
  clock: 'CHROMIUM_NETWORK_MONOTONIC';
  requestAtMs: number;
  durationMs: number;
  status: number;
  physicalRequests: 1;
}
interface Action {
  phase: CapacityActionPhase;
  generation: number;
  started: number | null;
  status: number | null;
  requests: number;
  done: boolean;
  resolve: (value: CapacityActionObservation) => void;
  reject: () => void;
  timer: ReturnType<typeof setTimeout>;
}
const incoming = z.object({
  requestId: z.string().min(1).max(200),
  timestamp: z.number().nonnegative(),
  type: z.string().max(50).optional(),
  request: z.object({ url: z.string().max(4096), method: z.string().max(10) }),
});
export const createCapacityRequestObserver = async (
  scope: CapacityScope,
  context: BrowserContext,
  page: Page,
  actorIndex: number,
  signal: AbortSignal,
) => {
  requireCapacityScope(scope);
  if (
    !Number.isInteger(actorIndex) ||
    actorIndex < 0 ||
    actorIndex > 59 ||
    signal.aborted
  )
    return capacityFailure();
  let cdp: CDPSession;
  try {
    cdp = await context.newCDPSession(page);
  } catch {
    return capacityFailure();
  }
  const records = new Map<string, Action | null>();
  let current: Action | null = null,
    generation = 0,
    disposed = false,
    available = false,
    unexpectedHttpErrors = 0,
    unexpectedNetworkFailures = 0,
    actionsCompleted = 0;
  const terminate = (action: Action | null) => {
    if (action && !action.done) {
      action.done = true;
      clearTimeout(action.timer);
      action.reject();
    }
  };
  const fail = () => {
    available = false;
    terminate(current);
  };
  const matches = (
    phase: CapacityActionPhase,
    value: z.infer<typeof incoming>,
  ) => {
    const url = new URL(value.request.url);
    if (url.username || url.password || url.search || url.hash) return false;
    if (phase === 'entry')
      return (
        value.type === 'Document' &&
        value.request.method === 'GET' &&
        url.origin === scope.appUrl &&
        url.pathname === '/'
      );
    if (value.request.method !== 'POST' || url.origin !== scope.supabaseUrl)
      return false;
    return (
      url.pathname ===
      (phase === 'login' || phase === 'post_registration_login'
        ? '/functions/v1/auth-login'
        : phase === 'otp_send'
          ? '/auth/v1/otp'
          : phase === 'otp_verify'
            ? '/auth/v1/verify'
            : '/functions/v1/student-register')
    );
  };
  const request = (input: unknown) => {
    try {
      const value = incoming.parse(input);
      if (records.size >= 2048) {
        fail();
        return;
      }
      const action =
        current && !current.done && matches(current.phase, value)
          ? current
          : null;
      records.set(value.requestId, action);
      if (
        !action &&
        capacityActionPhases.some(
          (phase) => phase !== 'entry' && matches(phase, value),
        )
      )
        unexpectedNetworkFailures++;
      if (action) {
        action.requests++;
        if (action.requests !== 1) {
          terminate(action);
          return;
        }
        action.started = value.timestamp * 1000;
      }
    } catch {
      fail();
    }
  };
  const response = (input: unknown) => {
    try {
      const value = actionResponseSchema.parse(input);
      const action = records.get(value.requestId);
      if (value.response.status >= 400) unexpectedHttpErrors++;
      if (action && !action.done && action.generation === generation) {
        action.status = value.response.status;
        if (value.response.status < 200 || value.response.status >= 300)
          terminate(action);
      }
    } catch {
      fail();
    }
  };
  const finished = (input: unknown) => {
    try {
      const value = actionFinishedSchema.parse(input),
        action = records.get(value.requestId);
      records.delete(value.requestId);
      if (action && !action.done && action.generation === generation) {
        if (
          signal.aborted ||
          disposed ||
          action.started === null ||
          action.status === null ||
          action.requests !== 1 ||
          value.timestamp * 1000 < action.started
        ) {
          terminate(action);
          return;
        }
        action.done = true;
        clearTimeout(action.timer);
        actionsCompleted++;
        action.resolve({
          actorIndex,
          phase: action.phase,
          clock: 'CHROMIUM_NETWORK_MONOTONIC',
          requestAtMs: action.started,
          durationMs: value.timestamp * 1000 - action.started,
          status: action.status,
          physicalRequests: 1,
        });
      }
    } catch {
      fail();
    }
  };
  const failed = (input: unknown) => {
    try {
      const value = actionFailedSchema.parse(input);
      const action = records.get(value.requestId);
      records.delete(value.requestId);
      if (action) terminate(action);
      else if (value.canceled !== true) unexpectedNetworkFailures++;
    } catch {
      fail();
    }
  };
  const listeners = [
    ['Network.requestWillBeSent', request],
    ['Network.responseReceived', response],
    ['Network.loadingFinished', finished],
    ['Network.loadingFailed', failed],
  ] as const;
  for (const [event, listener] of listeners) cdp.on(event, listener);
  const closed = () => {
    fail();
  };
  const isStopped = () => signal.aborted || disposed;
  page.on('close', closed);
  signal.addEventListener('abort', closed, { once: true });
  const dispose = async () => {
    disposed = true;
    available = false;
    terminate(current);
    for (const [event, listener] of listeners) cdp.off(event, listener);
    page.off('close', closed);
    signal.removeEventListener('abort', closed);
    records.clear();
    try {
      if (!page.isClosed()) await cdp.detach();
    } catch {
      return capacityFailure();
    }
  };
  try {
    await cdp.send('Network.enable', { maxPostDataSize: 0 });
    if (isStopped()) return capacityFailure();
    available = true;
  } catch {
    await dispose().catch(() => undefined);
    return capacityFailure();
  }
  return {
    arm: (phase: CapacityActionPhase) => {
      if (
        !available ||
        disposed ||
        signal.aborted ||
        (current && !current.done) ||
        generation >= 16 ||
        !capacityActionPhases.includes(phase)
      )
        return capacityFailure();
      generation++;
      let resolve: (value: CapacityActionObservation) => void = () => undefined,
        reject: () => void = () => undefined;
      const finished = new Promise<CapacityActionObservation>((yes, no) => {
        resolve = yes;
        reject = () => {
          no(new Error('CAPACITY_EVIDENCE_INVALID'));
        };
      });
      void finished.catch(() => undefined);
      const action: Action = {
        phase,
        generation,
        started: null,
        status: null,
        requests: 0,
        done: false,
        resolve,
        reject,
        timer: setTimeout(() => {
          terminate(action);
        }, 15000),
      };
      current = action;
      return {
        finished,
        cancel: () => {
          terminate(action);
        },
      };
    },
    snapshot: () => ({
      available: available && !disposed && !signal.aborted,
      actionsCompleted,
      unexpectedHttpErrors,
      unexpectedNetworkFailures,
      pendingAction: current !== null && !current.done,
    }),
    dispose,
  };
};
export type CapacityRequestObserver = Awaited<
  ReturnType<typeof createCapacityRequestObserver>
>;
