import { createElement } from 'react';
import { cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { ChapterDetailPage } from '../pages/chapter-detail-page';
import { AppShell } from '../../../app/shell/app-shell';
import {
  installReviewReadinessSlot,
  REVIEW_READINESS_SLOT,
  reviewReadinessEnabled,
  reviewReadinessSchema,
  tapReviewReader,
  tapReviewShell,
  reviewQueryState,
} from './review-readiness-diagnostics';
const state = vi.hoisted<{
  query: {
    status: string;
    fetchStatus: string;
    isPending: boolean;
    isError: boolean;
    error: unknown;
    data: undefined;
  };
  view: string;
  auth: string;
}>(() => ({
  query: {
    status: 'pending',
    fetchStatus: 'fetching',
    isPending: true,
    isError: false,
    error: null,
    data: undefined,
  },
  view: 'loading',
  auth: 'loading',
}));
vi.mock('../hooks/use-chapter-map', () => ({
  useStudentChapterMap: () => state.query,
}));
vi.mock('../hooks/use-learning', () => ({
  useChapterReview: () => state.query,
  useLearningProgress: () => state.query,
  useReviewProgressRows: () => state.query,
  useCompleteReviewCard: () => ({ isPending: false, mutate: vi.fn() }),
}));
vi.mock('../pages/chapter-detail-adapter', async (original) => ({
  ...(await original<typeof import('../pages/chapter-detail-adapter')>()),
  deriveChapterDetailViewModel: () =>
    state.view === 'loading'
      ? { state: 'loading' }
      : state.view === 'locked'
        ? { state: 'locked', chapterTitle: 'synthetic', unmetConditions: [] }
        : {
            state: 'error',
            retryable: false,
            errorCode: 'UNAVAILABLE',
            retryTarget: null,
          },
}));
vi.mock('../../auth/context/auth-context', () => ({
  useAuth: () => ({ status: state.auth, session: null }),
}));
vi.mock('../../profile/hooks/use-my-profile', () => ({
  useMyProfile: () => state.query,
}));
vi.mock('../../../components/ui/toast', () => ({ useToast: () => vi.fn() }));
vi.mock('../../inventory/hooks/use-blook-inventory', () => ({
  useBlookInventory: () => ({ data: { items: [] } }),
  useFrameInventory: () => ({ data: { items: [] } }),
}));
vi.mock('../../rewards/hooks/use-economy-summary', () => ({
  useEconomySummary: () => ({ isPending: true }),
}));
vi.mock('../../../app/shell/use-idle-logout', () => ({
  useIdleLogout: () => undefined,
}));
const target = () =>
  Object.getOwnPropertyDescriptor(globalThis, REVIEW_READINESS_SLOT)?.value as {
    json: string;
  };
const read = () => reviewReadinessSchema.parse(JSON.parse(target().json));
const chapterPath = '/app/chapters/21000000-0000-0000-0000-000000000003';
afterEach(() => {
  cleanup();
});
it('real product render without Native opt-in does not create diagnostic data or globals', () => {
  expect(reviewReadinessEnabled()).toBe(false);
  render(
    createElement(
      MemoryRouter,
      null,
      createElement(ChapterDetailPage, { chapterId: 'synthetic' }),
    ),
  );
  expect(
    Object.getOwnPropertyDescriptor(globalThis, REVIEW_READINESS_SLOT),
  ).toBeUndefined();
});
it('real chapter render records the four current query states behind Native opt-in', () => {
  installReviewReadinessSlot();
  window.history.replaceState({}, '', chapterPath);
  render(
    createElement(
      MemoryRouter,
      null,
      createElement(ChapterDetailPage, { chapterId: 'synthetic' }),
    ),
  );
  expect(read()).toMatchObject({
    route: 'CHAPTER',
    chapter: {
      view: 'loading',
      reader: false,
      queries: [
        { pending: true },
        { pending: true },
        { pending: true },
        { pending: true },
      ],
    },
  });
  expect(
    Object.getOwnPropertyDescriptor(globalThis, REVIEW_READINESS_SLOT),
  ).toMatchObject({ configurable: false, writable: false });
  expect(new TextEncoder().encode(target().json).length).toBeLessThanOrEqual(
    2048,
  );
});
it.each(['locked', 'error'])(
  'real chapter render preserves %s branch and closed error classification',
  (mode) => {
    state.view = mode;
    state.query.error = Object.assign(new Error('private synthetic'), {
      code: 'UNAVAILABLE',
    });
    state.query.status = 'error';
    state.query.isPending = false;
    render(
      createElement(
        MemoryRouter,
        null,
        createElement(ChapterDetailPage, { chapterId: 'synthetic' }),
      ),
    );
    expect(read().chapter).toMatchObject({
      view: mode,
      queries: [
        { error: 'UNAVAILABLE' },
        { error: 'UNAVAILABLE' },
        { error: 'UNAVAILABLE' },
        { error: 'UNAVAILABLE' },
      ],
    });
    expect(target().json).not.toContain('private synthetic');
  },
);
it('actual shell projects auth/profile while route change invalidates the old chapter sample', () => {
  window.history.replaceState({}, '', '/login');
  render(
    createElement(
      MemoryRouter,
      { initialEntries: ['/login'] },
      createElement(AppShell),
    ),
  );
  expect(read()).toMatchObject({
    route: 'LOGIN',
    chapter: null,
    shell: {
      auth: 'loading',
      matched: false,
      completed: false,
      role: 'public',
    },
  });
});
it('SPA chapter-to-chapter change clears the previous chapter before a fresh render', () => {
  const before = read().epoch;
  window.history.replaceState(
    {},
    '',
    '/app/chapters/21000000-0000-0000-0000-000000000004',
  );
  tapReviewShell({
    auth: 'authenticated',
    matched: true,
    completed: true,
    role: 'student',
    profile: reviewQueryState({
      status: 'success',
      fetchStatus: 'idle',
      isPending: false,
      error: null,
    }),
  });
  expect(read()).toMatchObject({ route: 'CHAPTER', chapter: null });
  expect(read().epoch).toBeGreaterThan(before);
});
it('reader can only annotate an existing current chapter; own error getter never runs', () => {
  tapReviewReader(true);
  expect(read().chapter).toBeNull();
  let calls = 0;
  const error = Object.defineProperty({}, 'code', {
    get() {
      calls++;
      return 'synthetic-private';
    },
  });
  expect(
    reviewQueryState({
      status: 'error',
      fetchStatus: 'idle',
      isPending: false,
      error,
    }).error,
  ).toBe('UNKNOWN');
  expect(calls).toBe(0);
});

import { tapReviewChapter } from './review-readiness-diagnostics';
it.each([
  'in-progress',
  'completed',
  'content-preparing',
  'content-readiness-error',
] as const)('fixed tap preserves %s without reading payloads', (view) => {
  const query = reviewQueryState({
    status: 'success',
    fetchStatus: 'idle',
    isPending: false,
    error: null,
  });
  tapReviewChapter({ view, queries: [query, query, query, query] });
  tapReviewReader(true);
  expect(read().chapter).toMatchObject({
    view,
    reader: true,
    queries: [
      { status: 'success' },
      { status: 'success' },
      { status: 'success' },
      { status: 'success' },
    ],
  });
});
it('a hostile query projection is fault isolated and cannot turn pending into ready', () => {
  const error = new Proxy(
    {},
    {
      getOwnPropertyDescriptor() {
        throw new Error('synthetic trap');
      },
    },
  );
  expect(
    reviewQueryState({
      status: 'error',
      fetchStatus: 'idle',
      isPending: false,
      error,
    }),
  ).toEqual({
    status: 'UNKNOWN',
    fetchStatus: 'UNKNOWN',
    pending: 'UNOBSERVED',
    error: 'UNKNOWN',
  });
});
