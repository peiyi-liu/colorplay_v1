import { createClient } from '@supabase/supabase-js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { queryClient as applicationQueryClient } from '../../app/providers/query-client';
import {
  AuthContext,
  type AuthContextValue,
} from '../../features/auth/context/auth-context';
import { createLiveRepository } from '../../features/live/api/live-repository';
import { useLiveActivities } from '../../features/live/hooks/use-live-commands';
import { useMyProfile } from '../../features/profile/hooks/use-my-profile';
import { createEconomyRepository } from '../../features/rewards/api/economy-repository';
import { useEconomySummary } from '../../features/rewards/hooks/use-economy-summary';
import { usePublishedChapters } from '../../features/learning/api/chapters';
import { createTeacherContentRepository } from '../../features/teacher-content/api/teacher-content-repository';
import {
  useTeacherCards,
  useTeacherSubtopics,
} from '../../features/teacher-content/hooks/use-teacher-content';
import { createLearningRepository } from '../../features/learning/api/learning-repository';
import {
  useReviewMedia,
  useReviewProgressRows,
} from '../../features/learning/hooks/use-learning';
import { createBoundedFetch } from '../supabase/browser-client';
import type { Database } from '../../types/database';

const browser = vi.hoisted(() => ({ client: vi.fn() }));
vi.mock('../supabase/browser-client', async (original) => ({
  ...(await original<typeof import('../supabase/browser-client')>()),
  getBrowserSupabaseClient: browser.client,
}));
const authenticated: AuthContextValue = {
  session: { userId: '81000000-0000-4000-8000-000000000001' },
  status: 'authenticated',
  signIn: () => Promise.resolve(),
  signInWithAccount: () => Promise.resolve(),
  signOut: () => Promise.resolve(),
};
const cleanups: (() => void)[] = [];
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
let clientIndex = 0;
type Seam =
  | 'profile'
  | 'rpc'
  | 'storage'
  | 'edge'
  | 'catalog'
  | 'review-progress'
  | 'teacher-cards'
  | 'teacher-subtopics'
  | 'live-activities';
