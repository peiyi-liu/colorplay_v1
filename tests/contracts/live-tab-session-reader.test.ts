import { runInNewContext } from 'node:vm';

import type { Page } from '@playwright/test';
import { describe, expect, it, vi } from 'vitest';

import { createTabScopedAuthStorageKey } from '../../src/lib/supabase/browser-client';
import { sessionTokensFromPage } from '../e2e/helpers/staging-capacity-browser';
import { CapacityHarnessError } from '../e2e/helpers/staging-capacity';

const url = 'http://127.0.0.1:56321';
const tabId = 'synthetic-active-tab';
const tokens = {
  access_token: 'SYNTHETIC_ACCESS_TOKEN_MARKER',
  refresh_token: 'SYNTHETIC_REFRESH_TOKEN_MARKER',
};
const sdkSession = JSON.stringify({
  ...tokens,
  expires_in: 3600,
  expires_at: 1900000000,
  token_type: 'bearer',
  user: { id: 'synthetic-user', email: 'synthetic@invalid.test' },
});
const legacyKey = 'sb-127-auth-token';
const activeKey = `${legacyKey}-${tabId}`;
const createStorage = (entries: [string, string][] = []) => {
  const values = new Map(entries);
  const storage = {
    get length() {
      return values.size;
    },
    key: vi.fn((index: number) => [...values.keys()][index] ?? null),
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      values.delete(key);
    }),
    clear: vi.fn(() => {
      values.clear();
    }),
  } satisfies Storage;
  return { values, storage };
};
// Serialize exactly the supplied callback into a fresh realm: outer closures
// cannot accidentally make this offline Page seam pass.
const pageFor = (storage: Storage): Page =>
  ({
    evaluate: (callback: (...args: never[]) => unknown, argument: unknown) =>
      Promise.resolve(
        runInNewContext(`(${callback.toString()})(argument)`, {
          URL,
          sessionStorage: storage,
          argument,
        }) as unknown,
      ),
  }) as unknown as Page;

