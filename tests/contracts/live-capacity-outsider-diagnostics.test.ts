import { REALTIME_SUBSCRIBE_STATES } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import { LiveRepositoryError } from '../../src/features/live/types';
import {
  classifyOutsiderReason,
  createOutsiderDiagnostics,
} from '../../scripts/live/capacity-outsider-diagnostics';
import {
  createSdkLiveActor,
  isExplicitPermissionDenial,
} from '../../scripts/live/capacity-actors';
import {
  createCapacityReceipt,
  sanitizeCapacityReceipt,
} from '../../scripts/live/capacity-receipt';
import { parseCapacityConfig } from '../../scripts/live/capacity-config';

const mocks = vi.hoisted(() => ({ client: vi.fn(), repository: vi.fn() }));
vi.mock('../../scripts/live/capacity-local-client', () => ({
  createLocalClient: mocks.client,
}));
vi.mock('../../src/features/live/api/live-repository', () => ({
  createLiveRepository: mocks.repository,
}));

const SECRET = 'SECRET_JWT_EMAIL_PAYLOAD_MARKER';
const UUID = '12345678-1234-4234-8234-123456789abc';
const topic = `live-session:${UUID}`;

describe('safe segmented outsider diagnostics', () => {
  it('starts not_run/null and separates denied RPCs, unexpected success and unknown errors', () => {
    let clock = 10;
    const diagnostics = createOutsiderDiagnostics(() => clock);
    expect(diagnostics.snapshot().privateSubscription).toMatchObject({
      outcome: 'not_run',
      events: [],
      elapsedMs: null,
    });
    const attempt = diagnostics.begin();
    attempt.rpcStarted('join_rpc');
    clock = 25;
    attempt.rpcFailed(
      'join_rpc',
      new LiveRepositoryError('JOIN_INVALID_CODE'),
      true,
    );
    attempt.rpcStarted('get_state_rpc');
    attempt.rpcSucceeded('get_state_rpc');
    expect(diagnostics.snapshot()).toMatchObject({
      joinRpc: {
        outcome: 'denied',
        repositoryCode: 'JOIN_INVALID_CODE',
        reason: 'permission',
        elapsedMs: 15,
      },
      getStateRpc: { outcome: 'unexpected_success', repositoryCode: null },
      privateSubscription: { outcome: 'not_run' },
    });
    const next = diagnostics.begin();
    next.rpcStarted('join_rpc');
    next.rpcFailed('join_rpc', new Error(SECRET), false);
    expect(diagnostics.snapshot().joinRpc).toMatchObject({
      outcome: 'unknown',
      repositoryCode: 'unknown',
      reason: 'unknown',
    });
  });

  it.each([
    [new LiveRepositoryError('AUTH_REQUIRED'), 'auth'],
    [new Error('Unauthorized'), 'permission'],
    [new Error('timeout'), 'timeout'],
    [new Error('fetch failed'), 'transport'],
    [new Error('Too many requests'), 'rate_limit'],
    [new Error(SECRET), 'unknown'],
  ])('classifies only safe error categories %#', (error, reason) => {
    expect(classifyOutsiderReason(error)).toBe(reason);
  });

  it('reads only bounded known cause fields without changing the existing permission predicate', () => {
    const wrapped = new Error('SDK wrapper text', {
      cause: { reason: 'Unauthorized', token: SECRET, topic },
    });
    expect(classifyOutsiderReason(wrapped)).toBe('permission');
    expect(isExplicitPermissionDenial(wrapped)).toBe(false);
    const cyclic = new Error(SECRET);
    Object.defineProperty(cyclic, 'cause', { value: cyclic });
    expect(classifyOutsiderReason(cyclic)).toBe('unknown');
    const malicious = new LiveRepositoryError('NOT_FOUND');
    Object.defineProperty(malicious, 'code', { value: SECRET });
    expect(classifyOutsiderReason(malicious)).toBe('unknown');
    const getter = Object.defineProperty({}, 'message', {
      get: () => {
        throw new Error(SECRET);
      },
    });
    expect(classifyOutsiderReason(getter)).toBe('unknown');
  });

  it('preserves the first failure when CLOSED follows CHANNEL_ERROR and bounds event history', () => {
    const diagnostics = createOutsiderDiagnostics();
    const attempt = diagnostics.begin();
    attempt.subscriptionStarted();
    attempt.callback('CHANNEL_ERROR', new Error('Unauthorized'), true);
    for (let index = 0; index < 100; index += 1)
      attempt.callback('CLOSED', new Error(SECRET), false);
    attempt.subscriptionFinished('error');
    expect(diagnostics.snapshot().privateSubscription).toMatchObject({
      firstFailure: {
        status: 'CHANNEL_ERROR',
        explicitPermission: true,
        reason: 'permission',
      },
      eventsTruncated: true,
      reason: 'permission',
    });
    expect(diagnostics.snapshot().privateSubscription.events).toHaveLength(16);
    expect(classifyOutsiderReason(undefined, 'TIMED_OUT')).toBe('timeout');
  });

  it('does not let stale callbacks or removals alter a newer generation', () => {
    const diagnostics = createOutsiderDiagnostics();
    const old = diagnostics.begin();
    old.subscriptionStarted();
    const current = diagnostics.begin();
    current.rpcStarted('join_rpc');
    current.rpcFailed(
      'join_rpc',
      new LiveRepositoryError('JOIN_INVALID_CODE'),
      true,
    );
    const before = diagnostics.snapshot();
    old.callback('CHANNEL_ERROR', new Error('Forbidden'), true);
    old.removalRejected(new Error(SECRET));
    old.fail('remove_channel', 'CHANNEL_REMOVAL_REJECTED');
    expect(diagnostics.snapshot()).toEqual(before);
  });

  it.each([
    ['ok', 'ok'],
    ['timed out', 'timed_out'],
    ['error', 'error'],
    [SECRET, 'error'],
  ])('allowlists removeChannel resolution %s', (raw, outcome) => {
    const diagnostics = createOutsiderDiagnostics();
    const attempt = diagnostics.begin();
    attempt.removalStarted();
    attempt.removalFinished(raw);
    expect(diagnostics.snapshot().channelRemoval.outcome).toBe(outcome);
    expect(JSON.stringify(diagnostics.snapshot())).not.toContain(SECRET);
  });

  it('serializes only sanitized diagnostics and keeps old receipts compatible', () => {
    const config = parseCapacityConfig(['--revision', 'a'.repeat(40)], {});
    const old = createCapacityReceipt(config, 'a'.repeat(40));
    delete old.outsiderDiagnostics;
    expect(sanitizeCapacityReceipt(old).result).toBe('NOT_RUN');
    const diagnostics = createOutsiderDiagnostics();
    const attempt = diagnostics.begin();
    attempt.rpcStarted('join_rpc');
    attempt.rpcFailed(
      'join_rpc',
      new Error(SECRET, { cause: { topic, sessionId: UUID, payload: SECRET } }),
      false,
    );
    attempt.removalStarted();
    attempt.removalRejected(new Error(SECRET));
    attempt.fail('remove_channel', 'CHANNEL_REMOVAL_REJECTED');
    const receipt = sanitizeCapacityReceipt({
      ...old,
      result: 'FAIL',
      outsider: 'failed',
      outsiderDiagnostics: {
        ...diagnostics.snapshot(),
        message: SECRET,
        topic,
        sessionId: UUID,
      },
    });
    expect(receipt.outsiderDiagnostics?.failureStep).toBe('remove_channel');
    for (const marker of [SECRET, topic, UUID])
      expect(JSON.stringify(receipt)).not.toContain(marker);
    expect(() =>
      sanitizeCapacityReceipt({ ...receipt, result: 'PASS' }),
    ).toThrow();
  });
});

