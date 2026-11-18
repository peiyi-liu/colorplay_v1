import {
  REALTIME_SUBSCRIBE_STATES,
  type SupabaseClient,
} from '@supabase/supabase-js';
import type { Database } from '../../src/types/database';
import type { LiveSessionState } from '../../src/features/live/types';
import { createLiveRepository } from '../../src/features/live/api/live-repository';
import { isExplicitPermissionDenial } from '../live/capacity-permission-denial';
import { capacityFailure } from './capacity-scope';
import { types } from 'node:util';
import { errors } from '@playwright/test';
import { LiveRepositoryError } from '../../src/features/live/types';
import type { CapacityLiveStage } from './capacity-live-diagnostics';
export interface LiveGateObservation {
  stage: CapacityLiveStage;
  status?: unknown;
  error?: unknown;
  refusal?: boolean;
  explicit?: boolean;
  removal?: unknown;
}
export const observeCapacityLiveGate = (
  observe: ((event: LiveGateObservation) => void) | undefined,
  event: LiveGateObservation,
): void => {
  try {
    observe?.(event);
  } catch {
    /* Passive callback cannot change the gate. */
  }
};
const knownCodes = new Set([
  'AUTH_REQUIRED',
  'NOT_FOUND',
  'STATE_CONFLICT',
  'INVALID_TRANSITION',
  'JOIN_INVALID_CODE',
  'RATE_LIMITED',
  'JOIN_RATE_LIMITED',
  'ANSWER_CLOSED',
  'ANSWER_ALREADY_SUBMITTED',
  'VALIDATION',
  'INVALID_RESPONSE',
  'UNAVAILABLE',
]);
export const classifyCapacityLiveError = (error: unknown) => {
  try {
    if (types.isProxy(error))
      return { errorClass: 'UNKNOWN' as const, errorCode: null };
    const value: unknown =
      error instanceof LiveRepositoryError
        ? Object.getOwnPropertyDescriptor(error, 'code')?.value
        : null;
    const code =
      typeof value === 'string' && knownCodes.has(value) ? value : null;
    return {
      errorClass:
        error instanceof errors.TimeoutError
          ? ('TIMEOUT_ERROR' as const)
          : error instanceof LiveRepositoryError
            ? ('LIVE_REPOSITORY_ERROR' as const)
            : error instanceof TypeError
              ? ('TYPE_ERROR' as const)
              : error instanceof RangeError
                ? ('RANGE_ERROR' as const)
                : error instanceof Error
                  ? ('ERROR' as const)
                  : ('NON_ERROR' as const),
      errorCode: code,
    };
  } catch {
    return { errorClass: 'UNKNOWN' as const, errorCode: null };
  }
};
export const assertCapacityLiveObservationData = (value: unknown) => {
  const seen = new Set<object>();
  let nodes = 0;
  const visit = (v: unknown, depth: number): void => {
    if (++nodes > 10000 || depth > 24) throw Error();
    if (v === null || typeof v !== 'object') return;
    if (types.isProxy(v) || seen.has(v)) throw Error();
    if (types.isPromise(v)) {
      void Promise.prototype.then.call(v, undefined, () => undefined);
      throw Error();
    }
    seen.add(v);
    for (const key of Reflect.ownKeys(v)) {
      if (Array.isArray(v) && key === 'length') continue;
      const d = Object.getOwnPropertyDescriptor(v, key);
      if (typeof key !== 'string' || !d || !('value' in d)) throw Error();
      visit(d.value, depth + 1);
    }
    seen.delete(v);
  };
  visit(value, 0);
};
export const createCapacityLiveGate = (
  client: SupabaseClient<Database>,
  signal: AbortSignal,
  observe?: (event: LiveGateObservation) => void,
) => {
  const repository = createLiveRepository(client),
    listeners = new Set<() => void>();
  let sequence = 0,
    closed = false,
    faulted = false;
  const notify = () => {
    if (closed) return;
    sequence++;
    for (const fn of listeners) fn();
  };
  const within = async <T>(
    action: (owned: AbortSignal) => Promise<T>,
  ): Promise<T> => {
    const timeout = new AbortController(),
      timer = setTimeout(() => {
        timeout.abort();
        observeCapacityLiveGate(observe, { stage: 'GATE_TIMEOUT' });
      }, 20000),
      combined = AbortSignal.any([signal, timeout.signal]);
    let onAbort: () => void = () => undefined;
    const expired = new Promise<never>((_resolve, reject) => {
      onAbort = () => {
        reject(new Error('CAPACITY_EVIDENCE_INVALID'));
      };
      combined.addEventListener('abort', onAbort, { once: true });
      if (combined.aborted) onAbort();
    });
    try {
      return await Promise.race([action(combined), expired]);
    } finally {
      clearTimeout(timer);
      combined.removeEventListener('abort', onAbort);
      timeout.abort();
    }
  };
  const subscribe = (sessionId: string, refusal = false) =>
    within(async (owned) => {
      if (owned.aborted || closed) return capacityFailure();
      const state = { explicit: false, joined: false };
      observeCapacityLiveGate(observe, { stage: 'SUBSCRIBE_START', refusal });
      const channel = client
        .channel(`live-session:${sessionId}`, {
          config: { private: true, broadcast: { self: true } },
        })
        .on('broadcast', { event: 'live_state' }, notify);
      const pending = new Promise<void>((resolve, reject) => {
        const done = (ok: boolean) => {
          owned.removeEventListener('abort', abort);
          if (ok) resolve();
          else reject(new Error('CAPACITY_EVIDENCE_INVALID'));
        };
        const abort = () => {
          done(false);
        };
        owned.addEventListener('abort', abort, { once: true });
        channel.subscribe((status, error) => {
          if (closed || signal.aborted) return;
          if (state.joined) {
            if (status !== REALTIME_SUBSCRIBE_STATES.SUBSCRIBED && !refusal) {
              faulted = true;
              notify();
            }
            observeCapacityLiveGate(observe, {
              stage: 'CHANNEL_STATUS',
              status,
              error,
              refusal,
              explicit: state.explicit,
            });
            return;
          }
          if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
            state.joined = true;
            done(!refusal);
          } else {
            state.explicit =
              status === REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR &&
              isExplicitPermissionDenial(error);
            done(refusal && state.explicit && !state.joined);
          }
          observeCapacityLiveGate(observe, {
            stage: 'CHANNEL_STATUS',
            status,
            error,
            refusal,
            explicit: state.explicit,
          });
        });
        if (owned.aborted) abort();
      });
      let failed = false;
      try {
        await pending;
      } catch {
        failed = true;
      }
      if (refusal) {
        const removed = await client.removeChannel(channel);
        observeCapacityLiveGate(observe, {
          stage: 'REMOVE_CHANNEL',
          removal: removed,
          refusal,
        });
        if (removed !== 'ok') return capacityFailure();
      }
      if (failed || (refusal && (!state.explicit || state.joined)))
        return capacityFailure();
    });
  return {
    notify,
    subscribe,
    wait: (
      sessionId: string,
      predicate: (state: LiveSessionState) => boolean,
    ) =>
      within(async (owned) => {
        for (;;) {
          if (owned.aborted || closed || faulted) return capacityFailure();
          observeCapacityLiveGate(observe, { stage: 'GATE_READ' });
          const observed = sequence,
            state = await repository.getState(sessionId);
          if (predicate(state)) return state;
          await new Promise<void>((resolve, reject) => {
            const finish = () => {
              listeners.delete(finish);
              owned.removeEventListener('abort', abort);
              resolve();
              observeCapacityLiveGate(observe, { stage: 'GATE_WAKE' });
            };
            const abort = () => {
              listeners.delete(finish);
              owned.removeEventListener('abort', abort);
              reject(new Error('CAPACITY_EVIDENCE_INVALID'));
            };
            listeners.add(finish);
            owned.addEventListener('abort', abort, { once: true });
            if (owned.aborted) abort();
            else if (sequence !== observed) finish();
          });
        }
      }),
    close: () => {
      closed = true;
      for (const fn of listeners) fn();
      listeners.clear();
      observeCapacityLiveGate(observe, { stage: 'GATE_CLOSE' });
    },
  };
};
