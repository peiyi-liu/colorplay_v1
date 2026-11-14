import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  loginRequest,
  secretMarker,
  setupHandler,
  type Hop,
} from './auth-login-harness';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const finish = async (
  handler: (request: Request) => Promise<Response>,
  request = loginRequest(),
) => {
  const response = handler(request);
  await vi.advanceTimersByTimeAsync(8_000);
  return response;
};
const expectSafe = async (response: Response, status: number, code: string) => {
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual({ error: code });
  expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
  expect(response.headers.get('Retry-After')).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
};

describe('actual auth-login handler through the real Supabase SDK', () => {
  it.each([
    ['student', 'student'],
    ['teacher', 'teacher'],
    ['admin', 'teacher'],
  ] as const)(
    'authenticates %s via %s without repeating the grant',
    async (role, portal) => {
      const { handler, calls } = setupHandler({ role });
      const response = await finish(handler, loginRequest(portal));
      expect(response.status).toBe(200);
      const body: unknown = await response.json();
      expect(Object.keys(body as Record<string, unknown>)).toEqual(['session']);
      const session = (body as { session: Record<string, unknown> }).session;
      expect(Object.keys(session).sort()).toEqual([
        'access_token',
        'refresh_token',
      ]);
      expect(
        typeof session.access_token === 'string' &&
          session.access_token.length > 0,
      ).toBe(true);
      expect(
        typeof session.refresh_token === 'string' &&
          session.refresh_token.length > 0,
      ).toBe(true);
      expect(calls.map((call) => call.hop)).toEqual([
        'profile',
        'user',
        'grant',
      ]);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Expose-Headers')).toBe(
        'X-ColorPlay-Auth-Timing',
      );
      expect(response.headers.get('X-ColorPlay-Auth-Timing')).toMatch(
        /^profile;dur=\d+(?:\.\d+)?, auth-user;dur=\d+(?:\.\d+)?, password-grant;dur=\d+(?:\.\d+)?, total;dur=\d+(?:\.\d+)?$/u,
      );
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each([
    ['unknown', { unknownAccount: true }, ['profile']],
    ['admin wrong portal', { role: 'admin' as const }, ['profile']],
    ['role mismatch', { role: 'teacher' as const }, ['profile']],
    [
      'invalid password',
      { statuses: { grant: 400 } },
      ['profile', 'user', 'grant'],
    ],
    [
      'rejected password',
      { statuses: { grant: 401 } },
      ['profile', 'user', 'grant'],
    ],
    [
      'disabled password identity',
      { statuses: { grant: 403 } },
      ['profile', 'user', 'grant'],
    ],
    ['missing auth user', { statuses: { user: 404 } }, ['profile', 'user']],
  ] as const)(
    'does not reveal account presence for %s',
    async (_name, scenario, hops) => {
      const { handler, calls } = setupHandler(scenario);
      await expectSafe(await finish(handler), 401, 'AUTH_INVALID_CREDENTIALS');
      expect(calls.map((call) => call.hop)).toEqual(hops);
    },
  );

  for (const hop of ['profile', 'user', 'grant'] as const) {
    it.each([
      [429, 429, 'AUTH_RATE_LIMITED'],
      [500, 503, 'AUTH_UNAVAILABLE'],
      [503, 503, 'AUTH_UNAVAILABLE'],
    ] as const)(
      'retains safe upstream %i status at ' + hop,
      async (upstream, status, code) => {
        const { handler, calls } = setupHandler({
          statuses: { [hop]: upstream },
        });
        await expectSafe(await finish(handler), status, code);
        const expectedProfileReads =
          hop === 'profile' && upstream === 503 ? 4 : 1;
        expect(calls.filter((call) => call.hop === 'profile')).toHaveLength(
          expectedProfileReads,
        );
        expect(calls.filter((call) => call.hop === 'grant')).toHaveLength(
          hop === 'grant' ? 1 : 0,
        );
        if (hop === 'profile')
          expect(calls.every((call) => call.hop === 'profile')).toBe(true);
      },
    );
  }

  it.each([
    null,
    {},
    [],
    'invalid body',
    { access_token: 'synthetic' },
    { refresh_token: 'synthetic' },
    { access_token: '', refresh_token: 'synthetic' },
    { access_token: 'synthetic', refresh_token: '' },
  ])('returns safe503 for a malformed successful grant body', async (body) => {
    const { handler, calls } = setupHandler({ bodies: { grant: body } });
    await expectSafe(await finish(handler), 503, 'AUTH_UNAVAILABLE');
    expect(calls.filter((call) => call.hop === 'grant')).toHaveLength(1);
  });

  it.each(['profile', 'user', 'grant'] as const)(
    'does not expose or log a rejected %s fetch',
    async (hop: Hop) => {
      const log = vi.spyOn(console, 'error');
      const { handler, calls } = setupHandler({ reject: hop });
      const response = await finish(handler);
      const body = await response.text();
      expect(response.status).toBe(503);
      expect(JSON.parse(body)).toEqual({ error: 'AUTH_UNAVAILABLE' });
      expect(body).not.toContain(secretMarker);
      expect(log).not.toHaveBeenCalled();
      expect(
        calls.filter((call) => call.hop === 'grant').length,
      ).toBeLessThanOrEqual(1);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each([
    ['OPTIONS', 200],
    ['GET', 405],
  ] as const)(
    'handles %s without creating upstream requests',
    async (method, status) => {
      const { handler, calls } = setupHandler();
      const response = await handler(
        new Request('http://127.0.0.1/auth-login', { method }),
      );
      expect(response.status).toBe(status);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(calls).toHaveLength(0);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each(['{', 'null', '[]'])(
    'rejects malformed incoming JSON with a fixed safe400',
    async (body) => {
      const { handler, calls } = setupHandler();
      const response = await finish(
        handler,
        new Request('http://127.0.0.1/auth-login', { method: 'POST', body }),
      );
      await expectSafe(response, 400, 'INVALID_JSON');
      expect(calls).toHaveLength(0);
    },
  );
});

it('releases the original request abort listener on a normal completed login', async () => {
  const { handler } = setupHandler();
  const request = loginRequest();
  const add = vi.spyOn(request.signal, 'addEventListener');
  const remove = vi.spyOn(request.signal, 'removeEventListener');
  expect((await finish(handler, request)).status).toBe(200);
  const listener = add.mock.calls.find(([name]) => name === 'abort')?.[1];
  expect(listener).toBeDefined();
  expect(remove).toHaveBeenCalledWith('abort', listener);
  expect(vi.getTimerCount()).toBe(0);
});

it('rejects an already-aborted request without starting upstream work', async () => {
  const { handler, calls } = setupHandler();
  const abort = new AbortController();
  abort.abort();
  await expectSafe(
    await finish(handler, loginRequest('student', abort.signal)),
    504,
    'AUTH_TIMEOUT',
  );
  expect(calls).toHaveLength(0);
});
