import { EventEmitter } from 'node:events';
import type { BrowserContext, CDPSession, Page } from '@playwright/test';
import { describe, expect, it, vi } from 'vitest';
import { createFunctionalHealth } from '../../scripts/concurrency/functional-health';
import { sha256 } from '../../scripts/concurrency/local-runtime';
import type { FunctionalStage } from '../../scripts/concurrency/functional-receipt';
import { syntheticScope } from './helpers/whole-site-functional';
const requestId = '11000000-0000-4000-8000-000000000001';
const runId = '11000000-0000-4000-8000-000000000002';
const target = `${syntheticScope().supabaseUrl}/functions/v1/content-media`;
const setup = async (
  options: { unavailable?: boolean; body?: unknown } = {},
) => {
  let phase: FunctionalStage | null = 'media';
  const page = new EventEmitter();
  const cdp = new EventEmitter();
  const send = vi.fn<(method: string, params?: unknown) => Promise<unknown>>(
    (method) =>
      Promise.resolve(
        method === 'Browser.getVersion'
          ? {
              product: 'Chrome/159.0.8154.6',
              protocolVersion: '1.3',
              revision: '@' + 'a'.repeat(40),
            }
          : method === 'Network.getResponseBody'
            ? {
                body: JSON.stringify(
                  options.body ?? { error_code: 'refresh_token_not_found' },
                ),
                base64Encoded: false,
              }
            : {},
      ),
  );
  const context = {
    newCDPSession: () =>
      options.unavailable
        ? Promise.reject(new Error('SYNTHETIC_PROVIDER_SECRET'))
        : Promise.resolve(
            Object.assign(cdp, {
              send,
              detach: () => Promise.resolve(),
            }) as unknown as CDPSession,
          ),
  } as unknown as BrowserContext;
  const owned = Object.assign(page, {
    isClosed: () => false,
    opener: () => Promise.resolve(null),
    url: () => `${syntheticScope().appUrl}/app`,
  }) as unknown as Page;
  const health = createFunctionalHealth(syntheticScope(), () => phase);
  await health.attach(context, owned);
  health.identify(owned, 'A1');
  const tuple = (id = requestId) => ({
    action: 'process' as const,
    requestId: id,
    runId,
    actorTokenSha256: sha256('SYNTHETIC_TOKEN'),
  });
  const network = (
    id: string,
    key = requestId,
    url = target,
    body: unknown = { action: 'process', runId, requestId: key },
  ) => {
    cdp.emit('Network.requestWillBeSent', {
      requestId: id,
      request: {
        url,
        method: 'POST',
        postData: JSON.stringify(body),
        headers: { Authorization: 'Bearer SYNTHETIC_TOKEN' },
      },
    });
  };
  const log = (
    id: string,
    url = target,
    text = 'Failed to load resource: net::ERR_FAILED',
  ) => {
    cdp.emit('Log.entryAdded', {
      entry: {
        level: 'error',
        source: 'network',
        networkRequestId: id,
        url,
        text,
      },
    });
  };
  const console = (
    url = target,
    text = 'Failed to load resource: net::ERR_FAILED',
  ) => {
    page.emit('console', {
      type: () => 'error',
      text: () => text,
      location: () => ({ url }),
    });
  };
  return {
    health,
    page,
    owned,
    context,
    cdp,
    tuple,
    network,
    log,
    console,
    phase: (next: FunctionalStage) => {
      phase = next;
    },
    send,
  };
};
describe('exact CDP request identity, not URL/time, classifies functional negatives', () => {
  it('exposes the exact pageerror contribution without changing the four health fields', async () => {
    const h = await setup();
    h.page.emit('pageerror', new TypeError('SYNTHETIC_PRIVATE_SECRET'));
    expect(h.health.snapshot()).toEqual({
      available: true,
      expectedMediaDrops: 0,
      expectedRefreshRejections: 0,
      unexpectedErrors: 1,
    });
    expect(h.health).toHaveProperty('diagnostics');
    expect(h.health.diagnostics()).toMatchObject({
      collection: 'OBSERVED',
      components: {
        unexpected: 0,
        pageErrors: 1,
        unmatchedConsole: 0,
        unprovenNetworkLogs: 0,
        pendingErrors: 0,
      },
    });
    expect(JSON.stringify(h.health.diagnostics())).not.toContain(
      'SYNTHETIC_PRIVATE_SECRET',
    );
    await h.health.dispose();
  });
  it('classifies one exact owned drop and reconciles its duplicate PW log after loadingFailed', async () => {
    const h = await setup();
    h.network('n1');
    h.health.expectMediaDrop(h.owned, h.tuple());
    h.log('n1');
    h.console();
    h.cdp.emit('Network.loadingFailed', {
      requestId: 'n1',
      errorText: 'net::ERR_FAILED',
    });
    expect(h.health.snapshot()).toMatchObject({
      available: true,
      expectedMediaDrops: 1,
      unexpectedErrors: 0,
    });
    await h.health.dispose();
    expect(h.page.listenerCount('console')).toBe(0);
    expect(h.cdp.listenerCount('Network.requestWillBeSent')).toBe(0);
  });
  it('same URL with a different request or repeated exact tuple is not another expected drop', async () => {
    const h = await setup();
    h.network('n1');
    h.health.expectMediaDrop(h.owned, h.tuple());
    h.cdp.emit('Network.loadingFailed', {
      requestId: 'n1',
      errorText: 'net::ERR_FAILED',
    });
    h.log('n1');
    h.console();
    h.network('n2', '11000000-0000-4000-8000-000000000003');
    h.cdp.emit('Network.loadingFailed', {
      requestId: 'n2',
      errorText: 'net::ERR_FAILED',
    });
    h.log('n2');
    h.console();
    h.network('n3');
    h.cdp.emit('Network.loadingFailed', {
      requestId: 'n3',
      errorText: 'net::ERR_FAILED',
    });
    expect(h.health.snapshot().expectedMediaDrops).toBe(1);
    expect(h.health.snapshot().unexpectedErrors).toBeGreaterThan(0);
    await h.health.dispose();
  });
  it.each([
    'unknown-console',
    'extra-5xx',
    'unknown-network-code',
    'missing-log',
  ] as const)('does not exempt %s', async (bad) => {
    const h = await setup();
    h.network('n1');
    h.health.expectMediaDrop(h.owned, h.tuple());
    if (bad === 'unknown-console')
      h.console(target, 'SYNTHETIC_PROVIDER_SECRET');
    if (bad === 'extra-5xx')
      h.cdp.emit('Network.responseReceived', {
        requestId: 'n1',
        response: { status: 503 },
      });
    if (bad === 'unknown-network-code')
      h.cdp.emit('Network.loadingFailed', {
        requestId: 'n1',
        errorText: 'net::ERR_CONNECTION_CLOSED',
      });
    if (bad === 'missing-log') h.console();
    expect(h.health.snapshot().unexpectedErrors).toBeGreaterThan(0);
    expect(JSON.stringify(h.health.snapshot())).not.toContain(
      'SYNTHETIC_PROVIDER_SECRET',
    );
    await h.health.dispose();
  });
  it('does not treat an unfinished unknown 403 as a zero-error observation', async () => {
    const h = await setup();
    h.network('pending');
    h.cdp.emit('Network.responseReceived', {
      requestId: 'pending',
      response: { status: 403 },
    });
    expect(h.health.snapshot().unexpectedErrors).toBeGreaterThan(0);
    await h.health.dispose();
  });
  it('requires an available CDP observer, never zero-fills a missing one', async () => {
    const h = await setup({ unavailable: true });
    expect(h.health.snapshot().available).toBe(false);
    await h.health.dispose();
  });
  it.each(['refresh_token_not_found', 'SYNTHETIC_UNKNOWN_CODE'])(
    'accepts controlled refresh only with owned tuple and explicit %s',
    async (error_code) => {
      const h = await setup({ body: { code: 400, error_code } });
      h.phase('controlled_refresh');
      h.health.identify(h.owned, 'S2');
      h.health.expectRefresh(h.owned, 'SYNTHETIC_REFRESH');
      const url = `${syntheticScope().supabaseUrl}/auth/v1/token?grant_type=refresh_token`;
      h.network('r1', requestId, url, { refresh_token: 'SYNTHETIC_REFRESH' });
      h.cdp.emit('Network.responseReceived', {
        requestId: 'r1',
        response: { status: 400 },
      });
      h.log(
        'r1',
        url,
        'Failed to load resource: the server responded with a status of 400 (Bad Request)',
      );
      h.console(
        url,
        'Failed to load resource: the server responded with a status of 400 (Bad Request)',
      );
      h.cdp.emit('Network.loadingFinished', { requestId: 'r1' });
      await h.health.settle();
      expect(h.health.snapshot().expectedRefreshRejections).toBe(
        error_code === 'refresh_token_not_found' ? 1 : 0,
      );
      expect(h.health.snapshot().unexpectedErrors === 0).toBe(
        error_code === 'refresh_token_not_found',
      );
      await h.health.dispose();
    },
  );
  it('bounds postData and does not inspect headers/body of another origin', async () => {
    const h = await setup();
    h.cdp.emit('Network.requestWillBeSent', {
      requestId: 'foreign',
      request: {
        url: 'https://other.invalid/data',
        method: 'POST',
        get postData() {
          throw new Error('SYNTHETIC_PRIVATE');
        },
        get headers() {
          throw new Error('SYNTHETIC_PRIVATE');
        },
      },
    });
    expect(h.health.snapshot().available).toBe(true);
    h.cdp.emit('Network.requestWillBeSent', {
      requestId: 'huge',
      request: {
        url: target,
        method: 'POST',
        postData: 'x'.repeat(4097),
        headers: {},
      },
    });
    expect(h.health.snapshot().available).toBe(false);
    expect(JSON.stringify(h.health.snapshot())).not.toContain(
      'SYNTHETIC_PRIVATE',
    );
    await h.health.dispose();
  });
  it('registration completion expectation is restricted to the owned R1 registration phase', async () => {
    const h = await setup();
    expect(() => {
      h.health.expectLogout(
        h.owned,
        'SYNTHETIC_TOKEN',
        'registration_completion',
      );
    }).toThrow('FUNCTIONAL_BROWSER_FAILED');
    h.phase('auth_controls');
    h.health.identify(h.owned, 'S1');
    expect(() => {
      h.health.expectLogout(
        h.owned,
        'SYNTHETIC_TOKEN',
        'registration_completion',
      );
    }).toThrow('FUNCTIONAL_BROWSER_FAILED');
    h.phase('registration_recovery');
    expect(() => {
      h.health.expectLogout(
        h.owned,
        'SYNTHETIC_TOKEN',
        'registration_completion',
      );
    }).toThrow('FUNCTIONAL_BROWSER_FAILED');
    await h.health.dispose();
  });
  it('installs popup PW listeners before asynchronous CDP setup can complete', async () => {
    let finish: (value: CDPSession) => void = () => undefined;
    const pending = new Promise<CDPSession>((resolve) => {
      finish = resolve;
    });
    const page = Object.assign(new EventEmitter(), {
      isClosed: () => false,
      opener: () => Promise.resolve(null),
      url: () => `${syntheticScope().appUrl}/app`,
    });
    const cdp = Object.assign(new EventEmitter(), {
      send: () => Promise.resolve(),
      detach: () => Promise.resolve(),
    });
    const health = createFunctionalHealth(
      syntheticScope(),
      () => 'auth_controls',
    );
    const attached = health.attach(
      { newCDPSession: () => pending } as unknown as BrowserContext,
      page as unknown as Page,
    );
    expect(page.listenerCount('pageerror')).toBe(1);
    page.emit('pageerror', new Error('SYNTHETIC_SECRET'));
    expect(health.snapshot().available).toBe(false);
    finish(cdp as unknown as CDPSession);
    await attached;
    expect(health.snapshot().unexpectedErrors).toBe(1);
    await health.dispose();
    expect(page.listenerCount('pageerror')).toBe(0);
  });
});

