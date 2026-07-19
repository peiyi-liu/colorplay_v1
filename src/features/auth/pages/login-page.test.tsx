import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  createMemoryRouter,
  MemoryRouter,
  RouterProvider,
} from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { AuthContext, type AuthContextValue } from '../context/auth-context';
import { AuthRepositoryError } from '../types';
import { ToastProvider } from '../../../components/ui/toast';
import { LoginPage } from './login-page';

const validCredentials = {
  email: 'learner@colorplay.invalid',
  password: 'fixture-password',
} as const;

const createAuthValue = (
  signIn: AuthContextValue['signIn'] = () => Promise.resolve(),
): AuthContextValue => ({
  session: null,
  signIn,
  signOut: () => Promise.resolve(),
  status: 'anonymous',
});

const fillValidCredentials = async (
  user: ReturnType<typeof userEvent.setup>,
) => {
  await user.type(screen.getByLabelText('Email'), validCredentials.email);
  await user.type(screen.getByLabelText('密碼'), validCredentials.password);
};

describe('LoginPage', () => {
  it('groups labeled inputs and one primary submit action', async () => {
    render(
      <MemoryRouter>
        <AuthContext.Provider value={createAuthValue()}>
          <ToastProvider>
            <LoginPage />
          </ToastProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    );

    expect(screen.getByLabelText('Email')).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText('密碼')).toHaveAttribute('type', 'password');
    expect(screen.getAllByRole('button', { name: '登入' })).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: '登入' }));

    expect(await screen.findByText('請輸入有效的 Email')).toBeVisible();
    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription(
      '請輸入有效的 Email',
    );
    expect(screen.getByLabelText('密碼')).toHaveAccessibleDescription(
      '密碼需為 8 至 128 個字元',
    );
  });

  it('uses the linked Traditional Chinese schema error for a malformed non-empty Email', async () => {
    const user = userEvent.setup();
    const signIn = vi.fn(() => Promise.resolve());
    render(
      <MemoryRouter>
        <AuthContext.Provider value={createAuthValue(signIn)}>
          <ToastProvider>
            <LoginPage />
          </ToastProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('Email'), 'malformed-email');
    await user.type(screen.getByLabelText('密碼'), validCredentials.password);
    await user.click(screen.getByRole('button', { name: '登入' }));

    expect(await screen.findByText('請輸入有效的 Email')).toBeVisible();
    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription(
      '請輸入有效的 Email',
    );
    expect(signIn).not.toHaveBeenCalled();
  });

  it.each([
    ['AUTH_INVALID_CREDENTIALS', 'Email 或密碼不正確'],
    ['AUTH_NETWORK', '網路連線失敗，請稍後重試'],
    ['AUTH_UNKNOWN', '登入失敗，請使用追蹤代碼回報'],
  ] as const)('maps %s to a stable safe error', async (code, message) => {
    const user = userEvent.setup();
    const signIn = vi.fn(() => Promise.reject(new AuthRepositoryError(code)));
    render(
      <MemoryRouter>
        <AuthContext.Provider value={createAuthValue(signIn)}>
          <ToastProvider>
            <LoginPage />
          </ToastProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    );

    await fillValidCredentials(user);
    await user.click(screen.getByRole('button', { name: '登入' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByRole('alert')).not.toHaveTextContent(code);
    expect(screen.getByRole('alert')).not.toHaveTextContent(
      validCredentials.email,
    );
  });

  it('contains unknown provider details behind the fallback error', async () => {
    const user = userEvent.setup();
    const signIn = vi.fn(() =>
      Promise.reject(new Error('raw provider detail learner@example.test')),
    );
    render(
      <MemoryRouter>
        <AuthContext.Provider value={createAuthValue(signIn)}>
          <ToastProvider>
            <LoginPage />
          </ToastProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    );

    await fillValidCredentials(user);
    await user.click(screen.getByRole('button', { name: '登入' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '登入失敗，請使用追蹤代碼回報',
    );
    expect(screen.getByRole('alert')).not.toHaveTextContent(
      'raw provider detail',
    );
    expect(screen.getByRole('alert')).not.toHaveTextContent(
      'learner@example.test',
    );
  });

  it('locks a pending submission to one request', async () => {
    let resolveSignIn!: () => void;
    const signIn = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSignIn = resolve;
        }),
    );
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AuthContext.Provider value={createAuthValue(signIn)}>
          <ToastProvider>
            <LoginPage />
          </ToastProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    );

    await fillValidCredentials(user);
    const submit = screen.getByRole('button', { name: '登入' });
    await user.click(submit);

    expect(screen.getByRole('button', { name: '登入中…' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('登入處理中，請稍候');
    await user.click(screen.getByRole('button', { name: '登入中…' }));
    expect(signIn).toHaveBeenCalledOnce();

    resolveSignIn();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '登入' })).toBeEnabled();
    });
  });

  it('navigates after success to the preserved internal pathname, search, and hash', async () => {
    const user = userEvent.setup();
    const signIn = vi.fn(() => Promise.resolve());
    const router = createMemoryRouter(
      [
        { element: <LoginPage />, path: '/login' },
        { element: <h1>學習大廳</h1>, path: '/app' },
      ],
      {
        initialEntries: [
          {
            pathname: '/login',
            state: {
              from: {
                hash: '#checkpoint',
                pathname: '/app',
                search: '?chapter=color-theory',
              },
            },
          },
        ],
      },
    );
    render(
      <AuthContext.Provider value={createAuthValue(signIn)}>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </AuthContext.Provider>,
    );

    await fillValidCredentials(user);
    await user.click(screen.getByRole('button', { name: '登入' }));

    expect(
      await screen.findByRole('heading', { name: '學習大廳' }),
    ).toBeVisible();
    expect(router.state.location).toMatchObject({
      hash: '#checkpoint',
      pathname: '/app',
      search: '?chapter=color-theory',
    });
    expect(router.state.historyAction).toBe('REPLACE');
  });

  it('routes a teacher-portal login to the teacher workspace', async () => {
    const user = userEvent.setup();
    const signIn = vi.fn(() => Promise.resolve());
    const router = createMemoryRouter(
      [
        { element: <LoginPage />, path: '/login' },
        { element: <h1>教師工作區</h1>, path: '/teacher' },
      ],
      { initialEntries: ['/login'] },
    );
    render(
      <AuthContext.Provider value={createAuthValue(signIn)}>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </AuthContext.Provider>,
    );

    await user.click(screen.getByRole('radio', { name: '教師' }));
    expect(screen.getByText('教師入口')).toBeVisible();
    await fillValidCredentials(user);
    await user.click(screen.getByRole('button', { name: '登入' }));

    expect(
      await screen.findByRole('heading', { name: '教師工作區' }),
    ).toBeVisible();
    expect(router.state.location.pathname).toBe('/teacher');
  });

  it.each([
    ['protocol-relative', '//malicious.example'],
    ['backslash-normalized', '/\\malicious.example'],
    ['control-character', '/app\u0000/malicious'],
  ])(
    'falls back to /app when the preserved pathname is %s',
    async (_caseName, unsafePathname) => {
      const user = userEvent.setup();
      const router = createMemoryRouter(
        [
          { element: <LoginPage />, path: '/login' },
          { element: <h1>學習大廳</h1>, path: '/app' },
        ],
        {
          initialEntries: [
            {
              pathname: '/login',
              state: {
                from: {
                  hash: '#stolen',
                  pathname: unsafePathname,
                  search: '?token=secret',
                },
              },
            },
          ],
        },
      );
      render(
        <AuthContext.Provider value={createAuthValue()}>
          <ToastProvider>
            <RouterProvider router={router} />
          </ToastProvider>
        </AuthContext.Provider>,
      );

      await fillValidCredentials(user);
      await user.click(screen.getByRole('button', { name: '登入' }));

      expect(
        await screen.findByRole('heading', { name: '學習大廳' }),
      ).toBeVisible();
      expect(router.state.location.pathname).toBe('/app');
      expect(router.state.location.search).toBe('');
      expect(router.state.location.hash).toBe('');
    },
  );

  it('returns to an internal join intent and clears login history state', async () => {
    const user = userEvent.setup();
    const router = createMemoryRouter(
      [
        { element: <LoginPage />, path: '/login' },
        { element: <h1>加入班級確認</h1>, path: '/join/:joinCode' },
      ],
      {
        initialEntries: [
          {
            pathname: '/login',
            state: {
              from: {
                hash: '',
                pathname: '/join/ABCD-1234-EF56-7890',
                search: '',
              },
            },
          },
        ],
      },
    );
    render(
      <AuthContext.Provider value={createAuthValue()}>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </AuthContext.Provider>,
    );
    await fillValidCredentials(user);
    await user.click(screen.getByRole('button', { name: '登入' }));
    expect(
      await screen.findByRole('heading', { name: '加入班級確認' }),
    ).toBeVisible();
    expect(router.state.location.pathname).toBe('/join/ABCD-1234-EF56-7890');
    expect(router.state.location.state).toBeNull();
    expect(router.state.historyAction).toBe('REPLACE');
  });
});

it('shows the ggame auth portal branding', () => {
  render(
    <MemoryRouter>
      <AuthContext.Provider value={createAuthValue()}>
        <ToastProvider>
          <LoginPage />
        </ToastProvider>
      </AuthContext.Provider>
    </MemoryRouter>,
  );
  expect(screen.getByText('ColorPlay 認證入口')).toBeInTheDocument();
  expect(screen.getByText('色彩對比形成性與精熟學習系統')).toBeInTheDocument();
});
