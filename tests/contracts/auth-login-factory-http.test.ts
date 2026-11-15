import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { loginRequest, setupHandler } from './auth-login-harness';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});
it.each([401, 403, 429, 500, 503])(
  'production admin factory profile HTTP%i sends only one physical GET',
  async (status) => {
    const supplied = setupHandler({ statuses: { profile: status } });
    const pending = supplied.handler(loginRequest());
    await vi.advanceTimersByTimeAsync(12_001);
    const response = await pending;
    expect(response.status).toBe(status === 429 ? 429 : 503);
    expect(
      supplied.calls.filter((call) => call.hop === 'profile'),
    ).toHaveLength(1);
    expect(
      supplied.calls.filter((call) => call.hop !== 'profile'),
    ).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  },
);
it('production admin factory network rejection sends only one physical GET', async () => {
  const supplied = setupHandler({ reject: 'profile' });
  const pending = supplied.handler(loginRequest());
  await vi.advanceTimersByTimeAsync(12_001);
  expect((await pending).status).toBe(503);
  expect(supplied.calls).toHaveLength(1);
  expect(vi.getTimerCount()).toBe(0);
});
it('production admin factory stalls only once, shares the 12s deadline and aborts before another hop', async () => {
  const supplied = setupHandler({ stall: 'profile' });
  const pending = supplied.handler(loginRequest());
  await vi.advanceTimersByTimeAsync(12_000);
  expect((await pending).status).toBe(504);
  expect(supplied.calls).toHaveLength(1);
  expect(supplied.calls[0]?.signal?.aborted).toBe(true);
  expect(supplied.activeFetchListeners()).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
});

it('uses the production projection, account filter and shared abort signal at the real HTTP boundary', async () => {
  const supplied = setupHandler({ statuses: { profile: 503 } });
  const pending = supplied.handler(loginRequest());
  await vi.advanceTimersByTimeAsync(12_001);
  expect((await pending).status).toBe(503);
  expect(supplied.calls).toHaveLength(1);
  expect(supplied.calls[0]).toMatchObject({
    hop: 'profile',
    projectionMatches: true,
    accountFilterMatches: true,
  });
  expect(supplied.calls[0]?.signal).toBeInstanceOf(AbortSignal);
  expect(supplied.calls[0]?.signal?.aborted).toBe(false);
});
