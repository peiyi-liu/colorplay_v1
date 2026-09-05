import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { adminRpc } from '../api/admin-client';
import { useAdminSessionState } from '../hooks/use-admin-session-state';
import { AdminOverviewPage } from './admin-overview-page';

vi.mock('../api/admin-client', async () => {
  const actual = await vi.importActual<typeof import('../api/admin-client')>(
    '../api/admin-client',
  );
  return { ...actual, adminRpc: vi.fn() };
});
vi.mock('../hooks/use-admin-session-state', () => ({
  useAdminSessionState: vi.fn(),
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return (
      <MemoryRouter initialEntries={['/admin']}>
        <QueryClientProvider client={queryClient}>
          <Routes>
            <Route element={children} path="/admin" />
            <Route element={<p>challenge 頁</p>} path="/admin/mfa/challenge" />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>
    );
  }
  return render(<AdminOverviewPage />, { wrapper: Wrapper });
}

const healthOk = {
  denials: [
    {
      count: 7,
      resource_key: 'command/deactivate_admin',
      safe_reason_code: 'AUTHORIZATION_RECEIPT_INVALID',
      window_ends_at: '2026-08-09T10:00:00Z',
      window_started_at: '2026-08-09T09:00:00Z',
    },
  ],
  incidents: {
    denial_threshold_breaches: 1,
    locked_identities: 2,
    stuck_operations: 1,
  },
  operations: [
    {
      attempt_count: 2,
      correlation_id: 'corr-1',
      created_at: '2026-08-09T08:00:00Z',
      current_step: 'step1_complete',
      id: '2ab50adc-0764-5f36-b286-b95d02627177',
      last_safe_error_code: null,
      next_retry_at: '2026-08-09T09:30:00Z',
      operation_type: 'reset_admin_mfa',
      state: 'stuck',
      target_principal_id: 'principal-1',
      updated_at: '2026-08-09T09:00:00Z',
    },
  ],
  outcome: 'ok',
};

const sessionsOk = {
  outcome: 'ok',
  rows: [
    {
      absolute_expires_at: '2026-08-09T18:00:00Z',
      admin_user_id: 'user-1',
      audit_principal_id: 'principal-1',
      correlation_id: 'corr-2',
      created_at: '2026-08-09T10:00:00Z',
      device_summary: 'macOS・Chrome',
      id: 'session-1',
      last_activity_at: '2026-08-09T10:05:00Z',
      last_totp_verified_at: '2026-08-09T10:00:00Z',
      revoke_reason: null,
      revoked_at: null,
    },
    {
      absolute_expires_at: '2026-08-09T12:00:00Z',
      admin_user_id: 'user-2',
      audit_principal_id: 'principal-2',
      correlation_id: 'corr-3',
      created_at: '2026-08-09T09:00:00Z',
      device_summary: 'iOS・Safari',
      id: 'session-2',
      last_activity_at: '2026-08-09T09:05:00Z',
      last_totp_verified_at: '2026-08-09T09:00:00Z',
      revoke_reason: 'revoked_by_admin',
      revoked_at: '2026-08-09T09:10:00Z',
    },
  ],
};

describe('AdminOverviewPage', () => {
  const refetch = vi.fn();

  beforeEach(() => {
    vi.mocked(adminRpc).mockReset();
    refetch.mockReset();
    refetch.mockResolvedValue(undefined);
    vi.mocked(useAdminSessionState).mockReturnValue({
      isPending: false,
      mfaAgeSeconds: 300,
      refetch,
      state: 'privileged',
    } as unknown as ReturnType<typeof useAdminSessionState>);
  });

  it('shows a loading state before data resolves', () => {
    vi.mocked(adminRpc).mockReturnValue(new Promise(() => undefined));
    renderPage();

    expect(screen.getByRole('status', { name: '頁面載入中' })).toBeVisible();
  });

  it('renders session, pending operation, denial window and incident stats', async () => {
    vi.mocked(adminRpc).mockImplementation((fn) =>
      Promise.resolve(fn === 'admin_health_summary' ? healthOk : sessionsOk),
    );
    renderPage();

    expect(
      await screen.findByRole('link', { name: '前往系統健康' }),
    ).toBeVisible();
    expect(screen.queryByText(/位有效管理員連線/)).not.toBeInTheDocument();
    expect(adminRpc).not.toHaveBeenCalledWith(
      'admin_list_sessions',
      expect.anything(),
    );
  });

  it('surfaces incident flags distinctly when present', async () => {
    vi.mocked(adminRpc).mockImplementation((fn) =>
      Promise.resolve(fn === 'admin_health_summary' ? healthOk : sessionsOk),
    );
    renderPage();

    const incidents = await screen.findByRole('region', {
      name: '安全事故旗標',
    });
    expect(incidents).toHaveTextContent('卡住的作業：1');
    expect(incidents).toHaveTextContent('拒絕次數達門檻的觀察窗：1');
    expect(incidents).toHaveTextContent('鎖定中的身分：2');
  });

  it('shows a truthful empty state with no incident flags when everything is clean', async () => {
    vi.mocked(adminRpc).mockImplementation((fn) =>
      Promise.resolve(
        fn === 'admin_health_summary'
          ? {
              denials: [],
              incidents: {
                denial_threshold_breaches: 0,
                locked_identities: 0,
                stuck_operations: 0,
              },
              operations: [],
              outcome: 'ok',
            }
          : { outcome: 'ok', rows: [] },
      ),
    );
    renderPage();

    expect(await screen.findByText('目前沒有安全事故旗標')).toBeInTheDocument();
    expect(screen.getByText('目前沒有待處理的安全作業。')).toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: '安全事故旗標' }),
    ).not.toBeInTheDocument();
  });

  it('shows a retryable error state when the health summary call throws', async () => {
    vi.mocked(adminRpc).mockImplementation((fn) =>
      fn === 'admin_health_summary'
        ? Promise.reject(new Error('network down'))
        : Promise.resolve(sessionsOk),
    );
    renderPage();

    expect(
      await screen.findByText('安全總覽資料載入失敗，請稍後重試。'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重試' })).toBeInTheDocument();
  });

  it('redirects to challenge and refetches session state on a stale-session denial', async () => {
    vi.mocked(adminRpc).mockImplementation((fn) =>
      Promise.resolve(
        fn === 'admin_health_summary'
          ? { code: 'STALE_PRIVILEGED_SESSION', outcome: 'denied' }
          : sessionsOk,
      ),
    );
    renderPage();

    expect(await screen.findByText('challenge 頁')).toBeInTheDocument();
    await waitFor(() => {
      expect(refetch).toHaveBeenCalled();
    });
  });
});
