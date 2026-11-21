import { z } from 'zod';

import { LiveRepositoryError } from '../../src/features/live/types';
import { isPermissionDenialMessage } from './capacity-permission-denial';

export const outsiderReasonSchema = z.enum([
  'auth',
  'permission',
  'rate_limit',
  'connection_limit',
  'join_limit',
  'transport',
  'timeout',
  'unknown',
]);
export const repositoryCodeSchema = z.enum([
  'AUTH_REQUIRED',
  'NOT_FOUND',
  'STATE_CONFLICT',
  'INVALID_TRANSITION',
  'JOIN_INVALID_CODE',
  'JOIN_RATE_LIMITED',
  'ANSWER_CLOSED',
  'ANSWER_ALREADY_SUBMITTED',
  'VALIDATION',
  'INVALID_RESPONSE',
  'UNAVAILABLE',
  'unknown',
]);
const outcome = z.enum([
  'not_run',
  'pending',
  'denied',
  'unexpected_success',
  'error',
  'unknown',
]);
const rpcSchema = z.object({
  outcome,
  repositoryCode: repositoryCodeSchema.nullable(),
  reason: outsiderReasonSchema.nullable(),
  elapsedMs: z.number().nonnegative().nullable(),
});
const callbackSchema = z.object({
  status: z.enum([
    'SUBSCRIBED',
    'CHANNEL_ERROR',
    'TIMED_OUT',
    'CLOSED',
    'unknown',
  ]),
  explicitPermission: z.boolean(),
  reason: outsiderReasonSchema,
});
export const outsiderDiagnosticsSchema = z.object({
  joinRpc: rpcSchema,
  getStateRpc: rpcSchema,
  privateSubscription: z.object({
    outcome: z.enum([
      'not_run',
      'pending',
      'denied',
      'unexpected_success',
      'error',
      'unknown',
      'timeout',
    ]),
    events: z.array(callbackSchema).max(16),
    eventsTruncated: z.boolean(),
    firstFailure: callbackSchema.nullable(),
    reason: outsiderReasonSchema.nullable(),
    elapsedMs: z.number().nonnegative().nullable(),
  }),
  channelRemoval: z.object({
    outcome: z.enum([
      'not_run',
      'pending',
      'ok',
      'timed_out',
      'error',
      'rejected',
    ]),
    reason: outsiderReasonSchema.nullable(),
    elapsedMs: z.number().nonnegative().nullable(),
  }),
  failureStep: z
    .enum(['join_rpc', 'get_state_rpc', 'private_subscribe', 'remove_channel'])
    .nullable(),
  failureCode: z
    .enum([
      'RPC_UNPROVEN',
      'OUTSIDER_SUBSCRIBED',
      'PRIVATE_SUBSCRIPTION_FAILED',
      'CHANNEL_CLEANUP_FAILED',
      'CHANNEL_REMOVAL_REJECTED',
    ])
    .nullable(),
});
export type OutsiderDiagnostics = z.infer<typeof outsiderDiagnosticsSchema>;
export type OutsiderReason = z.infer<typeof outsiderReasonSchema>;
export type OutsiderRpcStep = 'join_rpc' | 'get_state_rpc';
export const emptyOutsiderDiagnostics = (): OutsiderDiagnostics => ({
  joinRpc: {
    outcome: 'not_run',
    repositoryCode: null,
    reason: null,
    elapsedMs: null,
  },
  getStateRpc: {
    outcome: 'not_run',
    repositoryCode: null,
    reason: null,
    elapsedMs: null,
  },
  privateSubscription: {
    outcome: 'not_run',
    events: [],
    eventsTruncated: false,
    firstFailure: null,
    reason: null,
    elapsedMs: null,
  },
  channelRemoval: { outcome: 'not_run', reason: null, elapsedMs: null },
  failureStep: null,
  failureCode: null,
});
const own = (value: unknown, key: string): unknown => {
  if (
    (typeof value !== 'object' && typeof value !== 'function') ||
    value === null
  )
    return undefined;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && 'value' in descriptor ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
};
const codeReasons: Readonly<Record<string, OutsiderReason>> = {
  AUTH_REQUIRED: 'auth',
  JOIN_INVALID_CODE: 'permission',
  NOT_FOUND: 'permission',
  JOIN_RATE_LIMITED: 'rate_limit',
  ECONNRESET: 'transport',
  ECONNREFUSED: 'transport',
  ENETUNREACH: 'transport',
  ETIMEDOUT: 'timeout',
  UND_ERR_CONNECT_TIMEOUT: 'timeout',
  CAPACITY_STAGE_TIMEOUT: 'timeout',
};
const messageReason = (value: unknown): OutsiderReason => {
  if (isPermissionDenialMessage(value)) return 'permission';
  if (typeof value !== 'string' || value.length > 512) return 'unknown';
  switch (value.toLowerCase()) {
    case 'auth':
    case 'jwt expired':
    case 'token has expired':
    case 'invalid token':
      return 'auth';
    case 'permission':
    case 'unauthorized':
    case 'forbidden':
      return 'permission';
    case 'rate_limit':
    case 'too many requests':
      return 'rate_limit';
    case 'connection_limit':
    case 'too_many_connections':
      return 'connection_limit';
    case 'join_limit':
    case 'too_many_joins':
      return 'join_limit';
    case 'transport':
    case 'network error':
    case 'fetch failed':
      return 'transport';
    case 'timeout':
    case 'timed out':
      return 'timeout';
    default:
      return 'unknown';
  }
};
const safeRepositoryCode = (
  error: unknown,
): z.infer<typeof repositoryCodeSchema> => {
  try {
    if (!(error instanceof LiveRepositoryError)) return 'unknown';
    const parsed = repositoryCodeSchema.safeParse(own(error, 'code'));
    return parsed.success ? parsed.data : 'unknown';
  } catch {
    return 'unknown';
  }
};
export const classifyOutsiderReason = (
  error: unknown,
  status?: unknown,
): OutsiderReason => {
  if (status === 'TIMED_OUT') return 'timeout';
  if (status === 'CLOSED') return 'transport';
  const seen = new Set<unknown>();
  let current = error;
  let reason: OutsiderReason = 'unknown';
  for (let depth = 0; current !== undefined && depth < 3; depth += 1) {
    if (seen.has(current)) return 'unknown';
    seen.add(current);
    const code = own(current, 'code');
    if (code !== undefined) {
      if (
        typeof code !== 'string' ||
        (!Object.hasOwn(codeReasons, code) &&
          !repositoryCodeSchema.safeParse(code).success)
      )
        return 'unknown';
      if (typeof codeReasons[code] === 'string') reason = codeReasons[code];
    }
    const publicCode = own(current, 'publicCode');
    if (publicCode === 'CAPACITY_STAGE_TIMEOUT') reason = 'timeout';
    for (const value of [
      current,
      own(current, 'message'),
      own(current, 'reason'),
    ]) {
      const classified = messageReason(value);
      if (classified !== 'unknown' && reason === 'unknown') reason = classified;
    }
    current = own(current, 'cause');
  }
  return current === undefined ? reason : 'unknown';
};