type SubscribeCallback = (
  status: REALTIME_SUBSCRIBE_STATES,
  error?: Error,
) => void;
interface FakeChannel {
  on: () => FakeChannel;
  subscribe: (callback: SubscribeCallback) => FakeChannel;
}
const createProbe = (
  events: { status: REALTIME_SUBSCRIBE_STATES; error?: Error }[] = [
    {
      status: REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR,
      error: new Error('Unauthorized'),
    },
  ],
) => {
  const config = parseCapacityConfig(['--revision', 'a'.repeat(40)], {});
  const source = createCapacityReceipt(config, 'a'.repeat(40)).actors[1];
  if (!source) throw new Error('FIXTURE_MISSING');
  let callback: SubscribeCallback | undefined;
  const channel: FakeChannel = {
    on: () => channel,
    subscribe: (next) => {
      callback = next;
      queueMicrotask(() => {
        for (const event of events) next(event.status, event.error);
      });
      return channel;
    },
  };
  const client = {
    channel: vi.fn<(topic: string, options: unknown) => FakeChannel>(
      () => channel,
    ),
    removeChannel: vi.fn(() => Promise.resolve('ok')),
    removeAllChannels: () => Promise.resolve([]),
    realtime: { disconnect: () => Promise.resolve() },
  };
  const repository = {
    join: vi.fn<() => Promise<unknown>>(() =>
      Promise.reject(new LiveRepositoryError('JOIN_INVALID_CODE')),
    ),
    getState: vi.fn<() => Promise<unknown>>(() =>
      Promise.reject(new LiveRepositoryError('NOT_FOUND')),
    ),
  };
  mocks.client.mockReturnValue(client);
  mocks.repository.mockReturnValue(repository);
  const actor = createSdkLiveActor(
    config,
    {
      anonKey: 'synthetic-public',
      serviceKey: 'synthetic-admin',
      teacherPassword: 'synthetic-password',
    },
    {
      role: 'student',
      account: 'synthetic',
      email: 'synthetic@invalid.test',
      password: 'synthetic-password',
      displayName: 'synthetic',
    },
    new AbortController().signal,
    { ...source, index: 0 },
  ).actor;
  return {
    actor,
    repository,
    client,
    emit: (status: REALTIME_SUBSCRIBE_STATES, error?: Error) =>
      callback?.(status, error),
  };
};

