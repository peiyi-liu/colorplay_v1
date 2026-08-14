import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useEffect, useState } from 'react';
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
import { ProfileRepositoryError } from '../../features/profile/types';
import {
  useBlookInventory,
  useFrameInventory,
} from '../../features/inventory/hooks/use-blook-inventory';
import { useEconomySummary } from '../../features/rewards/hooks/use-economy-summary';
import { ToastProvider } from '../../components/ui/toast';
import { AppShell } from './app-shell';

const globalStyles = readFileSync(
  resolve(process.cwd(), 'src/styles/globals.css'),
  'utf8',
);

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
  useFrameInventory: vi.fn(),
}));

const mockedUseAuth = vi.mocked(useAuth);
const mockedUseMyProfile = vi.mocked(useMyProfile);
const mockedUseBlookInventory = vi.mocked(useBlookInventory);
const mockedUseFrameInventory = vi.mocked(useFrameInventory);
const mockedUseEconomySummary = vi.mocked(useEconomySummary);

const economyResult = (
  value: Partial<ReturnType<typeof useEconomySummary>>,
): ReturnType<typeof useEconomySummary> =>
  value as ReturnType<typeof useEconomySummary>;

const inventoryResult = (
  value: Partial<ReturnType<typeof useBlookInventory>>,
) => value as ReturnType<typeof useBlookInventory>;

const frameInventoryResult = (
  value: Partial<ReturnType<typeof useFrameInventory>>,
) => value as ReturnType<typeof useFrameInventory>;

const renderStudentShell = () =>
  render(
    <MemoryRouter>
      <ToastProvider>
        <AppShell />
      </ToastProvider>
    </MemoryRouter>,
  );

const renderShellRoute = (entry: string) => {
  const router = createMemoryRouter(
    [
      {
        children: [
          {
            element: <button type="button">地圖操作</button>,
            index: true,
          },
          { element: <div>裝備商店內容</div>, path: 'shop' },
        ],
        element: (
          <ToastProvider>
            <AppShell />
          </ToastProvider>
        ),
        path: '/app',
      },
    ],
    { initialEntries: [entry] },
  );

  return render(<RouterProvider router={router} />);
};

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
      registrationComplete: true,
    },
    error: null,
    isError: false,
    isPending: false,
    refetch: vi.fn(),
  });

  const router = createMemoryRouter(
    [
      {
        children: [{ element: <div>教師頁內容</div>, path: '/teacher' }],
        element: (
          <ToastProvider>
            <AppShell />
          </ToastProvider>
        ),
      },
    ],
    { initialEntries: ['/teacher'] },
  );

  return render(<RouterProvider router={router} />);
};

