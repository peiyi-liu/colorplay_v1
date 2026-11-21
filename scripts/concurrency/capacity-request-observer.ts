import { installColdEntryPageObserver } from './capacity-cold-entry-observer';
import type { ColdEntryActor } from './capacity-cold-entry-diagnostics';
import { createOnboardingLogout } from './capacity-onboarding-logout';
import { createOnboardingConsolePairing } from './capacity-onboarding-console';
import {
  createRegistrationFirstReason,
  registrationEndpoint,
  registrationSnapshot,
} from './capacity-registration-final-diagnostics';
import { performance } from 'node:perf_hooks';
import type { SendPulse } from './capacity-send-diagnostics';
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
const onboardingControllers = new WeakMap<
  object,
  ReturnType<typeof createOnboardingLogout> & {
    finalizeCounter(): void;
    isLive(): boolean;
    consoleEvidence: ReturnType<
      typeof createOnboardingConsolePairing
    >['evidence'];
  }
>();
export const getCapacityOnboardingController = (observer: object) =>
  onboardingControllers.get(observer);
export const createCapacityRequestObserver = async (
  scope: CapacityScope,
  context: BrowserContext,
  page: Page,
  actorIndex: number,
  signal: AbortSignal,
  observeSend?: (value: SendPulse) => void,
  coldEntry?: ColdEntryActor,
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
  const cold = installColdEntryPageObserver(page, scope.appUrl, coldEntry);
  const diagnostic = createRegistrationFirstReason();
  const onboarding = createOnboardingLogout(scope.supabaseUrl, (id) =>
    cdp.send('Network.getResponseBody', { requestId: id }),
  );
  const records = new Map<string, Action | null>();
  const kinds = new Map<string, ReturnType<typeof registrationEndpoint>>();
  let current: Action | null = null,
    generation = 0,
    disposed = false,
    available = false,
    unexpectedHttpErrors = 0,
    unexpectedNetworkFailures = 0,
    actionsCompleted = 0;
  const consolePair = createOnboardingConsolePairing(
    scope.supabaseUrl,
    () =>
      available && !disposed && !signal.aborted && onboarding.discount() === 1,
  );
  const tickets = new WeakMap<Action, object>();
  const notify = (
    action: Action,
    kind: SendPulse['kind'],
    request?: { requestId: string; requestAtCdpMs: number },
    at?: number,
  ) => {
    try {
      const token = tickets.get(action);
      if (!observeSend || action.phase !== 'otp_send' || !token) return;
      const time = at ?? performance.now();
      observeSend({
        kind,
        actorOrdinal: actorIndex,
        generation: action.generation,
        token,
        atNodeMs: Number.isFinite(time) ? time : null,
        ...request,
      } as SendPulse);
    } catch {
      /* Passive only. */
    }
  };
  const terminate = (
    action: Action | null,
    code: Parameters<typeof diagnostic.note>[0] = 'ACTION_CANCEL',
  ) => {
    if (action && !action.done) {
      cold?.cancel(action.phase);
      action.done = true;
      clearTimeout(action.timer);
      action.reject();
      notify(action, 'INVALID');
      if (
        action.phase === 'registration_complete' ||
        action.phase === 'post_registration_login'
      )
        onboarding.cancel('ABORT');
      diagnostic.note(code, action.phase);
    }
  };
  const fail = (code: Parameters<typeof diagnostic.note>[0]) => {
    available = false;
    terminate(current, code);
    diagnostic.note(code, current?.phase ?? null);
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
    let callbackAt = NaN;
    try {
      if (observeSend && current?.phase === 'otp_send')
        callbackAt = performance.now();
    } catch {
      /* Unobserved. */
    }
    try {
      const value = incoming.parse(input);
      if (records.size >= 2048) {
        fail('RECORD_LIMIT');
        return;
      }
      const action =
        current && !current.done && matches(current.phase, value)
          ? current
          : null;
      records.set(value.requestId, action);
      kinds.set(
        value.requestId,
        registrationEndpoint(
          value.request.url,
          scope.appUrl,
          scope.supabaseUrl,
        ),
      );
      if (
        !action &&
        capacityActionPhases.some(
          (phase) => phase !== 'entry' && matches(phase, value),
        )
      ) {
        unexpectedNetworkFailures++;
        diagnostic.note(
          'UNARMED_ACTION',
          current?.phase ?? null,
          kinds.get(value.requestId),
        );
      }
      onboarding.request(
        value.requestId,
        value.request.url,
        value.request.method,
        typeof input === 'object' &&
          input !== null &&
          Object.hasOwn(input, 'redirectResponse'),
      );
      consolePair.request(
        value.requestId,
        value.request.url,
        value.request.method,
        generation,
      );
      if (action) {
        action.requests++;
        if (action.requests !== 1) {
          terminate(action, 'DUPLICATE_ACTION');
          return;
        }
        action.started = value.timestamp * 1000;
        cold?.request(action.phase, action.started);
        notify(
          action,
          'REQUEST',
          { requestId: value.requestId, requestAtCdpMs: action.started },
          callbackAt,
        );
      }
    } catch {
      fail('REQUEST_PARSE');
    }
  };
  const response = (input: unknown) => {
    try {
      const value = actionResponseSchema.parse(input);
      const action = records.get(value.requestId);
      onboarding.response(value.requestId, value.response.status);
      if (value.response.status >= 400) {
        unexpectedHttpErrors++;
        diagnostic.note(
          'HTTP_STATUS',
          action?.phase ?? null,
          kinds.get(value.requestId),
          value.response.status,
        );
      }
      if (action && !action.done && action.generation === generation) {
        action.status = value.response.status;
        cold?.response(action.phase, action.status);
        if (value.response.status < 200 || value.response.status >= 300)
          terminate(action, 'ACTION_RESPONSE');
      }
    } catch {
      fail('RESPONSE_PARSE');
    }
  };
  const finished = (input: unknown) => {
    try {
      const value = actionFinishedSchema.parse(input),
        action = records.get(value.requestId);
      records.delete(value.requestId);
      kinds.delete(value.requestId);
      if (action && !action.done && action.generation === generation) {
        if (
          signal.aborted ||
          disposed ||
          action.started === null ||
          action.status === null ||
          action.requests !== 1 ||
          value.timestamp * 1000 < action.started
        ) {
          terminate(action, 'ACTION_FINISH');
          return;
        }
        cold?.finished(action.phase, value.timestamp * 1000);
        action.done = true;
        clearTimeout(action.timer);
        actionsCompleted++;
        onboarding.completed(action.phase, action.generation);
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
      onboarding.finished(value.requestId);
    } catch {
      fail('FINISHED_PARSE');
    }
  };
  const failed = (input: unknown) => {
    try {
      const value = actionFailedSchema.parse(input);
      const action = records.get(value.requestId);
      const kind = kinds.get(value.requestId);
      onboarding.failed(value.requestId);
      records.delete(value.requestId);
      kinds.delete(value.requestId);
      if (action) terminate(action, 'ACTION_NETWORK_FAILURE');
      else if (value.canceled !== true) {
        unexpectedNetworkFailures++;
        diagnostic.note('NETWORK_FAILURE', null, kind);
      }
    } catch {
      fail('FAILED_PARSE');
    }
  };
  const listeners = [
    ['Network.requestWillBeSent', request],
    ['Network.responseReceived', response],
    ['Network.loadingFinished', finished],
    ['Network.loadingFailed', failed],
    ['Log.entryAdded', consolePair.log],
    [
      'Network.dataReceived',
      (value: unknown) => {
        onboarding.data(value);
      },
    ],
  ] as const;
  for (const [event, listener] of listeners) cdp.on(event, listener);
  const closed = () => {
    onboarding.cancel('ABORT');
    fail('PAGE_CLOSED');
  };
  const aborted = () => {
    onboarding.cancel('ABORT');
    fail('ABORT');
  };
  const isStopped = () => signal.aborted || disposed;
  page.on('close', closed);
  page.on('console', consolePair.console);
  signal.addEventListener('abort', aborted, { once: true });
  const dispose = async () => {
    disposed = true;
    cold?.dispose();
    available = false;
    onboarding.cancel('DISPOSE');
    consolePair.dispose();
    diagnostic.note('DISPOSE');
    terminate(current);
    for (const [event, listener] of listeners) cdp.off(event, listener);
    page.off('close', closed);
    page.off('console', consolePair.console);
    signal.removeEventListener('abort', aborted);
    records.clear();
    kinds.clear();
    try {
      if (!page.isClosed()) await cdp.detach();
    } catch {
      return capacityFailure();
    }
  };
  try {
    await cdp.send('Network.enable', { maxPostDataSize: 0 });
    if (isStopped()) return capacityFailure();
    try {
      await cdp.send('Log.enable');
      consolePair.enabled();
    } catch {
      consolePair.unavailable();
    }
    if (isStopped()) return capacityFailure();
    available = true;
  } catch {
    diagnostic.note('NETWORK_ENABLE');
    await dispose().catch(() => undefined);
    return capacityFailure();
  }
  const observer = {
    ...(coldEntry ? { coldEntry } : {}),
    arm: (phase: CapacityActionPhase) => {
      if (
        !available ||
        disposed ||
        signal.aborted ||
        (current && !current.done) ||
        generation >= 16 ||
        !capacityActionPhases.includes(phase)
      ) {
        diagnostic.note('ARM_INVALID', current?.phase ?? null);
        return capacityFailure();
      }
      generation++;
      cold?.arm(phase);
      onboarding.arm(phase, generation);
      consolePair.arm(phase, generation);
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
          terminate(action, 'ACTION_TIMEOUT');
        }, 15000),
      };
      current = action;
      tickets.set(action, Object.freeze({}));
      notify(action, 'ARM');
      return {
        finished,
        cancel: () => {
          terminate(action);
        },
      };
    },
    snapshot: () =>
      registrationSnapshot(
        {
          available: available && !disposed && !signal.aborted,
          actionsCompleted,
          unexpectedHttpErrors:
            unexpectedHttpErrors -
            (onboarding.discount() === 1 && unexpectedHttpErrors > 0 ? 1 : 0),
          unexpectedNetworkFailures,
          pendingAction: current !== null && !current.done,
        },
        () => ({ ...diagnostic.snapshot(), onboarding: onboarding.snapshot() }),
      ),
    dispose,
  };
  onboardingControllers.set(observer, {
    ...onboarding,
    isLive: () => available && !disposed && !signal.aborted,
    consoleEvidence: consolePair.evidence,
    finalizeCounter() {
      onboarding.finalize();
    },
  });
  return observer;
};
export type CapacityRequestObserver = Awaited<
  ReturnType<typeof createCapacityRequestObserver>
>;
