import { performance } from 'node:perf_hooks';

import { errors, type Page } from '@playwright/test';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { joinLiveThroughUi } from '../e2e/helpers/staging-capacity-browser';
import { parseCapacityConfig } from '../../scripts/live/capacity-config';
import {
  createCapacityReceipt,
  sanitizeCapacityReceipt,
} from '../../scripts/live/capacity-receipt';
import {
  createBrowserJoinDiagnostics,
  type BrowserJoinSnapshot,
} from '../e2e/helpers/live-browser-join-diagnostics';
import {
  createLiveConnectionDiagnostics,
  liveDiagnosticsForPage,
} from '../e2e/helpers/live-connection-diagnostics';

type Step = 'navigation' | 'fill_code' | 'submit' | 'lobby' | 'connection';
const fakePage = (
  failure?: Step,
  timeout = false,
  onWait?: (step: Step) => void,
) => {
  let clock = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  const operation = (step: Step) => {
    clock += step === failure && timeout ? 20_000 : 10;
    onWait?.(step);
    if (step === failure)
      return Promise.reject(
        timeout
          ? new errors.TimeoutError('SYNTHETIC_SECRET_MARKER')
          : new Error('SYNTHETIC_SECRET_MARKER'),
      );
    return Promise.resolve();
  };
  const page = {
    goto: () => operation('navigation'),
    getByLabel: () => ({ fill: () => operation('fill_code') }),
    getByRole: () => ({ click: () => operation('submit') }),
    getByText: (label: string) => ({
      waitFor: (options: { timeout: number }) => {
        expect(options.timeout).toBe(20_000);
        return operation(label === '連線正常' ? 'connection' : 'lobby');
      },
    }),
  } as unknown as Page;
  return page;
};

afterEach(() => vi.restoreAllMocks());

