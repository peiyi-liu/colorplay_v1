import { describe, expect, it, vi } from 'vitest';

import { createInventoryRepository } from './inventory-repository';

const framePayload = {
  active_frame_id: '60000000-0000-0000-0000-000000000001',
  items: [
    {
      cost_tokens: 0,
      equipped: true,
      gradient_end: '#eab308',
      gradient_start: '#f59e0b',
      id: '60000000-0000-0000-0000-000000000001',
      name: '熔岩流金',
      owned: true,
      stable_code: 'lava_gold',
    },
    {
      cost_tokens: 25,
      equipped: false,
      gradient_end: '#0ea5e9',
      gradient_start: '#6366f1',
      id: '60000000-0000-0000-0000-000000000002',
      name: '深海霓虹',
      owned: false,
      stable_code: 'deep_neon',
    },
  ],
  token_balance: 75,
};

const clientWith = (rpc: unknown) => ({ rpc }) as never;

describe('frame inventory repository', () => {
  it('parses the frame inventory snapshot from the trusted RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: framePayload, error: null });
    const repository = createInventoryRepository(clientWith(rpc));
    const inventory = await repository.getFrameInventory();
    expect(rpc).toHaveBeenCalledWith('get_my_frame_inventory');
    expect(inventory.tokenBalance).toBe(75);
    expect(inventory.items[0]).toMatchObject({
      equipped: true,
      gradientEnd: '#eab308',
      gradientStart: '#f59e0b',
      stableCode: 'lava_gold',
    });
  });

  it('maps the purchase shortfall error', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'FRAME_INSUFFICIENT_TOKENS:25' },
    });
    const repository = createInventoryRepository(clientWith(rpc));
    await expect(
      repository.purchaseFrame('60000000-0000-0000-0000-000000000002'),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_TOKENS' });
  });

  it('maps the not-owned equip error', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'FRAME_NOT_OWNED' },
    });
    const repository = createInventoryRepository(clientWith(rpc));
    await expect(
      repository.equipFrame('60000000-0000-0000-0000-000000000002'),
    ).rejects.toMatchObject({ code: 'NOT_OWNED' });
  });
});
