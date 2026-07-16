import { afterAll, describe, expect, it } from 'vitest';

import { TEST_USERS } from '../../../../tests/fixtures/users';
import { signedInClient } from '../../../../tests/helpers/signed-in-client';
import { createAchievementRepository } from './achievement-repository';

const approvedStableCodes = [
  'first_task_complete',
  'first_perfect_quiz',
  'mistakes_resolved_10',
  'chapter_mastered_1',
  'all_chapters_mastered',
  'level_10',
  'correct_streak_20',
  'live_complete_5',
  'blooks_owned_6',
] as const;

const deferredStableCodes = new Set([
  'mistakes_resolved_10',
  'chapter_mastered_1',
  'all_chapters_mastered',
  'live_complete_5',
]);

describe('AchievementRepository with local Supabase', () => {
  const clients: Awaited<ReturnType<typeof signedInClient>>[] = [];

  afterAll(async () => {
    await Promise.all(
      clients.map((client) => client.auth.signOut({ scope: 'local' })),
    );
  });

  it('returns the truthful nine-item student catalog from the safe RPC', async () => {
    const student = await signedInClient(TEST_USERS.studentTwo);
    clients.push(student);

    const catalog = await createAchievementRepository(student).getCatalog();

    expect(catalog.items.map((item) => item.stableCode)).toEqual(
      approvedStableCodes,
    );
    expect(catalog.totalCount).toBe(9);
    expect(catalog.unlockedCount).toBe(0);
    expect(
      catalog.items
        .filter((item) => deferredStableCodes.has(item.stableCode))
        .map((item) => ({
          progress: item.progress,
          stableCode: item.stableCode,
          state: item.state,
          target: item.target,
        })),
    ).toEqual([
      {
        progress: null,
        stableCode: 'mistakes_resolved_10',
        state: 'not_started',
        target: null,
      },
      {
        progress: null,
        stableCode: 'chapter_mastered_1',
        state: 'not_started',
        target: null,
      },
      {
        progress: null,
        stableCode: 'all_chapters_mastered',
        state: 'not_started',
        target: null,
      },
      {
        progress: null,
        stableCode: 'live_complete_5',
        state: 'not_started',
        target: null,
      },
    ]);
  });
});
