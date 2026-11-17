import type { BrowserContext, Route } from '@playwright/test';
import { describe, expect, it, vi } from 'vitest';
import { restrictFunctionalBrowser } from '../../scripts/concurrency/browser-runtime';
import { syntheticScope } from './helpers/whole-site-functional';
const scope = syntheticScope(),
  app = scope.appUrl;
const setup = async (
  options: {
    url?: string;
    method?: string;
    type?: string;
    headers?: unknown;
    status?: number;
    rejectHeaders?: boolean;
  } = {},
) => {
  let handler: ((route: Route) => Promise<void>) | undefined;
  const context = {
    grantPermissions: () => Promise.resolve(),
    route: (_pattern: string, fn: typeof handler) => {
      handler = fn;
      return Promise.resolve();
    },
    routeWebSocket: () => Promise.resolve(),
  } as unknown as BrowserContext;
  await restrictFunctionalBrowser(context, scope);
  const defaults = {
    Cookie: 'SYNTHETIC_COOKIE',
    Authorization: 'Bearer SYNTHETIC_AUTH',
    Accept: 'image/png',
    'If-None-Match': 'SYNTHETIC_ETAG',
    'IF-Modified-Since': 'SYNTHETIC_DATE',
  };
  const raw = 'headers' in options ? options.headers : defaults;
  const calls: string[] = [];
  const allHeaders = vi.fn(() =>
    options.rejectHeaders
      ? Promise.reject(Error('PRIVATE'))
      : Promise.resolve(raw),
  );
  const page = {};
  const request = {
    frame: () => ({ page: () => page }),
    url: () => options.url ?? app + '/colorplay-grimoire-pixel.png',
    method: () => options.method ?? 'GET',
    resourceType: () => options.type ?? 'image',
    allHeaders,
    headers: () => {
      throw Error('INCOMPLETE_HEADERS_FORBIDDEN');
    },
  };
  const response = {
    status: () => options.status ?? 200,
    dispose: vi.fn(() => {
      calls.push('dispose');
      return Promise.resolve();
    }),
    body: () => {
      throw Error('EXTRA_BODY_READ');
    },
  };
  const fetch = vi.fn<
    (options: {
      maxRedirects: number;
      maxRetries: number;
      headers?: Record<string, string>;
    }) => Promise<typeof response>
  >((received) => {
    calls.push('fetch');
    const headers = received.headers ?? raw;
    const conditional =
      !!headers &&
      typeof headers === 'object' &&
      Object.keys(headers).some((k) =>
        ['if-none-match', 'if-modified-since'].includes(k.toLowerCase()),
      );
    return Promise.resolve({
      ...response,
      status: () => options.status ?? (conditional ? 304 : 200),
    });
  });
  const route = {
    request: () => request,
    fetch,
    fulfill: vi.fn(() => {
      calls.push('fulfill');
      return Promise.resolve();
    }),
    abort: vi.fn((code: string) => {
      calls.push(code);
      return Promise.resolve();
    }),
  };
  return {
    raw,
    context,
    page,
    request,
    allHeaders,
    fetch,
    route,
    response,
    calls,
    run: async () => {
      if (!handler) throw Error('HANDLER_MISSING');
      await handler(route as unknown as Route);
    },
  };
};
describe('same-origin actual Image GET first conditional forwarding', () => {
  it('removes only validators from complete headers, one fetch yields full200 and normal disposal', async () => {
    const h = await setup();
    const before = JSON.stringify(h.raw);
    await h.run();
    expect(h.calls).toEqual(['fetch', 'fulfill', 'dispose']);
    expect(h.allHeaders).toHaveBeenCalledTimes(1);
    expect(h.fetch).toHaveBeenCalledExactlyOnceWith({
      maxRedirects: 0,
      maxRetries: 0,
      headers: {
        Cookie: 'SYNTHETIC_COOKIE',
        Authorization: 'Bearer SYNTHETIC_AUTH',
        Accept: 'image/png',
      },
    });
    expect(h.calls).toEqual(['fetch', 'fulfill', 'dispose']);
    expect(JSON.stringify(h.raw)).toBe(before);
  });
});

