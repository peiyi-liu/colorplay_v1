import { createContext, useContext, useState } from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AuthContext,
  type AuthContextValue,
} from '../../features/auth/context/auth-context';
import { RequireRole } from '../../features/auth/components/require-role';
import { ResetPasswordPage } from '../../features/auth/pages/reset-password-page';
import type { MyProfileQuery } from '../../features/profile/hooks/use-my-profile';
import type { SafeProfile } from '../../features/profile/types';
import { ProfileRepositoryError } from '../../features/profile/types';
import { ToastProvider } from '../../components/ui/toast';
import { AppShell } from './app-shell';
const sdk = vi.hoisted(() => ({
  hasSession: true,
  subscriptions: 0,
  unsubscribe: vi.fn(),
  apply: vi.fn<(...args: unknown[]) => Promise<void>>(() => Promise.resolve()),
}));
vi.mock('../../lib/supabase/browser-client', () => ({
  getBrowserSupabaseClient: () => ({
    auth: {
      onAuthStateChange: (
        callback: (
          event: string,
          session: { access_token: string } | null,
        ) => void,
      ) => {
        sdk.subscriptions++;
        if (sdk.hasSession)
          queueMicrotask(() => {
            callback('PASSWORD_RECOVERY', {
              access_token: 'SYNTHETIC_RECOVERY',
            });
          });
        return { data: { subscription: { unsubscribe: sdk.unsubscribe } } };
      },
      getSession: () =>
        Promise.resolve({
          data: {
            session: sdk.hasSession
              ? { access_token: 'SYNTHETIC_RECOVERY' }
              : null,
          },
        }),
    },
  }),
}));
vi.mock('../../features/auth/api/account-flows', () => ({
  applyNewPassword: sdk.apply,
}));
const ProfileState = createContext<MyProfileQuery | null>(null);
vi.mock('../../features/profile/hooks/use-my-profile', () => ({
  useMyProfile: () => {
    const profile = useContext(ProfileState);
    if (!profile) throw Error('TEST_PROFILE_MISSING');
    return profile;
  },
}));
vi.mock('../../features/inventory/hooks/use-blook-inventory', () => ({
  useBlookInventory: () => ({ data: { items: [] } }),
  useFrameInventory: () => ({ data: { items: [] } }),
}));
vi.mock('../../features/rewards/hooks/use-economy-summary', () => ({
  useEconomySummary: () => ({ isPending: true, isError: false }),
}));
const pendingProfile = (): MyProfileQuery => ({
  data: undefined,
  error: null,
  isPending: true,
  isError: false,
  refetch: vi.fn(),
});
const completedProfile = (role: SafeProfile['role']): MyProfileQuery => ({
  ...pendingProfile(),
  isPending: false,
  data: {
    id: 'synthetic-subject',
    displayName: 'Synthetic learner',
    role,
    registrationComplete: true,
    reducedMotion: false,
    timezone: 'Asia/Taipei',
  },
});
interface Snapshot {
  status: AuthContextValue['status'];
  profile: MyProfileQuery;
}
const mount = (
  entry = '/reset-password',
  initial: Snapshot = { status: 'anonymous', profile: pendingProfile() },
) => {
  let update: (snapshot: Snapshot) => void = () => undefined;
  let signOutState: () => void = () => undefined;
  const signOut = vi.fn(() => {
    signOutState();
    return Promise.resolve();
  });
  function Providers() {
    const [snapshot, setSnapshot] = useState(initial);
    update = setSnapshot;
    signOutState = () => {
      setSnapshot({ status: 'anonymous', profile: pendingProfile() });
    };
    const auth: AuthContextValue = {
      status: snapshot.status,
      session:
        snapshot.status === 'authenticated'
          ? { userId: 'synthetic-subject' }
          : null,
      signOut,
      signIn: vi.fn(),
      signInWithAccount: vi.fn(),
    };
    return (
      <AuthContext.Provider value={auth}>
        <ProfileState.Provider value={snapshot.profile}>
          <ToastProvider>
            <AppShell />
          </ToastProvider>
        </ProfileState.Provider>
      </AuthContext.Provider>
    );
  }
  const router = createMemoryRouter(
    [
      {
        element: <Providers />,
        children: [
          { path: '/reset-password', element: <ResetPasswordPage /> },
          { path: '/login', element: <h1>登入目的地</h1> },
          { path: '/app', element: <p>學生內容</p> },
          {
            element: <RequireRole allowed={['teacher']} />,
            children: [{ path: '/teacher', element: <p>教師保護內容</p> }],
          },
          { path: '/unauthorized', element: <h1>拒絕存取</h1> },
        ],
      },
    ],
    { initialEntries: [entry] },
  );
  render(<RouterProvider router={router} />);
  return {
    router,
    signOut,
    transition: (snapshot: Snapshot) => {
      act(() => {
        update(snapshot);
      });
    },
  };
};
beforeEach(() => {
  sdk.hasSession = true;
  sdk.subscriptions = 0;
  sdk.unsubscribe.mockClear();
  sdk.apply.mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
describe('actual recovery form lifetime inside AppShell', () => {
  it.each(['student', 'teacher', 'admin'] as const)(
    'keeps both original password inputs while Auth and %s profile settle',
    async (role) => {
      const h = mount();
      await waitFor(() =>
        expect(screen.getByRole('button', { name: '更新密碼' })).toBeEnabled(),
      );
      const password = screen.getByLabelText('新密碼', { exact: true });
      const confirmation = screen.getByLabelText('確認新密碼');
      fireEvent.change(password, { target: { value: 'RecoverAa1' } });
      fireEvent.change(confirmation, { target: { value: 'RecoverAa1' } });
      const retained = () => {
        expect(screen.getByLabelText('新密碼', { exact: true })).toBe(password);
        expect(screen.getByLabelText('確認新密碼')).toBe(confirmation);
        expect(password).toHaveValue('RecoverAa1');
        expect(confirmation).toHaveValue('RecoverAa1');
        expect(document.querySelector('.game-stage')).toHaveAttribute(
          'data-shell-role',
          'public',
        );
        expect(sdk.apply).not.toHaveBeenCalled();
        expect(sdk.subscriptions).toBe(1);
      };
      h.transition({ status: 'authenticated', profile: pendingProfile() });
      retained();
      h.transition({
        status: 'authenticated',
        profile: completedProfile(role),
      });
      retained();
      h.transition({
        status: 'authenticated',
        profile: {
          ...pendingProfile(),
          isPending: false,
          isError: true,
          error: new ProfileRepositoryError('PROFILE_UNAVAILABLE'),
        },
      });
      retained();
      h.transition({
        status: 'authenticated',
        profile: completedProfile(role),
      });
      retained();
      await userEvent.click(screen.getByRole('button', { name: '更新密碼' }));
      await screen.findByRole('heading', { name: '登入目的地' });
      expect(sdk.apply).toHaveBeenCalledExactlyOnceWith('RecoverAa1');
      expect(h.signOut).toHaveBeenCalledTimes(1);
      expect(h.router.state.location.pathname).toBe('/login');
      expect(sdk.unsubscribe).toHaveBeenCalledTimes(1);
    },
  );
  it('does not let a completed profile bypass a missing recovery session', async () => {
    vi.useFakeTimers();
    sdk.hasSession = false;
    mount('/reset-password', {
      status: 'authenticated',
      profile: completedProfile('student'),
    });
    expect(screen.getByRole('button', { name: '更新密碼' })).toBeDisabled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(screen.getByRole('alert')).toHaveTextContent('重設連結無效或已過期');
    expect(
      screen.queryByRole('button', { name: '更新密碼' }),
    ).not.toBeInTheDocument();
    expect(sdk.apply).not.toHaveBeenCalled();
    expect(
      screen.getByRole('link', { name: '重新申請重設密碼' }),
    ).toHaveAttribute('href', '/forgot-password');
  });
  it('keeps the normal student shell and its teacher route guard', async () => {
    const h = mount('/app', {
      status: 'authenticated',
      profile: completedProfile('student'),
    });
    expect(screen.getByText('學生內容')).toBeVisible();
    expect(document.querySelector('.game-stage')).toHaveAttribute(
      'data-shell-role',
      'student',
    );
    await act(async () => {
      await h.router.navigate('/teacher');
    });
    expect(screen.getByRole('heading', { name: '拒絕存取' })).toBeVisible();
    expect(screen.queryByText('教師保護內容')).not.toBeInTheDocument();
    expect(sdk.subscriptions).toBe(0);
    expect(sdk.apply).not.toHaveBeenCalled();
  });
});
