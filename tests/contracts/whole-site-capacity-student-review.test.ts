import { describe, expect, it, vi } from 'vitest';
import {
  createStudentReviewDiagnostics,
  type ReviewObservation,
} from '../../scripts/concurrency/capacity-student-review-diagnostics';
import type { Page } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../src/types/database';
import { reviewFunctionalCards } from '../../scripts/concurrency/student-learning';
import { runCapacityStudentGame } from '../../scripts/concurrency/capacity-game';

const f = vi.hoisted(() => ({
  failure: '',
  trace: [] as string[],
  sentinel: new TypeError('PRIVATE_TITLE_ACCOUNT_URL_MUST_NOT_PERSIST'),
}));
const invoke = async (phase: string, value: unknown) => {
  await Promise.resolve();
  f.trace.push(phase);
  if (f.failure === phase) throw f.sentinel;
  return value;
};
vi.mock('../../src/features/learning/api/chapter-map', () => ({
  fetchStudentChapterMap: async () => {
    await Promise.resolve();
    f.trace.push('LOOKUP');
    if (f.failure === 'LOOKUP') throw f.sentinel;
    return {
      chapters: [
        {
          chapterId: 'private-id',
          stableCode: 'chapter-3',
          templateId: 'private-template',
          templateQuestionCount: 1,
          accessState: 'available',
        },
      ],
    };
  },
}));
vi.mock('../../tests/fixtures/review-manifest.generated', () => ({
  REVIEW_MANIFEST: [
    {
      chapterCode: 'chapter-3',
      subtopicId: 'private-subtopic',
      sectionKey: '3-1',
      cardTitles: ['PRIVATE_TITLE'],
    },
  ],
}));
vi.mock('../../src/features/learning/api/learning-repository', () => ({
  createLearningRepository: () => ({
    listChapterReview: () =>
      invoke('SECTIONS', [
        {
          subtopics: [
            {
              subtopicId:
                f.failure === 'MANIFEST' ? 'unmatched' : 'private-subtopic',
              cards:
                f.failure === 'CARDS'
                  ? []
                  : [{ cardId: 'private-card', version: 1 }],
            },
          ],
        },
      ]),
    listReviewProgress: () =>
      invoke('PROGRESS', [
        {
          reviewCardId: 'private-card',
          cardVersion: f.failure === 'CARD_VERSIONS' ? 2 : 1,
        },
      ]),
    getLearningProgress: () =>
      invoke('LEARNING_PROGRESS', [
        {
          scope: 'chapter',
          reviewCompleted: f.failure === 'CHAPTER_PROGRESS' ? 0 : 1,
        },
      ]),
  }),
}));
vi.mock('../../tests/e2e/helpers/review-card-walk', () => ({
  walkReviewCards: () => invoke('WALK', undefined),
  completeReviewCard: () => invoke('COMPLETE', undefined),
}));
const client = {} as SupabaseClient<Database>;
const page = { goto: () => invoke('GOTO', undefined) } as unknown as Page;
const runReview = (
  observe: NonNullable<Parameters<typeof reviewFunctionalCards>[2]>,
) => Reflect.apply(reviewFunctionalCards, undefined, [page, client, observe]);
const reset = (failure = '') => {
  f.failure = failure;
  f.trace = [];
};
describe('actual review caller retains a closed failure witness before safely', () => {
  it('keeps the original FunctionalError while observing an actual sections rejection', async () => {
    reset('SECTIONS');
    const rows: unknown[] = [];
    await expect(runReview((row) => rows.push(row))).rejects.toMatchObject({
      code: 'FUNCTIONAL_STUDENT_FAILED',
    });
    expect(f.trace).toEqual(['LOOKUP', 'SECTIONS']);
    expect(rows).toContainEqual(
      expect.objectContaining({
        phase: 'SECTIONS',
        state: 'FAILED',
        errorClass: 'TYPE_ERROR',
      }),
    );
  });
  it('distinguishes the actual confirmed writer from a completed review', async () => {
    reset();
    const rows: unknown[] = [];
    const journal = {
      directory: 'synthetic',
      write: async (name: string) => {
        await Promise.resolve();
        f.trace.push(name);
        if (name.endsWith('student-review-confirmed')) throw f.sentinel;
      },
    };
    await expect(
      Reflect.apply(runCapacityStudentGame, undefined, [
        { actorIndex: 1, client, page, measure: () => Promise.resolve() },
        'synthetic',
        'synthetic',
        60,
        journal,
        new AbortController().signal,
        (row: unknown) => rows.push(row),
      ]),
    ).rejects.toBe(f.sentinel);
    expect(f.trace).toContain('actor-1-student-review-confirmed');
    expect(rows).toContainEqual(
      expect.objectContaining({
        phase: 'CONFIRMED_WRITE',
        state: 'FAILED',
        errorClass: 'TYPE_ERROR',
      }),
    );
    expect(f.trace.at(-1)).toBe('actor-1-student-review-confirmed');
  });
});

