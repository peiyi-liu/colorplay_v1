import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '../../../components/ui/toast';
import { adminRpc, invokeAdminCommand } from '../api/admin-client';
import { useAdminSessionState } from '../hooks/use-admin-session-state';
import { formatAdminTimestamp } from '../lib/admin-time';
import { AdminAccessAdminsPage } from './admin-access-admins-page';

vi.mock('../api/admin-client', async () => {
  const actual = await vi.importActual<typeof import('../api/admin-client')>(
    '../api/admin-client',
  );
  return { ...actual, adminRpc: vi.fn(), invokeAdminCommand: vi.fn() };
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
      <MemoryRouter initialEntries={['/admin/access/admins']}>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <Routes>
              <Route element={children} path="/admin/access/admins" />
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
  return render(<AdminAccessAdminsPage />, { wrapper: Wrapper });
}

const activeRow = {
  admin_user_id: 'user-1',
  audit_principal_id: 'principal-1',
  created_at: '2026-08-01T00:00:00Z',
  failed_totp_attempts: 0,
  lifecycle_version: 1,
  locked_until: null,
  state: 'active',
  updated_at: '2026-08-01T00:00:00Z',
};

const deactivatedRow = {
  admin_user_id: 'user-2',
  audit_principal_id: 'principal-2',
  created_at: '2026-08-02T00:00:00Z',
  failed_totp_attempts: 0,
  lifecycle_version: 2,
  locked_until: null,
  state: 'deactivated',
  updated_at: '2026-08-02T00:00:00Z',
};

describe('AdminAccessAdminsPage', () => {
  const refetch = vi.fn();

  beforeEach(() => {
    vi.mocked(adminRpc).mockReset();
    vi.mocked(invokeAdminCommand).mockReset();
    refetch.mockReset();
    refetch.mockResolvedValue(undefined);
    vi.mocked(useAdminSessionState).mockReturnValue({
      isPending: false,
      mfaAgeSeconds: 300,
      refetch,
      state: 'privileged',
    } as unknown as ReturnType<typeof useAdminSessionState>);
  });

  it('renders each admin with state-appropriate actions', async () => {
    vi.mocked(adminRpc).mockResolvedValue({
      outcome: 'ok',
      rows: [activeRow, deactivatedRow],
    });
    renderPage();

    const activeRowEl = (await screen.findByText('user-1')).closest(
      'tr',
    ) as HTMLElement;
    expect(within(activeRowEl).getByText('active')).toBeInTheDocument();
    expect(
      within(activeRowEl).getByRole('button', { name: '停用' }),
    ).toBeInTheDocument();
    expect(
      within(activeRowEl).getByRole('button', { name: '重置 MFA' }),
    ).toBeInTheDocument();

    const deactivatedRowEl = screen
      .getByText('user-2')
      .closest('tr') as HTMLElement;
    expect(
      within(deactivatedRowEl).getByRole('button', { name: '重新啟用' }),
    ).toBeInTheDocument();
    expect(
      within(deactivatedRowEl).queryByRole('button', { name: '停用' }),
    ).not.toBeInTheDocument();
  });

  it('deactivates an active admin end to end and refreshes the list', async () => {
    const user = userEvent.setup();
    vi.mocked(adminRpc).mockResolvedValue({ outcome: 'ok', rows: [activeRow] });
    vi.mocked(invokeAdminCommand).mockResolvedValueOnce({
      outcome: 'ok',
      result: 'deactivated',
    });
    renderPage();

    await user.click(await screen.findByRole('button', { name: '停用' }));
    await user.type(screen.getByLabelText('原因'), '帳號異常需要立即停用處理');
    await user.click(screen.getByRole('button', { name: '確認' }));

    await waitFor(() => {
      expect(invokeAdminCommand).toHaveBeenCalledWith(
        'deactivate_admin',
        expect.any(String),
        expect.objectContaining({
          reason: '帳號異常需要立即停用處理',
          target_principal_id: 'principal-1',
        }),
      );
    });
    await waitFor(() => {
      expect(vi.mocked(adminRpc).mock.calls.length).toBeGreaterThan(1);
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows a clear LAST_ADMIN_PROTECTED message and keeps the dialog open', async () => {
    const user = userEvent.setup();
    vi.mocked(adminRpc).mockResolvedValue({ outcome: 'ok', rows: [activeRow] });
    vi.mocked(invokeAdminCommand).mockResolvedValueOnce({
      code: 'LAST_ADMIN_PROTECTED',
      outcome: 'denied',
    });
    renderPage();

    await user.click(await screen.findByRole('button', { name: '停用' }));
    await user.type(screen.getByLabelText('原因'), '帳號異常需要立即停用處理');
    await user.click(screen.getByRole('button', { name: '確認' }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        '不能對最後一位有效管理員執行此操作',
      );
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('reactivates a deactivated admin via the reset command', async () => {
    const user = userEvent.setup();
    vi.mocked(adminRpc).mockResolvedValue({
      outcome: 'ok',
      rows: [deactivatedRow],
    });
    vi.mocked(invokeAdminCommand).mockResolvedValueOnce({
      outcome: 'ok',
      result: 'active_pending_mfa',
    });
    renderPage();

    await user.click(await screen.findByRole('button', { name: '重新啟用' }));
    await user.type(screen.getByLabelText('原因'), '確認身分後重新啟用帳號');
    await user.click(screen.getByRole('button', { name: '確認' }));

    await waitFor(() => {
      expect(invokeAdminCommand).toHaveBeenCalledWith(
        'reactivate_admin',
        expect.any(String),
        expect.objectContaining({ target_principal_id: 'principal-2' }),
      );
    });
  });

  it('triggers reset_admin_mfa from the reset MFA action', async () => {
    const user = userEvent.setup();
    vi.mocked(adminRpc).mockResolvedValue({ outcome: 'ok', rows: [activeRow] });
    vi.mocked(invokeAdminCommand).mockResolvedValueOnce({
      operation_id: 'op-1',
      outcome: 'ok',
    });
    renderPage();

    await user.click(await screen.findByRole('button', { name: '重置 MFA' }));
    await user.type(screen.getByLabelText('原因'), '驗證器遺失需要重新綁定');
    await user.click(screen.getByRole('button', { name: '確認' }));

    await waitFor(() => {
      expect(invokeAdminCommand).toHaveBeenCalledWith(
        'reset_admin_mfa',
        expect.any(String),
        expect.objectContaining({ target_principal_id: 'principal-1' }),
      );
    });
  });

  it('shows a truthful empty state when there are no admins', async () => {
    vi.mocked(adminRpc).mockResolvedValue({ outcome: 'ok', rows: [] });
    renderPage();

    expect(await screen.findByText('目前沒有管理員帳號。')).toBeInTheDocument();
  });

  it('loads the next server-cursor page and exposes admin detail in place', async () => {
    const user = userEvent.setup();
    vi.mocked(adminRpc)
      .mockResolvedValueOnce({
        next_cursor: 'admins-cursor-1',
        outcome: 'ok',
        rows: [activeRow],
      })
      .mockResolvedValueOnce({
        next_cursor: null,
        outcome: 'ok',
        rows: [deactivatedRow],
      });
    renderPage();

    await user.click(
      await screen.findByRole('button', { name: '載入更多管理員' }),
    );
    expect(await screen.findByText('user-2')).toBeInTheDocument();
    expect(adminRpc).toHaveBeenLastCalledWith('admin_list_admins', {
      p_cursor: 'admins-cursor-1',
    });

    const [firstSummary] = screen.getAllByText('查看詳細資料');
    if (!firstSummary?.parentElement) {
      throw new Error('Expected an expandable admin detail row');
    }
    const firstDetail = firstSummary.parentElement;
    await user.click(within(firstDetail).getByText('查看詳細資料'));
    expect(within(firstDetail).getByText('principal-1')).toBeInTheDocument();
    expect(within(firstDetail).getByText('1')).toBeInTheDocument();
  });

  it('formats every admin timestamp in Asia/Taipei', async () => {
    const user = userEvent.setup();
    vi.mocked(adminRpc).mockResolvedValue({
      outcome: 'ok',
      rows: [
        {
          ...activeRow,
          locked_until: '2026-08-01T02:00:00Z',
          updated_at: '2026-08-01T01:00:00Z',
        },
      ],
    });
    renderPage();

    const row = (await screen.findByText('user-1')).closest('tr');
    if (!row) throw new Error('Expected the admin row');
    const cells = within(row).getAllByRole('cell');
    expect(cells.at(2)?.textContent).toBe(
      formatAdminTimestamp(activeRow.created_at),
    );
    await user.click(within(row).getByText('查看詳細資料'));
    expect(
      within(row).getByText('更新時間').nextElementSibling?.textContent,
    ).toBe(formatAdminTimestamp('2026-08-01T01:00:00Z'));
    expect(
      within(row).getByText('鎖定至').nextElementSibling?.textContent,
    ).toBe(formatAdminTimestamp('2026-08-01T02:00:00Z'));
  });

  it('shows denial request context and suppresses deterministic retry', async () => {
    vi.mocked(adminRpc).mockResolvedValue({
      code: 'RESOURCE_NOT_ALLOWED',
      outcome: 'denied',
      request_id: 'admins-request-1',
      retryable: false,
    });
    renderPage();

    expect(await screen.findByText(/admins-request-1/u)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '重試' })).toBeNull();
  });

  it('shows a retryable error state when the list call throws', async () => {
    vi.mocked(adminRpc).mockRejectedValue(new Error('network down'));
    renderPage();

    expect(
      await screen.findByText('管理員清單載入失敗，請稍後重試。'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重試' })).toBeInTheDocument();
  });

  it('redirects to challenge and refetches session state when the list call is denied as stale', async () => {
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
});
