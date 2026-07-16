import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import {
  type BlookInventory,
  type InventoryRepository,
  InventoryRepositoryError,
} from '../types';
import { ShopPage } from './shop-page';

const items = [
  ['50000000-0000-0000-0000-000000000001', 'little_fox', '小狐狸', '🦊', 0],
  ['50000000-0000-0000-0000-000000000002', 'lucky_cat', '招財貓', '🐱', 100],
  ['50000000-0000-0000-0000-000000000003', 'travel_frog', '旅行蛙', '🐸', 250],
  ['50000000-0000-0000-0000-000000000004', 'wise_owl', '智慧鴞', '🦉', 500],
  [
    '50000000-0000-0000-0000-000000000005',
    'primary_lion',
    '原色獅',
    '🦁',
    1000,
  ],
  [
    '50000000-0000-0000-0000-000000000006',
    'rainbow_horse',
    '彩虹馬',
    '🦄',
    2000,
  ],
] as const;

const inventory = (
  overrides: Partial<BlookInventory> = {},
): BlookInventory => ({
  activeBlookId: items[0][0],
  items: items.map(([id, stableCode, name, emoji, costTokens], index) => ({
    costTokens,
    emoji,
    equipped: index === 0,
    id,
    name,
    owned: index < 2,
    stableCode,
  })),
  tokenBalance: 250,
  ...overrides,
});

const repository = (
  overrides: Partial<InventoryRepository> = {},
): InventoryRepository => ({
  equipBlook: vi.fn().mockResolvedValue(inventory()),
  getInventory: vi.fn().mockResolvedValue(inventory()),
  purchaseBlook: vi.fn().mockResolvedValue(inventory()),
  ...overrides,
});

const renderShop = (shopRepository: InventoryRepository) => {
  const client = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });
  function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return (
      <MemoryRouter>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </MemoryRouter>
    );
  }
  render(<ShopPage repository={shopRepository} />, { wrapper: Wrapper });
  return client;
};

describe('ShopPage', () => {
  it('renders six authoritative cards with exactly one state or action each', async () => {
    renderShop(repository());

    expect(
      await screen.findByRole('heading', { name: 'Blook 商店' }),
    ).toBeVisible();
    items.forEach(([, , name, emoji, cost]) => {
      expect(screen.getByRole('heading', { name })).toBeVisible();
      expect(screen.getByText(emoji)).toBeVisible();
      expect(screen.getByText(`${String(cost)} Token`)).toBeVisible();
    });
    expect(screen.getAllByText('已裝備')).toHaveLength(1);
    expect(screen.getByRole('button', { name: '選用 招財貓' })).toBeEnabled();
    expect(
      screen.getByRole('button', { name: '購買 旅行蛙，250 Token' }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: '還差 750 Token，無法購買 原色獅' }),
    ).toBeDisabled();
  });

  it('supports cancel, Escape, confirmation, and authoritative purchase success', async () => {
    const purchased = inventory({
      items: inventory().items.map((item) =>
        item.stableCode === 'travel_frog' ? { ...item, owned: true } : item,
      ),
      tokenBalance: 0,
    });
    const purchaseBlook = vi.fn().mockResolvedValue(purchased);
    renderShop(repository({ purchaseBlook }));
    const user = userEvent.setup();
    const purchase = await screen.findByRole('button', {
      name: '購買 旅行蛙，250 Token',
    });

    await user.click(purchase);
    expect(
      screen.getByRole('dialog', { name: '購買「旅行蛙」？' }),
    ).toBeVisible();
    expect(screen.getByText('將扣除 250 Token。')).toBeVisible();
    await user.click(screen.getByRole('button', { name: '取消' }));
    expect(screen.queryByRole('dialog')).toBeNull();

    await user.click(purchase);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();

    await user.click(purchase);
    await user.click(screen.getByRole('button', { name: '確認購買' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      '已購買旅行蛙。',
    );
    expect(purchaseBlook).toHaveBeenCalledWith(items[2][0]);
    expect(screen.getByRole('button', { name: '選用 旅行蛙' })).toBeEnabled();
    expect(screen.getByText('0 Token 可用')).toBeVisible();
  });

  it('equips an owned Blook from the returned server snapshot without a charge', async () => {
    const equipped = inventory({
      activeBlookId: items[1][0],
      items: inventory().items.map((item) => ({
        ...item,
        equipped: item.stableCode === 'lucky_cat',
      })),
    });
    const equipBlook = vi.fn().mockResolvedValue(equipped);
    renderShop(repository({ equipBlook }));

    await userEvent.click(
      await screen.findByRole('button', { name: '選用 招財貓' }),
    );

    expect(await screen.findByRole('status')).toHaveTextContent(
      '已裝備招財貓。',
    );
    expect(equipBlook).toHaveBeenCalledWith(items[1][0]);
    expect(screen.getAllByText('已裝備')).toHaveLength(1);
    expect(screen.getByText('250 Token 可用')).toBeVisible();
  });

  it('retains the snapshot and reports the exact server shortfall after a rejected purchase', async () => {
    const purchaseBlook = vi
      .fn()
      .mockRejectedValue(
        new InventoryRepositoryError('INSUFFICIENT_TOKENS', 100),
      );
    renderShop(repository({ purchaseBlook }));
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', {
        name: '購買 旅行蛙，250 Token',
      }),
    );
    await user.click(screen.getByRole('button', { name: '確認購買' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Token 不足，還差 100 Token。',
    );
    expect(screen.getByText('250 Token 可用')).toBeVisible();
    expect(
      screen.getByRole('button', { name: '購買 旅行蛙，250 Token' }),
    ).toBeEnabled();
  });

  it('shows a disabled pending confirmation until the command resolves', async () => {
    let resolvePurchase!: (value: BlookInventory) => void;
    const purchaseBlook = vi.fn(
      () =>
        new Promise<BlookInventory>((resolve) => {
          resolvePurchase = resolve;
        }),
    );
    const shopRepository = repository({ purchaseBlook });
    const user = userEvent.setup();
    renderShop(shopRepository);
    await user.click(
      await screen.findByRole('button', {
        name: '購買 旅行蛙，250 Token',
      }),
    );
    await user.click(screen.getByRole('button', { name: '確認購買' }));
    expect(screen.getByRole('button', { name: '購買中…' })).toBeDisabled();
    resolvePurchase(inventory());
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('shows a non-blocking loading state', () => {
    renderShop(
      repository({
        getInventory: vi.fn(() => new Promise<BlookInventory>(() => undefined)),
      }),
    );

    expect(screen.getByRole('status', { name: '頁面載入中' })).toBeVisible();
  });

  it('shows a recoverable query failure without fabricated inventory', async () => {
    renderShop(
      repository({
        getInventory: vi
          .fn()
          .mockRejectedValue(new InventoryRepositoryError('NOT_FOUND')),
      }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '無法載入 Blook 商店，請稍後重試。',
    );
    expect(screen.getByRole('button', { name: '重試' })).toBeEnabled();
    expect(screen.queryByText('0 Token 可用')).toBeNull();
  });
});
