import { expect, type Page } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../src/types/database';
import type { BlookInventory } from '../../src/features/inventory/types';
import { createInventoryRepository } from '../../src/features/inventory/api/inventory-repository';
import { createEconomyRepository } from '../../src/features/rewards/api/economy-repository';
import { createAchievementRepository } from '../../src/features/achievements/api/achievement-repository';
import { createLeaderboardRepository } from '../../src/features/leaderboard/api/leaderboard-repository';
import { fail, safely } from './config';

export const affordableUnownedItem = (inventory: BlookInventory) => {
  const item = inventory.items
    .filter(
      (row) =>
        !row.owned &&
        row.costTokens > 0 &&
        row.costTokens <= inventory.tokenBalance,
    )
    .sort((a, b) => a.costTokens - b.costTokens)[0];
  return item ?? fail('FUNCTIONAL_STUDENT_FAILED');
};
export const studentLedgerReadback = async (
  client: SupabaseClient<Database>,
  expectedUserId: string,
) =>
  safely(async () => {
    const user = await client.auth.getUser();
    if (user.error || user.data.user.id !== expectedUserId)
      return fail('FUNCTIONAL_STUDENT_FAILED');
    const [xp, wallet, summary] = await Promise.all([
      client
        .from('xp_transactions')
        .select('user_id, amount, source_type, source_id')
        .eq('user_id', expectedUserId)
        .retry(false),
      client
        .from('wallet_transactions')
        .select('user_id, amount, source_type, source_id')
        .eq('user_id', expectedUserId)
        .retry(false),
      createEconomyRepository(client).getSummary(),
    ]);
    if (xp.error || wallet.error) return fail('FUNCTIONAL_STUDENT_FAILED');
    for (const rows of [xp.data, wallet.data]) {
      if (
        rows.some(
          (row) =>
            row.user_id !== expectedUserId || !Number.isSafeInteger(row.amount),
        ) ||
        new Set(rows.map((row) => `${row.source_type}:${row.source_id}`))
          .size !== rows.length
      )
        return fail('FUNCTIONAL_STUDENT_FAILED');
    }
    if (
      xp.data.reduce((sum, row) => sum + row.amount, 0) !== summary.totalXp ||
      wallet.data.reduce((sum, row) => sum + row.amount, 0) !==
        summary.tokenBalance
    )
      return fail('FUNCTIONAL_STUDENT_FAILED');
    return {
      xpEntries: xp.data.length,
      walletEntries: wallet.data.length,
      ledgerReconciled: true,
    };
  }, 'FUNCTIONAL_STUDENT_FAILED');
export const purchaseEquipFunctional = async (
  page: Page,
  client: SupabaseClient<Database>,
) =>
  safely(async () => {
    const repository = createInventoryRepository(client);
    const before = await repository.getInventory();
    const item = affordableUnownedItem(before);
    await page.goto('/app/shop');
    await page
      .getByRole('button', {
        name: `購買 ${item.name}，${String(item.costTokens)} Token`,
        exact: true,
      })
      .click();
    await page
      .getByRole('dialog', { name: `購買「${item.name}」？`, exact: true })
      .getByRole('button', { name: '確認購買', exact: true })
      .click();
    await expect(
      page.getByText(`已購買${item.name}。`, { exact: true }),
    ).toBeVisible();
    const bought = await repository.getInventory();
    if (
      !bought.items.find((row) => row.id === item.id)?.owned ||
      before.tokenBalance - bought.tokenBalance !== item.costTokens
    )
      return fail('FUNCTIONAL_STUDENT_FAILED');
    await page
      .getByRole('button', { name: `選用 ${item.name}`, exact: true })
      .click();
    await expect(
      page.getByText(`已裝備${item.name}。`, { exact: true }),
    ).toBeVisible();
    const equipped = await repository.getInventory();
    if (
      equipped.activeBlookId !== item.id ||
      equipped.tokenBalance !== bought.tokenBalance ||
      equipped.items.filter((row) => row.equipped).length !== 1
    )
      return fail('FUNCTIONAL_STUDENT_FAILED');
    return {
      purchaseConfirmed: true,
      equipConfirmed: true,
      spentTokens: item.costTokens,
    };
  }, 'FUNCTIONAL_STUDENT_FAILED');
export const achievementLeaderboardFunctional = async (
  page: Page,
  client: SupabaseClient<Database>,
  classroomId: string,
) =>
  safely(async () => {
    const catalog = await createAchievementRepository(client).getCatalog();
    await page.goto('/app/achievements');
    await expect(
      page.getByRole('heading', { name: /成就/u }).first(),
    ).toBeVisible();
    if (catalog.totalCount === 0 || catalog.unlockedCount === 0)
      return fail('FUNCTIONAL_STUDENT_FAILED');
    const leaderboard =
      await createLeaderboardRepository(client).getClassroomLeaderboard(
        classroomId,
      );
    const summary = await createEconomyRepository(client).getSummary();
    if (
      leaderboard.classroomId !== classroomId ||
      leaderboard.memberCount !== 2 ||
      !leaderboard.selfEntry?.isSelf ||
      leaderboard.selfEntry.totalXp !== summary.totalXp
    )
      return fail('FUNCTIONAL_STUDENT_FAILED');
    await page.goto(`/app/leaderboard/${classroomId}`);
    await expect(
      page.getByRole('heading', { name: /排行榜/u }).first(),
    ).toBeVisible();
    return {
      catalogCount: catalog.totalCount,
      unlockedCount: catalog.unlockedCount,
      leaderboardMembers: leaderboard.memberCount,
      selfXpConfirmed: true,
    };
  }, 'FUNCTIONAL_STUDENT_FAILED');