describe('review observation keeps original API and writer branches', () => {
  it.each([
    ['LOOKUP', 'LOOKUP'],
    ['SECTIONS', 'SECTIONS'],
    ['GOTO', 'GOTO'],
    ['WALK', 'WALK'],
    ['PROGRESS', 'REVIEW_PROGRESS'],
    ['LEARNING_PROGRESS', 'LEARNING_PROGRESS'],
  ])(
    'observes %s before safely without adding calls',
    async (failure, phase) => {
      reset(failure);
      const diagnostic = createStudentReviewDiagnostics(1);
      await expect(runReview(diagnostic.observe)).rejects.toMatchObject({
        code: 'FUNCTIONAL_STUDENT_FAILED',
      });
      expect(diagnostic.seal().firstFailure).toMatchObject({
        phase,
        state: 'FAILED',
        errorClass: 'TYPE_ERROR',
      });
      expect(f.trace.at(-1)).toBe(failure);
    },
  );
  it('success value and API order are identical even with a throwing observer', async () => {
    reset();
    const value = await runReview(() => undefined);
    const trace = [...f.trace];
    reset();
    await expect(
      runReview(() => {
        throw f.sentinel;
      }),
    ).resolves.toEqual(value);
    expect(value).toEqual({
      completedCards: 1,
      progressConfirmed: true,
      mediaDoesNotBlockCompletion: true,
    });
    expect(f.trace).toEqual([
      'LOOKUP',
      'SECTIONS',
      'GOTO',
      'WALK',
      'PROGRESS',
      'LEARNING_PROGRESS',
    ]);
    expect(f.trace).toEqual(trace);
  });
  it.each(['PRELOOKUP', 'INTENT_WRITE', 'CONFIRMED_WRITE'] as const)(
    'keeps actual game %s failure identity',
    async (phase) => {
      reset(phase === 'PRELOOKUP' ? 'LOOKUP' : '');
      const diagnostic = createStudentReviewDiagnostics(1);
      const journal = {
        directory: 'synthetic',
        write: async (name: string) => {
          await Promise.resolve();
          f.trace.push(name);
          if (
            name.endsWith(
              phase === 'INTENT_WRITE'
                ? 'student-review-intent'
                : 'student-review-confirmed',
            )
          )
            throw f.sentinel;
        },
      };
      const task = runCapacityStudentGame(
        {
          actorIndex: 1,
          client,
          page,
          measure: () => Promise.resolve(undefined as never),
        },
        'synthetic',
        'synthetic',
        60,
        journal,
        new AbortController().signal,
        diagnostic.observe,
      );
      if (phase === 'PRELOOKUP')
        await expect(task).rejects.toMatchObject({
          code: 'FUNCTIONAL_STUDENT_FAILED',
        });
      else await expect(task).rejects.toBe(f.sentinel);
      expect(diagnostic.seal().firstFailure).toMatchObject({
        phase,
        errorClass: 'TYPE_ERROR',
      });
      expect(f.trace).not.toContain('actor-1-quiz-create-intent');
    },
  );
});

