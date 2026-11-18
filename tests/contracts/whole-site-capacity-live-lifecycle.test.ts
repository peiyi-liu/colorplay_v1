import { expect, it, vi, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../src/types/database';
import { EventEmitter } from 'node:events';
import type { Page } from '@playwright/test';
import * as gateApi from '../../scripts/concurrency/capacity-live-gate';
import * as browserApi from '../e2e/helpers/staging-capacity-browser';
import { emptyBrowserJoinSnapshot } from '../e2e/helpers/live-browser-join-diagnostics';
import type { CapacityGameActor } from '../../scripts/concurrency/capacity-live-game';
import type { LiveRepository } from '../../src/features/live/types';
import * as liveApi from '../../src/features/live/api/live-repository';
import { LiveRepositoryError } from '../../src/features/live/types';
import { runCapacityLiveGame } from '../../scripts/concurrency/capacity-live-game';
import { parseCapacityScope } from '../../scripts/concurrency/capacity-scope';
import { capacityFixture } from './helpers/whole-site-capacity';
afterEach(() => vi.restoreAllMocks());

const lifecycle = async (
  failure: string | null = null,
  ui = false,
  questions = 2,
) => {
  const f = await capacityFixture(),
    scope = parseCapacityScope(f.input, f.proof);
  const trace: string[] = [],
    writes = new Map<string, unknown>();
  const sentinel = new Error('SYNTHETIC_PRIVATE_OPERATION'),
    cleanupError = new TypeError('SYNTHETIC_PRIVATE_CLEANUP');
  let position = 0,
    answered = 0,
    completed = false,
    hostReads = 0;
  const hit = (stage: string) => {
    trace.push(stage);
    if (failure === stage) throw sentinel;
  };
  const users = Array.from(
    { length: 4 },
    (_, actor) =>
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
          single: () => {
            hit('BIND_SESSION');
            return Promise.resolve({
              data:
                table === 'live_sessions'
                  ? {
                      id: '11000000-0000-4000-8000-000000000001',
                      host_teacher_id: 'teacher',
                      classroom_id: 'synthetic',
                      live_activity_id: 'activity',
                      question_count: questions,
                    }
                  : {
                      id: 'activity',
                      owner_teacher_id: 'teacher',
                      section_id: 'section',
                      quiz_template_id: 'template',
                    },
              error: null,
            });
          },
        }),
        channel: () => {
          hit(
            actor === 3
              ? 'OUTSIDER_REFUSAL'
              : actor === 0
                ? 'HOST_SUBSCRIBE'
                : 'STUDENT_SUBSCRIBE',
          );
          const channel = {
            on: vi.fn().mockReturnThis(),
            subscribe: (callback: (status: string, error?: Error) => void) => {
              callback(
                actor === 3 ? 'CHANNEL_ERROR' : 'SUBSCRIBED',
                actor === 3
                  ? new Error(
                      failure === 'UNKNOWN_REFUSAL'
                        ? 'SYNTHETIC'
                        : 'Unauthorized: You do not have permissions to read from this Channel topic: synthetic',
                    )
                  : undefined,
              );
              return channel;
            },
          };
          return channel;
        },
        removeChannel: () => {
          hit('REMOVE_CHANNEL');
          return Promise.resolve(failure === 'BAD_REMOVE' ? 'error' : 'ok');
        },
      }) as unknown as SupabaseClient<Database>,
  );
  const outside = users[3] ?? users[0];
  if (!outside) throw Error('FIXTURE');
  const sessionId = '11000000-0000-4000-8000-000000000001';
  const state = (host: boolean) => ({
    sessionId,
    state: completed
      ? 'completed'
      : position === 0
        ? 'lobby'
        : host
          ? 'question_feedback'
          : 'question_open',
    currentPosition: position,
    questionCount: questions,
    participantCount: failure === 'PARTICIPANT_COUNT' ? 1 : 2,
    answeredCount: answered,
    isHost: host,
    questionDisplay: 'device',
    stateVersion: 1,
    question: {
      questionId: 'question',
      position,
      prompt: '合成題目',
      publicOptions: [
        { id: 'option', text: '合成' },
        { id: 'other-option', text: '合成二' },
      ],
    },
  });
  vi.spyOn(liveApi, 'createLiveRepository').mockImplementation(
    (client) =>
      ({
        listSectionOptions: () => {
          hit('SELECT_OPTIONS');
          return Promise.resolve([
            { sectionId: 'section', quizTemplateId: 'template' },
          ]);
        },
        createActivity: () => {
          hit('CREATE_ACTIVITY');
          return Promise.resolve({ activityId: 'activity' });
        },
        createSession: () => {
          hit('CREATE_SESSION');
          return Promise.resolve({
            sessionId,
            joinCode: '123456',
            stateVersion: 1,
          });
        },
        startSession: () => {
          hit('START_SESSION');
          return Promise.resolve();
        },
        join: () => {
          hit(client === outside ? 'OUTSIDER_JOIN' : 'STUDENT_API_JOIN');
          return client === outside
            ? Promise.reject(new LiveRepositoryError('JOIN_INVALID_CODE'))
            : Promise.resolve({ sessionId });
        },
        getState: () => {
          if (client === outside) {
            hit('OUTSIDER_STATE');
            return Promise.reject(new LiveRepositoryError('NOT_FOUND'));
          }
          const host = client === users[0];
          hit(
            position === 0
              ? 'LOBBY_STATE'
              : completed
                ? 'COMPLETED_STATE'
                : host
                  ? hostReads++ % 2 === 0
                    ? 'FEEDBACK_STATE'
                    : 'ADVANCE_STATE'
                  : 'QUESTION_STATE',
          );
          return Promise.resolve(state(host));
        },
        openQuestion: () => {
          hit('OPEN_QUESTION');
          position = 1;
          return Promise.resolve();
        },
        submitAnswer: () => {
          hit('ANSWER_API');
          answered++;
          return Promise.resolve();
        },
        advance: () => {
          hit('ADVANCE_API');
          position++;
          answered = 0;
          return Promise.resolve();
        },
        finalize: () => {
          hit('FINALIZE_API');
          completed = true;
          return Promise.resolve();
        },
        getSessionDetail: () => {
          hit('REPORT_RPC');
          return Promise.resolve({
            sessionId,
            classroomId: 'synthetic',
            completedAt:
              failure === 'REPORT_VALIDATE' ? null : '2026-11-18T00:00:00Z',
            activity: { quizTemplateId: 'template' },
            participants: Array.from({ length: 2 }, () => ({
              answers: Array(questions).fill(null),
            })),
            questions: Array.from({ length: questions }, () => ({
              answered: 2,
            })),
          });
        },
      }) as unknown as LiveRepository,
  );
  const original = gateApi.createCapacityLiveGate;
  vi.spyOn(gateApi, 'createCapacityLiveGate').mockImplementation((...args) => {
    const gate = original(...args);
    return {
      ...gate,
      close: () => {
        trace.push('GATE_CLOSE');
        if (failure === 'CLEANUP_OVERRIDE') throw cleanupError;
        gate.close();
      },
    };
  });
  const labels: Record<string, string> = {
    'Live 投影模式': 'HOST_READY',
    '1・選擇班級': 'HOST_CLASSROOM',
    選擇小節: 'HOST_TEMPLATE',
    建立課堂: 'HOST_CREATE',
    開始遊戲: 'START_CLICK',
    立即開始: 'START_CONFIRM',
    開始: 'START_CONFIRM',
    即時排名: 'RANKING_CLICK',
    結算成績: 'NEXT_CLICK',
    下一題: 'NEXT_CLICK',
    本題解析: 'FEEDBACK_VISIBLE',
    'Live 課程報表': 'REPORT_VISIBLE',
    答案選項: 'OPTIONS_VISIBLE',
  };
  const pages = ui
    ? users.slice(0, 3).map((_client, actor) => {
        const locator = (stage: string): object => {
          const self = {
            locator: () => locator('HOST_TEMPLATE'),
            filter: () => self,
            first: () => self,
            nth: () => self,
            count: () => Promise.resolve(2),
            getByRole: (_role: string, option?: { name?: string }) =>
              locator(labels[option?.name ?? ''] ?? stage),
            getByLabel: () => locator('HOST_CODE'),
            selectOption: () => {
              hit('HOST_CLASSROOM');
              return Promise.resolve();
            },
            innerText: () => {
              hit('HOST_CODE');
              return Promise.resolve('123456');
            },
            waitFor: () => {
              hit(stage === 'START_CLICK' ? 'HOST_READY' : stage);
              return Promise.resolve();
            },
            click: () => {
              hit(actor === 0 ? stage : 'ANSWER_CLICK');
              if (actor > 0) answered++;
              if (stage === 'START_CONFIRM') position = 1;
              if (stage === 'NEXT_CLICK') {
                if (position === questions) completed = true;
                else {
                  position++;
                  answered = 0;
                }
              }
              return Promise.resolve();
            },
          };
          return self;
        };
        const page = Object.assign(new EventEmitter(), {
          goto: (path: string) => {
            hit(path.endsWith('/report') ? 'REPORT_NAVIGATE' : 'HOST_NAVIGATE');
            return Promise.resolve();
          },
          url: () => `http://127.0.0.1:58373/teacher/live/${sessionId}`,
          getByRole: (_role: string, option?: { name?: string }) =>
            locator(labels[option?.name ?? ''] ?? 'OPTIONS_VISIBLE'),
          getByText: () => locator('PROMPT_VISIBLE'),
          locator: () => locator('HOST_TEMPLATE'),
          waitForResponse: (predicate: (response: unknown) => boolean) => {
            hit('ANSWER_RESPONSE');
            const response = {
              url: () => scope.supabaseUrl + '/rest/v1/rpc/submit_live_answer',
              request: () => ({ method: () => 'POST' }),
              ok: () => true,
              finished: () => {
                hit('ANSWER_FINISHED');
                return Promise.resolve(null);
              },
            };
            expect(predicate(response)).toBe(true);
            return Promise.resolve(response);
          },
        });
        return page as unknown as Page;
      })
    : [];
  if (ui) {
    vi.spyOn(browserApi, 'attachDiagnostics').mockImplementation(() =>
      Promise.resolve({
        consoleErrors: [],
        pageErrors: [],
        serverErrors: [],
        waitForSubscriptionAck: () => {
          hit('SUBSCRIPTION_ACK');
          return Promise.resolve(true);
        },
      } as unknown as Awaited<ReturnType<typeof browserApi.attachDiagnostics>>),
    );
    vi.spyOn(browserApi, 'joinLiveThroughUi').mockImplementation(
      (_pages, _code, options) => {
        hit('STUDENT_JOIN');
        const actorIndex = options?.actorIndex ?? 1;
        options?.observe?.({
          ...emptyBrowserJoinSnapshot(actorIndex),
          outcome: 'connected',
        });
        return Promise.resolve([
          { outcome: 'connected', durationMs: 1, lobbyMs: 1, realtimeMs: 1 },
        ]);
      },
    );
  }
  const actors: CapacityGameActor[] = users
    .slice(0, 3)
    .map((client, actorIndex) => ({
      client,
      actorIndex,
      ...(pages[actorIndex] ? { page: pages[actorIndex] } : {}),
      measure: (_op, _cache, action) => {
        hit('ANSWER_MEASURE');
        return action();
      },
    }));
  const outsider: CapacityGameActor = {
    client: outside,
    actorIndex: 3,
    measure: (_op, _cache, action) => action(),
  };
  const write = (name: string, value: unknown) => {
    const stage =
      name === 'live-create-intent'
        ? 'CREATE_INTENT'
        : name === 'live-created'
          ? 'CREATED_WRITE'
          : name.endsWith('-intent')
            ? 'QUESTION_INTENT'
            : name.endsWith('-confirmed')
              ? 'QUESTION_CONFIRMED'
              : 'DIAGNOSTIC_WRITE';
    hit(stage);
    writes.set(name, value);
    return Promise.resolve();
  };
  return {
    writes,
    trace,
    sentinel,
    cleanupError,
    run: () =>
      runCapacityLiveGame(
        scope,
        actors,
        outsider,
        'synthetic',
        { directory: 'synthetic', write },
        new AbortController().signal,
      ),
  };
};