it.each(['if-none-match', 'IF-MODIFIED-SINCE'] as const)(
  'removes a single %s and retains complete remaining credentials',
  async (name) => {
    const headers = Object.freeze({
      [name]: 'SYNTHETIC_VALIDATOR',
      Cookie: 'SYNTHETIC_COOKIE',
      Authorization: 'Bearer SYNTHETIC_AUTH',
      'If-Match': 'OTHER_PRECONDITION',
      'Cache-Control': 'no-store',
      Accept: 'image/webp',
      'X-Synthetic': 'PRESERVE',
    });
    const h = await setup({ headers });
    await h.run();
    const expected = {
      Cookie: 'SYNTHETIC_COOKIE',
      Authorization: 'Bearer SYNTHETIC_AUTH',
      'If-Match': 'OTHER_PRECONDITION',
      'Cache-Control': 'no-store',
      Accept: 'image/webp',
      'X-Synthetic': 'PRESERVE',
    };
    expect(h.fetch).toHaveBeenCalledExactlyOnceWith({
      maxRedirects: 0,
      maxRetries: 0,
      headers: expected,
    });
    expect(h.calls).toEqual(['fetch', 'fulfill', 'dispose']);
    expect(headers[name]).toBe('SYNTHETIC_VALIDATOR');
  },
);
it.each([
  {},
  {
    Cookie: 'SYNTHETIC_COOKIE',
    Authorization: 'Bearer SYNTHETIC_AUTH',
    Accept: 'image/png',
  },
])(
  'without validators preserves the exact original fetch options %#',
  async (headers) => {
    const h = await setup({ headers });
    await h.run();
    expect(h.allHeaders).toHaveBeenCalledTimes(1);
    expect(h.fetch).toHaveBeenCalledExactlyOnceWith({
      maxRedirects: 0,
      maxRetries: 0,
    });
    expect(h.calls).toEqual(['fetch', 'fulfill', 'dispose']);
  },
);
it.each([302, 307])(
  'real image redirect %i retains blockedbyclient/dispose and no follow',
  async (status) => {
    const h = await setup({ status });
    await h.run();
    expect(h.calls).toEqual(['fetch', 'blockedbyclient', 'dispose']);
    expect(h.route.fulfill).not.toHaveBeenCalled();
    expect(h.fetch).toHaveBeenCalledTimes(1);
  },
);
it('unexpected fresh304 fails without masquerading as200 or redirect, exactly one fetch', async () => {
  const { registerImageTransport, observeImageCdp, finishImageCdp } =
    await import('../../scripts/concurrency/functional-image-transport-observation');
  const h = await setup({ headers: { Accept: 'image/png' }, status: 304 });
  registerImageTransport(
    h.context,
    h.page,
    app,
    [],
    () => true,
    () => undefined,
  );
  const value = observeImageCdp(h.page, 'SYNTHETIC_PRIVATE', {
    type: 'Image',
    request: { url: app + '/colorplay-grimoire-pixel.png', method: 'GET' },
  });
  await h.run();
  finishImageCdp(h.page, 'SYNTHETIC_PRIVATE', {
    errorText: 'net::ERR_FAILED',
    canceled: false,
  });
  expect(h.calls).toEqual(['fetch', 'dispose', 'failed']);
  expect(h.fetch).toHaveBeenCalledExactlyOnceWith({
    maxRedirects: 0,
    maxRetries: 0,
  });
  expect(h.route.fulfill).not.toHaveBeenCalled();
  expect(value.stages.some((e) => e.stage === 'REDIRECT_BLOCK')).toBe(false);
  expect(value.stages.some((e) => e.stage === 'CATCH_ABORT')).toBe(true);
  expect(JSON.stringify(value)).not.toContain('SYNTHETIC_PRIVATE');
});
it.each([null, [], { Cookie: 2 }, 'PRIVATE', undefined])(
  'bad allHeaders shape %# fails before fetch without body or secret output',
  async (headers) => {
    const h = await setup({ headers });
    await h.run();
    expect(h.allHeaders).toHaveBeenCalledTimes(1);
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.calls).toEqual(['failed']);
    expect(h.response.dispose).not.toHaveBeenCalled();
  },
);
it('allHeaders rejection preserves original failure path without fetch/retry', async () => {
  const h = await setup({ rejectHeaders: true });
  await h.run();
  expect(h.calls).toEqual(['failed']);
  expect(h.fetch).not.toHaveBeenCalled();
  expect(h.route.fulfill).not.toHaveBeenCalled();
});
it.each([
  { type: 'script' },
  { type: 'fetch' },
  { method: 'POST' },
  { method: 'HEAD' },
  { url: scope.supabaseUrl + '/storage/v1/object/image.png' },
] as const)(
  'non-target request %# never calls allHeaders or changes options',
  async (options) => {
    const h = await setup({ ...options, status: 200 });
    await h.run();
    expect(h.allHeaders).not.toHaveBeenCalled();
    expect(h.fetch).toHaveBeenCalledExactlyOnceWith({
      maxRedirects: 0,
      maxRetries: 0,
    });
    expect(h.calls).toEqual(['fetch', 'fulfill', 'dispose']);
  },
);
it('foreign origin is rejected before headers or fetch', async () => {
  const h = await setup({ url: 'https://foreign.invalid/image.png' });
  await h.run();
  expect(h.allHeaders).not.toHaveBeenCalled();
  expect(h.fetch).not.toHaveBeenCalled();
  expect(h.calls).toEqual(['blockedbyclient']);
});
it('nonimage304 preserves old redirect rejection rather than granting a new exception', async () => {
  const h = await setup({ type: 'fetch', status: 304 });
  await h.run();
  expect(h.allHeaders).not.toHaveBeenCalled();
  expect(h.calls).toEqual(['fetch', 'blockedbyclient', 'dispose']);
});
