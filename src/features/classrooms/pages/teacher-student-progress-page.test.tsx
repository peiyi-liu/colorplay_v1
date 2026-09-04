import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { ClassroomRepository, StudentProgressSnapshot } from '../types';
import { TeacherStudentProgressPage } from './teacher-student-progress-page';

const classroomId = 'ca000000-0000-4000-8000-000000000001';
const memberRef = 'cb000000-0000-4000-8000-000000000001';

const snapshot: StudentProgressSnapshot = {
  chapters: [
    {
      accuracy: 88,
      assessmentAccuracy: 74.3,
      chapterQuizAccuracy: 80,
      chapterId: 'cc000000-0000-4000-8000-000000000001',
      chapterTitle: '第三章：色彩表示',
      coverage: 92,
      mastery: 86,
      liveAccuracy: 67,
      reviewCompleted: 3,
      reviewTotal: 3,
      sectionQuizAccuracy: 76,
      status: 'mastered',
    },
    {
      accuracy: null,
      assessmentAccuracy: null,
      chapterQuizAccuracy: null,
      chapterId: 'cc000000-0000-4000-8000-000000000002',
      chapterTitle: '第一章：色彩與光源',
      coverage: null,
      mastery: null,
      liveAccuracy: null,
      reviewCompleted: 0,
      reviewTotal: null,
      sectionQuizAccuracy: null,
      status: 'not_started',
    },
  ],
  identity: {
    displayName: '光譜獵人',
    fullName: '陳品妍',
    joinedAt: '2026-07-18T01:00:00+00:00',
    loginAccount: 's1130201',
    membershipStatus: 'active',
  },
  stats: {
    avgAccuracy: 86,
    classRank: 1,
    classXp: 2140,
    openMistakeCount: 2,
    totalMistakeCount: 30,
    unfinishedMistakeCount: 14,
  },
};

const repository = (
  overrides: Partial<ClassroomRepository> = {},
): ClassroomRepository => ({
  createClassroom: vi.fn(),
  getOwnedMembers: vi.fn(),
  getStudentProgress: vi.fn().mockResolvedValue(snapshot),
  joinClassroom: vi.fn(),
  listMine: vi.fn(),
  listOwned: vi.fn(),
  rotateJoinCode: vi.fn(),
  ...overrides,
});

const renderPage = (classroomRepository: ClassroomRepository) => {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return (
      <QueryClientProvider client={client}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    );
  }
  render(
    <TeacherStudentProgressPage
      classroomId={classroomId}
      menu={<nav>教師選單</nav>}
      memberRef={memberRef}
      repository={classroomRepository}
    />,
    { wrapper: Wrapper },
  );
};

describe('TeacherStudentProgressPage', () => {
  it('renders the identity header and server-computed stat cards', async () => {
    const classroomRepository = repository();
    renderPage(classroomRepository);

    expect(
      await screen.findByRole('heading', { name: '陳品妍 的學習進度' }),
    ).toBeVisible();
    expect(screen.getByText(/學號 s1130201/u)).toBeVisible();
    expect(screen.getByText('2,140')).toBeVisible();
    expect(screen.getByText('平均正確率').nextElementSibling).toHaveTextContent(
      '86.0%',
    );
    expect(classroomRepository.getStudentProgress).toHaveBeenCalledWith(
      classroomId,
      memberRef,
    );
  });

  it('renders chapter rows with split assessment accuracy and no mistake list', async () => {
    renderPage(repository());

    const chapter = (await screen.findAllByTestId('chapter-disclosure'))[0];
    expect(chapter).toBeDefined();
    if (!chapter) throw new Error('missing chapter disclosure');
    expect(
      within(chapter).getByTestId('chapter-disclosure-chevron'),
    ).toBeVisible();
    expect(chapter.querySelector('summary')).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    await userEvent.click(within(chapter).getByText('第三章：色彩表示'));
    expect(chapter.querySelector('summary')).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(within(chapter).getByText('3 / 3')).toBeVisible();
    expect(screen.getAllByText('已完成').length).toBeGreaterThan(0);
    expect(screen.getAllByText('尚未開始').length).toBeGreaterThan(0);
    expect(
      screen.getByText(/74.3%（小節 76.0%／章節 80.0%／Live 67.0%）/u),
    ).toBeVisible();
    expect(screen.getByText('14/30')).toBeVisible();
    expect(screen.queryByRole('heading', { name: '待補救錯題' })).toBeNull();
    expect(
      within(screen.getByLabelText('學生進度摘要')).getAllByRole('definition'),
    ).toHaveLength(4);
  });

  it('marks deactivated members and keeps their record readable', async () => {
    renderPage(
      repository({
        getStudentProgress: vi.fn().mockResolvedValue({
          ...snapshot,
          identity: { ...snapshot.identity, membershipStatus: 'inactive' },
          stats: { ...snapshot.stats, classRank: null },
        }),
      }),
    );

    expect(
      await screen.findByText('此成員已停用，資料為停用前的紀錄。'),
    ).toBeVisible();
    expect(screen.getByText('班級名次').nextElementSibling).toHaveTextContent(
      '—',
    );
  });

  it('surfaces an ownership error with a retry action', async () => {
    renderPage(
      repository({
        getStudentProgress: vi.fn().mockRejectedValue(new Error('42501')),
      }),
    );

    expect(
      await screen.findByText('無法載入學生資料，或你沒有管理權限。'),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: '重新載入' })).toBeVisible();
  });
});