it('keeps all four synthetic media/import status200 aborts unexpected with no body claim', async () => {
  const h = await setup();
  h.health.mediaObservation(h.owned).step('single');
  for (let n = 0; n < 4; n++) {
    const id = `synthetic-abort-${String(n)}`;
    h.network(
      id,
      requestId,
      n === 3 ? target.replace('content-media', 'content-import') : target,
      n === 3 ? { action: 'preview' } : { action: 'process', runId, requestId },
    );
    h.cdp.emit('Network.responseReceived', {
      requestId: id,
      response: { status: 200 },
    });
    h.cdp.emit('Network.loadingFailed', {
      requestId: id,
      errorText: 'net::ERR_ABORTED',
      canceled: true,
    });
  }
  await h.health.settle();
  expect(h.health.snapshot()).toMatchObject({
    unexpectedErrors: 4,
    expectedMediaDrops: 0,
  });
  expect(h.health.diagnostics().events).toHaveLength(4);
  for (const row of h.health.diagnostics().events)
    expect(row.mediaContext).toMatchObject({
      mediaStep: 'single',
      lifecycle: 'FAILED',
      cancelSource: 'UNOBSERVED',
      appBodyEof: 'UNOBSERVED',
    });
  await h.health.dispose();
});
it('freezes request-time context and records a separate failure-time Root view intent', async () => {
  const h = await setup();
  const port = h.health.mediaObservation(h.owned);
  port.step('single');
  h.network('old');
  port.step('leave_editor');
  await port.view(async () => {
    h.network('new');
    for (const id of ['old', 'new'])
      h.cdp.emit('Network.loadingFailed', {
        requestId: id,
        errorText: 'net::ERR_ABORTED',
      });
    await Promise.resolve();
  });
  const events = h.health.diagnostics().events;
  expect(events[0]?.mediaContext).toMatchObject({
    mediaStep: 'single',
    requestIntent: null,
    failureIntent: {
      ordinal: 1,
      kind: 'ROOT_EDITOR_TO_IMPORT',
      state: 'INVOKED',
    },
    documentOrdinal: null,
  });
  expect(events[1]?.mediaContext).toMatchObject({
    mediaStep: 'leave_editor',
    requestIntent: { ordinal: 1, state: 'INVOKED' },
  });
  expect(h.health.snapshot().unexpectedErrors).toBe(2);
  await h.health.dispose();
});
it.each(['duplicate', 'contradiction', 'late'])(
  'fails diagnostic availability on %s without changing expected counts',
  async (bad) => {
    const h = await setup();
    h.network('ambiguous');
    if (bad === 'duplicate') h.network('ambiguous');
    if (bad === 'late') await h.health.dispose();
    h.cdp.emit('Network.responseReceived', {
      requestId: 'ambiguous',
      response: { status: 200 },
    });
    if (bad === 'contradiction') {
      h.cdp.emit('Network.loadingFailed', {
        requestId: 'ambiguous',
        errorText: 'net::ERR_ABORTED',
      });
      h.cdp.emit('Network.responseReceived', {
        requestId: 'ambiguous',
        response: { status: 200 },
      });
    }
    if (bad === 'late')
      expect(() => {
        h.health.mediaObservation(h.owned).step('single');
      }).toThrow();
    expect(h.health.snapshot().available).toBe(false);
    expect(h.health.diagnostics().collection).toBe('UNAVAILABLE');
    if (bad === 'contradiction')
      expect(h.health.diagnostics().events[0]?.mediaContext.lifecycle).toBe(
        'UNKNOWN',
      );
    expect(h.health.snapshot().expectedMediaDrops).toBe(0);
  },
);
it('marks rejected Root action settlement after disposal unavailable without masking its error', async () => {
  const h = await setup();
  const pending = Promise.withResolvers<undefined>();
  const original = new Error('SYNTHETIC_ORIGINAL_LATE_ERROR');
  const action = h.health.mediaObservation(h.owned).view(() => pending.promise);
  const rejected = expect(action).rejects.toBe(original);
  await h.health.dispose();
  pending.reject(original);
  await rejected;
  expect(h.health.snapshot().available).toBe(false);
  expect(h.health.diagnostics().collection).toBe('UNAVAILABLE');
});
