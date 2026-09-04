import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { LearningRepository } from '../api/learning-repository';
import { LearningError } from '../api/learning-repository';
import { studentChapterMapKey } from './use-chapter-map';
import {
  useChapterReview,
  useCompleteReviewCard,
  useReviewMedia,
  calculateReadQueryRetryDelay,
  shouldRetryReviewMedia,
} from './use-learning';

const repository = (): LearningRepository => ({
  completeReviewCard: vi.fn().mockResolvedValue(undefined),
  getClassroomProgress: vi.fn(),
  getLearningProgress: vi.fn(),
  listChapterReview: vi.fn(),
  listMistakes: vi.fn(),
  listReviewProgress: vi.fn(),
  requestHint: vi.fn(),
  resolveReviewMedia: vi.fn(),
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

  it('adds a third retry only for unavailable review media and applies bounded jitter', () => {
    const unavailable = new LearningError('UNAVAILABLE');

    expect(
      [0, 1, 2].map((failureCount) =>
        shouldRetryReviewMedia(failureCount, unavailable),
      ),
    ).toEqual([true, true, true]);
    expect(shouldRetryReviewMedia(3, unavailable)).toBe(false);
    expect(
      shouldRetryReviewMedia(0, new LearningError('INVALID_RESPONSE')),
    ).toBe(false);
    expect(calculateReadQueryRetryDelay(0, () => 0)).toBe(250);
    expect(calculateReadQueryRetryDelay(20, () => 1)).toBe(4_000);
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

  it('reuses a fresh signed-media result instead of signing again on reader remount', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const supplied = repository();
    vi.mocked(supplied.resolveReviewMedia).mockResolvedValue([
      {
        assetPath: 'review-card-media/chapter-3/P301.webp',
        resolvedUrl: 'https://staging.supabase.test/storage/P301-signed',
      },
    ]);

    const first = renderHook(
      () => useReviewMedia(['review-card-media/chapter-3/P301.webp'], supplied),
      { wrapper: wrapper(queryClient) },
    );
    await waitFor(() => {
      expect(first.result.current.isSuccess).toBe(true);
    });
    first.unmount();

    const second = renderHook(
      () => useReviewMedia(['review-card-media/chapter-3/P301.webp'], supplied),
      { wrapper: wrapper(queryClient) },
    );
    await waitFor(() => {
      expect(second.result.current.data?.[0]?.resolvedUrl).toContain(
        'P301-signed',
      );
    });

    expect(supplied.resolveReviewMedia).toHaveBeenCalledOnce();
  });
});
