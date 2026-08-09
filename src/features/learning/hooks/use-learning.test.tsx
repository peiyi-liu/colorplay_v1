import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { LearningRepository } from '../api/learning-repository';
import { studentChapterMapKey } from './use-chapter-map';
import { useChapterReview, useCompleteReviewCard } from './use-learning';

const repository = (): LearningRepository => ({
  completeReviewCard: vi.fn().mockResolvedValue(undefined),
  getClassroomProgress: vi.fn(),
  getLearningProgress: vi.fn(),
  listChapterReview: vi.fn(),
  listMistakes: vi.fn(),
  listReviewProgress: vi.fn(),
  requestHint: vi.fn(),
  startRemediation: vi.fn(),
});

const wrapper = (client: QueryClient) =>
  function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };

describe('learning mutations', () => {
  it('does not read guarded review cards before map access is confirmed', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const supplied = repository();
    const { result } = renderHook(
      () =>
        useChapterReview(
          '21000000-0000-0000-0000-000000000001',
          supplied,
          false,
        ),
      { wrapper: wrapper(queryClient) },
    );

    expect(result.current.fetchStatus).toBe('idle');
    expect(supplied.listChapterReview).not.toHaveBeenCalled();
  });

  it('invalidates the authoritative chapter map after review completion', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        mutations: { retry: false },
        queries: { retry: false },
      },
    });
    const invalidate = vi
      .spyOn(queryClient, 'invalidateQueries')
      .mockResolvedValue();
    const { result } = renderHook(
      () =>
        useCompleteReviewCard(
          '21000000-0000-0000-0000-000000000001',
          repository(),
        ),
      { wrapper: wrapper(queryClient) },
    );

    await act(async () => {
      await result.current.mutateAsync({
        requestId: '25400000-0000-0000-0000-000000000001',
        reviewCardId: '25400000-0000-0000-0000-000000000002',
      });
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: studentChapterMapKey });
  });
});
