import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  type AchievementCatalog,
  type AchievementRepository,
  AchievementRepositoryError,
} from '../types';
import { AchievementsPage } from './achievements-page';

const catalog: AchievementCatalog = {
  items: [
    {
      badgeKey: 'first_task_complete',
      description: '完成第一次正式挑戰',
      displayName: '初出茅廬',
      progress: 1,
      stableCode: 'first_task_complete',
      state: 'unlocked',
      target: 1,
      unlockedAt: '2026-07-15T16:30:00.000Z',
    },
    {
      badgeKey: 'level_10',
      description: '達到 Level 10',
      displayName: '登峰造極',
      progress: 3,
      stableCode: 'level_10',
      state: 'in_progress',
      target: 10,
      unlockedAt: null,
    },
    ...Array.from({ length: 7 }, (_, index) => ({
      badgeKey: `deferred_${String(index)}`,
      description: `延後成就 ${String(index)}`,
      displayName: `未開始 ${String(index)}`,
      progress: null,
      stableCode: `deferred_${String(index)}`,
      state: 'not_started' as const,
      target: null,
      unlockedAt: null,
    })),
  ],
  totalCount: 9,
  unlockedCount: 1,
};

const renderPage = (repository: AchievementRepository) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  }
  render(<AchievementsPage repository={repository} />, { wrapper: Wrapper });
};

describe('AchievementsPage', () => {
  it('renders the server summary and preserves catalog order', async () => {
    renderPage({ getCatalog: vi.fn().mockResolvedValue(catalog) });

    expect(
      await screen.findByRole('heading', { name: '成就徽章' }),
    ).toBeVisible();
    expect(screen.getByText('已解鎖 1 / 9')).toBeVisible();
    const grid = screen.getByRole('list', { name: '成就徽章列表' });
    const headings = within(grid).getAllByRole('heading', { level: 2 });
    expect(headings.map((heading) => heading.textContent)).toEqual([
      '初出茅廬',
      '登峰造極',
      '未開始 0',
      '未開始 1',
      '未開始 2',
      '未開始 3',
      '未開始 4',
      '未開始 5',
      '未開始 6',
    ]);
  });

  it('uses the shared loading boundary', () => {
    renderPage({
      getCatalog: vi.fn(() => new Promise<AchievementCatalog>(() => undefined)),
    });

    expect(screen.getByRole('status', { name: '頁面載入中' })).toBeVisible();
  });

  it('offers an accessible retry and recovers from a repository error', async () => {
    const getCatalog = vi
      .fn<() => Promise<AchievementCatalog>>()
      .mockRejectedValueOnce(new AchievementRepositoryError('INVALID_RESPONSE'))
      .mockResolvedValue(catalog);
    renderPage({ getCatalog });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '無法載入成就徽章，請稍後重試。',
    );
    await userEvent.click(screen.getByRole('button', { name: '重試' }));
    expect(
      await screen.findByRole('heading', { name: '成就徽章' }),
    ).toBeVisible();
    expect(getCatalog).toHaveBeenCalledTimes(2);
  });

  it('treats an empty catalog as an error instead of fabricating badges', async () => {
    renderPage({
      getCatalog: vi.fn().mockResolvedValue({
        items: [],
        totalCount: 0,
        unlockedCount: 0,
      }),
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '無法載入成就徽章，請稍後重試。',
    );
    expect(screen.queryByRole('list', { name: '成就徽章列表' })).toBeNull();
  });
});
