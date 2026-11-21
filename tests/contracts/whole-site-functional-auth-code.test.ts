import type { CDPSession } from '@playwright/test';
import { describe, expect, it, vi } from 'vitest';
import { readOwnFunctionalAuthCode } from '../../scripts/concurrency/functional-auth-code';
import { readFunctionalAuthCode } from '../../scripts/concurrency/functional-auth-observation';
import { assertRevokedRefresh } from '../../scripts/concurrency/auth-refresh-observer';
describe('shared exact own auth aliases, never error/cause traversal', () => {
  it.each([
    'refresh_token_not_found',
    'refresh_token_already_used',
    'session_not_found',
  ])('shares legacy/modern/compatible %s interpretation', async (code) => {
    for (const body of [
      { code },
      { error_code: code },
      { code, error_code: code },
      { code: 400, error_code: code },
    ]) {
      expect(readOwnFunctionalAuthCode(body)).toBe(code);
      await expect(
        assertRevokedRefresh({
          status: () => 400,
          json: () => Promise.resolve(body),
        }),
      ).resolves.toBeUndefined();
      const cdp = {
        send: () =>
          Promise.resolve({ body: JSON.stringify(body), base64Encoded: false }),
      } as unknown as CDPSession;
      expect(await readFunctionalAuthCode(cdp, 'synthetic')).toBe(code);
    }
  });
  it.each([
    null,
    [],
    'session_not_found',
    { code: 'unknown' },
    { code: 400 },
    { error_code: 'session_not_found', code: 'refresh_token_not_found' },
    { code: 'session_not_found', error_code: null },
    { code: { value: 'session_not_found' } },
    { code: NaN, error_code: 'session_not_found' },
    { error_code: 'x'.repeat(81) },
  ])('rejects malformed/unknown/conflicting aliases %#', async (body) => {
    expect(readOwnFunctionalAuthCode(body)).toBeNull();
    await expect(
      assertRevokedRefresh({
        status: () => 400,
        json: () => Promise.resolve(body),
      }),
    ).rejects.toThrow('FUNCTIONAL_AUTH_FAILED');
  });
  it('does not invoke getters or accept inherited aliases', async () => {
    const getter = vi.fn(() => 'session_not_found');
    const bodies: unknown[] = [
      Object.create({ code: 'session_not_found' }),
      Object.defineProperty({}, 'code', { get: getter }),
      Object.defineProperty({ code: 'session_not_found' }, 'error_code', {
        get: getter,
      }),
    ];
    for (const body of bodies) {
      expect(readOwnFunctionalAuthCode(body)).toBeNull();
      await expect(
        assertRevokedRefresh({
          status: () => 403,
          json: () => Promise.resolve(body),
        }),
      ).rejects.toThrow('FUNCTIONAL_AUTH_FAILED');
    }
    expect(getter).not.toHaveBeenCalled();
    expect(
      readOwnFunctionalAuthCode(
        Object.assign(Object.create(null) as object, {
          code: 'session_not_found',
        }),
      ),
    ).toBe('session_not_found');
  });
  it.each([200, 204, 429, 500, 503])(
    'known code cannot override HTTP%i',
    async (status) => {
      await expect(
        assertRevokedRefresh({
          status: () => status,
          json: () => Promise.resolve({ code: 'session_not_found' }),
        }),
      ).rejects.toThrow('FUNCTIONAL_AUTH_FAILED');
    },
  );
});
