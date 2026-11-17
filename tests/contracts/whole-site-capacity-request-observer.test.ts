import { EventEmitter } from 'node:events';
import type { BrowserContext, Page } from '@playwright/test';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createCapacityRequestObserver } from '../../scripts/concurrency/capacity-request-observer';
import { parseCapacityScope } from '../../scripts/concurrency/capacity-scope';
import { capacityFixture } from './helpers/whole-site-capacity';
const setup = async () => {
  const h = await capacityFixture(),
    scope = parseCapacityScope(h.input, h.proof),
    cdp = Object.assign(new EventEmitter(), {
      send: vi.fn(() => Promise.resolve()),
      detach: vi.fn(() => Promise.resolve()),
    }),
    page = Object.assign(new EventEmitter(), { isClosed: () => false }),
    context = { newCDPSession: vi.fn(() => Promise.resolve(cdp)) };
  return { scope, cdp, page, context, signal: new AbortController() };
};
afterEach(() => vi.useRealTimers());
describe('native CDP action observation without raw payload or Playwright call-start substitution', () => {
  it('uses physical request timestamp and settled HTTP response; ignores call start and does not read body', async () => {
    const h = await setup();
    const observer = await createCapacityRequestObserver(
      h.scope,
      h.context as unknown as BrowserContext,
      h.page as unknown as Page,
      0,
      h.signal.signal,
    );
    const action = observer.arm('login');
    h.cdp.emit('Network.requestWillBeSent', {
      requestId: 'PRIVATE_ID',
      timestamp: 5,
      type: 'Fetch',
      request: {
        url: h.scope.supabaseUrl + '/functions/v1/auth-login',
        method: 'POST',
        get postData() {
          throw new Error('SYNTHETIC_SECRET');
        },
      },
    });
    h.cdp.emit('Network.responseReceived', {
      requestId: 'PRIVATE_ID',
      response: { status: 200 },
    });
    h.cdp.emit('Network.loadingFinished', {
      requestId: 'PRIVATE_ID',
      timestamp: 5.2,
    });
    const result = await action.finished;
    expect(result.requestAtMs).toBe(5000);
    expect(result.durationMs).toBeCloseTo(200);
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_ID|SYNTHETIC_SECRET/);
    await observer.dispose();
    expect(h.cdp.listenerCount('Network.requestWillBeSent')).toBe(0);
  });
  it('fails closed on duplicate physical mutation, abort and unavailable CDP without late PASS', async () => {
    const h = await setup();
    const observer = await createCapacityRequestObserver(
      h.scope,
      h.context as unknown as BrowserContext,
      h.page as unknown as Page,
      0,
      h.signal.signal,
    );
    const action = observer.arm('otp_send');
    for (let i = 0; i < 2; i++)
      h.cdp.emit('Network.requestWillBeSent', {
        requestId: String(i),
        timestamp: 5 + i,
        type: 'Fetch',
        request: { url: h.scope.supabaseUrl + '/auth/v1/otp', method: 'POST' },
      });
    await expect(action.finished).rejects.toThrow('CAPACITY_EVIDENCE_INVALID');
    h.signal.abort();
    await observer.dispose();
    expect(observer.snapshot().available).toBe(false);
  });
  it('immediately observes pending rejection and removes all timers/listeners on abort, ignoring late completion', async () => {
    const h = await setup();
    const observer = await createCapacityRequestObserver(
      h.scope,
      h.context as unknown as BrowserContext,
      h.page as unknown as Page,
      0,
      h.signal.signal,
    );
    vi.useFakeTimers();
    const token = observer.arm('otp_verify');
    const rejected = expect(token.finished).rejects.toThrow(
      'CAPACITY_EVIDENCE_INVALID',
    );
    h.signal.abort();
    await rejected;
    await observer.dispose();
    h.cdp.emit('Network.loadingFinished', {
      requestId: 'LATE_PRIVATE',
      timestamp: 999,
    });
    expect(vi.getTimerCount()).toBe(0);
    expect(observer.snapshot().actionsCompleted).toBe(0);
    expect(h.cdp.listenerCount('Network.loadingFinished')).toBe(0);
  });
});
it.each([
  [
    'Network.responseReceived',
    { requestId: 'unknown', response: { status: 99 } },
  ],
  ['Network.loadingFinished', { requestId: 'unknown', timestamp: -1 }],
  ['Network.loadingFailed', { requestId: 'unknown', canceled: 'INVALID' }],
] as const)(
  'reused %s parser still rejects malformed non-target data while an action is pending',
  async (event, raw) => {
    const h = await setup(),
      observer = await createCapacityRequestObserver(
        h.scope,
        h.context as unknown as BrowserContext,
        h.page as unknown as Page,
        0,
        h.signal.signal,
      );
    const token = observer.arm('entry'),
      rejected = expect(token.finished).rejects.toThrow(
        'CAPACITY_EVIDENCE_INVALID',
      );
    h.cdp.emit(event, raw);
    await rejected;
    expect(observer.snapshot()).toMatchObject({
      available: false,
      actionsCompleted: 0,
      pendingAction: false,
    });
    await observer.dispose();
    expect(h.cdp.eventNames()).toHaveLength(0);
  },
);
it('shared schemas preserve independent action generations and request IDs across scopes', async () => {
  const a = await setup(),
    b = await setup();
  expect(a.scope).not.toBe(b.scope);
  const make = (h: typeof a) =>
    createCapacityRequestObserver(
      h.scope,
      h.context as unknown as BrowserContext,
      h.page as unknown as Page,
      0,
      h.signal.signal,
    );
  const first = await make(a),
    second = await make(b),
    one = first.arm('entry'),
    two = second.arm('entry');
  const request = (h: typeof a) => {
    h.cdp.emit('Network.requestWillBeSent', {
      requestId: 'same',
      timestamp: 1,
      type: 'Document',
      request: { url: h.scope.appUrl + '/', method: 'GET' },
    });
  };
  request(a);
  request(b);
  a.cdp.emit('Network.responseReceived', {
    requestId: 'same',
    response: { status: 200 },
  });
  a.cdp.emit('Network.loadingFinished', { requestId: 'same', timestamp: 2 });
  await one.finished;
  expect(first.snapshot()).toMatchObject({
    available: true,
    actionsCompleted: 1,
    pendingAction: false,
  });
  expect(second.snapshot()).toMatchObject({
    available: true,
    actionsCompleted: 0,
    pendingAction: true,
  });
  const rejected = expect(two.finished).rejects.toThrow(
    'CAPACITY_EVIDENCE_INVALID',
  );
  b.signal.abort();
  await rejected;
  await Promise.all([first.dispose(), second.dispose()]);
  expect(a.cdp.eventNames()).toHaveLength(0);
  expect(b.cdp.eventNames()).toHaveLength(0);
});
