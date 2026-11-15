import type {
  BrowserContext,
  Request,
  APIResponse,
  Route,
} from '@playwright/test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { restrictFunctionalBrowser } from '../../scripts/concurrency/browser-runtime';
import {
  parseMediaHttpRequest,
  parseMediaHttpResponse,
  boundedHttpHook,
  type FunctionalHttpHooks,
} from '../../scripts/concurrency/media-http-contract';
import { syntheticScope } from './helpers/whole-site-functional';
const requestId = '10000000-0000-4000-8000-000000000001';
const runId = '10000000-0000-4000-8000-000000000002';
const rawRequest = (
  url = 'http://127.0.0.1:58321/functions/v1/content-media',
  data: unknown = { action: 'process', requestId, runId },
) => ({
  url: () => url,
  method: () => 'POST',
  postData: () => JSON.stringify(data),
  headerValue: () => Promise.resolve('Bearer SYNTHETIC_SECRET'),
});
const guard = async (hooks: FunctionalHttpHooks) => {
  let callback: (route: Route) => Promise<void> = () => Promise.resolve();
  await restrictFunctionalBrowser(
    {
      grantPermissions: () => Promise.resolve(),
      route: (_glob: string, handler: typeof callback) => {
        callback = handler;
        return Promise.resolve();
      },
      routeWebSocket: () => Promise.resolve(),
    } as unknown as BrowserContext,
    syntheticScope(),
    hooks,
  );
  return callback;
};
afterEach(() => vi.useRealTimers());
describe('functional HTTP hooks keep the origin guard and bounded private metadata', () => {
  it('does not call either hook for an unapproved origin', async () => {
    const beforeSend = vi.fn();
    const afterResponse = vi.fn();
    const callback = await guard({
      signal: new AbortController().signal,
      beforeSend,
      afterResponse,
    });
    const route = {
      request: () =>
        rawRequest('http://localhost:4173/functions/v1/content-media'),
      abort: vi.fn(() => Promise.resolve()),
      fetch: vi.fn(),
    };
    await callback(route as unknown as Route);
    expect(route.fetch).not.toHaveBeenCalled();
    expect(beforeSend).not.toHaveBeenCalled();
    expect(afterResponse).not.toHaveBeenCalled();
  });
  it('never invokes response hooks for redirects or hands redirects to a browser', async () => {
    const beforeSend = vi.fn(() => Promise.resolve('send' as const));
    const afterResponse = vi.fn();
    const callback = await guard({
      signal: new AbortController().signal,
      beforeSend,
      afterResponse,
    });
    const dispose = vi.fn(() => Promise.resolve());
    const route = {
      request: rawRequest,
      abort: vi.fn(() => Promise.resolve()),
      fetch: vi.fn(() => Promise.resolve({ status: () => 303, dispose })),
      fulfill: vi.fn(),
    };
    await callback(route as unknown as Route);
    expect(beforeSend).toHaveBeenCalledTimes(1);
    expect(afterResponse).not.toHaveBeenCalled();
    expect(route.fulfill).not.toHaveBeenCalled();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(route.fetch).toHaveBeenCalledWith({
      maxRedirects: 0,
      maxRetries: 0,
    });
  });
  it('a pre-send drop makes zero provider calls', async () => {
    const callback = await guard({
      signal: new AbortController().signal,
      beforeSend: () => Promise.resolve('drop'),
    });
    const route = {
      request: rawRequest,
      abort: vi.fn(() => Promise.resolve()),
      fetch: vi.fn(),
    };
    await callback(route as unknown as Route);
    expect(route.fetch).not.toHaveBeenCalled();
    expect(route.abort).toHaveBeenCalledExactlyOnceWith('failed');
  });
  it('strips raw credentials and signed object paths from callback metadata', async () => {
    const parsed = await parseMediaHttpRequest(
      rawRequest(undefined, {
        action: 'begin',
        requestId,
        semanticRole: 'standard',
        sourceFilename: 'synthetic.png',
        sourceBytes: 20,
        sourceMimeType: 'image/png',
      }) as unknown as Request,
    );
    if (!parsed) throw new Error('SYNTHETIC_MISSING');
    const response = await parseMediaHttpResponse(parsed, {
      status: () => 200,
      body: () =>
        Promise.resolve(
          Buffer.from(
            JSON.stringify({
              action: 'begin',
              outcome: 'ok',
              run_id: runId,
              bucket: 'content-media-quarantine',
              expires_at: '2030-01-01T00:00:00Z',
              object_path: 'SYNTHETIC_PRIVATE_PATH',
              token: 'SYNTHETIC_SIGNED_TOKEN',
            }),
          ),
        ),
    } as unknown as APIResponse);
    const json = JSON.stringify({ parsed, response });
    expect(json).not.toMatch(
      /SYNTHETIC_SECRET|SYNTHETIC_PRIVATE_PATH|SYNTHETIC_SIGNED_TOKEN/u,
    );
    expect(response.objectPathSha256).toMatch(/^[a-f0-9]{64}$/u);
  });
  it('rejects oversized/unknown request shapes and oversized response payloads', async () => {
    expect(
      await parseMediaHttpRequest(
        rawRequest(undefined, {
          action: 'process',
          requestId,
          runId,
          extra: 'x',
        }) as unknown as Request,
      ),
    ).toBeNull();
    expect(
      await parseMediaHttpRequest(
        rawRequest(undefined, {
          extra: 'x'.repeat(5000),
        }) as unknown as Request,
      ),
    ).toBeNull();
    const parsed = await parseMediaHttpRequest(
      rawRequest() as unknown as Request,
    );
    if (!parsed) throw new Error('SYNTHETIC_MISSING');
    expect(
      await parseMediaHttpResponse(parsed, {
        status: () => 200,
        body: () => Promise.resolve(Buffer.alloc(16_385)),
      } as unknown as APIResponse),
    ).toMatchObject({ outcome: 'unknown', asset: null });
  });
  it('does not grant a new action injection capability', async () => {
    expect(
      await parseMediaHttpRequest(
        rawRequest(undefined, {
          action: 'complete',
          requestId,
          runId,
        }) as unknown as Request,
      ),
    ).toBeNull();
  });
  it('has a bounded hook timeout and disposes the abort listener without late rejection', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    const promise = boundedHttpHook(
      () => new Promise(() => undefined),
      controller.signal,
    );
    const caught = expect(promise).rejects.toThrow(
      'FUNCTIONAL_OPERATION_FAILED',
    );
    await vi.advanceTimersByTimeAsync(15_000);
    await caught;
    expect(remove).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    const operation = vi.fn(() => Promise.resolve('no'));
    controller.abort();
    await expect(
      boundedHttpHook(operation, controller.signal),
    ).rejects.toThrow();
    expect(operation).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('post-response drop retains no raw response and always releases APIResponse', async () => {
    const dispose = vi.fn(() => Promise.resolve());
    const callback = await guard({
      signal: new AbortController().signal,
      afterResponse: () => Promise.resolve('drop'),
    });
    const route = {
      request: rawRequest,
      fetch: () =>
        Promise.resolve({
          status: () => 200,
          body: () => Promise.resolve(Buffer.from('{}')),
          dispose,
        }),
      abort: vi.fn(() => Promise.resolve()),
      fulfill: vi.fn(),
    };
    await callback(route as unknown as Route);
    expect(route.fulfill).not.toHaveBeenCalled();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(route.abort).toHaveBeenCalledExactlyOnceWith('failed');
  });
});
