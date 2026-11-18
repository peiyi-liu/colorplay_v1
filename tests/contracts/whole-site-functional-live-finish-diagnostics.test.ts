import { describe, expect, it, vi } from 'vitest';
import type { Page } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../src/types/database';
import type { FunctionalIdentities } from '../../scripts/concurrency/owned-fixtures';
import type { PrivateJournal } from '../../scripts/concurrency/private-journal';
import {
  syntheticScope,
  syntheticSecrets,
} from './helpers/whole-site-functional';
const h = vi.hoisted(() => ({
  position: 1,
  fail: '',
  cleanup: false,
  writes: new Map<string, unknown>(),
  actions: [] as string[],
}));
vi.mock('../../src/features/live/api/live-repository', () => ({
  createLiveRepository: () => ({
    listSectionOptions: () =>
      Promise.resolve([{ sectionId: 'section', quizTemplateId: 'template' }]),
    listMyActivities: () => Promise.resolve([]),
    getSessionDetail: () => {
      h.actions.push('REPORT_RPC');
      if (h.fail === 'REPORT_RPC')
        return Promise.reject(new Error('SYNTHETIC_PRIVATE'));
      return Promise.resolve({
        completedAt: h.fail !== 'REPORT_PREDICATE',
        sessionId: '10000000-0000-4000-8000-000000000001',
        classroomId: 'classroom',
        activity: { quizTemplateId: 'template' },
        participants: [0, 1].map(() => ({ answers: Array(20) })),
        questions: Array.from({ length: 20 }, () => ({ answered: 2 })),
      });
    },
  }),
}));
vi.mock('../../tests/e2e/helpers/staging-capacity-browser', () => ({
  joinLiveThroughUi: () => Promise.resolve([{ outcome: 'connected' }]),
}));
vi.mock('../../scripts/concurrency/teacher-live-bridge', () => ({
  liveFunctionalActor: () => ({
    evidence: { requests: 0 },
    actor: {
      proveOutsiderRefusal: () => Promise.resolve(),
      getState: () =>
        Promise.resolve({
          isHost: true,
          sessionId: '10000000-0000-4000-8000-000000000001',
          questionCount: 20,
          participantCount: 2,
        }),
      waitForState: (_id: string, predicate: (state: unknown) => boolean) => {
        for (const state of [
          'question_open',
          'question_feedback',
          'completed',
        ]) {
          const value = {
            state,
            currentPosition: h.position,
            questionCount: 20,
            answeredCount: 2,
            participantCount: 2,
            question: { publicOptions: [0, 1] },
          };
          if (predicate(value)) {
            if (state === 'completed') {
              h.actions.push('COMPLETED');
              if (h.fail === 'COMPLETED')
                return Promise.reject(new Error('SYNTHETIC_PRIVATE'));
            }
            return Promise.resolve(
              state === 'completed' && h.fail === 'COMPLETED_COUNT'
                ? { ...value, questionCount: 10 }
                : value,
            );
          }
        }
        return Promise.reject(new Error('SYNTHETIC_BAD_PREDICATE'));
      },
      getOutsiderDiagnostics: () => ({}),
      close: () => {
        h.actions.push('CLOSE');
        return h.cleanup
          ? Promise.reject(new Error('SYNTHETIC_CLEANUP'))
          : Promise.resolve();
      },
    },
  }),
  restoreFunctionalActor: () => Promise.resolve(),
  bindFunctionalLivePage: () =>
    Promise.resolve({
      diagnostics: {
        waitForSubscriptionAck: () => Promise.resolve(true),
        realtime: () =>
          Promise.resolve({ subscriptionStatusSequence: ['SUBSCRIBED'] }),
        consoleErrors: h.fail === 'HEALTH' ? ['SYNTHETIC_PRIVATE'] : [],
        pageErrors: [],
        serverErrors: [],
      },
      dispose: () => {
        h.actions.push('DISPOSE');
        if (h.fail === 'DISPOSE') throw new Error('SYNTHETIC_PRIVATE');
      },
    }),
}));
vi.mock('@playwright/test', async (load) => {
  const actual = await load<typeof import('@playwright/test')>();
  return {
    ...actual,
    expect: (value: { key?: string }) => ({
      toBeVisible: () =>
        h.position === 20 && h.fail && h.fail === value.key
          ? Promise.reject(new actual.errors.TimeoutError('SYNTHETIC_PRIVATE'))
          : Promise.resolve(),
      toBeEnabled: () =>
        h.position === 20 && h.fail === 'ACTION_ENABLED'
          ? Promise.reject(new actual.errors.TimeoutError('SYNTHETIC_PRIVATE'))
          : Promise.resolve(),
    }),
  };
});
import { createLiveDiagnostics } from '../../scripts/concurrency/functional-live-diagnostics';
import { runTeacherLiveJourney } from '../../scripts/concurrency/teacher-live';
const session = '10000000-0000-4000-8000-000000000001';
const fixture = () => {
  h.position = 1;
  h.fail = '';
  h.cleanup = false;
  h.writes.clear();
  h.actions = [];
  const locator = (key = ''): unknown => ({
    key,
    getByRole: (_role: string, options?: { name?: string }) =>
      locator(options?.name),
    getByLabel: () => locator(),
    getByText: () => locator(),
    locator: () => locator(),
    filter: () => locator(),
    first: () => locator(),
    nth: () => locator(),
    innerText: () => Promise.resolve('123456'),
    selectOption: () => Promise.resolve(),
    waitFor: () => Promise.resolve(),
    click: () => {
      h.actions.push(key);
      return h.position === 20 && h.fail && h.fail === key
        ? Promise.reject(new Error('SYNTHETIC_PRIVATE'))
        : Promise.resolve();
    },
  });
  const pages = [0, 1, 2].map(() => ({
    ...(locator() as object),
    goto: (url: string) => {
      const action = url.endsWith('/report') ? 'REPORT_GOTO' : 'PRESENTER_GOTO';
      h.actions.push(action);
      return h.fail === action
        ? Promise.reject(new Error('SYNTHETIC_PRIVATE'))
        : Promise.resolve();
    },
    url: () => `http://127.0.0.1:58373/teacher/live/${session}`,
    waitForResponse: () =>
      Promise.resolve({
        finished: () => Promise.resolve(null),
        ok: () => true,
        request: () => ({ timing: () => ({ responseEnd: 10 }) }),
      }),
  })) as unknown as [Page, Page, Page];
  const identities = Object.fromEntries(
    ['T1', 'S1', 'S2', 'R1'].map((label) => [
      label,
      { label, userId: 'teacher' },
    ]),
  ) as FunctionalIdentities;
  const client = {
    auth: {
      getUser: () =>
        Promise.resolve({ data: { user: { id: 'teacher' } }, error: null }),
    },
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        abortSignal: () => query,
        retry: () => query,
        single: () =>
          Promise.resolve({
            error: null,
            data:
              table === 'live_sessions'
                ? {
                    id: session,
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
      };
      return query;
    },
  } as unknown as SupabaseClient<Database>;
  const journal = {
    write: (name: string, value: unknown) => {
      if (
        (name === 'teacher-live-finish-diagnostics' && h.fail === 'WRITER') ||
        (name === 'teacher-live-completed' && h.fail === 'COMPLETE_JOURNAL')
      )
        return Promise.reject(new Error('SYNTHETIC_PRIVATE'));
      h.writes.set(name, value);
      const match = /^teacher-live-round-(\d+)-intent$/u.exec(name);
      if (match) h.position = Number(match[1]);
      return Promise.resolve();
    },
  } as unknown as PrivateJournal;
  return () =>
    runTeacherLiveJourney(
      pages,
      client,
      client,
      identities,
      syntheticScope(),
      syntheticSecrets,
      new AbortController().signal,
      journal,
      'classroom',
    );
};
describe('actual functional Live finish instrumentation', () => {
  it('preserves20rounds and records completed diagnostic after original cleanup', async () => {
    const run = fixture();
    const result = await run();
    expect(result.finalized).toBe(true);
    expect(h.writes.has('teacher-live-round-20-confirmed')).toBe(true);
    expect(h.actions.filter((a) => a === 'CLOSE')).toHaveLength(4);
    expect(h.writes.get('teacher-live-finish-diagnostics')).toMatchObject({
      authority: 'NON_AUTHORITY',
      collection: 'OBSERVED',
    });
  });
  it('keeps original failure and records operation plus cleanup independently', async () => {
    const run = fixture();
    h.fail = 'REPORT_RPC';
    h.cleanup = true;
    await expect(run()).rejects.toMatchObject({
      code: 'FUNCTIONAL_OPERATION_FAILED',
    });
    expect(h.writes.get('teacher-live-finish-diagnostics')).toMatchObject({
      operationFailure: { stage: 'REPORT_RPC' },
      cleanupFailure: { stage: 'ACTOR_CLOSE' },
    });
  });
  it.each([
    ['本題解析', 'ROUND_EXPLANATION'],
    ['即時排名', 'ROUND_RANKING'],
    ['ACTION_ENABLED', 'ROUND_ACTION_ENABLED'],
    ['結算成績', 'ROUND_ACTION_CLICK'],
    ['COMPLETED', 'COMPLETED_WAIT'],
    ['COMPLETED_COUNT', 'COMPLETED_COUNT'],
    ['REPORT_RPC', 'REPORT_RPC'],
    ['REPORT_PREDICATE', 'REPORT_PREDICATE'],
    ['REPORT_GOTO', 'REPORT_GOTO'],
    ['Live 課程報表', 'REPORT_HEADING'],
    ['HEALTH', 'HEALTH'],
    ['COMPLETE_JOURNAL', 'COMPLETE_JOURNAL'],
  ])(
    'captures actual tail stage %s without changing original rejection',
    async (mode, stage) => {
      const run = fixture();
      h.fail = mode;
      await expect(run()).rejects.toMatchObject({
        code: 'FUNCTIONAL_OPERATION_FAILED',
      });
      expect(h.writes.has('teacher-live-round-20-confirmed')).toBe(true);
      expect(h.writes.get('teacher-live-finish-diagnostics')).toMatchObject({
        operationFailure: { stage },
        cleanupFailure: null,
      });
      expect(h.actions.filter((a) => a === 'CLOSE')).toHaveLength(4);
      expect(
        JSON.stringify(h.writes.get('teacher-live-finish-diagnostics')),
      ).not.toContain('SYNTHETIC_PRIVATE');
    },
  );
  it.each(['actor', 'dispose'])(
    'keeps cleanup-only failure separate and preserves original cleanup sequence %s',
    async (kind) => {
      const run = fixture();
      h.cleanup = kind === 'actor';
      if (kind === 'dispose') h.fail = 'DISPOSE';
      await expect(run()).rejects.toMatchObject({
        code: 'FUNCTIONAL_OPERATION_FAILED',
      });
      expect(h.writes.get('teacher-live-finish-diagnostics')).toMatchObject({
        operationFailure: null,
        cleanupFailure: {
          stage: kind === 'actor' ? 'ACTOR_CLOSE' : 'BINDING_DISPOSE',
        },
      });
      expect(h.actions.filter((a) => a === 'CLOSE')).toHaveLength(
        kind === 'actor' ? 4 : 0,
      );
      expect(h.actions.filter((a) => a === 'DISPOSE')).toHaveLength(
        kind === 'actor' ? 3 : 1,
      );
    },
  );
  it('does not turn a successful original journey into failure when diagnostic writer rejects', async () => {
    const run = fixture();
    h.fail = 'WRITER';
    expect((await run()).finalized).toBe(true);
    expect(h.writes.has('teacher-live-finish-diagnostics')).toBe(false);
  });
  it('helper wrappers preserve original values and arbitrary thrown identity without raw classifications', async () => {
    const writes: unknown[] = [];
    const diagnostic = createLiveDiagnostics(syntheticScope(), [], {
      write: (_name, value) => {
        writes.push(value);
        return Promise.resolve();
      },
    } as PrivateJournal);
    for (const sentinel of [undefined, null, new Error('SYNTHETIC_PRIVATE')]) {
      let thrown = false;
      try {
        await diagnostic.step('REPORT_RPC', () => {
          // eslint-disable-next-line @typescript-eslint/only-throw-error -- Deliberate primitive caller failures must preserve exact thrown identity.
          throw sentinel;
        });
      } catch (error) {
        thrown = true;
        expect(error).toBe(sentinel);
      }
      expect(thrown).toBe(true);
    }
    const value = {};
    expect(await diagnostic.step('REPORT_RPC', () => value)).toBe(value);
    await diagnostic.finish();
    expect(JSON.stringify(writes)).not.toContain('SYNTHETIC_PRIVATE');
  });
  it('bounds passive events and rejects unknown stage without changing operation', async () => {
    const writes: unknown[] = [];
    const diagnostic = createLiveDiagnostics(syntheticScope(), [], {
      write: (_name, value) => {
        writes.push(value);
        return Promise.resolve();
      },
    } as PrivateJournal);
    expect(diagnostic.sync('PRIVATE_STAGE' as never, () => 42)).toBe(42);
    for (let n = 0; n < 600; n++) diagnostic.sync('HEALTH', () => undefined);
    await diagnostic.finish();
    expect(writes[0]).toMatchObject({
      collection: 'UNAVAILABLE',
      overflow: true,
    });
    expect((writes[0] as { events: unknown[] }).events).toHaveLength(512);
    expect(JSON.stringify(writes)).not.toContain('PRIVATE_STAGE');
  });
});
