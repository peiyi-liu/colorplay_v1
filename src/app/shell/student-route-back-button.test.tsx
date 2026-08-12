import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  createMemoryRouter,
  Link,
  Outlet,
  RouterProvider,
} from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { StudentRouteBackButton } from './student-route-back-button';

function StudentRouteLayout() {
  return (
    <>
      <StudentRouteBackButton />
      <Outlet />
    </>
  );
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
});
