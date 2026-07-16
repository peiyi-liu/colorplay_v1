import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type { Database } from '../../../types/database';
import {
  EconomyRepositoryError,
  type EconomyRepository,
  type EconomySummary,
} from '../types';

export { EconomyRepositoryError } from '../types';

const nonNegativeInteger = z.number().int().nonnegative();

const economySummarySchema = z
  .strictObject({
    current_level_xp: nonNegativeInteger.max(499),
    level: z.number().int().min(1),
    token_balance: nonNegativeInteger,
    total_xp: nonNegativeInteger,
    wallet_reconciled: z.literal(true),
    xp_per_level: z.literal(500),
  })
  .superRefine((value, context) => {
    if (
      value.level !== Math.floor(value.total_xp / value.xp_per_level) + 1 ||
      value.current_level_xp !== value.total_xp % value.xp_per_level
    ) {
      context.addIssue({
        code: 'custom',
        message: 'INCONSISTENT_LEVEL_PROJECTION',
      });
    }
  });

const toSummary = (payload: unknown): EconomySummary => {
  const parsed = economySummarySchema.safeParse(payload);
  if (!parsed.success) {
    throw new EconomyRepositoryError('INVALID_RESPONSE');
  }

  return {
    currentLevelXp: parsed.data.current_level_xp,
    level: parsed.data.level,
    tokenBalance: parsed.data.token_balance,
    totalXp: parsed.data.total_xp,
    walletReconciled: parsed.data.wallet_reconciled,
    xpPerLevel: parsed.data.xp_per_level,
  };
};

export function createEconomyRepository(
  client: SupabaseClient<Database>,
): EconomyRepository {
  return {
    async getSummary() {
      const { data, error } = await client.rpc('get_my_economy_summary');

      if (error) {
        throw new EconomyRepositoryError(
          error.message.includes('AUTH_REQUIRED')
            ? 'AUTH_REQUIRED'
            : 'UNAVAILABLE',
        );
      }

      return toSummary(data);
    },
  };
}
