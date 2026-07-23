import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  type AchievementCatalog,
  type AchievementRepository,
  AchievementRepositoryError,
} from '../types';
import { achievementQueryKey, useAchievements } from './use-achievements';

const catalog: AchievementCatalog = {
  items: [
    {
      badgeKey: 'first_task_complete',
      description: '完成第一次正式挑戰',
      displayName: '初出茅廬',
      progress: 0,
      stableCode: 'first_task_complete',
      state: 'not_started',
      target: 1,
      unlockedAt: null,
    },
  ],
  totalCount: 1,
  unlockedCount: 0,
};

const createClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

const createWrapper = (client: QueryClient) =>
  function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };

describe('useAchievements', () => {
  it('exposes loading and stores the catalog under one stable key', async () => {
    let resolveCatalog: ((value: AchievementCatalog) => void) | undefined;
    const repository: AchievementRepository = {
      getCatalog: vi.fn().mockImplementation(
        () =>
          new Promise<AchievementCatalog>((resolve) => {
            resolveCatalog = resolve;
          }),
      ),
    };
    const client = createClient();

    const { result } = renderHook(() => useAchievements(repository), {
      wrapper: createWrapper(client),
    });

    expect(result.current.isPending).toBe(true);
    resolveCatalog?.(catalog);
    await waitFor(() => {
      expect(result.current.data).toEqual(catalog);
    });
    expect(client.getQueryData(achievementQueryKey)).toEqual(catalog);
    expect(client.getQueryCache().getAll()).toHaveLength(1);
  });

  it('exposes the named repository error without retrying it', async () => {
    const error = new AchievementRepositoryError('INVALID_RESPONSE');
    const getCatalog = vi.fn().mockRejectedValue(error);
    const client = createClient();

    const { result } = renderHook(() => useAchievements({ getCatalog }), {
      wrapper: createWrapper(client),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(result.current.error).toBe(error);
    expect(getCatalog).toHaveBeenCalledOnce();
  });

  it('deduplicates two consumers under the same QueryClient', async () => {
    const getCatalog = vi.fn().mockResolvedValue(catalog);
    const repository: AchievementRepository = { getCatalog };
    const client = createClient();
    const wrapper = createWrapper(client);

    const first = renderHook(() => useAchievements(repository), { wrapper });
    const second = renderHook(() => useAchievements(repository), { wrapper });

    await waitFor(() => {
      expect(first.result.current.data).toEqual(catalog);
    });
    await waitFor(() => {
      expect(second.result.current.data).toEqual(catalog);
    });
    expect(getCatalog).toHaveBeenCalledOnce();
  });

  it('refetches after trusted mutations invalidate the shared key', async () => {
    const getCatalog = vi.fn().mockResolvedValue(catalog);
    const client = createClient();
    const { result } = renderHook(() => useAchievements({ getCatalog }), {
      wrapper: createWrapper(client),
    });

    await waitFor(() => {
      expect(result.current.data).toEqual(catalog);
    });
    await client.invalidateQueries({ queryKey: achievementQueryKey });
    await waitFor(() => {
      expect(getCatalog).toHaveBeenCalledTimes(2);
    });
  });
});
