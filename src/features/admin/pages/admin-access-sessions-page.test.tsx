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
import { AdminAccessSessionsPage } from './admin-access-sessions-page';

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
      <MemoryRouter initialEntries={['/admin/access/sessions']}>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <Routes>
              <Route element={children} path="/admin/access/sessions" />
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
  return render(<AdminAccessSessionsPage />, { wrapper: Wrapper });
}

const activeSession = {
  absolute_expires_at: '2026-08-09T18:00:00Z',
  admin_user_id: 'user-1',
  audit_principal_id: 'principal-1',
  correlation_id: '11111111-1111-4111-8111-111111111111',
  created_at: '2026-08-09T10:00:00Z',
  device_summary: 'macOS・Chrome',
  id: 'session-1',
  last_activity_at: '2026-08-09T10:05:00Z',
  last_totp_verified_at: '2026-08-09T10:00:00Z',
  revoke_reason: null,
  revoked_at: null,
};

const revokedSession = {
  absolute_expires_at: '2026-08-09T12:00:00Z',
  admin_user_id: 'user-2',
  audit_principal_id: 'principal-2',
  correlation_id: '22222222-2222-4222-8222-222222222222',
  created_at: '2026-08-09T09:00:00Z',
  device_summary: 'iOS・Safari',
  id: 'session-2',
  last_activity_at: '2026-08-09T09:05:00Z',
  last_totp_verified_at: '2026-08-09T09:00:00Z',
  revoke_reason: 'revoked_by_admin',
  revoked_at: '2026-08-09T09:10:00Z',
};

describe('AdminAccessSessionsPage', () => {
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

  it('renders sessions with a revoke action only for active ones', async () => {
    vi.mocked(adminRpc).mockResolvedValue({
      outcome: 'ok',
      rows: [activeSession, revokedSession],
    });
    renderPage();

    const activeRow = (await screen.findByText('macOS・Chrome')).closest(
      'tr',
    ) as HTMLElement;
    expect(
      within(activeRow).getByRole('button', { name: '撤銷' }),
    ).toBeInTheDocument();

    const revokedRow = screen
      .getByText('iOS・Safari')
      .closest('tr') as HTMLElement;
    expect(
      within(revokedRow).queryByRole('button', { name: '撤銷' }),
    ).not.toBeInTheDocument();
    expect(
      within(revokedRow).getByText('revoked_by_admin'),
    ).toBeInTheDocument();
  });

  it('revokes an active session end to end and refreshes the list', async () => {
    const user = userEvent.setup();
    vi.mocked(adminRpc).mockResolvedValue({
      outcome: 'ok',
      rows: [activeSession],
    });
    vi.mocked(invokeAdminCommand).mockResolvedValueOnce({
      outcome: 'ok',
      result: 'revoked',
    });
    renderPage();

    await user.click(await screen.findByRole('button', { name: '撤銷' }));
    await user.type(screen.getByLabelText('原因'), '裝置遺失需要立即撤銷連線');
    await user.click(screen.getByRole('button', { name: '確認' }));

    await waitFor(() => {
      expect(invokeAdminCommand).toHaveBeenCalledWith(
        'revoke_admin_session',
        expect.any(String),
        expect.objectContaining({
          reason: '裝置遺失需要立即撤銷連線',
          session_id: 'session-1',
        }),
      );
    });
    await waitFor(() => {
      expect(vi.mocked(adminRpc).mock.calls.length).toBeGreaterThan(1);
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows a TARGET_STATE_INVALID denial clearly and keeps the dialog open', async () => {
    const user = userEvent.setup();
    vi.mocked(adminRpc).mockResolvedValue({
      outcome: 'ok',
      rows: [activeSession],
    });
    vi.mocked(invokeAdminCommand).mockResolvedValueOnce({
      code: 'TARGET_STATE_INVALID',
      outcome: 'denied',
    });
    renderPage();

    await user.click(await screen.findByRole('button', { name: '撤銷' }));
    await user.type(screen.getByLabelText('原因'), '裝置遺失需要立即撤銷連線');
    await user.click(screen.getByRole('button', { name: '確認' }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        '目前的狀態不允許此操作',
      );
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows a truthful empty state when there are no sessions', async () => {
    vi.mocked(adminRpc).mockResolvedValue({ outcome: 'ok', rows: [] });
    renderPage();

    expect(
      await screen.findByText('目前沒有 admin session。'),
    ).toBeInTheDocument();
  });

  it('loads the next server-cursor page and exposes session detail in place', async () => {
    const user = userEvent.setup();
    vi.mocked(adminRpc)
      .mockResolvedValueOnce({
        next_cursor: 'sessions-cursor-1',
        outcome: 'ok',
        rows: [activeSession],
      })
      .mockResolvedValueOnce({
        next_cursor: null,
        outcome: 'ok',
        rows: [revokedSession],
      });
    renderPage();

    await user.click(
      await screen.findByRole('button', { name: '載入更多 Session' }),
    );
    expect(await screen.findByText('iOS・Safari')).toBeInTheDocument();
    expect(adminRpc).toHaveBeenLastCalledWith('admin_list_sessions', {
      p_cursor: 'sessions-cursor-1',
    });

    const [firstSummary] = screen.getAllByText('查看詳細資料');
    if (!firstSummary) {
      throw new Error('Expected an expandable session detail row');
    }
    await user.click(firstSummary);
    expect(
      screen.getByText(/11111111-1111-4111-8111-111111111111/u),
    ).toBeInTheDocument();
    expect(screen.getByText(/principal-1/u)).toBeInTheDocument();
  });

  it('formats every session timestamp in Asia/Taipei', async () => {
    const user = userEvent.setup();
    vi.mocked(adminRpc).mockResolvedValue({
      outcome: 'ok',
      rows: [activeSession, revokedSession],
    });
    renderPage();

    const activeRow = (await screen.findByText('macOS・Chrome')).closest('tr');
    if (!activeRow) throw new Error('Expected the active session row');
    const activeCells = within(activeRow).getAllByRole('cell');
    expect(activeCells.at(1)?.textContent).toBe(
      formatAdminTimestamp(activeSession.created_at),
    );
    expect(activeCells.at(2)?.textContent).toBe(
      formatAdminTimestamp(activeSession.last_activity_at),
    );
    await user.click(within(activeRow).getByText('查看詳細資料'));
    expect(
      within(activeRow).getByText('絕對到期').nextElementSibling?.textContent,
    ).toBe(formatAdminTimestamp(activeSession.absolute_expires_at));

    const revokedRow = screen.getByText('iOS・Safari').closest('tr');
    if (!revokedRow) throw new Error('Expected the revoked session row');
    await user.click(within(revokedRow).getByText('查看詳細資料'));
    expect(
      within(revokedRow).getByText('撤銷時間').nextElementSibling?.textContent,
    ).toBe(formatAdminTimestamp(revokedSession.revoked_at));
  });

  it('shows denial request context and suppresses deterministic retry', async () => {
    vi.mocked(adminRpc).mockResolvedValue({
      code: 'RESOURCE_NOT_ALLOWED',
      outcome: 'denied',
      request_id: 'f929746e-713e-549f-8900-6c29a1c4499e',
      retryable: false,
    });
    renderPage();

    expect(
      await screen.findByText(/f929746e-713e-549f-8900-6c29a1c4499e/u),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '重試' })).toBeNull();
  });

  it('shows a retryable error state when the list call throws', async () => {
    vi.mocked(adminRpc).mockRejectedValue(new Error('network down'));
    renderPage();

    expect(
      await screen.findByText('Session 清單載入失敗，請稍後重試。'),
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
