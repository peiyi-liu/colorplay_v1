import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AchievementRepository } from '../../achievements/types';
import { useStudentChapterMap } from '../../learning/hooks/use-chapter-map';
import type { EconomyRepository } from '../../rewards/types';
import type {
  QuizQuestion,
  QuizRepository,
  QuizSession,
} from '../api/quiz-repository';
import { QuizResultPage } from './quiz-result';
import { QuizSessionPage } from './quiz-session';

vi.mock('../../learning/hooks/use-chapter-map', async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import('../../learning/hooks/use-chapter-map')
    >();
  return { ...original, useStudentChapterMap: vi.fn() };
});

const mockedChapterMap = vi.mocked(useStudentChapterMap);
const sessionId = '31000000-0000-0000-0000-000000000001';
const templateId = '26000000-0000-0000-0000-000000000003';
const completedAt = '2099-07-14T12:01:00.000Z';

const answeredQuestion: QuizQuestion = {
  answerStatus: 'correct',
  correctOptionId: '33000000-0000-0000-0000-000000000001',
  deadlineAt: '2099-07-14T12:00:20.000Z',
  explanation: 'RGB 使用三色光。',
  options: [
    {
      id: '33000000-0000-0000-0000-000000000001',
      key: 'A',
      sortOrder: 1,
      text: 'RGB',
    },
    {
      id: '33000000-0000-0000-0000-000000000002',
      key: 'B',
      sortOrder: 2,
      text: 'CMYK',
    },
  ],
  position: 1,
  prompt: '第 1 題',
  scoreDelta: 1_000,
  selectedOptionId: '33000000-0000-0000-0000-000000000001',
  sessionQuestionId: '32000000-0000-0000-0000-000000000001',
  stableCode: '3-1-01',
  startedAt: '2099-07-14T12:00:00.000Z',
  version: 1,
};

const quizSession = (
  challengeKind: QuizSession['challengeKind'],
  status: QuizSession['status'],
): QuizSession => ({
  answeredCount: 1,
  challengeKind,
  chapterSortOrder: 3,
  chapterTitle: '色彩表示',
  completedAt: status === 'completed' ? completedAt : null,
  correctCount: 1,
  gameRulesVersion: '2026-07-mvp-1',
  questionCount: 1,
  questions: [answeredQuestion],
  rewardRatePercent: 100,
  sectionSortOrder: challengeKind === 'section' ? 1 : null,
  sectionTitle:
    challengeKind === 'section' ? '3-1 色彩三要素與色名的表示' : null,
  sessionId,
  status,
  templateId,
  tokensAwarded: status === 'completed' ? 250 : 0,
  totalScore: 1_000,
  xpAwarded: status === 'completed' ? 750 : 0,
});

const achievementRepository: AchievementRepository = {
  getCatalog: vi.fn().mockResolvedValue({
    items: [],
    totalCount: 0,
    unlockedCount: 0,
  }),
};

const economyRepository: EconomyRepository = {
  getSummary: vi.fn().mockResolvedValue({
    currentLevelXp: 0,
    level: 1,
    tokenBalance: 0,
    totalXp: 0,
    walletReconciled: true,
    xpPerLevel: 500,
  }),
};

const renderTransition = (
  repository: QuizRepository,
): Readonly<{
  client: QueryClient;
  router: ReturnType<typeof createMemoryRouter>;
}> => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      {
        path: '/app/quiz/:sessionId',
        element: <QuizSessionPage repository={repository} />,
      },
      {
        path: '/app/quiz/:sessionId/result',
        element: (
          <QuizResultPage
            achievementRepository={achievementRepository}
            economyRepository={economyRepository}
            repository={repository}
          />
        ),
      },
    ],
    { initialEntries: [`/app/quiz/${sessionId}`] },
  );
  function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  }
  render(<RouterProvider router={router} />, { wrapper: Wrapper });
  return { client, router };
};

describe('quiz finalize to result transition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedChapterMap.mockReturnValue({
      data: undefined,
      isError: false,
      isPending: false,
      refetch: vi.fn(),
    } as never);
  });

  it.each([
    ['section', '小節挑戰完成'],
    ['chapter', '章節總挑戰完成'],
  ] as const)(
    'does not show an incomplete error while a finalized %s result refetches',
    async (challengeKind, expectedHeading) => {
      const activeSession = quizSession(challengeKind, 'in_progress');
      const completedSession = quizSession(challengeKind, 'completed');
      let resolveCompletedSession!: (value: QuizSession) => void;
      const completedSessionRequest = new Promise<QuizSession>((resolve) => {
        resolveCompletedSession = resolve;
      });
      const getSession = vi
        .fn<QuizRepository['getSession']>()
        .mockResolvedValueOnce(activeSession)
        .mockImplementationOnce(() => completedSessionRequest);
      const repository: QuizRepository = {
        abandonSession: vi.fn(),
        activateNextQuestion: vi.fn(),
        createSession: vi.fn(),
        finalizeSession: vi.fn().mockResolvedValue({
          answeredCount: 1,
          completedAt,
          correctCount: 1,
          gameRulesVersion: '2026-07-mvp-1',
          questionCount: 1,
          rewardRatePercent: 100,
          sessionId,
          status: 'completed',
          tokensAwarded: 250,
          totalScore: 1_000,
          xpAwarded: 750,
        }),
        getSession,
        submitAnswer: vi.fn(),
      };
      const { router } = renderTransition(repository);

      await userEvent.click(
        await screen.findByRole('button', { name: '結算並查看結果' }),
      );

      await waitFor(() => {
        expect(router.state.location.pathname).toBe(
          `/app/quiz/${sessionId}/result`,
        );
      });
      await waitFor(() => {
        expect(getSession).toHaveBeenCalledTimes(2);
      });
      expect(
        screen.queryByRole('heading', { name: '無法顯示結果' }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole('heading', { name: expectedHeading }),
      ).toBeVisible();

      resolveCompletedSession(completedSession);
      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: expectedHeading }),
        ).toBeVisible();
      });
    },
  );
});
