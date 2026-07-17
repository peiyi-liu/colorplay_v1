import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { type ClassroomRepository, ClassroomRepositoryError } from '../types';
import { StudentClassroomsPage } from './student-classrooms-page';

const repository = (
  listMine: ClassroomRepository['listMine'],
): ClassroomRepository => ({
  createClassroom: vi.fn(),
  getOwnedMembers: vi.fn(),
  joinClassroom: vi.fn(),
  listMine,
  listOwned: vi.fn(),
  rotateJoinCode: vi.fn(),
});
const renderPage = (classroomRepository: ClassroomRepository) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return (
      <MemoryRouter>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </MemoryRouter>
    );
  }
  render(<StudentClassroomsPage repository={classroomRepository} />, {
    wrapper: Wrapper,
  });
};

describe('StudentClassroomsPage', () => {
  it('shows shared loading and a truthful empty state', async () => {
    let resolve!: (value: readonly []) => void;
    renderPage(repository(() => new Promise((done) => (resolve = done))));
    expect(screen.getByRole('status', { name: '頁面載入中' })).toBeVisible();
    resolve([]);
    expect(await screen.findByText('你還沒有加入班級。')).toBeVisible();
  });

  it('renders classroom cards with leaderboard links', async () => {
    renderPage(
      repository(
        vi.fn().mockResolvedValue([
          {
            classroomId: 'ca000000-0000-4000-8000-000000000001',
            classroomName: '色彩一班',
            joinedAt: '2026-07-17T01:00:00.000Z',
            membershipStatus: 'active',
          },
        ]),
      ),
    );
    expect(
      await screen.findByRole('heading', { name: '色彩一班' }),
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: '查看色彩一班排行榜' }),
    ).toHaveAttribute(
      'href',
      '/app/leaderboard/ca000000-0000-4000-8000-000000000001',
    );
  });

  it('keeps a retryable query error in context and recovers', async () => {
    const listMine = vi
      .fn()
      .mockRejectedValueOnce(new ClassroomRepositoryError('INVALID_RESPONSE'))
      .mockResolvedValue([]);
    renderPage(repository(listMine));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '班級資料載入失敗',
    );
    await userEvent.click(screen.getByRole('button', { name: '重試' }));
    expect(await screen.findByText('你還沒有加入班級。')).toBeVisible();
    expect(listMine).toHaveBeenCalledTimes(2);
  });
});
