import { observeFunctionalPurchase } from '../../scripts/concurrency/purchase-replay';
import { EventEmitter } from 'node:events';
import type { Page } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../src/types/database';
import type { BlookInventory } from '../../src/features/inventory/types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { syntheticScope } from './helpers/whole-site-functional';
const factory = vi.hoisted(() => vi.fn());
vi.mock('../../src/features/inventory/api/inventory-repository', () => ({
  createInventoryRepository: factory,
}));
vi.mock('@playwright/test', () => ({
  expect: () => ({ toBeVisible: () => Promise.resolve() }),
}));
import { purchaseEquipFunctional } from '../../scripts/concurrency/student-economy';
const user = '10000000-0000-4000-8000-000000000001';
const blook = '20000000-0000-4000-8000-000000000001';
const base = '30000000-0000-4000-8000-000000000001';
const make = (
  mode: 'normal' | 'double_debit' | 'unknown' | 'bad_body',
  selected = blook,
) => {
  let balance = 300;
  let bought = false;
  let equipped = false;
  const ledger = [
    {
      id: 'earned',
      user_id: user,
      amount: 300,
      source_type: 'quiz_finalize',
      source_id: 'quiz',
    },
  ];
  const inventory = (): BlookInventory => ({
    tokenBalance: balance,
    activeBlookId: equipped ? selected : base,
    items: [
      {
        id: base,
        stableCode: 'default',
        name: '預設',
        emoji: 'x',
        costTokens: 0,
        owned: true,
        equipped: !equipped,
      },
      {
        id: selected,
        stableCode: 'paid',
        name: '合成角色',
        emoji: 'x',
        costTokens: 100,
        owned: bought,
        equipped,
      },
    ],
  });
  const purchaseBlook = vi.fn((id: string) => {
    expect(id).toBe(selected);
    if (mode === 'double_debit') {
      balance -= 100;
      ledger.push({
        id: 'wrong-second-debit',
        user_id: user,
        amount: -100,
        source_type: 'blook_purchase',
        source_id: 'another-key',
      });
    }
    return Promise.resolve(inventory());
  });
  factory.mockReturnValue({
    getInventory: () => Promise.resolve(inventory()),
    purchaseBlook,
  });
  const events = new EventEmitter();
  const locator = (name: string): unknown => ({
    getByRole: (_role: string, options: { name: string }) =>
      locator(options.name),
    click: () => {
      if (name === '確認購買') {
        events.emit('request', {
          method: () => 'POST',
          url: () => 'http://127.0.0.1:58321/rest/v1/rpc/purchase_blook',
          postDataJSON: () =>
            mode === 'bad_body'
              ? { blook_id: selected, hidden: 'SYNTHETIC_SECRET' }
              : { blook_id: selected },
          headerValue: () => Promise.resolve('Bearer SYNTHETIC_ACCESS'),
        });
        bought = true;
        balance -= 100;
        ledger.push({
          id: 'purchase',
          user_id: user,
          amount: -100,
          source_type: 'blook_purchase',
          source_id: selected,
        });
        if (mode === 'unknown')
          return Promise.reject(new Error('SYNTHETIC_SECRET'));
      } else if (name.startsWith('選用 ')) equipped = true;
      return Promise.resolve();
    },
  });
  const page = Object.assign(events, {
    goto: () => Promise.resolve(),
    getByRole: (_role: string, options: { name: string }) =>
      locator(options.name),
    getByText: () => locator('toast'),
  }) as unknown as Page;
  const rows = () =>
    Promise.resolve({ data: ledger.map((row) => ({ ...row })), error: null });
  const query = {
    select: () => query,
    eq: () => query,
    order: () => query,
    retry: rows,
  };
  const getUser = vi.fn(() =>
    Promise.resolve({ data: { user: { id: user } }, error: null }),
  );
  const client = {
    from: () => query,
    auth: { getUser },
  } as unknown as SupabaseClient<Database>;
  return { page, client, events, purchaseBlook, ledger };
};
afterEach(() => vi.clearAllMocks());
describe('confirmed UI purchase natural-key replay', () => {
  it('replays the original user/blook pair once after confirmation without another debit', async () => {
    const h = make('normal');
    const result = await purchaseEquipFunctional(
      h.page,
      h.client,
      syntheticScope(),
    );
    expect(h.purchaseBlook).toHaveBeenCalledExactlyOnceWith(blook);
    expect(result).toMatchObject({
      purchaseConfirmed: true,
      replayConfirmed: true,
      equipConfirmed: true,
    });
    expect(h.ledger).toHaveLength(2);
    expect(h.events.listenerCount('request')).toBe(0);
  });
  it('accepts the actual canonical seeded natural key and still confirms single-debit replay', async () => {
    const seeded = '50000000-0000-0000-0000-000000000002';
    const h = make('normal', seeded);
    const result = await purchaseEquipFunctional(
      h.page,
      h.client,
      syntheticScope(),
    );
    expect(result.replayConfirmed).toBe(true);
    expect(h.purchaseBlook).toHaveBeenCalledExactlyOnceWith(seeded);
    expect(h.ledger).toHaveLength(2);
  });
  it('a second debit cannot be reported PASS even if the replay RPC returns success', async () => {
    const h = make('double_debit');
    await expect(
      purchaseEquipFunctional(h.page, h.client, syntheticScope()),
    ).rejects.toThrow('FUNCTIONAL_STUDENT_FAILED');
    expect(h.purchaseBlook).toHaveBeenCalledTimes(1);
    expect(h.events.listenerCount('request')).toBe(0);
  });
  it('never replays an uncertain original purchase', async () => {
    const h = make('unknown');
    await expect(
      purchaseEquipFunctional(h.page, h.client, syntheticScope()),
    ).rejects.toThrow('FUNCTIONAL_STUDENT_FAILED');
    expect(h.purchaseBlook).not.toHaveBeenCalled();
    expect(h.events.listenerCount('request')).toBe(0);
  });
  it('does not retain or trust an unknown request body field', async () => {
    const h = make('bad_body');
    let caught: unknown;
    try {
      await purchaseEquipFunctional(h.page, h.client, syntheticScope());
    } catch (error) {
      caught = error;
    }
    expect(caught).toHaveProperty('message', 'FUNCTIONAL_STUDENT_FAILED');
    expect(JSON.stringify(caught)).not.toContain('SYNTHETIC_SECRET');
    expect(h.purchaseBlook).not.toHaveBeenCalled();
  });
});

