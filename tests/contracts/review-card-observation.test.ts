import { describe, expect, it, vi } from 'vitest';
import type { Locator, Page } from '@playwright/test';
import {
  walkReviewCards,
  completeReviewCard,
  selectReviewSubtopic,
} from '../e2e/helpers/review-card-walk';
import { createStudentReviewDiagnostics } from '../../scripts/concurrency/capacity-student-review-diagnostics';

const active = vi.hoisted(() => ({
  failure: '',
  trace: [] as string[],
  sentinel: new TypeError('PRIVATE_SELECTOR_TITLE_AUTH_NOT_PERSISTED'),
}));
const action = async (phase: string) => {
  await Promise.resolve();
  active.trace.push(phase);
  if (active.failure === phase) throw active.sentinel;
};
vi.mock('@playwright/test', () => ({
  expect: (locator: { kind: string }) => ({
    toHaveCount: () => action('SECTION_COUNT'),
    toHaveAttribute: () => action('SECTION_SELECTED'),
    toBeVisible: () => action(locator.kind),
    toBeEnabled: () => action('PAGE_READY'),
    toHaveText: () => action('COMPLETION_CONFIRMED'),
  }),
}));
const locator = (kind: string) => ({
  kind,
  first: () => locator('CHOICES_READY'),
  nth: () => locator('CHOICE_READY'),
  filter: () => locator('COMPLETION_STATUS'),
  getByRole: (role: string) =>
    locator(
      role === 'status'
        ? 'COMPLETION_STATUS'
        : kind === 'NAV'
          ? 'SECTION'
          : 'COMPLETION_CLICK',
    ),
  count: async () => {
    await action('CHOICES_COUNT');
    return 1;
  },
  isVisible: async () => {
    await action('COMPLETION_STATUS');
    return false;
  },
  click: () =>
    action(
      kind === 'SECTION'
        ? 'SECTION_SELECT'
        : kind === 'CHOICE_READY'
          ? 'CHOICE_SELECT'
          : kind,
    ),
  evaluateAll: () => Promise.resolve([]),
});
const page = {
  getByRole: (role: string, options?: { name?: string | RegExp }) => {
    if (role === 'navigation') return locator('NAV');
    if (role === 'article') return locator('ARTICLE');
    const name = String(options?.name);
    return locator(
      name === '下一頁'
        ? 'PAGE_NEXT'
        : name === '返回複習卡選擇'
          ? 'BACK'
          : name.includes('進入複習')
            ? 'ENTER'
            : 'CHOICES',
    );
  },
} as unknown as Page;
const reset = (failure = '') => {
  active.failure = failure;
  active.trace = [];
};
const walk = (observe?: Parameters<typeof walkReviewCards>[5]) =>
  walkReviewCards(
    page,
    '3-1',
    ['PRIVATE_CARD_A', 'PRIVATE_CARD_B'],
    async (card, _title, observer) => {
      await completeReviewCard(card, observer);
    },
    () => action('BEFORE_RESELECT'),
    observe,
  );

describe('actual review walker failure boundaries', () => {
  it.each([
    'BEFORE_RESELECT',
    'SECTION_COUNT',
    'SECTION_SELECT',
    'SECTION_SELECTED',
    'CHOICES_READY',
    'CHOICES_COUNT',
    'PAGE_READY',
    'PAGE_NEXT',
    'CHOICE_READY',
    'CHOICE_SELECT',
    'ENTER',
    'ARTICLE',
    'COMPLETION_STATUS',
    'COMPLETION_CLICK',
    'COMPLETION_CONFIRMED',
    'BACK',
  ] as const)('records exact %s before existing catches', async (phase) => {
    reset(phase);
    const diagnostic = createStudentReviewDiagnostics(52);
    const pending = walk(diagnostic.observe);
    if (phase === 'SECTION_COUNT')
      await expect(pending).rejects.toThrow(
        'LEARNING_EXPERIENCE_SUBTOPIC_BUTTON_NOT_UNIQUE',
      );
    else if (phase === 'ARTICLE')
      await expect(pending).rejects.toThrow('REVIEW_CARD_NAVIGATION_MISMATCH');
    else await expect(pending).rejects.toBe(active.sentinel);
    const result = diagnostic.seal();
    expect(result.firstFailure).toMatchObject({
      actorIndex: 52,
      phase,
      state: 'FAILED',
      errorClass: 'TYPE_ERROR',
    });
    expect(result.firstFailure?.cardOrdinal).toBe(
      phase === 'PAGE_READY' || phase === 'PAGE_NEXT' ? 1 : 0,
    );
    expect(JSON.stringify(result)).not.toMatch(
      /PRIVATE|SELECTOR_TITLE_AUTH|3-1/u,
    );
    expect(result.ui).toBe('UNOBSERVED');
    expect(result.http).toBe('UNOBSERVED');
  });
  it('keeps exact original operation trace with absent or throwing observer', async () => {
    reset();
    await walk();
    const original = [...active.trace];
    reset();
    await walk(() => {
      throw active.sentinel;
    });
    expect(active.trace).toEqual(original);
    expect(original).toEqual([
      'BEFORE_RESELECT',
      'SECTION_COUNT',
      'SECTION_SELECT',
      'SECTION_SELECTED',
      'CHOICES_READY',
      'CHOICES_COUNT',
      'CHOICE_READY',
      'CHOICE_SELECT',
      'ENTER',
      'ARTICLE',
      'COMPLETION_STATUS',
      'COMPLETION_CLICK',
      'COMPLETION_CONFIRMED',
      'BACK',
      'BEFORE_RESELECT',
      'SECTION_COUNT',
      'SECTION_SELECT',
      'SECTION_SELECTED',
      'CHOICES_READY',
      'CHOICES_COUNT',
      'PAGE_READY',
      'PAGE_NEXT',
      'CHOICE_READY',
      'CHOICE_SELECT',
      'ENTER',
      'ARTICLE',
      'COMPLETION_STATUS',
      'COMPLETION_CLICK',
      'COMPLETION_CONFIRMED',
      'BACK',
    ]);
  });
  it('retains invalid section sentinel and existing completed-card no-click behavior', async () => {
    reset();
    const diagnostic = createStudentReviewDiagnostics(1);
    await expect(
      selectReviewSubtopic(page, 'PRIVATE_INVALID', diagnostic.observe),
    ).rejects.toThrow('LEARNING_EXPERIENCE_SECTION_KEY_INVALID');
    expect(diagnostic.seal().firstFailure?.phase).toBe('SECTION_KEY');
    const card = {
      getByRole: () => ({
        filter: () => ({
          isVisible: () => Promise.resolve(true),
          kind: 'COMPLETION_STATUS',
        }),
      }),
    } as unknown as Locator;
    await completeReviewCard(card);
    expect(active.trace).toEqual(['COMPLETION_CONFIRMED']);
  });
});
