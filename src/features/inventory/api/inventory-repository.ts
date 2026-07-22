import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type { Database } from '../../../types/database';
import {
  type BlookInventory,
  type BlookInventoryItem,
  type FrameInventory,
  type FrameInventoryItem,
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
  ['panda_painter', '熊貓畫師', '🐼', 150],
  ['koala_toner', '無尾熊調色師', '🐨', 300],
  ['tiger_orange', '猛虎橙', '🐯', 400],
  ['octo_mixer', '八爪配色師', '🐙', 600],
  ['robo_blue', '機械藍調', '🤖', 800],
  ['pixel_sprite', '像素精靈', '👾', 1200],
  ['indigo_dragon', '東方靛龍', '🐲', 1500],
  ['peacock_teal', '孔雀藍綠', '🦚', 2500],
  ['contrast_bee', '對比蜂', '🐝', 350],
  ['cmyk_toucan', '印刷大嘴鳥', '🦜', 700],
  ['neon_axolotl', '螢光蠑螈', '🌸', 900],
  ['chameleon_master', '變色龍大師', '🦎', 1800],
  ['gradient_whale', '漸層鯨', '🐋', 2200],
  ['grayscale_wolf', '灰階野狼', '🐺', 3000],
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
    items: z.array(itemSchema).length(expectedCatalog.length),
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

const frameItemSchema = z.strictObject({
  cost_tokens: z.number().int().nonnegative(),
  equipped: z.boolean(),
  gradient_end: z.string().regex(/^#[0-9a-f]{6}$/u),
  gradient_start: z.string().regex(/^#[0-9a-f]{6}$/u),
  id: uuidSchema,
  name: z.string().min(1),
  owned: z.boolean(),
  stable_code: z.string().min(1),
});

const frameInventorySchema = z
  .strictObject({
    active_frame_id: uuidSchema,
    items: z.array(frameItemSchema).min(1),
    token_balance: z.number().int().nonnegative(),
  })
  .superRefine((value, context) => {
    const equipped = value.items.filter((item) => item.equipped);
    const active = value.items.find(
      (item) => item.id === value.active_frame_id,
    );
    if (
      equipped.length !== 1 ||
      !active?.owned ||
      !active.equipped ||
      value.items.some((item) => item.equipped && !item.owned)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'INCONSISTENT_FRAME_SNAPSHOT',
      });
    }
  });

const mapFrameItem = (
  item: z.infer<typeof frameItemSchema>,
): FrameInventoryItem => ({
  costTokens: item.cost_tokens,
  equipped: item.equipped,
  gradientEnd: item.gradient_end,
  gradientStart: item.gradient_start,
  id: item.id,
  name: item.name,
  owned: item.owned,
  stableCode: item.stable_code,
});

const parseFrameInventory = (payload: unknown): FrameInventory => {
  const parsed = frameInventorySchema.safeParse(payload);
  if (!parsed.success) {
    throw new InventoryRepositoryError('INVALID_RESPONSE');
  }
  return {
    activeFrameId: parsed.data.active_frame_id,
    items: parsed.data.items.map(mapFrameItem),
    tokenBalance: parsed.data.token_balance,
  };
};

const mapServerError = (message: string): InventoryRepositoryError => {
  if (message.includes('AUTH_REQUIRED')) {
    return new InventoryRepositoryError('AUTH_REQUIRED');
  }
  if (message.includes('FRAME_NOT_OWNED')) {
    return new InventoryRepositoryError('NOT_OWNED');
  }
  if (message.includes('FRAME_NOT_FOUND')) {
    return new InventoryRepositoryError('NOT_FOUND');
  }
  {
    const frameShortfall = /^FRAME_INSUFFICIENT_TOKENS:(\d+)$/u.exec(message);
    if (frameShortfall) {
      const shortfall = Number(frameShortfall[1]);
      if (Number.isSafeInteger(shortfall) && shortfall > 0) {
        return new InventoryRepositoryError('INSUFFICIENT_TOKENS', shortfall);
      }
      return new InventoryRepositoryError('INVALID_RESPONSE');
    }
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

  const frameCommand = async (
    name: 'equip_frame' | 'purchase_frame',
    frameId: string,
  ): Promise<FrameInventory> => {
    const { data, error } = await client.rpc(name, {
      frame_id: validateCommandId(frameId),
    });
    if (error) throw mapServerError(error.message);
    return parseFrameInventory(data);
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
    async equipFrame(frameId) {
      return frameCommand('equip_frame', frameId);
    },
    async getFrameInventory() {
      const { data, error } = await client.rpc('get_my_frame_inventory');
      if (error) throw mapServerError(error.message);
      return parseFrameInventory(data);
    },
    async purchaseFrame(frameId) {
      return frameCommand('purchase_frame', frameId);
    },
  };
}
