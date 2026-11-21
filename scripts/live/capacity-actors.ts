import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';

import {
  REALTIME_SUBSCRIBE_STATES,
  type SupabaseClient,
} from '@supabase/supabase-js';

import type { Database } from '../../src/types/database';
import { createClassroomRepository } from '../../src/features/classrooms/api/classroom-repository';
import { createAuthRepository } from '../../src/features/auth/api/auth-repository';
import { createLiveRepository } from '../../src/features/live/api/live-repository';
import {
  LiveRepositoryError,
  type LiveSessionState,
} from '../../src/features/live/types';
import type {
  CapacityCredentials,
  SessionTokens,
} from '../../tests/e2e/helpers/staging-capacity';
import { runWithCapacityTimeout } from '../../tests/e2e/helpers/staging-capacity-stage-runner';
import {
  failCapacity,
  requireLocalExecution,
  type CapacityConfig,
} from './capacity-config';
import {
  createLocalClient,
  type CapacitySecrets,
} from './capacity-local-client';
import type { ActorEvidence, ActorStage } from './capacity-receipt';
import {
  createOutsiderDiagnostics,
  type OutsiderAttempt,
  type OutsiderDiagnostics,
} from './capacity-outsider-diagnostics';
import { isExplicitPermissionDenial } from './capacity-permission-denial';

export { isExplicitPermissionDenial } from './capacity-permission-denial';

export interface ActorIdentity {
  userId: string;
  accessToken: string;
}
export const assertIndependentActorIdentities = (
  identities: readonly ActorIdentity[],
) => {
  if (
    identities.some((identity) => !identity.userId || !identity.accessToken) ||
    new Set(identities.map(({ userId }) => userId)).size !==
      identities.length ||
    new Set(identities.map(({ accessToken }) => accessToken)).size !==
      identities.length
  )
    return failCapacity('LIVE_CAPACITY_IDENTITY_COLLISION');
};
export interface LiveActor {
  client: SupabaseClient<Database>;
  evidence: ActorEvidence;
  login: () => Promise<void>;
  identity: () => Promise<ActorIdentity>;
  joinClassroom: (code: string) => Promise<void>;
  joinLive: (code: string) => Promise<string>;
  subscribe: (sessionId: string) => Promise<void>;
  getState: (sessionId: string) => Promise<LiveSessionState>;
  waitForState: (
    sessionId: string,
    predicate: (state: LiveSessionState) => boolean,
  ) => Promise<LiveSessionState>;
  submitAnswer: (state: LiveSessionState) => Promise<void>;
  openRound: (sessionId: string, first: boolean) => Promise<void>;
  proveOutsiderRefusal: (sessionId: string, code: string) => Promise<void>;
  getOutsiderDiagnostics: () => OutsiderDiagnostics;
  close: () => Promise<void>;
  assertBrowserHealth?: () => Promise<void>;
}

export type LiveClientFactory = (
  signal: AbortSignal,
  onRequest: () => void,
) => SupabaseClient<Database>;

