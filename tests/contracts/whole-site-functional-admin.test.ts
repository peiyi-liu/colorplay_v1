import type { Page } from '@playwright/test';
import { describe, expect, it, vi } from 'vitest';
import { adminMfaThroughUi } from '../../scripts/concurrency/admin-journey';
import { assertAdminDenied } from '../../scripts/concurrency/admin-denials';
const identity = {
  label: 'A1' as const,
  userId: 'synthetic',
  account: 'synthetic',
  email: 'synthetic@colorplay.test',
  password: 'Aa1synthetic',
  replacementPassword: 'Bb2synthetic',
  displayName: '合成',
};
describe('Admin true MFA orchestration and denial proof', () => {
  it('requires enrollment then challenge, retaining its secret only in the private journal', async () => {
    const events: string[] = [];
    const privateWrites: unknown[] = [];
    const secret = 'SYNTHETIC_SECRET_MARKER';
    const result = await adminMfaThroughUi(
      { waitForURL: () => Promise.resolve() } as unknown as Page,
      identity,
      {
        directory: 'synthetic',
        write: (name, value) => {
          events.push(name);
          privateWrites.push(value);
          return Promise.resolve();
        },
      },
      {
        login: () => {
          events.push('login');
          return Promise.resolve();
        },
        enroll: () => {
          events.push('enroll');
          return Promise.resolve(secret);
        },
        challenge: (_page, value) => {
          expect(value).toBe(secret);
          events.push('challenge');
          return Promise.resolve();
        },
      },
    );
    expect(events.indexOf('enroll')).toBeLessThan(events.indexOf('challenge'));
    expect(
      privateWrites.some((value) => JSON.stringify(value).includes(secret)),
    ).toBe(true);
    expect(JSON.stringify(result)).not.toContain(secret);
  });
  it('MFA failure cannot become verified or expose a secret', async () => {
    const challenge = vi.fn(() => Promise.resolve());
    await expect(
      adminMfaThroughUi(
        { waitForURL: () => Promise.resolve() } as unknown as Page,
        identity,
        { directory: 'synthetic', write: () => Promise.resolve() },
        {
          login: () => Promise.resolve(),
          enroll: () => Promise.reject(new Error('SYNTHETIC_SECRET')),
          challenge,
        },
      ),
    ).rejects.toThrow('FUNCTIONAL_AUTH_FAILED');
    expect(challenge).not.toHaveBeenCalled();
  });
  it.each([503, 429, 401])(
    'HTTP%s is not evidence of permission refusal',
    (status) => {
      expect(() =>
        assertAdminDenied({
          status,
          body: { outcome: 'denied', code: 'INSUFFICIENT_MFA' },
        }),
      ).toThrow('FUNCTIONAL_OPERATION_FAILED');
    },
  );
  it('only allowlisted explicit server denial passes', () => {
    expect(
      assertAdminDenied({
        status: 200,
        body: { outcome: 'denied', code: 'STALE_PRIVILEGED_SESSION' },
      }).code,
    ).toBe('STALE_PRIVILEGED_SESSION');
    expect(() =>
      assertAdminDenied({
        status: 200,
        body: { outcome: 'denied', code: 'UNKNOWN_SECRET' },
      }),
    ).toThrow('FUNCTIONAL_OPERATION_FAILED');
  });
});