describe('outsider actor instrumentation keeps the existing refusal gate', () => {
  it('records both denied RPCs and explicit private refusal only after successful removal', async () => {
    const probe = createProbe();
    try {
      await expect(
        probe.actor.proveOutsiderRefusal(UUID, SECRET),
      ).resolves.toBeUndefined();
      expect(probe.actor.getOutsiderDiagnostics()).toMatchObject({
        joinRpc: { outcome: 'denied', repositoryCode: 'JOIN_INVALID_CODE' },
        getStateRpc: { outcome: 'denied', repositoryCode: 'NOT_FOUND' },
        privateSubscription: {
          outcome: 'denied',
          firstFailure: { explicitPermission: true, reason: 'permission' },
        },
        channelRemoval: { outcome: 'ok' },
        failureStep: null,
      });
      expect(probe.client.channel).toHaveBeenCalledWith(
        `live-session:${UUID}`,
        { config: { broadcast: { self: true }, private: true } },
      );
    } finally {
      await probe.actor.close();
    }
  });

  it('leaves subscription not_run when an RPC unexpectedly succeeds', async () => {
    const probe = createProbe();
    probe.repository.join.mockResolvedValue({ sessionId: UUID, token: SECRET });
    try {
      await expect(
        probe.actor.proveOutsiderRefusal(UUID, SECRET),
      ).rejects.toThrow('LIVE_CAPACITY_OUTSIDER_RPC_UNPROVEN');
      expect(probe.actor.getOutsiderDiagnostics()).toMatchObject({
        joinRpc: { outcome: 'unexpected_success' },
        privateSubscription: { outcome: 'not_run', elapsedMs: null },
        failureStep: 'join_rpc',
      });
      expect(probe.client.channel).not.toHaveBeenCalled();
    } finally {
      await probe.actor.close();
    }
  });

  it('preserves FAIL when the safe classifier sees permission but the existing predicate does not', async () => {
    const wrapped = new Error('SDK wrapper', {
      cause: { reason: 'Unauthorized', topic, token: SECRET },
    });
    const probe = createProbe([
      { status: REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR, error: wrapped },
    ]);
    try {
      await expect(
        probe.actor.proveOutsiderRefusal(UUID, SECRET),
      ).rejects.toThrow('LIVE_CAPACITY_PRIVATE_SUBSCRIPTION_FAILED');
      expect(probe.actor.getOutsiderDiagnostics()).toMatchObject({
        privateSubscription: {
          outcome: 'error',
          firstFailure: {
            status: 'CHANNEL_ERROR',
            explicitPermission: false,
            reason: 'permission',
          },
        },
        channelRemoval: { outcome: 'ok' },
        failureStep: 'private_subscribe',
      });
    } finally {
      await probe.actor.close();
    }
  });

  it('keeps timeout distinct from a permission refusal and still fails', async () => {
    const probe = createProbe([
      { status: REALTIME_SUBSCRIBE_STATES.TIMED_OUT },
    ]);
    try {
      await expect(
        probe.actor.proveOutsiderRefusal(UUID, SECRET),
      ).rejects.toThrow('LIVE_CAPACITY_PRIVATE_SUBSCRIPTION_FAILED');
      expect(probe.actor.getOutsiderDiagnostics()).toMatchObject({
        privateSubscription: {
          outcome: 'timeout',
          firstFailure: { explicitPermission: false, reason: 'timeout' },
        },
        failureStep: 'private_subscribe',
      });
    } finally {
      await probe.actor.close();
    }
  });

  it.each([
    ['error', 'error'],
    ['timed out', 'timed_out'],
  ])(
    'keeps removal resolution %s visible and fail-closed',
    async (result, outcome) => {
      const probe = createProbe();
      probe.client.removeChannel.mockResolvedValue(result);
      try {
        await expect(
          probe.actor.proveOutsiderRefusal(UUID, SECRET),
        ).rejects.toThrow('LIVE_CAPACITY_CHANNEL_CLEANUP_FAILED');
        expect(probe.actor.getOutsiderDiagnostics()).toMatchObject({
          channelRemoval: { outcome },
          failureStep: 'remove_channel',
          failureCode: 'CHANNEL_CLEANUP_FAILED',
        });
      } finally {
        await probe.actor.close();
      }
    },
  );

  it('captures a rejected channel removal without copying its error or losing it after throw', async () => {
    const probe = createProbe();
    probe.client.removeChannel.mockRejectedValue(new Error(SECRET));
    const config = parseCapacityConfig(['--revision', 'a'.repeat(40)], {});
    const receipt = createCapacityReceipt(config, 'a'.repeat(40));
    receipt.result = 'FAIL';
    receipt.outsider = 'failed';
    try {
      try {
        await probe.actor.proveOutsiderRefusal(UUID, SECRET);
      } catch {
        /* Same finally handoff as the production runner. */
      } finally {
        receipt.outsiderDiagnostics = probe.actor.getOutsiderDiagnostics();
      }
      const safe = sanitizeCapacityReceipt(receipt);
      expect(safe.outsiderDiagnostics).toMatchObject({
        channelRemoval: { outcome: 'rejected', reason: 'unknown' },
        failureStep: 'remove_channel',
        failureCode: 'CHANNEL_REMOVAL_REJECTED',
      });
      for (const marker of [SECRET, topic, UUID])
        expect(JSON.stringify(safe)).not.toContain(marker);
    } finally {
      await probe.actor.close();
    }
  });

  it('does not overwrite an earlier failure cause with a synchronous CLOSED callback', async () => {
    const probe = createProbe([
      {
        status: REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR,
        error: new Error('Unauthorized'),
      },
      { status: REALTIME_SUBSCRIBE_STATES.CLOSED },
    ]);
    try {
      // This original gate can fail after CLOSED; instrumentation must not relax it.
      await expect(
        probe.actor.proveOutsiderRefusal(UUID, SECRET),
      ).rejects.toThrow('LIVE_CAPACITY_PRIVATE_SUBSCRIPTION_FAILED');
      expect(
        probe.actor.getOutsiderDiagnostics().privateSubscription,
      ).toMatchObject({
        outcome: 'error',
        firstFailure: {
          status: 'CHANNEL_ERROR',
          explicitPermission: true,
          reason: 'permission',
        },
      });
      const snapshot = probe.actor.getOutsiderDiagnostics();
      probe.emit(REALTIME_SUBSCRIBE_STATES.CLOSED);
      expect(probe.actor.getOutsiderDiagnostics()).toEqual(snapshot);
    } finally {
      await probe.actor.close();
    }
  });
});

