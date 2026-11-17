import { describe, expect, it } from 'vitest';
import type { APIResponse, Request } from '@playwright/test';
import {
  enableImageTransport,
  registerImageTransport,
  observeImageCdp,
  observeImageRoute,
  finishImageCdp,
  imageCdpResponse,
  imageTransportAvailable,
} from '../../scripts/concurrency/functional-image-transport-observation';
import {
  imageContextSchema,
  imageAsset,
  imageFailureCode,
  imageBlockedReason,
  imageCorsReason,
  readBrowserDiagnostic,
  imageResponseHeaders,
} from '../../scripts/concurrency/functional-image-diagnostics';
const app = 'http://127.0.0.1:58373',
  png = app + '/colorplay-grimoire-pixel.png';
const setup = () => {
  const context = {},
    page = {};
  let bad = 0,
    open = true;
  enableImageTransport(context);
  registerImageTransport(
    context,
    page,
    app,
    ['/assets/blooks/test-128.webp'],
    () => open,
    () => {
      bad++;
    },
  );
  const request = (url = png, type = 'image', method = 'GET') =>
    ({
      frame: () => ({ page: () => page }),
      url: () => url,
      method: () => method,
      resourceType: () => type,
      postData: () => {
        throw Error('BODY_MUST_NOT_BE_READ');
      },
      headers: () => {
        throw Error('REQUEST_HEADERS_MUST_NOT_BE_READ');
      },
    }) as unknown as Request;
  const cdp = (id = 'one', url = png) =>
    observeImageCdp(page, id, {
      type: 'Image',
      request: { url, method: 'GET' },
    });
  const route = (url = png) => observeImageRoute(request(url));
  const finish = (id = 'one', raw?: unknown) => {
    finishImageCdp(page, id, raw);
  };
  return {
    context,
    page,
    request,
    cdp,
    route,
    finish,
    bad: () => bad,
    available: () => imageTransportAvailable(page),
    close: () => {
      open = false;
    },
  };
};
const run = async (route: ReturnType<typeof observeImageRoute>) => {
  expect(route).toBeDefined();
  await route?.run('FETCH', () => Promise.resolve());
  route?.headers({
    status: () => 200,
    headers: () => ({
      'content-type': 'image/png',
      'content-length': '12',
      'cache-control': 'no-store, private',
      'content-encoding': 'gzip',
      'x-content-type-options': 'nosniff',
      'cross-origin-resource-policy': 'same-origin',
    }),
  } as unknown as APIResponse);
  await route?.run('FULFILL', () => Promise.resolve());
  await route?.run('DISPOSE', () => Promise.resolve());
  route?.close();
};
describe('ordinary image exact page/URL transport and safe source diagnostics', () => {
  it.each(['cdp-first', 'route-first'])(
    'pairs %s and preserves failure after root completion',
    async (order) => {
      const h = setup();
      const before = order === 'cdp-first' ? h.cdp() : null;
      const route = h.route();
      const value = before ?? h.cdp();
      await run(route);
      imageCdpResponse(h.page, 'one');
      h.finish('one', {
        errorText: 'net::ERR_BLOCKED_BY_ORB',
        canceled: false,
        blockedReason: 'other',
        corsErrorStatus: {
          corsError: 'MissingAllowOriginHeader',
          failedParameter: 'PRIVATE',
        },
      });
      expect(value).toMatchObject({
        collection: 'OBSERVED',
        asset: 'LOGIN_PNG',
        failureCode: 'ERR_BLOCKED_BY_ORB',
        corsReason: 'MissingAllowOriginHeader',
        blockedReason: 'other',
        routeClosed: true,
        status: 200,
        mime: 'PNG',
        encoding: 'GZIP',
        contentLength: 12,
        cache: 'NO_STORE',
        nosniff: 'YES',
        corp: 'SAME_ORIGIN',
      });
      expect(value.stages).toHaveLength(6);
      expect(value.requestAtNodeMs).not.toBeNull();
      expect(value.terminalAtNodeMs).not.toBeNull();
      expect(h.available()).toBe(true);
      expect(imageContextSchema.safeParse(value).success).toBe(true);
      expect(JSON.stringify(value)).not.toMatch(
        /PRIVATE|127\.0\.0\.1|grimoire|one/,
      );
    },
  );
  it('does not associate a route from another page', async () => {
    const first = setup(),
      second = setup();
    first.cdp();
    await run(second.route());
    expect(first.available()).toBe(false);
    expect(second.available()).toBe(false);
  });
  it('parallel same URL and duplicate ID are UNKNOWN without closest-time guesses', async () => {
    const h = setup(),
      value = h.cdp();
    h.cdp('two');
    await run(h.route());
    expect(value.collection).toBe('UNKNOWN');
    expect(h.available()).toBe(false);
    const other = setup();
    other.cdp();
    other.cdp();
    expect(other.available()).toBe(false);
  });
  it('reclaims complete success for2100 sequential exact URL attempts', async () => {
    const h = setup();
    for (let i = 0; i < 2100; i++) {
      h.cdp(String(i));
      await run(h.route());
      h.finish(String(i));
    }
    expect(h.available()).toBe(true);
    expect(h.bad()).toBe(0);
  });
  it('unsettled, repeated close and late operations cannot be observations', async () => {
    const h = setup();
    h.cdp();
    const route = h.route();
    route?.close();
    expect(h.available()).toBe(false);
    const late = setup(),
      value = late.cdp();
    const r = late.route();
    await run(r);
    late.finish();
    late.close();
    await r?.run('FETCH', () => Promise.resolve());
    expect(late.available()).toBe(false);
    expect(value.collection).toBe('UNKNOWN');
  });
  it('retains original thrown object and closes with finite failed stage', async () => {
    const h = setup(),
      value = h.cdp(),
      r = h.route(),
      error = Error('SYNTHETIC_PRIVATE');
    await expect(r?.run('FETCH', () => Promise.reject(error))).rejects.toBe(
      error,
    );
    r?.branch('CATCH_ABORT');
    r?.close();
    h.finish('one', { errorText: 'PRIVATE', canceled: false });
    expect(value.failureCode).toBe('UNKNOWN');
    expect(value.stages).toMatchObject([
      { stage: 'FETCH', state: 'STARTED' },
      { stage: 'FETCH', state: 'FAILED' },
      { stage: 'CATCH_ABORT', state: 'COMPLETED' },
    ]);
    expect(JSON.stringify(value)).not.toContain('PRIVATE');
  });
  it('nonimage, foreign/static/API/POST requests are untouched without body metadata', () => {
    const h = setup();
    for (const request of [
      h.request(png, 'fetch'),
      h.request('https://remote.invalid/a.png'),
      h.request(app + '/x.js', 'script'),
      h.request('http://127.0.0.1:58321/a.png'),
      h.request(app + '/x', 'fetch', 'POST'),
    ])
      expect(observeImageRoute(request)).toBeUndefined();
    expect(h.bad()).toBe(0);
  });
  it.each([
    png + '?PRIVATE',
    png + '#PRIVATE',
    app.replace('127.0.0.1', 'user:PRIVATE@127.0.0.1') +
      '/colorplay-grimoire-pixel.png',
  ])('rejects incomplete exact image identity %#', (url) => {
    const h = setup();
    const value = h.cdp('one', url);
    expect(value.collection).toBe('UNKNOWN');
    expect(h.available()).toBe(false);
    expect(JSON.stringify(value)).not.toContain('PRIVATE');
  });
  it('bounds concurrent image slots and never silently drops overflow', () => {
    const h = setup();
    for (let i = 0; i < 2001; i++)
      h.cdp(String(i), app + '/image-' + String(i) + '.png');
    expect(h.available()).toBe(false);
  });
  it.each([
    'constructor',
    'toString',
    '__proto__',
    'PRIVATE',
    'net::ERR_PRIVATE_SECRET',
  ])('closed metadata refuses prototype and free text %#', (text) => {
    expect(imageFailureCode(text)).toBe('UNKNOWN');
    expect(imageBlockedReason(text)).toBe('UNKNOWN');
    expect(imageCorsReason(text)).toBe('UNKNOWN');
    const headers = imageResponseHeaders({ 'content-encoding': text }, 200);
    expect(headers.encoding).toBe('OTHER');
    expect(JSON.stringify(headers)).not.toContain(text);
  });
  it('retains only exact approved identity and rejects forged schema values', () => {
    expect(
      imageAsset(
        app,
        ['/assets/blooks/test-128.webp'],
        app + '/assets/blooks/test-128.webp',
      ),
    ).toEqual({ asset: 'BLOOK', assetOrdinal: 1 });
    expect(imageAsset(app, [], png + '?secret')).toEqual({
      asset: 'UNKNOWN',
      assetOrdinal: null,
    });
    const h = setup(),
      v = h.cdp();
    expect(
      imageContextSchema.safeParse({ ...v, failureCode: 'PRIVATE' }).success,
    ).toBe(false);
  });
  it.each([
    {},
    null,
    {
      product: 'PRIVATE',
      protocolVersion: '1.3',
      revision: '@' + 'a'.repeat(40),
    },
    {
      product: 'Chrome/159.0.8154.6',
      protocolVersion: '1.3',
      revision: 'PRIVATE',
    },
  ])('browser unknown shape is not observed %#', (value) => {
    expect(readBrowserDiagnostic(value)).toEqual({
      collection: 'UNOBSERVED',
      product: null,
      protocolVersion: null,
      revision: null,
    });
  });
  it('classifies HTML/redirect headers without retaining raw values', () => {
    const h = imageResponseHeaders(
      {
        'content-type': 'text/html; PRIVATE',
        location: 'https://PRIVATE.invalid',
        'cross-origin-resource-policy': 'PRIVATE',
      },
      302,
    );
    expect(h).toMatchObject({
      mime: 'HTML',
      redirectPresent: true,
      status: 302,
      corp: 'OTHER',
    });
    expect(JSON.stringify(h)).not.toContain('PRIVATE');
    expect(() =>
      imageResponseHeaders({ 'content-length': 'PRIVATE' }, 200),
    ).toThrow();
    expect(() =>
      imageResponseHeaders(
        { 'content-type': 'image/png', 'Content-Type': 'text/html' },
        200,
      ),
    ).toThrow();
  });
});