describe('pure memory closed projection and sealing', () => {
  it('preserves first failure and immutable terminal snapshots across late notes', () => {
    const d = createStudentReviewDiagnostics(52);
    d.observe({
      phase: 'ARTICLE',
      state: 'FAILED',
      errorClass: 'TYPE_ERROR',
      cardOrdinal: 7,
    });
    d.observe({ phase: 'WALK', state: 'FAILED', errorClass: 'ERROR' });
    const sealed = d.seal();
    expect(sealed.firstFailure).toMatchObject({
      phase: 'ARTICLE',
      cardOrdinal: 7,
      sequence: 1,
    });
    expect(sealed.lastProgress?.phase).toBe('WALK');
    sealed.counters.length = 0;
    d.observe({ phase: 'GOTO', state: 'ENTERED' });
    expect(d.seal().counters.length).toBeGreaterThan(0);
    expect(d.seal().admitted).toBe(2);
  });
  it('bounds worst-case UTF8 and keeps a first failure after overflow honest', () => {
    const d = createStudentReviewDiagnostics(59);
    for (let index = 0; index < 8200; index++)
      d.observe({
        phase: 'COMPLETION_CONFIRMED',
        state: 'RETURNED',
        sectionOrdinal: 65535,
        cardOrdinal: 65535,
        pageOrdinal: 65535,
        count: 65535,
        matched: true,
      });
    d.observe({
      phase: 'CONFIRMED_WRITE',
      state: 'FAILED',
      errorClass: 'ERROR',
    });
    const result = d.seal();
    expect(result.collection).toBe('PARTIAL');
    expect(result.admitted).toBe(8192);
    expect(result.dropped).toBe(9);
    expect(result.firstFailure?.phase).toBe('CONFIRMED_WRITE');
    expect(result.head).toHaveLength(4);
    expect(result.tail).toHaveLength(4);
    expect(
      Buffer.byteLength(JSON.stringify(result), 'utf8'),
    ).toBeLessThanOrEqual(16384);
  });
  it.each([
    null,
    [],
    () => undefined,
    { phase: 'UNKNOWN', state: 'FAILED' },
    { phase: 'GOTO', state: 'ENTERED', count: Infinity },
    { phase: 'GOTO', state: 'ENTERED', count: -1 },
    { phase: 'GOTO', state: 'ENTERED', count: 1.5 },
    { phase: 'GOTO', state: 'ENTERED', cardTitle: 'PRIVATE' },
    { phase: 'GOTO', state: 'ENTERED', errorClass: 'RAW_SECRET' },
  ])(
    'rejects malformed or sensitive input without persisting it: %j',
    (input) => {
      const d = createStudentReviewDiagnostics(1);
      d.observe(input as ReviewObservation);
      const result = d.seal();
      expect(result.collection).toBe('UNAVAILABLE');
      expect(result.admitted).toBe(0);
      expect(JSON.stringify(result)).not.toMatch(/PRIVATE|RAW_SECRET/u);
    },
  );
  it('rejects Proxy, custom prototype and getters without invocation; plain/null prototype remain valid', () => {
    let calls = 0;
    const d = createStudentReviewDiagnostics(1);
    const accessor = {
      get phase() {
        calls++;
        throw f.sentinel;
      },
      state: 'ENTERED',
    };
    const inherited = Object.create({
      get phase() {
        calls++;
        throw f.sentinel;
      },
    }) as ReviewObservation;
    const proxy = new Proxy(
      {},
      {
        ownKeys() {
          calls++;
          throw f.sentinel;
        },
      },
    );
    for (const input of [accessor, inherited, proxy])
      d.observe(input as ReviewObservation);
    expect(calls).toBe(0);
    expect(d.seal().collection).toBe('UNAVAILABLE');
    const valid = createStudentReviewDiagnostics(1);
    valid.observe(
      Object.assign(Object.create(null) as ReviewObservation, {
        phase: 'GOTO',
        state: 'ENTERED',
      }),
    );
    expect(valid.seal().collection).toBe('OBSERVED');
  });
});

it.each(['CARDS', 'MANIFEST', 'CARD_VERSIONS', 'CHAPTER_PROGRESS'] as const)(
  'actual synchronous %s guard is witnessed before safely collapse',
  async (phase) => {
    reset(phase);
    const diagnostic = createStudentReviewDiagnostics(1);
    await expect(runReview(diagnostic.observe)).rejects.toMatchObject({
      code: 'FUNCTIONAL_STUDENT_FAILED',
    });
    expect(diagnostic.seal().firstFailure).toMatchObject({
      phase,
      state: 'FAILED',
      errorClass: 'ERROR',
    });
  },
);
it('one actual chapter lookup produces one phase pair and absent work stays UNOBSERVED', async () => {
  expect(createStudentReviewDiagnostics(1).seal().collection).toBe(
    'UNOBSERVED',
  );
  reset();
  const diagnostic = createStudentReviewDiagnostics(1);
  await runReview(diagnostic.observe);
  expect(
    diagnostic.seal().counters.find((row) => row.phase === 'LOOKUP'),
  ).toEqual({ phase: 'LOOKUP', entered: 1, returned: 1, failed: 0 });
});
