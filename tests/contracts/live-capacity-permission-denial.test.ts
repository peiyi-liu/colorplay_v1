import { REALTIME_SUBSCRIBE_STATES } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import {
  createSdkLiveActor,
  isExplicitPermissionDenial,
} from '../../scripts/live/capacity-actors';
import {
  classifyOutsiderReason,
  createOutsiderDiagnostics,
} from '../../scripts/live/capacity-outsider-diagnostics';
import { parseCapacityConfig } from '../../scripts/live/capacity-config';
import {
  createCapacityReceipt,
  sanitizeCapacityReceipt,
} from '../../scripts/live/capacity-receipt';
import { LiveRepositoryError } from '../../src/features/live/types';

const mocks = vi.hoisted(() => ({ client: vi.fn(), repository: vi.fn() }));
vi.mock('../../scripts/live/capacity-local-client', () => ({
  createLocalClient: mocks.client,
}));
vi.mock('../../src/features/live/api/live-repository', () => ({
  createLiveRepository: mocks.repository,
}));

const topic = 'SYNTHETIC_PRIVATE_TOPIC_MARKER';
const denial = `Unauthorized: You do not have permissions to read from this Channel topic: ${topic}`;
const sdkError = () => {
  const error = { reason: denial };
  return new Error(Object.values(error).join(', '), { cause: error });
};
const config = parseCapacityConfig(['--revision', 'a'.repeat(40)], {});
const sourceReceipt = () => createCapacityReceipt(config, 'a'.repeat(40));

describe('confirmed Realtime private permission refusal', () => {
  it.each([
    new Error(denial),
    sdkError(),
    new Error(`You do not have permissions to read from this Topic: ${topic}`),
    new Error('Unauthorized'),
    new Error('Forbidden'),
  ])(
    'accepts only supported server formats including the SDK Error wrapper',
    (error) => {
      expect(isExplicitPermissionDenial(error)).toBe(true);
      expect(classifyOutsiderReason(error)).toBe('permission');
    },
  );

  it.each([
    'Unauthorized: authentication service unavailable',
    `other failure: ${denial}`,
    denial.replace('Channel topic', 'channel topic'),
    denial.replace('Unauthorized: ', ''),
    denial.replace(topic, ''),
    `${denial}\nother failure`,
    `${denial}\n`,
    `${denial}\r`,
    'timeout',
    'fetch failed',
    'JWT expired',
    'unknown failure',
  ])('rejects near matches and unrelated errors: %s', (message) => {
    expect(isExplicitPermissionDenial(new Error(message))).toBe(false);
  });

  it('does not trust a plain payload, cause-only denial or arbitrary getters', () => {
    expect(isExplicitPermissionDenial({ message: denial })).toBe(false);
    expect(
      isExplicitPermissionDenial(
        new Error('unknown wrapper', { cause: sdkError() }),
      ),
    ).toBe(false);
    const getter = vi.fn(() => denial);
    const error = new Error('unknown failure');
    Object.defineProperty(error, 'message', { get: getter });
    Object.defineProperty(error, 'cause', { get: getter });
    expect(isExplicitPermissionDenial(error)).toBe(false);
    expect(classifyOutsiderReason(error)).toBe('unknown');
    expect(getter).not.toHaveBeenCalled();
  });

  it('classifies the SDK callback as permission without retaining its message or cause', () => {
    const error = sdkError();
    expect(classifyOutsiderReason(error)).toBe('permission');
    const diagnostics = createOutsiderDiagnostics();
    const attempt = diagnostics.begin();
    attempt.subscriptionStarted();
    attempt.callback('CHANNEL_ERROR', error, isExplicitPermissionDenial(error));
    attempt.subscriptionFinished('denied');
    expect(diagnostics.snapshot().privateSubscription).toMatchObject({
      outcome: 'denied',
      firstFailure: { explicitPermission: true, reason: 'permission' },
    });
    expect(JSON.stringify(diagnostics.snapshot())).not.toContain(topic);
  });
});

