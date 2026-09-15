import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StudentBackNavigationProvider } from '../../../app/shell/student-back-navigation';
import { StudentRouteBackButton } from '../../../app/shell/student-route-back-button';
import type { QuizRepository } from '../../quiz/api/quiz-repository';
import { QuizResultPage } from '../../quiz/pages/quiz-result';
import type { LearningRepository } from '../api/learning-repository';
import { MistakesPage } from './mistakes-page';

const subtopicId = 'f929cde5-c294-46ce-5faf-c866b3cb9583';
const title = '3-3 數位色彩與色票的表示';
const hash = `#mistake-subtopic-${subtopicId}`;
const originalScroll = Object.getOwnPropertyDescriptor(
  Element.prototype,
  'scrollIntoView',
);
const mistake = {
  correctOptionText: 'RGB',
  lastEventAt: '2026-09-16T00:00:00Z',
  mistakeId: '26200000-0000-0000-0000-000000000001',
  prompt: '螢幕使用何種色彩？',
  stableCode: '3-3-01',
  status: 'open' as const,
  subtopicId,
  subtopicTitle: title,
};
const resultRepository = {
  getSession: vi.fn().mockResolvedValue({
    answeredCount: 1,
    challengeKind: 'chapter',
    chapterSortOrder: 3,
    chapterTitle: '色彩表示',
    completedAt: '2026-09-16T00:00:00Z',
    correctCount: 1,
    gameRulesVersion: '2026-07-progress-1',
    questionCount: 1,
    questions: [],
    rewardRatePercent: 20,
    sectionSortOrder: null,
    sectionTitle: null,
    sessionId: 'test-session',
    status: 'completed',
    templateId: 'test-template',
    tokensAwarded: 0,
    totalScore: 100,
    xpAwarded: 15,
  }),
} as unknown as QuizRepository;

function setup(path: string, resolved = false, state: unknown = null) {
  const startRemediation = vi.fn().mockResolvedValue('test-session');
  const repository = {
    listMistakes: vi
      .fn()
      .mockResolvedValue([
        { ...mistake, status: resolved ? 'resolved' : 'open' },
      ]),
    startRemediation,
  } as unknown as LearningRepository;
  const router = createMemoryRouter(
    [
      {
        element: (
          <StudentBackNavigationProvider>
            <StudentRouteBackButton />
            <MistakesPage repository={repository} />
          </StudentBackNavigationProvider>
        ),
        path: '/app/mistakes',
      },
      {
        element: (
          <StudentBackNavigationProvider>
            <StudentRouteBackButton />
            <QuizResultPage
              repository={resultRepository}
              achievementRepository={{
                getCatalog: () =>
                  Promise.resolve({
                    items: [],
                    totalCount: 0,
                    unlockedCount: 0,
                  }),
              }}
              economyRepository={{
                getSummary: () =>
                  Promise.resolve({
                    currentLevelXp: 0,
                    level: 1,
                    tokenBalance: 0,
                    totalXp: 0,
                    walletReconciled: true,
                    xpPerLevel: 500,
                  }),
              }}
            />
          </StudentBackNavigationProvider>
        ),
        path: '/app/quiz/:sessionId/result',
      },
      { element: <p>答題頁</p>, path: '/app/quiz/:sessionId' },
    ],
    {
      initialEntries: [
        {
          pathname: path.split('#')[0] ?? '/app/mistakes',
          hash: path.includes('#') ? hash : '',
          state,
        },
      ],
    },
  );
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, startRemediation };
}

beforeEach(() => {
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  if (originalScroll)
    Object.defineProperty(Element.prototype, 'scrollIntoView', originalScroll);
  else Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
});

describe('remediation return context', () => {
  it('remembers the originating subtopic when starting its mistakes', async () => {
    const { router } = setup('/app/mistakes');
    fireEvent.click(
      await screen.findByRole('button', { name: '再挑戰（補救練習）' }),
    );
    await screen.findByText('答題頁');
    expect(router.state.location.state).toEqual({
      remediationReturnSubtopicId: subtopicId,
    });
  });

  for (const control of ['shell', 'link']) {
    it(`labels remediation correctly and returns ${control} to its subtopic`, async () => {
      const { router } = setup('/app/quiz/test-session/result', false, {
        remediationReturnSubtopicId: subtopicId,
      });
      await screen.findByRole('heading', { name: '錯題補救練習完成' });
      expect(screen.queryByText('章節總挑戰')).toBeNull();
      fireEvent.click(
        control === 'shell'
          ? screen.getByRole('button', { name: '返回我的錯題' })
          : screen.getByRole('link', { name: '返回我的錯題' }),
      );
      await waitFor(() => {
        expect(router.state.location.pathname).toBe('/app/mistakes');
      });
      expect(router.state.location.hash).toBe(hash);
    });
  }

  it('restores the subtopic anchor after asynchronous data loads', async () => {
    const scroll = vi.fn();
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: scroll,
    });
    setup(`/app/mistakes${hash}`);
    await waitFor(() => {
      expect(scroll).toHaveBeenCalled();
    });
    expect(document.getElementById(hash.slice(1))).toHaveTextContent(title);
  });

  it('keeps a resolved originating subtopic visible without offering another retry', async () => {
    setup(`/app/mistakes${hash}`, true);
    await screen.findByText('這個小節的錯題已全部解決。');
    expect(screen.getByText('目前沒有待補救的錯題，繼續保持！')).toBeVisible();
    expect(document.getElementById(hash.slice(1))).toHaveTextContent(title);
    expect(
      screen.queryByRole('button', { name: '再挑戰（補救練習）' }),
    ).toBeNull();
  });

  it('falls back safely to mistakes when return context is absent', async () => {
    const { router } = setup('/app/quiz/test-session/result');
    await screen.findByRole('heading', { name: '錯題補救練習完成' });
    fireEvent.click(screen.getByRole('button', { name: '返回我的錯題' }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/app/mistakes');
    });
    expect(router.state.location.hash).toBe('');
  });
});
