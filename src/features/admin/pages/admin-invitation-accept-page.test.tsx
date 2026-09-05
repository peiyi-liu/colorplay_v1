import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { myProfileQueryKey } from '../../profile/hooks/use-my-profile';
import { adminRpc } from '../api/admin-client';
import { AdminInvitationAcceptPage } from './admin-invitation-accept-page';

vi.mock('../api/admin-client', async () => {
  const actual = await vi.importActual<typeof import('../api/admin-client')>(
    '../api/admin-client',
  );
  return { ...actual, adminRpc: vi.fn() };
});

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  const refetchProfiles = vi
    .spyOn(queryClient, 'refetchQueries')
    .mockResolvedValue(undefined);

  function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return (
      <MemoryRouter initialEntries={['/admin/invitations/accept']}>
        <QueryClientProvider client={queryClient}>
          <Routes>
            <Route element={children} path="/admin/invitations/accept" />
            <Route
              element={<p>MFA enrollment page</p>}
              path="/admin/mfa/enroll"
            />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>
    );
  }

  render(<AdminInvitationAcceptPage />, { wrapper: Wrapper });
  return { refetchProfiles };
}

describe('AdminInvitationAcceptPage', () => {
  beforeEach(() => {
    vi.mocked(adminRpc).mockReset();
  });

  it('accepts a pasted token in the RPC body, refreshes the profile, then enters MFA enrollment', async () => {
    const user = userEvent.setup();
    vi.mocked(adminRpc).mockResolvedValue({ outcome: 'ok' });
    const { refetchProfiles } = renderPage();

    await user.type(screen.getByLabelText('邀請 token'), ' invite-token-123 ');
    await user.click(screen.getByRole('button', { name: '接受邀請' }));

    await waitFor(() => {
      expect(adminRpc).toHaveBeenCalledWith('accept_admin_invitation', {
        p_token: 'invite-token-123',
      });
    });
    expect(window.location.search).toBe('');
    expect(refetchProfiles).toHaveBeenCalledWith({
      exact: true,
      queryKey: myProfileQueryKey,
      type: 'active',
    });
    expect(await screen.findByText('MFA enrollment page')).toBeInTheDocument();
  });

  it('shows the same invitation-invalid message and a non-retryable request ID', async () => {
    const user = userEvent.setup();
    vi.mocked(adminRpc).mockResolvedValue({
      code: 'INVITATION_INVALID',
      outcome: 'denied',
      request_id: '959a57df-8932-5296-a9c5-a1b4321f969d',
      retryable: false,
    });
    renderPage();

    await user.type(screen.getByLabelText('邀請 token'), 'wrong-token');
    await user.click(screen.getByRole('button', { name: '接受邀請' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      '邀請無效或已失效',
    );
    expect(
      screen.getByText(/959a57df-8932-5296-a9c5-a1b4321f969d/u),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '重試' }),
    ).not.toBeInTheDocument();
  });

  it('keeps the form available after a network failure so the user can retry', async () => {
    const user = userEvent.setup();
    vi.mocked(adminRpc).mockRejectedValueOnce(new Error('network down'));
    renderPage();

    await user.type(screen.getByLabelText('邀請 token'), 'invite-token');
    await user.click(screen.getByRole('button', { name: '接受邀請' }));

    expect(
      await screen.findByText('邀請驗證暫時失敗，請稍後重試。'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '接受邀請' })).toBeEnabled();
  });
});
