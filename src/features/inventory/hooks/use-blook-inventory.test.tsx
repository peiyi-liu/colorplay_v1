import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { economyQueryKey } from '../../rewards/hooks/use-economy-summary';
import type { BlookInventory, InventoryRepository } from '../types';
import {
  inventoryQueryKey,
  useEquipBlook,
  usePurchaseBlook,
} from './use-blook-inventory';

const returnedSnapshot: BlookInventory = {
  activeBlookId: '50000000-0000-0000-0000-000000000002',
  items: [],
  tokenBalance: 150,
};

const createWrapper = (client: QueryClient) =>
  function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };

const createRepository = (): InventoryRepository => ({
  equipBlook: vi.fn().mockResolvedValue(returnedSnapshot),
  getInventory: vi.fn().mockResolvedValue(returnedSnapshot),
  purchaseBlook: vi.fn().mockResolvedValue(returnedSnapshot),
});

describe('Blook inventory mutations', () => {
  it.each([
    ['purchase', usePurchaseBlook] as const,
    ['equip', useEquipBlook] as const,
  ])(
    'replaces formal caches from the %s server snapshot without optimistic arithmetic',
    async (_label, useMutationHook) => {
      const repository = createRepository();
      const client = new QueryClient({
        defaultOptions: { mutations: { retry: false } },
      });
      const setQueryData = vi.spyOn(client, 'setQueryData');
      const invalidateQueries = vi
        .spyOn(client, 'invalidateQueries')
        .mockResolvedValue();
      const { result } = renderHook(() => useMutationHook(repository), {
        wrapper: createWrapper(client),
      });

      await act(async () => {
        await result.current.mutateAsync(
          '50000000-0000-0000-0000-000000000002',
        );
      });

      expect(setQueryData).toHaveBeenCalledWith(
        inventoryQueryKey,
        returnedSnapshot,
      );
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: economyQueryKey,
      });
      expect(client.getQueryData(inventoryQueryKey)).toEqual(returnedSnapshot);
    },
  );
});
