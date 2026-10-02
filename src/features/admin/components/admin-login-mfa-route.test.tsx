import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AuthContext,
  type AuthContextValue,
} from '../../auth/context/auth-context';
import { useAdminSessionState } from '../hooks/use-admin-session-state';
import { RequirePrivilegedSession } from './require-privileged-session';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('../../../lib/supabase/browser-client', () => ({
  getBrowserSupabaseClient: () => ({ rpc }),
}));

function MfaDestination() {
  const session = useAdminSessionState();
  return (
    <>
      <p>輸入 MFA 驗證碼</p>
      <output aria-label="驗證狀態">{session.state}</output>
    </>
  );
}

function renderLogin(state: string) {
  rpc.mockResolvedValue({ data: { state }, error: null });
  const auth: AuthContextValue = {
    status: 'authenticated',
    session: { userId: 'admin-login-fixture' },
    signIn: vi.fn(),
    signInWithAccount: vi.fn(),
    signOut: vi.fn().mockResolvedValue(undefined),
  };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const router = createMemoryRouter(
    [
      {
        element: <RequirePrivilegedSession />,
        children: [{ element: <p>管理工作台</p>, path: '/admin/content' }],
      },
      { element: <MfaDestination />, path: '/admin/mfa/challenge' },
      { element: <p>重新輸入帳密</p>, path: '/login' },
    ],
    { initialEntries: ['/admin/content'] },
  );
  render(
    <AuthContext.Provider value={auth}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </AuthContext.Provider>,
  );
  return { auth, router };
}

describe('Admin login through the server session-state boundary', () => {
  beforeEach(() => rpc.mockReset());

  it('keeps a new password login authenticated and reaches MFA with return intent', async () => {
    const { auth, router } = renderLogin('mfa_required');
    await screen.findByText('輸入 MFA 驗證碼');
    expect(screen.getByLabelText('驗證狀態')).toHaveTextContent('mfa_required');
    expect(router.state.location.state).toEqual({ returnTo: '/admin/content' });
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(screen.queryByText('管理工作台')).not.toBeInTheDocument();
  });

  it('signs out a previously privileged login when the server reports expiry', async () => {
    const { router } = renderLogin('stale');
    await screen.findByText('重新輸入帳密');
    expect(router.state.location.pathname).toBe('/login');
    expect(screen.queryByText('輸入 MFA 驗證碼')).not.toBeInTheDocument();
  });

  it('opens the protected workspace only after the server confirms MFA', async () => {
    const { auth, router } = renderLogin('privileged');
    await waitFor(() => expect(screen.getByText('管理工作台')).toBeVisible());
    expect(router.state.location.pathname).toBe('/admin/content');
    expect(auth.signOut).not.toHaveBeenCalled();
  });
});
