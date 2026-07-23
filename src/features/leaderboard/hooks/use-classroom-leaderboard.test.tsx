import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  type ClassroomLeaderboard,
  type LeaderboardRepository,
  LeaderboardRepositoryError,
} from '../types';
import {
  leaderboardKeys,
  useClassroomLeaderboard,
} from './use-classroom-leaderboard';

const firstId = 'ca000000-0000-4000-8000-000000000001';
const secondId = 'ca000000-0000-4000-8000-000000000002';
const board = (classroomId: string): ClassroomLeaderboard => ({
  classroomId,
  classroomName: `Class ${classroomId.at(-1) ?? ''}`,
  generatedAt: '2026-07-17T02:00:00.000Z',
  memberCount: 12,
  selfEntry: null,
  topEntries: [],
});
const createClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } });
const wrapper = (client: QueryClient) =>
  function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };

describe('useClassroomLeaderboard', () => {
  it('uses a class-scoped key and exposes loading then server data', async () => {
    const getClassroomLeaderboard = vi.fn().mockResolvedValue(board(firstId));
    const repository: LeaderboardRepository = { getClassroomLeaderboard };
    const queryClient = createClient();
    const { result } = renderHook(
      () => useClassroomLeaderboard(firstId, repository),
      { wrapper: wrapper(queryClient) },
    );
    expect(leaderboardKeys.classroom(firstId)).toEqual([
      'leaderboard',
      'classroom',
      firstId,
    ]);
    expect(result.current.isPending).toBe(true);
    await waitFor(() => {
      expect(result.current.data).toEqual(board(firstId));
    });
  });

  it('does not query an invalid UUID', () => {
    const getClassroomLeaderboard = vi.fn();
    const repository: LeaderboardRepository = { getClassroomLeaderboard };
    const queryClient = createClient();
    const { result } = renderHook(
      () => useClassroomLeaderboard('not-a-uuid', repository),
      { wrapper: wrapper(queryClient) },
    );
    expect(result.current.fetchStatus).toBe('idle');
    expect(getClassroomLeaderboard).not.toHaveBeenCalled();
  });

  it('retains an actionable error in context without retrying forbidden access', async () => {
    const error = new LeaderboardRepositoryError('NOT_AVAILABLE');
    const getClassroomLeaderboard = vi.fn().mockRejectedValue(error);
    const queryClient = createClient();
    const { result } = renderHook(
      () => useClassroomLeaderboard(firstId, { getClassroomLeaderboard }),
      { wrapper: wrapper(queryClient) },
    );
    await waitFor(() => {
      expect(result.current.error).toBe(error);
    });
    expect(getClassroomLeaderboard).toHaveBeenCalledOnce();
  });

  it('does not retain a previous classroom when the ID changes', async () => {
    const getClassroomLeaderboard = vi.fn((id: string) =>
      id === firstId
        ? Promise.resolve(board(firstId))
        : new Promise<ClassroomLeaderboard>(() => undefined),
    );
    const queryClient = createClient();
    const { result, rerender } = renderHook(
      ({ id }) => useClassroomLeaderboard(id, { getClassroomLeaderboard }),
      { initialProps: { id: firstId }, wrapper: wrapper(queryClient) },
    );
    await waitFor(() => {
      expect(result.current.data).toEqual(board(firstId));
    });
    rerender({ id: secondId });
    expect(result.current.data).toBeUndefined();
    expect(result.current.isPending).toBe(true);
  });
});
