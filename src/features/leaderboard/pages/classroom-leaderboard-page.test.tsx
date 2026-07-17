import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { InventoryRepository } from '../../inventory/types';
import {
  type ClassroomLeaderboard,
  type LeaderboardRepository,
  LeaderboardRepositoryError,
} from '../types';
import { ClassroomLeaderboardPage } from './classroom-leaderboard-page';

const classroomId = 'ca000000-0000-4000-8000-000000000001';
const board: ClassroomLeaderboard = {
  classroomId,
  classroomName: '色彩一班',
  generatedAt: '2026-07-17T02:00:00.000Z',
  selfEntry: null,
  topEntries: [],
};
const inventoryRepository: InventoryRepository = {
  equipBlook: vi.fn(),
  getInventory: vi.fn().mockResolvedValue({
    activeBlookId: '50000000-0000-0000-0000-000000000001',
    items: [],
    tokenBalance: 0,
  }),
  purchaseBlook: vi.fn(),
};
const renderPage = (leaderboardRepository: LeaderboardRepository) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  }
  render(
    <ClassroomLeaderboardPage
      classroomId={classroomId}
      inventoryRepository={inventoryRepository}
      leaderboardRepository={leaderboardRepository}
    />,
    { wrapper: Wrapper },
  );
  return client;
};

const collectKeys = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.flatMap(collectKeys);
  if (typeof value !== 'object' || value === null) return [];
  return Object.entries(value).flatMap(([key, child]) => [
    key,
    ...collectKeys(child),
  ]);
};

describe('ClassroomLeaderboardPage', () => {
  it('shows loading then an explicit empty leaderboard without private keys', async () => {
    let resolve!: (value: ClassroomLeaderboard) => void;
    const getClassroomLeaderboard = vi.fn(
      () => new Promise<ClassroomLeaderboard>((done) => (resolve = done)),
    );
    const client = renderPage({ getClassroomLeaderboard });
    expect(screen.getByRole('status', { name: '頁面載入中' })).toBeVisible();
    resolve(board);
    expect(
      await screen.findByRole('heading', { name: '色彩一班排行榜' }),
    ).toBeVisible();
    expect(screen.getByText('目前還沒有可排行的學生。')).toBeVisible();
    const forbidden = /email|student_number|user_id|answer/iu;
    expect(collectKeys(board).some((key) => forbidden.test(key))).toBe(false);
    expect(
      client
        .getQueryCache()
        .getAll()
        .flatMap((query) => collectKeys(query.state.data))
        .some((key) => forbidden.test(key)),
    ).toBe(false);
  });

  it('shows the same safe denial for unauthorized and unavailable classrooms and retries', async () => {
    const getClassroomLeaderboard = vi
      .fn()
      .mockRejectedValueOnce(new LeaderboardRepositoryError('NOT_AVAILABLE'))
      .mockResolvedValue(board);
    renderPage({ getClassroomLeaderboard });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '無法顯示排行榜，請確認班級成員資格或稍後重試。',
    );
    await userEvent.click(screen.getByRole('button', { name: '重試' }));
    expect(
      await screen.findByRole('heading', { name: '色彩一班排行榜' }),
    ).toBeVisible();
    expect(getClassroomLeaderboard).toHaveBeenCalledTimes(2);
  });
});
