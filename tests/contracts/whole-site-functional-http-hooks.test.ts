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

import {
  registerMediaTransport,
  observeMediaCdp,
  finishMediaCdp,
  mediaTransportAvailable,
} from '../../scripts/concurrency/functional-media-transport-observation';
const observedRoute = async (failure?: string) => {
  const page = {},
    calls: string[] = [];
  let callback!: (route: Route) => Promise<void>,
    bad = false;
  const error = new TypeError('SYNTHETIC_PRIVATE_ERROR');
  const context = {
    grantPermissions: () => Promise.resolve(),
    route: (_glob: string, handler: typeof callback) => {
      callback = handler;
      return Promise.resolve();
    },
    routeWebSocket: () => Promise.resolve(),
  } as unknown as BrowserContext;
  const hit = (stage: string) => {
    calls.push(stage);
    if (failure === stage) throw error;
  };
  const hooks: FunctionalHttpHooks = {
    signal: new AbortController().signal,
    beforeSend: () => {
      hit('before');
      return Promise.resolve('send');
    },
    afterResponse: () => {
      hit('after');
      return Promise.resolve('deliver');
    },
  };
  await restrictFunctionalBrowser(context, syntheticScope(), hooks);
  registerMediaTransport(
    context,
    page,
    () => true,
    () => true,
    () => {
      bad = true;
    },
  );
  const data = { action: 'abort', requestId, runId };
  const request = Object.assign(rawRequest(undefined, data), {
    frame: () => ({ page: () => page }),
    headers: () => ({ Authorization: 'Bearer SYNTHETIC_SECRET' }),
  });
  const diagnostic = observeMediaCdp(page, 'owned', {
    request: {
      url: request.url(),
      method: 'POST',
      postData: request.postData(),
      headers: request.headers(),
    },
  });
  const bytes = Buffer.from(
    JSON.stringify({
      action: 'abort',
      outcome: 'ok',
      request_id: requestId,
      run_id: runId,
    }),
  );
  const response = {
    status: () => 200,
    headersArray: () => [
      { name: 'Content-Type', value: 'application/json' },
      { name: 'Content-Length', value: String(bytes.length) },
    ],
    body: vi.fn(() => {
      hit('body');
      return Promise.resolve(bytes);
    }),
    dispose: vi.fn(() => {
      hit('dispose');
      return Promise.resolve();
    }),
  };
  const route = {
    request: () => request,
    fetch: vi.fn((options: unknown) => {
      expect(options).toEqual({ maxRedirects: 0, maxRetries: 0 });
      hit('fetch');
      return Promise.resolve(response);
    }),
    fulfill: vi.fn((options: unknown) => {
      expect(options).toEqual({ response });
      hit('fulfill');
      return Promise.resolve();
    }),
    abort: vi.fn(() => {
      calls.push('abort');
      return Promise.resolve();
    }),
  };
  await callback(route as unknown as Route);
  finishMediaCdp(page, 'owned');
  return {
    diagnostic,
    calls,
    route,
    response,
    bad,
    available: mediaTransportAvailable(page),
  };
};
it('observes the actual route caller without extra body/HTTP calls or order changes', async () => {
  const f = await observedRoute();
  expect(f.calls).toEqual([
    'before',
    'fetch',
    'body',
    'after',
    'fulfill',
    'dispose',
  ]);
  expect(f.response.body).toHaveBeenCalledTimes(1);
  expect(f.route.fetch).toHaveBeenCalledTimes(1);
  expect(f.response.dispose).toHaveBeenCalledTimes(1);
  expect(f.route.fulfill).toHaveBeenCalledTimes(1);
  expect(f.diagnostic.stages.map((s) => [s.stage, s.state])).toEqual([
    ['HOOK', 'STARTED'],
    ['HOOK', 'COMPLETED'],
    ['FETCH', 'STARTED'],
    ['FETCH', 'COMPLETED'],
    ['PARSE', 'STARTED'],
    ['PARSE', 'COMPLETED'],
    ['HOOK', 'STARTED'],
    ['HOOK', 'COMPLETED'],
    ['FULFILL', 'STARTED'],
    ['FULFILL', 'COMPLETED'],
    ['DISPOSE', 'STARTED'],
    ['DISPOSE', 'COMPLETED'],
  ]);
  expect(f.diagnostic).toMatchObject({
    collection: 'OBSERVED',
    schemaOutcome: 'KNOWN',
    routeClosed: true,
    lengthComparison: 'EQUAL',
  });
  expect(f.available).toBe(true);
  expect(f.bad).toBe(false);
});
it.each(['before', 'fetch', 'body', 'after', 'fulfill', 'dispose'])(
  'preserves actual route failure/abort/dispose semantics at %s',
  async (failure) => {
    const f = await observedRoute(failure);
    expect(f.route.abort).toHaveBeenCalledTimes(1);
    expect(f.route.fetch).toHaveBeenCalledTimes(failure === 'before' ? 0 : 1);
    expect(f.response.dispose).toHaveBeenCalledTimes(
      ['before', 'fetch'].includes(failure) ? 0 : 1,
    );
    expect(f.route.fulfill).toHaveBeenCalledTimes(
      ['fulfill', 'dispose'].includes(failure) ? 1 : 0,
    );
    expect(f.diagnostic.stages.some((s) => s.state === 'FAILED')).toBe(true);
    expect(JSON.stringify(f.diagnostic)).not.toContain(
      'SYNTHETIC_PRIVATE_ERROR',
    );
  },
);
it('keeps parser results and original body error even if diagnostic callbacks throw', async () => {
  const parsed = await parseMediaHttpRequest(
    rawRequest(undefined, {
      action: 'abort',
      runId,
      requestId,
    }) as unknown as Request,
  );
  if (!parsed) throw new Error('SYNTHETIC_MISSING');
  const diagnostic = {
    body: vi.fn(() => {
      throw new Error('PRIVATE_WRITER');
    }),
    unknown: vi.fn(() => {
      throw new Error('PRIVATE_UNKNOWN');
    }),
  };
  const response = {
    status: () => 200,
    body: vi.fn(() =>
      Promise.resolve(
        Buffer.from(
          JSON.stringify({
            action: 'abort',
            outcome: 'ok',
            run_id: runId,
            request_id: requestId,
          }),
        ),
      ),
    ),
  } as unknown as APIResponse;
  expect(
    await parseMediaHttpResponse(parsed, response, diagnostic),
  ).toMatchObject({ outcome: 'ok' });
  expect(diagnostic.body).toHaveBeenCalledTimes(1);
  expect(diagnostic.unknown).toHaveBeenCalledTimes(1);
  const original = new TypeError('PRIVATE_BODY');
  await expect(
    parseMediaHttpResponse(
      parsed,
      {
        status: () => 200,
        body: () => Promise.reject(original),
      } as unknown as APIResponse,
      diagnostic,
    ),
  ).rejects.toBe(original);
});