export const createOutsiderDiagnostics = (
  now: () => number = () => performance.now(),
) => {
  let generation = 0;
  let state = emptyOutsiderDiagnostics();
  return {
    snapshot: (): OutsiderDiagnostics => outsiderDiagnosticsSchema.parse(state),
    begin: () => {
      generation += 1;
      state = emptyOutsiderDiagnostics();
      const currentGeneration = generation;
      const active = () => currentGeneration === generation;
      const starts = new Map<string, number>();
      let subscriptionTimingRecorded = false;
      const elapsed = (step: string): number | null => {
        const start = starts.get(step);
        if (start === undefined) return null;
        const duration = now() - start;
        return Number.isFinite(duration) ? Math.max(0, duration) : null;
      };
      const rpc = (step: OutsiderRpcStep) =>
        step === 'join_rpc' ? state.joinRpc : state.getStateRpc;
      return {
        rpcStarted: (step: OutsiderRpcStep) => {
          if (!active()) return;
          starts.set(step, now());
          rpc(step).outcome = 'pending';
        },
        rpcSucceeded: (step: OutsiderRpcStep) => {
          if (!active()) return;
          Object.assign(rpc(step), {
            outcome: 'unexpected_success',
            elapsedMs: elapsed(step),
          });
        },
        rpcFailed: (step: OutsiderRpcStep, error: unknown, denied: boolean) => {
          if (!active()) return;
          const repositoryCode = safeRepositoryCode(error);
          const reason = classifyOutsiderReason(error);
          Object.assign(rpc(step), {
            outcome: denied
              ? 'denied'
              : repositoryCode === 'unknown' && reason === 'unknown'
                ? 'unknown'
                : 'error',
            repositoryCode,
            reason,
            elapsedMs: elapsed(step),
          });
        },
        subscriptionStarted: () => {
          if (!active()) return;
          starts.set('private_subscribe', now());
          state.privateSubscription.outcome = 'pending';
        },
        callback: (
          status: unknown,
          error: unknown,
          explicitPermission: boolean,
        ) => {
          if (!active()) return;
          const parsed = callbackSchema.shape.status.safeParse(status);
          const event = {
            status: parsed.success ? parsed.data : ('unknown' as const),
            explicitPermission,
            reason: classifyOutsiderReason(error, status),
          };
          if (state.privateSubscription.events.length < 16)
            state.privateSubscription.events.push(event);
          else state.privateSubscription.eventsTruncated = true;
          if (
            event.status !== 'SUBSCRIBED' &&
            state.privateSubscription.firstFailure === null
          )
            state.privateSubscription.firstFailure = event;
        },
        subscriptionFinished: (
          outcome: OutsiderDiagnostics['privateSubscription']['outcome'],
          error?: unknown,
        ) => {
          if (!active()) return;
          const reason =
            state.privateSubscription.firstFailure?.reason ??
            classifyOutsiderReason(error);
          state.privateSubscription.outcome =
            outcome === 'error' && reason === 'timeout' ? 'timeout' : outcome;
          state.privateSubscription.reason =
            outcome === 'unexpected_success' ? null : reason;
          if (
            outcome !== 'not_run' &&
            outcome !== 'pending' &&
            !subscriptionTimingRecorded
          ) {
            subscriptionTimingRecorded = true;
            state.privateSubscription.elapsedMs = elapsed('private_subscribe');
          }
        },
        removalStarted: () => {
          if (!active()) return;
          starts.set('remove_channel', now());
          state.channelRemoval.outcome = 'pending';
        },
        removalFinished: (result: unknown) => {
          if (!active()) return;
          state.channelRemoval = {
            outcome:
              result === 'ok'
                ? 'ok'
                : result === 'timed out'
                  ? 'timed_out'
                  : 'error',
            reason:
              result === 'ok'
                ? null
                : result === 'timed out'
                  ? 'timeout'
                  : 'unknown',
            elapsedMs: elapsed('remove_channel'),
          };
        },
        removalRejected: (error: unknown) => {
          if (!active()) return;
          state.channelRemoval = {
            outcome: 'rejected',
            reason: classifyOutsiderReason(error),
            elapsedMs: elapsed('remove_channel'),
          };
        },
        fail: (
          step: NonNullable<OutsiderDiagnostics['failureStep']>,
          code: NonNullable<OutsiderDiagnostics['failureCode']>,
        ) => {
          if (!active()) return;
          state.failureStep = step;
          state.failureCode = code;
        },
      };
    },
  };
};
export type OutsiderAttempt = ReturnType<
  ReturnType<typeof createOutsiderDiagnostics>['begin']
>;
