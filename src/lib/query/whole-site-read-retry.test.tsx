import type { SupabaseClient } from '@supabase/supabase-js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { queryClient as applicationQueryClient } from '../../app/providers/query-client';
import {
  AuthContext,
  type AuthContextValue,
} from '../../features/auth/context/auth-context';
import { useStudentChapterMap } from '../../features/learning/hooks/use-chapter-map';
import { createEconomyRepository } from '../../features/rewards/api/economy-repository';
import { useEconomySummary } from '../../features/rewards/hooks/use-economy-summary';
import { createLeaderboardRepository } from '../../features/leaderboard/api/leaderboard-repository';
import { useClassroomLeaderboard } from '../../features/leaderboard/hooks/use-classroom-leaderboard';
import { createInventoryRepository } from '../../features/inventory/api/inventory-repository';
import {
  useBlookInventory,
  useFrameInventory,
} from '../../features/inventory/hooks/use-blook-inventory';
import { useMyProfile } from '../../features/profile/hooks/use-my-profile';
import type { Database } from '../../types/database';

const browser = vi.hoisted(() => ({ client: vi.fn() }));
vi.mock('../../lib/config/public-env', () => ({
  parsePublicEnv: () => ({}),
}));
vi.mock('../../lib/supabase/browser-client', () => ({
  getBrowserSupabaseClient: browser.client,
}));

const authenticated: AuthContextValue = {
  session: { userId: 'synthetic-student' },
  status: 'authenticated',
  signIn: () => Promise.resolve(),
  signInWithAccount: () => Promise.resolve(),
  signOut: () => Promise.resolve(),
};
const owned: QueryClient[] = [];
const cleanups: (() => void)[] = [];
const queryWrapper = (queryClient: QueryClient) =>
  function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(AuthContext.Provider, { value: authenticated }, children),
    );
  };

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  for (const client of owned.splice(0)) client.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const seams = [
  'chapter-map',
  'economy',
  'leaderboard',
  'profile',
  'blook',
  'frame',
] as const;
type Seam = (typeof seams)[number];
const classroomId = 'ca000000-0000-4000-8000-000000000001';
const response = (
  status: number,
  code: string,
  message = 'SYNTHETIC_REJECTED',
) => ({
  data: null,
  error: { code, message, details: null, hint: null },
  status,
  statusText: 'SYNTHETIC_STATUS',
});

const observe = async (
  seam: Seam,
  reply:
    ReturnType<typeof response> | { data: null; error: null; status: number },
) => {
  const started = Date.now();
  const times: number[] = [];
  const call = vi.fn(() => {
    times.push(Date.now() - started);
    return Promise.resolve(reply);
  });
  const supabase = {
    rpc: call,
    from: () => ({ select: () => ({ retry: () => ({ single: call }) }) }),
  } as unknown as SupabaseClient<Database>;
  browser.client.mockReturnValue(supabase);
  const economy = createEconomyRepository(supabase);
  const leaderboard = createLeaderboardRepository(supabase);
  const inventory = createInventoryRepository(supabase);
  const queryClient = new QueryClient({
    defaultOptions: applicationQueryClient.getDefaultOptions(),
  });
  owned.push(queryClient);
  const hook = renderHook(
    () => {
      switch (seam) {
        case 'chapter-map':
          return useStudentChapterMap(supabase);
        case 'economy':
          return useEconomySummary(economy);
        case 'leaderboard':
          return useClassroomLeaderboard(classroomId, leaderboard);
        case 'profile':
          return useMyProfile();
        case 'blook':
          return useBlookInventory(inventory);
        case 'frame':
          return useFrameInventory(inventory);
      }
    },
    { wrapper: queryWrapper(queryClient) },
  );
  cleanups.push(hook.unmount);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10_000);
  });
  expect(hook.result.current.isError).toBe(true);
  return { calls: call.mock.calls.length, times };
};

const nonretryable = [
  ['HTTP401_JWT', 401, 'PGRST301'],
  ['HTTP403_PERMISSION', 403, '42501'],
  ['HTTP429_RATE_LIMIT', 429, ''],
  ['HTTP400_VALIDATION', 400, '22023'],
  ['HTTP404_NOT_FOUND', 404, 'PGRST116'],
] as const;
const business: Record<Seam, readonly [number, string, string]> = {
  'chapter-map': [400, 'P0001', 'CHAPTER_LOCKED'],
  economy: [401, 'P0001', 'AUTH_REQUIRED'],
  leaderboard: [404, 'P0001', 'CLASSROOM_NOT_AVAILABLE'],
  profile: [406, 'PGRST116', 'SYNTHETIC_ROW_UNAVAILABLE'],
  blook: [404, 'P0001', 'BLOOK_NOT_FOUND'],
  frame: [404, 'P0001', 'FRAME_NOT_FOUND'],
};

describe.each(seams)(
  '%s real repository → hook → QueryClient read boundary',
  (seam) => {
    it.each(nonretryable)(
      'does not repeat a rejected read: %s',
      async (_label, status, code) => {
        const result = await observe(seam, response(status, code));
        expect(result.calls).toBe(1);
      },
    );

    it('preserves an explicitly known nonretryable business refusal', async () => {
      const result = await observe(seam, response(...business[seam]));
      expect(result.calls).toBe(1);
    });

    it('does not repeat a malformed successful response', async () => {
      const result = await observe(seam, {
        data: null,
        error: null,
        status: 200,
      });
      expect(result.calls).toBe(1);
    });

    it('retries a transient HTTP503 no more than twice', async () => {
      const result = await observe(
        seam,
        response(503, '503', 'SYNTHETIC_SERVICE_UNAVAILABLE'),
      );
      expect(result.calls).toBe(3);
    });

    it('spreads the first actual retry with bounded differing random delays', async () => {
      const random = vi.spyOn(Math, 'random').mockReturnValue(0);
      const low = await observe(seam, response(503, '503'));
      random.mockReturnValue(1);
      const high = await observe(seam, response(503, '503'));
      expect(low.calls).toBe(3);
      expect(high.calls).toBe(3);
      const lowDelay = low.times[1];
      const highDelay = high.times[1];
      expect(lowDelay).toBeGreaterThan(0);
      expect(highDelay).toBeLessThanOrEqual(4000);
      expect(lowDelay).not.toBe(highDelay);
    });
  },
);
