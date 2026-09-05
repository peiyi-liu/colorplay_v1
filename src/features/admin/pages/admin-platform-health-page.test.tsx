import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import { AdminPlatformHealthPage } from './admin-platform-health-page';
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
  it('shows confirmed anomalies and keeps absent signals unknown', async () => {
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
    expect(screen.getAllByText('尚無資料').length).toBeGreaterThan(0);
    expect(screen.getByText('需查核')).toBeInTheDocument();
    expect(screen.getByText('2 筆異常／15 筆檢查')).toBeInTheDocument();
  });
});
