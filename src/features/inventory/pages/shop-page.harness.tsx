// DEV/TEST-ONLY. 不得被 src/main.tsx 或 src/app/router/** import。
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Routes } from 'react-router-dom';

import { StudentHudHarness } from '../../../app/shell/student-hud.harness';
import { ToastProvider } from '../../../components/ui/toast';
import type {
  BlookInventory,
  FrameInventory,
  InventoryRepository,
} from '../types';
import { ShopPage } from './shop-page';

const blookInventory: BlookInventory = {
  activeBlookId: '50000000-0000-0000-0000-000000000001',
  items: [
    {
      costTokens: 0,
      emoji: '🦊',
      equipped: true,
      id: '50000000-0000-0000-0000-000000000001',
      name: '小狐狸',
      owned: true,
      stableCode: 'little_fox',
    },
    {
      costTokens: 100,
      emoji: '🐱',
      equipped: false,
      id: '50000000-0000-0000-0000-000000000002',
      name: '招財貓',
      owned: true,
      stableCode: 'lucky_cat',
    },
    {
      costTokens: 250,
      emoji: '🐸',
      equipped: false,
      id: '50000000-0000-0000-0000-000000000003',
      name: '旅行蛙',
      owned: false,
      stableCode: 'travel_frog',
    },
    {
      costTokens: 500,
      emoji: '🦉',
      equipped: false,
      id: '50000000-0000-0000-0000-000000000004',
      name: '智慧鴞',
      owned: false,
      stableCode: 'wise_owl',
    },
  ],
  tokenBalance: 250,
};

const frameInventory: FrameInventory = {
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
  tokenBalance: 250,
};

const repository: InventoryRepository = {
  equipBlook: () => Promise.resolve(blookInventory),
  equipFrame: () => Promise.resolve(frameInventory),
  getFrameInventory: () => Promise.resolve(frameInventory),
  getInventory: () => Promise.resolve(blookInventory),
  purchaseBlook: () => Promise.resolve(blookInventory),
  purchaseFrame: () => Promise.resolve(frameInventory),
};

export function ShopPageHarness() {
  const client = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });

  return (
    <StudentHudHarness initialEntry="/app/shop">
      <QueryClientProvider client={client}>
        <ToastProvider>
          <Routes>
            <Route
              element={<ShopPage repository={repository} />}
              path="/app/shop"
            />
          </Routes>
        </ToastProvider>
      </QueryClientProvider>
    </StudentHudHarness>
  );
}