type Failure = number | 'network' | 'timeout';
async function observe(seam: Seam, failure: Failure, random = 0) {
  vi.spyOn(Math, 'random').mockReturnValue(random);
  const started = Date.now();
  const calls: { method: string; time: number }[] = [];
  let aborted = 0;
  let listeners = 0;
  const transport: typeof fetch = (_input, init) => {
    calls.push({ method: init?.method ?? 'GET', time: Date.now() - started });
    if (failure === 'network')
      return Promise.reject(new TypeError('SYNTHETIC_NETWORK_FAILURE'));
    if (failure === 'timeout')
      return new Promise((_resolve, reject) => {
        const signal = init?.signal;
        const abort = () => {
          signal?.removeEventListener('abort', abort);
          listeners -= 1;
          aborted += 1;
          reject(
            signal?.reason instanceof Error
              ? signal.reason
              : new Error('SYNTHETIC_ABORT'),
          );
        };
        signal?.addEventListener('abort', abort, { once: true });
        listeners += 1;
        if (signal?.aborted) abort();
      });
    const code =
      failure === 401
        ? 'PGRST301'
        : failure === 403
          ? '42501'
          : String(failure);
    return Promise.resolve(
      new Response(JSON.stringify({ code, message: 'SYNTHETIC_REJECTION' }), {
        status: failure,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  };
  const sdk = createClient<Database>(
    'http://127.0.0.1:54321',
    'synthetic-public',
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
        storageKey: `synthetic-http-${String(clientIndex++)}`,
      },
      global: { fetch: createBoundedFetch(transport) },
    },
  );
  await sdk.auth.getSession();
  browser.client.mockReturnValue(sdk);
  const query = new QueryClient({
    defaultOptions: applicationQueryClient.getDefaultOptions(),
  });
  function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return (
      <QueryClientProvider client={query}>
        <AuthContext.Provider value={authenticated}>
          {children}
        </AuthContext.Provider>
      </QueryClientProvider>
    );
  }
  const economy = createEconomyRepository(sdk);
  const learning = createLearningRepository(sdk);
  const teacher = createTeacherContentRepository(sdk);
  const hook = renderHook(
    () => {
      switch (seam) {
        case 'profile':
          return useMyProfile();
        case 'live-activities':
          return useLiveActivities(createLiveRepository(sdk));
        case 'catalog':
          return usePublishedChapters();
        case 'review-progress':
          return useReviewProgressRows(learning);
        case 'teacher-cards':
          return useTeacherCards(teacher);
        case 'teacher-subtopics':
          return useTeacherSubtopics(teacher);
        case 'rpc':
          return useEconomySummary(economy);
        case 'storage':
          return useReviewMedia(['review-card-media/synthetic.webp'], learning);
        case 'edge':
          return useReviewMedia(
            ['content-media:81000000-0000-4000-8000-000000000001'],
            learning,
          );
      }
    },
    { wrapper: Wrapper },
  );
  const cleanup = () => {
    hook.unmount();
    query.clear();
    void sdk.auth.stopAutoRefresh();
  };
  cleanups.push(cleanup);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300_000);
  });
  expect(hook.result.current.isError).toBe(true);
  cleanup();
  cleanups.pop();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  const result = {
    seam,
    failure,
    random,
    calls: calls.length,
    methods: [...new Set(calls.map((call) => call.method))],
    times: calls.map((call) => call.time),
    aborted,
    listeners,
    timers: vi.getTimerCount(),
  };
  console.info(JSON.stringify(result));
  return result;
}
describe('true SDK + production bounded fetch + repository/hook HTTP budget', () => {
  it.each([503, 'network', 'timeout'] as const)(
    'profile %s never exceeds the three-read total budget',
    async (failure) => {
      const result = await observe('profile', failure);
      expect(result.listeners).toBe(0);
      expect(result.timers).toBe(0);
      expect(result.calls).toBeLessThanOrEqual(3);
    },
  );
  it.each([
    'catalog',
    'review-progress',
    'teacher-cards',
    'teacher-subtopics',
    'live-activities',
  ] as const)(
    '%s REST503 is bounded by the existing outer three-call budget',
    async (seam) => {
      const result = await observe(seam, 503);
      expect(result.timers).toBe(0);
      expect(result.calls).toBeLessThanOrEqual(3);
    },
  );
  describe.each([
    'profile',
    'catalog',
    'review-progress',
    'teacher-cards',
    'teacher-subtopics',
    'live-activities',
  ] as const)('%s refused REST read', (seam) => {
    it.each([401, 403, 429])('HTTP%i is not repeated', async (status) => {
      const result = await observe(seam, status);
      expect(result.calls).toBe(1);
      expect(result.timers).toBe(0);
    });
  });
  it.each(['catalog', 'live-activities'] as const)(
    '%s physical retry delays include jitter',
    async (seam) => {
      const low = await observe(seam, 503, 0);
      vi.restoreAllMocks();
      const high = await observe(seam, 503, 1);
      expect(low.times).not.toEqual(high.times);
    },
  );
  it('RPC POST503 has only the two outer retries', async () => {
    const result = await observe('rpc', 503);
    expect(result.calls).toBe(3);
    expect(result.methods).toEqual(['POST']);
    expect(result.times).toEqual([0, 250, 750]);
    expect(result.timers).toBe(0);
  });
  it('jitter extremes produce distinct bounded retry delays at the physical HTTP boundary', async () => {
    const low = await observe('rpc', 503, 0);
    vi.restoreAllMocks();
    const high = await observe('rpc', 503, 1);
    expect(low.times).toEqual([0, 250, 750]);
    expect(high.times).toEqual([0, 500, 1500]);
  });
  it.each(['storage', 'edge'] as const)(
    '%s media503 preserves exactly its three-retry exception',
    async (seam) => {
      const result = await observe(seam, 503);
      expect(result.calls).toBe(4);
      expect(result.timers).toBe(0);
    },
  );
});
