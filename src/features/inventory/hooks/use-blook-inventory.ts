import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { parsePublicEnv } from '../../../lib/config/public-env';
import { getBrowserSupabaseClient } from '../../../lib/supabase/browser-client';
import { economyQueryKey } from '../../rewards/hooks/use-economy-summary';
import { createInventoryRepository } from '../api/inventory-repository';
import {
  type BlookInventory,
  type FrameInventory,
  type InventoryRepository,
  InventoryRepositoryError,
} from '../types';

export const inventoryQueryKey = ['inventory', 'blooks'] as const;
export const frameInventoryQueryKey = ['inventory', 'frames'] as const;

const resolveRepository = (
  suppliedRepository: InventoryRepository | undefined,
): InventoryRepository =>
  suppliedRepository ??
  createInventoryRepository(
    getBrowserSupabaseClient(parsePublicEnv(import.meta.env)),
  );

export function useBlookInventory(
  repository?: InventoryRepository,
): UseQueryResult<BlookInventory, InventoryRepositoryError> {
  const resolvedRepository = resolveRepository(repository);
  return useQuery<BlookInventory, InventoryRepositoryError>({
    queryFn: () => resolvedRepository.getInventory(),
    queryKey: inventoryQueryKey,
    retry: (failureCount, error) =>
      error.code === 'UNAVAILABLE' && failureCount < 2,
  });
}

type InventoryMutation = UseMutationResult<
  BlookInventory,
  InventoryRepositoryError,
  string
>;

const useInventoryMutation = (
  operation: 'equip' | 'purchase',
  repository?: InventoryRepository,
): InventoryMutation => {
  const queryClient = useQueryClient();
  const resolvedRepository = resolveRepository(repository);

  return useMutation<BlookInventory, InventoryRepositoryError, string>({
    mutationFn: (blookId) =>
      operation === 'purchase'
        ? resolvedRepository.purchaseBlook(blookId)
        : resolvedRepository.equipBlook(blookId),
    onSuccess: async (snapshot) => {
      queryClient.setQueryData(inventoryQueryKey, snapshot);
      await queryClient.invalidateQueries({ queryKey: economyQueryKey });
    },
    retry: false,
  });
};

export function usePurchaseBlook(
  repository?: InventoryRepository,
): InventoryMutation {
  return useInventoryMutation('purchase', repository);
}

export function useEquipBlook(
  repository?: InventoryRepository,
): InventoryMutation {
  return useInventoryMutation('equip', repository);
}

export function useFrameInventory(
  repository?: InventoryRepository,
): UseQueryResult<FrameInventory, InventoryRepositoryError> {
  const resolvedRepository = resolveRepository(repository);
  return useQuery<FrameInventory, InventoryRepositoryError>({
    queryFn: () => resolvedRepository.getFrameInventory(),
    queryKey: frameInventoryQueryKey,
    retry: (failureCount, error) =>
      error.code === 'UNAVAILABLE' && failureCount < 2,
  });
}

type FrameMutation = UseMutationResult<
  FrameInventory,
  InventoryRepositoryError,
  string
>;

const useFrameMutation = (
  operation: 'equip' | 'purchase',
  repository?: InventoryRepository,
): FrameMutation => {
  const queryClient = useQueryClient();
  const resolvedRepository = resolveRepository(repository);

  return useMutation<FrameInventory, InventoryRepositoryError, string>({
    mutationFn: (frameId) =>
      operation === 'purchase'
        ? resolvedRepository.purchaseFrame(frameId)
        : resolvedRepository.equipFrame(frameId),
    onSuccess: async (snapshot) => {
      queryClient.setQueryData(frameInventoryQueryKey, snapshot);
      await queryClient.invalidateQueries({ queryKey: economyQueryKey });
    },
    retry: false,
  });
};

export function usePurchaseFrame(
  repository?: InventoryRepository,
): FrameMutation {
  return useFrameMutation('purchase', repository);
}

export function useEquipFrame(repository?: InventoryRepository): FrameMutation {
  return useFrameMutation('equip', repository);
}
