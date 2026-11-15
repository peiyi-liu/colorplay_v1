import { EventEmitter } from 'node:events';
import type { Page } from '@playwright/test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  observeOwnedRefresh,
  assertRevokedRefresh,
} from '../../scripts/concurrency/auth-refresh-observer';
import { syntheticScope } from './helpers/whole-site-functional';
afterEach(() => vi.useRealTimers());
describe('controlled revoked-refresh observation', () => {
  it('observes only real expected-target refresh and releases listener/timer', async () => {
    vi.useFakeTimers();
    const page = new EventEmitter() as EventEmitter & Pick<Page, 'on' | 'off'>;
    const observer = observeOwnedRefresh(page, syntheticScope());
    page.emit('response', {
      url: () =>
        'https://remote.invalid/auth/v1/token?grant_type=refresh_token',
    });
    expect(page.listenerCount('response')).toBe(1);
    const response = {
      url: () =>
        'http://127.0.0.1:58321/auth/v1/token?grant_type=refresh_token',
    };
    page.emit('response', response);
    expect(await observer.response).toBe(response);
    expect(page.listenerCount('response')).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each(['dispose', 'timeout', 'close'])(
    'does not leave a waiter after %s',
    async (mode) => {
      vi.useFakeTimers();
      const page = new EventEmitter() as EventEmitter &
        Pick<Page, 'on' | 'off'>;
      const observer = observeOwnedRefresh(page, syntheticScope());
      if (mode === 'dispose') observer.dispose();
      else if (mode === 'close') page.emit('close');
      else await vi.advanceTimersByTimeAsync(15_000);
      expect(await observer.response).toBeNull();
      expect(page.listenerCount('response')).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    },
  );
  it.each([
    'refresh_token_not_found',
    'refresh_token_already_used',
    'session_not_found',
  ])('accepts explicit revoked error %s', async (error_code) => {
    await expect(
      assertRevokedRefresh({
        status: () => 400,
        json: () => Promise.resolve({ error_code }),
      }),
    ).resolves.toBeUndefined();
  });
  it.each([null, 'invalid_credentials', 'SYNTHETIC_SECRET'])(
    'unknown/validation is not evidence of expiry %#',
    async (error_code) => {
      await expect(
        assertRevokedRefresh({
          status: () => 400,
          json: () => Promise.resolve({ error_code }),
        }),
      ).rejects.toThrow('FUNCTIONAL_AUTH_FAILED');
    },
  );
});

// Public journey seam uses a fresh isolated JS realm and real reader callback;
// no browser/server, session secrets or fake capacity PASS are involved.
describe('controlled expiry public journey', () => {
  it('only changes S2 expiry, calls real refresh observation, and retains no timer/listener', async () => {
    vi.useFakeTimers();
    const { runInNewContext } = await import('node:vm');
    const { controlledRevokedRefresh } =
      await import('../../scripts/concurrency/auth-journey');
    const values = new Map([
      ['colorplay-auth-tab-id', 'synthetic-tab'],
      [
        'sb-127-auth-token-synthetic-tab',
        JSON.stringify({
          access_token: 'SYNTHETIC_ACCESS',
          refresh_token: 'SYNTHETIC_REFRESH',
          expires_at: 9999,
        }),
      ],
      ['sb-127-auth-token-other', 'SYNTHETIC_OTHER_IDENTITY'],
    ]);
    const events = new EventEmitter();
    const page = Object.assign(events, {
      evaluate: (callback: (arg: unknown) => unknown, arg: unknown) =>
        Promise.resolve(
          runInNewContext(`(${callback.toString()})(arg)`, {
            arg,
            URL,
            sessionStorage: {
              getItem: (key: string) => values.get(key) ?? null,
              setItem: (key: string, value: string) => values.set(key, value),
            },
          }) as unknown,
        ),
      reload: () => {
        events.emit('response', {
          url: () =>
            'http://127.0.0.1:58321/auth/v1/token?grant_type=refresh_token',
          status: () => 400,
          json: () =>
            Promise.resolve({ error_code: 'refresh_token_not_found' }),
        });
        return Promise.resolve(null);
      },
      waitForURL: () => Promise.resolve(),
    }) as unknown as Page;
    const signOut = vi.fn().mockResolvedValue({ error: null });
    const getUser = vi.fn().mockResolvedValue({
      error: null,
      data: { user: { id: 'synthetic-id' } },
    });
    const service = {
      auth: { admin: { signOut }, getUser },
    } as unknown as import('@supabase/supabase-js').SupabaseClient<
      import('../../src/types/database').Database
    >;
    const identity = {
      label: 'S2' as const,
      account: 'synthetic',
      email: 'synthetic@colorplay.test',
      password: 'Aa1synthetic',
      replacementPassword: 'Bb2synthetic',
      displayName: '合成',
      userId: 'synthetic-id',
    };
    expect(
      await controlledRevokedRefresh(page, syntheticScope(), identity, service),
    ).toEqual({ mode: 'CONTROLLED_REVOKED_REFRESH', rejected: true });
    expect(signOut).toHaveBeenCalledExactlyOnceWith(
      'SYNTHETIC_ACCESS',
      'global',
    );
    expect(
      JSON.parse(values.get('sb-127-auth-token-synthetic-tab') ?? 'null'),
    ).toEqual({
      access_token: 'SYNTHETIC_ACCESS',
      refresh_token: 'SYNTHETIC_REFRESH',
      expires_at: 1,
    });
    expect(values.get('sb-127-auth-token-other')).toBe(
      'SYNTHETIC_OTHER_IDENTITY',
    );
    expect(events.listenerCount('response')).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    await expect(
      controlledRevokedRefresh(
        page,
        syntheticScope(),
        { ...identity, label: 'S1' },
        service,
      ),
    ).rejects.toThrow('FUNCTIONAL_AUTH_FAILED');
    expect(signOut).toHaveBeenCalledTimes(1);
    getUser.mockResolvedValueOnce({
      error: null,
      data: { user: { id: 'another-owned-identity' } },
    });
    await expect(
      controlledRevokedRefresh(page, syntheticScope(), identity, service),
    ).rejects.toThrow('FUNCTIONAL_AUTH_FAILED');
    expect(signOut).toHaveBeenCalledTimes(1);
    for (const reply of [
      { error: { status: 401 }, data: { user: null } },
      { error: { status: 503 }, data: { user: null } },
      { error: null, data: null },
    ]) {
      getUser.mockResolvedValueOnce(reply);
      await expect(
        controlledRevokedRefresh(page, syntheticScope(), identity, service),
      ).rejects.toThrow('FUNCTIONAL_AUTH_FAILED');
      expect(signOut).toHaveBeenCalledTimes(1);
    }
  });
});
