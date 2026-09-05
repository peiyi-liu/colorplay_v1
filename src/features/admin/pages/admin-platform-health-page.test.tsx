import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { AdminPlatformHealthPage } from './admin-platform-health-page';
import { adminRpc } from '../api/admin-client';
import { MONITOR_GROUPS } from '../lib/admin-monitor-labels';
vi.mock('../api/admin-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/admin-client')>()),
  adminRpc: vi.fn().mockResolvedValue({
    outcome: 'ok',
    checked_at: '2026-09-05T12:00:00Z',
    metrics: [
      {
        signal: 'wallet_ledger_mismatch',
        status: 'attention',
        value: 2,
        sample_count: 15,
        checked_at: '2026-09-05T12:00:00Z',
        observed_at: '2026-09-05T12:00:00Z',
        source: 'database',
      },
    ],
  }),
}));
vi.mock('../hooks/use-admin-session-state', () => ({
  useAdminSessionState: () => ({ clear: vi.fn() }),
}));
describe('AdminPlatformHealthPage', () => {
  it('does not claim no anomalies when the incomplete filter is empty', async () => {
    const time = '2026-09-05T12:00:00Z';
    vi.mocked(adminRpc).mockResolvedValueOnce({
      outcome: 'ok',
      checked_at: time,
      metrics: [
        ...new Set(
          MONITOR_GROUPS.flatMap((g) => g.signals.map(([signal]) => signal)),
        ),
      ].map((signal) => ({
        signal,
        status: signal === 'wallet_ledger_mismatch' ? 'attention' : 'ok',
        value: signal === 'wallet_ledger_mismatch' ? 1 : 0,
        sample_count: 2,
        checked_at: time,
        observed_at: time,
        source: 'database',
      })),
    });
    const user = userEvent.setup();
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <MemoryRouter>
          <AdminPlatformHealthPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await user.click(
      await screen.findByRole('button', { name: /資料不足.*0/ }),
    );
    expect(
      screen.getByRole('heading', { name: '目前沒有資料不足項目' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('目前沒有需查核項目')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '查看全部檢查' }));
    expect(screen.getByText('1 筆異常／2 筆檢查')).toBeInTheDocument();
  });
  it('shows confirmed anomalies and keeps absent signals unknown', async () => {
    const user = userEvent.setup();
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <MemoryRouter>
          <AdminPlatformHealthPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(
      await screen.findByRole('heading', { name: '獎勵一致性' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: '教材可用性' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('2 筆異常／15 筆檢查')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /資料不足.*18/ }));
    expect(screen.getAllByText('尚無資料')).toHaveLength(18);
    expect(screen.queryByText('2 筆異常／15 筆檢查')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /全部.*19/ }));
    expect(screen.getByText('2 筆異常／15 筆檢查')).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(19);
  });
});
