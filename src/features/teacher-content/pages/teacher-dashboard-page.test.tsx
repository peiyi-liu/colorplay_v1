import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type {
  ClassroomRepository,
  OwnedClassroom,
} from '../../classrooms/types';
import type { TeacherContentRepository } from '../api/teacher-content-repository';
import { TeacherDashboardPage } from './teacher-dashboard-page';

const ownedClassrooms: readonly OwnedClassroom[] = [
  {
    classroomId: '29100000-0000-0000-0000-000000000001',
    classroomName: '七年級 A 班',
    classroomStatus: 'active',
    createdAt: '2026-07-01T00:00:00+00:00',
    joinCodeVersion: 1,
    memberCount: 4,
  },
  {
    classroomId: '29100000-0000-0000-0000-000000000002',
    classroomName: '七年級 B 班',
    classroomStatus: 'active',
    createdAt: '2026-07-02T00:00:00+00:00',
    joinCodeVersion: 1,
    memberCount: 2,
  },
];

const classroomRepositoryOf = (
  rows: readonly OwnedClassroom[],
): ClassroomRepository =>
  ({
    listOwned: vi.fn().mockResolvedValue(rows),
  }) as unknown as ClassroomRepository;

const teacherRepositoryOf = (summary: unknown): TeacherContentRepository =>
  ({
    getClassroomSummary: vi.fn().mockResolvedValue(summary),
  }) as unknown as TeacherContentRepository;

const renderPage = (
  repository: TeacherContentRepository,
  classroomRepository: ClassroomRepository,
) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
  return render(
    <TeacherDashboardPage
      classroomRepository={classroomRepository}
      repository={repository}
    />,
    { wrapper },
  );
};

describe('TeacherDashboardPage', () => {
  it('renders summary cards for the first owned classroom', async () => {
    const repository = teacherRepositoryOf({
      attempts: 12,
      averageAccuracy: 66.7,
      uniqueStudents: 4,
      worstSubtopicTitle: '3-1 色彩三要素與色名的表示',
    });
    renderPage(repository, classroomRepositoryOf(ownedClassrooms));

    await waitFor(() => {
      expect(screen.getByText('12')).toBeInTheDocument();
    });
    expect(repository.getClassroomSummary).toHaveBeenCalledWith(
      '29100000-0000-0000-0000-000000000001',
      {},
    );
    expect(screen.getByText('66.7%')).toBeInTheDocument();
    expect(screen.getByText(/3-1 色彩三要素與色名的表示/u)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '教學分析' })).toHaveAttribute(
      'href',
      '/teacher/analytics',
    );
    expect(screen.getByRole('link', { name: '內容工作區' })).toHaveAttribute(
      'href',
      '/teacher/content',
    );
    expect(screen.getByRole('link', { name: '匯入內容' })).toHaveAttribute(
      'href',
      '/teacher/import',
    );
  });

  it('refetches the summary when the teacher switches classrooms', async () => {
    const repository = teacherRepositoryOf({
      attempts: 0,
      averageAccuracy: null,
      uniqueStudents: 0,
      worstSubtopicTitle: null,
    });
    renderPage(repository, classroomRepositoryOf(ownedClassrooms));

    const select = await screen.findByLabelText('選擇班級');
    await userEvent.selectOptions(select, '七年級 B 班');

    await waitFor(() => {
      expect(repository.getClassroomSummary).toHaveBeenCalledWith(
        '29100000-0000-0000-0000-000000000002',
        {},
      );
    });
  });

  it('renders em-dash empty states instead of misleading zeros', async () => {
    const repository = teacherRepositoryOf({
      attempts: 0,
      averageAccuracy: null,
      uniqueStudents: 0,
      worstSubtopicTitle: null,
    });
    renderPage(repository, classroomRepositoryOf(ownedClassrooms));

    await waitFor(() => {
      expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
    });
  });

  it('guides a teacher who has no classrooms yet', async () => {
    const repository = teacherRepositoryOf(null);
    renderPage(repository, classroomRepositoryOf([]));

    await waitFor(() => {
      expect(
        screen.getByText('尚未建立班級，先到班級管理建立第一個班級。'),
      ).toBeInTheDocument();
    });
    expect(repository.getClassroomSummary).not.toHaveBeenCalled();
  });

  it('surfaces analytics read failures', async () => {
    const repository = {
      getClassroomSummary: vi.fn().mockRejectedValue(new Error('boom')),
    } as unknown as TeacherContentRepository;
    renderPage(repository, classroomRepositoryOf(ownedClassrooms));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        '分析資料暫時無法取得，請稍後重試。',
      );
    });
  });
});

it('surfaces the ggame live broadcast console entry', async () => {
  renderPage(
    teacherRepositoryOf({
      attempts: 1,
      averageAccuracy: 50,
      uniqueStudents: 1,
      worstSubtopicTitle: null,
    }),
    classroomRepositoryOf(ownedClassrooms),
  );
  expect(
    await screen.findByRole('heading', {
      name: /課堂即時競賽（Live）廣播控制台/u,
    }),
  ).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /前往主持/u })).toHaveAttribute(
    'href',
    '/teacher/live',
  );
  expect(screen.getByText('📊 教師決策工具')).toBeInTheDocument();
});
