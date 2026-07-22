import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import {
  type BlookInventory,
  type InventoryRepository,
  InventoryRepositoryError,
} from '../types';
import { ToastProvider } from '../../../components/ui/toast';
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
  equipFrame: vi.fn(),
  getFrameInventory: vi.fn(() => new Promise<never>(() => undefined)),
  purchaseFrame: vi.fn(),
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
        <QueryClientProvider client={client}>
          <ToastProvider>{children}</ToastProvider>
        </QueryClientProvider>
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
      await screen.findByRole('heading', { name: '裝備商店' }),
    ).toBeVisible();
    items.forEach(([, , name, , cost]) => {
      expect(screen.getByRole('heading', { name })).toBeVisible();
      expect(screen.getByText(`${String(cost)} Token`)).toBeVisible();
    });
    // 每張卡片以自製 SVG 角色呈現(不再用 emoji 文字)。
    expect(document.querySelectorAll('.blook-card__art svg')).toHaveLength(
      items.length,
    );
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
    const dialog = screen.getByRole('dialog', { name: '購買「旅行蛙」？' });
    expect(dialog).toBeVisible();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: '取消' })).toHaveFocus();
    expect(screen.getByText('將扣除 250 Token。')).toBeVisible();
    await user.click(screen.getByRole('button', { name: '取消' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(purchase).toHaveFocus();

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
      '無法載入裝備商店，請稍後重試。',
    );
    expect(screen.getByRole('button', { name: '重試' })).toBeEnabled();
    expect(screen.queryByText('0 Token 可用')).toBeNull();
  });
});

it('renders the frame shop section with the server catalog', async () => {
  renderShop(
    repository({
      getFrameInventory: vi.fn().mockResolvedValue({
        activeFrameId: '60000000-0000-0000-0000-000000000001',
        items: [
          {
            costTokens: 0,
            equipped: true,
            gradientEnd: '#eab308',
            gradientStart: '#f59e0b',
            id: '60000000-0000-0000-0000-000000000001',
            name: '熔岩流金',
            owned: true,
            stableCode: 'lava_gold',
          },
          {
            costTokens: 25,
            equipped: false,
            gradientEnd: '#0ea5e9',
            gradientStart: '#6366f1',
            id: '60000000-0000-0000-0000-000000000002',
            name: '深海霓虹',
            owned: false,
            stableCode: 'deep_neon',
          },
        ],
        tokenBalance: 75,
      }),
    }),
  );
  expect(
    await screen.findByRole('heading', { name: '尊絕外顯邊框' }),
  ).toBeVisible();
  expect(screen.getByText('熔岩流金')).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: '購買 深海霓虹（25 Token）' }),
  ).toBeInTheDocument();
  expect(
    within(screen.getByRole('region', { name: '尊絕外顯邊框' })).getByText(
      '已裝備',
    ),
  ).toBeInTheDocument();
});
