import { render, screen } from '@testing-library/react';
import {
  createMemoryRouter,
  Outlet,
  RouterProvider,
  useLocation,
} from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { AuthContext, type AuthContextValue } from '../context/auth-context';
import { RequireAuth } from './require-auth';

const createAuthValue = (
  value: Pick<AuthContextValue, 'session' | 'status'>,
): AuthContextValue => ({
  ...value,
  signIn: () => Promise.resolve(),
  signInWithAccount: () => Promise.resolve(),
  signOut: () => Promise.resolve(),
});

function Shell() {
  return (
    <main id="main-content">
      <Outlet />
    </main>
  );
}

function LoginStateProbe() {
  const location = useLocation();
  const locationState: unknown = location.state;
  const from =
    typeof locationState === 'object' &&
    locationState !== null &&
    'from' in locationState
      ? locationState.from
      : null;
  return (
    <section>
      <h1>登入</h1>
      <output aria-label="保留路徑">{JSON.stringify(from)}</output>
    </section>
  );
}

const renderGuard = (auth: AuthContextValue, initialEntry: string) => {
  const router = createMemoryRouter(
    [
      {
        element: <Shell />,
        children: [
          { element: <LoginStateProbe />, path: '/login' },
          {
            element: <RequireAuth />,
            children: [
              { element: <h1>學習大廳</h1>, path: '/app' },
              { element: <h1>加入班級確認</h1>, path: '/join/:joinCode' },
            ],
          },
        ],
      },
    ],
    { initialEntries: [initialEntry] },
  );

  render(
    <AuthContext.Provider value={auth}>
      <RouterProvider router={router} />
    </AuthContext.Provider>,
  );

  return router;
};

describe('RequireAuth', () => {
  it('shows a nested-landmark-safe loading state', () => {
    renderGuard(createAuthValue({ session: null, status: 'loading' }), '/app');

    expect(screen.getByRole('status', { name: '頁面載入中' })).toBeVisible();
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.queryByRole('heading', { name: '學習大廳' })).toBeNull();
  });

  it('redirects anonymously with replace and preserves pathname, search, and hash', async () => {
    const router = renderGuard(
      createAuthValue({ session: null, status: 'anonymous' }),
      '/app?chapter=color-theory#checkpoint',
    );

    expect(await screen.findByRole('heading', { name: '登入' })).toBeVisible();
    expect(router.state.historyAction).toBe('REPLACE');
    expect(screen.getByLabelText('保留路徑')).toHaveTextContent(
      JSON.stringify({
        hash: '#checkpoint',
        pathname: '/app',
        search: '?chapter=color-theory',
      }),
    );
    expect(screen.queryByRole('heading', { name: '學習大廳' })).toBeNull();
  });

  it('renders the protected outlet for an authenticated session', async () => {
    renderGuard(
      createAuthValue({
        session: {
          email: 'learner@colorplay.invalid',
          userId: 'learner-id',
        },
        status: 'authenticated',
      }),
      '/app',
    );

    expect(
      await screen.findByRole('heading', { name: '學習大廳' }),
    ).toBeVisible();
    expect(screen.queryByRole('status', { name: '頁面載入中' })).toBeNull();
  });

  it('preserves a join-code deep link for login without joining', async () => {
    const router = renderGuard(
      createAuthValue({ session: null, status: 'anonymous' }),
      '/join/ABCD-1234-EF56-7890',
    );
    expect(await screen.findByRole('heading', { name: '登入' })).toBeVisible();
    expect(router.state.location.state).toEqual({
      from: { hash: '', pathname: '/join/ABCD-1234-EF56-7890', search: '' },
    });
  });
});
