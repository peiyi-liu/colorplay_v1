import { afterEach, describe, expect, it, vi } from 'vitest';
import { app, setup, deferred } from './helpers/whole-site-functional-image';
afterEach(() => {
  vi.useRealTimers();
});
describe('same-document image provenance via actual public health', () => {
  it.each(['historyApi', 'fragment'] as const)(
    'accepts a new image after %s without changing loader',
    async (navigationType) => {
      const h = await setup();
      h.request();
      h.cancel();
      await h.health.settle();
      h.sameDocument(
        navigationType === 'fragment' ? `${app}/shop#details` : `${app}/app`,
        { navigationType },
      );
      h.request({ requestId: 'image2' });
      h.cancel({ requestId: 'image2' });
      await h.health.settle();
      expect(h.health.snapshot()).toMatchObject({
        available: true,
        unexpectedErrors: 0,
      });
      expect(h.health.imageDiagnostics().expectedSupersededImages).toBe(2);
      await h.health.dispose();
    },
  );
});

describe('SPA retains provenance and fences old document URLs', () => {
  it.each([
    'foreign-origin',
    'credentials',
    'wrong-frame',
    'malformed-frame',
    'malformed-url',
    'unknown-kind',
  ])('cannot grant a proof through %s navigation', async (bad) => {
    const h = await setup();
    const next =
      bad === 'foreign-origin'
        ? 'https://foreign.invalid/app'
        : bad === 'credentials'
          ? `http://user:synthetic@127.0.0.1:58373/app`
          : `${app}/app`;
    const patch: Record<string, unknown> = {};
    if (bad === 'wrong-frame') patch.frameId = 'other-frame';
    if (bad === 'malformed-frame') patch.frameId = '';
    if (bad === 'malformed-url') patch.url = undefined;
    if (bad === 'unknown-kind') patch.navigationType = 'unknown';
    h.sameDocument(next, patch);
    h.request();
    h.cancel();
    await h.health.settle();
    expect(
      h.health.snapshot().available &&
        h.health.snapshot().unexpectedErrors === 0,
    ).toBe(false);
    expect(h.health.imageDiagnostics().expectedSupersededImages).toBe(0);
    await h.health.dispose();
  });
  it.each(['mixed-id', 'overflow'] as const)(
    'does not wash %s history by changing only the SPA URL',
    async (mode) => {
      const h = await setup();
      const count = mode === 'overflow' ? 2001 : 1;
      for (let i = 0; i < count; i++) {
        const requestId = mode === 'mixed-id' ? 'image1' : `script${String(i)}`;
        h.request({
          requestId,
          type: 'Script',
          request: { url: `${app}/assets/main.js`, method: 'GET' },
        });
        h.cdp.emit('Network.responseReceived', {
          requestId,
          type: 'Script',
          response: { status: 200, mimeType: 'text/javascript' },
        });
        h.cdp.emit('Network.loadingFinished', { requestId });
        await h.health.settle();
      }
      expect(h.health.snapshot()).toMatchObject({
        available: true,
        unexpectedErrors: 0,
      });
      h.sameDocument(`${app}/app`);
      h.request();
      h.cancel();
      await h.health.settle();
      expect(h.health.imageDiagnostics().expectedSupersededImages).toBe(0);
      expect(h.health.snapshot().unexpectedErrors).toBeGreaterThan(0);
      await h.health.dispose();
    },
  );
  it('immediately cancels old-URL pending proof and a late decoded result cannot upgrade it', async () => {
    vi.useFakeTimers();
    const d = deferred<{ result: string }>(),
      h = await setup();
    h.evaluate.mockReturnValue(d.promise);
    h.request();
    h.cancel();
    await Promise.resolve();
    await Promise.resolve();
    h.sameDocument(`${app}/app`);
    await h.health.settle();
    const before = h.health.imageDiagnostics();
    expect(before).toMatchObject({
      expectedSupersededImages: 0,
      imageProofUnavailable: 1,
      pendingImageProofs: 0,
    });
    d.resolve({ result: 'DECODED' });
    await Promise.resolve();
    await Promise.resolve();
    expect(h.health.imageDiagnostics()).toEqual(before);
    expect(h.health.snapshot().available).toBe(false);
    await h.health.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('keeps accepted old IDs for late poison and removes both navigation listeners on disposal', async () => {
    const h = await setup();
    h.request();
    h.cancel();
    await h.health.settle();
    h.sameDocument(`${app}/app`);
    h.cdp.emit('Network.responseReceived', {
      requestId: 'image1',
      type: 'Image',
      response: { status: 200, mimeType: 'text/html' },
    });
    expect(h.health.imageDiagnostics().expectedSupersededImages).toBe(1);
    expect(h.health.snapshot().available).toBe(false);
    await h.health.dispose();
    expect(h.cdp.listenerCount('Page.navigatedWithinDocument')).toBe(0);
    expect(h.cdp.listenerCount('Page.frameNavigated')).toBe(0);
    const before = h.health.imageDiagnostics();
    h.sameDocument(`${app}/shop`);
    expect(h.health.imageDiagnostics()).toEqual(before);
  });
});
