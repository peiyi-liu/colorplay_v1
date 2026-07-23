import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type {
  ClassroomRepository,
  OwnedClassroom,
} from '../../classrooms/types';
import type { TeacherContentRepository } from '../api/teacher-content-repository';
import { TeacherAnalyticsPage } from './teacher-analytics-page';

vi.mock('../../learning/api/chapters', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../../learning/api/chapters')>();
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
          template: null,
          title: '色彩表示',
        },
      ],
      error: null,
      isError: false,
      isPending: false,
      refetch: vi.fn(),
    }),
  };
});

const ownedClassrooms: readonly OwnedClassroom[] = [
  {
    classroomId: '29100000-0000-0000-0000-000000000001',
    classroomName: '七年級 A 班',
    classroomStatus: 'active',
    createdAt: '2026-07-01T00:00:00+00:00',
    joinCodeVersion: 1,
    memberCount: 4,
  },
];

const classroomRepository = () =>
  ({
    listOwned: vi.fn().mockResolvedValue(ownedClassrooms),
  }) as unknown as ClassroomRepository;

const teacherRepositoryOf = (
  overrides: Readonly<Record<string, unknown>> = {},
): TeacherContentRepository =>
  ({
    getAssignmentSummary: vi.fn().mockResolvedValue([
      {
        assignment_id: '29400000-0000-0000-0000-000000000001',
        attempts: 1,
        completed: 1,
        passed: 1,
        status: 'published',
        targets: 1,
        title: '分析測試作業',
      },
    ]),
    getClassroomSummary: vi.fn().mockResolvedValue({
      attempts: 3,
      averageAccuracy: 66.7,
      uniqueStudents: 1,
      worstSubtopicTitle: '3-1 色彩三要素與色名的表示',
    }),
    getLiveReport: vi.fn().mockResolvedValue([
      {
        activity_title: '分析 Live',
        answers: 9,
        completed_at: '2026-07-18T05:00:00+00:00',
        correct_rate: 77.8,
        participants: 3,
        session_id: '29600000-0000-0000-0000-000000000001',
        state: 'completed',
      },
    ]),
    getQuestionAnalysis: vi.fn().mockResolvedValue([
      {
        attempts: 5,
        correct_rate: 80,
        prompt: '色相環上與紅色相對的顏色是？',
        stable_code: '3-1-01',
      },
    ]),
    getSubtopicMastery: vi.fn().mockResolvedValue([
      {
        accuracy: 50,
        answers: 2,
        students: 1,
        subtopic_code: 'sheet-3-1-all',
        subtopic_title: '3-1 色彩三要素與色名的表示',
      },
    ]),
    listSubtopics: vi.fn().mockResolvedValue([
      {
        stableCode: 'sheet-3-1-all',
        subtopicId: '23000000-0000-0000-0000-000000000001',
        title: '3-1 色彩三要素與色名的表示',
      },
    ]),
    ...overrides,
  }) as unknown as TeacherContentRepository;

const renderPage = (repository: TeacherContentRepository) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
  return render(
    <TeacherAnalyticsPage
      classroomRepository={classroomRepository()}
      repository={repository}
    />,
    { wrapper },
  );
};

describe('TeacherAnalyticsPage', () => {
  it('renders the five projections from the trusted analytics', async () => {
    renderPage(teacherRepositoryOf());

    await waitFor(() => {
      expect(
        screen.getAllByText('色相環上與紅色相對的顏色是？').length,
      ).toBeGreaterThan(0);
    });
    expect(screen.getByText('66.7%')).toBeInTheDocument();
    expect(screen.getByText('80.0%')).toBeInTheDocument();
    expect(screen.getByText('sheet-3-1-all')).toBeInTheDocument();
    expect(screen.getByText('分析測試作業')).toBeInTheDocument();
    expect(screen.getByText('分析 Live')).toBeInTheDocument();
    expect(screen.getByText('77.8%')).toBeInTheDocument();
  });

  it('drives every projection through the shared filters', async () => {
    const repository = teacherRepositoryOf();
    renderPage(repository);

    fireEvent.change(await screen.findByLabelText('開始日期'), {
      target: { value: '2026-07-18' },
    });
    fireEvent.change(screen.getByLabelText('結束日期'), {
      target: { value: '2026-07-18' },
    });
    await userEvent.selectOptions(screen.getByLabelText('章節'), '色彩表示');
    await userEvent.selectOptions(
      screen.getByLabelText('子題'),
      '3-1 色彩三要素與色名的表示',
    );

    await waitFor(() => {
      expect(repository.getQuestionAnalysis).toHaveBeenCalledWith(
        '29100000-0000-0000-0000-000000000001',
        {
          chapterId: '21000000-0000-0000-0000-000000000003',
          from: '2026-07-18',
          subtopicId: '23000000-0000-0000-0000-000000000001',
          to: '2026-07-18',
        },
      );
    });
    expect(repository.getSubtopicMastery).toHaveBeenCalledWith(
      '29100000-0000-0000-0000-000000000001',
      expect.objectContaining({
        subtopicId: '23000000-0000-0000-0000-000000000001',
      }),
    );
    expect(repository.getAssignmentSummary).toHaveBeenCalledWith(
      '29100000-0000-0000-0000-000000000001',
      { from: '2026-07-18', to: '2026-07-18' },
    );
    expect(repository.getLiveReport).toHaveBeenCalledWith(
      '29100000-0000-0000-0000-000000000001',
      { from: '2026-07-18', to: '2026-07-18' },
    );
  });

  it('renders em-dash empty states for an empty scope', async () => {
    renderPage(
      teacherRepositoryOf({
        getAssignmentSummary: vi.fn().mockResolvedValue([]),
        getClassroomSummary: vi.fn().mockResolvedValue({
          attempts: 0,
          averageAccuracy: null,
          uniqueStudents: 0,
          worstSubtopicTitle: null,
        }),
        getLiveReport: vi.fn().mockResolvedValue([]),
        getQuestionAnalysis: vi.fn().mockResolvedValue([]),
        getSubtopicMastery: vi.fn().mockResolvedValue([]),
      }),
    );

    await waitFor(() => {
      expect(screen.getAllByText('此範圍尚無資料。').length).toBe(5);
    });
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });

  it('surfaces analytics read failures', async () => {
    renderPage(
      teacherRepositoryOf({
        getQuestionAnalysis: vi.fn().mockRejectedValue(new Error('boom')),
      }),
    );

    await waitFor(() => {
      expect(screen.getAllByRole('alert')[0]).toHaveTextContent(
        '分析資料暫時無法取得，請稍後重試。',
      );
    });
  });
});

it('derives rule-based high-frequency error cards from question analysis', async () => {
  renderPage(teacherRepositoryOf());

  await waitFor(() => {
    expect(
      screen.getByRole('heading', { name: '班級高頻錯誤概念' }),
    ).toBeInTheDocument();
  });
  // 規則式：取正確率最低的題目為高頻錯誤 1。
  expect(await screen.findByText('高頻錯誤 1')).toBeInTheDocument();
  const region = screen.getByRole('region', { name: '班級高頻錯誤概念' });
  expect(region.textContent).toContain('色相環上與紅色相對的顏色是？');
});
