import type { Browser, BrowserContext } from '@playwright/test';
import { describe, expect, it, vi } from 'vitest';

import {
  createBrowserLiveActor,
  restrictBrowserToLocal,
} from '../../scripts/live/capacity-browser-actor';
import {
  parseCapacityConfig,
  type CapacityConfig,
} from '../../scripts/live/capacity-config';
import { createCapacityReceipt } from '../../scripts/live/capacity-receipt';

const config = parseCapacityConfig(
  ['--profile', 'browser', '--revision', 'a'.repeat(40)],
  {},
);
const makeContext = () => ({
  grantPermissions: vi.fn(() => Promise.resolve()),
  route: vi.fn(() => Promise.resolve()),
  routeWebSocket: vi.fn(() => Promise.resolve()),
  newPage: vi.fn(() => Promise.reject(new Error('SYNTHETIC_PAGE_SENTINEL'))),
});

describe('Local network permission stays scoped to the approved browser origin', () => {
  it.each(['127.0.0.1', 'localhost', '[::1]'])(
    'grants only the exact App origin for %s under existing Local policy',
    async (host) => {
      const context = makeContext();
      const local = {
        ...config,
        appUrl: `http://${host}:56373`,
        supabaseUrl: `http://${host}:56321`,
        databaseUrl: `postgresql://synthetic@${host}:56322/postgres`,
      };
      await restrictBrowserToLocal(context as unknown as BrowserContext, local);
      expect(context.grantPermissions).toHaveBeenCalledExactlyOnceWith(
        ['local-network-access'],
        { origin: `http://${host}:56373` },
      );
      expect(context.route).toHaveBeenCalledOnce();
      expect(context.routeWebSocket).toHaveBeenCalledOnce();
    },
  );

  it.each([
    { environment: 'staging' },
    { environment: undefined },
    { appUrl: 'https://staging.colorplayapp.com' },
    { appUrl: 'http://192.168.1.8:56373' },
    { supabaseUrl: 'https://synthetic.supabase.invalid:443' },
    { supabaseUrl: 'http://192.168.1.8:56321' },
    { appUrl: 'not-a-url' },
    { supabaseUrl: 'not-a-url' },
    { appUrl: undefined },
    { supabaseUrl: undefined },
    { appUrl: 'https://localhost:56373' },
    { appUrl: 'http://localhost' },
    { appUrl: 'http://localhost:56373/path' },
    { appUrl: 'http://localhost:56373?synthetic=1' },
    { appUrl: 'http://synthetic@localhost:56373' },
    { appUrl: 'http://localhost:56373#synthetic' },
    { supabaseUrl: 'http://localhost:56321/rpc' },
    { supabaseUrl: 'http://localhost:56321?synthetic=1' },
    { supabaseUrl: 'http://synthetic@localhost:56321' },
    { databaseUrl: 'postgresql://synthetic@remote.invalid:56322/postgres' },
    { databaseUrl: 'postgresql://localhost:56322/postgres' },
    { databaseUrl: 'postgresql://synthetic@localhost:56322/other' },
    { databaseUrl: 'not-a-url' },
  ])(
    'rejects missing or invalid execution scope before any permission or route installation',
    async (patch) => {
      const context = makeContext();
      await expect(
        restrictBrowserToLocal(
          context as unknown as BrowserContext,
          { ...config, ...patch } as CapacityConfig,
        ),
      ).rejects.toThrow();
      expect(context.grantPermissions).not.toHaveBeenCalled();
      expect(context.route).not.toHaveBeenCalled();
      expect(context.routeWebSocket).not.toHaveBeenCalled();
    },
  );

  it('propagates a rejected permission without retrying or proceeding', async () => {
    const context = makeContext();
    const denied = new Error('SYNTHETIC_PERMISSION_UNSUPPORTED');
    context.grantPermissions.mockRejectedValue(denied);
    await expect(
      restrictBrowserToLocal(context as unknown as BrowserContext, config),
    ).rejects.toBe(denied);
    expect(context.grantPermissions).toHaveBeenCalledOnce();
    expect(context.route).not.toHaveBeenCalled();
    expect(context.routeWebSocket).not.toHaveBeenCalled();
  });

  it('fails closed when the browser does not support the permission API', async () => {
    const context = { ...makeContext(), grantPermissions: undefined };
    await expect(
      restrictBrowserToLocal(context as unknown as BrowserContext, config),
    ).rejects.toThrow();
    expect(context.route).not.toHaveBeenCalled();
  });

  it('awaits the scoped grant before creating the actor Page or navigating', async () => {
    const context = makeContext();
    let grant: (() => void) | undefined;
    context.grantPermissions.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          grant = resolve;
        }),
    );
    const browser = {
      newContext: () => Promise.resolve(context),
    } as unknown as Browser;
    const evidence = createCapacityReceipt(config, 'a'.repeat(40)).actors[0];
    if (!evidence) throw new Error('SYNTHETIC_ACTOR_MISSING');
    const actor = createBrowserLiveActor(
      browser,
      config,
      {
        anonKey: 'synthetic-public',
        serviceKey: 'synthetic-admin',
        teacherPassword: 'synthetic-password',
      },
      {
        role: 'teacher',
        account: 'synthetic',
        email: 'synthetic@invalid.test',
        displayName: 'synthetic',
        password: 'synthetic-password',
      },
      new AbortController().signal,
      evidence,
      () => undefined,
    );
    const failed = expect(actor).rejects.toThrow('SYNTHETIC_PAGE_SENTINEL');
    await vi.waitFor(() => {
      expect(context.grantPermissions).toHaveBeenCalledOnce();
    });
    expect(context.newPage).not.toHaveBeenCalled();
    expect(context.route).not.toHaveBeenCalled();
    grant?.();
    await failed;
    expect(context.newPage).toHaveBeenCalledOnce();
  });
});
