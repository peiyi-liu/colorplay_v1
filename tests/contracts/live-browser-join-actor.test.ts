import { performance } from 'node:perf_hooks';

import { errors, type Browser } from '@playwright/test';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createBrowserLiveActor } from '../../scripts/live/capacity-browser-actor';
import { parseCapacityConfig } from '../../scripts/live/capacity-config';
import {
  createCapacityReceipt,
  sanitizeCapacityReceipt,
} from '../../scripts/live/capacity-receipt';

const SECRET = 'SYNTHETIC_URL_TOPIC_ACCOUNT_JWT_SECRET_MARKER';
const session = '00000000-0000-4000-8000-000000000002';
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
const setup = async (
  failure?: 'lobby' | 'connection' | 'navigation' | 'presenter',
  ack = true,
  host = false,
  hostUiOnly = false,
  hostReadyMs = 10,
) => {
  let clock = 0;
  let closed = false;
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  type Handler = (...args: never[]) => void;
  const handlers = new Map<string, Handler[]>();
  const emit = (event: string, value: unknown) => {
    for (const callback of handlers.get(event) ?? []) callback(value as never);
  };
  const frameHandlers = new Map<string, Handler[]>();
  const emitFrame = (event: string, payload: unknown) => {
    for (const callback of frameHandlers.get(event) ?? [])
      callback({ payload: JSON.stringify(payload) } as never);
  };
  const deliverAck = () => {
    const topic = `realtime:live-session:${SECRET}`;
    emitFrame('framesent', {
      event: 'phx_join',
      topic,
      ref: SECRET,
      payload: {},
    });
    emitFrame('framereceived', {
      event: 'phx_reply',
      topic,
      ref: SECRET,
      payload: { status: 'ok' },
    });
  };
  const hostReady = vi.fn((options: { timeout: number; state: string }) => {
    expect(options).toEqual({ timeout: 20_000, state: 'visible' });
    clock += failure === 'presenter' ? 20_000 : hostReadyMs;
    return failure === 'presenter'
      ? Promise.reject(new errors.TimeoutError(SECRET))
      : Promise.resolve();
  });
  const textWait = vi.fn((text: string) => {
    const step = text === '連線正常' ? 'connection' : 'lobby';
    clock += step === failure ? 20_000 : 10;
    return step === failure || (hostUiOnly && text === '連線正常')
      ? Promise.reject(new errors.TimeoutError(SECRET))
      : Promise.resolve();
  });
  const page = {
    on: (event: string, callback: Handler) => {
      handlers.set(event, [...(handlers.get(event) ?? []), callback]);
    },
    off: (event: string, callback: Handler) => {
      handlers.set(
        event,
        (handlers.get(event) ?? []).filter((entry) => entry !== callback),
      );
    },
    isClosed: () => closed,
    addInitScript: () => Promise.resolve(),
    evaluate: () =>
      Promise.resolve({
        disconnectCount: 0,
        lastConnectionState: 'connecting',
        sequence: ['connecting'],
      }),
    goto: () => {
      clock += 10;
      emit('console', { type: () => 'error', text: () => SECRET });
      emit('pageerror', { name: SECRET });
      emit('response', {
        url: () => `http://127.0.0.1/${SECRET}`,
        status: () => 500,
        request: () => ({ method: () => 'GET' }),
      });
      emit('websocket', {
        url: () => `ws://127.0.0.1/realtime/v1/websocket?apikey=${SECRET}`,
        on: (event: string, callback: Handler) => {
          frameHandlers.set(event, [
            ...(frameHandlers.get(event) ?? []),
            callback,
          ]);
        },
      });
      if (ack) deliverAck();
      return failure === 'navigation'
        ? Promise.reject(new Error(SECRET))
        : Promise.resolve();
    },
    getByLabel: () => ({ fill: () => Promise.resolve() }),
    getByRole: (role: string, options: { name: string; exact?: boolean }) => {
      if (role === 'region')
        expect(options).toEqual({ name: 'Live 投影模式', exact: true });
      return {
        click: () => Promise.resolve(),
        getByRole: (
          childRole: string,
          childOptions: { name: string; exact?: boolean },
        ) => {
          expect(childRole).toBe('button');
          expect(childOptions).toEqual({ name: '開始遊戲', exact: true });
          return { waitFor: hostReady };
        },
      };
    },
    getByText: (text: string) => ({
      waitFor: () => textWait(text),
    }),
    url: () => `http://127.0.0.1/app/live/${session}`,
  };
  const context = {
    grantPermissions: () => Promise.resolve(),
    route: () => Promise.resolve(),
    routeWebSocket: () => Promise.resolve(),
    newPage: () => Promise.resolve(page),
    close: () => {
      closed = true;
      emit('close', undefined);
      clock += 5000;
      emitFrame('framereceived', {
        event: 'phx_close',
        topic: `live-session:${SECRET}`,
        payload: {},
      });
      return Promise.resolve();
    },
  };
  const browser = {
    newContext: () => Promise.resolve(context),
  } as unknown as Browser;
  const config = parseCapacityConfig(
    ['--profile', 'browser', '--revision', 'a'.repeat(40)],
    {},
  );
  const receipt = createCapacityReceipt(config, 'a'.repeat(40));
  const evidence = receipt.actors[host ? 0 : 1];
  if (!evidence) throw new Error('SYNTHETIC_ACTOR_MISSING');
  const actor = await createBrowserLiveActor(
    browser,
    config,
    {
      anonKey: 'synthetic-public-key',
      serviceKey: 'synthetic-admin-key',
      teacherPassword: 'synthetic-password',
    },
    {
      account: 'synthetic',
      password: 'synthetic-password',
      email: 'synthetic@invalid.test',
      displayName: 'synthetic',
      role: host ? 'teacher' : 'student',
    },
    new AbortController().signal,
    evidence,
    () => undefined,
  );
  return {
    actor,
    evidence,
    receipt,
    deliverAck,
    hostReady,
    textWait,
    advanceClock: (ms: number) => {
      clock += ms;
    },
  };
};

