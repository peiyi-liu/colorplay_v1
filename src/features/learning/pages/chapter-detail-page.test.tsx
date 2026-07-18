import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { LearningRepository } from '../api/learning-repository';
import {
  isCardCompleted,
  percentText,
  reviewText,
  ChapterDetailPage,
} from './chapter-detail-page';

vi.mock('../api/chapters', async (importOriginal) => {
  const original = await importOriginal<typeof import('../api/chapters')>();
  return {
    ...original,
    usePublishedChapters: () => ({
      data: [
        {
          description: '',
          id: '21000000-0000-0000-0000-000000000003',
          isPlayable: true,
          sortOrder: 3,
          stableCode: 'chapter-3',
          template: {
            id: '26000000-0000-0000-0000-000000000003',
            questionCount: 10,
            title: '色彩體系與應用',
          },
          title: '色彩體系與應用',
        },
      ],
      error: null,
      isError: false,
      isPending: false,
      refetch: vi.fn(),
    }),
  };
});

const sections = [
  {
    sectionId: 'cd732278-0bfe-1293-19e1-338db3fe6a3c',
    sortOrder: 1,
    stableCode: 'sheet-3-1',
    subtopics: [
      {
        cards: [
          {
            cardId: '25500000-0000-0000-0000-000000000001',
            content: '第一行\n\n第二行',
            groupLabel: '色彩的分類',
            media: [
              {
                altText: '十二色相環示意圖',
                assetPath: '/media/review/color-wheel.svg',
              },
            ],
            requiresRecompletion: false,
            sortOrder: 1,
            title: '有彩色與無彩色',
            version: 1,
          },
          {
            cardId: '25500000-0000-0000-0000-000000000002',
            content: '內容乙',
            groupLabel: '色彩三要素',
            media: [],
            requiresRecompletion: false,
            sortOrder: 2,
            title: '甚麼是HVC',
            version: 1,
          },
        ],
        sortOrder: 1,
        stableCode: 'sheet-3-1-all',
        subtopicId: 'f929cde5-c294-46ce-5faf-c866b3cb9583',
        title: '3-1 色彩三要素與色名的表示',
      },
    ],
    title: '3-1 色彩三要素與色名的表示',
  },
] as const;

const progressRows = [
  {
    accuracy: 66.7,
    chapterId: '21000000-0000-0000-0000-000000000003',
    coverage: 23.1,
    mastery: 15.4,
    reviewCompleted: 1,
    reviewTotal: 3,
    rulesVersion: '2026-07-progress-1',
    scope: 'subtopic' as const,
    status: 'learning' as const,
    subtopicId: 'f929cde5-c294-46ce-5faf-c866b3cb9583',
  },
  {
    accuracy: 95.7,
    chapterId: '21000000-0000-0000-0000-000000000003',
    coverage: 62.2,
    mastery: 59.5,
    reviewCompleted: 1,
    reviewTotal: 3,
    rulesVersion: '2026-07-progress-1',
    scope: 'chapter' as const,
    status: 'learning' as const,
    subtopicId: null,
  },
];

const repositoryWith = (
  overrides: Partial<LearningRepository> = {},
): LearningRepository =>
  ({
    completeReviewCard: vi.fn().mockResolvedValue(undefined),
    getClassroomProgress: vi.fn().mockResolvedValue([]),
    getLearningProgress: vi.fn().mockResolvedValue(progressRows),
    listChapterReview: vi.fn().mockResolvedValue(sections),
    listMistakes: vi.fn().mockResolvedValue([]),
    listReviewProgress: vi.fn().mockResolvedValue([
      {
        cardVersion: 1,
        reviewCardId: '25500000-0000-0000-0000-000000000001',
      },
    ]),
    requestHint: vi.fn(),
    startRemediation: vi.fn(),
    ...overrides,
  }) satisfies LearningRepository;

const renderPage = (repository: LearningRepository) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
  return render(
    <ChapterDetailPage
      chapterId="21000000-0000-0000-0000-000000000003"
      repository={repository}
    />,
    { wrapper },
  );
};

describe('ChapterDetailPage', () => {
  it('renders subtopic progress, cards, media, and completion states', async () => {
    renderPage(repositoryWith());

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: '色彩體系與應用' }),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByRole('heading', { name: '3-1 色彩三要素與色名的表示' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('章節進度')).toHaveTextContent(
      '複習完成 1 / 3・精熟 59.5%・學習中',
    );
    expect(
      screen.getByRole('img', { name: '十二色相環示意圖' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('已完成複習');
    expect(
      screen.getByRole('button', { name: '完成複習' }),
    ).toBeInTheDocument();
  });

  it('completes a card through the trusted command', async () => {
    const repository = repositoryWith();
    renderPage(repository);

    const button = await screen.findByRole('button', { name: '完成複習' });
    fireEvent.click(button);

    await waitFor(() => {
      expect(repository.completeReviewCard).toHaveBeenCalledWith(
        expect.objectContaining({
          reviewCardId: '25500000-0000-0000-0000-000000000002',
        }),
      );
    });
  });

  it('shows a fallback when card media fails to load', async () => {
    renderPage(repositoryWith());

    const image = await screen.findByRole('img', {
      name: '十二色相環示意圖',
    });
    fireEvent.error(image);

    expect(
      screen.getByText(/圖片載入失敗：十二色相環示意圖/u),
    ).toBeInTheDocument();
  });

  it('surfaces a retryable error state', async () => {
    renderPage(
      repositoryWith({
        listChapterReview: vi.fn().mockRejectedValue(new Error('boom')),
      }),
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        '無法載入章節內容，請稍後重試。',
      );
    });
    expect(screen.getByRole('button', { name: '重試' })).toBeInTheDocument();
  });

  it('derives completion with the recompletion rule', () => {
    const completions = [{ cardVersion: 1, reviewCardId: 'card-a' }] as const;
    expect(
      isCardCompleted(
        { cardId: 'card-a', requiresRecompletion: true, version: 2 },
        completions,
      ),
    ).toBe(false);
    expect(
      isCardCompleted(
        { cardId: 'card-a', requiresRecompletion: false, version: 2 },
        completions,
      ),
    ).toBe(true);
    expect(percentText(null)).toBe('—');
    expect(reviewText(0, null)).toBe('—');
  });
});
