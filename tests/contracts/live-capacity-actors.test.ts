import type { BrowserContext } from '@playwright/test';
import { describe, expect, it, vi } from 'vitest';

import { restrictBrowserToLocal } from '../../scripts/live/capacity-browser-actor';

import {
  assertIndependentActorIdentities,
  isExplicitPermissionDenial,
} from '../../scripts/live/capacity-actors';
import {
  createLocalClient,
  readLocalSecrets,
} from '../../scripts/live/capacity-local-client';
import { parseCapacityConfig } from '../../scripts/live/capacity-config';
import { classifyOutsiderReason } from '../../scripts/live/capacity-outsider-diagnostics';
import { LiveRepositoryError } from '../../src/features/live/types';

const config = parseCapacityConfig(
  ['--run-id', 'c40-actor-contract', '--revision', 'a'.repeat(40)],
  {},
);
describe('independent capacity actor sessions', () => {
  it('rejects shared user identities or JWTs and never includes them in the error', () => {
    expect(() => {
      assertIndependentActorIdentities([
        { userId: 'student-one', accessToken: 'SECRET_ONE' },
        { userId: 'student-two', accessToken: 'SECRET_TWO' },
      ]);
    }).not.toThrow();
    expect(() => {
      assertIndependentActorIdentities([
        { userId: 'student-one', accessToken: 'SECRET_ONE' },
        { userId: 'student-one', accessToken: 'SECRET_TWO' },
      ]);
    }).toThrow('LIVE_CAPACITY_IDENTITY_COLLISION');
    expect(() => {
      assertIndependentActorIdentities([
        { userId: 'student-one', accessToken: 'SECRET_ONE' },
        { userId: 'student-two', accessToken: 'SECRET_ONE' },
      ]);
    }).toThrow('LIVE_CAPACITY_IDENTITY_COLLISION');
  });
  it('creates an independent normal-session client for every actor', async () => {
    const controller = new AbortController();
    const first = createLocalClient(
      config,
      'synthetic-public-key',
      controller.signal,
    );
    const second = createLocalClient(
      config,
      'synthetic-public-key',
      controller.signal,
    );
    expect(first).not.toBe(second);
    expect(first.auth).not.toBe(second.auth);
    expect(first.realtime).not.toBe(second.realtime);
    controller.abort();
    await first.realtime.disconnect();
    await second.realtime.disconnect();
  });
  it('accepts explicit private-topic permission refusal, not transport timeout/auth expiry', () => {
    expect(
      isExplicitPermissionDenial(
        new Error(
          'You do not have permissions to read from this Topic: SECRET_TOPIC',
        ),
      ),
    ).toBe(true);
    expect(isExplicitPermissionDenial(new Error('Unauthorized'))).toBe(true);
    expect(isExplicitPermissionDenial(new Error('timeout'))).toBe(false);
    expect(isExplicitPermissionDenial(new Error('JWT expired'))).toBe(false);
    expect(isExplicitPermissionDenial(new Error('SECRET_UNCLASSIFIED'))).toBe(
      false,
    );
  });
});

it('rejects a management key accidentally supplied as an actor public key', () => {
  expect(() =>
    readLocalSecrets({
      COLORPLAY_LIVE_ANON_KEY: 'sb_secret_MANAGEMENT_MARKER',
      COLORPLAY_LIVE_SERVICE_KEY: 'sb_secret_OTHER_MARKER',
      COLORPLAY_LIVE_TEACHER_PASSWORD: 'SECRET_PASSWORD',
      COLORPLAY_LIVE_CONFIRM: 'LOCAL_LOW_DEVICE_ONLY',
    }),
  ).toThrow('LIVE_CAPACITY_LOCAL_CREDENTIALS_REQUIRED');
  expect(
    readLocalSecrets({
      COLORPLAY_LIVE_ANON_KEY: 'sb_publishable_SYNTHETIC',
      COLORPLAY_LIVE_SERVICE_KEY: 'sb_secret_SYNTHETIC',
      COLORPLAY_LIVE_TEACHER_PASSWORD: 'SECRET_PASSWORD',
      COLORPLAY_LIVE_CONFIRM: 'LOCAL_LOW_DEVICE_ONLY',
    }),
  ).toMatchObject({ anonKey: 'sb_publishable_SYNTHETIC' });
});

it('blocks Hosted HTTP and WebSocket targets even if the served Local app is misconfigured', async () => {
  interface HttpRoute {
    request: () => { url: () => string };
    continue: () => Promise<void>;
    abort: (reason: string) => Promise<void>;
  }
  interface SocketRoute {
    url: () => string;
    connectToServer: () => unknown;
    close: () => Promise<void>;
  }
  let http: ((route: HttpRoute) => Promise<void>) | undefined;
  let socket: ((route: SocketRoute) => Promise<void>) | undefined;
  const context = {
    grantPermissions: vi.fn(() => Promise.resolve()),
    route: vi.fn(
      (_pattern: string, callback: (route: HttpRoute) => Promise<void>) => {
        http = callback;
        return Promise.resolve();
      },
    ),
    routeWebSocket: vi.fn(
      (_pattern: RegExp, callback: (route: SocketRoute) => Promise<void>) => {
        socket = callback;
        return Promise.resolve();
      },
    ),
  } as unknown as BrowserContext;
  await restrictBrowserToLocal(context, config);
  const route = {
    request: () => ({
      url: () => 'https://onkxnkzeixpezetkmocf.supabase.co/auth/v1/token',
    }),
    continue: vi.fn(() => Promise.resolve()),
    abort: vi.fn(() => Promise.resolve()),
  };
  await http?.(route);
  expect(route.abort).toHaveBeenCalledWith('blockedbyclient');
  expect(route.continue).not.toHaveBeenCalled();
  const ws = {
    url: () => 'wss://onkxnkzeixpezetkmocf.supabase.co/realtime/v1/websocket',
    connectToServer: vi.fn(),
    close: vi.fn(() => Promise.resolve()),
  };
  await socket?.(ws);
  expect(ws.close).toHaveBeenCalledOnce();
  expect(ws.connectToServer).not.toHaveBeenCalled();
});

it('does not infer transport from the generic UNAVAILABLE fallback without a concrete cause', () => {
  expect(classifyOutsiderReason(new LiveRepositoryError('UNAVAILABLE'))).toBe(
    'unknown',
  );
  const concrete = new LiveRepositoryError('UNAVAILABLE');
  Object.defineProperty(concrete, 'cause', { value: { code: 'ECONNRESET' } });
  expect(classifyOutsiderReason(concrete)).toBe('transport');
});
