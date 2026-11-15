import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Page } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../src/types/database';
import { masteryFunctional } from '../../scripts/concurrency/student-learning';
const masteryFactory = vi.hoisted(() => vi.fn());
vi.mock('../../src/features/learning/api/mastery-repository', () => ({
  createMasteryRepository: masteryFactory,
}));
vi.mock('../../src/features/learning/api/chapter-map', () => ({
  fetchStudentChapterMap: () =>
    Promise.resolve({
      chapters: [
        {
          stableCode: 'chapter-3',
          title: '合成章',
          templateId: 'synthetic',
          templateQuestionCount: 5,
          accessState: 'available',
          chapterId: 'chapter',
        },
      ],
    }),
}));
vi.mock('@playwright/test', () => ({
  expect: (locator: {
    visible: () => boolean;
    disabled: () => boolean;
    text: () => string;
  }) => ({
    toBeVisible: () => {
      expect(locator.visible()).toBe(true);
      return Promise.resolve();
    },
    toBeDisabled: () => {
      expect(locator.disabled()).toBe(true);
      return Promise.resolve();
    },
    not: {
      toHaveText: (before: string) => {
        expect(locator.text()).not.toBe(before);
        return Promise.resolve();
      },
    },
  }),
}));
import { chooseQuizAnswer } from '../../scripts/concurrency/student-quiz';
import { affordableUnownedItem } from '../../scripts/concurrency/student-economy';
import { assertFunctionalDenied } from '../../scripts/concurrency/student-authorization';
import type { QuizQuestion } from '../../src/features/quiz/api/quiz-repository';
import type { BlookInventory } from '../../src/features/inventory/types';
const question = (): QuizQuestion => ({
  answerStatus: null,
  correctOptionId: null,
  deadlineAt: null,
  explanation: null,
  options: [
    { id: 'a', key: 'A', sortOrder: 1, text: '公園的花草' },
    { id: 'b', key: 'B', sortOrder: 2, text: '人工色料' },
  ],
  position: 1,
  prompt: '下列何者為自然色彩？',
  scoreDelta: null,
  selectedOptionId: null,
  sessionQuestionId: 'synthetic',
  stableCode: 'synthetic',
  startedAt: null,
  version: 1,
});
describe('functional student authoritative boundaries', () => {
  it('chooses only a normal UI option using the Node-only test oracle', () => {
    expect(chooseQuizAnswer(question(), false).id).toBe('a');
    expect(chooseQuizAnswer(question(), true).id).toBe('b');
  });
  it.each([
    { correctOptionId: 'SYNTHETIC_SECRET' },
    { explanation: 'SYNTHETIC_SECRET' },
    { answerStatus: 'correct' as const },
    { prompt: 'UNKNOWN' },
  ])('refuses pre-answer disclosure or unknown content %#', (patch) => {
    expect(() => chooseQuizAnswer({ ...question(), ...patch }, false)).toThrow(
      'FUNCTIONAL_STUDENT_FAILED',
    );
  });
  it('never substitutes a grant or an already-owned purchase when quiz rewards cannot afford it', () => {
    const inventory: BlookInventory = {
      activeBlookId: 'default',
      tokenBalance: 10,
      items: [
        {
          id: 'default',
          stableCode: 'default',
          name: 'synthetic',
          emoji: 'x',
          costTokens: 0,
          owned: true,
          equipped: true,
        },
        {
          id: 'paid',
          stableCode: 'paid',
          name: 'synthetic',
          emoji: 'x',
          costTokens: 20,
          owned: false,
          equipped: false,
        },
      ],
    };
    expect(() => affordableUnownedItem(inventory)).toThrow(
      'FUNCTIONAL_STUDENT_FAILED',
    );
    expect(affordableUnownedItem({ ...inventory, tokenBalance: 20 }).id).toBe(
      'paid',
    );
  });
  it('a timeout, unknown error, or unexpected success cannot prove permission denial', async () => {
    for (const operation of [
      () => Promise.resolve(undefined),
      () =>
        Promise.resolve().then(() => {
          throw new Error('SYNTHETIC_SECRET');
        }),
    ])
      await expect(
        assertFunctionalDenied(operation, () => false),
      ).rejects.toThrow('FUNCTIONAL_STUDENT_FAILED');
    await expect(
      assertFunctionalDenied(
        () =>
          Promise.resolve().then(() => {
            throw new Error('DENIED');
          }),
        (error) => error instanceof Error && error.message === 'DENIED',
      ),
    ).resolves.toBeUndefined();
  });
});

