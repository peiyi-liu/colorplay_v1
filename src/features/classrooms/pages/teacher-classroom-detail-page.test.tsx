import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
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
      joinedAt: '2026-07-17T01:00:00.000Z',
      membershipStatus: 'active',
    },
  ]),
  joinClassroom: vi.fn(),
  listMine: vi.fn(),
  listOwned: vi.fn(),
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
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  }
  render(
    <TeacherClassroomDetailPage
      classroomId={classroomId}
      repository={classroomRepository}
    />,
    { wrapper: Wrapper },
  );
};

describe('TeacherClassroomDetailPage', () => {
  it('renders owner-safe member rows without Email or UUID', async () => {
    renderPage(repository());
    expect(await screen.findByText('學生一')).toBeVisible();
    expect(screen.getByText('已裝備 Blook')).toBeVisible();
    expect(screen.getByText('有效成員')).toBeVisible();
    expect(document.body).not.toHaveTextContent('@');
    expect(document.body).not.toHaveTextContent(
      '50000000-0000-0000-0000-000000000001',
    );
  });

  it('requires rotation confirmation and shows only the new one-time receipt', async () => {
    const rotateJoinCode = vi.fn().mockResolvedValue({
      classroomId,
      classroomName: null,
      joinCode: 'DCBA-4321-65FE-0987',
      joinCodeVersion: 2,
    });
    renderPage(repository({ rotateJoinCode }));
    await screen.findByText('學生一');
    await userEvent.click(screen.getByRole('button', { name: '輪替加入碼' }));
    expect(rotateJoinCode).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toHaveTextContent('舊加入碼會立即失效');
    await userEvent.click(screen.getByRole('button', { name: '確認輪替' }));
    expect(rotateJoinCode).toHaveBeenCalledOnce();
    expect(await screen.findByText('DCBA-4321-65FE-0987')).toBeVisible();
  });
});
