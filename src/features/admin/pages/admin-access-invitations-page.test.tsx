import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '../../../components/ui/toast';
import { adminRpc, invokeAdminCommand } from '../api/admin-client';
import { useAdminSessionState } from '../hooks/use-admin-session-state';
import { AdminAccessInvitationsPage } from './admin-access-invitations-page';

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
      <MemoryRouter initialEntries={['/admin/access/invitations']}>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <Routes>
              <Route element={children} path="/admin/access/invitations" />
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
  return render(<AdminAccessInvitationsPage />, { wrapper: Wrapper });
}

const pendingInvitation = {
  accepted_at: null,
  accepted_principal_id: null,
  created_at: '2026-08-01T00:00:00Z',
  expires_at: '2026-08-04T00:00:00Z',
  id: 'invitation-1',
  invited_email: 'a****@colorplay.test',
  issuer_principal_id: 'principal-1',
  revoked_at: null,
  status: 'pending',
};

const acceptedInvitation = {
  accepted_at: '2026-08-02T00:00:00Z',
  accepted_principal_id: 'principal-2',
  created_at: '2026-07-30T00:00:00Z',
  expires_at: '2026-08-02T00:00:00Z',
  id: 'invitation-2',
  invited_email: 'b****@colorplay.test',
  issuer_principal_id: 'principal-1',
  revoked_at: null,
  status: 'accepted',
};

describe('AdminAccessInvitationsPage', () => {
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

  it('renders invitation rows with masked email and status-appropriate actions', async () => {
    vi.mocked(adminRpc).mockResolvedValue({
      outcome: 'ok',
      rows: [pendingInvitation, acceptedInvitation],
    });
    renderPage();

    const pendingRow = (
      await screen.findByText('a****@colorplay.test')
    ).closest('tr') as HTMLElement;
    expect(
      within(pendingRow).getByRole('button', { name: '撤銷' }),
    ).toBeInTheDocument();

    const acceptedRow = screen
      .getByText('b****@colorplay.test')
      .closest('tr') as HTMLElement;
    expect(
      within(acceptedRow).queryByRole('button', { name: '撤銷' }),
    ).not.toBeInTheDocument();
  });

  it('issues an invitation and shows the plaintext token exactly once', async () => {
    const user = userEvent.setup();
    vi.mocked(adminRpc).mockResolvedValue({ outcome: 'ok', rows: [] });
    vi.mocked(invokeAdminCommand).mockResolvedValueOnce({
      invitation_id: 'invitation-3',
      invitation_token: 'plaintext-token-abc123',
      outcome: 'ok',
      result: 'issued',
    });
    renderPage();

    await screen.findByText('目前沒有待處理或近期的邀請。');
    await user.type(
      screen.getByLabelText('受邀者 Email'),
      'new.admin@colorplay.test',
    );
    await user.click(screen.getByRole('button', { name: '發出邀請' }));
    await user.type(screen.getByLabelText('原因'), '新任管理員需要建立帳號');
    await user.click(screen.getByRole('button', { name: '確認' }));

    await waitFor(() => {
      expect(invokeAdminCommand).toHaveBeenCalledWith(
        'issue_admin_invitation',
        expect.any(String),
        expect.objectContaining({
          invited_email: 'new.admin@colorplay.test',
          reason: '新任管理員需要建立帳號',
        }),
      );
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      await screen.findByText('plaintext-token-abc123'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '關閉' }));
    expect(
      screen.queryByText('plaintext-token-abc123'),
    ).not.toBeInTheDocument();
  });

  it('does not show a token box when the response is a replay without one', async () => {
    const user = userEvent.setup();
    vi.mocked(adminRpc).mockResolvedValue({ outcome: 'ok', rows: [] });
    vi.mocked(invokeAdminCommand).mockResolvedValueOnce({
      outcome: 'replayed',
      result: { invitation_id: 'invitation-3', result: 'issued' },
    });
    renderPage();

    await screen.findByText('目前沒有待處理或近期的邀請。');
    await user.type(
      screen.getByLabelText('受邀者 Email'),
      'new.admin@colorplay.test',
    );
    await user.click(screen.getByRole('button', { name: '發出邀請' }));
    await user.type(screen.getByLabelText('原因'), '新任管理員需要建立帳號');
    await user.click(screen.getByRole('button', { name: '確認' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(
      screen.queryByRole('region', { name: '邀請 token' }),
    ).not.toBeInTheDocument();
  });

  it('revokes a pending invitation', async () => {
    const user = userEvent.setup();
    vi.mocked(adminRpc).mockResolvedValue({
      outcome: 'ok',
      rows: [pendingInvitation],
    });
    vi.mocked(invokeAdminCommand).mockResolvedValueOnce({
      outcome: 'ok',
      result: 'revoked',
    });
    renderPage();

    await user.click(await screen.findByRole('button', { name: '撤銷' }));
    await user.type(screen.getByLabelText('原因'), '受邀者已不需要此帳號');
    await user.click(screen.getByRole('button', { name: '確認' }));

    await waitFor(() => {
      expect(invokeAdminCommand).toHaveBeenCalledWith(
        'revoke_admin_invitation',
        expect.any(String),
        expect.objectContaining({
          invitation_id: 'invitation-1',
          reason: '受邀者已不需要此帳號',
        }),
      );
    });
  });

  it('shows a retryable error state when the list call throws', async () => {
    vi.mocked(adminRpc).mockRejectedValue(new Error('network down'));
    renderPage();

    expect(
      await screen.findByText('邀請清單載入失敗，請稍後重試。'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重試' })).toBeInTheDocument();
  });
});
