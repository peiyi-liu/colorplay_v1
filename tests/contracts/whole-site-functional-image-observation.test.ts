import { runInNewContext } from 'node:vm';
import { readFunctionalImageProof } from '../../scripts/concurrency/functional-image-observation';
import { EventEmitter } from 'node:events';
import type { BrowserContext, CDPSession, Page } from '@playwright/test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFunctionalHealth } from '../../scripts/concurrency/functional-health';
import type { FunctionalStage } from '../../scripts/concurrency/functional-receipt';
import { syntheticScope } from './helpers/whole-site-functional';
const path = '/assets/blooks/synthetic-256.webp';
const app = syntheticScope().appUrl;
const setup = async (
  proof: unknown = { result: 'DECODED' },
  approved = [path],
) => {
  let phase: FunctionalStage | null = 'student_s1';
  let url = `${app}/shop`;
  let closed = false;
  const frame = {};
  const evaluate = vi.fn(() => Promise.resolve(proof));
  const page = Object.assign(new EventEmitter(), {
    isClosed: () => closed,
    opener: () => Promise.resolve(null),
    url: () => url,
    mainFrame: () => frame,
    evaluate,
  });
  const cdp = Object.assign(new EventEmitter(), {
    send: () => Promise.resolve({}),
    detach: () => Promise.resolve(),
  });
  const health = createFunctionalHealth(
    syntheticScope(),
    () => phase,
    [],
    approved,
  );
  await health.attach(
    {
      newCDPSession: () => Promise.resolve(cdp as unknown as CDPSession),
    } as unknown as BrowserContext,
    page as unknown as Page,
  );
  health.identify(page as unknown as Page, 'S1');
  const request = (patch: Record<string, unknown> = {}) =>
    cdp.emit('Network.requestWillBeSent', {
      requestId: 'image1',
      type: 'Image',
      documentURL: url,
      loaderId: 'document1',
      request: { url: `${app}${path}`, method: 'GET' },
      ...patch,
    });
  const cancel = (patch: Record<string, unknown> = {}) =>
    cdp.emit('Network.loadingFailed', {
      requestId: 'image1',
      type: 'Image',
      errorText: 'net::ERR_ABORTED',
      canceled: true,
      ...patch,
    });
  return {
    health,
    page,
    cdp,
    evaluate,
    request,
    cancel,
    identify: (actor: string) => {
      health.identify(page as unknown as Page, actor);
    },
    phase: () => {
      phase = 'teacher_reads';
    },
    navigate: () => {
      page.emit('framenavigated', frame);
    },
    foreign: () => {
      url = 'https://synthetic.invalid/shop';
    },
    close: () => {
      closed = true;
      page.emit('close');
    },
  };
};
afterEach(() => {
  vi.useRealTimers();
});
describe('proven superseded static images retain functional health', () => {
  it.each(['DECODED', 'RETIRED'])(
    'accepts %s proof without claiming HTTP success',
    async (result) => {
      const h = await setup({ result });
      h.request();
      h.cancel();
      await h.health.settle();
      expect(h.health.snapshot()).toEqual({
        available: true,
        expectedMediaDrops: 0,
        expectedRefreshRejections: 0,
        unexpectedErrors: 0,
      });
      expect(h.health.imageDiagnostics().expectedSupersededImages).toBe(1);
      await h.health.dispose();
    },
  );
});

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
describe('image provenance and bounded proof lifecycle', () => {
  it.each(['REJECTED', 'UNAVAILABLE', 'SYNTHETIC_SECRET'])(
    'fails closed on %s DOM result',
    async (result) => {
      const h = await setup({ result });
      h.request();
      h.cancel();
      await h.health.settle();
      expect(h.health.snapshot().unexpectedErrors).toBeGreaterThan(0);
      expect(h.health.imageDiagnostics().expectedSupersededImages).toBe(0);
      expect(
        JSON.stringify([h.health.snapshot(), h.health.imageDiagnostics()]),
      ).not.toContain('SYNTHETIC_SECRET');
      await h.health.dispose();
    },
  );
  it.each([
    { type: 'Script' },
    { documentURL: 'https://synthetic.invalid/shop' },
    { loaderId: '' },
    {
      request: { url: `${app}${path}?private=SYNTHETIC_SECRET`, method: 'GET' },
    },
    { request: { url: `${app}${path}#private`, method: 'GET' } },
    { request: { url: `https://synthetic.invalid${path}`, method: 'GET' } },
    { request: { url: `${app}/assets/unknown.webp`, method: 'GET' } },
    { request: { url: `${app}${path}`, method: 'POST' } },
    { documentURL: undefined },
  ])('rejects unavailable/mismatched request provenance %#', async (patch) => {
    const h = await setup();
    h.request(patch);
    h.cancel();
    await h.health.settle();
    expect(h.evaluate).not.toHaveBeenCalled();
    expect(h.health.snapshot().unexpectedErrors).toBeGreaterThan(0);
    await h.health.dispose();
  });
  it.each([
    'empty',
    'missing',
    'wrong-id',
    'actor',
    'phase',
    'closed',
    'foreign',
    'navigation',
    'reuse',
  ])('rejects %s provenance without a positive exception', async (bad) => {
    const h = await setup({ result: 'DECODED' }, bad === 'empty' ? [] : [path]);
    if (bad !== 'missing') h.request();
    if (bad === 'actor') h.identify('UNOWNED');
    if (bad === 'phase') h.phase();
    if (bad === 'closed') h.close();
    if (bad === 'foreign') h.foreign();
    if (bad === 'navigation') h.navigate();
    if (bad === 'reuse') h.request();
    h.cancel(bad === 'wrong-id' ? { requestId: 'other' } : {});
    await h.health.settle();
    expect(h.health.snapshot().unexpectedErrors).toBeGreaterThan(0);
    expect(h.health.imageDiagnostics().expectedSupersededImages).toBe(0);
    await h.health.dispose();
  });
  it.each([
    { errorText: 'net::ERR_FAILED' },
    { canceled: false },
    { canceled: undefined },
    { type: 'Fetch' },
  ])('requires exact canceled Image ERR_ABORTED %#', async (patch) => {
    const h = await setup();
    h.request();
    h.cancel(patch);
    await h.health.settle();
    expect(h.evaluate).not.toHaveBeenCalled();
    expect(h.health.snapshot().unexpectedErrors).toBeGreaterThan(0);
    await h.health.dispose();
  });
  it.each([
    { status: 404, mimeType: 'image/webp' },
    { status: 200, mimeType: 'text/html' },
    { status: 503, mimeType: 'image/webp' },
  ])('never hides known bad response %#', async (response) => {
    const h = await setup();
    h.request();
    h.cdp.emit('Network.responseReceived', {
      requestId: 'image1',
      type: 'Image',
      response,
    });
    h.cancel();
    await h.health.settle();
    expect(h.health.snapshot().unexpectedErrors).toBeGreaterThan(0);
    expect(h.evaluate).not.toHaveBeenCalled();
    await h.health.dispose();
  });
  it.each([
    ['before', 'status'],
    ['pending', 'status'],
    ['after', 'status'],
    ['before', 'mime'],
    ['pending', 'mime'],
    ['after', 'mime'],
    ['pending', 'duplicate'],
    ['after', 'duplicate'],
  ] as const)(
    'invalidates %s proof on contradictory %s event',
    async (when, contradiction) => {
      const h = await setup();
      const d = deferred<{ result: string }>();
      h.evaluate.mockReturnValue(d.promise);
      h.request();
      if (when !== 'before') h.cancel();
      if (when === 'after') {
        d.resolve({ result: 'DECODED' });
        await h.health.settle();
      } else {
        await Promise.resolve();
        await Promise.resolve();
      }
      if (contradiction === 'duplicate') h.request();
      else
        h.cdp.emit('Network.responseReceived', {
          requestId: 'image1',
          type: 'Image',
          response: {
            status: contradiction === 'status' ? 404 : 200,
            mimeType: contradiction === 'mime' ? 'text/html' : 'image/webp',
          },
        });
      if (when === 'before') h.cancel();
      if (when !== 'after') d.resolve({ result: 'DECODED' });
      await h.health.settle();
      // Keep historical classified counts; contradictions can never leave healthy evidence.
      expect(h.health.snapshot().available).toBe(false);
      expect(h.health.imageDiagnostics().imageProofUnavailable).toBeGreaterThan(
        0,
      );
      expect(h.health.imageDiagnostics().expectedSupersededImages).toBe(
        when === 'after' ? 1 : 0,
      );
      await h.health.dispose();
    },
  );
  it('accepts known successful webp response but does not reconcile any console or duplicate', async () => {
    const h = await setup();
    h.request();
    h.cdp.emit('Network.responseReceived', {
      requestId: 'image1',
      type: 'Image',
      response: { status: 200, mimeType: 'image/webp' },
    });
    h.cancel();
    await h.health.settle();
    h.cancel();
    h.page.emit('console', {
      type: () => 'error',
      text: () => 'SYNTHETIC_SECRET',
      location: () => ({ url: `${app}${path}` }),
    });
    h.page.emit('pageerror', new Error('SYNTHETIC_SECRET'));
    expect(h.health.imageDiagnostics().expectedSupersededImages).toBe(1);
    expect(h.health.snapshot().unexpectedErrors).toBe(3);
    await h.health.dispose();
  });
  it.each([
    'phase',
    'navigate',
    'foreign',
    'close',
    'dispose',
    'timeout',
  ] as const)('does not accept late proof after %s', async (stop) => {
    vi.useFakeTimers();
    const d = deferred<{ result: string }>();
    const h = await setup();
    h.evaluate.mockReturnValue(d.promise);
    h.request();
    h.cancel();
    await Promise.resolve();
    await Promise.resolve();
    expect(h.health.snapshot().available).toBe(false);
    if (stop === 'phase') h.phase();
    if (stop === 'navigate') h.navigate();
    if (stop === 'foreign') h.foreign();
    if (stop === 'close') h.close();
    if (stop === 'dispose') await h.health.dispose();
    if (stop === 'timeout') await vi.advanceTimersByTimeAsync(15_000);
    d.resolve({ result: 'DECODED' });
    await h.health.settle();
    expect(h.health.imageDiagnostics().expectedSupersededImages).toBe(0);
    expect(h.health.imageDiagnostics().imageProofUnavailable).toBe(1);
    expect(h.health.snapshot().available).toBe(false);
    expect(h.health.imageDiagnostics().pendingImageProofs).toBe(0);
    await h.health.dispose();
    expect(h.page.listenerCount('framenavigated')).toBe(0);
    expect(h.page.listenerCount('close')).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('observes rejected evaluation immediately and bounds retained request provenance', async () => {
    const h = await setup();
    h.evaluate.mockImplementation(() =>
      Promise.reject(new Error('SYNTHETIC_SECRET')),
    );
    h.request();
    h.cancel();
    await h.health.settle();
    expect(h.health.imageDiagnostics().imageProofUnavailable).toBe(1);
    for (let i = 0; i < 2001; i++)
      h.request({ requestId: `bounded${String(i)}` });
    expect(h.health.snapshot().available).toBe(false);
    await h.health.dispose();
  });
});

const domProof = (
  options: {
    src?: string;
    current?: string;
    srcset?: string;
    complete?: boolean;
    width?: number;
    visible?: boolean;
    empty?: boolean;
    foreign?: boolean;
    query?: boolean;
    root?: boolean;
  } = {},
) => {
  const documentUrl = `${app}/shop`;
  const image = {
    getAttribute: (name: string) =>
      name === 'src'
        ? (options.src ?? `${app}${path}`)
        : name === 'srcset'
          ? (options.srcset ?? '')
          : null,
    currentSrc: options.current ?? `${app}${path}`,
    complete: options.complete ?? true,
    naturalWidth: options.width ?? 128,
    getBoundingClientRect: () => ({
      width: options.visible === false ? 0 : 128,
      height: 128,
    }),
  };
  return runInNewContext(`(${readFunctionalImageProof.toString()})(input)`, {
    URL,
    input: {
      origin: app,
      pathname: path,
      documentUrl,
      approved: [path, '/assets/blooks/synthetic-128.webp'],
    },
    location: {
      href: options.foreign
        ? 'https://synthetic.invalid/shop'
        : options.query
          ? `${documentUrl}?secret=marker`
          : documentUrl,
    },
    document: {
      readyState: 'complete',
      baseURI: documentUrl,
      body: { isConnected: true },
      getElementById: () =>
        options.root === false ? null : { isConnected: true },
      querySelectorAll: () => ({
        length: options.empty ? 0 : 1,
        item: () => image,
      }),
    },
    getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
  }) as unknown;
};
describe('self-contained DOM proof in a fresh serialized realm', () => {
  it('proves a decoded responsive candidate and explicitly labels retired images', () => {
    expect(
      domProof({
        current: `${app}/assets/blooks/synthetic-128.webp`,
        srcset: `${app}/assets/blooks/synthetic-128.webp 128w, ${app}${path} 256w`,
      }),
    ).toEqual({ result: 'DECODED' });
    expect(domProof({ empty: true })).toEqual({ result: 'RETIRED' });
    expect(domProof({ visible: false })).toEqual({ result: 'RETIRED' });
  });
  it.each([
    { complete: false },
    { width: 0 },
    { current: 'https://synthetic.invalid/assets/blooks/synthetic-256.webp' },
    { src: `${app}${path}?secret=marker` },
    { srcset: `https://synthetic.invalid${path} 256w` },
    { current: `${app}${path}#marker` },
    { srcset: `${app}${path} invalid` },
  ])('does not reduce full URL/proof %# to a pathname match', (options) => {
    expect(domProof(options)).not.toEqual({ result: 'DECODED' });
    expect(domProof(options)).not.toEqual({ result: 'RETIRED' });
  });
  it.each([{ foreign: true }, { query: true }, { root: false }])(
    'rejects unusable/changed document %#',
    (options) => {
      expect(domProof(options)).toEqual({ result: 'UNAVAILABLE' });
    },
  );
});
