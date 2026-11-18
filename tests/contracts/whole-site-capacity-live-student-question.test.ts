import {
  capacityLiveStudentQuestion,
  waitCapacityLiveStudentPrompt,
  waitCapacityLiveStudentOptions,
} from '../../scripts/concurrency/capacity-live-student-question';
import type { Locator } from '@playwright/test';
import { EventEmitter } from 'node:events';
import { afterEach, expect, it, vi } from 'vitest';
import type { Page } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../src/types/database';
import type {
  LiveRepository,
  LiveSessionState,
} from '../../src/features/live/types';
import { LiveRepositoryError } from '../../src/features/live/types';
import * as liveApi from '../../src/features/live/api/live-repository';
import * as browserApi from '../e2e/helpers/staging-capacity-browser';
import {
  runCapacityLiveGame,
  type CapacityGameActor,
} from '../../scripts/concurrency/capacity-live-game';
import { parseCapacityScope } from '../../scripts/concurrency/capacity-scope';
import { capacityFixture } from './helpers/whole-site-capacity';
const countTimeouts = vi.hoisted(() => [] as number[]);
afterEach(() => {
  vi.restoreAllMocks();
  countTimeouts.length = 0;
});
const sessionId = '11000000-0000-4000-8000-000000000001';
const options = [
  { id: 'option-a', key: 'A', sortOrder: 1 },
  { id: 'option-b', key: 'B', sortOrder: 2 },
];
const studentState = (
  mode: 'device' | 'screen_only' = 'screen_only',
): LiveSessionState => ({
  sessionId,
  state: 'question_open',
  stateVersion: 1,
  currentPosition: 1,
  questionCount: 20,
  participantCount: 2,
  rulesVersion: 'synthetic',
  questionDisplay: mode,
  serverTime: '2026-11-18T00:00:00Z',
  isHost: false,
  question: {
    questionId: 'question',
    position: 1,
    openedAt: null,
    deadlineAt: null,
    ...(mode === 'device' ? { prompt: '合成題目' } : {}),
    publicOptions: options.map((o) => ({
      ...o,
      ...(mode === 'device' ? { text: o.key } : {}),
    })),
  },
});
const caller = async (
  ui: boolean,
  mode: 'screen_only' | 'device' = 'screen_only',
  hiddenText?: string,
) => {
  const f = await capacityFixture(),
    scope = parseCapacityScope(f.input, f.proof);
  let position = 0,
    answers = 0,
    completed = false;
  const writes = new Map<string, unknown>(),
    trace: string[] = [];
  const clients = Array.from(
    { length: 4 },
    (_, index) =>
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
              error: null,
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
            }),
        }),
        channel: () => {
          const channel = {
            on: vi.fn().mockReturnThis(),
            subscribe: (fn: (status: string, error?: Error) => void) => {
              fn(
                index === 3 ? 'CHANNEL_ERROR' : 'SUBSCRIBED',
                index === 3 ? Error('Unauthorized') : undefined,
              );
            },
          };
          return channel;
        },
        removeChannel: () => Promise.resolve('ok'),
      }) as unknown as SupabaseClient<Database>,
  );
  const host = clients[0],
    outside = clients[3];
  if (!host || !outside) throw Error('SYNTHETIC_CLIENT');
  vi.spyOn(liveApi, 'createLiveRepository').mockImplementation(
    (client) =>
      ({
        listSectionOptions: () =>
          Promise.resolve([
            { sectionId: 'section', quizTemplateId: 'template' },
          ]),
        createActivity: () => Promise.resolve({ activityId: 'activity' }),
        createSession: () =>
          Promise.resolve({ sessionId, joinCode: '123456', stateVersion: 1 }),
        startSession: () => Promise.resolve(),
        join: () =>
          client === outside
            ? Promise.reject(new LiveRepositoryError('JOIN_INVALID_CODE'))
            : Promise.resolve({ sessionId }),
        getState: () =>
          client === outside
            ? Promise.reject(new LiveRepositoryError('NOT_FOUND'))
            : Promise.resolve({
                ...studentState(mode),
                isHost: client === host,
                currentPosition: position,
                state: completed
                  ? 'completed'
                  : position === 0
                    ? 'lobby'
                    : client === host && answers === 2
                      ? 'question_feedback'
                      : 'question_open',
                question: {
                  ...studentState(client === host ? 'device' : mode).question,
                  position,
                },
                answeredCount: answers,
              }),
        openQuestion: () => {
          position = 1;
          return Promise.resolve();
        },
        submitAnswer: () => {
          trace.push('API_SUBMIT');
          answers++;
          return Promise.resolve();
        },
        advance: () => {
          position++;
          answers = 0;
          return Promise.resolve();
        },
        finalize: () => {
          completed = true;
          return Promise.resolve();
        },
        getSessionDetail: () =>
          Promise.resolve({
            sessionId,
            classroomId: 'classroom',
            completedAt: '2026-11-18T00:00:00Z',
            activity: { quizTemplateId: 'template' },
            participants: Array.from({ length: 2 }, () => ({
              answers: Array(20).fill(null),
            })),
            questions: Array.from({ length: 20 }, () => ({ answered: 2 })),
          }),
      }) as unknown as LiveRepository,
  );
  const page = () => {
    const locator = (label: string) => ({
      first: () => locator(label),
      nth: () => locator(label),
      getByRole: () => locator(label),
      count: () => Promise.resolve(2),
      waitFor: () => {
        trace.push(label);
        if (position === 1 && label === hiddenText)
          return Promise.reject(Error('SYNTHETIC_WRONG_TEXT'));
        return Promise.resolve();
      },
      click: () => {
        trace.push('UI_CLICK');
        answers++;
        return Promise.resolve();
      },
    });
    return Object.assign(new EventEmitter(), {
      getByText: (text: string) => locator(text),
      getByRole: () => locator('OPTIONS'),
      waitForResponse: (predicate: (v: unknown) => boolean) => {
        trace.push('RESPONSE_ARM');
        const response = {
          url: () => scope.supabaseUrl + '/rest/v1/rpc/submit_live_answer',
          request: () => ({ method: () => 'POST' }),
          ok: () => true,
          finished: () => Promise.resolve(null),
        };
        expect(predicate(response)).toBe(true);
        return Promise.resolve(response);
      },
    }) as unknown as Page;
  };
  if (ui) {
    vi.spyOn(browserApi, 'attachDiagnostics').mockResolvedValue({
      consoleErrors: [],
      pageErrors: [],
      serverErrors: [],
      dispose: () => Promise.resolve(),
      waitForSubscriptionAck: () => Promise.resolve(true),
    } as unknown as Awaited<ReturnType<typeof browserApi.attachDiagnostics>>);
    vi.spyOn(browserApi, 'joinLiveThroughUi').mockResolvedValue([
      { outcome: 'connected', durationMs: 1, lobbyMs: 1, realtimeMs: 1 },
    ]);
  }
  const actors: CapacityGameActor[] = clients
    .slice(0, 3)
    .map((client, actorIndex) => ({
      client,
      actorIndex,
      ...(ui && actorIndex > 0 ? { page: page() } : {}),
      measure: (_op, _cache, action) => action(),
    }));
  const outsider: CapacityGameActor = {
    client: outside,
    actorIndex: 3,
    measure: (_op, _cache, action) => action(),
  };
  const run = () =>
    runCapacityLiveGame(
      scope,
      actors,
      outsider,
      'classroom',
      {
        directory: 'SYNTHETIC_PRIVATE',
        write: (name, value) => {
          writes.set(name, value);
          return Promise.resolve();
        },
      },
      new AbortController().signal,
    );
  return { run, writes, trace };
};
it.each([false, true])(
  'actual caller completes20 screen_only rounds without student prompt/text, page-backed=%s',
  async (ui) => {
    const h = await caller(ui);
    await expect(h.run()).resolves.toMatchObject({
      questions: 20,
      participants: 2,
      reportConfirmed: true,
    });
    expect(
      h.trace.filter((v) => v === (ui ? 'UI_CLICK' : 'API_SUBMIT')),
    ).toHaveLength(40);
    expect(
      h.trace.filter((v) => v === (ui ? 'API_SUBMIT' : 'UI_CLICK')),
    ).toHaveLength(0);
    if (ui) {
      expect(h.trace.filter((v) => v === '請看投影幕作答')).toHaveLength(40);
      expect(h.trace.filter((v) => v === 'RESPONSE_ARM')).toHaveLength(40);
    }
    expect(h.writes.get('capacity-live-diagnostics')).toMatchObject({
      firstFailure: null,
    });
  },
);
vi.mock('@playwright/test', async (original) => ({
  ...(await original<typeof import('@playwright/test')>()),
  expect: (locator: {
    waitFor(options: unknown): Promise<void>;
    count(): Promise<number>;
  }) => ({
    toBeVisible: (options?: unknown) => locator.waitFor(options),
    toHaveCount: async (value: number, options: { timeout: number }) => {
      countTimeouts.push(options.timeout);
      expect(await locator.count()).toBe(value);
    },
  }),
}));
it.each([false, true])(
  'device original prompt path completes20 rounds; page-backed=%s',
  async (ui) => {
    const h = await caller(ui, 'device');
    await expect(h.run()).resolves.toMatchObject({
      questions: 20,
      reportConfirmed: true,
    });
    expect(
      h.trace.filter((v) => v === (ui ? 'UI_CLICK' : 'API_SUBMIT')),
    ).toHaveLength(40);
    if (ui) expect(h.trace.filter((v) => v === '合成題目')).toHaveLength(40);
  },
);
const baseState = studentState();
const baseQuestion = baseState.question;
if (!baseQuestion) throw Error('SYNTHETIC_QUESTION');
const changedQuestion = (
  patch: Partial<NonNullable<LiveSessionState['question']>>,
) => ({ ...baseState, question: { ...baseQuestion, ...patch } });
const invalidStates: Record<string, unknown> = {
  'missing-mode': { ...baseState, questionDisplay: undefined },
  'unknown-mode': { ...baseState, questionDisplay: 'UNKNOWN' },
  'device-missing-prompt': { ...baseState, questionDisplay: 'device' },
  'screen-prompt-leak': changedQuestion({ prompt: 'SYNTHETIC_PRIVATE' }),
  'screen-option-text-leak': changedQuestion({
    publicOptions: options.map((o) => ({ ...o, text: 'SYNTHETIC_PRIVATE' })),
  }),
  'missing-question': { ...baseState, question: undefined },
  'null-question': { ...baseState, question: null },
  'waiting-room': { ...baseState, waitingForNext: true },
  host: { ...baseState, isHost: true },
  'missing-host': { ...baseState, isHost: undefined },
  feedback: { ...baseState, state: 'question_feedback' },
  'wrong-position': { ...baseState, currentPosition: 2 },
  'wrong-question-position': changedQuestion({ position: 2 }),
  'wrong-count': { ...baseState, questionCount: 19 },
  'no-options': changedQuestion({ publicOptions: [] }),
  'one-option': changedQuestion({ publicOptions: options.slice(0, 1) }),
  'duplicate-option': changedQuestion({
    publicOptions: [...options.slice(0, 1), ...options.slice(0, 1)],
  }),
  'empty-option-id': changedQuestion({
    publicOptions: options.map((o, i) => (i === 0 ? { ...o, id: '' } : o)),
  }),
};
it.each(Object.entries(invalidStates))(
  'pure state rejects %s before producing any UI target',
  (_name, state) => {
    expect(() =>
      capacityLiveStudentQuestion(state as LiveSessionState, 1, 20),
    ).toThrow('CAPACITY_EVIDENCE_INVALID');
  },
);
it.each([
  [0, 20],
  [1, 0],
  [1, 21],
  [21, 20],
  [NaN, 20],
])('rejects invalid bound position/count %s/%s', (position, count) => {
  expect(() =>
    capacityLiveStudentQuestion(studentState(), position, count),
  ).toThrow();
});
it('mode-specific targets derive from public state only and do not mutate filtered payload', () => {
  const s = studentState(),
    before = JSON.stringify(s);
  expect(capacityLiveStudentQuestion(s, 1, 20)).toMatchObject({
    displayText: '請看投影幕作答',
    counterText: '第 1 / 20 題',
  });
  expect(JSON.stringify(s)).toBe(before);
  expect(
    capacityLiveStudentQuestion(studentState('device'), 1, 20).displayText,
  ).toBe('合成題目');
});
const uiFixture = () => {
  let at = 0;
  const stop = new AbortController();
  const visible = vi.fn<(options?: { timeout?: number }) => Promise<void>>(() =>
    Promise.resolve(),
  );
  const count = vi.fn(() => Promise.resolve(2));
  const locator = { first: vi.fn().mockReturnThis(), waitFor: visible, count };
  const getByText = vi.fn(() => locator);
  const page = { getByText } as unknown as Page;
  return {
    stop,
    visible,
    count,
    getByText,
    page,
    buttons: locator as unknown as Locator,
    now: () => at,
    set: (value: number) => {
      at = value;
    },
  };
};
it('counter and mode text share20s without renewing the second wait', async () => {
  const h = uiFixture();
  h.visible.mockImplementationOnce(() => {
    h.set(19999);
    return Promise.resolve();
  });
  await waitCapacityLiveStudentPrompt(
    h.page,
    capacityLiveStudentQuestion(studentState(), 1, 20),
    h.stop.signal,
    h.now,
  );
  expect(h.visible.mock.calls.map(([o]) => o?.timeout)).toEqual([20000, 1]);
  expect(h.getByText).toHaveBeenNthCalledWith(1, '第 1 / 20 題', {
    exact: false,
  });
  expect(h.getByText).toHaveBeenNthCalledWith(2, '請看投影幕作答', {
    exact: true,
  });
});
it.each(['expired', 'backward', 'nonfinite', 'abort'] as const)(
  '%s between readiness checks cannot reach a second wait',
  async (mode) => {
    const h = uiFixture();
    h.visible.mockImplementationOnce(() => {
      if (mode === 'abort') h.stop.abort();
      else h.set(mode === 'expired' ? 20000 : mode === 'backward' ? -1 : NaN);
      return Promise.resolve();
    });
    await expect(
      waitCapacityLiveStudentPrompt(
        h.page,
        capacityLiveStudentQuestion(studentState(), 1, 20),
        h.stop.signal,
        h.now,
      ),
    ).rejects.toThrow();
    expect(h.visible).toHaveBeenCalledOnce();
  },
);
it('first option visibility and count share the same remaining deadline', async () => {
  const h = uiFixture();
  h.visible.mockImplementationOnce(() => {
    h.set(17000);
    return Promise.resolve();
  });
  await waitCapacityLiveStudentOptions(h.buttons, 2, h.stop.signal, h.now);
  expect(h.visible.mock.calls[0]?.[0]?.timeout).toBe(20000);
  expect(countTimeouts).toEqual([3000]);
});
it('count mismatch rejects and never acquires another20s budget', async () => {
  const h = uiFixture();
  h.count.mockResolvedValue(3);
  await expect(
    waitCapacityLiveStudentOptions(h.buttons, 2, h.stop.signal, h.now),
  ).rejects.toThrow();
  expect(h.visible).toHaveBeenCalledOnce();
  expect(countTimeouts).toEqual([20000]);
});
it('an originally thrown locator error retains identity', async () => {
  const h = uiFixture(),
    sentinel = Error('SYNTHETIC_LOCATOR');
  h.visible.mockRejectedValue(sentinel);
  await expect(
    waitCapacityLiveStudentPrompt(
      h.page,
      capacityLiveStudentQuestion(studentState(), 1, 20),
      h.stop.signal,
      h.now,
    ),
  ).rejects.toBe(sentinel);
  expect(h.visible).toHaveBeenCalledOnce();
});

it.each([
  ['screen_only', '第 1 / 20 題'],
  ['screen_only', '請看投影幕作答'],
  ['device', '合成題目'],
] as const)(
  'actual caller rejects missing %s text %s before any dispatch',
  async (mode, hidden) => {
    const h = await caller(true, mode, hidden);
    await expect(h.run()).rejects.toThrow();
    for (const marker of ['UI_CLICK', 'API_SUBMIT', 'RESPONSE_ARM'])
      expect(h.trace.filter((v) => v === marker)).toHaveLength(0);
    expect(h.writes.get('capacity-live-diagnostics')).toMatchObject({
      firstFailure: { stage: 'PROMPT_VISIBLE' },
    });
    expect(countTimeouts).toEqual([]);
  },
);
