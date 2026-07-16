import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  EconomyRepositoryError,
  type EconomyRepository,
  type EconomySummary,
} from '../types';
import { economyQueryKey, useEconomySummary } from './use-economy-summary';

const summary: EconomySummary = {
  currentLevelXp: 250,
  level: 2,
  tokenBalance: 250,
  totalXp: 750,
  walletReconciled: true,
  xpPerLevel: 500,
};

const createWrapper = (client: QueryClient) =>
  function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };

describe('useEconomySummary', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('stores the authoritative summary under the exact economy query key', async () => {
    const repository: EconomyRepository = {
      getSummary: vi.fn().mockResolvedValue(summary),
    };
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { result } = renderHook(() => useEconomySummary(repository), {
      wrapper: createWrapper(client),
    });

    await waitFor(() => {
      expect(result.current.data).toEqual(summary);
    });
    expect(client.getQueryData(economyQueryKey)).toEqual(summary);
    expect(client.getQueryCache().getAll()[0]?.queryKey).toEqual(
      economyQueryKey,
    );
  });

  it('never retries authentication or invalid-response failures', async () => {
    const getSummary = vi
      .fn<() => Promise<EconomySummary>>()
      .mockRejectedValue(new EconomyRepositoryError('AUTH_REQUIRED'));
    const client = new QueryClient({
      defaultOptions: { queries: { retryDelay: 0 } },
    });

    const { result } = renderHook(() => useEconomySummary({ getSummary }), {
      wrapper: createWrapper(client),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(getSummary).toHaveBeenCalledOnce();
  });

  it('retries unavailable failures fewer than two times', async () => {
    const getSummary = vi
      .fn<() => Promise<EconomySummary>>()
      .mockRejectedValue(new EconomyRepositoryError('UNAVAILABLE'));
    const client = new QueryClient({
      defaultOptions: { queries: { retryDelay: 0 } },
    });

    const { result } = renderHook(() => useEconomySummary({ getSummary }), {
      wrapper: createWrapper(client),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(getSummary).toHaveBeenCalledTimes(3);
  });
});
