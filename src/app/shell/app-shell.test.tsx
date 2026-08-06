import { render, screen, within } from '@testing-library/react';
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
import { useBlookInventory } from '../../features/inventory/hooks/use-blook-inventory';
import { useEconomySummary } from '../../features/rewards/hooks/use-economy-summary';
import { ToastProvider } from '../../components/ui/toast';
import { AppShell } from './app-shell';

vi.mock('./environment-marker', async () => {
  const actual = await vi.importActual<typeof import('./environment-marker')>(
    './environment-marker',
  );
  return {
    EnvironmentMarker: () => <actual.EnvironmentMarker environment="staging" />,
  };
});

vi.mock('../../features/auth/context/auth-context', () => ({
  useAuth: vi.fn(),
}));
vi.mock('../../features/profile/hooks/use-my-profile', () => ({
  useMyProfile: vi.fn(),
}));
vi.mock('../../features/rewards/hooks/use-economy-summary', () => ({
  useEconomySummary: vi.fn(),
}));
vi.mock('../../features/inventory/hooks/use-blook-inventory', () => ({
  useBlookInventory: vi.fn(),
}));

const mockedUseAuth = vi.mocked(useAuth);
const mockedUseMyProfile = vi.mocked(useMyProfile);
const mockedUseBlookInventory = vi.mocked(useBlookInventory);
const mockedUseEconomySummary = vi.mocked(useEconomySummary);

const economyResult = (
  value: Partial<ReturnType<typeof useEconomySummary>>,
): ReturnType<typeof useEconomySummary> =>
  value as ReturnType<typeof useEconomySummary>;

const inventoryResult = (
  value: Partial<ReturnType<typeof useBlookInventory>>,
) => value as ReturnType<typeof useBlookInventory>;

const renderStudentShell = () =>
  render(
    <MemoryRouter>
      <ToastProvider>
        <AppShell />
      </ToastProvider>
    </MemoryRouter>,
  );

const renderTeacherShell = () => {
  mockedUseAuth.mockReturnValue({
    session: {
      email: 'teacher@colorplay.test',
      userId: 'teacher-id',
    },
    signIn: vi.fn(),
    signInWithAccount: vi.fn(),
    signOut: vi.fn(),
    status: 'authenticated',
  });
  mockedUseMyProfile.mockReturnValue({
    data: {
      displayName: 'teacher',
      id: 'teacher-id',
      role: 'teacher',
      timezone: 'Asia/Taipei',
      reducedMotion: false,
    },
    error: null,
    isError: false,
    isPending: false,
    refetch: vi.fn(),
  });

  return renderStudentShell();
};

