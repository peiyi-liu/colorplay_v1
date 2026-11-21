import { performance } from 'node:perf_hooks';

import type { Browser, Response } from '@playwright/test';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createBrowserLiveActor } from '../../scripts/live/capacity-browser-actor';
import { parseCapacityConfig } from '../../scripts/live/capacity-config';
import { createCapacityReceipt } from '../../scripts/live/capacity-receipt';
import type { LiveSessionState } from '../../src/features/live/types';

const config = parseCapacityConfig(
  ['--profile', 'browser', '--revision', 'a'.repeat(40)],
  {},
);
const state: LiveSessionState = {
  sessionId: '11111111-1111-4111-8111-111111111111',
  state: 'question_open',
  stateVersion: 2,
  currentPosition: 1,
  questionCount: 3,
  participantCount: 2,
  rulesVersion: 'test',
  questionDisplay: 'device',
  serverTime: '2026-11-12T00:00:00Z',
  isHost: false,
  question: {
    questionId: '22222222-2222-4222-8222-222222222222',
    position: 1,
    publicOptions: [
      { id: '33333333-3333-4333-8333-333333333333', key: 'A', sortOrder: 1 },
    ],
    openedAt: null,
    deadlineAt: null,
  },
};
afterEach(() => vi.restoreAllMocks());

const setup = async (responseEnd: unknown, completion: Error | null = null) => {
  let clock = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  const finished = vi.fn(() => Promise.resolve(completion));
  const received = {
    ok: () => true,
    finished,
    request: () => ({ timing: () => ({ responseEnd }) }),
  } as unknown as Response;
  const options = {
    first: () => ({
      waitFor: () => {
        clock += 1200;
        return Promise.resolve();
      },
    }),
    nth: () => ({
      click: () => {
        clock += 500;
        return Promise.resolve();
      },
    }),
  };
  const page = {
    on: vi.fn(),
    addInitScript: () => Promise.resolve(),
    getByRole: () => ({ getByRole: () => options }),
    waitForResponse: () => Promise.resolve(received),
  };
  const context = {
    grantPermissions: () => Promise.resolve(),
    route: () => Promise.resolve(),
    routeWebSocket: () => Promise.resolve(),
    newPage: () => Promise.resolve(page),
    close: () => Promise.resolve(),
  };
  const browser = {
    newContext: () => Promise.resolve(context),
  } as unknown as Browser;
  const evidence = createCapacityReceipt(config, 'a'.repeat(40)).actors[1];
  if (!evidence) throw new Error('ACTOR_MISSING');
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
      role: 'student',
    },
    new AbortController().signal,
    evidence,
    () => undefined,
  );
  return { actor, evidence, finished };
};

describe('browser answer latency uses completed HTTP timing', () => {
  it('excludes >800ms of option readiness and click preparation from the unchanged 800ms gate', async () => {
    const { actor, evidence, finished } = await setup(100);
    try {
      await actor.submitAnswer(state);
      expect(
        evidence.timings.filter((entry) => entry.stage === 'answer'),
      ).toEqual([{ stage: 'answer', elapsedMs: 100, sample: 'first' }]);
      expect(finished).toHaveBeenCalledOnce();
      expect(evidence.uiProof).toMatchObject({ answerRounds: 1 });
    } finally {
      await actor.close();
    }
  });
  it.each([-1, NaN, Infinity, undefined])(
    'rejects unavailable or invalid HTTP responseEnd %s',
    async (timing) => {
      const { actor, evidence } = await setup(timing);
      try {
        await expect(actor.submitAnswer(state)).rejects.toThrow();
        expect(
          evidence.timings.filter((entry) => entry.stage === 'answer'),
        ).toEqual([]);
        expect(evidence.uiProof).toMatchObject({ answerRounds: 0 });
      } finally {
        await actor.close();
      }
    },
  );
  it('rejects an unfinished or failed response despite HTTP headers having arrived', async () => {
    const { actor, evidence } = await setup(
      100,
      new Error('SYNTHETIC_TRANSPORT_FAILED'),
    );
    try {
      await expect(actor.submitAnswer(state)).rejects.toThrow();
      expect(evidence.timings).toEqual([]);
    } finally {
      await actor.close();
    }
  });
});
