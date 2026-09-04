import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { ClassroomRepository } from '../types';
import { TeacherClassroomDetailPage } from './teacher-classroom-detail-page';

const classroomId = 'ca000000-0000-4000-8000-000000000001';
const repository = (
  overrides: Partial<ClassroomRepository> = {},
): ClassroomRepository => ({
  createClassroom: vi.fn(),
  getOwnedMembers: vi.fn().mockResolvedValue([
    {
      activeBlookId: '50000000-0000-0000-0000-000000000001',
      displayName: '學生一',
      fullName: '陳品妍',
      joinedAt: '2026-07-17T01:00:00.000Z',
      loginAccount: 's1130201',
      memberRef: 'cb000000-0000-4000-8000-000000000001',
      membershipStatus: 'active',
    },
  ]),
  getStudentProgress: vi.fn(),
  joinClassroom: vi.fn(),
  listMine: vi.fn(),
  // Phase 5V Task 3：加入碼摘要徽章新增呼叫既有 useOwnedClassrooms，這裡補上
  // 對應班級的 fixture，讓徽章可以渲染出真實資料；不動其餘 mock 設置。
  listOwned: vi.fn().mockResolvedValue([
    {
      classroomId,
      classroomName: '色彩一班',
      classroomStatus: 'active',
      createdAt: '2026-07-01T00:00:00.000Z',
      joinCode: 'ABCD-1234-EF56-7890',
      joinCodeVersion: 1,
      memberCount: 1,
    },
  ]),
  rotateJoinCode: vi.fn().mockResolvedValue({
    classroomId,
    classroomName: null,
    joinCode: 'DCBA-4321-65FE-0987',
    joinCodeVersion: 2,
  }),
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
    <TeacherClassroomDetailPage
      classroomId={classroomId}
      menu={<nav>教師選單</nav>}
      repository={classroomRepository}
    />,
    { wrapper: Wrapper },
  );
};

describe('TeacherClassroomDetailPage', () => {
  it('renders owner-safe member rows without Email or UUID', async () => {
    const classroomRepository = repository();
    renderPage(classroomRepository);
    expect((await screen.findAllByText('學生一')).length).toBeGreaterThan(0);
    expect(screen.getByText('學生人數 1')).toBeVisible();
    const row = screen.getByTestId('member-disclosure');
    expect(within(row).getByTestId('member-disclosure-chevron')).toBeVisible();
    expect(row.querySelector('summary')).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    const summary = row.querySelector('summary');
    expect(summary).not.toBeNull();
    if (!summary) throw new Error('missing member disclosure summary');
    await userEvent.click(summary);
    expect(row.querySelector('summary')).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(within(row).getByText('陳品妍')).toBeVisible();
    expect(within(row).getAllByText('s1130201')).toHaveLength(2);
    expect(within(row).getByRole('link', { name: '查看細節' })).toHaveAttribute(
      'href',
      `/teacher/classes/${classroomId}/members/cb000000-0000-4000-8000-000000000001`,
    );
    expect(document.body).not.toHaveTextContent('@');
    expect(document.body).not.toHaveTextContent(
      '50000000-0000-0000-0000-000000000001',
    );
    expect(document.body).not.toHaveTextContent(/學習中|離線|在線/u);
    expect(document.querySelector('img')).toBeNull();
    expect(classroomRepository.getOwnedMembers).toHaveBeenCalledOnce();
    expect(classroomRepository.listOwned).toHaveBeenCalledOnce();
  });

  it('顯示加入碼摘要徽章（沿用既有 useOwnedClassrooms，非新 repository method）', async () => {
    renderPage(repository());
    expect(
      await screen.findByText('班級加入代碼 ABCD-1234-EF56-7890'),
    ).toBeVisible();
  });

  it('uses membership eligibility copy for inactive members', async () => {
    renderPage(
      repository({
        getOwnedMembers: vi.fn().mockResolvedValue([
          {
            activeBlookId: null,
            displayName: '停用學生',
            fullName: null,
            joinedAt: '2026-07-17T01:00:00.000Z',
            loginAccount: null,
            memberRef: 'cb000000-0000-4000-8000-000000000002',
            membershipStatus: 'inactive',
          },
        ]),
      }),
    );
    expect((await screen.findAllByText('已停用')).length).toBeGreaterThan(0);
    expect(document.body).not.toHaveTextContent(/學習中|離線|在線/u);
  });
});
