import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '../../../components/ui/toast';
import { adminRpc, invokeAdminCommand } from '../api/admin-client';
import { useAdminSessionState } from '../hooks/use-admin-session-state';
import { AdminHealthPage } from './admin-health-page';

vi.mock('../api/admin-client', async () => {
  const actual = await vi.importActual<typeof import('../api/admin-client')>(
    '../api/admin-client',
  );
  return { ...actual, adminRpc: vi.fn(), invokeAdminCommand: vi.fn() };
});
vi.mock('../hooks/use-admin-session-state', () => ({
  useAdminSessionState: vi.fn(),
}));

const retryableOperation = {
  attempt_count: 1,
  correlation_id: 'corr-1',
  created_at: '2026-08-09T08:00:00Z',
  current_step: 'step1_complete',
  id: 'op-retryable',
  last_safe_error_code: null,
  next_retry_at: '2026-08-09T09:30:00Z',
  operation_type: 'reset_admin_mfa',
  state: 'step1_complete',
  target_principal_id: 'principal-1',
  updated_at: '2026-08-09T09:00:00Z',
};

const stuckOperation = {
  attempt_count: 9,
  correlation_id: 'corr-2',
  created_at: '2026-08-08T08:00:00Z',
  current_step: 'step2_complete',
  id: 'op-stuck',
  last_safe_error_code: 'SECURITY_AUDIT_UNAVAILABLE',
  next_retry_at: null,
  operation_type: 'reset_admin_mfa',
  state: 'stuck',
  target_principal_id: 'principal-2',
  updated_at: '2026-08-08T09:00:00Z',
};

