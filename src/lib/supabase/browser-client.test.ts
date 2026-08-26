import { describe, expect, it, vi } from 'vitest';
import {
  createBoundedFetch,
  getBrowserSupabaseClient,
  RequestTimeoutError,
  SUPABASE_REQUEST_TIMEOUT_MS,
} from './browser-client';

describe('getBrowserSupabaseClient', () => {
  it('returns the same client for repeated calls', () => {
    const env = {
      supabaseUrl: 'http://127.0.0.1:54321',
      supabaseAnonKey: 'synthetic-anon-test-key-12345',
    } as const;

    expect(getBrowserSupabaseClient(env)).toBe(getBrowserSupabaseClient(env));
  });

  it('aborts a stalled Supabase request after the bounded timeout', async () => {
    vi.useFakeTimers();
    const stalledFetch = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const reason = init.signal?.reason as unknown;
            reject(
              reason instanceof Error
                ? reason
                : new DOMException('Aborted', 'AbortError'),
            );
          });
        }),
    ) as unknown as typeof fetch;
    const boundedFetch = createBoundedFetch(stalledFetch, 100);
    const rejection = expect(
      boundedFetch('https://example.invalid/rest/v1/chapters'),
    ).rejects.toBeInstanceOf(RequestTimeoutError);

    await vi.advanceTimersByTimeAsync(100);
    await rejection;
    vi.useRealTimers();
  });

  it('keeps the deadline active while the response body is stalled', async () => {
    vi.useFakeTimers();
    const stalledBodyFetch = vi.fn(() =>
      Promise.resolve(
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('{"partial":'));
            },
          }),
          { headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    ) as unknown as typeof fetch;
    const boundedFetch = createBoundedFetch(stalledBodyFetch, 100);
    const response = await boundedFetch(
      'https://example.invalid/rest/v1/chapters',
    );
    const rejection = expect(response.json()).rejects.toBeInstanceOf(
      RequestTimeoutError,
    );

    await vi.advanceTimersByTimeAsync(100);
    await rejection;
    vi.useRealTimers();
  });

  it('honors an AbortSignal carried by a Request object', async () => {
    const stalledFetch = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const reason = init.signal?.reason as unknown;
            reject(
              reason instanceof Error
                ? reason
                : new DOMException('Aborted', 'AbortError'),
            );
          });
        }),
    ) as unknown as typeof fetch;
    const controller = new AbortController();
    const reason = new DOMException('Caller aborted', 'AbortError');
    const request = new Request('https://example.invalid/rest/v1/chapters', {
      signal: controller.signal,
    });
    const rejection = expect(
      createBoundedFetch(stalledFetch)(request),
    ).rejects.toHaveProperty('name', 'AbortError');

    controller.abort(reason);
    await rejection;
  });

  it('uses a 15 second production request timeout', () => {
    expect(SUPABASE_REQUEST_TIMEOUT_MS).toBe(15_000);
  });
});
