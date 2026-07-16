import { render, screen } from '@testing-library/react';
import { RouterProvider } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { AuthRepository, AuthSession } from '../../features/auth/types';
import { usePublishedChapters } from '../../features/learning/api/chapters';
import { useMyProfile } from '../../features/profile/hooks/use-my-profile';
import { AppProviders } from '../providers/app-providers';
import { createAppRouter } from './create-app-router';

vi.mock('../../features/profile/hooks/use-my-profile', () => ({
  useMyProfile: vi.fn(() => ({
    data: {
      displayName: 'student.one',
      id: 'learner-id',
      role: 'student',
      timezone: 'Asia/Taipei',
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
  usePurchaseBlook: vi.fn(() => ({ isPending: false, mutateAsync: vi.fn() })),
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

const mockedUseMyProfile = vi.mocked(useMyProfile);
const mockedUsePublishedChapters = vi.mocked(usePublishedChapters);

const createRepository = (session: AuthSession | null): AuthRepository => ({
  getSession: vi.fn(() => Promise.resolve(session)),
  onAuthStateChange: vi.fn(() => vi.fn()),
  signIn: vi.fn(),
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
  it.each([
    ['/', 'ColorPlay', '前往登入'],
    ['/unauthorized', '沒有權限', '返回登入'],
    ['/missing-route', '找不到頁面', '返回首頁'],
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
    expect(screen.getByLabelText('Email')).toHaveAttribute('type', 'email');
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

  it('renders the Blook shop deep-link for an authenticated student', async () => {
    renderRouter('/app/shop', {
      email: 'learner@colorplay.invalid',
      userId: 'learner-id',
    });

    expect(
      await screen.findByRole('heading', { name: 'Blook 商店' }),
    ).toBeVisible();
  });

  it('renders the lazy achievement route only for an authenticated student', async () => {
    renderRouter('/app/achievements', {
      email: 'learner@colorplay.invalid',
      userId: 'learner-id',
    });

    expect(
      await screen.findByRole('heading', { name: '成就徽章' }),
    ).toBeVisible();
  });

  it('renders the published chapter home at /app for an authenticated session', async () => {
    mockedUsePublishedChapters.mockReturnValue({
      data: [
        {
          description: '使用色彩模型描述顏色。',
          id: '21000000-0000-0000-0000-000000000003',
          isPlayable: true,
          sortOrder: 3,
          stableCode: 'chapter-3',
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
      await screen.findByRole('heading', { name: '選擇章節' }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: '開始挑戰' })).toBeVisible();
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
      await screen.findByRole('heading', { name: '教師工作區' }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: '教師工作區' })).toHaveAttribute(
      'href',
      '/teacher',
    );
  });
});
