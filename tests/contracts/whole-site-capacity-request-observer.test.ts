import { readRegistrationSnapshotDiagnostics } from '../../scripts/concurrency/capacity-registration-final-diagnostics';
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
      send: vi.fn<(method: string, params?: object) => Promise<unknown>>(() =>
        Promise.resolve(),
      ),
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

it('passively reports exact ARM and first matching request, isolates callback throws and preserves original generations', async () => {
  const h = await setup(),
    pulses: unknown[] = [];
  const observer = await createCapacityRequestObserver(
    h.scope,
    h.context as unknown as BrowserContext,
    h.page as unknown as Page,
    0,
    h.signal.signal,
    (value) => {
      pulses.push(value);
      throw Error('PRIVATE_CALLBACK');
    },
  );
  const token = observer.arm('otp_send');
  h.cdp.emit('Network.requestWillBeSent', {
    requestId: 'PRIVATE_REQUEST',
    timestamp: 5,
    request: { url: h.scope.appUrl + '/', method: 'GET' },
  });
  expect(pulses).toHaveLength(1);
  h.cdp.emit('Network.requestWillBeSent', {
    requestId: 'PRIVATE_REQUEST',
    timestamp: 6,
    request: { url: h.scope.supabaseUrl + '/auth/v1/otp', method: 'POST' },
  });
  h.cdp.emit('Network.responseReceived', {
    requestId: 'PRIVATE_REQUEST',
    response: { status: 200 },
  });
  h.cdp.emit('Network.loadingFinished', {
    requestId: 'PRIVATE_REQUEST',
    timestamp: 7,
  });
  expect(await token.finished).toMatchObject({
    requestAtMs: 6000,
    status: 200,
  });
  expect(pulses).toMatchObject([
    { kind: 'ARM', actorOrdinal: 0, generation: 1 },
    { kind: 'REQUEST', actorOrdinal: 0, generation: 1, requestAtCdpMs: 6000 },
  ]);
  expect(Reflect.get(pulses[0] as object, 'token')).toBe(
    Reflect.get(pulses[1] as object, 'token'),
  );
  const second = observer.arm('otp_send');
  second.cancel();
  await expect(second.finished).rejects.toThrow();
  expect(pulses).toMatchObject([
    { kind: 'ARM' },
    { kind: 'REQUEST' },
    { kind: 'ARM', generation: 2 },
    { kind: 'INVALID', generation: 2 },
  ]);
  expect(observer.snapshot().available).toBe(true);
  await observer.dispose();
});

