import type { Page, Request } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database } from '../../src/types/database';
import type { BlookInventory } from '../../src/features/inventory/types';
import { fail, type FunctionalScope } from './config';
export interface PurchaseNaturalKey {
  userId: string;
  blookId: string;
}
export const observeFunctionalPurchase = (
  page: Pick<Page, 'on' | 'off'>,
  scope: FunctionalScope,
  subject: (token: string) => Promise<string>,
) => {
  const tasks: Promise<void>[] = [];
  let seen = 0;
  let failed = false;
  let captured: PurchaseNaturalKey | null = null;
  const listener = (request: Request) => {
    try {
      const url = new URL(request.url());
      if (
        request.method() !== 'POST' ||
        url.search !== '' ||
        url.hash !== '' ||
        url.username !== '' ||
        url.password !== '' ||
        url.origin !== new URL(scope.supabaseUrl).origin ||
        url.pathname !== '/rest/v1/rpc/purchase_blook'
      )
        return;
      seen++;
      if (seen > 1) {
        failed = true;
        return;
      }
      // Only the natural key is retained. Header/body objects are never saved.
      const body: unknown = request.postDataJSON();
      const { blook_id } = z
        .strictObject({
          blook_id: z
            .string()
            .regex(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu),
        })
        .parse(body);
      tasks.push(
        request
          .headerValue('authorization')
          .then(async (value) => {
            if (
              !value?.startsWith('Bearer ') ||
              !value.slice(7) ||
              value.length > 16391
            )
              return fail('FUNCTIONAL_STUDENT_FAILED');
            const userId = z.uuid().parse(await subject(value.slice(7)));
            captured = { userId, blookId: blook_id };
          })
          .catch(() => {
            failed = true;
          }),
      );
    } catch {
      failed = true;
    }
  };
  page.on('request', listener);
  return {
    settle: async () => {
      await Promise.allSettled(tasks);
    },
    key: async (): Promise<PurchaseNaturalKey> => {
      await Promise.allSettled(tasks);
      if (failed || seen !== 1 || !captured)
        return fail('FUNCTIONAL_STUDENT_FAILED');
      return captured;
    },
    dispose: () => page.off('request', listener),
  };
};
type WalletRow = Pick<
  Database['public']['Tables']['wallet_transactions']['Row'],
  'id' | 'user_id' | 'amount' | 'source_type' | 'source_id'
>;
export const readPurchaseWallet = async (
  client: SupabaseClient<Database>,
  userId: string,
): Promise<WalletRow[]> => {
  const { data, error } = await client
    .from('wallet_transactions')
    .select('id, user_id, amount, source_type, source_id')
    .eq('user_id', userId)
    .order('id')
    .retry(false);
  if (
    error ||
    data.length >= 1000 ||
    data.some(
      (row) => row.user_id !== userId || !Number.isSafeInteger(row.amount),
    )
  )
    return fail('FUNCTIONAL_STUDENT_FAILED');
  return data;
};
export const walletBalance = (rows: readonly WalletRow[]) =>
  rows.reduce((sum, row) => sum + row.amount, 0);
export const confirmPurchaseLedger = (
  rows: readonly WalletRow[],
  key: PurchaseNaturalKey,
  cost: number,
  inventory: BlookInventory,
) => {
  const purchase = rows.filter(
    (row) =>
      row.source_type === 'blook_purchase' && row.source_id === key.blookId,
  );
  if (
    purchase.length !== 1 ||
    purchase[0]?.user_id !== key.userId ||
    purchase[0].amount !== -cost ||
    walletBalance(rows) !== inventory.tokenBalance
  )
    return fail('FUNCTIONAL_STUDENT_FAILED');
};
export const assertConfirmedPurchaseReplay = async (
  key: PurchaseNaturalKey,
  bought: BlookInventory,
  cost: number,
  client: SupabaseClient<Database>,
  replay: (id: string) => Promise<BlookInventory>,
) => {
  const before = await readPurchaseWallet(client, key.userId);
  confirmPurchaseLedger(before, key, cost, bought);
  const result = await replay(key.blookId);
  const after = await readPurchaseWallet(client, key.userId);
  confirmPurchaseLedger(after, key, cost, result);
  if (
    JSON.stringify(result) !== JSON.stringify(bought) ||
    JSON.stringify(before) !== JSON.stringify(after)
  )
    return fail('FUNCTIONAL_STUDENT_FAILED');
};