describe('captured purchase key refuses malformed or out-of-scope requests', () => {
  it.each([
    'malformed',
    'foreign',
    'query',
    'method',
    'token',
    'subject',
    'extra',
    'duplicate',
  ] as const)('rejects %s without trusting arbitrary payload', async (bad) => {
    const events = new EventEmitter();
    const subject = vi.fn(() =>
      Promise.resolve(bad === 'subject' ? 'not-a-user' : user),
    );
    const observer = observeFunctionalPurchase(
      events as unknown as Page,
      syntheticScope(),
      subject,
    );
    const request = {
      method: () => (bad === 'method' ? 'GET' : 'POST'),
      url: () =>
        bad === 'foreign'
          ? 'https://foreign.invalid/rest/v1/rpc/purchase_blook'
          : `http://127.0.0.1:58321/rest/v1/rpc/purchase_blook${bad === 'query' ? '?secret=SYNTHETIC_SECRET' : ''}`,
      postDataJSON: () => ({
        blook_id: bad === 'malformed' ? 'SYNTHETIC_SECRET' : blook,
        ...(bad === 'extra' ? { raw: 'SYNTHETIC_SECRET' } : {}),
      }),
      headerValue: () =>
        Promise.resolve(bad === 'token' ? null : 'Bearer SYNTHETIC_TOKEN'),
    };
    events.emit('request', request);
    if (bad === 'duplicate') events.emit('request', request);
    await expect(observer.key()).rejects.toThrow('FUNCTIONAL_STUDENT_FAILED');
    observer.dispose();
    expect(events.listenerCount('request')).toBe(0);
    if (['foreign', 'query', 'method', 'malformed', 'extra'].includes(bad))
      expect(subject).not.toHaveBeenCalled();
  });
});
