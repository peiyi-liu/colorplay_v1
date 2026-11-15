import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createFunctionalClient,
  scopedFetch,
} from '../../scripts/concurrency/local-runtime';
import {
  syntheticScope,
  syntheticSecrets,
} from './helpers/whole-site-functional';
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
describe('SDK transport failure privacy', () => {
  it.each(['getUser', 'createUser'] as const)(
    'sanitizes rejected %s before real SDK can log provider error',
    async (operation) => {
      const errors = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      const transport = vi.fn<typeof fetch>(() =>
        Promise.reject(new Error('SYNTHETIC_PROVIDER_MARKER')),
      );
      const client = createFunctionalClient(
        syntheticScope(),
        syntheticSecrets.serviceKey,
        new AbortController().signal,
        transport,
      );
      const result =
        operation === 'getUser'
          ? await client.auth.getUser('SYNTHETIC_TOKEN')
          : await client.auth.admin.createUser({
              email: 'synthetic@colorplay.test',
              password: 'Aa1synthetic',
            });
      expect(result.error).toHaveProperty('status', 503);
      expect(errors).not.toHaveBeenCalled();
      expect(transport).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(result)).not.toContain('SYNTHETIC_PROVIDER_MARKER');
    },
  );
  it.each(['timeout', 'run_abort', 'request_abort'] as const)(
    'propagates %s but SDK receives safe 504 with no raw console',
    async (mode) => {
      vi.useFakeTimers();
      const timeout = new AbortController();
      const run = new AbortController();
      const request = new AbortController();
      const timer = setTimeout(() => {
        timeout.abort(new Error('SYNTHETIC_SECRET'));
      }, 15_000);
      vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeout.signal);
      const errors = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      let seen: AbortSignal | null | undefined;
      const transport = vi.fn<typeof fetch>(
        (_input, init) =>
          new Promise((_resolve, reject) => {
            seen = init?.signal;
            init?.signal?.addEventListener(
              'abort',
              () => {
                reject(new Error('SYNTHETIC_SECRET'));
              },
              { once: true },
            );
          }),
      );
      const pending = scopedFetch(
        syntheticScope(),
        run.signal,
        transport,
      )('http://127.0.0.1:58321/auth/v1/user', { signal: request.signal });
      if (mode === 'timeout') await vi.advanceTimersByTimeAsync(15_000);
      else if (mode === 'run_abort') run.abort();
      else request.abort();
      const response = await pending;
      expect(response.status).toBe(504);
      expect(await response.text()).not.toContain('SYNTHETIC_SECRET');
      expect(seen?.aborted).toBe(true);
      expect(errors).not.toHaveBeenCalled();
      expect(transport).toHaveBeenCalledTimes(1);
      clearTimeout(timer);
    },
  );
});
