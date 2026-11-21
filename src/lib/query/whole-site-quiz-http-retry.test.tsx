import { createClient } from '@supabase/supabase-js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryClient as applicationQueryClient } from '../../app/providers/query-client';
import { createQuizRepository } from '../../features/quiz/api/quiz-repository';
import { QuizSessionPage } from '../../features/quiz/pages/quiz-session';
import { QuizResultPage } from '../../features/quiz/pages/quiz-result';
import { createBoundedFetch } from '../supabase/browser-client';
import type { Database } from '../../types/database';

const browser = vi.hoisted(() => ({ client: vi.fn() }));
vi.mock('../supabase/browser-client', async (original) => ({
  ...(await original<typeof import('../supabase/browser-client')>()),
  getBrowserSupabaseClient: browser.client,
}));
const cleanups: (() => void)[] = [];
let clientIndex = 0;
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
async function observe(page: 'session' | 'result', status: number, random = 0) {
  vi.spyOn(Math, 'random').mockReturnValue(random);
  const started = Date.now();
  const times: number[] = [];
  const transport: typeof fetch = (input) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const target = url.includes('/rest/v1/quiz_session_question_state');
    if (target) times.push(Date.now() - started);
    // Result-page wallet/achievement reads are real but not part of the measured REST endpoint.
    const responseStatus = target ? status : 503;
    return Promise.resolve(
      new Response(
        JSON.stringify({
          code:
            responseStatus === 401
              ? 'PGRST301'
              : responseStatus === 403
                ? '42501'
                : String(responseStatus),
          message: 'SYNTHETIC_REJECTION',
        }),
        {
          status: responseStatus,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );
  };
  const sdk = createClient<Database>(
    'http://127.0.0.1:54321',
    'synthetic-public',
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storageKey: `synthetic-quiz-http-${String(clientIndex++)}`,
      },
      global: { fetch: createBoundedFetch(transport) },
    },
  );
  await sdk.auth.getSession();
  browser.client.mockReturnValue(sdk);
  const repository = createQuizRepository(sdk);
  const query = new QueryClient({
    defaultOptions: applicationQueryClient.getDefaultOptions(),
  });
  const router = createMemoryRouter(
    [
      {
        path: '/quiz/:sessionId',
        element:
          page === 'session' ? (
            <QuizSessionPage repository={repository} />
          ) : (
            <QuizResultPage repository={repository} />
          ),
      },
    ],
    {
      initialEntries: ['/quiz/81000000-0000-4000-8000-000000000001'],
    },
  );
  const view = render(
    <QueryClientProvider client={query}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  const cleanup = () => {
    view.unmount();
    router.dispose();
    query.clear();
    void sdk.auth.stopAutoRefresh();
  };
  cleanups.push(cleanup);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300_000);
  });
  const request = query
    .getQueryCache()
    .find({ queryKey: ['quiz', 'session'], exact: false });
  expect(request?.state.status).toBe('error');
  cleanup();
  cleanups.pop();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  const result = {
    seam: `quiz-${page}`,
    status,
    random,
    calls: times.length,
    times,
    timers: vi.getTimerCount(),
  };
  console.info(JSON.stringify(result));
  return result;
}
describe.each(['session', 'result'] as const)(
  'real Quiz %s page HTTP budget',
  (page) => {
    it.each([401, 403, 429])(
      'does not repeat a refused HTTP%i read',
      async (status) => {
        const result = await observe(page, status);
        expect(result.calls).toBe(1);
        expect(result.timers).toBe(0);
      },
    );
    it('allows only two retries for HTTP503', async () => {
      const result = await observe(page, 503);
      expect(result.calls).toBeLessThanOrEqual(3);
      expect(result.timers).toBe(0);
    });
    it('uses bounded differing jitter delays', async () => {
      const low = await observe(page, 503, 0);
      vi.restoreAllMocks();
      const high = await observe(page, 503, 1);
      expect(low.times).not.toEqual(high.times);
    });
  },
);
