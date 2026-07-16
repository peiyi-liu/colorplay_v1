import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import type { Database } from '../../../types/database';
import {
  createEconomyRepository,
  EconomyRepositoryError,
} from './economy-repository';

const validPayload = {
  current_level_xp: 250,
  level: 2,
  token_balance: 250,
  total_xp: 750,
  wallet_reconciled: true,
  xp_per_level: 500,
};

const createHarness = (
  response: Readonly<{ data: unknown; error: unknown }>,
) => {
  const rpc = vi.fn().mockResolvedValue(response);
  return {
    client: { rpc } as unknown as SupabaseClient<Database>,
    rpc,
  };
};

describe('EconomyRepository', () => {
  it('calls the own-summary RPC and maps only the strict authoritative shape', async () => {
    const { client, rpc } = createHarness({ data: validPayload, error: null });

    const result = await createEconomyRepository(client).getSummary();

    expect(rpc).toHaveBeenCalledWith('get_my_economy_summary');
    expect(result).toEqual({
      currentLevelXp: 250,
      level: 2,
      tokenBalance: 250,
      totalXp: 750,
      walletReconciled: true,
      xpPerLevel: 500,
    });
  });

  it.each([
    { ...validPayload, total_xp: '750' },
    { ...validPayload, token_balance: -1 },
    { ...validPayload, level: 1 },
    { ...validPayload, current_level_xp: 500 },
    { ...validPayload, current_level_xp: 249 },
    { ...validPayload, xp_per_level: 1000 },
    { ...validPayload, wallet_reconciled: false },
    { ...validPayload, user_id: 'foreign-user' },
  ])('rejects a malformed or over-broad response %#', async (data) => {
    const { client } = createHarness({ data, error: null });

    await expect(createEconomyRepository(client).getSummary()).rejects.toEqual(
      new EconomyRepositoryError('INVALID_RESPONSE'),
    );
  });

  it('maps authentication failures without exposing server details', async () => {
    const { client } = createHarness({
      data: null,
      error: { message: 'AUTH_REQUIRED: private server detail' },
    });

    await expect(createEconomyRepository(client).getSummary()).rejects.toEqual(
      new EconomyRepositoryError('AUTH_REQUIRED'),
    );
  });

  it('maps every other Supabase failure to unavailable', async () => {
    const { client } = createHarness({
      data: null,
      error: { message: 'database host unavailable' },
    });

    await expect(createEconomyRepository(client).getSummary()).rejects.toEqual(
      new EconomyRepositoryError('UNAVAILABLE'),
    );
  });
});
