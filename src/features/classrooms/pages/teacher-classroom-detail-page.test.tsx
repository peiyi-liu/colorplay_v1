import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
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
    renderPage(repository());
    expect(await screen.findByText('學生一')).toBeVisible();
    expect(screen.getByText('陳品妍')).toBeVisible();
    expect(screen.getByText('s1130201')).toBeVisible();
    expect(screen.getByText('學生人數 1')).toBeVisible();
    expect(screen.getByRole('link', { name: '查看細節 ›' })).toHaveAttribute(
      'href',
      `/teacher/classes/${classroomId}/members/cb000000-0000-4000-8000-000000000001`,
    );
    expect(document.body).not.toHaveTextContent('@');
    expect(document.body).not.toHaveTextContent(
      '50000000-0000-0000-0000-000000000001',
    );
  });

  it('顯示加入碼摘要徽章（沿用既有 useOwnedClassrooms，非新 repository method）', async () => {
    renderPage(repository());
    expect(
      await screen.findByText('班級加入代碼 ABCD-1234-EF56-7890'),
    ).toBeVisible();
  });
});
