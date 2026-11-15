import type { BrowserContext, Page } from '@playwright/test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as lifecycle from '../../scripts/concurrency/auth-tab-lifecycle';
import * as runtime from '../../scripts/concurrency/local-runtime';
import { authIsolationJourney } from '../../scripts/concurrency/auth-journey';
import {
  syntheticScope,
  syntheticSecrets,
} from './helpers/whole-site-functional';
const identity = (label: 'S1' | 'S2') => ({
  label,
  userId: label,
  displayName: label,
  account: 'synthetic',
  email: 'synthetic@colorplay.test',
  password: 'SYNTHETIC_SECRET',
  replacementPassword: 'SYNTHETIC_SECRET',
});
afterEach(() => vi.restoreAllMocks());
describe('actual auth isolation actions with real SDK missing-session translation', () => {
  it.each(['session_not_found', 'bad_jwt', 'unknown', 'valid_user'] as const)(
    'accepts only official missing-session result: %s',
    async (code) => {
      const scope = syntheticScope();
      const make = runtime.createFunctionalClient;
      const fetcher = vi.fn<typeof fetch>(() =>
        Promise.resolve(
          new Response(
            JSON.stringify(
              code === 'valid_user'
                ? { id: 'synthetic-subject' }
                : {
                    error_code: code,
                    msg: 'SYNTHETIC_PROVIDER_SECRET',
                  },
            ),
            {
              status: code === 'valid_user' ? 200 : 403,
              headers: { 'Content-Type': 'application/json' },
            },
          ),
        ),
      );
      const client = make(
        scope,
        syntheticSecrets.anonKey,
        new AbortController().signal,
        fetcher,
      );
      vi.spyOn(runtime, 'createFunctionalClient').mockReturnValueOnce(client);
      const locator = {
        constructor: { name: 'Locator' },
        _apiName: 'Locator',
        _expect: () =>
          Promise.resolve({ matches: true, received: 'visible', log: [] }),
      };
      const page = {
        url: () => `${scope.appUrl}/login`,
        waitForURL: () => Promise.resolve(),
        getByRole: vi.fn(() => locator),
        evaluate: () =>
          Promise.reject(Error('CAPACITY_BROWSER_SESSION_MISSING')),
      };
      vi.spyOn(lifecycle, 'runFunctionalTabLifecycle').mockImplementationOnce(
        async (_context, _signal, s1, _s2, actions) => {
          const result = await actions.clearSharedRevoked(
            page as unknown as Page,
            s1,
            'SYNTHETIC_OWNED_TOKEN',
          );
          expect(result).toBe('anonymous');
          return {
            reload: true,
            switch: true,
            independentTabs: true,
            sharedOpenerSessionRevoked: true,
            sourceUiBeforeClear: result,
            copiedOpenerIsolation: true,
            freshTabUnauthenticated: true,
          };
        },
      );
      const operation = authIsolationJourney(
        {} as BrowserContext,
        scope,
        syntheticSecrets,
        new AbortController().signal,
        identity('S1'),
        identity('S2'),
      );
      if (code === 'session_not_found')
        await expect(operation).resolves.toMatchObject({
          sharedOpenerSessionRevoked: true,
        });
      else {
        await expect(operation).rejects.toThrow('FUNCTIONAL_AUTH_FAILED');
        expect(page.getByRole).not.toHaveBeenCalled();
      }
      expect(fetcher).toHaveBeenCalledTimes(1);
      await client.auth.stopAutoRefresh();
    },
  );
});
