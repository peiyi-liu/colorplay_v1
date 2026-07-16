import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type { Database } from '../../../types/database';
import {
  type BlookInventory,
  type BlookInventoryItem,
  type InventoryRepository,
  InventoryRepositoryError,
} from '../types';

export { InventoryRepositoryError } from '../types';

const uuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu);

const expectedCatalog = [
  ['little_fox', '小狐狸', '🦊', 0],
  ['lucky_cat', '招財貓', '🐱', 100],
  ['travel_frog', '旅行蛙', '🐸', 250],
  ['wise_owl', '智慧鴞', '🦉', 500],
  ['primary_lion', '原色獅', '🦁', 1000],
  ['rainbow_horse', '彩虹馬', '🦄', 2000],
] as const;

const itemSchema = z.strictObject({
  cost_tokens: z.number().int().nonnegative(),
  emoji: z.string().min(1),
  equipped: z.boolean(),
  id: uuidSchema,
  name: z.string().min(1),
  owned: z.boolean(),
  stable_code: z.string().min(1),
});

const inventorySchema = z
  .strictObject({
    active_blook_id: uuidSchema,
    items: z.array(itemSchema).length(6),
    token_balance: z.number().int().nonnegative(),
  })
  .superRefine((value, context) => {
    const ids = new Set(value.items.map((item) => item.id));
    const equipped = value.items.filter((item) => item.equipped);
    const active = value.items.find(
      (item) => item.id === value.active_blook_id,
    );

    const catalogMatches = value.items.every((item, index) => {
      const expected = expectedCatalog[index];
      return (
        item.stable_code === expected?.[0] &&
        item.name === expected[1] &&
        item.emoji === expected[2] &&
        item.cost_tokens === expected[3]
      );
    });

    if (
      ids.size !== value.items.length ||
      !catalogMatches ||
      equipped.length !== 1 ||
      !active?.owned ||
      !active.equipped ||
      value.items.some((item) => item.equipped && !item.owned)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'INCONSISTENT_INVENTORY_SNAPSHOT',
      });
    }
  });

const mapItem = (item: z.infer<typeof itemSchema>): BlookInventoryItem => ({
  costTokens: item.cost_tokens,
  emoji: item.emoji,
  equipped: item.equipped,
  id: item.id,
  name: item.name,
  owned: item.owned,
  stableCode: item.stable_code,
});

const parseInventory = (payload: unknown): BlookInventory => {
  const parsed = inventorySchema.safeParse(payload);
  if (!parsed.success) {
    throw new InventoryRepositoryError('INVALID_RESPONSE');
  }

  return {
    activeBlookId: parsed.data.active_blook_id,
    items: parsed.data.items.map(mapItem),
    tokenBalance: parsed.data.token_balance,
  };
};

const mapServerError = (message: string): InventoryRepositoryError => {
  if (message.includes('AUTH_REQUIRED')) {
    return new InventoryRepositoryError('AUTH_REQUIRED');
  }
  if (message.includes('BLOOK_ALREADY_OWNED')) {
    return new InventoryRepositoryError('ALREADY_OWNED');
  }
  if (message.includes('BLOOK_NOT_OWNED')) {
    return new InventoryRepositoryError('NOT_OWNED');
  }
  if (message.includes('BLOOK_NOT_FOUND')) {
    return new InventoryRepositoryError('NOT_FOUND');
  }

  const shortfallMatch = /^BLOOK_INSUFFICIENT_TOKENS:(\d+)$/u.exec(message);
  if (shortfallMatch) {
    const shortfall = Number(shortfallMatch[1]);
    if (Number.isSafeInteger(shortfall) && shortfall > 0) {
      return new InventoryRepositoryError('INSUFFICIENT_TOKENS', shortfall);
    }
    return new InventoryRepositoryError('INVALID_RESPONSE');
  }
  if (message.includes('BLOOK_INSUFFICIENT_TOKENS:')) {
    return new InventoryRepositoryError('INVALID_RESPONSE');
  }
  return new InventoryRepositoryError('UNAVAILABLE');
};

const validateCommandId = (blookId: string): string => {
  const parsed = uuidSchema.safeParse(blookId);
  if (!parsed.success) {
    throw new InventoryRepositoryError('INVALID_RESPONSE');
  }
  return parsed.data;
};

export function createInventoryRepository(
  client: SupabaseClient<Database>,
): InventoryRepository {
  const command = async (
    name: 'equip_blook' | 'purchase_blook',
    blookId: string,
  ): Promise<BlookInventory> => {
    const { data, error } = await client.rpc(name, {
      blook_id: validateCommandId(blookId),
    });
    if (error) throw mapServerError(error.message);
    return parseInventory(data);
  };

  return {
    async equipBlook(blookId) {
      return command('equip_blook', blookId);
    },
    async getInventory() {
      const { data, error } = await client.rpc('get_my_blook_inventory');
      if (error) throw mapServerError(error.message);
      return parseInventory(data);
    },
    async purchaseBlook(blookId) {
      return command('purchase_blook', blookId);
    },
  };
}
