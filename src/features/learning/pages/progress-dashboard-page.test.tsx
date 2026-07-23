import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { LearningRepository } from '../api/learning-repository';
import { ProgressDashboardPage } from './progress-dashboard-page';

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
        {
          description: '',
          id: '21000000-0000-0000-0000-000000000004',
          isPlayable: true,
          sortOrder: 4,
          stableCode: 'chapter-4',
          template: {
            id: '26000000-0000-0000-0000-000000000004',
            questionCount: 8,
            title: '色彩與視覺',
          },
          title: '色彩與視覺',
        },
      ],
      error: null,
      isError: false,
      isPending: false,
      refetch: vi.fn(),
    }),
  };
});

const progressRows = [
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
  {
    accuracy: null,
    chapterId: '21000000-0000-0000-0000-000000000004',
    coverage: 0,
    mastery: 0,
    reviewCompleted: 0,
    reviewTotal: null,
    rulesVersion: '2026-07-progress-1',
    scope: 'chapter' as const,
    status: 'not_started' as const,
    subtopicId: null,
  },
];

describe('ProgressDashboardPage', () => {
  it('renders one row per chapter with dash placeholders', async () => {
    const repository = {
      getLearningProgress: vi.fn().mockResolvedValue(progressRows),
    } as unknown as LearningRepository;
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    );
    render(<ProgressDashboardPage repository={repository} />, { wrapper });

    await waitFor(() => {
      expect(
        screen.getByRole('link', { name: /色彩體系與應用/u }),
      ).toBeInTheDocument();
    });
    const startedRow = screen
      .getByRole('link', { name: /色彩體系與應用/u })
      .closest('tr');
    expect(startedRow).toHaveTextContent('1 / 3');
    expect(startedRow).toHaveTextContent('59.5%');
    expect(startedRow).toHaveTextContent('學習中');
    const untouchedRow = screen
      .getByRole('link', { name: /色彩與視覺/u })
      .closest('tr');
    expect(untouchedRow).toHaveTextContent('—');
    expect(untouchedRow).toHaveTextContent('尚未開始');
  });
});
