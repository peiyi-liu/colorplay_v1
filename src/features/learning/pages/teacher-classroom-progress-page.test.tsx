import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { LearningRepository } from '../api/learning-repository';
import { TeacherClassroomProgressPage } from './teacher-classroom-progress-page';

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
    <TeacherClassroomProgressPage
      classroomId="25100000-0000-0000-0000-000000000001"
      repository={repository}
    />,
    { wrapper },
  );
};

describe('TeacherClassroomProgressPage', () => {
  it('renders the trusted per-student mastery projection', async () => {
    const repository = {
      getClassroomProgress: vi.fn().mockResolvedValue([
        {
          chapterId: '21000000-0000-0000-0000-000000000003',
          displayName: '學生一',
          mastery: 59.5,
          status: 'learning' as const,
          userId: '25000000-0000-0000-0000-000000000001',
        },
      ]),
    } as unknown as LearningRepository;
    renderPage(repository);

    await waitFor(() => {
      expect(screen.getByText('學生一')).toBeInTheDocument();
    });
    expect(screen.getByText('59.5%')).toBeInTheDocument();
    expect(screen.getByText('色彩體系與應用')).toBeInTheDocument();
    expect(repository.getClassroomProgress).toHaveBeenCalledWith(
      '25100000-0000-0000-0000-000000000001',
    );
  });

  it('shows the empty state for zero rows', async () => {
    const repository = {
      getClassroomProgress: vi.fn().mockResolvedValue([]),
    } as unknown as LearningRepository;
    renderPage(repository);

    await waitFor(() => {
      expect(
        screen.getByText('目前沒有可顯示的學習進度。'),
      ).toBeInTheDocument();
    });
  });
});