it.each([
  [
    'REQUEST_PARSE',
    'Network.requestWillBeSent',
    {
      requestId: 'PRIVATE',
      timestamp: -1,
      request: { url: 'PRIVATE_SECRET', method: 'POST' },
    },
  ],
  [
    'RESPONSE_PARSE',
    'Network.responseReceived',
    { requestId: 'PRIVATE', response: { status: 99 } },
  ],
  [
    'FINISHED_PARSE',
    'Network.loadingFinished',
    { requestId: 'PRIVATE', timestamp: -1 },
  ],
  [
    'FAILED_PARSE',
    'Network.loadingFailed',
    { requestId: 'PRIVATE', canceled: 'PRIVATE_SECRET' },
  ],
] as const)(
  'latches %s at its actual parser event and never replaces it during disposal',
  async (reason, event, raw) => {
    const h = await setup(),
      observer = await createCapacityRequestObserver(
        h.scope,
        h.context as unknown as BrowserContext,
        h.page as unknown as Page,
        0,
        h.signal.signal,
      );
    h.cdp.emit(event, raw);
    const actual = observer.snapshot();
    expect(actual.available).toBe(false);
    const evidence = readRegistrationSnapshotDiagnostics(actual);
    expect(evidence.firstReason?.reason).toBe(reason);
    await observer.dispose();
    expect(
      readRegistrationSnapshotDiagnostics(observer.snapshot()).firstReason
        ?.reason,
    ).toBe(reason);
    expect(JSON.stringify(evidence)).not.toMatch(/PRIVATE/);
  },
);
it.each(['HTTP_STATUS', 'NETWORK_FAILURE', 'UNARMED_ACTION'] as const)(
  'reports %s without weakening original counters or reading payload',
  async (reason) => {
    const h = await setup(),
      observer = await createCapacityRequestObserver(
        h.scope,
        h.context as unknown as BrowserContext,
        h.page as unknown as Page,
        0,
        h.signal.signal,
      );
    h.cdp.emit('Network.requestWillBeSent', {
      requestId: 'PRIVATE',
      timestamp: 1,
      request: {
        url:
          h.scope.supabaseUrl +
          (reason === 'UNARMED_ACTION' ? '/auth/v1/otp' : '/other'),
        method: 'POST',
      },
    });
    if (reason === 'HTTP_STATUS')
      h.cdp.emit('Network.responseReceived', {
        requestId: 'PRIVATE',
        response: { status: 403 },
      });
    if (reason === 'NETWORK_FAILURE')
      h.cdp.emit('Network.loadingFailed', {
        requestId: 'PRIVATE',
        canceled: false,
      });
    const sample = observer.snapshot(),
      evidence = readRegistrationSnapshotDiagnostics(sample);
    expect(sample.available).toBe(true);
    expect(
      reason === 'HTTP_STATUS'
        ? sample.unexpectedHttpErrors
        : sample.unexpectedNetworkFailures,
    ).toBe(1);
    expect(evidence.firstReason).toMatchObject({
      reason,
      endpoint: reason === 'UNARMED_ACTION' ? 'AUTH_OTP' : 'OTHER_API',
      status: reason === 'HTTP_STATUS' ? 403 : null,
    });
    expect(JSON.stringify(evidence)).not.toContain('PRIVATE');
    await observer.dispose();
  },
);
it('distinguishes action timeout, parent abort and deliberate dispose with original timers drained', async () => {
  for (const reason of ['ACTION_TIMEOUT', 'ABORT', 'DISPOSE'] as const) {
    const h = await setup(),
      observer = await createCapacityRequestObserver(
        h.scope,
        h.context as unknown as BrowserContext,
        h.page as unknown as Page,
        0,
        h.signal.signal,
      );
    vi.useFakeTimers();
    const token = observer.arm('otp_send'),
      rejected = expect(token.finished).rejects.toThrow();
    if (reason === 'ACTION_TIMEOUT') vi.advanceTimersByTime(15000);
    if (reason === 'ABORT') h.signal.abort();
    if (reason === 'DISPOSE') await observer.dispose();
    await rejected;
    expect(
      readRegistrationSnapshotDiagnostics(observer.snapshot()).firstReason
        ?.reason,
    ).toBe(reason);
    await observer.dispose();
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  }
});

import { createCapacityColdEntryDiagnostics } from '../../scripts/concurrency/capacity-cold-entry-diagnostics';
it('actual observer preserves Document evidence and passively seals entry before unrelated navigation', async () => {
  const h = await setup(),
    frame = {},
    child = {};
  Object.assign(h.page, {
    mainFrame: () => frame,
    url: () => h.scope.appUrl + '/',
  });
  const diagnostics = createCapacityColdEntryDiagnostics(1);
  const port = diagnostics.register(0);
  const observer = await createCapacityRequestObserver(
    h.scope,
    h.context as unknown as BrowserContext,
    h.page as unknown as Page,
    0,
    h.signal.signal,
    undefined,
    port,
  );
  const token = observer.arm('entry');
  observer.coldEntry?.note('GOTO_ENTER');
  h.page.emit('framenavigated', child);
  h.page.emit('framenavigated', frame);
  h.cdp.emit('Network.requestWillBeSent', {
    requestId: 'PRIVATE_ENTRY',
    timestamp: 10,
    type: 'Document',
    request: { url: h.scope.appUrl + '/', method: 'GET' },
  });
  h.cdp.emit('Network.responseReceived', {
    requestId: 'PRIVATE_ENTRY',
    response: { status: 200 },
  });
  h.page.emit('domcontentloaded');
  h.page.emit('load');
  observer.coldEntry?.note('GOTO_FULFILLED');
  observer.coldEntry?.note('HEADING_FULFILLED');
  h.cdp.emit('Network.loadingFinished', {
    requestId: 'PRIVATE_ENTRY',
    timestamp: 10.2,
  });
  expect((await token.finished).requestAtMs).toBe(10000);
  const before = diagnostics.snapshot(false);
  expect(before.collection).toBe('OBSERVED');
  expect(
    before.actors[0]?.events.filter((e) => e.kind === 'FRAME_COMMITTED'),
  ).toHaveLength(1);
  h.page.emit('framenavigated', frame);
  h.page.emit('load');
  await observer.dispose();
  expect(diagnostics.snapshot(false)).toEqual(before);
  expect(JSON.stringify(before)).not.toMatch(/PRIVATE_ENTRY|http|frameId/);
  expect(h.cdp.send.mock.calls.map((c) => c[0])).toEqual([
    'Network.enable',
    'Log.enable',
  ]);
  expect(h.page.eventNames()).toHaveLength(0);
});