describe('AppShell', () => {
  beforeEach(() => {
    sessionStorage.clear();
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
        registrationComplete: true,
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
    mockedUseFrameInventory.mockReset();
    mockedUseFrameInventory.mockReturnValue(
      frameInventoryResult({
        data: {
          activeFrameId: '',
          items: [],
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

  it('renders student HUD navigation before the identity header and main content', () => {
    renderStudentShell();

    const hud = screen.getByRole('banner');
    expect(
      within(hud).getByRole('navigation', { name: '主要導覽' }),
    ).toBeVisible();
    expect(within(hud).getByRole('group', { name: '學生身分' })).toBeVisible();
    expect(hud.nextElementSibling).toBe(screen.getByRole('main'));
  });

  it('does not render legacy HUD chrome around teacher routes', () => {
    renderTeacherShell();

    expect(screen.getByText('教師頁內容')).toBeVisible();
    expect(document.querySelector('.hud-command')).toBeNull();
    expect(document.querySelector('.hud-top')).toBeNull();
    expect(screen.queryByRole('navigation', { name: '主要導覽' })).toBeNull();
  });

  it('keeps an OTP-authenticated but incomplete student on the public registration shell', () => {
    mockedUseMyProfile.mockReturnValue({
      data: {
        displayName: '待完成註冊',
        id: 'student-one-id',
        reducedMotion: false,
        registrationComplete: false,
        role: 'student',
        timezone: 'Asia/Taipei',
      },
      error: null,
      isError: false,
      isPending: false,
      refetch: vi.fn(),
    });

    const router = createMemoryRouter(
      [
        {
          children: [{ element: <div>繼續完成註冊</div>, path: '/register' }],
          element: (
            <ToastProvider>
              <AppShell />
            </ToastProvider>
          ),
        },
      ],
      { initialEntries: ['/register'] },
    );

    render(<RouterProvider router={router} />);

    expect(screen.getByText('繼續完成註冊')).toBeVisible();
    expect(document.querySelector('.student-hud')).toBeNull();
    expect(document.querySelector('.game-stage')).toHaveAttribute(
      'data-shell-role',
      'public',
    );
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
    // 商店提升為主導覽；排行榜與成就仍留在 MENU。
    await userEvent.click(screen.getByRole('button', { name: 'MENU' }));
    expect(screen.getByRole('link', { name: '商店' })).toHaveAttribute(
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

    expect(screen.getByText('Lv.2')).toBeVisible();
    expect(screen.getByText('250 / 500')).toBeVisible();
    expect(screen.getByLabelText('250 Token')).toBeVisible();
    const token = screen.getByLabelText('250 Token');
    expect(token.querySelector('.hud-coin-pixel--32bit')).not.toBeNull();
    expect(token.querySelector('svg')).toBeNull();
    expect(mockedUseEconomySummary).toHaveBeenCalledOnce();
    expect(mockedUseBlookInventory).toHaveBeenCalledOnce();
  });

  it('groups the equipped avatar and profile nickname in the visible student HUD identity', () => {
    renderStudentShell();

    const identity = screen.getByRole('group', { name: '學生身分' });
    expect(identity.querySelector('.hud-avatar')).not.toBeNull();
    expect(within(identity).getByText('student.one')).toBeVisible();
    expect(within(identity).getByText('Lv.2')).toBeVisible();
  });

  it('uses the learning-map scene only for the exact /app route, including query strings', () => {
    renderShellRoute('/app?chapter=21000000-0000-0000-0000-000000000002');

    const main = screen.getByRole('main');
    const stage = main.closest('.game-stage');
    expect(stage).toHaveAttribute('data-shell-role', 'student');
    expect(main).toHaveAttribute('data-world-scene', 'learning-map');
    expect(screen.getByRole('banner')).toContainElement(
      document.querySelector('.economy-summary'),
    );
    expect(document.querySelector('.economy-summary')).not.toHaveClass(
      'economy-summary--learning-map',
    );
    expect(mockedUseEconomySummary).toHaveBeenCalledOnce();
    expect(mockedUseBlookInventory).toHaveBeenCalledOnce();
  });

  it('does not use the learning-map HUD for child student routes', () => {
    renderShellRoute('/app/shop');

    const main = screen.getByRole('main');
    const stage = main.closest('.game-stage');
    expect(stage).not.toHaveClass('game-stage--learning-map');
    expect(stage).toHaveAttribute('data-shell-role', 'student');
    expect(main).toHaveAttribute('data-world-scene', 'student-route');
    expect(document.querySelector('.economy-summary--learning-map')).toBeNull();
    const backButton = screen.getByRole('button', { name: '返回前一頁' });
    expect(screen.getByRole('banner')).not.toContainElement(backButton);
    expect(main).toContainElement(backButton);
  });

  it('marks the learning map as a scene without switching to a route-specific HUD geometry', () => {
    renderShellRoute('/app');

    const main = screen.getByRole('main');
    const stage = main.closest('.game-stage');
    expect(stage).toHaveAttribute('data-shell-role', 'student');
    expect(stage).not.toHaveClass('game-stage--learning-map');
    expect(main).toHaveAttribute('data-world-scene', 'learning-map');
    expect(document.querySelector('.economy-summary')).not.toHaveClass(
      'economy-summary--learning-map',
    );
  });

  it('shows recoverable profile resolution states and mounts the route subtree once', async () => {
    let profileState: 'error' | 'pending' | 'resolved' = 'pending';
    const mounted = vi.fn();
    const unmounted = vi.fn();
    const refetchProfile = vi.fn();

    mockedUseMyProfile.mockImplementation(() =>
      profileState === 'resolved'
        ? {
            data: {
              displayName: 'student.one',
              id: 'student-one-id',
              role: 'student',
              timezone: 'Asia/Taipei',
              reducedMotion: false,
              registrationComplete: true,
            },
            error: null,
            isError: false,
            isPending: false,
            refetch: refetchProfile,
          }
        : {
            data: undefined,
            error:
              profileState === 'error'
                ? new ProfileRepositoryError('PROFILE_UNAVAILABLE')
                : null,
            isError: profileState === 'error',
            isPending: profileState === 'pending',
            refetch: refetchProfile,
          },
    );

    function RemountSentinel() {
      useEffect(() => {
        mounted();
        return () => {
          unmounted();
        };
      }, []);
      return <p>受保護路由內容</p>;
    }

    function ProfileResolutionHarness() {
      const [, setRevision] = useState(0);
      return (
        <ToastProvider>
          <button
            onClick={() => {
              profileState = 'error';
              setRevision(1);
            }}
            type="button"
          >
            模擬權限錯誤
          </button>
          <button
            onClick={() => {
              profileState = 'resolved';
              setRevision(2);
            }}
            type="button"
          >
            完成權限解析
          </button>
          <AppShell />
        </ToastProvider>
      );
    }

    const router = createMemoryRouter(
      [
        {
          children: [{ element: <RemountSentinel />, index: true }],
          element: <ProfileResolutionHarness />,
          path: '/app',
        },
      ],
      { initialEntries: ['/app'] },
    );
    render(<RouterProvider router={router} />);

    const main = screen.getByRole('main');
    expect(
      within(main).getByRole('status', { name: '頁面載入中' }),
    ).toBeVisible();
    expect(screen.queryByText('受保護路由內容')).toBeNull();
    expect(mounted).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: '模擬權限錯誤' }));
    expect(within(main).getByRole('alert')).toHaveTextContent(
      '個人資料載入失敗，請稍後重試。',
    );
    await userEvent.click(
      within(main).getByRole('button', { name: '重新載入' }),
    );
    expect(refetchProfile).toHaveBeenCalledOnce();
    expect(screen.queryByText('受保護路由內容')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: '完成權限解析' }));

    expect(screen.getByText('受保護路由內容')).toBeVisible();
    expect(mounted).toHaveBeenCalledTimes(1);
    expect(unmounted).not.toHaveBeenCalled();
  });

  it('uses non-blocking map copy only on exact /app and dismissal preserves map controls', async () => {
    vi.mocked(window.matchMedia).mockReturnValue({
      addEventListener: vi.fn(),
      matches: true,
      media: '(orientation: portrait)',
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList);
    renderShellRoute('/app');

    expect(screen.getByRole('status')).toHaveTextContent(
      '轉橫可看完整森林王國村',
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: '關閉轉向提示' }));
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('button', { name: '地圖操作' })).toBeVisible();
  });

  it('keeps default rotate copy on student child routes', () => {
    vi.mocked(window.matchMedia).mockReturnValue({
      addEventListener: vi.fn(),
      matches: true,
      media: '(orientation: portrait)',
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList);
    renderShellRoute('/app/shop');

    expect(screen.getByRole('status')).toHaveTextContent('轉橫體驗更佳');
  });

  it('does not insert a rotate banner into public and auth scenes', () => {
    vi.mocked(window.matchMedia).mockReturnValue({
      addEventListener: vi.fn(),
      matches: true,
      media: '(orientation: portrait)',
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList);
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
    const router = createMemoryRouter(
      [
        {
          children: [{ element: <div>登入內容</div>, index: true }],
          element: (
            <ToastProvider>
              <AppShell />
            </ToastProvider>
          ),
          path: '/login',
        },
      ],
      { initialEntries: ['/login'] },
    );
    render(<RouterProvider router={router} />);

    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('button', { name: '關閉轉向提示' })).toBeNull();
  });

  it('keeps one fixed student HUD geometry across route scenes', () => {
    expect(globalStyles).toMatch(
      /\.hud-top--student\s*\{[^}]*min-height:\s*var\(--journey-student-hud-height\);/u,
    );
    expect(globalStyles).not.toMatch(/\.game-stage--learning-map/u);
  });

  it('uses the Traditional Chinese pixel face for student page titles only', () => {
    expect(globalStyles).toMatch(
      /\.game-stage\[data-shell-role='student'\][\s\S]*?#main-content\.route-world-stage[\s\S]*?h1\s*\{[^}]*font-family:\s*var\(--font-pixel-tc\);[^}]*font-synthesis:\s*none;[^}]*font-weight:\s*400;/u,
    );
    expect(globalStyles).not.toMatch(
      /data-shell-role='teacher'[^}]*font-family:\s*var\(--font-pixel-tc\)/u,
    );
    expect(globalStyles).not.toMatch(
      /data-shell-role='public'[^}]*font-family:\s*var\(--font-pixel-tc\)/u,
    );
  });

  it.each([
    ['little_fox', '小狐狸', '🦊'],
    ['indigo_dragon', '東方靛龍', '🐲'],
  ] as const)(
    'centers the 3:2 %s art through the shared student HUD container',
    (stableCode, name, emoji) => {
      mockedUseBlookInventory.mockReturnValue(
        inventoryResult({
          data: {
            activeBlookId: `${stableCode}-id`,
            items: [
              {
                costTokens: 0,
                emoji,
                equipped: true,
                id: `${stableCode}-id`,
                name,
                owned: true,
                stableCode,
              },
            ],
            tokenBalance: 250,
          },
          isError: false,
          isPending: false,
        }),
      );

      renderShellRoute('/app');

      const image = document.querySelector<HTMLImageElement>(
        '.hud-avatar .blook-art',
      );
      expect(image).toHaveAttribute('src', `/assets/blooks/${stableCode}.png`);
      expect(image?.parentElement).toHaveClass('hud-avatar__portrait');
      expect(image?.parentElement?.parentElement).toHaveClass('hud-avatar');
      expect(globalStyles).toMatch(
        /\.hud-avatar \.blook-art\s*\{[^}]*max-width:\s*100%;[^}]*height:\s*auto;/u,
      );
    },
  );

  it('學生頂部顯示頭像框與經濟群組', async () => {
    renderStudentShell();

    expect(await screen.findByText(/Lv\.\d+/u)).toBeInTheDocument();
    expect(document.querySelector('.hud-economy-group')).not.toBeNull();
    const avatar = document.querySelector('.hud-avatar');
    expect(avatar).not.toBeNull();
    const avatarImage = avatar?.querySelector('img');
    expect(avatarImage).toHaveAttribute('width', '47');
    expect(avatarImage).toHaveAttribute('height', '47');
  });

  it('applies the equipped frame snapshot to the student HUD avatar', () => {
    mockedUseFrameInventory.mockReturnValue(
      frameInventoryResult({
        data: {
          activeFrameId: 'deep-neon-id',
          items: [
            {
              costTokens: 25,
              equipped: true,
              gradientEnd: '#0ea5e9',
              gradientStart: '#6366f1',
              id: 'deep-neon-id',
              name: '深海霓虹',
              owned: true,
              stableCode: 'deep_neon',
            },
          ],
          tokenBalance: 225,
        },
        isError: false,
        isPending: false,
      }),
    );

    renderShellRoute('/app/shop');

    const avatar = document.querySelector('.hud-avatar');
    expect(avatar).toHaveAttribute('data-framed', 'true');
    expect(avatar).toHaveStyle({
      '--hud-frame-end': '#0ea5e9',
      '--hud-frame-start': '#6366f1',
    });
  });

  it('教師 route 不渲染舊歡迎列或學生經濟數字', () => {
    renderTeacherShell();

    expect(screen.queryByText(/歡迎，.+・教師端/u)).toBeNull();
    expect(screen.queryByText(/Lv\.\d+/u)).toBeNull();
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
    expect(screen.getByRole('status')).toHaveTextContent('經濟資料載入中…');

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

  it('leaves teacher navigation ownership to the teacher page', () => {
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
        registrationComplete: true,
      },
      error: null,
      isError: false,
      isPending: false,
      refetch: vi.fn(),
    });

    renderTeacherShell();

    expect(screen.getByText('教師頁內容')).toBeVisible();
    expect(screen.queryByRole('link', { name: '教師工作區' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'MENU' })).toBeNull();
    expect(screen.queryByText('歡迎，teacher・教師端')).toBeNull();
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

    // 依 owner 核准 HUD，學生列固定三個正式 route；其他入口留在 MENU。
    // 覆蓋交給 hud-command-bar.test.tsx 的面板迴圈測試承接，此處不重複維護
    // 同一份標籤清單。
    const nav = screen.getByRole('navigation', { name: '主要導覽' });
    const linkNames = within(nav)
      .getAllByRole('link')
      .map((link) => link.textContent);
    expect(linkNames).toEqual(['學習大廳', 'Live 課堂', '商店']);
    expect(screen.queryByRole('link', { name: '學習進度' })).toBeNull();

    // 已停用的課後任務不再提供入口；我的錯題仍在 MENU，商店不重複出現。
    await userEvent.click(screen.getByRole('button', { name: 'MENU' }));
    expect(screen.queryByRole('link', { name: '課後任務實戰' })).toBeNull();
    expect(screen.getAllByRole('link', { name: '商店' })).toHaveLength(1);
    expect(screen.getByRole('link', { name: '我的錯題' })).toHaveAttribute(
      'href',
      '/app/mistakes',
    );
  });

  it('does not recreate the retired teacher indigo rail', () => {
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
        registrationComplete: true,
      },
      error: null,
      isError: false,
      isPending: false,
      refetch: vi.fn(),
    });

    renderTeacherShell();

    expect(screen.queryByRole('link', { name: '題庫管理' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Live 主持' })).toBeNull();
    expect(screen.queryByRole('link', { name: '教師工作區' })).toBeNull();
    expect(screen.queryByText('教師管理權限已授權')).toBeNull();
    expect(screen.queryByRole('link', { name: '學習大廳' })).toBeNull();
    expect(screen.queryByRole('link', { name: '裝備商店' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'MENU' })).toBeNull();
  });

  it('confirms before signOut and replaces protected history with login', async () => {
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

    expect(signOut).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: '確認登出' })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(screen.queryByRole('dialog', { name: '確認登出' })).toBeNull();
    expect(signOut).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'MENU' }));
    await userEvent.click(screen.getByRole('button', { name: '登出' }));
    await userEvent.click(screen.getByRole('button', { name: '確認登出' }));
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
    await userEvent.click(screen.getByRole('button', { name: '確認登出' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '登出失敗，請稍後重試。',
    );
    await userEvent.click(screen.getByRole('button', { name: 'MENU' }));
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
    await userEvent.click(screen.getByRole('button', { name: '確認登出' }));
    await userEvent.click(
      await screen.findByRole('button', { name: '以 B 登入' }),
    );

    // 帳號 B 的 mock profile 仍是帳號 A 的資料（id 不吻合 session.userId），
    // 故落入 isAuthenticatedProfile=false 的 fallback 登出鈕（Step 4.4），
    // 不經過 HUD MENU。
    const accountBLogout = await screen.findByRole('button', { name: '登出' });
    expect(accountBLogout).toBeEnabled();
    await userEvent.click(accountBLogout);
    await userEvent.click(screen.getByRole('button', { name: '確認登出' }));

    expect(signOut).toHaveBeenCalledTimes(2);
    expect(
      await screen.findByRole('button', { name: '以 B 登入' }),
    ).toBeVisible();
  });
});