describe('AppShell', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        addEventListener: vi.fn(),
        matches: false,
        media: '(orientation: portrait)',
        removeEventListener: vi.fn(),
      }),
    );
    mockedUseEconomySummary.mockReset();
    mockedUseAuth.mockReturnValue({
      session: {
        email: 'student.one@colorplay.test',
        userId: 'student-one-id',
      },
      signIn: vi.fn(),
      signInWithAccount: vi.fn(),
      signOut: vi.fn(),
      status: 'authenticated',
    });
    mockedUseMyProfile.mockReturnValue({
      data: {
        displayName: 'student.one',
        id: 'student-one-id',
        role: 'student',
        timezone: 'Asia/Taipei',
        reducedMotion: false,
      },
      error: null,
      isError: false,
      isPending: false,
      refetch: vi.fn(),
    });
    mockedUseEconomySummary.mockReturnValue(
      economyResult({
        data: {
          currentLevelXp: 250,
          level: 2,
          tokenBalance: 250,
          totalXp: 750,
          walletReconciled: true,
          xpPerLevel: 500,
        },
        isError: false,
        isPending: false,
      }),
    );
    mockedUseBlookInventory.mockReset();
    mockedUseBlookInventory.mockReturnValue(
      inventoryResult({
        data: {
          activeBlookId: 'little-fox-id',
          items: [
            {
              costTokens: 30,
              emoji: '🦊',
              equipped: true,
              id: 'little-fox-id',
              name: '小狐狸',
              owned: true,
              stableCode: 'little_fox',
            },
          ],
          tokenBalance: 250,
        },
        isError: false,
        isPending: false,
      }),
    );
  });

  it('wraps the whole app in the 16:9 game stage shell', () => {
    render(
      <MemoryRouter>
        <ToastProvider>
          <AppShell />
        </ToastProvider>
      </MemoryRouter>,
    );

    const main = screen.getByRole('main');
    expect(main).toHaveClass('game-stage__scene');
    const stage = main.closest('.game-stage');
    expect(stage).not.toBeNull();
    expect(stage?.closest('.game-viewport')).not.toBeNull();
    // skip-link 錨在舞台內(fixed 退場改 absolute)
    expect(
      screen.getByRole('link', { name: '跳到主要內容' }).closest('.game-stage'),
    ).toBe(stage);
  });

  it('provides a skip link, banner, and main outlet region', () => {
    render(
      <MemoryRouter>
        <ToastProvider>
          <AppShell />
        </ToastProvider>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: '跳到主要內容' })).toHaveAttribute(
      'href',
      '#main-content',
    );
    expect(screen.getByRole('banner')).toBeVisible();
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
  });

  it('mounts the visible Staging marker inside the game stage', () => {
    renderStudentShell();

    const marker = screen.getByRole('status', { name: 'STAGING 測試環境' });
    expect(marker).toBeVisible();
    expect(marker.closest('.game-stage')).not.toBeNull();
  });

  it('遊戲 HUD 不再提供頂列品牌連結（chrome 收進舞台）', () => {
    render(
      <MemoryRouter>
        <ToastProvider>
          <AppShell />
        </ToastProvider>
      </MemoryRouter>,
    );

    expect(screen.queryByRole('link', { name: 'ColorPlay 首頁' })).toBeNull();
    expect(document.querySelectorAll('[data-acceptance-target]')).toHaveLength(
      0,
    );
  });

  it('does not show teacher navigation to an authoritative student profile', async () => {
    render(
      <MemoryRouter>
        <ToastProvider>
          <AppShell />
        </ToastProvider>
      </MemoryRouter>,
    );

    expect(screen.queryByRole('link', { name: '教師工作區' })).toBeNull();
    expect(screen.queryByText(/教師端/u)).toBeNull();
    // HUD 重組批：裝備商店/班級排行榜/成就徽章已移入 MENU 面板，需先開 MENU。
    await userEvent.click(screen.getByRole('button', { name: 'MENU' }));
    expect(screen.getByRole('link', { name: '裝備商店' })).toHaveAttribute(
      'href',
      '/app/shop',
    );
    expect(screen.getByRole('link', { name: '班級排行榜' })).toHaveAttribute(
      'href',
      '/app/leaderboard',
    );
    expect(screen.getAllByRole('link', { name: '成就徽章' })).toHaveLength(1);
    expect(screen.getByRole('link', { name: '成就徽章' })).toHaveAttribute(
      'href',
      '/app/achievements',
    );
  });

  it('shows the authenticated student server economy summary', () => {
    render(
      <MemoryRouter>
        <ToastProvider>
          <AppShell />
        </ToastProvider>
      </MemoryRouter>,
    );

    expect(screen.getByText('Level 2')).toBeVisible();
    expect(screen.getByText('250 / 500 XP')).toBeVisible();
    expect(screen.getByText('250 Token')).toBeVisible();
    expect(mockedUseEconomySummary).toHaveBeenCalledOnce();
    expect(mockedUseBlookInventory).toHaveBeenCalledOnce();
  });

  it('學生頂部顯示頭像框與經濟群組', async () => {
    renderStudentShell();

    expect(await screen.findByText(/Level \d+/u)).toBeInTheDocument();
    expect(document.querySelector('.hud-economy-group')).not.toBeNull();
    expect(document.querySelector('.hud-avatar')).not.toBeNull();
  });

  it('教師頂部顯示歡迎識別且不渲染經濟數字', async () => {
    renderTeacherShell();

    expect(await screen.findByText(/歡迎，.+・教師端/u)).toBeInTheDocument();
    expect(screen.queryByText(/Level \d+/u)).toBeNull();
    expect(screen.queryByText(/\d+ Token/u)).toBeNull();
  });

  it('does not query or fabricate economy data while logged out', () => {
    mockedUseAuth.mockReturnValue({
      session: null,
      signIn: vi.fn(),
      signInWithAccount: vi.fn(),
      signOut: vi.fn(),
      status: 'anonymous',
    });
    mockedUseMyProfile.mockReturnValue({
      data: undefined,
      error: null,
      isError: false,
      isPending: false,
      refetch: vi.fn(),
    });

    render(
      <MemoryRouter>
        <ToastProvider>
          <AppShell />
        </ToastProvider>
      </MemoryRouter>,
    );

    expect(mockedUseEconomySummary).not.toHaveBeenCalled();
    expect(mockedUseBlookInventory).not.toHaveBeenCalled();
    expect(screen.queryByText(/Level/u)).toBeNull();
    expect(screen.queryByText(/Token/u)).toBeNull();
    expect(screen.queryByRole('banner')).toBeNull();
  });

  it('uses non-blocking loading text and never fabricates a zero balance on failure', () => {
    mockedUseEconomySummary.mockReturnValue(
      economyResult({ data: undefined, isError: false, isPending: true }),
    );
    const { rerender } = render(
      <MemoryRouter>
        <ToastProvider>
          <AppShell />
        </ToastProvider>
      </MemoryRouter>,
    );
    expect(screen.getByText('經濟資料載入中…')).toHaveAttribute(
      'role',
      'status',
    );

    mockedUseEconomySummary.mockReturnValue(
      economyResult({ data: undefined, isError: true, isPending: false }),
    );
    rerender(
      <MemoryRouter>
        <ToastProvider>
          <AppShell />
        </ToastProvider>
      </MemoryRouter>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      '經濟資料暫時無法顯示。',
    );
    expect(screen.queryByText('0 Token')).toBeNull();
    expect(mockedUseBlookInventory).toHaveBeenCalledTimes(2);
  });

  it('shows teacher navigation only for an authoritative teacher profile', async () => {
    mockedUseAuth.mockReturnValue({
      session: {
        email: 'teacher@colorplay.test',
        userId: 'teacher-id',
      },
      signIn: vi.fn(),
      signInWithAccount: vi.fn(),
      signOut: vi.fn(),
      status: 'authenticated',
    });
    mockedUseMyProfile.mockReturnValue({
      data: {
        displayName: 'teacher',
        id: 'teacher-id',
        role: 'teacher',
        timezone: 'Asia/Taipei',
        reducedMotion: false,
      },
      error: null,
      isError: false,
      isPending: false,
      refetch: vi.fn(),
    });

    render(
      <MemoryRouter>
        <ToastProvider>
          <AppShell />
        </ToastProvider>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: '教師工作區' })).toHaveAttribute(
      'href',
      '/teacher',
    );
    // HUD 重組批：班級管理已移入 MENU 面板，需先開 MENU。
    await userEvent.click(screen.getByRole('button', { name: 'MENU' }));
    expect(screen.getByRole('link', { name: '班級管理' })).toHaveAttribute(
      'href',
      '/teacher/classes',
    );
    // header 右側教師徽章:姓名用 profile 的 displayName,不寫死「劉老師」。
    expect(
      within(screen.getByRole('banner')).getByText('歡迎，teacher・教師端'),
    ).toBeVisible();
  });

  it('renders the simplified primary rail for students', async () => {
    render(
      <MemoryRouter>
        <ToastProvider>
          <AppShell />
        </ToastProvider>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: '學習大廳' })).toHaveAttribute(
      'href',
      '/app',
    );
    // 頂列僅保留等級摘要與登出；作業入口已移除。
    expect(screen.queryByRole('link', { name: '進入大廳' })).toBeNull();
    expect(screen.queryByRole('link', { name: '我的作業' })).toBeNull();
    expect(screen.queryByRole('link', { name: '教師後台' })).toBeNull();
    expect(screen.queryByText('色彩原理學習平台')).toBeNull();

    // 學生列上導覽收斂為 2 項（HUD 重組批 spec 2026-08-02）；完整 7 項標籤
    // 覆蓋交給 hud-command-bar.test.tsx 的面板迴圈測試承接，此處不重複維護
    // 同一份標籤清單。
    const nav = screen.getByRole('navigation', { name: '主要導覽' });
    const linkNames = within(nav)
      .getAllByRole('link')
      .map((link) => link.textContent);
    expect(linkNames).toEqual(['學習大廳', 'Live 課堂']);
    expect(screen.queryByRole('link', { name: '學習進度' })).toBeNull();

    // 課後任務實戰/裝備商店/我的錯題已移入 MENU 面板，需先開 MENU。
    await userEvent.click(screen.getByRole('button', { name: 'MENU' }));
    expect(screen.getByRole('link', { name: '課後任務實戰' })).toHaveAttribute(
      'href',
      '/app/missions',
    );
    expect(screen.getByRole('link', { name: '裝備商店' })).toHaveAttribute(
      'href',
      '/app/shop',
    );
    expect(screen.getByRole('link', { name: '我的錯題' })).toHaveAttribute(
      'href',
      '/app/mistakes',
    );
  });

  it('gives teachers the indigo rail with full workspace links', async () => {
    mockedUseAuth.mockReturnValue({
      session: {
        email: 'teacher@colorplay.test',
        userId: 'teacher-id',
      },
      signIn: vi.fn(),
      signInWithAccount: vi.fn(),
      signOut: vi.fn(),
      status: 'authenticated',
    });
    mockedUseMyProfile.mockReturnValue({
      data: {
        displayName: 'teacher',
        id: 'teacher-id',
        role: 'teacher',
        timezone: 'Asia/Taipei',
        reducedMotion: false,
      },
      error: null,
      isError: false,
      isPending: false,
      refetch: vi.fn(),
    });

    render(
      <MemoryRouter>
        <ToastProvider>
          <AppShell />
        </ToastProvider>
      </MemoryRouter>,
    );

    expect(screen.queryByRole('link', { name: '題庫管理' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Live 主持' })).toHaveAttribute(
      'href',
      '/teacher/live',
    );
    expect(screen.getByRole('link', { name: '教師工作區' })).toHaveAttribute(
      'href',
      '/teacher',
    );
    // UAT 0727 #6：教師不顯示授權 chip，也不顯示學生導覽列。
    expect(screen.queryByText('教師管理權限已授權')).toBeNull();
    expect(screen.queryByRole('link', { name: '學習大廳' })).toBeNull();
    expect(screen.queryByRole('link', { name: '裝備商店' })).toBeNull();

    // 班級管理/教學分析已移入 MENU 面板，需先開 MENU。
    await userEvent.click(screen.getByRole('button', { name: 'MENU' }));
    expect(screen.getByRole('link', { name: '班級管理' })).toHaveAttribute(
      'href',
      '/teacher/classes',
    );
    expect(screen.getByRole('link', { name: '教學分析' })).toHaveAttribute(
      'href',
      '/teacher/analytics',
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
      signInWithAccount: vi.fn(),
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
    render(
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'MENU' }));
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
      signInWithAccount: vi.fn(),
      signOut,
      status: 'authenticated',
    });
    render(
      <MemoryRouter initialEntries={['/app']}>
        <ToastProvider>
          <AppShell />
        </ToastProvider>
      </MemoryRouter>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'MENU' }));
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
      signInWithAccount: vi.fn(),
      signOut,
      status: 'anonymous',
    } as const;
    const accountA = {
      session: {
        email: 'student.one@colorplay.test',
        userId: 'student-one-id',
      },
      signIn: vi.fn(),
      signInWithAccount: vi.fn(),
      signOut,
      status: 'authenticated',
    } as const;
    const accountB = {
      session: {
        email: 'student.two@colorplay.test',
        userId: 'student-two-id',
      },
      signIn: vi.fn(),
      signInWithAccount: vi.fn(),
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
    render(
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'MENU' }));
    await userEvent.click(screen.getByRole('button', { name: '登出' }));
    await userEvent.click(
      await screen.findByRole('button', { name: '以 B 登入' }),
    );

    // 帳號 B 的 mock profile 仍是帳號 A 的資料（id 不吻合 session.userId），
    // 故落入 isAuthenticatedProfile=false 的 fallback 登出鈕（Step 4.4），
    // 不經過 HUD MENU。
    const accountBLogout = await screen.findByRole('button', { name: '登出' });
    expect(accountBLogout).toBeEnabled();
    await userEvent.click(accountBLogout);

    expect(signOut).toHaveBeenCalledTimes(2);
    expect(
      await screen.findByRole('button', { name: '以 B 登入' }),
    ).toBeVisible();
  });
});
