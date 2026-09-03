import { render, screen } from '@testing-library/react';
import { isValidElement } from 'react';
import { RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthRepository, AuthSession } from '../../features/auth/types';
import { usePublishedChapters } from '../../features/learning/api/chapters';
import { useMyProfile } from '../../features/profile/hooks/use-my-profile';
import { AppProviders } from '../providers/app-providers';
import { AdminShell } from '../../features/admin/components/admin-shell';
import { RequireAdminIdentity } from '../../features/admin/components/require-admin-identity';
import { RequirePrivilegedSession } from '../../features/admin/components/require-privileged-session';
import { createAppRouter } from './create-app-router';

vi.mock('../../features/profile/hooks/use-my-profile', () => ({
  useMyProfile: vi.fn(() => ({
    data: {
      displayName: 'student.one',
      id: 'learner-id',
      role: 'student',
      timezone: 'Asia/Taipei',
      reducedMotion: false,
      registrationComplete: true,
    },
    error: null,
    isError: false,
    isPending: false,
    refetch: vi.fn(),
  })),
}));
vi.mock('../../features/learning/api/chapters', () => ({
  usePublishedChapters: vi.fn(() => ({
    data: [],
    error: null,
    isError: false,
    isPending: false,
    refetch: vi.fn(),
  })),
}));
vi.mock('../../features/learning/hooks/use-chapter-map', () => ({
  useStudentChapterMap: vi.fn(() => ({
    data: {
      chapters: [
        '認識色彩',
        '色彩呈現',
        '色彩表示',
        '色彩感知',
        '色彩認知',
        '色彩應用',
      ].map((title, index) => ({
        accessState: index === 2 ? 'available' : 'content_unavailable',
        blockers: [],
        chapterId: `21000000-0000-0000-0000-${String(index + 1).padStart(12, '0')}`,
        description: `第 ${String(index + 1)} 章說明`,
        mastery: null,
        progressStatus: 'not_started',
        reviewCompleted: 0,
        reviewTotal: index === 2 ? 5 : null,
        sortOrder: index + 1,
        stableCode: `chapter-${String(index + 1)}`,
        templateId: index === 2 ? '26000000-0000-0000-0000-000000000003' : null,
        templateQuestionCount: index === 2 ? 10 : null,
        title,
      })),
      mode: 'open',
      rulesVersion: '2026-08-sequence-1',
    },
    error: null,
    isError: false,
    isPending: false,
    refetch: vi.fn(),
  })),
}));
vi.mock('../../features/rewards/hooks/use-economy-summary', () => ({
  useEconomySummary: vi.fn(() => ({
    data: {
      currentLevelXp: 0,
      level: 1,
      tokenBalance: 0,
      totalXp: 0,
      walletReconciled: true,
      xpPerLevel: 500,
    },
    isError: false,
    isPending: false,
  })),
}));
vi.mock('../../features/inventory/hooks/use-blook-inventory', () => ({
  useBlookInventory: vi.fn(() => ({
    data: {
      activeBlookId: '50000000-0000-0000-0000-000000000001',
      items: [
        {
          costTokens: 0,
          emoji: '🦊',
          equipped: true,
          id: '50000000-0000-0000-0000-000000000001',
          name: '小狐狸',
          owned: true,
          stableCode: 'little_fox',
        },
      ],
      tokenBalance: 0,
    },
    isError: false,
    isPending: false,
  })),
  useEquipBlook: vi.fn(() => ({ isPending: false, mutateAsync: vi.fn() })),
  useEquipFrame: vi.fn(() => ({ isPending: false, mutateAsync: vi.fn() })),
  useFrameInventory: vi.fn(() => ({
    data: undefined,
    isError: false,
    isPending: true,
  })),
  usePurchaseBlook: vi.fn(() => ({ isPending: false, mutateAsync: vi.fn() })),
  usePurchaseFrame: vi.fn(() => ({ isPending: false, mutateAsync: vi.fn() })),
}));
vi.mock('../../features/achievements/hooks/use-achievements', () => ({
  useAchievements: vi.fn(() => ({
    data: {
      items: [
        {
          badgeKey: 'first_task_complete',
          description: '完成第一次正式挑戰',
          displayName: '初出茅廬',
          progress: 0,
          stableCode: 'first_task_complete',
          state: 'not_started',
          target: 1,
          unlockedAt: null,
        },
      ],
      totalCount: 1,
      unlockedCount: 0,
    },
    isError: false,
    isPending: false,
    refetch: vi.fn(),
  })),
}));
vi.mock('../../features/leaderboard/hooks/use-classroom-leaderboard', () => ({
  useClassroomLeaderboard: vi.fn(() => ({
    data: {
      classroomId: 'ca000000-0000-4000-8000-000000000001',
      classroomName: '色彩一班',
      generatedAt: '2026-07-17T02:00:00.000Z',
      selfEntry: null,
      topEntries: [],
    },
    error: null,
    isError: false,
    isPending: false,
    refetch: vi.fn(),
  })),
}));
vi.mock('../../features/classrooms/hooks/use-classrooms', () => ({
  useCreateClassroom: vi.fn(() => ({
    error: null,
    isPending: false,
    mutateAsync: vi.fn(),
  })),
  useJoinClassroom: vi.fn(() => ({
    error: null,
    isPending: false,
    mutateAsync: vi.fn(),
  })),
  useMyClassrooms: vi.fn(() => ({
    data: [],
    error: null,
    isError: false,
    isPending: false,
    refetch: vi.fn(),
  })),
  useOwnedClassroomMembers: vi.fn(() => ({
    data: [],
    error: null,
    isError: false,
    isPending: false,
    refetch: vi.fn(),
  })),
  useOwnedClassrooms: vi.fn(() => ({
    data: [],
    error: null,
    isError: false,
    isPending: false,
    refetch: vi.fn(),
  })),
  useRotateClassroomJoinCode: vi.fn(() => ({
    error: null,
    isPending: false,
    mutateAsync: vi.fn(),
  })),
}));

