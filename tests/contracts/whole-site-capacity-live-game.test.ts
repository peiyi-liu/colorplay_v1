import { parseCapacityScope } from '../../scripts/concurrency/capacity-scope';
import { EventEmitter } from 'node:events';
import type { Page } from '@playwright/test';
import * as liveApi from '../../src/features/live/api/live-repository';
import {
  LiveRepositoryError,
  type LiveRepository,
} from '../../src/features/live/types';
import * as browserHelper from '../e2e/helpers/staging-capacity-browser';
import { capacityFixture } from './helpers/whole-site-capacity';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../src/types/database';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createCapacityLiveGate,
  runCapacityLiveGame,
} from '../../scripts/concurrency/capacity-live-game';
const state = {
  session_id: '18400000-0000-0000-0000-000000000001',
  state: 'lobby',
  state_version: 2,
  current_position: 0,
  question_count: 3,
  participant_count: 2,
  rules_version: '2026-07-live-1',
  question_display: 'device',
  server_time: '2026-07-17T15:00:00+00:00',
  is_host: false,
  mode: 'individual',
  team_count: null,
};
const fixture = () => {
  let callback: (status: string, error?: Error) => void = () => undefined;
  const channel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn((cb: typeof callback) => {
      callback = cb;
    }),
  };
  const rpc = vi.fn(async () => {
    await Promise.resolve();
    return { data: state, error: null };
  });
  const channelMock = vi.fn(() => channel),
    removeMock = vi.fn(async () => {
      await Promise.resolve();
      return 'ok';
    });
  const client = {
    channel: channelMock,
    removeChannel: removeMock,
    rpc,
  } as unknown as SupabaseClient<Database>;
  const abort = new AbortController();
  return {
    client,
    channelMock,
    removeMock,
    rpc,
    abort,
    callback: (status: string, error?: Error) => {
      callback(status, error);
    },
  };
};
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
describe('dynamic capacity live gate keeps original 20s authoritative semantics', () => {
  it('broadcast wakes a second authoritative fetch instead of trusting payload as state', async () => {
    const f = fixture(),
      gate = createCapacityLiveGate(f.client, f.abort.signal);
    let complete = false;
    const read = gate
      .wait(state.session_id, (s) => s.stateVersion === 3)
      .then(() => {
        complete = true;
      });
    await vi.waitFor(() => {
      expect(f.rpc).toHaveBeenCalledTimes(1);
    });
    expect(complete).toBe(false);
    f.rpc.mockResolvedValue({
      data: { ...state, state_version: 3 },
      error: null,
    });
    gate.notify();
    await read;
    expect(f.rpc).toHaveBeenCalledTimes(2);
    gate.close();
  });
  it('stalled actual state read cannot exceed the existing 20s waiter budget', async () => {
    vi.useFakeTimers();
    const f = fixture();
    f.rpc.mockImplementation(() => new Promise(() => undefined));
    const gate = createCapacityLiveGate(f.client, f.abort.signal);
    const pending = gate.wait(state.session_id, () => false);
    const rejected = expect(pending).rejects.toThrow(
      'CAPACITY_EVIDENCE_INVALID',
    );
    await vi.advanceTimersByTimeAsync(20000);
    await rejected;
    gate.close();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('private ACK is mandatory and explicit outsider refusal additionally requires ok removal', async () => {
    const f = fixture(),
      gate = createCapacityLiveGate(f.client, f.abort.signal);
    const subscribed = gate.subscribe(state.session_id);
    f.callback('SUBSCRIBED');
    await subscribed;
    const denied = gate.subscribe(state.session_id, true);
    f.callback(
      'CHANNEL_ERROR',
      new Error(
        'Unauthorized: You do not have permissions to read from this Channel topic: SYNTHETIC_TOPIC',
      ),
    );
    await denied;
    expect(f.removeMock).toHaveBeenCalledTimes(1);
    gate.close();
  });
  it('unknown refusal and late channel failure stay fail closed; aborted gate creates no channel', async () => {
    const f = fixture(),
      gate = createCapacityLiveGate(f.client, f.abort.signal);
    const rejected = expect(
      gate.subscribe(state.session_id, true),
    ).rejects.toThrow('CAPACITY_EVIDENCE_INVALID');
    f.callback('CHANNEL_ERROR', new Error('UNKNOWN_SECRET'));
    await rejected;
    f.abort.abort();
    const count = f.channelMock.mock.calls.length;
    await expect(gate.subscribe(state.session_id)).rejects.toThrow(
      'CAPACITY_EVIDENCE_INVALID',
    );
    expect(f.channelMock).toHaveBeenCalledTimes(count);
    gate.close();
  });
});

describe('actual dynamic Native Live start flow', () => {
  it('binds actual20 then confirms the in-presenter dialog before first student answer', async () => {
    let dialog = false,
      opened = false,
      answering = false;
    const sessionId = '11000000-0000-4000-8000-000000000001';
    const choices = [{ id: 'option', text: '合成' }];
    const baseLocator = {
      selectOption: () => Promise.resolve(),
      click: () => Promise.resolve(),
      waitFor: () => Promise.resolve(),
      innerText: () => Promise.resolve('123456'),
      locator: () => baseLocator,
      filter: () => baseLocator,
    };
    const presenter = {
      getByLabel: () => baseLocator,
      getByRole: (role: string, options: { name: string }) => {
        if (role === 'alertdialog') {
          expect(options.name).toBe('立即開始');
          expect(dialog).toBe(true);
          return {
            getByRole: (_role: string, child: { name: string }) => {
              expect(child.name).toBe('開始');
              return {
                click: () => {
                  opened = true;
                  return Promise.resolve();
                },
              };
            },
          };
        }
        return {
          ...baseLocator,
          click: () => {
            if (options.name === '開始遊戲') dialog = true;
            return Promise.resolve();
          },
        };
      },
    };
    const page = Object.assign(new EventEmitter(), {
      goto: () => Promise.resolve(),
      url: () => `http://127.0.0.1:58373/teacher/live/${sessionId}`,
      locator: () => baseLocator,
      getByRole: (role: string) =>
        role === 'region' ? presenter : baseLocator,
    }) as unknown as Page;
    const makeClient = (outside = false) =>
      ({
        auth: {
          getUser: () =>
            Promise.resolve({ data: { user: { id: 'teacher' } }, error: null }),
        },
        from: (table: string) => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          abortSignal: vi.fn().mockReturnThis(),
          retry: vi.fn().mockReturnThis(),
          single: () =>
            Promise.resolve({
              data:
                table === 'live_sessions'
                  ? {
                      id: sessionId,
                      host_teacher_id: 'teacher',
                      classroom_id: 'classroom',
                      live_activity_id: 'activity',
                      question_count: 20,
                    }
                  : {
                      id: 'activity',
                      owner_teacher_id: 'teacher',
                      section_id: 'section',
                      quiz_template_id: 'template',
                    },
              error: null,
            }),
        }),
        channel: () => {
          const channel = {
            on: vi.fn().mockReturnThis(),
            subscribe: (cb: (status: string, error?: Error) => void) => {
              cb(
                outside ? 'CHANNEL_ERROR' : 'SUBSCRIBED',
                outside
                  ? new Error(
                      'Unauthorized: You do not have permissions to read from this Channel topic: synthetic',
                    )
                  : undefined,
              );
              return channel;
            },
          };
          return channel;
        },
        removeChannel: () => Promise.resolve('ok'),
      }) as unknown as SupabaseClient<Database>;
    const host = makeClient(),
      outside = makeClient(true),
      member1 = makeClient(),
      member2 = makeClient();
    vi.spyOn(liveApi, 'createLiveRepository').mockImplementation(
      (client) =>
        ({
          listSectionOptions: () =>
            Promise.resolve([
              { sectionId: 'section', quizTemplateId: 'template' },
            ]),
          join: () =>
            client === outside
              ? Promise.reject(new LiveRepositoryError('JOIN_INVALID_CODE'))
              : Promise.resolve({ sessionId }),
          getState: () => {
            if (client === outside)
              return Promise.reject(new LiveRepositoryError('NOT_FOUND'));
            if (answering && !opened)
              return Promise.reject(new Error('SYNTHETIC_START_NOT_CONFIRMED'));
            return Promise.resolve({
              sessionId,
              state: opened ? 'question_open' : 'lobby',
              currentPosition: 1,
              questionCount: 20,
              participantCount: 2,
              isHost: client === host,
              stateVersion: 1,
              question: {
                questionId: 'question',
                prompt: '合成題目',
                publicOptions: choices,
              },
            });
          },
        }) as unknown as LiveRepository,
    );
    vi.spyOn(browserHelper, 'attachDiagnostics').mockResolvedValue({
      consoleErrors: [],
      pageErrors: [],
      serverErrors: [],
      waitForSubscriptionAck: () => Promise.resolve(true),
    } as unknown as Awaited<
      ReturnType<typeof browserHelper.attachDiagnostics>
    >);
    vi.spyOn(browserHelper, 'joinLiveThroughUi').mockResolvedValue([
      { outcome: 'connected', durationMs: 1, lobbyMs: 1, realtimeMs: 1 },
    ]);
    const measure = vi.fn(() =>
      Promise.reject(new Error('SYNTHETIC_STOP_AFTER_START')),
    );
    const writes: { name: string; value: unknown }[] = [];
    const actors = [host, member1, member2].map((client, actorIndex) => ({
      client,
      actorIndex,
      page,
      measure,
    }));
    const capacity = await capacityFixture();
    await expect(
      runCapacityLiveGame(
        parseCapacityScope(capacity.input, capacity.proof),
        actors,
        { client: outside, actorIndex: 3, measure },
        'classroom',
        {
          directory: 'synthetic',
          write: (name, value) => {
            writes.push({ name, value });
            if (name === 'live-question-1-intent') answering = true;
            return Promise.resolve();
          },
        },
        new AbortController().signal,
      ),
    ).rejects.toThrow('CAPACITY_EVIDENCE_INVALID');
    expect(opened).toBe(true);
    expect(measure).toHaveBeenCalledTimes(2);
    expect(writes).toContainEqual({
      name: 'live-question-1-intent',
      value: { sessionId, position: 1, questionCount: 20 },
    });
  });
});
