import { describe, expect, it, vi } from 'vitest';
import {
  recoveryCallback,
  navigateRecovery,
} from '../../scripts/concurrency/auth-journey';
import { parseFunctionalScope } from '../../scripts/concurrency/config';
const scope = () =>
  parseFunctionalScope({
    schemaVersion: 1,
    environment: 'local',
    projectId: 'cp-whole-site-261115',
    runId: 'wsb-26111500-abcdef12',
    expectedRevision: 'a'.repeat(40),
    appUrl: 'http://127.0.0.1:58373',
    supabaseUrl: 'http://127.0.0.1:58321',
    mailpitUrl: 'http://127.0.0.1:58324',
    databaseUrl: 'postgresql://u:p@127.0.0.1:58322/postgres',
    privateRoot: '/private/tmp/synthetic-functional',
    anonKeySha256: 'b'.repeat(64),
    serviceKeySha256: 'c'.repeat(64),
    databaseIdentitySha256: 'd'.repeat(64),
    runtimeAttestationSha256: 'e'.repeat(64),
    confirmation: 'LOCAL_WHOLE_SITE_FUNCTIONAL',
  });
const secret = 'SYNTHETIC_SECRET_MARKER';
const link = (s = scope()) =>
  `${s.supabaseUrl}/auth/v1/verify?type=recovery&token=${secret}&redirect_to=${encodeURIComponent(`${s.appUrl}/reset-password`)}`;
const callback = `${scope().appUrl}/reset-password#type=recovery&access_token=${secret}&refresh_token=${secret}`;
describe('strict manual recovery handoff', () => {
  it('follows exactly one matched-source 303 verify request and never follows it automatically', async () => {
    const fetcher = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response(null, { status: 303, headers: { location: callback } }),
      ),
    );
    expect(
      await recoveryCallback(
        scope(),
        link(),
        new AbortController().signal,
        fetcher,
      ),
    ).toBe(callback);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[1]?.redirect).toBe('manual');
  });
  it.each([200, 301, 302, 307, 308, 400, 500])(
    'refuses undocumented or error HTTP %i',
    async (status) => {
      await expect(
        recoveryCallback(scope(), link(), new AbortController().signal, () =>
          Promise.resolve(
            new Response(null, { status, headers: { location: callback } }),
          ),
        ),
      ).rejects.toThrow('FUNCTIONAL_RECOVERY_INVALID');
    },
  );
  it.each([
    'http://localhost:4173/reset-password',
    'https://remote.invalid/reset-password',
    `${scope().appUrl}/login`,
    `${scope().appUrl}/reset-password#error=SECRET`,
    `${scope().appUrl}/reset-password#type=signup&access_token=a&refresh_token=b`,
    `${scope().appUrl}/reset-password?error=SECRET#type=recovery&access_token=a&refresh_token=b`,
  ])('does not expose unsafe callbacks %#', async (location) => {
    let caught: unknown;
    try {
      await recoveryCallback(
        scope(),
        link(),
        new AbortController().signal,
        () =>
          Promise.resolve(
            new Response(null, { status: 303, headers: { location } }),
          ),
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toHaveProperty('message', 'FUNCTIONAL_RECOVERY_INVALID');
    expect(JSON.stringify(caught)).not.toContain(secret);
  });
  it('unsafe verify targets cause zero requests', async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      recoveryCallback(
        scope(),
        `http://localhost:4173/auth/v1/verify?token=${secret}`,
        new AbortController().signal,
        fetcher,
      ),
    ).rejects.toThrow('FUNCTIONAL_RECOVERY_INVALID');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('callback navigation errors never expose fragment, URL, stack, token or cause', async () => {
    const page = {
      goto: vi.fn(() =>
        Promise.resolve().then(() => {
          throw new Error(callback, { cause: secret });
        }),
      ),
    };
    await expect(navigateRecovery(page, scope(), callback)).rejects.toThrow(
      'FUNCTIONAL_RECOVERY_INVALID',
    );
  });
});
