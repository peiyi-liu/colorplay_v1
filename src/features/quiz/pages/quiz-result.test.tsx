import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type AchievementCatalog,
  type AchievementRepository,
} from '../../achievements/types';
import {
  type EconomyRepository,
  type EconomySummary,
} from '../../rewards/types';
import {
  QuizRepositoryError,
  type QuizRepository,
  type QuizSession,
} from '../api/quiz-repository';
import { QuizResultPage } from './quiz-result';

const sessionId = '31000000-0000-0000-0000-000000000001';
const templateId = '26000000-0000-0000-0000-000000000003';

const completedSession = {
  answeredCount: 2,
  chapterTitle: '色彩表示',
  completedAt: '2026-07-14T12:05:00.000Z',
  correctCount: 1,
  gameRulesVersion: '2026-07-mvp-1',
  questionCount: 2,
  questions: [
    {
      answerStatus: 'correct',
      correctOptionId: '33000000-0000-0000-0000-000000000001',
      deadlineAt: '2026-07-14T12:00:20.000Z',
      explanation: 'RGB 是螢幕常見的加法混色模型。',
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
      prompt: '哪一種模型常用於螢幕？',
      scoreDelta: 150,
      selectedOptionId: '33000000-0000-0000-0000-000000000001',
      sessionQuestionId: '32000000-0000-0000-0000-000000000001',
      stableCode: '3-1-01',
      startedAt: '2026-07-14T12:00:00.000Z',
      version: 1,
    },
    {
      answerStatus: 'incorrect',
      correctOptionId: '33000000-0000-0000-0000-000000000004',
      deadlineAt: '2026-07-14T12:00:40.000Z',
      explanation: 'CMYK 適合描述印刷油墨。',
      options: [
        {
          id: '33000000-0000-0000-0000-000000000003',
          key: 'A',
          sortOrder: 1,
          text: 'RGB',
        },
        {
          id: '33000000-0000-0000-0000-000000000004',
          key: 'B',
          sortOrder: 2,
          text: 'CMYK',
        },
      ],
      position: 2,
      prompt: '哪一種模型常用於印刷？',
      scoreDelta: 0,
      selectedOptionId: '33000000-0000-0000-0000-000000000003',
      sessionQuestionId: '32000000-0000-0000-0000-000000000002',
      stableCode: '3-1-02',
      startedAt: '2026-07-14T12:00:20.000Z',
      version: 1,
    },
  ],
  sessionId,
  status: 'completed',
  templateId,
  tokensAwarded: 250,
  totalScore: 150,
  rewardRatePercent: 100,
  xpAwarded: 750,
} satisfies QuizSession;

function repository(getSession: QuizRepository['getSession']): QuizRepository {
  return {
    activateNextQuestion: vi.fn(),
    createSession: vi.fn(),
    finalizeSession: vi.fn(),
    getSession,
    submitAnswer: vi.fn(),
  };
}

function renderResult(
  mockRepository: QuizRepository,
  extras: Readonly<{
    achievementRepository?: AchievementRepository;
    economyRepository?: EconomyRepository;
    state?: Record<string, unknown>;
  }> = {},
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      {
        element: (
          <QuizResultPage
            achievementRepository={extras.achievementRepository}
            economyRepository={extras.economyRepository}
            repository={mockRepository}
          />
        ),
        path: '/app/quiz/:sessionId/result',
      },
    ],
    {
      initialEntries: [
        {
          pathname: `/app/quiz/${sessionId}/result`,
          state: extras.state ?? null,
        },
      ],
    },
  );
  function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  }
  render(<RouterProvider router={router} />, { wrapper: Wrapper });
}

const economySummary = {
  currentLevelXp: 250,
  level: 2,
  tokenBalance: 250,
  totalXp: 750,
  walletReconciled: true,
  xpPerLevel: 500,
} satisfies EconomySummary;

const catalog = (items: AchievementCatalog['items']): AchievementCatalog => ({
  items,
  totalCount: items.length,
  unlockedCount: items.filter(({ state }) => state === 'unlocked').length,
});

