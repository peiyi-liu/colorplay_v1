import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  MasteryError,
  type MasteryRepository,
  type MasteryState,
} from '../api/mastery-repository';
import {
  masteryKeys,
  useMasteryHint,
  useMasteryState,
  useStartMastery,
  useSubmitMasteryAttempt,
} from './use-mastery';

const chapterId = 'ca000000-0000-4000-8000-000000000001';
const sessionId = 'ca000000-0000-4000-8000-000000000002';
const optionId = 'ca000000-0000-4000-8000-000000000004';

const state: MasteryState = {
  chapterId,
  chapterTitle: '色彩基礎',
  position: 1,
  question: null,
  questionCount: 1,
  sessionId,
  stages: [{ attempts: 0, completed: false, position: 1 }],
  status: 'in_progress',
};

const repository = (
  overrides: Partial<MasteryRepository> = {},
): MasteryRepository => ({
  getHint: vi.fn().mockResolvedValue({ content: '提示', hintLevel: 1 }),
  getState: vi.fn().mockResolvedValue(state),
  startSession: vi.fn().mockResolvedValue(sessionId),
  submitAttempt: vi.fn().mockResolvedValue({
    correctOptionId: optionId,
    explanation: '答對了',
    isCorrect: true,
    position: 1,
    status: 'completed',
  }),
  ...overrides,
});

const client = () =>
  new QueryClient({
    defaultOptions: {
      mutations: { retryDelay: 0 },
      queries: { retryDelay: 0 },
    },
  });

const wrapper = (queryClient: QueryClient) =>
  function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };

describe('mastery hooks', () => {
  it('does not query with an empty session id', () => {
    const getState = vi.fn().mockResolvedValue(state);

    const { result } = renderHook(
      () => useMasteryState('', repository({ getState })),
      {
        wrapper: wrapper(client()),
      },
    );

    expect(result.current.fetchStatus).toBe('idle');
    expect(getState).not.toHaveBeenCalled();
  });

  it('bounds retry to unavailable state reads and never retries other state errors', async () => {
    const unavailable = vi
      .fn<() => Promise<MasteryState>>()
      .mockRejectedValue(new MasteryError('UNAVAILABLE'));
    const notFound = vi
      .fn<() => Promise<MasteryState>>()
      .mockRejectedValue(new MasteryError('NOT_FOUND'));

    const first = renderHook(
      () => useMasteryState(sessionId, repository({ getState: unavailable })),
      { wrapper: wrapper(client()) },
    );
    await waitFor(() => {
      expect(first.result.current.isError).toBe(true);
    });
    expect(unavailable).toHaveBeenCalledTimes(3);

    const second = renderHook(
      () => useMasteryState(sessionId, repository({ getState: notFound })),
      { wrapper: wrapper(client()) },
    );
    await waitFor(() => {
      expect(second.result.current.isError).toBe(true);
    });
    expect(notFound).toHaveBeenCalledOnce();
  });

  it('delegates start, hint, and submit mutations without retrying failed server receipts', async () => {
    const failure = new MasteryError('UNAVAILABLE');
    const startSession = vi.fn().mockRejectedValue(failure);
    const getHint = vi.fn().mockRejectedValue(failure);
    const submitAttempt = vi.fn().mockRejectedValue(failure);
    const supplied = repository({ getHint, startSession, submitAttempt });
    const queryClient = client();
    const { result } = renderHook(
      () => ({
        hint: useMasteryHint(sessionId, supplied),
        start: useStartMastery(supplied),
        submit: useSubmitMasteryAttempt(sessionId, supplied),
      }),
      { wrapper: wrapper(queryClient) },
    );

    await act(async () => {
      await expect(result.current.start.mutateAsync(chapterId)).rejects.toBe(
        failure,
      );
      await expect(result.current.hint.mutateAsync(2)).rejects.toBe(failure);
      await expect(result.current.submit.mutateAsync(optionId)).rejects.toBe(
        failure,
      );
    });
    expect(startSession).toHaveBeenCalledOnce();
    expect(startSession).toHaveBeenCalledWith(chapterId);
    expect(getHint).toHaveBeenCalledOnce();
    expect(getHint).toHaveBeenCalledWith(sessionId, 2);
    expect(submitAttempt).toHaveBeenCalledOnce();
    expect(submitAttempt).toHaveBeenCalledWith(sessionId, optionId);
  });

  it('invalidates only the matching mastery state after a successful submit', async () => {
    const queryClient = client();
    const invalidate = vi
      .spyOn(queryClient, 'invalidateQueries')
      .mockResolvedValue();
    const submitAttempt = vi.fn().mockResolvedValue({
      correctOptionId: optionId,
      explanation: '答對了',
      isCorrect: true as const,
      position: 1,
      status: 'completed' as const,
    });
    const { result } = renderHook(
      () => useSubmitMasteryAttempt(sessionId, repository({ submitAttempt })),
      { wrapper: wrapper(queryClient) },
    );

    await act(async () => void (await result.current.mutateAsync(optionId)));

    expect(invalidate).toHaveBeenCalledOnce();
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: masteryKeys.state(sessionId),
    });
    expect(invalidate).not.toHaveBeenCalledWith({
      queryKey: masteryKeys.state('ca000000-0000-4000-8000-000000000099'),
    });
  });
});
