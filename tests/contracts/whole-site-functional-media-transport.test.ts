import { expect, it } from 'vitest';
import { emptyFunctionalMediaContext } from '../../scripts/concurrency/functional-media-observation';
it('keeps an explicit unobserved transport context before any route', () => {
  expect(emptyFunctionalMediaContext()).toHaveProperty(
    'transport.collection',
    'UNOBSERVED',
  );
});

import type { APIResponse, Request } from '@playwright/test';
import {
  enableMediaTransport,
  registerMediaTransport,
  observeMediaCdp,
  observeMediaRoute,
  finishMediaCdp,
  mediaTransportAvailable,
  mediaTransportSchema,
} from '../../scripts/concurrency/functional-media-transport-observation';
const required = <T>(value: T | undefined): T => {
  if (value === undefined) throw new Error('SYNTHETIC_MISSING_OBSERVER');
  return value;
};
const api = 'http://127.0.0.1:58321';
const requestId = '10000000-0000-4000-8000-000000000001';
const runId = '10000000-0000-4000-8000-000000000002';
const body = { action: 'process', requestId, runId };
const setup = () => {
  const context = {},
    page = {};
  let bad = false,
    open = true,
    active = true;
  enableMediaTransport(context, api);
  registerMediaTransport(
    context,
    page,
    () => active,
    () => open,
    () => {
      bad = true;
    },
  );
  const raw = (data: unknown = body, token = 'SYNTHETIC_SECRET') => ({
    url: api + '/functions/v1/content-media',
    method: 'POST',
    postData: JSON.stringify(data),
    headers: { Authorization: 'Bearer ' + token },
  });
  const route = (data: unknown = body, token?: string) => {
    const row = raw(data, token);
    return observeMediaRoute({
      frame: () => ({ page: () => page }),
      url: () => row.url,
      method: () => row.method,
      postData: () => row.postData,
      headers: () => row.headers,
    } as unknown as Request);
  };
  const cdp = (id = 'one', data: unknown = body, token?: string) =>
    observeMediaCdp(page, id, { request: raw(data, token) });
  return {
    page,
    raw,
    route,
    cdp,
    bad: () => bad,
    available: () => !bad && mediaTransportAvailable(page),
    seal: () => {
      open = false;
    },
    inactive: () => {
      active = false;
    },
  };
};
const response = (headers: { name: string; value: string }[] = []) =>
  ({
    status: () => 200,
    headersArray: () => headers,
  }) as unknown as APIResponse;