it('keeps valid old PASS receipts readable without using telemetry to grant PASS', () => {
  const config = parseCapacityConfig(['--revision', 'a'.repeat(40)], {});
  const original = createCapacityReceipt(config, 'a'.repeat(40));
  delete original.outsiderDiagnostics;
  const valid = {
    ...original,
    result: 'PASS',
    outsider: 'rejected',
    cleanup: { status: 'verified', sharedIpLimiter: 'preserved' },
    actors: original.actors.map((actor) => ({
      ...actor,
      status: 'completed',
      requests: 1,
      broadcasts: 1,
    })),
    rounds: [1, 2, 3].map((position) => ({
      position,
      answerCount: 2,
      distinctParticipants: 2,
      snapshotsMatched: true,
      timing: { count: 2, max_ms: 100, p50_ms: 100, p95_ms: 100 },
    })),
  };
  expect(sanitizeCapacityReceipt(valid).result).toBe('PASS');
  expect(() =>
    sanitizeCapacityReceipt({
      ...valid,
      outsider: 'failed',
      outsiderDiagnostics: {
        ...createOutsiderDiagnostics().snapshot(),
        privateSubscription: {
          ...createOutsiderDiagnostics().snapshot().privateSubscription,
          outcome: 'denied',
        },
      },
    }),
  ).toThrow();
});