it.each([
  'SELECT_OPTIONS',
  'CREATE_INTENT',
  'CREATE_ACTIVITY',
  'CREATE_SESSION',
  'START_SESSION',
  'HOST_SUBSCRIBE',
  'CREATED_WRITE',
  'OUTSIDER_JOIN',
  'OUTSIDER_STATE',
  'OUTSIDER_REFUSAL',
  'LOBBY_STATE',
  'BIND_SESSION',
  'PARTICIPANT_COUNT',
  'OPEN_QUESTION',
  'QUESTION_INTENT',
  'QUESTION_CONFIRMED',
  'FEEDBACK_STATE',
  'ADVANCE_STATE',
  'ADVANCE_API',
  'FINALIZE_API',
  'COMPLETED_STATE',
  'REPORT_RPC',
  'REPORT_VALIDATE',
])(
  'actual protocol caller records the failed %s phase without adding business actions',
  async (stage) => {
    const f = await lifecycle(stage);
    await expect(f.run()).rejects.toBeDefined();
    const snapshot = f.writes.get('capacity-live-diagnostics');
    expect(snapshot).toMatchObject({
      authority: 'NON_AUTHORITY',
      firstFailure: { stage },
    });
    expect(f.trace.filter((x) => x === 'DIAGNOSTIC_WRITE')).toHaveLength(1);
    expect(JSON.stringify(snapshot)).not.toContain('SYNTHETIC_PRIVATE');
  },
);
it.each([
  'STUDENT_API_JOIN',
  'STUDENT_SUBSCRIBE',
  'QUESTION_STATE',
  'ANSWER_MEASURE',
  'ANSWER_API',
])(
  'parallel actor %s failures retain both settled actors and the original batch rejection',
  async (stage) => {
    const f = await lifecycle(stage);
    await expect(f.run()).rejects.toThrow('CAPACITY_EVIDENCE_INVALID');
    expect(f.trace.filter((x) => x === stage)).toHaveLength(2);
    expect(f.writes.get('capacity-live-diagnostics')).toMatchObject({
      firstFailure: { stage },
    });
  },
);
it('complete protocol success keeps all20 questions and original counts; diagnostic writer cannot replace success', async () => {
  const f = await lifecycle(null, false, 20);
  await expect(f.run()).resolves.toEqual({
    questions: 20,
    participants: 2,
    outsiderDenied: true,
    reportConfirmed: true,
  });
  expect(f.trace.filter((x) => x === 'ANSWER_API')).toHaveLength(40);
  expect(f.trace.filter((x) => x === 'ADVANCE_API')).toHaveLength(19);
  expect(f.trace.filter((x) => x === 'GATE_CLOSE')).toHaveLength(4);
  expect(f.trace.at(-1)).toBe('DIAGNOSTIC_WRITE');
  expect(f.writes.get('capacity-live-diagnostics')).toMatchObject({
    firstFailure: null,
    firstCleanupFailure: null,
    collection: 'PARTIAL',
  });
  vi.restoreAllMocks();
  const g = await lifecycle('DIAGNOSTIC_WRITE');
  await expect(g.run()).resolves.toMatchObject({ reportConfirmed: true });
});
it('original cleanup exception still overrides the original operation error and both are persisted', async () => {
  const f = await lifecycle('CLEANUP_OVERRIDE');
  vi.spyOn(liveApi, 'createLiveRepository').mockReturnValue({
    listSectionOptions: () => Promise.reject(f.sentinel),
  } as unknown as LiveRepository);
  await expect(f.run()).rejects.toBe(f.cleanupError);
  expect(f.writes.get('capacity-live-diagnostics')).toMatchObject({
    firstFailure: { stage: 'SELECT_OPTIONS' },
    firstCleanupFailure: { stage: 'GATE_CLOSE', errorClass: 'TYPE_ERROR' },
  });
  expect(f.trace.filter((x) => x === 'GATE_CLOSE')).toHaveLength(1);
});
it.each([
  'HOST_NAVIGATE',
  'HOST_CLASSROOM',
  'HOST_TEMPLATE',
  'HOST_CREATE',
  'HOST_READY',
  'HOST_CODE',
  'STUDENT_JOIN',
  'START_CLICK',
  'START_CONFIRM',
  'ANSWER_RESPONSE',
  'ANSWER_FINISHED',
  'RANKING_CLICK',
  'NEXT_CLICK',
  'REPORT_NAVIGATE',
  'REPORT_VISIBLE',
])(
  'actual UI caller locates %s using fake public locators and preserves original rejection',
  async (stage) => {
    const f = await lifecycle(stage, true, 1);
    await expect(f.run()).rejects.toBeDefined();
    expect(f.writes.get('capacity-live-diagnostics')).toMatchObject({
      firstFailure: {
        stage: stage === 'STUDENT_JOIN' ? 'STUDENT_JOIN' : stage,
      },
    });
  },
);
it('actual UI completes a question with response arm before each trusted-UI action seam, without real browser/network', async () => {
  const f = await lifecycle(null, true, 1);
  await expect(f.run()).resolves.toMatchObject({
    questions: 1,
    reportConfirmed: true,
  });
  expect(f.trace.filter((x) => x === 'ANSWER_RESPONSE')).toHaveLength(2);
  expect(f.trace.filter((x) => x === 'ANSWER_CLICK')).toHaveLength(2);
  expect(f.trace.indexOf('ANSWER_RESPONSE')).toBeLessThan(
    f.trace.indexOf('ANSWER_CLICK'),
  );
  expect(f.trace.filter((x) => x === 'ANSWER_FINISHED')).toHaveLength(2);
});

vi.mock('@playwright/test', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@playwright/test')>();
  return {
    ...actual,
    expect: (locator: {
      waitFor: (options: unknown) => Promise<void>;
      count(): Promise<number>;
    }) => ({
      toBeVisible: (options?: unknown) => locator.waitFor(options),
      toHaveCount: async (value: number) => {
        expect(await locator.count()).toBe(value);
      },
    }),
  };
});
