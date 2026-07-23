import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  type AssignmentRepository,
  AssignmentRepositoryError,
  type StudentAssignment,
} from '../types';
import {
  assignmentKeys,
  useMyAssignments,
  useStartAssignmentAttempt,
} from './use-assignments';

const studentAssignment: StudentAssignment = {
  assignmentId: '14300000-0000-0000-0000-000000000001',
  classroomId: '14100000-0000-0000-0000-000000000001',
  classroomName: '三年一班',
  title: '第三章回家作業',
  status: 'published',
  availableFrom: null,
  deadlineAt: '2026-07-24T16:00:00+00:00',
  attemptLimit: 2,
  passingThreshold: 600,
  attemptsUsed: 0,
  latestAttemptStatus: null,
  latestPassed: null,
};

const repositoryWith = (
  overrides: Partial<AssignmentRepository>,
): AssignmentRepository => ({
  createAssignment: vi.fn(),
  listClassroom: vi.fn().mockResolvedValue([]),
  listMine: vi.fn().mockResolvedValue([studentAssignment]),
  startAttempt: vi.fn(),
  updateStatus: vi.fn(),
  ...overrides,
});

const createClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } });

const createWrapper = (client: QueryClient) =>
  function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };

describe('assignment hooks', () => {
  it('stores student assignments under the stable key', async () => {
    const repository = repositoryWith({});
    const client = createClient();

    const { result } = renderHook(() => useMyAssignments(repository), {
      wrapper: createWrapper(client),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data).toEqual([studentAssignment]);
    expect(client.getQueryData(assignmentKeys.mine)).toEqual([
      studentAssignment,
    ]);
    expect(repository.listMine).toHaveBeenCalledTimes(1);
  });

  it('surfaces named repository errors without retrying denials', async () => {
    const listMine = vi
      .fn()
      .mockRejectedValue(new AssignmentRepositoryError('AUTH_REQUIRED'));
    const repository = repositoryWith({ listMine });
    const client = new QueryClient();

    const { result } = renderHook(() => useMyAssignments(repository), {
      wrapper: createWrapper(client),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(result.current.error?.code).toBe('AUTH_REQUIRED');
    expect(listMine).toHaveBeenCalledTimes(1);
  });

  it('starting an attempt invalidates the student list once', async () => {
    const startAttempt = vi.fn().mockResolvedValue({
      attemptId: '14400000-0000-0000-0000-000000000001',
      assignmentId: studentAssignment.assignmentId,
      attemptNumber: 1,
      sessionId: '14500000-0000-0000-0000-000000000001',
    });
    const repository = repositoryWith({ startAttempt });
    const client = createClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useStartAssignmentAttempt(repository), {
      wrapper: createWrapper(client),
    });
    result.current.mutate({
      assignmentId: studentAssignment.assignmentId,
      requestId: '14600000-0000-0000-0000-000000000001',
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(startAttempt).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: assignmentKeys.mine,
    });
  });
});
