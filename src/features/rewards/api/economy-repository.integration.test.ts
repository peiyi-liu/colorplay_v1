import { afterAll, describe, expect, it } from 'vitest';

import { TEST_USERS } from '../../../../tests/fixtures/users';
import { signedInClient } from '../../../../tests/helpers/signed-in-client';
import { createEconomyRepository } from './economy-repository';

describe('EconomyRepository with local Supabase', () => {
  const clients: Awaited<ReturnType<typeof signedInClient>>[] = [];

  afterAll(async () => {
    await Promise.all(
      clients.map((client) => client.auth.signOut({ scope: 'local' })),
    );
  });

  it('returns only each signed-in student own authoritative summary', async () => {
    const economyStudentOne = await signedInClient(
      TEST_USERS.economyStudentOne,
    );
    const economyStudentTwo = await signedInClient(
      TEST_USERS.economyStudentTwo,
    );
    clients.push(economyStudentOne, economyStudentTwo);

    const first = await createEconomyRepository(economyStudentOne).getSummary();
    const second =
      await createEconomyRepository(economyStudentTwo).getSummary();

    expect(first).toEqual({
      currentLevelXp: 0,
      level: 1,
      tokenBalance: 0,
      totalXp: 0,
      walletReconciled: true,
      xpPerLevel: 500,
    });
    expect(second).toEqual(first);
    expect(Object.keys(first).sort()).toEqual([
      'currentLevelXp',
      'level',
      'tokenBalance',
      'totalXp',
      'walletReconciled',
      'xpPerLevel',
    ]);
  });
});
