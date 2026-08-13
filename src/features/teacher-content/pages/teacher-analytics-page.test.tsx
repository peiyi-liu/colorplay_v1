import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ClassroomRepository,
  OwnedClassroom,
} from '../../classrooms/types';
import type { TeacherContentRepository } from '../api/teacher-content-repository';
import { TeacherAnalyticsPage } from './teacher-analytics-page';

vi.mock('../../learning/api/chapters', () => ({
  usePublishedChapters: () => ({
    data: [
      {
        id: '21000000-0000-0000-0000-000000000003',
        title: '色彩表示',
      },
    ],
    isPending: false,
  }),
}));

const classroom: OwnedClassroom = {
  classroomId: '29100000-0000-0000-0000-000000000001',
  classroomName: '七年級 A 班',
  classroomStatus: 'active',
  createdAt: '2026-07-01T00:00:00+00:00',
  joinCode: null,
  joinCodeVersion: 1,
  memberCount: 30,
};
const classrooms = {
  listOwned: vi.fn().mockResolvedValue([classroom]),
} as unknown as ClassroomRepository;

const repositoryOf = (
  overrides: Partial<TeacherContentRepository> = {},
): TeacherContentRepository =>
  ({
    getAssessmentQuestions: vi.fn().mockResolvedValue([
      {
        attempts: 10,
        chapter_id: '21000000-0000-0000-0000-000000000003',
        chapter_sort_order: 3,
        chapter_title: '色彩表示',
        correct_rate: 40,
        prompt: '色光三原色為何？',
        section_id: '22000000-0000-0000-0000-000000000001',
        section_sort_order: 1,
        section_title: '色彩三要素',
        stable_code: 'QB3101',
      },
    ]),
    getChapterCompletion: vi.fn().mockResolvedValue([
      {
        chapter_id: '21000000-0000-0000-0000-000000000003',
        chapter_sort_order: 3,
        chapter_title: '第 3 章 色彩表示',
        completed_students: 17,
        completion_rate: 56.7,
        student_statuses: [],
        total_students: 30,
      },
    ]),
    getClassroomOverview: vi.fn().mockResolvedValue({
      averageAccuracy: 76,
      completedStudents: 17,
      totalStudents: 30,
      worstSubtopicCode: '3-1',
      worstSubtopicTitle: '色彩三要素與色名的表示',
    }),
    getLiveHistory: vi.fn().mockResolvedValue({
      rows: [
        {
          activity_title: '3-1 色彩三要素',
          answers: 20,
          classroom_name: '七年級 A 班',
          completed_at: '2026-08-13T05:00:00+00:00',
          correct_rate: 70,
          participants: 10,
          session_id: '29600000-0000-0000-0000-000000000001',
          total_count: 6,
        },
      ],
      total: 6,
    }),
    getQuestionDetail: vi.fn(),
    ...overrides,
  }) as unknown as TeacherContentRepository;

function renderPage(repository: TeacherContentRepository) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/teacher']}>{children}</MemoryRouter>
    </QueryClientProvider>
  );
  return render(
    <TeacherAnalyticsPage
      classroomRepository={classrooms}
      menu={<nav aria-label="測試教師導覽" />}
      repository={repository}
    />,
    { wrapper },
  );
}

describe('TeacherAnalyticsPage', () => {
  beforeEach(() => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: true,
      media: '(min-width: 768px) and (orientation: landscape)',
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    });
  });

  it('renders the approved four-block home and truthful metrics', async () => {
    renderPage(repositoryOf());

    expect(await screen.findByRole('form', { name: '分析篩選' })).toBeVisible();
    expect(screen.getByText('七年級 A 班 · 全部章節')).toBeVisible();
    expect(screen.queryByLabelText('子題')).toBeNull();
    expect(
      await screen.findByRole('region', { name: '班級總覽' }),
    ).toHaveTextContent('17/30');
    expect(screen.getByRole('region', { name: '班級總覽' })).toHaveTextContent(
      '76.0%',
    );
    expect(screen.getByRole('link', { name: '題目分析' })).toHaveAttribute(
      'href',
      `/teacher/questions?classroomId=${classroom.classroomId}`,
    );
    expect(screen.getByRole('region', { name: 'Live 課程' })).toHaveTextContent(
      '七年級 A 班',
    );
  });

  it('switches source without fabricating chapter completion for Live', async () => {
    const getAssessmentQuestions = vi.fn().mockResolvedValue([]);
    renderPage(repositoryOf({ getAssessmentQuestions }));

    const sourceTabs = await screen.findByRole('group', { name: '題目來源' });
    await userEvent.click(
      within(sourceTabs).getByRole('button', { name: 'Live 課堂' }),
    );
    await waitFor(() => {
      expect(getAssessmentQuestions).toHaveBeenLastCalledWith(
        classroom.classroomId,
        {},
        'live',
      );
    });
    expect(screen.queryByText('各章節完成人數')).toBeNull();
    expect(screen.getByText('目前篩選範圍尚無作答資料。')).toBeVisible();
  });

  it('paginates Live history in five-row server pages', async () => {
    const getLiveHistory = vi
      .fn()
      .mockResolvedValueOnce({ rows: [], total: 6 })
      .mockResolvedValueOnce({ rows: [], total: 6 });
    renderPage(repositoryOf({ getLiveHistory }));

    await userEvent.click(
      await screen.findByRole('button', { name: '下一頁' }),
    );
    await waitFor(() => {
      expect(getLiveHistory).toHaveBeenLastCalledWith(
        classroom.classroomId,
        {},
        2,
        5,
      );
    });
  });

  it('shows explicit loading failure instead of fake zeroes', async () => {
    const getClassroomOverview = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({
        averageAccuracy: null,
        completedStudents: 0,
        totalStudents: 0,
        worstSubtopicCode: null,
        worstSubtopicTitle: null,
      });
    renderPage(
      repositoryOf({
        getClassroomOverview,
      }),
    );
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      '班級總覽暫時無法取得',
    );
    expect(screen.queryByText('0%')).toBeNull();
    await userEvent.click(
      within(alert).getByRole('button', { name: '重新載入班級總覽' }),
    );
    expect((await screen.findAllByText('—')).length).toBeGreaterThan(0);
    expect(getClassroomOverview).toHaveBeenCalledTimes(2);
  });

  it('keeps the conclusion and detail regions in decision order', async () => {
    renderPage(repositoryOf());

    const filters = await screen.findByRole('form', { name: '分析篩選' });
    const overview = screen.getByRole('region', { name: '班級總覽' });
    const sources = screen.getByRole('group', { name: '題目來源' });
    const questions = screen.getByRole('region', { name: '題目分析' });
    const live = screen.getByRole('region', { name: 'Live 課程' });
    expect(filters.compareDocumentPosition(overview)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(overview.compareDocumentPosition(sources)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(sources.compareDocumentPosition(questions)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(questions.compareDocumentPosition(live)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });
});