const masteryHarness = (
  mode:
    | 'later'
    | 'visible'
    | 'missing'
    | 'duplicate'
    | 'disabled'
    | 'wrong_advance'
    | 'unlocked'
    | 'empty_hint' = 'later',
  size = 2,
) => {
  const targetPage = Math.floor(2 / size);
  let pageIndex = 0,
    position = 1,
    wrong = false,
    selected = '',
    feedback = false,
    hint = false,
    started = 0;
  const actions: string[] = [];
  const completed = new Set<number>();
  const state = () => ({
    chapterId: 'chapter',
    position,
    questionId: `q${String(position)}`,
    status: completed.size === 5 ? 'completed' : 'in_progress',
    stages: Array.from({ length: 5 }, (_, i) => ({
      position: i + 1,
      completed: completed.has(i + 1),
    })),
    question: {
      questionId: `q${String(position)}`,
      wrongAttempts: wrong ? 1 : 0,
      prompt: '下列何者為自然色彩？',
      options: [
        { id: 'correct', text: '公園的花草', locked: false },
        { id: 'wrong', text: '人工色料', locked: wrong && mode !== 'unlocked' },
      ],
    },
  });
  masteryFactory.mockReturnValue({ getState: () => Promise.resolve(state()) });
  const targetCount = () =>
    mode === 'missing' || mode === 'disabled'
      ? 0
      : mode === 'duplicate'
        ? 2
        : mode === 'visible' ||
            mode === 'wrong_advance' ||
            mode === 'unlocked' ||
            mode === 'empty_hint' ||
            pageIndex === targetPage
          ? 1
          : 0;
  const locator = (name: string): unknown => ({
    first: () => locator(name),
    filter: () => locator('target'),
    locator: (child: string) => locator(child === 'span' ? 'hint-text' : child),
    getByRole: (_role: string, options: { name: string | RegExp }) =>
      locator(String(options.name)),
    count: () =>
      Promise.resolve(
        name === 'target'
          ? targetCount()
          : name === 'li.mission-select__item'
            ? size
            : 1,
      ),
    isEnabled: () =>
      Promise.resolve(
        name === '下一頁' && pageIndex < targetPage && mode !== 'disabled',
      ),
    visible: () =>
      name === 'li.mission-select__item' || name === 'target'
        ? targetCount() > 0 || name === 'li.mission-select__item'
        : name === 'hint'
          ? hint
          : true,
    disabled: () => name === '人工色料' && wrong && mode !== 'unlocked',
    text: () => String(pageIndex),
    textContent: () =>
      Promise.resolve(
        name === 'hint-text'
          ? mode === 'empty_hint'
            ? ''
            : '合成提示'
          : String(pageIndex),
      ),
    check: () => {
      selected = name;
      return Promise.resolve();
    },
    click: () => {
      actions.push(name);
      if (name === '下一頁') {
        if (pageIndex >= targetPage || mode === 'disabled')
          throw Error('PAGER_EXHAUSTED');
        pageIndex++;
      } else if (name === '展開小節任務') {
        if (targetCount() !== 1) throw Error('TARGET_NOT_VISIBLE');
        started++;
      } else if (name === '索取第 1 層提示') {
        if (!wrong) throw Error('HINT_BEFORE_WRONG');
        hint = true;
      } else if (name === '送出答案') {
        if (selected === '人工色料') {
          wrong = true;
          if (mode === 'wrong_advance') position++;
        } else {
          completed.add(position);
          position = Math.min(5, position + 1);
          wrong = false;
          feedback = true;
        }
      } else if (name.includes('下一關')) {
        if (!feedback) throw Error('ADVANCE_BEFORE_CORRECT');
        feedback = false;
      }
      return Promise.resolve();
    },
  });
  const page = {
    goto: () => Promise.resolve(),
    url: () =>
      'http://127.0.0.1:58373/app/missions/10000000-0000-0000-0000-000000000001',
    waitForURL: () => Promise.resolve(),
    locator: (name: string) =>
      locator(name.includes('ui-hint') ? 'hint' : name),
    getByRole: (_role: string, options: { name: string | RegExp }) =>
      locator(String(options.name)),
    getByText: () => locator('wrong-feedback'),
  };
  return {
    page: page as unknown as Page,
    client: {} as SupabaseClient<Database>,
    journal: { directory: 'synthetic', write: () => Promise.resolve() },
    actions,
    started: () => started,
    size,
  };
};
afterEach(() => vi.clearAllMocks());
describe('actual mastery helper normal pager and hint lifecycle', () => {
  it.each([1, 2])(
    'reaches later chapter on %i-card pages and records all six UI attempts',
    async (size) => {
      const h = masteryHarness('later', size);
      const result = await masteryFunctional(h.page, h.client, h.journal);
      expect(result).toEqual({ completedStages: 5, attempts: 6 });
      expect(h.actions[0]).toBe('下一頁');
      expect(h.actions.filter((action) => action === '下一頁')).toHaveLength(
        Math.floor(2 / size),
      );
      expect(h.actions.indexOf('索取第 1 層提示')).toBeGreaterThan(
        h.actions.indexOf('送出答案'),
      );
    },
  );
  it('does not turn pages when target is already visible', async () => {
    const h = masteryHarness('visible');
    await masteryFunctional(h.page, h.client, h.journal);
    expect(h.actions).not.toContain('下一頁');
  });
  it.each([
    'missing',
    'duplicate',
    'disabled',
    'wrong_advance',
    'unlocked',
    'empty_hint',
  ] as const)(
    'refuses %s instead of fabricating mastery completion',
    async (mode) => {
      const h = masteryHarness(mode);
      await expect(
        masteryFunctional(h.page, h.client, h.journal),
      ).rejects.toThrow('FUNCTIONAL_STUDENT_FAILED');
      if (['missing', 'duplicate', 'disabled'].includes(mode))
        expect(h.started()).toBe(0);
    },
  );
});
