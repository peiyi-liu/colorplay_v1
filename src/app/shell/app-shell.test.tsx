import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  createMemoryRouter,
  MemoryRouter,
  RouterProvider,
  useNavigate,
} from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '../../features/auth/context/auth-context';
import { useMyProfile } from '../../features/profile/hooks/use-my-profile';
import { AppShell } from './app-shell';

vi.mock('../../features/auth/context/auth-context', () => ({
  useAuth: vi.fn(),
}));
vi.mock('../../features/profile/hooks/use-my-profile', () => ({
  useMyProfile: vi.fn(),
}));

const mockedUseAuth = vi.mocked(useAuth);
const mockedUseMyProfile = vi.mocked(useMyProfile);

describe('AppShell', () => {
  beforeEach(() => {
    mockedUseAuth.mockReturnValue({
      session: {
        email: 'student.one@colorplay.test',
        userId: 'student-one-id',
      },
      signIn: vi.fn(),
      signOut: vi.fn(),
      status: 'authenticated',
    });
    mockedUseMyProfile.mockReturnValue({
      data: {
        displayName: 'student.one',
        id: 'student-one-id',
        role: 'student',
        timezone: 'Asia/Taipei',
      },
      error: null,
      isError: false,
      isPending: false,
      refetch: vi.fn(),
    });
  });

  it('provides a skip link, banner, and main outlet region', () => {
    render(
      <MemoryRouter>
        <AppShell />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: '跳到主要內容' })).toHaveAttribute(
      'href',
      '#main-content',
    );
    expect(screen.getByRole('banner')).toBeVisible();
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
  });

  it('uses a labelled home link without treating navigation as a route CTA', () => {
    render(
      <MemoryRouter>
        <AppShell />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('link', { name: 'ColorPlay 首頁' }),
    ).toHaveAttribute('href', '/');
    expect(document.querySelectorAll('[data-acceptance-target]')).toHaveLength(
      0,
    );
  });

  it('does not show teacher navigation to an authoritative student profile', () => {
    render(
      <MemoryRouter>
        <AppShell />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('link', { name: '教師工作區' })).toBeNull();
  });

  it('shows teacher navigation only for an authoritative teacher profile', () => {
    mockedUseAuth.mockReturnValue({
      session: {
        email: 'teacher@colorplay.test',
        userId: 'teacher-id',
      },
      signIn: vi.fn(),
      signOut: vi.fn(),
      status: 'authenticated',
    });
    mockedUseMyProfile.mockReturnValue({
      data: {
        displayName: 'teacher',
        id: 'teacher-id',
        role: 'teacher',
        timezone: 'Asia/Taipei',
      },
      error: null,
      isError: false,
      isPending: false,
      refetch: vi.fn(),
    });

    render(
      <MemoryRouter>
        <AppShell />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: '教師工作區' })).toHaveAttribute(
      'href',
      '/teacher',
    );
  });

  it('awaits signOut and replaces protected history with login', async () => {
    const signOut = vi.fn(() => Promise.resolve());
    mockedUseAuth.mockReturnValue({
      session: {
        email: 'student.one@colorplay.test',
        userId: 'student-one-id',
      },
      signIn: vi.fn(),
      signOut,
      status: 'authenticated',
    });
    const router = createMemoryRouter(
      [
        { element: <AppShell />, path: '/app' },
        { element: <h1>登入</h1>, path: '/login' },
      ],
      { initialEntries: ['/app'] },
    );
    render(<RouterProvider router={router} />);

    await userEvent.click(screen.getByRole('button', { name: '登出' }));

    expect(signOut).toHaveBeenCalledOnce();
    expect(await screen.findByRole('heading', { name: '登入' })).toBeVisible();
    expect(router.state.historyAction).toBe('REPLACE');
  });

  it('keeps the authenticated shell when signOut rejects', async () => {
    const signOut = vi.fn(() => Promise.reject(new Error('provider detail')));
    mockedUseAuth.mockReturnValue({
      session: {
        email: 'student.one@colorplay.test',
        userId: 'student-one-id',
      },
      signIn: vi.fn(),
      signOut,
      status: 'authenticated',
    });
    render(
      <MemoryRouter initialEntries={['/app']}>
        <AppShell />
      </MemoryRouter>,
    );

    await userEvent.click(screen.getByRole('button', { name: '登出' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '登出失敗，請稍後重試。',
    );
    expect(screen.getByRole('button', { name: '登出' })).toBeVisible();
    expect(screen.getByRole('alert')).not.toHaveTextContent('provider detail');
  });

  it('allows account B to sign out after account A logs out through the mounted root shell', async () => {
    let currentAuth!: ReturnType<typeof useAuth>;
    const signOut = vi.fn(() => {
      currentAuth = anonymous;
      return Promise.resolve();
    });
    const anonymous = {
      session: null,
      signIn: vi.fn(),
      signOut,
      status: 'anonymous',
    } as const;
    const accountA = {
      session: {
        email: 'student.one@colorplay.test',
        userId: 'student-one-id',
      },
      signIn: vi.fn(),
      signOut,
      status: 'authenticated',
    } as const;
    const accountB = {
      session: {
        email: 'student.two@colorplay.test',
        userId: 'student-two-id',
      },
      signIn: vi.fn(),
      signOut,
      status: 'authenticated',
    } as const;
    currentAuth = accountA;
    mockedUseAuth.mockImplementation(() => currentAuth);

    function AccountBLogin() {
      const navigate = useNavigate();
      return (
        <button
          onClick={() => {
            currentAuth = accountB;
            void navigate('/app', { replace: true });
          }}
          type="button"
        >
          以 B 登入
        </button>
      );
    }

    const router = createMemoryRouter(
      [
        {
          element: <AppShell />,
          children: [
            { element: <AccountBLogin />, path: '/login' },
            { element: <h1>受保護頁面</h1>, path: '/app' },
          ],
        },
      ],
      { initialEntries: ['/app'] },
    );
    render(<RouterProvider router={router} />);

    await userEvent.click(screen.getByRole('button', { name: '登出' }));
    await userEvent.click(
      await screen.findByRole('button', { name: '以 B 登入' }),
    );

    const accountBLogout = await screen.findByRole('button', { name: '登出' });
    expect(accountBLogout).toBeEnabled();
    await userEvent.click(accountBLogout);

    expect(signOut).toHaveBeenCalledTimes(2);
    expect(
      await screen.findByRole('button', { name: '以 B 登入' }),
    ).toBeVisible();
  });
});
