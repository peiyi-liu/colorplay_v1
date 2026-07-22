import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import type { Database } from '../../../types/database';
import {
  createInventoryRepository,
  InventoryRepositoryError,
} from './inventory-repository';

const ids = [
  '50000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000002',
  '50000000-0000-0000-0000-000000000003',
  '50000000-0000-0000-0000-000000000004',
  '50000000-0000-0000-0000-000000000005',
  '50000000-0000-0000-0000-000000000006',
  '50000000-0000-0000-0000-000000000007',
  '50000000-0000-0000-0000-000000000008',
  '50000000-0000-0000-0000-000000000009',
  '50000000-0000-0000-0000-000000000010',
  '50000000-0000-0000-0000-000000000011',
  '50000000-0000-0000-0000-000000000012',
  '50000000-0000-0000-0000-000000000013',
  '50000000-0000-0000-0000-000000000014',
  '50000000-0000-0000-0000-000000000015',
  '50000000-0000-0000-0000-000000000016',
  '50000000-0000-0000-0000-000000000017',
  '50000000-0000-0000-0000-000000000018',
  '50000000-0000-0000-0000-000000000019',
  '50000000-0000-0000-0000-000000000020',
] as const;

const catalog = [
  [ids[0], 'little_fox', '小狐狸', '🦊', 0],
  [ids[1], 'lucky_cat', '招財貓', '🐱', 100],
  [ids[2], 'travel_frog', '旅行蛙', '🐸', 250],
  [ids[3], 'wise_owl', '智慧鴞', '🦉', 500],
  [ids[4], 'primary_lion', '原色獅', '🦁', 1000],
  [ids[5], 'rainbow_horse', '彩虹馬', '🦄', 2000],
  [ids[6], 'panda_painter', '熊貓畫師', '🐼', 150],
  [ids[7], 'koala_toner', '無尾熊調色師', '🐨', 300],
  [ids[8], 'tiger_orange', '猛虎橙', '🐯', 400],
  [ids[9], 'octo_mixer', '八爪配色師', '🐙', 600],
  [ids[10], 'robo_blue', '機械藍調', '🤖', 800],
  [ids[11], 'pixel_sprite', '像素精靈', '👾', 1200],
  [ids[12], 'indigo_dragon', '東方靛龍', '🐲', 1500],
  [ids[13], 'peacock_teal', '孔雀藍綠', '🦚', 2500],
  [ids[14], 'contrast_bee', '對比蜂', '🐝', 350],
  [ids[15], 'cmyk_toucan', '印刷大嘴鳥', '🦜', 700],
  [ids[16], 'neon_axolotl', '螢光蠑螈', '🌸', 900],
  [ids[17], 'chameleon_master', '變色龍大師', '🦎', 1800],
  [ids[18], 'gradient_whale', '漸層鯨', '🐋', 2200],
  [ids[19], 'grayscale_wolf', '灰階野狼', '🐺', 3000],
] as const;

const validPayload = {
  active_blook_id: ids[0],
  items: catalog.map(([id, stable_code, name, emoji, cost_tokens], index) => ({
    cost_tokens,
    emoji,
    equipped: index === 0,
    id,
    name,
    owned: index === 0,
    stable_code,
  })),
  token_balance: 250,
};

const createHarness = (
  ...responses: readonly Readonly<{ data: unknown; error: unknown }>[]
) => {
  const rpc = vi.fn();
  responses.forEach((response) => rpc.mockResolvedValueOnce(response));
  return {
    client: { rpc } as unknown as SupabaseClient<Database>,
    rpc,
  };
};

