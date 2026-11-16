import { EventEmitter } from 'node:events';
import type { BrowserContext, Page, CDPSession } from '@playwright/test';
import { describe, expect, it } from 'vitest';
import { createFunctionalHealth } from '../../scripts/concurrency/functional-health';
import { functionalHealthDetailsSchema } from '../../scripts/concurrency/functional-health-diagnostics';
import { syntheticScope } from './helpers/whole-site-functional';
import { sha256 } from '../../scripts/concurrency/local-runtime';
import type { FunctionalStage } from '../../scripts/concurrency/functional-receipt';
const scope = syntheticScope(),
  app = scope.appUrl,
  media = scope.supabaseUrl + '/functions/v1/content-media';
const asset = '/assets/approved.js';
const runId = '11000000-0000-4000-8000-000000000001';
const requestId = '11000000-0000-4000-8000-000000000002';
const setup = async () => {
  let phase: FunctionalStage | null = 'media';
  const rawPage = new EventEmitter(),
    cdp = Object.assign(new EventEmitter(), {
      send: () => Promise.resolve({}),
      detach: () => Promise.resolve(),
    });
  const page = Object.assign(rawPage, {
    url: () => app + '/app',
    opener: () => Promise.resolve(null),
    isClosed: () => false,
  }) as unknown as Page;
  const health = createFunctionalHealth(scope, () => phase, [asset]);
  await health.attach(
    {
      newCDPSession: () => Promise.resolve(cdp as unknown as CDPSession),
    } as unknown as BrowserContext,
    page,
  );
  health.identify(page, 'A1');
  const request = (id: string, url = media) =>
    cdp.emit('Network.requestWillBeSent', {
      requestId: id,
      request: {
        url,
        method: 'POST',
        postData: JSON.stringify({ action: 'process', runId, requestId }),
        headers: { Authorization: 'Bearer PRIVATE_TOKEN' },
      },
    });
  const response = (id: string, status: number) =>
    cdp.emit('Network.responseReceived', {
      requestId: id,
      response: { status },
    });
  const consoleError = (text = 'SYNTHETIC_SECRET_MESSAGE', url = app + asset) =>
    rawPage.emit('console', {
      type: () => 'error',
      text: () => text,
      location: () => ({ url, lineNumber: 4, columnNumber: 6 }),
    });
  const log = (id: string) =>
    cdp.emit('Log.entryAdded', {
      entry: {
        source: 'network',
        level: 'error',
        url: media,
        networkRequestId: id,
        text: 'Failed to load resource: net::ERR_FAILED',
      },
    });
  const expected = () => {
    health.expectMediaDrop(page, {
      action: 'process',
      runId,
      requestId,
      actorTokenSha256: sha256('PRIVATE_TOKEN'),
    });
  };
  return {
    health,
    rawPage,
    page,
    cdp,
    request,
    response,
    consoleError,
    log,
    expected,
    phase: (value: FunctionalStage) => {
      phase = value;
    },
  };
};
const sum = (
  value: ReturnType<ReturnType<typeof createFunctionalHealth>['diagnostics']>,
) => Object.values(value.components ?? {}).reduce((a, b) => a + b, 0);
describe('safe functional health detail at the actual observer seam', () => {
  it.each([
    'unexpected',
    'pageErrors',
    'unmatchedConsole',
    'unprovenNetworkLogs',
    'pendingErrors',
  ] as const)(
    'records %s separately and preserves the original total',
    async (component) => {
      const h = await setup();
      if (component === 'unexpected') h.consoleError();
      if (component === 'pageErrors')
        h.rawPage.emit('pageerror', new TypeError('PRIVATE_ERROR_MESSAGE'));
      if (component === 'unmatchedConsole')
        h.consoleError('Failed to load resource: net::ERR_FAILED', media);
      if (component === 'unprovenNetworkLogs') {
        h.request('PRIVATE_CDP_ID');
        h.expected();
        h.log('PRIVATE_CDP_ID');
      }
      if (component === 'pendingErrors') {
        h.request('PRIVATE_CDP_ID', scope.supabaseUrl + '/rest/v1/rpc/read');
        h.response('PRIVATE_CDP_ID', 403);
      }
      const snapshot = h.health.snapshot(),
        value = h.health.diagnostics();
      expect(snapshot).toEqual({
        available: true,
        expectedMediaDrops: 0,
        expectedRefreshRejections: 0,
        unexpectedErrors: 1,
      });
      expect(value.collection).toBe('OBSERVED');
      expect(value.components?.[component]).toBe(1);
      expect(sum(value)).toBe(snapshot.unexpectedErrors);
      expect(value.events.length).toBeGreaterThan(0);
      const raw = JSON.stringify(value);
      for (const secret of [
        'PRIVATE_',
        'SYNTHETIC_SECRET_MESSAGE',
        media,
        app,
        '11000000-',
        'Authorization',
      ])
        expect(raw).not.toContain(secret);
      expect(h.health.diagnostics()).toEqual(value);
      await h.health.dispose();
    },
  );
  it('keeps every component when multiple sources coexist and does not assign a repeated PW tuple to one old phase', async () => {
    const h = await setup();
    h.consoleError();
    h.rawPage.emit('pageerror', new Error('PRIVATE'));
    h.request('unproven');
    h.expected();
    h.log('unproven');
    h.request('pending', scope.supabaseUrl + '/rest/v1/rpc/read');
    h.response('pending', 403);
    h.consoleError('Failed to load resource: net::ERR_FAILED', media);
    expect(sum(h.health.diagnostics())).toBe(5);
    expect(h.health.diagnostics().components).toEqual({
      unexpected: 1,
      pageErrors: 1,
      unmatchedConsole: 1,
      unprovenNetworkLogs: 1,
      pendingErrors: 1,
    });
    h.phase('health');
    h.consoleError('Failed to load resource: net::ERR_FAILED', media);
    expect(
      h.health
        .diagnostics()
        .events.find((e) => e.closedBranch === 'UNMATCHED_CONSOLE'),
    ).toMatchObject({ eventPhase: null, assetOrdinal: null, occurrences: 2 });
    await h.health.dispose();
    await h.health.attach({} as BrowserContext, h.page);
    expect(h.health.diagnostics().collection).toBe('UNAVAILABLE');
    expect(h.health.snapshot().available).toBe(false);
  });
  it('retains request phase, current error phase, ordinal, safe endpoint and exact status', async () => {
    const h = await setup();
    h.request(
      'PRIVATE_CDP_ID',
      scope.supabaseUrl + '/rest/v1/rpc/private_function',
    );
    h.phase('health');
    h.response('PRIVATE_CDP_ID', 503);
    const value = h.health.diagnostics();
    expect(value.events).toContainEqual(
      expect.objectContaining({
        closedBranch: 'HTTP_5XX',
        eventPhase: 'media',
        currentPhase: 'health',
        pageOrdinal: 1,
        requestOrdinal: 1,
        endpoint: 'RPC',
        httpStatus: 503,
      }),
    );
    expect(sum(value)).toBe(2);
    expect(h.health.snapshot().unexpectedErrors).toBe(2);
    await h.health.dispose();
  });
  it('does not leave derived errors after an exact approved drop becomes proven', async () => {
    const h = await setup();
    h.request('PRIVATE_CDP_ID');
    h.expected();
    h.log('PRIVATE_CDP_ID');
    h.consoleError('Failed to load resource: net::ERR_FAILED', media);
    expect(h.health.diagnostics().components?.unprovenNetworkLogs).toBe(1);
    h.cdp.emit('Network.loadingFailed', {
      requestId: 'PRIVATE_CDP_ID',
      errorText: 'net::ERR_FAILED',
    });
    expect(h.health.snapshot()).toEqual({
      available: true,
      expectedMediaDrops: 1,
      expectedRefreshRejections: 0,
      unexpectedErrors: 0,
    });
    expect(h.health.diagnostics().events).toEqual([]);
    await h.health.dispose();
  });
  it('records approved console and a unique pageerror stack position without retaining either raw source', async () => {
    const h = await setup();
    h.consoleError();
    const error = new TypeError('PRIVATE_ERROR_MESSAGE');
    error.stack = `TypeError: PRIVATE_ERROR_MESSAGE\n    at run (${app}${asset}:12:34)`;
    h.rawPage.emit('pageerror', error);
    const value = h.health.diagnostics();
    expect(value.events).toContainEqual(
      expect.objectContaining({
        closedBranch: 'CONSOLE_UNCLASSIFIED',
        assetOrdinal: 1,
        line: 5,
        column: 7,
      }),
    );
    expect(value.events).toContainEqual(
      expect.objectContaining({
        closedBranch: 'PAGE_ERROR',
        errorName: 'TypeError',
        assetOrdinal: 1,
        line: 12,
        column: 34,
      }),
    );
    expect(JSON.stringify(value)).not.toContain('PRIVATE_ERROR_MESSAGE');
    expect(JSON.stringify(value)).not.toContain(asset);
    await h.health.dispose();
  });
  it.each([
    app + asset + '?secret=PRIVATE_TOKEN',
    app + asset + '#PRIVATE_TOKEN',
    'blob:' + app + asset,
    'https://foreign.invalid' + asset,
    app + '/assets/other/../approved.js',
    app + '/assets/unknown.js',
  ])('never exposes or approves the location %s', async (url) => {
    const h = await setup();
    h.consoleError('PRIVATE_TEXT', url);
    const error = {
      name: 'PRIVATE_NAME',
      stack: `PRIVATE\n    at run (${url}:12:34)`,
    };
    h.rawPage.emit('pageerror', error);
    const value = h.health.diagnostics();
    expect(
      value.events.every(
        (e) => e.assetOrdinal === null && e.line === null && e.column === null,
      ),
    ).toBe(true);
    expect(
      value.events.find((e) => e.closedBranch === 'PAGE_ERROR')?.errorName,
    ).toBe('OTHER');
    for (const secret of ['PRIVATE', url])
      expect(JSON.stringify(value)).not.toContain(secret);
    await h.health.dispose();
  });
  it('refuses ambiguous or oversized stacks and normalizes unknown network error text', async () => {
    const h = await setup();
    for (const stack of [
      `Error: PRIVATE\n    at a (${app}${asset}:1:2)\n    at b (${app}${asset}:3:4)`,
      'PRIVATE'.repeat(3000),
      '私'.repeat(6000) + `\n    at run (${app}${asset}:12:34)`,
    ])
      h.rawPage.emit('pageerror', { name: 'PRIVATE_NAME', stack });
    for (const errorText of [
      'net::ERR_CONNECTION_REFUSED',
      'net::PRIVATE_TOKEN',
      'net::NONE',
    ]) {
      h.request(errorText);
      h.cdp.emit('Network.loadingFailed', { requestId: errorText, errorText });
    }
    const value = h.health.diagnostics();
    expect(
      value.events
        .filter((e) => e.closedBranch === 'PAGE_ERROR')
        .every((e) => e.assetOrdinal === null),
    ).toBe(true);
    expect(
      value.events
        .filter((e) => e.closedBranch === 'UNAPPROVED_FAILURE')
        .map((e) => e.networkCode),
    ).toEqual(['ERR_CONNECTION_REFUSED', 'OTHER', 'OTHER']);
    expect(JSON.stringify(value)).not.toContain('PRIVATE');
    await h.health.dispose();
  });
  it('bounds events, keeps the full counts and narrows availability on overflow', async () => {
    const h = await setup();
    for (let i = 0; i < 257; i++) h.consoleError();
    const value = h.health.diagnostics();
    expect(value.events).toHaveLength(256);
    expect(value.droppedCount).toBe(1);
    expect(value.collection).toBe('UNAVAILABLE');
    expect(value.components?.unexpected).toBe(257);
    expect(h.health.snapshot()).toEqual({
      available: false,
      expectedMediaDrops: 0,
      expectedRefreshRejections: 0,
      unexpectedErrors: 257,
    });
    expect(h.health.diagnostics()).toEqual(value);
    await h.health.dispose();
  });
  it('fences a saved successful loadingFinished callback after disposal without changing error counters', async () => {
    const h = await setup();
    h.request('late-success', scope.supabaseUrl + '/rest/v1/rpc/read');
    h.response('late-success', 200);
    const listener = h.cdp.listeners('Network.loadingFinished')[0] as
      ((event: { requestId: string }) => void) | undefined;
    if (!listener) throw Error('EXPECTED_FINISHED_LISTENER');
    await h.health.dispose();
    listener({ requestId: 'late-success' });
    await h.health.settle();
    expect(h.health.snapshot()).toEqual({
      available: false,
      expectedMediaDrops: 0,
      expectedRefreshRejections: 0,
      unexpectedErrors: 0,
    });
    expect(h.health.diagnostics()).toMatchObject({
      collection: 'UNAVAILABLE',
      events: [expect.objectContaining({ closedBranch: 'LATE_EVENT' })],
    });
  });
  it('requires all five counters for OBSERVED but keeps the unavailable/null fallback', () => {
    const base = {
      schemaVersion: 1,
      collection: 'OBSERVED',
      components: null,
      events: [],
      droppedCount: 0,
    };
    expect(functionalHealthDetailsSchema.safeParse(base).success).toBe(false);
    expect(
      functionalHealthDetailsSchema.safeParse({
        ...base,
        collection: 'UNAVAILABLE',
      }).success,
    ).toBe(true);
  });
  it('keeps sealed events readable but marks a genuine saved-listener late callback unavailable', async () => {
    const h = await setup();
    h.consoleError();
    const listener = h.rawPage.listeners('pageerror')[0] as
      ((error: Error) => void) | undefined;
    const before = h.health.diagnostics();
    await h.health.dispose();
    expect(h.health.diagnostics()).toEqual(before);
    if (typeof listener !== 'function')
      throw Error('EXPECTED_INSTALLED_LISTENER');
    listener(new Error('PRIVATE_LATE'));
    const after = h.health.diagnostics();
    expect(after.collection).toBe('UNAVAILABLE');
    expect(after.components?.pageErrors).toBe(1);
    expect(sum(after)).toBe(2);
    expect(after.events).toContainEqual(
      expect.objectContaining({ closedBranch: 'LATE_EVENT' }),
    );
    expect(h.health.snapshot().available).toBe(false);
    expect(after.events[0]).toEqual(before.events[0]);
  });
  it('fails closed on malformed observer input, hostile getters and deep schema extras without exposing them', async () => {
    const h = await setup();
    h.rawPage.emit('pageerror', {
      get name() {
        throw Error('PRIVATE_NAME');
      },
    });
    expect(h.health.diagnostics().collection).toBe('UNAVAILABLE');
    expect(h.health.snapshot().available).toBe(false);
    expect(
      functionalHealthDetailsSchema.safeParse({
        ...h.health.diagnostics(),
        components: {
          ...h.health.diagnostics().components,
          raw: 'PRIVATE_TOKEN',
        },
      }).success,
    ).toBe(false);
    expect(
      functionalHealthDetailsSchema.safeParse({
        ...h.health.diagnostics(),
        events: [{ raw: 'PRIVATE_TOKEN' }],
      }).success,
    ).toBe(false);
    expect(JSON.stringify(h.health.diagnostics())).not.toContain('PRIVATE');
    await h.health.dispose();
  });
});