const healthOk = {
  denials: [
    {
      count: 23,
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
  operations: [retryableOperation, stuckOperation],
  outcome: 'ok',
};

const healthClean = {
  denials: [],
  incidents: {
    denial_threshold_breaches: 0,
    locked_identities: 0,
    stuck_operations: 0,
  },
  operations: [],
  outcome: 'ok',
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return (
      <MemoryRouter initialEntries={['/admin/health']}>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <Routes>
              <Route element={children} path="/admin/health" />
              <Route
                element={<p>challenge 頁</p>}
                path="/admin/mfa/challenge"
              />
            </Routes>
          </ToastProvider>
        </QueryClientProvider>
      </MemoryRouter>
    );
  }
  return render(<AdminHealthPage />, { wrapper: Wrapper });
}

describe('AdminHealthPage', () => {
  const refetch = vi.fn();

  beforeEach(() => {
    vi.mocked(adminRpc).mockReset();
    vi.mocked(invokeAdminCommand).mockReset();
    refetch.mockReset();
    refetch.mockResolvedValue(undefined);
    vi.mocked(useAdminSessionState).mockReturnValue({
      isPending: false,
      mfaAgeSeconds: 60,
      refetch,
      state: 'privileged',
    } as unknown as ReturnType<typeof useAdminSessionState>);
  });

  it('shows a loading state before the summary resolves', () => {
    vi.mocked(adminRpc).mockReturnValue(new Promise(() => undefined));
    renderPage();

    expect(screen.getByRole('status', { name: '頁面載入中' })).toBeVisible();
  });

  it('renders operations, denial aggregates and incident counts', async () => {
    vi.mocked(adminRpc).mockResolvedValue(healthOk);
    renderPage();

    expect(await screen.findByText('op-retryable')).toBeInTheDocument();
    expect(screen.getByText('op-stuck')).toBeInTheDocument();
    expect(screen.getByText('command/deactivate_admin')).toBeInTheDocument();
    expect(screen.getByText('23')).toBeInTheDocument();

    const incidents = screen.getByRole('region', { name: '安全事故' });
    expect(incidents).toHaveTextContent('卡住的作業：1');
    expect(incidents).toHaveTextContent('denial 門檻突破：1');
    expect(incidents).toHaveTextContent('鎖定中的身分：2');
  });

  it('offers reconcile only for operations the command actually accepts', async () => {
    vi.mocked(adminRpc).mockResolvedValue(healthOk);
    renderPage();
    await screen.findByText('op-retryable');

    const retryableRow = screen
      .getByText('op-retryable')
      .closest('tr') as HTMLElement;
    expect(
      within(retryableRow).getByRole('button', { name: '觸發重新對帳' }),
    ).toBeInTheDocument();

    // stuck 的 operation 由 RPC 明確拒絕(SECURITY_OPERATION_PENDING),
    // 提供必然被拒的按鈕只會白燒 receipt 並累積 denial counter。
    const stuckRow = screen.getByText('op-stuck').closest('tr') as HTMLElement;
    expect(
      within(stuckRow).queryByRole('button', { name: '觸發重新對帳' }),
    ).not.toBeInTheDocument();
    expect(stuckRow).toHaveTextContent('需負責人依 runbook 處理');
  });

  it('runs reconcile through the shared command dialog with a reason', async () => {
    const user = userEvent.setup();
    vi.mocked(adminRpc).mockResolvedValue(healthOk);
    vi.mocked(invokeAdminCommand).mockResolvedValueOnce({
      operation_id: 'op-retryable',
      outcome: 'ok',
      result: 'reconcile_requested',
    });
    renderPage();
    await screen.findByText('op-retryable');

    const retryableRow = screen
      .getByText('op-retryable')
      .closest('tr') as HTMLElement;
    await user.click(
      within(retryableRow).getByRole('button', { name: '觸發重新對帳' }),
    );

    const dialog = await screen.findByRole('dialog');
    // 命令一定要有理由,不能繞過 dialog 直接送
    await user.type(
      within(dialog).getByLabelText('原因'),
      '作業逾時需要手動重新對帳',
    );
    await user.click(within(dialog).getByRole('button', { name: '確認' }));

    await waitFor(() => {
      expect(invokeAdminCommand).toHaveBeenCalledWith(
        'reconcile_admin_security_operation',
        expect.any(String),
        expect.objectContaining({
          operation_id: 'op-retryable',
          reason: '作業逾時需要手動重新對帳',
        }),
      );
    });
  });

  it('hides the incident region and shows clean empty states when all is well', async () => {
    vi.mocked(adminRpc).mockResolvedValue(healthClean);
    renderPage();

    expect(
      await screen.findByText('目前沒有進行中的安全作業。'),
    ).toBeInTheDocument();
    expect(screen.getByText('近 24 小時沒有 denial。')).toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: '安全事故' }),
    ).not.toBeInTheDocument();
  });

  it('shows a retryable error when the summary throws', async () => {
    vi.mocked(adminRpc).mockRejectedValue(new Error('network down'));
    renderPage();

    expect(
      await screen.findByText('系統健康資料載入失敗，請稍後重試。'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重試' })).toBeInTheDocument();
  });

  it('translates a typed denial through the shared banner', async () => {
    vi.mocked(adminRpc).mockResolvedValue({
      code: 'COLUMN_NOT_ALLOWED',
      outcome: 'denied',
    });
    renderPage();

    await waitFor(() => {
      expect(screen.getAllByRole('status')[0]).toHaveTextContent(
        '此欄位不允許這項操作',
      );
    });
  });

  it('redirects to challenge and refetches session state on a stale privileged session', async () => {
    vi.mocked(adminRpc).mockResolvedValue({
      code: 'STALE_PRIVILEGED_SESSION',
      outcome: 'denied',
    });
    renderPage();

    expect(await screen.findByText('challenge 頁')).toBeInTheDocument();
    await waitFor(() => {
      expect(refetch).toHaveBeenCalled();
    });
  });

  it('exposes no export or download control', async () => {
    vi.mocked(adminRpc).mockResolvedValue(healthOk);
    renderPage();
    await screen.findByText('op-retryable');

    expect(screen.queryByText(/匯出|下載|CSV|export|download/iu)).toBeNull();
    expect(document.querySelector('a[download]')).toBeNull();
  });
});
