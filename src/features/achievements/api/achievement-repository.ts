import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type { Database } from '../../../types/database';
import {
  type AchievementCatalog,
  type AchievementCatalogItem,
  type AchievementRepository,
  AchievementRepositoryError,
} from '../types';

export { AchievementRepositoryError } from '../types';

const nonNegativeInteger = z.number().int().nonnegative();
const positiveInteger = z.number().int().positive();

const achievementItemSchema = z.strictObject({
  badge_key: z.string().min(1),
  description: z.string().min(1),
  display_name: z.string().min(1),
  progress: nonNegativeInteger.nullable(),
  stable_code: z.string().regex(/^[a-z][a-z0-9_]*$/u),
  state: z.enum(['not_started', 'in_progress', 'unlocked']),
  target: positiveInteger.nullable(),
  unlocked_at: z.iso.datetime().nullable(),
});

const achievementCatalogSchema = z
  .strictObject({
    items: z.array(achievementItemSchema).min(1),
    total_count: nonNegativeInteger,
    unlocked_count: nonNegativeInteger,
  })
  .superRefine((catalog, context) => {
    const stableCodes = new Set(catalog.items.map((item) => item.stable_code));
    const actualUnlocked = catalog.items.filter(
      (item) => item.state === 'unlocked',
    ).length;

    if (
      stableCodes.size !== catalog.items.length ||
      catalog.total_count !== catalog.items.length ||
      catalog.unlocked_count !== actualUnlocked
    ) {
      context.addIssue({
        code: 'custom',
        message: 'INCONSISTENT_ACHIEVEMENT_CATALOG',
      });
    }

    catalog.items.forEach((item, index) => {
      const bothProgressValuesAreNull =
        item.progress === null && item.target === null;
      const bothProgressValuesExist =
        item.progress !== null && item.target !== null;
      const progressShapeIsValid =
        bothProgressValuesAreNull || bothProgressValuesExist;
      const stateIsValid =
        (item.state === 'not_started' &&
          item.unlocked_at === null &&
          (item.progress === null || item.progress === 0)) ||
        (item.state === 'in_progress' &&
          item.unlocked_at === null &&
          item.progress !== null &&
          item.target !== null &&
          item.progress > 0 &&
          item.progress < item.target) ||
        (item.state === 'unlocked' &&
          item.unlocked_at !== null &&
          (bothProgressValuesAreNull || item.progress === item.target));
      const progressIsClamped =
        item.progress === null ||
        item.target === null ||
        item.progress <= item.target;

      if (!progressShapeIsValid || !stateIsValid || !progressIsClamped) {
        context.addIssue({
          code: 'custom',
          message: 'INCONSISTENT_ACHIEVEMENT_ITEM',
          path: ['items', index],
        });
      }
    });
  });

const mapItem = (
  item: z.infer<typeof achievementItemSchema>,
): AchievementCatalogItem => ({
  badgeKey: item.badge_key,
  description: item.description,
  displayName: item.display_name,
  progress: item.progress,
  stableCode: item.stable_code,
  state: item.state,
  target: item.target,
  unlockedAt: item.unlocked_at,
});

const parseCatalog = (payload: unknown): AchievementCatalog => {
  const parsed = achievementCatalogSchema.safeParse(payload);
  if (!parsed.success) {
    throw new AchievementRepositoryError('INVALID_RESPONSE');
  }

  return {
    items: parsed.data.items.map(mapItem),
    totalCount: parsed.data.total_count,
    unlockedCount: parsed.data.unlocked_count,
  };
};

export function createAchievementRepository(
  client: SupabaseClient<Database>,
): AchievementRepository {
  return {
    async getCatalog() {
      const { data, error } = await client.rpc('get_my_achievement_catalog');

      if (error) {
        throw new AchievementRepositoryError(
          error.message.includes('AUTH_REQUIRED')
            ? 'AUTH_REQUIRED'
            : 'UNAVAILABLE',
        );
      }

      return parseCatalog(data);
    },
  };
}