describe('browser join diagnostic snapshots', () => {
  it('uses the explicit current actor index when a Page seam starts a newer attempt', async () => {
    const page = fakePage();
    await joinLiveThroughUi([page], 'synthetic', { actorIndex: 2 });
    const observe = vi.fn();
    await joinLiveThroughUi([page], 'synthetic', { actorIndex: 3, observe });
    expect(observe.mock.lastCall?.[0]).toMatchObject({
      actorIndex: 3,
      outcome: 'connected',
    });
  });
  it('keeps original PASS/FAIL rules compatible with optional observations and strips unknown receipt fields', () => {
    const config = parseCapacityConfig(
      ['--profile', 'browser', '--revision', 'a'.repeat(40)],
      {},
    );
    const original = createCapacityReceipt(config, 'a'.repeat(40));
    const receipt = {
      ...original,
      result: 'PASS',
      outsider: 'rejected',
      cleanup: { ...original.cleanup, status: 'verified' },
      actors: original.actors.map((actor) => ({
        ...actor,
        status: 'completed',
        requests: 1,
        broadcasts: 1,
        uiProof: { login: true, join: true, answerRounds: 3 },
      })),
      rounds: [1, 2, 3].map((position) => ({
        position,
        answerCount: 2,
        distinctParticipants: 2,
        timing: { count: 2, max_ms: 1, p50_ms: 1, p95_ms: 1 },
        snapshotsMatched: true,
      })),
    };
    expect(sanitizeCapacityReceipt(receipt).result).toBe('PASS');
    expect(() =>
      sanitizeCapacityReceipt({ ...receipt, cleanup: { status: 'failed' } }),
    ).toThrow();
    expect(() =>
      sanitizeCapacityReceipt({
        ...receipt,
        actors: receipt.actors.map((actor) => ({
          ...actor,
          uiProof: { login: true, join: false, answerRounds: 3 },
        })),
      }),
    ).toThrow();
    expect(sanitizeCapacityReceipt({ ...receipt, result: 'FAIL' }).result).toBe(
      'FAIL',
    );
    const safe = sanitizeCapacityReceipt({
      ...original,
      actors: original.actors.map((actor) => ({
        ...actor,
        browserJoinDiagnostics: {
          ...actor.browserJoinDiagnostics,
          topic: 'SYNTHETIC_SECRET_MARKER',
        },
      })),
    });
    expect(JSON.stringify(safe)).not.toContain('SYNTHETIC');
  });

  it('does not publish a stale helper continuation into a newer page attempt', async () => {
    let release: (() => void) | undefined;
    let waits = 0;
    const page = fakePage();
    page.getByText = (() => ({
      waitFor: () => {
        waits += 1;
        if (waits === 1)
          return new Promise<void>((resolve) => {
            release = resolve;
          });
        return Promise.resolve();
      },
    })) as unknown as Page['getByText'];
    const stale = vi.fn();
    const current = vi.fn();
    const first = joinLiveThroughUi([page], 'synthetic', {
      actorIndex: 2,
      observe: stale,
    });
    await vi.waitFor(() => {
      expect(release).toBeDefined();
    });
    await joinLiveThroughUi([page], 'synthetic', {
      actorIndex: 2,
      observe: current,
    });
    const before = JSON.stringify(current.mock.lastCall?.[0]);
    const staleCalls = stale.mock.calls.length;
    release?.();
    await first;
    expect(JSON.stringify(current.mock.lastCall?.[0])).toBe(before);
    expect(stale).toHaveBeenCalledTimes(staleCalls);
  });

  it('drops unsafe/invalid event values and reports unavailable telemetry without keeping raw details', () => {
    const collector = createBrowserJoinDiagnostics(2, () => 0);
    const attempt = collector.begin(undefined, () => ({
      events: [
        {
          actorIndex: 2,
          stage: 'closed',
          outcome: 'error',
          elapsedMs: Infinity,
          reason: 'SYNTHETIC_SECRET_MARKER',
        },
        {
          actorIndex: 1,
          stage: 'closed',
          outcome: 'error',
          elapsedMs: 0,
          reason: 'transport',
        },
      ] as never,
    }));
    attempt.start('connection');
    attempt.finish('ui_error');
    expect(collector.snapshot()).toMatchObject({
      telemetry: 'unavailable',
      events: [],
      subscriptionAckObserved: null,
    });
    expect(JSON.stringify(collector.snapshot())).not.toContain('SYNTHETIC');
  });
  it.each([
    ['lobby', 'lobby_timeout', false, null],
    ['connection', 'realtime_timeout', true, false],
  ] as const)(
    'distinguishes %s timeout without inferring UI readiness from network events',
    async (step, outcome, lobbyObserved, connectionObserved) => {
      const page = fakePage(step, true);
      const observe = vi.fn();
      const [result] = await joinLiveThroughUi([page], 'SYNTHETIC_CODE', {
        actorIndex: 3,
        observe,
      });
      expect(result?.outcome).toBe(outcome);
      expect(observe.mock.lastCall?.[0]).toMatchObject({
        actorIndex: 3,
        outcome,
        failureStep: step,
        lobbyObserved,
        connectionObserved,
        realtimeMs: null,
      });
    },
  );

  it.each([
    'navigation',
    'fill_code',
    'submit',
    'lobby',
    'connection',
  ] as const)(
    'retains safe failure at %s even when UI throws',
    async (step) => {
      const observe = vi.fn();
      const [result] = await joinLiveThroughUi(
        [fakePage(step)],
        'SYNTHETIC_CODE',
        { observe },
      );
      expect(result).toEqual({
        durationMs: null,
        lobbyMs: null,
        realtimeMs: null,
        outcome: 'ui_error',
      });
      const snapshot: unknown = observe.mock.lastCall?.[0];
      expect(snapshot).toMatchObject({
        outcome: 'ui_error',
        failureStep: step,
      });
      expect(JSON.stringify(snapshot)).not.toMatch(
        /SYNTHETIC|stack|cause|payload/u,
      );
    },
  );

  it('preserves successful UI observations without inventing a subscription ack', async () => {
    const observe = vi.fn();
    const [result] = await joinLiveThroughUi([fakePage()], 'SYNTHETIC_CODE', {
      observe,
      actorIndex: 2,
    });
    expect(result).toEqual({
      durationMs: 50,
      lobbyMs: 40,
      realtimeMs: 10,
      outcome: 'connected',
    });
    expect(observe.mock.lastCall?.[0]).toMatchObject({
      outcome: 'connected',
      lobbyObserved: true,
      connectionObserved: true,
      subscriptionAckObserved: null,
      failureStep: null,
      durationMs: 50,
    });
  });

  it('uses the actual actor index, bounded existing decoder events and error counts only', async () => {
    const live = createLiveConnectionDiagnostics();
    const page = fakePage(undefined, false, (step) => {
      if (step !== 'lobby') return;
      const generation = live.generation();
      for (let index = 0; index < 20; index += 1)
        live.record(generation, 'ws_open', 'ok');
      const topic = 'realtime:live-session:SYNTHETIC_TOPIC_MARKER';
      live.frame(
        generation,
        'sent',
        JSON.stringify({
          event: 'phx_join',
          topic,
          ref: 'SYNTHETIC_REF_MARKER',
          payload: {},
        }),
      );
      live.frame(
        generation,
        'received',
        JSON.stringify({
          event: 'phx_reply',
          topic,
          ref: 'SYNTHETIC_REF_MARKER',
          payload: {
            status: 'ok',
            response: { token: 'SYNTHETIC_TOKEN_MARKER' },
          },
        }),
      );
    });
    liveDiagnosticsForPage.set(page, live);
    const observe = vi.fn();
    await joinLiveThroughUi([page], 'SYNTHETIC_CODE', {
      actorIndex: 3,
      observe,
      counts: () => ({ consoleErrors: 1, pageErrors: 2, serverErrors: 3 }),
    });
    const snapshot = observe.mock.lastCall?.[0] as ReturnType<
      ReturnType<typeof createBrowserJoinDiagnostics>['snapshot']
    >;
    expect(snapshot.events).toHaveLength(16);
    expect(snapshot.events.every((event) => event.actorIndex === 3)).toBe(true);
    expect(snapshot).toMatchObject({
      eventsTruncated: true,
      subscriptionAckObserved: true,
      counts: { consoleErrors: 1, pageErrors: 2, serverErrors: 3 },
    });
    expect(JSON.stringify(snapshot)).not.toContain('SYNTHETIC');
    const before = JSON.stringify(snapshot);
    live.record(live.generation(), 'closed', 'error', 'transport');
    expect(JSON.stringify(snapshot)).toBe(before);
  });

  it('treats failed telemetry/observers as unavailable without changing the original join outcome', async () => {
    const observe = vi.fn();
    const [result] = await joinLiveThroughUi(
      [fakePage('lobby', true)],
      'synthetic',
      {
        observe,
        counts: () => {
          throw new Error('SYNTHETIC_SECRET');
        },
      },
    );
    expect(result?.outcome).toBe('lobby_timeout');
    expect(observe.mock.lastCall?.[0]).toMatchObject({
      outcome: 'lobby_timeout',
      telemetry: 'unavailable',
      counts: { consoleErrors: 'unavailable' },
    });
    const [successful] = await joinLiveThroughUi([fakePage()], 'synthetic', {
      observe: () => {
        throw new Error('SYNTHETIC_SECRET');
      },
    });
    expect(successful?.outcome).toBe('connected');
  });

  it('fences old attempts and freezes first terminal time before slow collection or cleanup', () => {
    let clock = 0;
    const collector = createBrowserJoinDiagnostics(2, () => clock);
    const stale = collector.begin();
    stale.start('navigation');
    const current = collector.begin(undefined, () => {
      clock += 5000;
      return {};
    });
    current.start('lobby');
    clock = 10;
    current.finish('lobby_timeout');
    const before = collector.snapshot();
    expect(before).toMatchObject({
      outcome: 'lobby_timeout',
      durationMs: 10,
      failureStep: 'lobby',
      steps: [{ elapsedMs: 10, outcome: 'timeout' }],
    });
    clock = 20_000;
    stale.passed();
    stale.finish('connected');
    current.passed();
    current.finish('connected');
    expect(collector.snapshot()).toEqual(before);
  });

  it.each([NaN, Infinity, -Infinity])(
    'does not persist nonfinite times or fabricate unavailable measurements',
    (invalid) => {
      let clock = 0;
      const collector = createBrowserJoinDiagnostics(2, () => clock);
      expect(collector.snapshot()).toMatchObject({
        durationMs: null,
        counts: { consoleErrors: 'unavailable' },
      });
      const attempt = collector.begin();
      attempt.start('lobby');
      clock = invalid;
      attempt.finish('ui_error', { lobbyMs: invalid, realtimeMs: invalid });
      expect(collector.snapshot()).toMatchObject({
        durationMs: null,
        lobbyMs: null,
        realtimeMs: null,
        steps: [{ elapsedMs: null }],
      });
    },
  );
  it('keeps not_run/null browser observations optional for old receipts and absent on SDK actors', () => {
    const config = parseCapacityConfig(
      ['--profile', 'browser', '--revision', 'a'.repeat(40)],
      {},
    );
    const receipt = createCapacityReceipt(config, 'a'.repeat(40));
    expect(receipt.actors[1]?.browserJoinDiagnostics?.join).toMatchObject({
      outcome: 'not_run',
      durationMs: null,
      lobbyObserved: null,
    });
    const old = {
      ...receipt,
      actors: receipt.actors.map((actor) => {
        const old = { ...actor };
        delete old.browserJoinDiagnostics;
        return old;
      }),
    };
    expect(
      sanitizeCapacityReceipt(old).actors[1]?.browserJoinDiagnostics,
    ).toBeUndefined();
    const protocol = createCapacityReceipt(
      parseCapacityConfig(['--revision', 'a'.repeat(40)], {}),
      'a'.repeat(40),
    );
    expect(
      protocol.actors.every(
        (actor) => actor.browserJoinDiagnostics === undefined,
      ),
    ).toBe(true);
  });
  it('preserves lobby_timeout and its actual waiting step before the actor throws', async () => {
    let clock = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    const page = {
      goto: () => Promise.resolve(),
      getByLabel: () => ({ fill: () => Promise.resolve() }),
      getByRole: () => ({ click: () => Promise.resolve() }),
      getByText: () => ({
        waitFor: () => {
          clock = 20_000;
          return Promise.reject(
            new errors.TimeoutError('SYNTHETIC_SECRET_MARKER'),
          );
        },
      }),
    } as unknown as Page;
    const observe = vi.fn();
    const results = await joinLiveThroughUi([page], 'synthetic-code', {
      actorIndex: 2,
      observe,
    });
    expect(results[0]?.outcome).toBe('lobby_timeout');
    expect(observe).toHaveBeenLastCalledWith(
      expect.objectContaining({
        actorIndex: 2,
        outcome: 'lobby_timeout',
        failureStep: 'lobby',
        lobbyObserved: false,
        connectionObserved: null,
        durationMs: 20_000,
      }),
    );
  });
});

it('retains exact diagnostic actor indexes 1/40/41/59/60 and rejects 61', () => {
  for (const actorIndex of [1, 40, 41, 59, 60]) {
    const observe = vi.fn<(snapshot: BrowserJoinSnapshot) => void>();
    const collector = createBrowserJoinDiagnostics(actorIndex);
    const attempt = collector.begin(observe);
    attempt.start('navigation');
    attempt.passed();
    attempt.finish('connected');
    expect(collector.snapshot().actorIndex).toBe(actorIndex);
    expect(observe.mock.lastCall?.[0].actorIndex).toBe(actorIndex);
  }
  expect(() => createBrowserJoinDiagnostics(61).snapshot()).toThrow();
});