describe('QuizResultPage', () => {
  beforeEach(() => {
    document.documentElement.dataset.reducedMotion = 'true';
  });

  afterEach(() => {
    delete document.documentElement.dataset.reducedMotion;
  });

  it('shows server totals, explicit outcomes, and complete answer review', async () => {
    renderResult(repository(vi.fn().mockResolvedValue(completedSession)));

    expect(
      await screen.findByRole('heading', { name: '挑戰完成 🎉' }),
    ).toBeVisible();
    expect(screen.getByText('總分 150')).toBeVisible();
    expect(screen.getByText('+750 XP')).toBeVisible();
    expect(screen.getByText('+250 Token')).toBeVisible();
    expect(screen.getByText('答對 1 / 2 題')).toBeVisible();
    expect(screen.queryByText(/積分/u)).toBeNull();
    expect(screen.getByRole('heading', { name: '✓ 答對' })).toBeVisible();
    expect(screen.getByRole('heading', { name: '✕ 答錯' })).toBeVisible();
    expect(screen.getAllByText('我的答案')).toHaveLength(2);
    expect(screen.getAllByText('正確答案')).toHaveLength(2);
    expect(screen.getByText('CMYK')).toBeVisible();
    expect(screen.getByText('CMYK 適合描述印刷油墨。')).toBeVisible();
    expect(screen.getByRole('link', { name: '再玩一次' })).toHaveAttribute(
      'href',
      `/app/quiz/new?template=${templateId}`,
    );
    expect(screen.getByRole('link', { name: '回章節' })).toHaveAttribute(
      'href',
      '/app',
    );
  });

  it('explains the authoritative daily decay without inventing Token rewards', async () => {
    renderResult(
      repository(
        vi.fn().mockResolvedValue({
          ...completedSession,
          rewardRatePercent: 20,
          tokensAwarded: 0,
          xpAwarded: 10,
        }),
      ),
    );

    expect(await screen.findByText('+10 XP')).toBeVisible();
    expect(screen.getByText('+0 Token')).toBeVisible();
    expect(
      screen.getByText('今日同一挑戰已完成 3 次，本次 XP 為 20%，Token 為 0。'),
    ).toBeVisible();
  });

  it('shows explicit zero rewards from the server for an incorrect run', async () => {
    renderResult(
      repository(
        vi.fn().mockResolvedValue({
          ...completedSession,
          tokensAwarded: 0,
          xpAwarded: 0,
        }),
      ),
    );

    expect(await screen.findByText('+0 XP')).toBeVisible();
    expect(screen.getByText('+0 Token')).toBeVisible();
  });

  it('shows a safe error instead of another student session', async () => {
    renderResult(
      repository(
        vi.fn().mockRejectedValue(new QuizRepositoryError('SESSION_NOT_FOUND')),
      ),
    );

    expect(
      await screen.findByRole('heading', { name: '無法顯示結果' }),
    ).toBeVisible();
    expect(
      screen.getByText('找不到這次挑戰，或你沒有檢視權限。'),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: '回章節' })).toBeVisible();
  });

  it('renders the night victory scene with a decorative banner and loot chest', async () => {
    renderResult(repository(vi.fn().mockResolvedValue(completedSession)));

    expect(
      await screen.findByRole('heading', { name: '挑戰完成 🎉' }),
    ).toBeVisible();
    const section = document.querySelector('section.quiz-result');
    expect(section).toHaveClass('scene-night', 'victory-scene');
    const banner = document.querySelector('.victory-banner');
    expect(banner).toHaveAttribute('aria-hidden', 'true');
    expect(banner).toHaveTextContent('VICTORY');
    expect(document.querySelector('.loot-chest')).not.toBeNull();
    expect(screen.getByText('總分 150')).toBeVisible();
    expect(screen.getByText('+750 XP')).toBeVisible();
  });

  it('celebrates a level up only when arriving fresh from finalize', async () => {
    renderResult(repository(vi.fn().mockResolvedValue(completedSession)), {
      economyRepository: {
        getSummary: vi.fn().mockResolvedValue(economySummary),
      },
      state: { fromFinalize: true },
    });

    expect(await screen.findByText(/LEVEL UP/u)).toBeVisible();
    expect(screen.getByText(/Lv\.2/u)).toBeVisible();
  });

  it('stays silent about levels when revisiting the result page', async () => {
    renderResult(repository(vi.fn().mockResolvedValue(completedSession)), {
      economyRepository: {
        getSummary: vi.fn().mockResolvedValue(economySummary),
      },
    });

    await screen.findByRole('heading', { name: '挑戰完成 🎉' });
    expect(screen.queryByText(/LEVEL UP/u)).toBeNull();
  });

  it('lists only achievements unlocked by this session', async () => {
    renderResult(repository(vi.fn().mockResolvedValue(completedSession)), {
      achievementRepository: {
        getCatalog: vi.fn().mockResolvedValue(
          catalog([
            {
              badgeKey: 'first_quiz',
              description: '完成第一場挑戰',
              displayName: '初出茅廬',
              progress: 1,
              stableCode: 'first_quiz',
              state: 'unlocked',
              target: 1,
              unlockedAt: completedSession.completedAt,
            },
            {
              badgeKey: 'older',
              description: '更早解鎖',
              displayName: '昔日榮光',
              progress: 1,
              stableCode: 'older',
              state: 'unlocked',
              target: 1,
              unlockedAt: '2026-07-01T00:00:00.000Z',
            },
          ]),
        ),
      },
    });

    expect(await screen.findByText('本次新解鎖成就')).toBeVisible();
    expect(screen.getByText('初出茅廬')).toBeVisible();
    expect(screen.queryByText('昔日榮光')).toBeNull();
  });
});
