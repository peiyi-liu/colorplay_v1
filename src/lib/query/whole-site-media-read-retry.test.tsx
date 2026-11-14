import {
  FunctionsHttpError,
  StorageApiError,
  type SupabaseClient,
} from '@supabase/supabase-js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { queryClient as applicationQueryClient } from '../../app/providers/query-client';
import { createLearningRepository } from '../../features/learning/api/learning-repository';
import { useReviewMedia } from '../../features/learning/hooks/use-learning';
import type { Database } from '../../types/database';

const clients: QueryClient[] = [];
const cleanups: (() => void)[] = [];
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  for (const client of clients.splice(0)) client.clear();
  vi.useRealTimers();
});
const wrapper = (client: QueryClient) =>
  function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return createElement(QueryClientProvider, { client }, children);
  };

const observe = async (
  transport: 'storage' | 'edge',
  status: number,
  storageCode = String(status),
) => {
  const error =
    transport === 'storage'
      ? new StorageApiError('SYNTHETIC_STORAGE_FAILURE', status, storageCode)
      : new FunctionsHttpError(new Response(null, { status }));
  const call = vi.fn(() => Promise.resolve({ data: null, error }));
  const supabase = {
    storage: { from: () => ({ createSignedUrls: call }) },
    functions: { invoke: call },
  } as unknown as SupabaseClient<Database>;
  const client = new QueryClient({
    defaultOptions: applicationQueryClient.getDefaultOptions(),
  });
  clients.push(client);
  const repository = createLearningRepository(supabase);
  const asset =
    transport === 'storage'
      ? 'review-card-media/synthetic.webp'
      : 'content-media:76000000-0000-4000-8000-000000000001';
  const hook = renderHook(() => useReviewMedia([asset], repository), {
    wrapper: wrapper(client),
  });
  cleanups.push(hook.unmount);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10_000);
  });
  expect(hook.result.current.isError).toBe(true);
  return call.mock.calls.length;
};

describe.each(['storage', 'edge'] as const)(
  '%s media real repository → hook read boundary',
  (transport) => {
    it.each([401, 403, 429])(
      'does not repeat a refused HTTP%i read',
      async (status) => {
        expect(await observe(transport, status)).toBe(1);
      },
    );
    it('preserves the existing three-retry exception for transient HTTP503', async () => {
      expect(await observe(transport, 503)).toBe(4);
    });
  },
);

it.each([401, 403, 429])(
  'does not retry Storage HTTP%i when its provider code is symbolic',
  async (status) => {
    expect(await observe('storage', status, 'SYNTHETIC_STORAGE_CODE')).toBe(1);
  },
);