const mockedUseMyProfile = vi.mocked(useMyProfile);
const mockedUsePublishedChapters = vi.mocked(usePublishedChapters);

const createRepository = (session: AuthSession | null): AuthRepository => ({
  getSession: vi.fn(() => Promise.resolve(session)),
  onAuthStateChange: vi.fn(() => vi.fn()),
  signIn: vi.fn(),
  signInWithAccount: vi.fn(),
  signOut: vi.fn(),
});

const renderRouter = (path: string, session: AuthSession | null = null) => {
  window.history.replaceState({}, '', path);
  const router = createAppRouter();
  render(
    <AppProviders authRepository={createRepository(session)}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return router;
};

describe('createAppRouter', () => {
  beforeEach(() => {
    mockedUseMyProfile.mockReturnValue({
      data: {
        displayName: 'student.one',
        id: 'learner-id',
        reducedMotion: false,
        registrationComplete: true,
        role: 'student',
        timezone: 'Asia/Taipei',
      },
      error: null,
      isError: false,
      isPending: false,
      refetch: vi.fn(),
    });
  });

  it.each(['/admin/teachers', '/admin/teachers/:teacherId'])(
    'keeps %s below all existing Admin guards',
    (path) => {
      interface RouteNode {
        children?: RouteNode[];
        element?: unknown;
        path?: string;
      }
      const findAncestors = (
        routes: readonly RouteNode[],
        ancestors: readonly RouteNode[] = [],
      ): readonly RouteNode[] | null => {
        for (const route of routes) {
          if (route.path === path) return ancestors;
          const found = route.children
            ? findAncestors(route.children, [...ancestors, route])
            : null;
          if (found) return found;
        }
        return null;
      };
      const router = createAppRouter();
      const ancestors = findAncestors(router.routes as RouteNode[]);
      expect(ancestors).not.toBeNull();
      const elementTypes = ancestors?.flatMap((route) =>
        isValidElement(route.element) ? [route.element.type] : [],
      );
      expect(elementTypes).toContain(RequireAdminIdentity);
      expect(elementTypes).toContain(RequirePrivilegedSession);
      expect(elementTypes).toContain(AdminShell);
    },
  );

  it.each([
    ['/', 'ColorPlay', '開始冒險'],
    ['/unauthorized', '沒有權限', '返回登入'],
    ['/missing-route', '找不到頁面', '返回首頁'],
    // 學習進度依 owner 批示（2026-07-26 #2）改為教師專屬；學生端
    // `/app/progress` 路由已移除，應落在全站 404（教師端兩個進度頁不受影響）。
    ['/app/progress', '找不到頁面', '返回首頁'],
  ])('renders %s with one primary CTA', async (path, heading, actionLabel) => {
    renderRouter(path);
    expect(await screen.findByRole('heading', { name: heading })).toBeVisible();
    expect(screen.getByRole('link', { name: actionLabel })).toHaveAttribute(
      'data-acceptance-target',
    );
    expect(
      document.querySelectorAll('[data-primary-action="true"]'),
    ).toHaveLength(1);
  });

  it('renders the accessible login form with one primary submit action', async () => {
    renderRouter('/login');

    expect(await screen.findByRole('heading', { name: '登入' })).toBeVisible();
    expect(screen.getByLabelText('帳號')).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('密碼')).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: '登入' })).toHaveAttribute(
      'type',
      'submit',
    );
    expect(
      document.querySelectorAll('[data-primary-action="true"]'),
    ).toHaveLength(1);
  });

  it('redirects anonymous /app access while retaining the full intended URL', async () => {
    const router = renderRouter('/app?chapter=color-theory#checkpoint');

    expect(await screen.findByRole('heading', { name: '登入' })).toBeVisible();
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.state).toEqual({
      from: {
        hash: '#checkpoint',
        pathname: '/app',
        search: '?chapter=color-theory',
      },
    });
    expect(screen.queryByRole('heading', { name: '學習大廳' })).toBeNull();
  });

  it('redirects an anonymous shop deep-link to login', async () => {
    const router = renderRouter('/app/shop?from=profile');

    expect(await screen.findByRole('heading', { name: '登入' })).toBeVisible();
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.state).toEqual({
      from: {
        hash: '',
        pathname: '/app/shop',
        search: '?from=profile',
      },
    });
  });

  it('protects invitation acceptance with authentication while preserving the return route', async () => {
    const router = renderRouter('/admin/invitations/accept');

    expect(await screen.findByRole('heading', { name: '登入' })).toBeVisible();
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.state).toEqual({
      from: {
        hash: '',
        pathname: '/admin/invitations/accept',
        search: '',
      },
    });
  });

  it('lets an authenticated incomplete non-admin reach invitation acceptance before privilege exists', async () => {
    mockedUseMyProfile.mockReturnValue({
      data: {
        displayName: '待接受邀請',
        id: 'invitee-id',
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

    renderRouter('/admin/invitations/accept', {
      email: 'invitee@colorplay.invalid',
      userId: 'invitee-id',
    });

    expect(
      await screen.findByRole('heading', { name: '接受管理員邀請' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('heading', { name: '註冊帳號' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('沒有權限')).not.toBeInTheDocument();
  });

  it('keeps an OTP-authenticated student on registration until the server profile is complete', async () => {
    mockedUseMyProfile.mockReturnValue({
      data: {
        displayName: '待完成註冊',
        id: 'learner-id',
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

    const router = renderRouter('/register', {
      email: 'learner@colorplay.invalid',
      userId: 'learner-id',
    });

    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(screen.getByRole('heading', { name: '註冊帳號' })).toBeVisible();
    expect(router.state.location.pathname).toBe('/register');
    expect(document.querySelector('.student-hud')).toBeNull();
  });

  it('does not unmount the registration form while the OTP session profile is resolving', async () => {
    mockedUseMyProfile.mockReturnValue({
      data: undefined,
      error: null,
      isError: false,
      isPending: true,
      refetch: vi.fn(),
    });

    const router = renderRouter('/register', {
      email: 'learner@colorplay.invalid',
      userId: 'learner-id',
    });

    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(screen.getByRole('heading', { name: '註冊帳號' })).toBeVisible();
    expect(router.state.location.pathname).toBe('/register');
  });

  it('redirects an incomplete OTP-authenticated student away from protected app routes', async () => {
    mockedUseMyProfile.mockReturnValue({
      data: {
        displayName: '待完成註冊',
        id: 'learner-id',
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

    const router = renderRouter('/app', {
      email: 'learner@colorplay.invalid',
      userId: 'learner-id',
    });

    expect(
      await screen.findByRole('heading', { name: '註冊帳號' }),
    ).toBeVisible();
    expect(router.state.location.pathname).toBe('/register');
  });

  // owner 0730 #14：加入班級頁停做，邀請連結一律落在全站 404。
  it('sends the removed join route to the site-wide 404', async () => {
    renderRouter('/join/ABCD-1234-EF56-7890');
    expect(
      await screen.findByRole('heading', { name: '找不到頁面' }),
    ).toBeVisible();
  });

  // UAT 0727 R2 #1：導覽點擊直達自己班級的排行榜，不再經班級清單。
  it('renders the direct classroom leaderboard route', async () => {
    renderRouter('/app/leaderboard', {
      email: 'learner@colorplay.invalid',
      userId: 'learner-id',
    });
    expect(
      await screen.findByRole('heading', { name: '班級排行榜' }),
    ).toBeVisible();
  });

  it('renders the classroom-scoped leaderboard route', async () => {
    renderRouter('/app/leaderboard/ca000000-0000-4000-8000-000000000001', {
      email: 'learner@colorplay.invalid',
      userId: 'learner-id',
    });
    expect(
      await screen.findByRole('heading', { name: '排行榜' }),
    ).toBeVisible();
  });

  it('renders the Blook shop deep-link for an authenticated student', async () => {
    renderRouter('/app/shop', {
      email: 'learner@colorplay.invalid',
      userId: 'learner-id',
    });

    expect(
      await screen.findByRole('heading', { name: '裝備商店' }),
    ).toBeVisible();
  });

  it('renders the lazy achievement route only for an authenticated student', async () => {
    renderRouter('/app/achievements', {
      email: 'learner@colorplay.invalid',
      userId: 'learner-id',
    });

    expect(
      await screen.findByRole('heading', { name: /個人成就與徽章/u }),
    ).toBeVisible();
  });

  it('renders the six-chapter learning map at /app for an authenticated session', async () => {
    mockedUsePublishedChapters.mockReturnValue({
      data: [
        {
          description: '使用色彩模型描述顏色。',
          id: '21000000-0000-0000-0000-000000000003',
          isPlayable: true,
          sortOrder: 3,
          stableCode: 'chapter-3',
          subtopicCodes: ['3-1'],
          subtopicTitles: ['3-1 色彩三要素與色名的表示'],
          template: {
            id: '26000000-0000-0000-0000-000000000003',
            questionCount: 10,
            title: '第三章綜合挑戰',
          },
          title: '色彩表示',
        },
      ],
      error: null,
      isError: false,
      isPending: false,
      refetch: vi.fn(),
    });
    renderRouter('/app', {
      email: 'learner@colorplay.invalid',
      userId: 'learner-id',
    });

    expect(
      await screen.findByRole('heading', { name: '學習地圖' }),
    ).toBeVisible();
    expect(screen.getByRole('list', { name: '六章學習地圖' })).toBeVisible();
    expect(screen.getAllByRole('button', { name: /^Chapter /u })).toHaveLength(
      6,
    );
    expect(document.body).not.toHaveTextContent('learner@colorplay.invalid');
  });

  it('routes an authoritative student away from /teacher', async () => {
    const router = renderRouter('/teacher', {
      email: 'learner@colorplay.invalid',
      userId: 'learner-id',
    });

    expect(
      await screen.findByRole('heading', { name: '沒有權限' }),
    ).toBeVisible();
    expect(router.state.location.pathname).toBe('/unauthorized');
    expect(screen.queryByRole('link', { name: '教師工作區' })).toBeNull();
  });

  it('renders /teacher for an authoritative teacher profile', async () => {
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

    renderRouter('/teacher', {
      email: 'teacher@colorplay.invalid',
      userId: 'teacher-id',
    });

    expect(
      await screen.findByRole('heading', { name: '教學分析' }),
    ).toBeVisible();
    const teacherNavigation = screen.getByRole('navigation', {
      name: '教師導覽',
    });
    expect(teacherNavigation.querySelectorAll('a')).toHaveLength(3);
    expect(screen.getByRole('link', { name: '教學分析' })).toHaveAttribute(
      'href',
      '/teacher',
    );
    expect(screen.queryByRole('navigation', { name: '主要導覽' })).toBeNull();
    expect(screen.queryByRole('link', { name: '教師工作區' })).toBeNull();
    expect(document.querySelector('.hud-command')).toBeNull();
    expect(document.querySelector('.hud-top')).toBeNull();
  });

  it('keeps a student out of the teacher classes route', async () => {
    mockedUseMyProfile.mockReturnValue({
      data: {
        displayName: 'student.one',
        id: 'learner-id',
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
    const router = renderRouter('/teacher/classes', {
      email: 'learner@colorplay.invalid',
      userId: 'learner-id',
    });
    expect(
      await screen.findByRole('heading', { name: '沒有權限' }),
    ).toBeVisible();
    expect(router.state.location.pathname).toBe('/unauthorized');
  });

  // owner 0730 #14：班級作業停做，原教師作業路由一律落在全站 404。
  it('sends the removed teacher assignments route to the site-wide 404', async () => {
    mockedUseMyProfile.mockReturnValue({
      data: {
        displayName: 'student.one',
        id: 'learner-id',
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
    renderRouter(
      '/teacher/classes/14100000-0000-0000-0000-000000000001/assignments',
      {
        email: 'learner@colorplay.invalid',
        userId: 'learner-id',
      },
    );
    expect(
      await screen.findByRole('heading', { name: '找不到頁面' }),
    ).toBeVisible();
  });

  it('lazy-loads the classes route for an authoritative teacher', async () => {
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
    renderRouter('/teacher/classes', {
      email: 'teacher@colorplay.invalid',
      userId: 'teacher-id',
    });
    expect(
      await screen.findByRole('heading', { name: '班級管理' }),
    ).toBeVisible();
  });
});