describe('browser actor preserves join evidence on existing failures', () => {
  it('accepts a private ACK arriving after Host UI-ready within the same wait budget', async () => {
    vi.useFakeTimers();
    const { actor, evidence, deliverAck } = await setup(
      undefined,
      false,
      true,
      true,
    );
    try {
      const pending = actor.subscribe(session);
      await vi.advanceTimersByTimeAsync(100);
      expect(
        evidence.browserJoinDiagnostics?.subscribe.steps.at(-1),
      ).toMatchObject({ step: 'subscription_ack', outcome: 'running' });
      deliverAck();
      await expect(pending).resolves.toBeUndefined();
      expect(evidence.browserJoinDiagnostics?.subscribe).toMatchObject({
        outcome: 'connected',
        subscriptionAckObserved: true,
        connectionObserved: null,
      });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      await actor.close();
    }
  });

  it('uses only the remaining Host 20s budget when no ACK arrives', async () => {
    vi.useFakeTimers();
    const { actor, evidence, advanceClock } = await setup(
      undefined,
      false,
      true,
      true,
      19_000,
    );
    try {
      const pending = expect(actor.subscribe(session)).rejects.toThrow(
        'LIVE_CAPACITY_BROWSER_ACK_UNOBSERVED',
      );
      await vi.advanceTimersByTimeAsync(0);
      advanceClock(999);
      await vi.advanceTimersByTimeAsync(999);
      expect(evidence.browserJoinDiagnostics?.subscribe.outcome).toBe(
        'running',
      );
      advanceClock(1);
      await vi.advanceTimersByTimeAsync(1);
      await pending;
      expect(evidence.browserJoinDiagnostics?.subscribe).toMatchObject({
        outcome: 'ui_error',
        failureStep: 'subscription_ack',
        durationMs: 20_010,
        subscriptionAckObserved: false,
        connectionObserved: null,
      });
      expect(
        evidence.browserJoinDiagnostics?.subscribe.steps.at(-1)?.elapsedMs,
      ).toBe(1000);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      await actor.close();
    }
  });

  it('rejects a missing Host control even if Student text and private ACK exist', async () => {
    const { actor, evidence, textWait } = await setup('presenter', true, true);
    try {
      await expect(actor.subscribe(session)).rejects.toBeInstanceOf(
        errors.TimeoutError,
      );
      expect(textWait).not.toHaveBeenCalled();
      expect(evidence.browserJoinDiagnostics?.subscribe).toMatchObject({
        outcome: 'realtime_timeout',
        failureStep: 'presenter_ready',
        connectionObserved: null,
      });
      expect(
        evidence.browserJoinDiagnostics?.subscribe.steps.map(
          (entry) => entry.step,
        ),
      ).toEqual(['navigation', 'presenter_ready']);
    } finally {
      await actor.close();
    }
  });

  it('retains the Student connection UI gate even when a private ACK exists', async () => {
    const { actor, evidence, hostReady } = await setup('connection', true);
    try {
      await expect(actor.subscribe(session)).rejects.toBeInstanceOf(
        errors.TimeoutError,
      );
      expect(hostReady).not.toHaveBeenCalled();
      expect(evidence.browserJoinDiagnostics?.subscribe).toMatchObject({
        outcome: 'realtime_timeout',
        failureStep: 'connection',
        connectionObserved: false,
      });
    } finally {
      await actor.close();
    }
  });

  it('retains the existing browser health failure after Host readiness and ACK pass', async () => {
    const { actor } = await setup(undefined, true, true);
    try {
      await actor.subscribe(session);
      await expect(actor.assertBrowserHealth()).rejects.toThrow(
        'LIVE_CAPACITY_BROWSER_HEALTH_FAILED',
      );
    } finally {
      await actor.close();
    }
  });
  it('uses the real Host presenter control even when the Student status does not exist', async () => {
    const { actor, evidence, hostReady, textWait } = await setup(
      undefined,
      true,
      true,
      true,
    );
    try {
      await actor.subscribe(session);
      expect(evidence.status).toBe('connected');
      expect(hostReady).toHaveBeenCalledExactlyOnceWith({
        timeout: 20_000,
        state: 'visible',
      });
      expect(textWait).not.toHaveBeenCalled();
    } finally {
      await actor.close();
    }
  });
  it.each([
    ['lobby', 'lobby_timeout', 'lobby'],
    ['connection', 'realtime_timeout', 'connection'],
    ['navigation', 'ui_error', 'navigation'],
  ] as const)(
    'keeps %s snapshot after throw, sanitization and delayed close',
    async (failure, outcome, failureStep) => {
      const { actor, evidence, receipt } = await setup(failure);
      await expect(actor.joinLive('SYNTHETIC_CODE')).rejects.toThrow(
        'LIVE_CAPACITY_BROWSER_JOIN_FAILED',
      );
      expect(evidence.browserJoinDiagnostics?.join).toMatchObject({
        actorIndex: 2,
        outcome,
        failureStep,
        counts: { consoleErrors: 1, pageErrors: 1, serverErrors: 1 },
      });
      expect(evidence.browserJoinDiagnostics?.subscribe.outcome).toBe(
        'not_run',
      );
      const before = JSON.stringify(evidence.browserJoinDiagnostics);
      await actor.close();
      expect(JSON.stringify(evidence.browserJoinDiagnostics)).toBe(before);
      const safe = JSON.stringify(sanitizeCapacityReceipt(receipt));
      for (const marker of [
        SECRET,
        session,
        'SYNTHETIC_CODE',
        'stack',
        'payload',
        'apikey',
      ])
        expect(safe).not.toContain(marker);
      expect(evidence.uiProof).toMatchObject({ join: false });
    },
  );

  it('keeps successful join UI distinct from the existing subscription ack gate', async () => {
    const { actor, evidence } = await setup(undefined, false);
    try {
      await expect(actor.joinLive('synthetic')).resolves.toBe(session);
      expect(evidence.browserJoinDiagnostics?.join).toMatchObject({
        outcome: 'connected',
        subscriptionAckObserved: null,
      });
      await expect(actor.subscribe(session)).rejects.toThrow(
        'LIVE_CAPACITY_BROWSER_ACK_UNOBSERVED',
      );
      expect(evidence.browserJoinDiagnostics?.subscribe).toMatchObject({
        outcome: 'ui_error',
        failureStep: 'subscription_ack',
        subscriptionAckObserved: false,
        connectionObserved: true,
      });
    } finally {
      await actor.close();
    }
  });

  it('records the host existing navigation, UI wait and successful ack check independently', async () => {
    const { actor, evidence } = await setup(undefined, true, true);
    try {
      await actor.subscribe(session);
      expect(evidence.browserJoinDiagnostics?.join.outcome).toBe('not_run');
      expect(evidence.browserJoinDiagnostics?.subscribe).toMatchObject({
        actorIndex: 1,
        outcome: 'connected',
        subscriptionAckObserved: true,
        connectionObserved: null,
        failureStep: null,
      });
      expect(evidence.status).toBe('connected');
    } finally {
      await actor.close();
    }
  });

  it('preserves subscription UI timeout rather than inventing an ack failure', async () => {
    const { actor, evidence } = await setup('presenter', false, true);
    try {
      await expect(actor.subscribe(session)).rejects.toBeInstanceOf(
        errors.TimeoutError,
      );
      expect(evidence.browserJoinDiagnostics?.subscribe).toMatchObject({
        outcome: 'realtime_timeout',
        failureStep: 'presenter_ready',
        connectionObserved: null,
        subscriptionAckObserved: null,
      });
    } finally {
      await actor.close();
    }
  });
});
