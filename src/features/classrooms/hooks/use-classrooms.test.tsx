import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { type ClassroomRepository, ClassroomRepositoryError } from '../types';
import {
  classroomKeys,
  useCreateClassroom,
  useJoinClassroom,
  useMyClassrooms,
} from './use-classrooms';

const classroom = {
  classroomId: 'ca000000-0000-4000-8000-000000000001',
  classroomName: '色彩一班',
  joinedAt: '2026-07-17T01:00:00.000Z',
  membershipStatus: 'active' as const,
};

const repository = (
  overrides: Partial<ClassroomRepository> = {},
): ClassroomRepository => ({
  createClassroom: vi.fn(),
  getOwnedMembers: vi.fn(),
  joinClassroom: vi.fn(),
  listMine: vi.fn().mockResolvedValue([classroom]),
  listOwned: vi.fn().mockResolvedValue([]),
  rotateJoinCode: vi.fn(),
  ...overrides,
});

const client = () =>
  new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
const wrapper = (queryClient: QueryClient) =>
  function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };

describe('classroom hooks', () => {
  it('uses stable scoped keys and exposes pending read state', async () => {
    let resolve: ((value: readonly (typeof classroom)[]) => void) | undefined;
    const listMine = vi
      .fn()
      .mockImplementation(
        () =>
          new Promise<readonly (typeof classroom)[]>(
            (done) => (resolve = done),
          ),
      );
    const queryClient = client();
    const { result } = renderHook(
      () => useMyClassrooms(repository({ listMine })),
      {
        wrapper: wrapper(queryClient),
      },
    );

    expect(classroomKeys.mine).toEqual(['classrooms', 'mine']);
    expect(classroomKeys.owned).toEqual(['classrooms', 'owned']);
    expect(classroomKeys.ownedMembers('id')).toEqual([
      'classrooms',
      'owned',
      'id',
      'members',
    ]);
    expect(result.current.isPending).toBe(true);
    resolve?.([classroom]);
    await waitFor(() => {
      expect(result.current.data).toEqual([classroom]);
    });
  });

  it('keeps a create failure on the mutation and never retries the one-time receipt', async () => {
    const error = new ClassroomRepositoryError('AMBIGUOUS_WRITE');
    const createClassroom = vi.fn().mockRejectedValue(error);
    const queryClient = client();
    const { result } = renderHook(
      () => useCreateClassroom(repository({ createClassroom })),
      { wrapper: wrapper(queryClient) },
    );

    await act(async () => {
      await expect(result.current.mutateAsync({ name: '一班' })).rejects.toBe(
        error,
      );
    });
    await waitFor(() => {
      expect(result.current.error).toBe(error);
    });
    expect(createClassroom).toHaveBeenCalledOnce();
  });

  it('invalidates only owned classrooms after create succeeds', async () => {
    const receipt = {
      classroomId: classroom.classroomId,
      classroomName: classroom.classroomName,
      joinCode: 'ABCD-1234-EF56-7890',
      joinCodeVersion: 1,
    };
    const createClassroom = vi.fn().mockResolvedValue(receipt);
    const queryClient = client();
    const invalidate = vi
      .spyOn(queryClient, 'invalidateQueries')
      .mockResolvedValue();
    const { result } = renderHook(
      () => useCreateClassroom(repository({ createClassroom })),
      { wrapper: wrapper(queryClient) },
    );
    await act(
      async () => void (await result.current.mutateAsync({ name: '一班' })),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: classroomKeys.owned });
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it('reuses one generated request UUID across a join retry and invalidates mine', async () => {
    const transient = new ClassroomRepositoryError('UNAVAILABLE');
    const joinClassroom = vi
      .fn()
      .mockRejectedValueOnce(transient)
      .mockResolvedValue(classroom);
    const randomUUID = vi
      .spyOn(globalThis.crypto, 'randomUUID')
      .mockReturnValue('ca200000-0000-4000-8000-000000000001');
    const queryClient = client();
    const invalidate = vi
      .spyOn(queryClient, 'invalidateQueries')
      .mockResolvedValue();
    const { result } = renderHook(
      () => useJoinClassroom(repository({ joinClassroom })),
      {
        wrapper: wrapper(queryClient),
      },
    );

    await act(async () => void (await result.current.mutateAsync(' ABCD ')));
    expect(joinClassroom).toHaveBeenCalledTimes(2);
    expect(joinClassroom).toHaveBeenNthCalledWith(1, {
      joinCode: ' ABCD ',
      requestId: 'ca200000-0000-4000-8000-000000000001',
    });
    expect(joinClassroom).toHaveBeenNthCalledWith(2, {
      joinCode: ' ABCD ',
      requestId: 'ca200000-0000-4000-8000-000000000001',
    });
    expect(randomUUID).toHaveBeenCalledOnce();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: classroomKeys.mine });
  });
});
