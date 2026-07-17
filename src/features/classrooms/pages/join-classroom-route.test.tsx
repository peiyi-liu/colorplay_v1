import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

import type { ClassroomRepository } from '../types';
import { JoinClassroomRoute } from './join-classroom-route';

it('requires confirmation then replace-navigates without the code in the URL', async () => {
  const joinClassroom = vi.fn().mockResolvedValue({
    classroomId: 'ca000000-0000-4000-8000-000000000001',
    classroomName: '色彩一班',
    joinedAt: '2026-07-17T01:00:00.000Z',
    membershipStatus: 'active',
  });
  const repository: ClassroomRepository = {
    createClassroom: vi.fn(),
    getOwnedMembers: vi.fn(),
    joinClassroom,
    listMine: vi.fn(),
    listOwned: vi.fn(),
    rotateJoinCode: vi.fn(),
  };
  const router = createMemoryRouter(
    [
      {
        element: <JoinClassroomRoute repository={repository} />,
        path: '/join/:joinCode',
      },
      { element: <h1>班級排行榜</h1>, path: '/app/leaderboard/:classroomId' },
    ],
    { initialEntries: ['/join/ABCD-1234-EF56-7890'] },
  );
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  expect(screen.getByRole('textbox', { name: '班級加入碼' })).toHaveValue(
    'ABCD-1234-EF56-7890',
  );
  expect(joinClassroom).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: '加入班級' }));
  expect(
    await screen.findByRole('heading', { name: '班級排行榜' }),
  ).toBeVisible();
  expect(router.state.location.pathname).toBe(
    '/app/leaderboard/ca000000-0000-4000-8000-000000000001',
  );
  expect(router.state.historyAction).toBe('REPLACE');
  expect(router.state.location.pathname).not.toContain('ABCD');
});
