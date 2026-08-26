import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  createMemoryRouter,
  Link,
  Outlet,
  RouterProvider,
} from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import {
  StudentBackNavigationProvider,
  useStudentBackOverride,
} from './student-back-navigation';
import { StudentRouteBackButton } from './student-route-back-button';

function StudentRouteLayout() {
  return (
    <StudentBackNavigationProvider>
      <StudentRouteBackButton />
      <Outlet />
    </StudentBackNavigationProvider>
  );
}

function ReaderBackOverride({ onBack }: Readonly<{ onBack: () => void }>) {
  useStudentBackOverride({
    ariaLabel: '返回複習卡選擇',
    onBack,
  });
  return <h1>複習卡閱讀</h1>;
}

const routes = [
  {
    element: <StudentRouteLayout />,
    path: '/app',
    children: [
      { element: <h1>學習大廳</h1>, index: true },
      {
        element: (
          <>
            <h1>章節頁</h1>
            <Link to="/app/shop">前往商店</Link>
          </>
        ),
        path: 'chapters/:chapterId',
      },
      { element: <h1>商店</h1>, path: 'shop' },
    ],
  },
];

describe('StudentRouteBackButton', () => {
  it('does not render in the learning lobby', () => {
    const router = createMemoryRouter(routes, { initialEntries: ['/app'] });
    render(<RouterProvider router={router} />);

    expect(
      screen.queryByRole('button', { name: '返回前一頁' }),
    ).not.toBeInTheDocument();
  });

  it('falls back to the learning lobby without in-app history', async () => {
    const user = userEvent.setup();
    const router = createMemoryRouter(routes, {
      initialEntries: ['/app/shop'],
    });
    render(<RouterProvider router={router} />);

    await user.click(screen.getByRole('button', { name: '返回前一頁' }));

    expect(
      await screen.findByRole('heading', { name: '學習大廳' }),
    ).toBeInTheDocument();
  });

  it('returns to the previous in-app page when one is known', async () => {
    const user = userEvent.setup();
    const router = createMemoryRouter(routes, {
      initialEntries: ['/app/chapters/chapter-1'],
    });
    render(<RouterProvider router={router} />);

    await user.click(screen.getByRole('link', { name: '前往商店' }));
    await screen.findByRole('heading', { name: '商店' });
    await user.click(screen.getByRole('button', { name: '返回前一頁' }));

    expect(
      await screen.findByRole('heading', { name: '章節頁' }),
    ).toBeInTheDocument();
  });

  it('does not mistake a replaced direct route for in-app history', async () => {
    const user = userEvent.setup();
    const router = createMemoryRouter(routes, {
      initialEntries: ['/app/shop'],
    });
    render(<RouterProvider router={router} />);

    await router.navigate('/app/shop?source=redirect', { replace: true });
    await user.click(screen.getByRole('button', { name: '返回前一頁' }));

    expect(
      await screen.findByRole('heading', { name: '學習大廳' }),
    ).toBeInTheDocument();
  });

  it('uses the active page override without rendering a second back button', async () => {
    const onBack = vi.fn();
    const user = userEvent.setup();
    const overrideRoutes = [
      {
        element: <StudentRouteLayout />,
        path: '/app',
        children: [
          {
            element: <ReaderBackOverride onBack={onBack} />,
            path: 'chapters/chapter-3',
          },
        ],
      },
    ];
    const router = createMemoryRouter(overrideRoutes, {
      initialEntries: ['/app/chapters/chapter-3'],
    });
    render(<RouterProvider router={router} />);

    const backButtons = await screen.findAllByRole('button', {
      name: '返回複習卡選擇',
    });
    expect(backButtons).toHaveLength(1);
    await user.click(
      screen.getByRole('button', { name: '返回複習卡選擇' }),
    );
    expect(onBack).toHaveBeenCalledOnce();
  });
});
