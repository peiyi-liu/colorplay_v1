import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

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
      <MemoryRouter>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </MemoryRouter>
    );
  }
  render(<AchievementsPage repository={repository} />, { wrapper: Wrapper });
};

describe('AchievementsPage', () => {
  it('renders the server summary and preserves catalog order across pages', async () => {
    renderPage({ getCatalog: vi.fn().mockResolvedValue(catalog) });

    expect(
      await screen.findByRole('heading', { name: /個人成就與徽章/u }),
    ).toBeVisible();
    expect(
      screen.getByText('完成學習任務、累積挑戰紀錄，解鎖你的專屬色彩成就。'),
    ).toBeVisible();
    // 分頁批:全域 matchMedia stub matches:false → narrow 容量 4,
    // items=9 → 3 頁(頁1=初出茅廬/登峰造極/未開始0/未開始1,
    // 頁2=未開始2-5,頁3=未開始6)。拆三段驗證,不再單測全量。
    expect(await screen.findByText('第 1 / 3 頁')).toBeVisible();
    let grid = screen.getByRole('list', { name: '成就徽章列表' });
    expect(
      within(grid)
        .getAllByRole('heading', { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual(['初出茅廬', '登峰造極', '未開始 0', '未開始 1']);

    await userEvent.click(screen.getByRole('button', { name: '下一頁' }));

    expect(screen.getByText('第 2 / 3 頁')).toBeVisible();
    grid = screen.getByRole('list', { name: '成就徽章列表' });
    expect(
      within(grid)
        .getAllByRole('heading', { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual(['未開始 2', '未開始 3', '未開始 4', '未開始 5']);

    await userEvent.click(screen.getByRole('button', { name: '下一頁' }));

    expect(screen.getByText('第 3 / 3 頁')).toBeVisible();
    grid = screen.getByRole('list', { name: '成就徽章列表' });
    expect(
      within(grid)
        .getAllByRole('heading', { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual(['未開始 6']);
  });

  it('paginates when the catalog exceeds a page and next reaches trailing badges', async () => {
    const overflowCatalog: AchievementCatalog = {
      items: Array.from({ length: 10 }, (_, index) => ({
        badgeKey: `overflow_${String(index)}`,
        description: `溢出成就 ${String(index)}`,
        displayName: `溢出徽章${String(index)}`,
        progress: null,
        stableCode: `overflow_${String(index)}`,
        state: 'not_started' as const,
        target: null,
        unlockedAt: null,
      })),
      totalCount: 10,
      unlockedCount: 0,
    };
    renderPage({ getCatalog: vi.fn().mockResolvedValue(overflowCatalog) });

    // 分頁批:全域 matchMedia stub matches:false → narrow 容量 4,items=10 → 3 頁。
    expect(await screen.findByText('第 1 / 3 頁')).toBeVisible();
    expect(screen.getByRole('heading', { name: '溢出徽章0' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: '溢出徽章9' })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: '下一頁' }));
    await userEvent.click(screen.getByRole('button', { name: '下一頁' }));

    expect(screen.getByText('第 3 / 3 頁')).toBeVisible();
    expect(screen.getByRole('heading', { name: '溢出徽章9' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: '溢出徽章0' })).toBeNull();
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
      await screen.findByRole('heading', { name: /個人成就與徽章/u }),
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

  it('dresses achievements as the hall of medals', async () => {
    renderPage({ getCatalog: vi.fn().mockResolvedValue(catalog) });

    expect(
      await screen.findByRole('heading', { name: /個人成就與徽章/u }),
    ).toBeVisible();
    expect(
      document.querySelector(
        '.achievements.achievements--sanctuary-v2.scene-day.hall-of-medals',
      ),
    ).not.toBeNull();
    expect(document.querySelector('.achievement-card--locked')).not.toBeNull();
    expect(
      document.querySelector('[data-achievement-state="unlocked"]'),
    ).not.toBeNull();
  });
});
