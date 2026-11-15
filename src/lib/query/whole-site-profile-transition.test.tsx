import { createClient } from '@supabase/supabase-js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { queryClient as applicationQueryClient } from '../../app/providers/query-client';
import { AuthBootstrap } from '../../features/auth/components/auth-bootstrap';
import { createAuthRepository } from '../../features/auth/api/auth-repository';
import { useAuth } from '../../features/auth/context/auth-context';
import {
  myProfileUserQueryKey,
  useMyProfile,
} from '../../features/profile/hooks/use-my-profile';
import { createBoundedFetch } from '../supabase/browser-client';
import type { Database } from '../../types/database';

const browser = vi.hoisted(() => ({ client: vi.fn() }));
vi.mock('../supabase/browser-client', async (original) => ({
  ...(await original<typeof import('../supabase/browser-client')>()),
  getBrowserSupabaseClient: browser.client,
}));
const a = '81000000-0000-4000-8000-000000000001';
const b = '81000000-0000-4000-8000-000000000002';
let clientIndex = 0;
const cleanups: (() => void)[] = [];
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const flush = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
};
async function setup(stallFirstIdentity = false) {
  const profileCalls: string[] = [];
  const authCalls: string[] = [];
  const releases: (() => void)[] = [];
  const tokens = new Map<string, string>();
  const session = (id: string) => {
    const access = `synthetic.${btoa(JSON.stringify({ sub: id, exp: Math.floor(Date.now() / 1000) + 3600 }))}.synthetic`;
    tokens.set(`Bearer ${access}`, id);
    return {
      access_token: access,
      refresh_token: id === a ? 'synthetic-refresh-a' : 'synthetic-refresh-b',
      token_type: 'bearer',
      expires_in: 3600,
      user: { id, aud: 'authenticated', role: 'authenticated' },
    };
  };
  const profile = (id: string) =>
    new Response(
      JSON.stringify({
        id,
        display_name: 'synthetic',
        role: 'student',
        reduced_motion: false,
        timezone: 'Asia/Taipei',
        login_account: 'synthetic',
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  const transport: typeof fetch = (input, init) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    if (url.includes('/auth/v1/token')) {
      if (typeof init?.body !== 'string')
        throw new Error('SYNTHETIC_BODY_UNEXPECTED');
      const body = JSON.parse(init.body) as {
        email?: string;
        refresh_token?: string;
      };
      const id =
        body.email?.includes('student-b') ||
        body.refresh_token === 'synthetic-refresh-b'
          ? b
          : a;
      authCalls.push(
        url.includes('grant_type=refresh_token') ? 'refresh' : 'login',
      );
      return Promise.resolve(
        new Response(JSON.stringify(session(id)), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }
    if (!url.includes('/rest/v1/profiles'))
      throw new Error('SYNTHETIC_UNEXPECTED_ENDPOINT');
    const id = tokens.get(
      new Headers(init?.headers).get('Authorization') ?? '',
    );
    if (!id) throw new Error('SYNTHETIC_AUTH_HEADER_MISSING');
    profileCalls.push(id);
    if (stallFirstIdentity && id === a)
      return new Promise((resolve) => {
        releases.push(() => {
          resolve(profile(id));
        });
      });
    return Promise.resolve(profile(id));
  };
  const sdk = createClient<Database>(
    'http://127.0.0.1:54321',
    'synthetic-public',
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storageKey: `synthetic-transition-${String(clientIndex++)}`,
      },
      global: { fetch: createBoundedFetch(transport) },
    },
  );
  await sdk.auth.getSession();
  browser.client.mockReturnValue(sdk);
  const repository = createAuthRepository(sdk);
  const query = new QueryClient({
    defaultOptions: applicationQueryClient.getDefaultOptions(),
  });
  function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return (
      <QueryClientProvider client={query}>
        <AuthBootstrap repository={repository}>{children}</AuthBootstrap>
      </QueryClientProvider>
    );
  }
  const hook = renderHook(
    () => ({ auth: useAuth(), first: useMyProfile(), second: useMyProfile() }),
    { wrapper: Wrapper },
  );
  cleanups.push(() => {
    releases.splice(0).forEach((release) => {
      release();
    });
    hook.unmount();
    query.clear();
    void sdk.auth.stopAutoRefresh();
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100);
  });
  const signIn = async (identity: 'a' | 'b') => {
    await act(async () => {
      await hook.result.current.auth.signIn({
        email: `student-${identity}@invalid.test`,
        password: 'synthetic',
      });
    });
    await flush();
  };
  return {
    sdk,
    query,
    hook,
    profileCalls,
    authCalls,
    signIn,
    release: async () => {
      releases.splice(0).forEach((release) => {
        release();
      });
      await flush();
    },
  };
}
it('measures physical profile reads across real SDK login/refresh/switch with two observers', async () => {
  const supplied = await setup();
  expect(supplied.hook.result.current.auth.status).toBe('anonymous');
  expect(supplied.profileCalls).toHaveLength(0);
  await supplied.signIn('a');
  expect(supplied.hook.result.current.first.data?.id).toBe(a);
  expect(supplied.hook.result.current.second.data?.id).toBe(a);
  const afterLogin = supplied.profileCalls.length;
  await act(async () => {
    await supplied.sdk.auth.refreshSession();
  });
  await flush();
  const afterRefresh = supplied.profileCalls.length;
  await supplied.signIn('b');
  expect(supplied.hook.result.current.first.data?.id).toBe(b);
  expect(supplied.hook.result.current.second.data?.id).toBe(b);
  console.info(
    JSON.stringify({
      probe: 'profile-transitions',
      observers: 2,
      anonymous: 0,
      login: afterLogin,
      sameIdentityRefreshExtra: afterRefresh - afterLogin,
      identitySwitchExtra: supplied.profileCalls.length - afterRefresh,
      authHttp: supplied.authCalls.length,
    }),
  );
  expect(afterLogin).toBe(1);
  expect(supplied.profileCalls.length - afterRefresh).toBe(1);
});
it('measures late physical reads without allowing the old identity to replace a switched profile', async () => {
  const supplied = await setup(true);
  await supplied.signIn('a');
  const pendingOldReads = supplied.profileCalls.length;
  expect(pendingOldReads).toBeGreaterThan(0);
  await supplied.signIn('b');
  expect(supplied.hook.result.current.first.data?.id).toBe(b);
  await supplied.release();
  expect(supplied.hook.result.current.first.data?.id).toBe(b);
  expect(supplied.hook.result.current.second.data?.id).toBe(b);
  expect(supplied.query.getQueryData(myProfileUserQueryKey(b))).toMatchObject({
    id: b,
  });
  expect(supplied.query.getQueryData(myProfileUserQueryKey(a))).toBeUndefined();
  console.info(
    JSON.stringify({
      probe: 'profile-late-response',
      observers: 2,
      oldPhysicalReads: pendingOldReads,
      newPhysicalReads: supplied.profileCalls.length - pendingOldReads,
      oldResponseOverwroteNewIdentity: false,
    }),
  );
});