const expectReadOnly = (
  storage: ReturnType<typeof createStorage>['storage'],
) => {
  expect(storage.key).not.toHaveBeenCalled();
  expect(storage.setItem).not.toHaveBeenCalled();
  expect(storage.removeItem).not.toHaveBeenCalled();
  expect(storage.clear).not.toHaveBeenCalled();
};
const expectMissing = async (page: Page, expectedUrl = url) => {
  let failure: unknown;
  try {
    await sessionTokensFromPage(page, expectedUrl);
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(CapacityHarnessError);
  if (!(failure instanceof CapacityHarnessError))
    throw new Error('SYNTHETIC_SAFE_ERROR_EXPECTED');
  expect(failure.message).toBe('CAPACITY_BROWSER_SESSION_MISSING');
  expect(failure.publicCode).toBe('CAPACITY_BROWSER_SESSION_MISSING');
  const exposed = JSON.stringify({
    error: failure,
    message: failure.message,
    stack: failure.stack,
  });
  for (const marker of [
    ...Object.values(tokens),
    tabId,
    activeKey,
    'synthetic@invalid.test',
    'SYNTHETIC_STORAGE_SECRET_MARKER',
  ])
    expect(exposed).not.toContain(marker);
};

describe('capacity browser session reader', () => {
  it('reads the real product tab key and SDK session shape through a serialized Page callback', async () => {
    const { values, storage } = createStorage([
      ['colorplay-auth-tab-id', tabId],
    ]);
    const key = createTabScopedAuthStorageKey(url, storage);
    expect(key).toBe('sb-127-auth-token-synthetic-active-tab');
    storage.setItem(key, sdkSession);
    const before = [...values];
    await expect(sessionTokensFromPage(pageFor(storage), url)).resolves.toEqual(
      tokens,
    );
    expect([...values]).toEqual(before);
  });

  it.each([
    ['http://127.0.0.1:56321', 'sb-127-auth-token-synthetic-active-tab'],
    ['http://localhost:56321', 'sb-localhost-auth-token-synthetic-active-tab'],
    ['http://[::1]:56321', 'sb-[::1]-auth-token-synthetic-active-tab'],
    [
      'https://synthetic-project.supabase.invalid',
      'sb-synthetic-project-auth-token-synthetic-active-tab',
    ],
  ])(
    'uses the exact product hostname projectRef rule for %s',
    async (expectedUrl, key) => {
      const { storage } = createStorage([
        ['colorplay-auth-tab-id', tabId],
        [key, sdkSession],
      ]);
      await expect(
        sessionTokensFromPage(pageFor(storage), expectedUrl),
      ).resolves.toEqual(tokens);
      expect(storage.getItem).toHaveBeenCalledTimes(2);
      expect(storage.getItem).toHaveBeenLastCalledWith(key);
      expectReadOnly(storage);
    },
  );

  it('uses only the active tab even when legacy and other sessions are inserted first', async () => {
    const other = JSON.stringify({
      access_token: 'OTHER_ACCESS',
      refresh_token: 'OTHER_REFRESH',
    });
    const { values, storage } = createStorage([
      [legacyKey, other],
      ['sb-foreign-auth-token', other],
      [`sb-foreign-auth-token-${tabId}`, other],
      [`${legacyKey}-other-tab`, other],
      ['colorplay-auth-tab-id', tabId],
      [activeKey, sdkSession],
    ]);
    const before = [...values];
    await expect(sessionTokensFromPage(pageFor(storage), url)).resolves.toEqual(
      tokens,
    );
    expect(storage.getItem).toHaveBeenNthCalledWith(1, 'colorplay-auth-tab-id');
    expect(storage.getItem).toHaveBeenNthCalledWith(2, activeKey);
    expect(storage.getItem).toHaveBeenCalledTimes(2);
    expectReadOnly(storage);
    expect([...values]).toEqual(before);
  });

  it('reads only the expected project exact legacy key when the active ID is absent', async () => {
    const { storage } = createStorage([
      ['sb-foreign-auth-token', '{}'],
      [activeKey, '{}'],
      [legacyKey, sdkSession],
    ]);
    await expect(sessionTokensFromPage(pageFor(storage), url)).resolves.toEqual(
      tokens,
    );
    expect(storage.getItem).toHaveBeenCalledTimes(2);
    expect(storage.getItem).toHaveBeenLastCalledWith(legacyKey);
    expectReadOnly(storage);
  });

  it.each([
    [
      ['colorplay-auth-tab-id', tabId],
      [legacyKey, sdkSession],
    ],
    [
      ['colorplay-auth-tab-id', tabId],
      [`${legacyKey}-other-tab`, sdkSession],
    ],
    [
      ['colorplay-auth-tab-id', tabId],
      [`sb-foreign-auth-token-${tabId}`, sdkSession],
    ],
    [[activeKey, sdkSession]],
    [['sb-foreign-auth-token', sdkSession]],
    [],
  ] satisfies [string, string][][])(
    'never selects another tab or project, nor falls back from an active tab',
    async (...entries) => {
      const { values, storage } = createStorage(entries);
      const before = [...values];
      await expectMissing(pageFor(storage));
      expectReadOnly(storage);
      expect([...values]).toEqual(before);
    },
  );

  it.each(['', ' ', '\t', ' synthetic-active-tab '])(
    'fails closed for an invalid active tab ID without using a valid legacy session',
    async (invalidTab) => {
      const { storage } = createStorage([
        ['colorplay-auth-tab-id', invalidTab],
        [legacyKey, sdkSession],
      ]);
      await expectMissing(pageFor(storage));
      expect(storage.getItem).toHaveBeenCalledTimes(1);
      expectReadOnly(storage);
    },
  );

  it.each([
    '{SYNTHETIC_STORAGE_SECRET_MARKER',
    'null',
    '[]',
    '42',
    'true',
    '"SYNTHETIC_STORAGE_SECRET_MARKER"',
    '{}',
    JSON.stringify({ access_token: tokens.access_token }),
    JSON.stringify({ refresh_token: tokens.refresh_token }),
    JSON.stringify({ ...tokens, access_token: 123 }),
    JSON.stringify({ ...tokens, refresh_token: {} }),
    JSON.stringify({ ...tokens, access_token: '' }),
    JSON.stringify({ ...tokens, refresh_token: '' }),
    JSON.stringify({ ...tokens, access_token: '  ' }),
    JSON.stringify({ ...tokens, refresh_token: '\t' }),
  ])(
    'normalizes invalid scoped session rows without a legacy fallback',
    async (raw) => {
      const { values, storage } = createStorage([
        ['colorplay-auth-tab-id', tabId],
        [activeKey, raw],
        [legacyKey, sdkSession],
      ]);
      const before = [...values];
      await expectMissing(pageFor(storage));
      expect(storage.getItem).toHaveBeenCalledTimes(2);
      expect(storage.getItem).toHaveBeenLastCalledWith(activeKey);
      expectReadOnly(storage);
      expect([...values]).toEqual(before);
    },
  );

  it.each(['null', '{SYNTHETIC_STORAGE_SECRET_MARKER', '{}'])(
    'normalizes invalid legacy rows without looking at a valid scoped session',
    async (raw) => {
      const { storage } = createStorage([
        [activeKey, sdkSession],
        [legacyKey, raw],
      ]);
      await expectMissing(pageFor(storage));
      expect(storage.getItem).toHaveBeenCalledTimes(2);
      expectReadOnly(storage);
    },
  );

  it.each(['colorplay-auth-tab-id', activeKey])(
    'normalizes storage getItem failures for %s',
    async (failingKey) => {
      const { storage } = createStorage([
        ['colorplay-auth-tab-id', tabId],
        [activeKey, sdkSession],
      ]);
      vi.mocked(storage.getItem).mockImplementation((key) => {
        if (key === failingKey)
          throw new Error('SYNTHETIC_STORAGE_SECRET_MARKER');
        return key === 'colorplay-auth-tab-id' ? tabId : sdkSession;
      });
      await expectMissing(pageFor(storage));
      expectReadOnly(storage);
    },
  );

  it('normalizes failure to access the sessionStorage object itself', async () => {
    const page = {
      evaluate: (callback: () => unknown, argument: unknown) => {
        const context = { URL, argument };
        Object.defineProperty(context, 'sessionStorage', {
          get: () => {
            throw new Error('SYNTHETIC_STORAGE_SECRET_MARKER');
          },
        });
        return Promise.resolve(
          runInNewContext(
            `(${callback.toString()})(argument)`,
            context,
          ) as unknown,
        );
      },
    } as unknown as Page;
    await expectMissing(page);
  });

  it('normalizes Page evaluation failures without retaining raw exception details', async () => {
    const page = {
      evaluate: () =>
        Promise.reject(
          new Error(`SYNTHETIC_STORAGE_SECRET_MARKER ${tokens.access_token}`),
        ),
    } as unknown as Page;
    await expectMissing(page);
  });

  it('rejects an invalid expected URL before accessing storage', async () => {
    const { storage } = createStorage([[legacyKey, sdkSession]]);
    await expectMissing(pageFor(storage), 'SYNTHETIC_STORAGE_SECRET_MARKER');
    expect(storage.getItem).not.toHaveBeenCalled();
    expectReadOnly(storage);
  });
});
