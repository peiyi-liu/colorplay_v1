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
  account: 'cp045001',
  email: 'learner@colorplay.invalid',
  password: 'fixture-password',
} as const;

const createAuthValue = (
  signIn: AuthContextValue['signIn'] = () => Promise.resolve(),
  signInWithAccount: AuthContextValue['signInWithAccount'] = () =>
    Promise.resolve(),
): AuthContextValue => ({
  session: null,
  signIn,
  signInWithAccount,
  signOut: () => Promise.resolve(),
  status: 'anonymous',
});

const fillEmailBridgeCredentials = async (
  user: ReturnType<typeof userEvent.setup>,
) => {
  await user.type(screen.getByLabelText('帳號'), validCredentials.email);
  await user.type(screen.getByLabelText('密碼'), validCredentials.password);
};

const renderLoginPage = (value: AuthContextValue) =>
  render(
    <MemoryRouter>
      <AuthContext.Provider value={value}>
        <ToastProvider>
          <LoginPage />
        </ToastProvider>
      </AuthContext.Provider>
    </MemoryRouter>,
  );

describe('LoginPage', () => {
  it('groups labeled inputs and one primary submit action', async () => {
    renderLoginPage(createAuthValue());

    expect(screen.getByLabelText('帳號')).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('密碼')).toHaveAttribute('type', 'password');
    expect(screen.getAllByRole('button', { name: '登入' })).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: '登入' }));

    expect(await screen.findByText('請輸入帳號')).toBeVisible();
    expect(screen.getByLabelText('帳號')).toHaveAccessibleDescription(
      '請輸入帳號',
    );
    expect(screen.getByLabelText('密碼')).toHaveAccessibleDescription(
      '請輸入密碼',
    );
  });

  it('sends a student account through the account sign-in path', async () => {
    const user = userEvent.setup();
    const signIn = vi.fn(() => Promise.resolve());
    const signInWithAccount = vi.fn(() => Promise.resolve());
    renderLoginPage(createAuthValue(signIn, signInWithAccount));

    await user.type(screen.getByLabelText('帳號'), validCredentials.account);
    await user.type(screen.getByLabelText('密碼'), validCredentials.password);
    await user.click(screen.getByRole('button', { name: '登入' }));

    await waitFor(() => {
      expect(signInWithAccount).toHaveBeenCalledWith({
        account: validCredentials.account,
        password: validCredentials.password,
        portal: 'student',
      });
    });
    expect(signIn).not.toHaveBeenCalled();
  });

  it('keeps the email bridge for identifiers that contain @', async () => {
    const user = userEvent.setup();
    const signIn = vi.fn(() => Promise.resolve());
    const signInWithAccount = vi.fn(() => Promise.resolve());
    renderLoginPage(createAuthValue(signIn, signInWithAccount));

    await fillEmailBridgeCredentials(user);
    await user.click(screen.getByRole('button', { name: '登入' }));

    await waitFor(() => {
      expect(signIn).toHaveBeenCalledWith({
        email: validCredentials.email,
        password: validCredentials.password,
      });
    });
    expect(signInWithAccount).not.toHaveBeenCalled();
  });

  it('requires the class code for teacher account logins', async () => {
    const user = userEvent.setup();
    const signInWithAccount = vi.fn(() => Promise.resolve());
    renderLoginPage(createAuthValue(undefined, signInWithAccount));

    await user.click(screen.getByRole('radio', { name: '教師端登入' }));
    await user.type(screen.getByLabelText('帳號'), 'teacher01');
    await user.type(screen.getByLabelText('密碼'), validCredentials.password);
    await user.click(screen.getByRole('button', { name: '登入' }));

    expect(await screen.findByText('請輸入班級序號')).toBeVisible();
    expect(signInWithAccount).not.toHaveBeenCalled();

    await user.type(
      screen.getByLabelText('管的班級（班級序號）'),
      'ABCD-1234-EF56-7890',
    );
    await user.click(screen.getByRole('button', { name: '登入' }));

    await waitFor(() => {
      expect(signInWithAccount).toHaveBeenCalledWith({
        account: 'teacher01',
        classCode: 'ABCD-1234-EF56-7890',
        password: validCredentials.password,
        portal: 'teacher',
      });
    });
  });

  it.each([
    ['AUTH_INVALID_CREDENTIALS', '帳號或密碼不正確'],
    ['AUTH_NETWORK', '網路連線失敗，請稍後重試'],
    ['AUTH_UNKNOWN', '登入失敗，請使用追蹤代碼回報'],
  ] as const)('maps %s to a stable safe error', async (code, message) => {
    const user = userEvent.setup();
    const signIn = vi.fn(() => Promise.reject(new AuthRepositoryError(code)));
    renderLoginPage(createAuthValue(signIn));

    await fillEmailBridgeCredentials(user);
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
    renderLoginPage(createAuthValue(signIn));

    await fillEmailBridgeCredentials(user);
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
    renderLoginPage(createAuthValue(signIn));

    await fillEmailBridgeCredentials(user);
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

    await fillEmailBridgeCredentials(user);
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

    await user.click(screen.getByRole('radio', { name: '教師端登入' }));
    await fillEmailBridgeCredentials(user);
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

      await fillEmailBridgeCredentials(user);
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
    await fillEmailBridgeCredentials(user);
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
  renderLoginPage(createAuthValue());
  expect(screen.getByText('ColorPlay')).toBeInTheDocument();
  expect(screen.getByText('色彩原理遊戲式學習平台')).toBeInTheDocument();
});

it('switches the ggame portal tone and teacher note with the tabs', async () => {
  renderLoginPage(createAuthValue());
  const portalSection = document.querySelector('.auth-portal');
  expect(portalSection).not.toBeNull();
  expect(portalSection).toHaveAttribute('data-portal', 'student');
  expect(screen.queryByText(/教師端具備班級管理/u)).toBeNull();

  await userEvent.click(screen.getByRole('radio', { name: '教師端登入' }));
  expect(portalSection).toHaveAttribute('data-portal', 'teacher');
  expect(screen.getByText(/教師端具備班級管理/u)).toBeInTheDocument();
});

it('offers register and forgot-password entries on the student portal only', async () => {
  renderLoginPage(createAuthValue());
  expect(screen.getByRole('link', { name: '註冊帳號' })).toHaveAttribute(
    'href',
    '/register',
  );
  expect(screen.getByRole('link', { name: '忘記密碼' })).toHaveAttribute(
    'href',
    '/forgot-password',
  );

  await userEvent.click(screen.getByRole('radio', { name: '教師端登入' }));
  expect(screen.queryByRole('link', { name: '註冊帳號' })).toBeNull();
  expect(screen.getByRole('link', { name: '忘記密碼' })).toBeVisible();
});