// Exact installed Root handler, synthetic external ports, zero browser or HTTP.
it.each(['success', 'redirect', 'fetch-error'] as const)(
  'actual browser handler observes image %s without extra body/metadata calls',
  async (mode) => {
    const { restrictFunctionalBrowser } =
      await import('../../scripts/concurrency/browser-runtime');
    const { syntheticScope } = await import('./helpers/whole-site-functional');
    const scope = syntheticScope(),
      page = {};
    let handler: ((route: unknown) => Promise<void>) | undefined;
    const context = {
      grantPermissions: () => Promise.resolve(),
      route: (_glob: string, fn: typeof handler) => {
        handler = fn;
        return Promise.resolve();
      },
      routeWebSocket: () => Promise.resolve(),
    };
    await restrictFunctionalBrowser(context as never, scope);
    let bad = false;
    registerImageTransport(
      context,
      page,
      app,
      [],
      () => true,
      () => {
        bad = true;
      },
    );
    const value = observeImageCdp(page, 'id', {
      type: 'Image',
      request: { url: png, method: 'GET' },
    });
    const calls: string[] = [];
    const original = Error('SYNTHETIC_PRIVATE');
    const request = {
      frame: () => ({ page: () => page }),
      url: () => png,
      method: () => 'GET',
      resourceType: () => 'image',
      postData: () => {
        throw Error('BODY_READ');
      },
      headers: () => {
        throw Error('HEADERS_READ');
      },
    };
    const response = {
      status: () => (mode === 'redirect' ? 302 : 200),
      headers: () => ({
        'content-type': mode === 'redirect' ? 'text/html' : 'image/png',
        location: 'PRIVATE',
      }),
      dispose: () => {
        calls.push('dispose');
        return Promise.resolve();
      },
      body: () => {
        throw Error('EXTRA_BODY_READ');
      },
    };
    await handler?.({
      request: () => request,
      fetch: (options: unknown) => {
        expect(options).toEqual({ maxRedirects: 0, maxRetries: 0 });
        calls.push('fetch');
        return mode === 'fetch-error'
          ? Promise.reject(original)
          : Promise.resolve(response);
      },
      fulfill: (options: unknown) => {
        expect(options).toEqual({ response });
        calls.push('fulfill');
        return Promise.resolve();
      },
      abort: (code: string) => {
        calls.push(code);
        return Promise.resolve();
      },
    });
    finishImageCdp(page, 'id', {
      errorText: 'net::ERR_BLOCKED_BY_ORB',
      canceled: false,
    });
    expect(calls).toEqual(
      mode === 'success'
        ? ['fetch', 'fulfill', 'dispose']
        : mode === 'redirect'
          ? ['fetch', 'blockedbyclient', 'dispose']
          : ['fetch', 'failed'],
    );
    expect(value.routeClosed).toBe(true);
    expect(
      value.stages.some(
        (e) =>
          e.stage ===
            (mode === 'success'
              ? 'FULFILL'
              : mode === 'redirect'
                ? 'REDIRECT_BLOCK'
                : 'CATCH_ABORT') && e.state === 'COMPLETED',
      ),
    ).toBe(true);
    expect(bad).toBe(false);
    expect(JSON.stringify(value)).not.toContain('PRIVATE');
  },
);

it('malformed failure and stage overflow remain unavailable without arbitrary text', async () => {
  const h = setup(),
    value = h.cdp();
  await run(h.route());
  h.finish('one', null);
  expect(h.available()).toBe(false);
  expect(value.collection).toBe('UNKNOWN');
  const overflow = setup();
  overflow.cdp();
  const route = overflow.route();
  for (let i = 0; i < 21; i++) route?.branch('CATCH_ABORT');
  expect(overflow.available()).toBe(false);
});