describe('InventoryRepository', () => {
  it('calls each trusted RPC with exact arguments and maps authoritative snapshots', async () => {
    const purchased = {
      ...validPayload,
      items: validPayload.items.map((item, index) => ({
        ...item,
        owned: index < 2,
      })),
      token_balance: 150,
    };
    const equipped = {
      ...purchased,
      active_blook_id: ids[1],
      items: purchased.items.map((item, index) => ({
        ...item,
        equipped: index === 1,
      })),
    };
    const { client, rpc } = createHarness(
      { data: validPayload, error: null },
      { data: purchased, error: null },
      { data: equipped, error: null },
    );
    const repository = createInventoryRepository(client);

    const initial = await repository.getInventory();
    const afterPurchase = await repository.purchaseBlook(ids[1]);
    const afterEquip = await repository.equipBlook(ids[1]);

    expect(rpc).toHaveBeenNthCalledWith(1, 'get_my_blook_inventory');
    expect(rpc).toHaveBeenNthCalledWith(2, 'purchase_blook', {
      blook_id: ids[1],
    });
    expect(rpc).toHaveBeenNthCalledWith(3, 'equip_blook', {
      blook_id: ids[1],
    });
    expect(initial.items).toHaveLength(20);
    expect(afterPurchase.tokenBalance).toBe(150);
    expect(afterEquip.activeBlookId).toBe(ids[1]);
    expect(Object.keys(afterEquip).sort()).toEqual([
      'activeBlookId',
      'items',
      'tokenBalance',
    ]);
  });

  it.each([
    { ...validPayload, token_balance: -1 },
    { ...validPayload, token_balance: '250' },
    { ...validPayload, email: 'leak@colorplay.test' },
    { ...validPayload, items: validPayload.items.slice(0, 5) },
    { ...validPayload, items: [...validPayload.items, validPayload.items[0]] },
    {
      ...validPayload,
      items: validPayload.items.map((item, index) => ({
        ...item,
        id: index === 1 ? ids[0] : item.id,
      })),
    },
    {
      ...validPayload,
      items: validPayload.items.map((item, index) => ({
        ...item,
        equipped: index < 2,
        owned: index < 2,
      })),
    },
    { ...validPayload, active_blook_id: ids[1] },
    {
      ...validPayload,
      items: validPayload.items.map((item, index) => ({
        ...item,
        cost_tokens: index === 1 ? 101 : item.cost_tokens,
      })),
    },
    {
      ...validPayload,
      items: [
        validPayload.items[1],
        validPayload.items[0],
        ...validPayload.items.slice(2),
      ],
    },
    {
      ...validPayload,
      items: validPayload.items.map((item, index) =>
        index === 0 ? { ...item, user_id: 'foreign-user' } : item,
      ),
    },
  ])(
    'rejects malformed, inconsistent, or over-broad payload %#',
    async (data) => {
      const { client } = createHarness({ data, error: null });

      await expect(
        createInventoryRepository(client).getInventory(),
      ).rejects.toEqual(new InventoryRepositoryError('INVALID_RESPONSE'));
    },
  );

  it.each([
    ['AUTH_REQUIRED', 'AUTH_REQUIRED', null],
    ['BLOOK_ALREADY_OWNED', 'ALREADY_OWNED', null],
    ['BLOOK_NOT_OWNED', 'NOT_OWNED', null],
    ['BLOOK_NOT_FOUND', 'NOT_FOUND', null],
    ['BLOOK_INSUFFICIENT_TOKENS:150', 'INSUFFICIENT_TOKENS', 150],
    ['BLOOK_INSUFFICIENT_TOKENS:0', 'INVALID_RESPONSE', null],
    ['connection refused', 'UNAVAILABLE', null],
  ] as const)(
    'maps server error %s to %s without leaking details',
    async (serverMessage, code, shortfall) => {
      const { client } = createHarness({
        data: null,
        error: { message: serverMessage },
      });

      await expect(
        createInventoryRepository(client).getInventory(),
      ).rejects.toEqual(new InventoryRepositoryError(code, shortfall));
    },
  );

  it('rejects invalid command UUIDs before making a request', async () => {
    const { client, rpc } = createHarness();
    const repository = createInventoryRepository(client);

    await expect(repository.purchaseBlook('not-a-uuid')).rejects.toEqual(
      new InventoryRepositoryError('INVALID_RESPONSE'),
    );
    await expect(repository.equipBlook('not-a-uuid')).rejects.toEqual(
      new InventoryRepositoryError('INVALID_RESPONSE'),
    );
    expect(rpc).not.toHaveBeenCalled();
  });
});