type Callback = (status: REALTIME_SUBSCRIBE_STATES, error?: Error) => void;
const createProbe = (
  error: Error,
  status = REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR,
  removal = 'ok',
) => {
  const channel = {
    on: () => channel,
    subscribe: (callback: Callback) => {
      queueMicrotask(() => {
        callback(status, error);
      });
      return channel;
    },
  };
  mocks.client.mockReturnValue({
    channel: () => channel,
    removeChannel: () => Promise.resolve(removal),
    removeAllChannels: () => Promise.resolve([]),
    realtime: { disconnect: () => Promise.resolve() },
  });
  mocks.repository.mockReturnValue({
    join: () => Promise.reject(new LiveRepositoryError('JOIN_INVALID_CODE')),
    getState: () => Promise.reject(new LiveRepositoryError('NOT_FOUND')),
  });
  const evidence = sourceReceipt().actors[1];
  if (!evidence) throw new Error('SYNTHETIC_FIXTURE_MISSING');
  return createSdkLiveActor(
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
    evidence,
  ).actor;
};

describe('outsider callback proof with the confirmed server format', () => {
  it.each([new Error(denial), sdkError()])(
    'proves refusal only after the RPC denials and successful removal, with a sanitized receipt',
    async (error) => {
      const causeMarker = 'SYNTHETIC_CAUSE_SECRET_MARKER';
      Object.defineProperty(error, 'cause', {
        value: { reason: denial, topic, token: causeMarker },
      });
      const actor = createProbe(error);
      try {
        await expect(
          actor.proveOutsiderRefusal('synthetic-session', 'synthetic-code'),
        ).resolves.toBeUndefined();
        const diagnostics = actor.getOutsiderDiagnostics();
        expect(diagnostics).toMatchObject({
          joinRpc: { outcome: 'denied', repositoryCode: 'JOIN_INVALID_CODE' },
          getStateRpc: { outcome: 'denied', repositoryCode: 'NOT_FOUND' },
          privateSubscription: {
            outcome: 'denied',
            firstFailure: {
              status: 'CHANNEL_ERROR',
              explicitPermission: true,
              reason: 'permission',
            },
          },
          channelRemoval: { outcome: 'ok' },
          failureStep: null,
        });
        const receipt = sourceReceipt();
        receipt.outsiderDiagnostics = diagnostics;
        const serialized = JSON.stringify(sanitizeCapacityReceipt(receipt));
        for (const marker of [
          topic,
          denial,
          causeMarker,
          'synthetic-session',
          'synthetic-code',
          '"cause"',
          '"stack"',
          '"message"',
        ])
          expect(serialized).not.toContain(marker);
      } finally {
        await actor.close();
      }
    },
  );

  it.each([
    [new Error('timeout'), REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR, 'timeout'],
    [
      new Error('fetch failed'),
      REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR,
      'transport',
    ],
    [
      new Error('unknown failure'),
      REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR,
      'unknown',
    ],
    [
      new Error('Unauthorized: authentication service unavailable'),
      REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR,
      'unknown',
    ],
    [sdkError(), REALTIME_SUBSCRIBE_STATES.TIMED_OUT, 'timeout'],
    [sdkError(), REALTIME_SUBSCRIBE_STATES.CLOSED, 'transport'],
  ] as const)(
    'keeps non-refusal callback failures closed',
    async (error, status, reason) => {
      const actor = createProbe(error, status);
      try {
        await expect(
          actor.proveOutsiderRefusal('synthetic-session', 'synthetic-code'),
        ).rejects.toThrow('LIVE_CAPACITY_PRIVATE_SUBSCRIPTION_FAILED');
        expect(actor.getOutsiderDiagnostics()).toMatchObject({
          privateSubscription: {
            firstFailure: { explicitPermission: false, reason },
          },
          failureStep: 'private_subscribe',
        });
        expect(
          actor.getOutsiderDiagnostics().privateSubscription.outcome,
        ).not.toBe('denied');
      } finally {
        await actor.close();
      }
    },
  );

  it('still fails when the confirmed denial is followed by unsuccessful removal', async () => {
    const actor = createProbe(
      sdkError(),
      REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR,
      'timed out',
    );
    try {
      await expect(
        actor.proveOutsiderRefusal('synthetic-session', 'synthetic-code'),
      ).rejects.toThrow('LIVE_CAPACITY_CHANNEL_CLEANUP_FAILED');
      expect(actor.getOutsiderDiagnostics()).toMatchObject({
        channelRemoval: { outcome: 'timed_out' },
        failureStep: 'remove_channel',
      });
    } finally {
      await actor.close();
    }
  });
});