export const createSdkLiveActor = (
  config: CapacityConfig,
  secrets: CapacitySecrets,
  credentials: CapacityCredentials,
  runSignal: AbortSignal,
  evidence: ActorEvidence,
  clientFactory?: LiveClientFactory,
) => {
  requireLocalExecution(config);
  const controller = new AbortController();
  const signal = AbortSignal.any([runSignal, controller.signal]);
  evidence.requests = 0;
  evidence.broadcasts = 0;
  const onRequest = () => {
    if (typeof evidence.requests === 'number') evidence.requests += 1;
  };
  const client = clientFactory
    ? clientFactory(signal, onRequest)
    : createLocalClient(config, secrets.anonKey, signal, onRequest);
  const repository = createLiveRepository(client);
  const outsiderDiagnostics = createOutsiderDiagnostics();
  let closed = false;
  let sequence = 0;
  const waiters = new Set<() => void>();
  const measure = async <T>(
    stage: ActorStage,
    operation: () => Promise<T>,
  ): Promise<T> => {
    signal.throwIfAborted();
    const started = performance.now();
    try {
      const value = await operation();
      evidence.timings.push({
        stage,
        elapsedMs: Math.max(0, performance.now() - started),
        sample: evidence.timings.some((entry) => entry.stage === stage)
          ? 'subsequent'
          : 'first',
      });
      return value;
    } catch (error) {
      evidence.status = 'failed';
      throw error;
    }
  };
  const broadcast = () => {
    sequence += 1;
    if (typeof evidence.broadcasts === 'number') evidence.broadcasts += 1;
    for (const waiter of waiters) waiter();
  };
  const nextBroadcast = (observed: number): Promise<void> =>
    new Promise((resolve, reject) => {
      if (sequence !== observed) {
        resolve();
        return;
      }
      const finish = () => {
        waiters.delete(finish);
        signal.removeEventListener('abort', abort);
        resolve();
      };
      const abort = () => {
        waiters.delete(finish);
        signal.removeEventListener('abort', abort);
        reject(new Error('LIVE_CAPACITY_ABORTED'));
      };
      if (signal.aborted) {
        abort();
        return;
      }
      waiters.add(finish);
      signal.addEventListener('abort', abort, { once: true });
    });
  const subscribe = async (
    sessionId: string,
    expectRefusal = false,
    diagnostic?: OutsiderAttempt,
  ): Promise<void> => {
    diagnostic?.subscriptionStarted();
    signal.throwIfAborted();
    const channel = client
      .channel(`live-session:${sessionId}`, {
        config: { broadcast: { self: true }, private: true },
      })
      .on('broadcast', { event: 'live_state' }, broadcast);
    const subscription = { joined: false, refusal: false };
    let subscriptionFinished = false;

    const pending = new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        reject(new Error('LIVE_CAPACITY_ABORTED'));
      };
      signal.addEventListener('abort', onAbort, { once: true });
      channel.subscribe((status, error) => {
        if (closed || subscriptionFinished) return;
        if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
          diagnostic?.callback(status, error, false);
          subscription.joined = true;
          signal.removeEventListener('abort', onAbort);
          resolve();
          return;
        }
        subscription.refusal =
          status === REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR &&
          isExplicitPermissionDenial(error);
        diagnostic?.callback(status, error, subscription.refusal);
        signal.removeEventListener('abort', onAbort);
        if (subscription.joined) controller.abort();
        reject(new Error('LIVE_CAPACITY_SUBSCRIPTION_FAILED'));
      });
    });
    try {
      await runWithCapacityTimeout(() => pending, 20_000);
      if (expectRefusal)
        return failCapacity('LIVE_CAPACITY_OUTSIDER_SUBSCRIBED');
    } catch (error) {
      subscriptionFinished = true;
      diagnostic?.subscriptionFinished(
        subscription.joined ? 'unexpected_success' : 'error',
        error,
      );
      diagnostic?.removalStarted();
      let removed;
      try {
        removed = await client.removeChannel(channel);
        diagnostic?.removalFinished(removed);
      } catch (removalError) {
        diagnostic?.removalRejected(removalError);
        diagnostic?.fail('remove_channel', 'CHANNEL_REMOVAL_REJECTED');
        throw removalError;
      }
      if (removed !== 'ok') {
        diagnostic?.fail('remove_channel', 'CHANNEL_CLEANUP_FAILED');
        return failCapacity('LIVE_CAPACITY_CHANNEL_CLEANUP_FAILED');
      }
      if (expectRefusal && subscription.refusal && !subscription.joined) {
        diagnostic?.subscriptionFinished('denied');
        return;
      }
      diagnostic?.fail(
        'private_subscribe',
        subscription.joined
          ? 'OUTSIDER_SUBSCRIBED'
          : 'PRIVATE_SUBSCRIPTION_FAILED',
      );
      return failCapacity('LIVE_CAPACITY_PRIVATE_SUBSCRIPTION_FAILED');
    }
  };

  const actor: LiveActor = {
    client,
    evidence,
    login: () =>
      measure('login', async () => {
        await createAuthRepository(client).signInWithAccount({
          account: credentials.account,
          password: credentials.password,
          portal: credentials.role,
        });
      }),
    identity: async () => {
      const { data, error } = await client.auth.getUser();
      const { data: session, error: sessionError } =
        await client.auth.getSession();
      if (error || sessionError)
        return failCapacity('LIVE_CAPACITY_IDENTITY_INVALID');
      if (!session.session)
        return failCapacity('LIVE_CAPACITY_IDENTITY_INVALID');
      if (data.user.id !== session.session.user.id)
        return failCapacity('LIVE_CAPACITY_IDENTITY_INVALID');
      return {
        userId: data.user.id,
        accessToken: session.session.access_token,
      };
    },
    joinClassroom: (code) =>
      measure('classroom_join', async () => {
        await createClassroomRepository(client).joinClassroom({
          joinCode: code,
          requestId: randomUUID(),
        });
      }),
    joinLive: (code) =>
      measure(
        'live_join',
        async () =>
          (await repository.join({ joinCode: code, requestId: randomUUID() }))
            .sessionId,
      ),
    subscribe: (sessionId) =>
      measure('subscribe', async () => {
        await subscribe(sessionId);
        evidence.status = 'connected';
      }),
    getState: (sessionId) =>
      measure('snapshot', () => repository.getState(sessionId)),
    waitForState: async (sessionId, predicate) =>
      runWithCapacityTimeout(async () => {
        for (;;) {
          signal.throwIfAborted();
          const observed = sequence;
          const state = await actor.getState(sessionId);
          if (predicate(state)) return state;
          await nextBroadcast(observed);
        }
      }, 20_000),
    submitAnswer: (state) =>
      measure('answer', async () => {
        const question = state.question;
        const option =
          question?.publicOptions[
            (evidence.index - 1) % (question.publicOptions.length || 1)
          ];
        if (!question || !option || state.state !== 'question_open')
          return failCapacity('LIVE_CAPACITY_ANSWER_UNAVAILABLE');
        await repository.submitAnswer({
          sessionQuestionId: question.questionId,
          selectedOptionId: option.id,
          idempotencyKey: randomUUID(),
        });
      }),
    openRound: async (sessionId, first) => {
      const state = await actor.getState(sessionId);
      if (first) await repository.openQuestion(sessionId, state.stateVersion);
      else await repository.advance(sessionId, state.stateVersion);
    },
    getOutsiderDiagnostics: outsiderDiagnostics.snapshot,
    proveOutsiderRefusal: async (sessionId, code) => {
      const diagnostic = outsiderDiagnostics.begin();
      let joinDenied = false;
      let stateDenied = false;
      diagnostic.rpcStarted('join_rpc');
      try {
        await repository.join({ joinCode: code, requestId: randomUUID() });
        diagnostic.rpcSucceeded('join_rpc');
      } catch (error) {
        joinDenied =
          error instanceof LiveRepositoryError &&
          error.code === 'JOIN_INVALID_CODE';
        diagnostic.rpcFailed('join_rpc', error, joinDenied);
      }
      diagnostic.rpcStarted('get_state_rpc');
      try {
        await repository.getState(sessionId);
        diagnostic.rpcSucceeded('get_state_rpc');
      } catch (error) {
        stateDenied =
          error instanceof LiveRepositoryError && error.code === 'NOT_FOUND';
        diagnostic.rpcFailed('get_state_rpc', error, stateDenied);
      }
      if (!joinDenied || !stateDenied) {
        diagnostic.fail(
          !stateDenied ? 'get_state_rpc' : 'join_rpc',
          'RPC_UNPROVEN',
        );
        return failCapacity('LIVE_CAPACITY_OUTSIDER_RPC_UNPROVEN');
      }
      try {
        await subscribe(sessionId, true, diagnostic);
      } catch (error) {
        if (outsiderDiagnostics.snapshot().failureStep === null) {
          diagnostic.subscriptionFinished('error', error);
          diagnostic.fail('private_subscribe', 'PRIVATE_SUBSCRIPTION_FAILED');
        }
        throw error;
      }
    },
    close: async () => {
      closed = true;
      controller.abort();
      try {
        const removed = await client.removeAllChannels();
        if (removed.some((result) => result !== 'ok'))
          return failCapacity('LIVE_CAPACITY_CHANNEL_CLEANUP_FAILED');
      } finally {
        await client.realtime.disconnect();
      }
    },
  };
  return {
    actor,
    measure,
    broadcast,
    restoreSession: async (tokens: SessionTokens) => {
      const { error } = await client.auth.setSession(tokens);
      if (error) return failCapacity('LIVE_CAPACITY_BROWSER_SESSION_INVALID');
    },
  };
};
