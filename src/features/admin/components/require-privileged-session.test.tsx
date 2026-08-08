import { render, screen } from '@testing-library/react';
import {
  createMemoryRouter,
  MemoryRouter,
  Route,
  RouterProvider,
  Routes,
} from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { useAdminSessionState } from '../hooks/use-admin-session-state';
import { RequirePrivilegedSession } from './require-privileged-session';

vi.mock('../hooks/use-admin-session-state', () => ({
  useAdminSessionState: vi.fn(),
}));

function renderWithState(state: string, isPending = false) {
  vi.mocked(useAdminSessionState).mockReturnValue({
    isPending,
    mfaAgeSeconds: 0,
    refetch: vi.fn(),
    state,
  } as unknown as ReturnType<typeof useAdminSessionState>);
  render(
    <MemoryRouter initialEntries={['/admin/audit']}>
      <Routes>
        <Route element={<RequirePrivilegedSession />}>
          <Route element={<p>稽核頁</p>} path="/admin/audit" />
        </Route>
        <Route element={<p>enroll 頁</p>} path="/admin/mfa/enroll" />
        <Route element={<p>challenge 頁</p>} path="/admin/mfa/challenge" />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RequirePrivilegedSession', () => {
  it('renders the outlet for a privileged session', () => {
    renderWithState('privileged');
    expect(screen.getByText('稽核頁')).toBeInTheDocument();
  });

  it('sends pending_mfa to the enrollment gate', () => {
    renderWithState('pending_mfa');
    expect(screen.getByText('enroll 頁')).toBeInTheDocument();
  });

  it('sends stale sessions to challenge with return intent', () => {
    vi.mocked(useAdminSessionState).mockReturnValue({
      isPending: false,
      mfaAgeSeconds: 0,
      refetch: vi.fn(),
      state: 'stale',
    } as unknown as ReturnType<typeof useAdminSessionState>);
    const router = createMemoryRouter(
      [
        {
          element: <RequirePrivilegedSession />,
          children: [{ element: <p>稽核頁</p>, path: '/admin/audit' }],
        },
        { element: <p>challenge 頁</p>, path: '/admin/mfa/challenge' },
      ],
      { initialEntries: ['/admin/audit'] },
    );
    render(<RouterProvider router={router} />);
    expect(screen.getByText('challenge 頁')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/admin/mfa/challenge');
    expect(
      (router.state.location.state as { returnTo?: string }).returnTo,
    ).toBe('/admin/audit');
    expect(router.state.historyAction).toBe('REPLACE');
  });

  it('shows the route loading state while the query is pending', () => {
    renderWithState('none', true);
    expect(screen.getByRole('status', { name: '頁面載入中' })).toBeVisible();
  });
});
