import type { Page } from '@playwright/test';
import { describe, expect, it, vi } from 'vitest';
import { signInAdmin, enrollAdminTotp } from '../e2e/helpers/admin';
import { adminRoleDenials } from '../../scripts/concurrency/admin-journey';
import {
  syntheticScope,
  syntheticSecrets,
} from './helpers/whole-site-functional';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../src/types/database';
const factor = 'JBSWY3DPEHPK3PXP';
describe('actual Admin helper selectors and refusal destination', () => {
  it('uses the password input exact label without matching its visibility toggle', async () => {
    const fill = vi.fn(() => Promise.resolve());
    const page = {
      goto: vi.fn(() => Promise.resolve()),
      waitForURL: vi.fn(() => Promise.resolve()),
      getByText: () => ({ click: () => Promise.resolve() }),
      getByRole: () => ({ fill, click: () => Promise.resolve() }),
      getByLabel: (name: string, options?: { exact: boolean }) => {
        if (name !== '密碼' || !options?.exact)
          throw new Error('SYNTHETIC_AMBIGUOUS_PASSWORD');
        return { fill };
      },
    } as unknown as Page;
    await signInAdmin(page, {
      email: 'syntheticaccount',
      password: 'SYNTHETIC_PRIVATE',
    });
    expect(fill).toHaveBeenCalledTimes(2);
  });
  it('opens the real accessible details before reading the enrollment factor', async () => {
    let opened = false;
    const events: string[] = [];
    const secret = {
      _apiName: 'Locator',
      _expect: () => {
        if (!opened)
          return Promise.resolve({
            matches: false,
            received: 'hidden',
            log: [],
          });
        return Promise.resolve({ matches: true, received: 'visible', log: [] });
      },
      textContent: () => {
        if (!opened) throw new Error('SYNTHETIC_DETAILS_CLOSED');
        events.push('secret');
        return Promise.resolve(factor);
      },
    };
    const page = {
      getByTestId: () => secret,
      getByText: (name: string, options?: { exact: boolean }) => {
        expect(name).toBe('無法掃描？顯示文字密鑰');
        expect(options?.exact).toBe(true);
        return {
          click: () => {
            opened = true;
            events.push('details');
            return Promise.resolve();
          },
        };
      },
      locator: () => ({ fill: () => Promise.resolve() }),
      getByRole: () => ({
        click: () => {
          events.push('confirm');
          return Promise.resolve();
        },
      }),
      waitForURL: () => Promise.resolve(),
    } as unknown as Page;
    expect(await enrollAdminTotp(page)).toBe(factor);
    expect(events).toEqual(['details', 'secret', 'confirm']);
  });
  it.each(['S1', 'T1'] as const)(
    'keeps %s UI /unauthorized separate from subject-bound wire denial',
    async (label) => {
      const expectedId = '11000000-0000-4000-8000-000000000001';
      const client = {
        auth: {
          getUser: () =>
            Promise.resolve({
              data: { user: { id: expectedId } },
              error: null,
            }),
          getSession: () =>
            Promise.resolve({
              data: { session: { access_token: 'SYNTHETIC_TOKEN' } },
              error: null,
            }),
        },
      } as unknown as SupabaseClient<Database>;
      const request = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        Response.json({
          outcome: 'denied',
          code: 'STALE_PRIVILEGED_SESSION',
        }),
      );
      const waits: RegExp[] = [];
      const page = {
        goto: () => Promise.resolve(),
        waitForURL: (pattern: RegExp) => {
          waits.push(pattern);
          if (!pattern.test('http://127.0.0.1:58373/unauthorized'))
            return Promise.reject(new Error('SYNTHETIC_WRONG_DESTINATION'));
          return Promise.resolve();
        },
      } as unknown as Page;
      try {
        expect(
          await adminRoleDenials(
            page,
            client,
            {
              label,
              userId: expectedId,
              account: 'synthetic',
              email: 'synthetic@colorplay.test',
              password: 'synthetic',
              replacementPassword: 'synthetic',
              displayName: '合成',
            },
            syntheticScope(),
            syntheticSecrets,
            new AbortController().signal,
          ),
        ).toMatchObject({ uiDenied: true, sensitiveReadDenied: true });
        expect(waits).toHaveLength(1);
      } finally {
        request.mockRestore();
      }
    },
  );
});
