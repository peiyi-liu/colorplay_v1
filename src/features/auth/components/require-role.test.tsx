import { render, screen } from '@testing-library/react';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { useMyProfile } from '../../profile/hooks/use-my-profile';
import { RequireRole } from './require-role';

vi.mock('../../profile/hooks/use-my-profile', () => ({
  useMyProfile: vi.fn(),
}));

const mockedUseMyProfile = vi.mocked(useMyProfile);

function Shell() {
  return (
    <main id="main-content">
      <Outlet />
    </main>
  );
}

const renderGuard = () => {
  const router = createMemoryRouter(
    [
      {
        element: <Shell />,
        children: [
          { element: <h1>沒有權限</h1>, path: '/unauthorized' },
          {
            element: <RequireRole allowed={['teacher']} />,
            children: [{ element: <h1>教師工作區</h1>, path: '/teacher' }],
          },
        ],
      },
    ],
    { initialEntries: ['/teacher'] },
  );

  render(<RouterProvider router={router} />);
  return router;
};

describe('RequireRole', () => {
  it('renders RouteLoading while the authoritative profile is pending', () => {
    mockedUseMyProfile.mockReturnValue({
      data: undefined,
      error: null,
      isError: false,
      isPending: true,
      refetch: vi.fn(),
    });

    renderGuard();

    expect(screen.getByRole('status', { name: '頁面載入中' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: '教師工作區' })).toBeNull();
  });

  it('redirects a student away from a teacher route', async () => {
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

    const router = renderGuard();

    expect(
      await screen.findByRole('heading', { name: '沒有權限' }),
    ).toBeVisible();
    expect(router.state.location.pathname).toBe('/unauthorized');
    expect(router.state.historyAction).toBe('REPLACE');
    expect(screen.queryByRole('heading', { name: '教師工作區' })).toBeNull();
  });

  it('renders the outlet for an authoritative allowed role', async () => {
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

    renderGuard();

    expect(
      await screen.findByRole('heading', { name: '教師工作區' }),
    ).toBeVisible();
  });
});