it.each(['cdp-first', 'route-first'])(
  'pairs exact private identities in either order: %s',
  async (order) => {
    const f = setup();
    let cdp, route;
    if (order === 'cdp-first') {
      cdp = f.cdp();
      route = f.route();
    } else {
      route = f.route();
      cdp = f.cdp();
    }
    expect(route).toBeDefined();
    await required(route).run('FETCH', () => Promise.resolve());
    required(route).headers(
      response([
        { name: 'Content-Type', value: 'application/json' },
        { name: 'Content-Length', value: '20' },
      ]),
    );
    required(route).body(20, true);
    required(route).close();
    finishMediaCdp(f.page, 'one');
    expect(f.available()).toBe(true);
    expect(cdp).toMatchObject({
      collection: 'OBSERVED',
      routeOrdinal: 1,
      rootBodyBytes: 20,
      lengthComparison: 'EQUAL',
      routeClosed: true,
    });
    expect(mediaTransportSchema.safeParse(cdp).success).toBe(true);
    const safe = JSON.stringify(cdp);
    for (const secret of [
      requestId,
      runId,
      api,
      'SYNTHETIC_SECRET',
      'Authorization',
      'postData',
    ])
      expect(safe).not.toContain(secret);
  },
);
it('does not associate a foreign token or page by action or arrival time', () => {
  const f = setup(),
    other = setup(),
    cdp = f.cdp();
  required(f.route(body, 'OTHER_SECRET')).close();
  required(other.route()).close();
  expect(f.available()).toBe(false);
  expect(cdp.collection).toBe('UNOBSERVED');
});
it.each(['route', 'cdp'])(
  'rejects parallel same-identity ambiguity on %s',
  (side) => {
    const f = setup(),
      cdp = f.cdp();
    f.route();
    if (side === 'route') f.route();
    else f.cdp('two');
    expect(f.available()).toBe(false);
    expect(cdp.collection).toBe('UNKNOWN');
  },
);
it('retires only after both terminals and pairs sequential same-identity recovery independently', () => {
  const f = setup(),
    first = f.cdp(),
    route1 = required(f.route());
  route1.close();
  finishMediaCdp(f.page, 'one');
  const route2 = required(f.route()),
    second = f.cdp('two');
  expect(second.routeOrdinal).toBe(2);
  expect(first.routeOrdinal).toBe(1);
  finishMediaCdp(f.page, 'two');
  route2.close();
  expect(f.available()).toBe(true);
  route1.body(22, true);
  expect(f.available()).toBe(false);
  expect(first.collection).toBe('UNKNOWN');
  expect(second.collection).toBe('OBSERVED');
});
it('cannot reuse an unfinished attempt or duplicate a retired CDP identifier', () => {
  const f = setup(),
    row = f.cdp();
  required(f.route()).close();
  f.route();
  expect(row.collection).toBe('UNKNOWN');
  const g = setup();
  g.cdp();
  required(g.route()).close();
  finishMediaCdp(g.page, 'one');
  expect(g.cdp().collection).toBe('UNKNOWN');
  expect(g.available()).toBe(false);
});
it('reports gzip wire and decoded body lengths without treating their difference as failure', () => {
  const f = setup(),
    row = f.cdp(),
    route = required(f.route());
  route.headers(
    response([
      { name: 'Content-Encoding', value: 'gzip' },
      { name: 'Content-Length', value: '17' },
    ]),
  );
  route.body(30, true);
  route.close();
  finishMediaCdp(f.page, 'one');
  expect(row.lengthComparison).toBe('ENCODED_NOT_COMPARABLE');
  expect(f.available()).toBe(true);
});
it.each(
  [
    [
      { name: 'Content-Length', value: '1' },
      { name: 'content-length', value: '1' },
    ],
    [{ name: 'Content-Length', value: '-1' }],
    [{ name: 'Content-Type', value: 'application/json\r\nsecret' }],
  ].map((headers) => ({ headers })),
)(
  'poisons duplicate or malformed framing without retaining raw fields',
  ({ headers }) => {
    const f = setup(),
      row = f.cdp(),
      route = required(f.route());
    route.headers(response(headers));
    expect(f.available()).toBe(false);
    expect(row.collection).toBe('UNKNOWN');
    expect(JSON.stringify(row)).not.toContain('secret');
  },
);
it('preserves original operation error identity and reports closed error names', async () => {
  const f = setup(),
    row = f.cdp(),
    route = required(f.route());
  const error = new Error('SYNTHETIC_SECRET');
  error.name = 'CUSTOM_SECRET';
  await expect(route.run('FETCH', () => Promise.reject(error))).rejects.toBe(
    error,
  );
  expect(row.stages.at(-1)).toMatchObject({
    state: 'FAILED',
    errorName: 'OTHER',
  });
  expect(JSON.stringify(row)).not.toContain('SECRET');
});
it('rejects late successful and failed callbacks after seal without losing the original error', async () => {
  const f = setup(),
    row = f.cdp(),
    route = required(f.route());
  let settle!: () => void;
  const operation = route.run(
    'FETCH',
    () =>
      new Promise<void>((resolve) => {
        settle = resolve;
      }),
  );
  f.seal();
  settle();
  await operation;
  expect(f.available()).toBe(false);
  expect(row.collection).toBe('UNKNOWN');
  const g = setup(),
    other = required(g.route());
  g.inactive();
  other.close();
  expect(g.bad()).toBe(true);
});
it('bounds unresolved identities and rejects malformed private metadata', () => {
  const f = setup();
  expect(f.cdp('bad', { ...body, requestId: 'not-uuid' }).collection).toBe(
    'UNKNOWN',
  );
  const g = setup();
  for (let i = 0; i < 2001; i++)
    g.cdp(String(i), {
      ...body,
      requestId: `10000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    });
  expect(g.available()).toBe(false);
  expect(g.bad()).toBe(true);
});
it('keeps schema closed and finite without claiming app EOF or cancel attribution', () => {
  const row = emptyFunctionalMediaContext();
  expect(row.appBodyEof).toBe('UNOBSERVED');
  expect(row.cancelSource).toBe('UNOBSERVED');
  expect(
    mediaTransportSchema.safeParse({ ...row.transport, token: 'secret' })
      .success,
  ).toBe(false);
  expect(
    mediaTransportSchema.safeParse({
      ...row.transport,
      rootBodyBytes: Infinity,
    }).success,
  ).toBe(false);
});

it('keeps a failed diagnostic callback unavailable without masking the operation', async () => {
  const context = {},
    page = {};
  enableMediaTransport(context, api);
  registerMediaTransport(
    context,
    page,
    () => true,
    () => true,
    () => {
      throw new Error('PRIVATE_WRITER');
    },
  );
  const request = {
    frame: () => ({ page: () => page }),
    url: () => api + '/functions/v1/content-media',
    method: () => 'POST',
    postData: () => JSON.stringify(body),
    headers: () => ({ Authorization: 'Bearer SYNTHETIC_SECRET' }),
  } as unknown as Request;
  const route = required(observeMediaRoute(request));
  const error = new Error('PRIVATE_OPERATION');
  await expect(route.run('FETCH', () => Promise.reject(error))).rejects.toBe(
    error,
  );
  expect(mediaTransportAvailable(page)).toBe(false);
});
it('makes malformed JSON/schema parsing unavailable and keeps observed byte counts', () => {
  const f = setup(),
    row = f.cdp(),
    route = required(f.route());
  route.body(17, false);
  expect(row).toMatchObject({
    collection: 'UNKNOWN',
    schemaOutcome: 'UNKNOWN',
    rootBodyBytes: 17,
  });
  expect(f.available()).toBe(false);
});
it('keeps import and resolve logical identities separate without inventing a response body read', () => {
  const context = {},
    page = {};
  let bad = false;
  enableMediaTransport(context, api);
  registerMediaTransport(
    context,
    page,
    () => true,
    () => true,
    () => {
      bad = true;
    },
  );
  for (const [ordinal, data] of [
    {
      action: 'begin',
      requestId,
      sourceBytes: 20,
      sourceFilename: 'synthetic.zip',
      sourceMimeType: 'application/zip',
    },
    { action: 'preview', requestId, runId, mediaManifestMap: {} },
    { action: 'commit', requestId, runId, confirmWarnings: true },
    { action: 'resolve', assetIds: [runId] },
  ].entries()) {
    const family =
      data.action === 'resolve' ? 'content-media' : 'content-import';
    const raw = {
      url: api + '/functions/v1/' + family,
      method: 'POST',
      postData: JSON.stringify(data),
      headers: { Authorization: 'Bearer SYNTHETIC_SECRET' },
    };
    const row = observeMediaCdp(page, String(ordinal), { request: raw });
    const route = required(
      observeMediaRoute({
        frame: () => ({ page: () => page }),
        url: () => raw.url,
        method: () => raw.method,
        postData: () => raw.postData,
        headers: () => raw.headers,
      } as unknown as Request),
    );
    route.close();
    finishMediaCdp(page, String(ordinal));
    expect(row.collection).toBe('OBSERVED');
    expect(row.rootBodyBytes).toBeNull();
    expect(row.schemaOutcome).toBe('UNOBSERVED');
  }
  expect(bad).toBe(false);
  expect(mediaTransportAvailable(page)).toBe(true);
});

it('retains the original thrown value when its Error.name getter itself throws', async () => {
  const f = setup(),
    row = f.cdp(),
    route = required(f.route());
  const original = new Error('PRIVATE_OPERATION');
  Object.defineProperty(original, 'name', {
    get() {
      throw new Error('PRIVATE_GETTER');
    },
  });
  let caught: unknown;
  try {
    await route.run('FETCH', () => Promise.reject(original));
  } catch (error) {
    caught = error;
  }
  expect(caught).toBe(original);
  expect(row.collection).toBe('UNKNOWN');
  expect(f.available()).toBe(false);
});
it('pairs distinct complete identities independently when their routes arrive in reverse order', () => {
  const f = setup(),
    secondBody = { ...body, runId: '10000000-0000-4000-8000-000000000003' };
  const first = f.cdp('first'),
    second = f.cdp('second', secondBody);
  const secondRoute = required(f.route(secondBody)),
    firstRoute = required(f.route());
  secondRoute.close();
  firstRoute.close();
  finishMediaCdp(f.page, 'second');
  finishMediaCdp(f.page, 'first');
  expect(first.routeOrdinal).toBe(2);
  expect(second.routeOrdinal).toBe(1);
  expect(f.available()).toBe(true);
});
it.each(['constructor', 'toString', '__proto__', 'SYNTHETIC_PRIVATE_ENCODING'])(
  'keeps unsupported Content-Encoding in the closed OTHER enum: %s',
  (encoding) => {
    const f = setup(),
      row = f.cdp(),
      route = required(f.route());
    route.headers(response([{ name: 'Content-Encoding', value: encoding }]));
    route.close();
    finishMediaCdp(f.page, 'one');
    expect(row.encoding).toBe('OTHER');
    expect(mediaTransportSchema.safeParse(row).success).toBe(true);
    expect(f.available()).toBe(true);
    expect(JSON.stringify(row)).not.toContain(encoding);
  },
);
