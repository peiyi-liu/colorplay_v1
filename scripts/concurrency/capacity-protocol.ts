import { sha256 } from './local-runtime';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../src/types/database';
import { createBoundedFetch } from '../../src/lib/supabase/browser-client';
import { createAuthRepository } from '../../src/features/auth/api/auth-repository';
import { createProfileRepository } from '../../src/features/profile/api/profile-repository';
import { readQueryRetryDelay } from '../../src/lib/query/read-retry';
import {
  capacityFailure,
  requireCapacityScope,
  type CapacityScope,
} from './capacity-scope';
import { capacityOperationForRequest } from './capacity-operation-observer';
import {
  operationSampleSchema,
  type OperationSample,
} from './capacity-metrics';
import type { CapacityOperation } from './capacity-manifest';
import type { CapacityPrivateActor } from './capacity-private-plan';
export interface CapacityPhysicalAttempt {
  startedAtMs: number;
  finishedAtMs: number | null;
  status: number | null;
}
export interface CapacityPhysicalObservation {
  actorIndex: number;
  ordinal: number;
  phase: 'SEND' | 'HEADERS' | 'BODY_END' | 'FAILED';
  endpoint:
    | 'PUBLISHED_CONTENT'
    | 'SUBMIT_ANSWER'
    | 'FINALIZE_QUIZ'
    | 'LEADERBOARD'
    | 'TEACHER_DASHBOARD'
    | 'PROGRESS'
    | 'ECONOMY'
    | 'OTHER';
  sentAtMs: number;
  headersAtMs: number | null;
  bodyEndAtMs: number | null;
  status: number | null;
  bytes: number | null;
}
interface ProtocolOptions {
  transport?: typeof fetch;
  now?: () => number;
  businessActive?: () => boolean;
  onLoginRequest?: (at: number) => void;
  onPhysicalObservation?: (row: Readonly<CapacityPhysicalObservation>) => void;
}
export const createCapacityProtocolActor = (
  scope: CapacityScope,
  anonKey: string,
  identity: CapacityPrivateActor,
  actorIndex: number,
  signal: AbortSignal,
  nextId: () => string,
  options: ProtocolOptions = {},
) => {
  requireCapacityScope(scope);
  if (sha256(anonKey) !== scope.anonKeySha256) return capacityFailure();
  return buildProtocolActor(
    scope.supabaseUrl,
    scope.planId,
    anonKey,
    identity,
    actorIndex,
    signal,
    nextId,
    options,
  );
};
// Root-only diagnostic configuration. This does not construct any CapacityScope.
export const createLocalDiagnosticProtocolActor = (
  anonKey: string,
  identity: CapacityPrivateActor,
  actorIndex: number,
  signal: AbortSignal,
  nextId: () => string,
  options: ProtocolOptions = {},
) => {
  if (
    !anonKey ||
    !Number.isSafeInteger(actorIndex) ||
    actorIndex < 0 ||
    actorIndex > 59 ||
    !identity.userId ||
    identity.role !== (actorIndex === 0 ? 'teacher' : 'student')
  )
    return capacityFailure();
  return buildProtocolActor(
    'http://127.0.0.1:58321',
    'local-diagnostic-none',
    anonKey,
    identity,
    actorIndex,
    signal,
    nextId,
    options,
  );
};
const buildProtocolActor = (
  supabaseUrl: CapacityScope['supabaseUrl'],
  storagePrefix: string,
  anonKey: string,
  identity: CapacityPrivateActor,
  actorIndex: number,
  signal: AbortSignal,
  nextId: () => string,
  options: ProtocolOptions,
) => {
  const now = options.now ?? (() => performance.now()),
    bounded = createBoundedFetch(options.transport ?? fetch);
  const samples: OperationSample[] = [],
    controller = new AbortController(),
    combined = AbortSignal.any([signal, controller.signal]);
  let active: {
      operation: CapacityOperation;
      attempts: CapacityPhysicalAttempt[];
    } | null = null,
    physicalRequests = 0,
    closed = false;
  const pending = new Set<Promise<Response>>();
  const physicalObservers = new Set<() => void>();
  let observationAvailable = true;
  const emit = (row: CapacityPhysicalObservation) => {
    try {
      options.onPhysicalObservation?.(Object.freeze({ ...row }));
    } catch {
      observationAvailable = false;
    }
  };
  const aborted = () => combined.aborted;
  const transport: typeof fetch = (input, init) => {
    const task = (async () => {
      if (closed || aborted()) return capacityFailure();
      const url = new URL(
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      );
      if (url.origin !== supabaseUrl || url.username || url.password)
        return capacityFailure();
      const requestAt = now();
      physicalRequests++;
      for (const observer of physicalObservers) observer();
      if (url.pathname === '/functions/v1/auth-login')
        options.onLoginRequest?.(requestAt);
      const op = capacityOperationForRequest(
        { supabaseUrl },
        url.href,
        init?.method ?? (input instanceof Request ? input.method : 'GET'),
      );
      const attempt: CapacityPhysicalAttempt = {
        startedAtMs: requestAt,
        finishedAtMs: null,
        status: null,
      };
      if (active?.operation === op) active.attempts.push(attempt);
      const row: CapacityPhysicalObservation = {
        actorIndex,
        ordinal: physicalRequests,
        phase: 'SEND',
        endpoint: op
          ? (op.toUpperCase() as CapacityPhysicalObservation['endpoint'])
          : url.pathname === '/rest/v1/review_progress'
            ? 'PROGRESS'
            : url.pathname === '/rest/v1/rpc/get_my_economy_summary'
              ? 'ECONOMY'
              : 'OTHER',
        sentAtMs: requestAt,
        headersAtMs: null,
        bodyEndAtMs: null,
        status: null,
        bytes: null,
      };
      emit(row);
      try {
        const response = await bounded(input, {
          ...init,
          redirect: 'error',
          signal: AbortSignal.any([
            combined,
            ...(init?.signal ? [init.signal] : []),
          ]),
        });
        row.phase = 'HEADERS';
        row.headersAtMs = options.onPhysicalObservation ? now() : null;
        row.status = response.status;
        emit(row);
        const bytes = await response.arrayBuffer();
        if (bytes.byteLength > 4 * 1024 * 1024) return capacityFailure();
        attempt.status = response.status;
        attempt.finishedAtMs = now();
        row.phase = 'BODY_END';
        row.bodyEndAtMs = attempt.finishedAtMs;
        row.bytes = bytes.byteLength;
        emit(row);
        return new Response(bytes, {
          status: response.status,
          headers: response.headers,
        });
      } catch {
        attempt.status = aborted() ? 504 : 503;
        attempt.finishedAtMs = now();
        row.phase = 'FAILED';
        row.bodyEndAtMs = attempt.finishedAtMs;
        row.status = attempt.status;
        emit(row);
        return Response.json(
          {
            message: aborted() ? 'CAPACITY_TIMEOUT' : 'CAPACITY_UNAVAILABLE',
          },
          { status: attempt.status },
        );
      }
    })();
    pending.add(task);
    void task.finally(() => pending.delete(task)).catch(() => undefined);
    return task;
  };
  const client = createClient<Database>(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
      storageKey: `${storagePrefix}-${identity.alias}-${randomUUID()}`,
    },
    global: { fetch: transport },
  });
  return {
    client,
    identity,
    actorIndex,
    login: async () => {
      if (closed || aborted()) return capacityFailure();
      if (identity.role === 'admin') return capacityFailure();
      await createAuthRepository(client).signInWithAccount({
        account: identity.account,
        password: identity.password,
        portal: identity.role,
      });
      const result = await client.auth.getUser(),
        profile = await createProfileRepository(client).getMyProfile();
      const account = await client
        .from('profiles')
        .select('id, login_account, role')
        .eq('id', identity.userId ?? '')
        .retry(false)
        .single();
      if (
        result.error ||
        result.data.user.id !== identity.userId ||
        profile.id !== identity.userId ||
        account.error ||
        account.data.login_account !== identity.account ||
        profile.role !== identity.role
      )
        return capacityFailure();
    },
    measure: async <T>(
      operation: CapacityOperation,
      cache: OperationSample['cache'],
      action: () => Promise<T>,
      readRetry = false,
      replayOf: string | null = null,
    ): Promise<T> => {
      if (closed || aborted() || active) return capacityFailure();
      const window = { operation, attempts: [] as CapacityPhysicalAttempt[] };
      active = window;
      const during = options.businessActive?.() ?? false;
      let outcome: 'success' | 'error' = 'success';
      try {
        for (let i = 0; ; i++) {
          try {
            return await action();
          } catch {
            const status = window.attempts.at(-1)?.status;
            if (
              !readRetry ||
              i >= 2 ||
              status === null ||
              status === undefined ||
              ![0, 500, 502, 503, 504].includes(status) ||
              aborted()
            )
              return capacityFailure();
            await new Promise<void>((resolve, reject) => {
              const finish = () => {
                clearTimeout(timer);
                combined.removeEventListener('abort', abort);
                resolve();
              };
              const abort = () => {
                clearTimeout(timer);
                combined.removeEventListener('abort', abort);
                reject(new Error('CAPACITY_EVIDENCE_INVALID'));
              };
              const timer = setTimeout(finish, readQueryRetryDelay(i));
              combined.addEventListener('abort', abort, { once: true });
              if (aborted()) abort();
            });
          }
        }
      } catch {
        outcome = 'error';
        return capacityFailure();
      } finally {
        const a = window.attempts,
          first = a[0],
          last = a.at(-1),
          success =
            outcome === 'success' &&
            last?.status !== undefined &&
            last.status !== null &&
            last.status >= 200 &&
            last.status < 300 &&
            !aborted();
        samples.push(
          operationSampleSchema.parse({
            id: nextId(),
            actorIndex,
            operation,
            startedAtMs: first?.startedAtMs ?? 0,
            finishedAtMs: last?.finishedAtMs ?? first?.startedAtMs ?? 0,
            status: success ? 'success' : aborted() ? 'timeout' : 'error',
            reason: success
              ? null
              : last?.status === 401
                ? 'auth'
                : last?.status === 403
                  ? 'permission'
                  : last?.status === 429
                    ? 'rate_limited'
                    : 'unavailable',
            attempts: a.map((v) => ({
              startedAtMs: v.startedAtMs,
              finishedAtMs: v.finishedAtMs,
            })),
            cache: a.length ? cache : 'unavailable',
            replayOf,
            duringStudentBusinessLoad:
              during && (options.businessActive?.() ?? false),
          }),
        );
        active = null;
      }
    },
    samples: () => samples.map((s) => structuredClone(s)),
    requestCount: () => physicalRequests,
    physicalObservationAvailable: () => observationAvailable,
    observePhysical: (listener: () => void) => {
      physicalObservers.add(listener);
      return () => {
        physicalObservers.delete(listener);
      };
    },
    close: async () => {
      closed = true;
      physicalObservers.clear();
      controller.abort();
      await client.auth.stopAutoRefresh();
      const results = await client.removeAllChannels();
      await client.realtime.disconnect();
      await Promise.allSettled([...pending]);
      if (results.some((v) => v !== 'ok')) return capacityFailure();
    },
  };
};
export type CapacityProtocolActor = ReturnType<
  typeof createCapacityProtocolActor
>;
export const capacityTransportAccounting = (
  clients: readonly CapacityProtocolActor[],
  observers: readonly {
    snapshot: () => {
      physicalRequests: number;
      unattributedRequests: number;
    };
  }[],
) => ({
  nodeAllPhysicalRequests: clients.reduce(
    (sum, client) => sum + client.requestCount(),
    0,
  ),
  nodeOperationPhysicalAttempts: clients
    .flatMap((client) => client.samples())
    .reduce((sum, row) => sum + row.attempts.length, 0),
  nativeFiveOperationPhysicalRequests: observers.reduce(
    (sum, observer) => sum + observer.snapshot().physicalRequests,
    0,
  ),
  nativeUnattributedFiveOperationPhysicalRequests: observers.reduce(
    (sum, observer) => sum + observer.snapshot().unattributedRequests,
    0,
  ),
});
