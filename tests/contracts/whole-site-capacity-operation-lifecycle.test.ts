import { EventEmitter } from 'node:events';
import type { BrowserContext, Page } from '@playwright/test';
import { afterEach, expect, it, vi } from 'vitest';
import { createCapacityOperationObserver } from '../../scripts/concurrency/capacity-operation-observer';
import { capacityFixture } from './helpers/whole-site-capacity';
import { parseCapacityScope } from '../../scripts/concurrency/capacity-scope';
const fixture = async (
  options: {
    enableFailed?: boolean;
    now?: () => number;
    business?: () => boolean;
  } = {},
) => {
  const f = await capacityFixture(),
    scope = parseCapacityScope(f.input, f.proof);
  const cdp = Object.assign(new EventEmitter(), {
    send: vi.fn(() =>
      options.enableFailed
        ? Promise.reject(Error('PRIVATE_ENABLE_ERROR'))
        : Promise.resolve(undefined),
    ),
    detach: vi.fn(() => Promise.resolve(undefined)),
  });
  const signal = new AbortController();
  let ordinal = 0;
  const observer = await createCapacityOperationObserver(
    scope,
    { newCDPSession: () => Promise.resolve(cdp) } as unknown as BrowserContext,
    { isClosed: () => false } as Page,
    0,
    signal.signal,
    () => `op-${String(++ordinal).padStart(6, '0')}`,
    options.business ?? (() => true),
    options.now ?? (() => 123),
  );
  const request = (id = 'PRIVATE_REQUEST_ID', timestamp = 1) =>
    cdp.emit('Network.requestWillBeSent', {
      requestId: id,
      timestamp,
      request: {
        url: scope.supabaseUrl + '/rest/v1/rpc/teacher_classroom_overview',
        method: 'POST',
      },
    });
  const response = (status = 200) =>
    cdp.emit('Network.responseReceived', {
      requestId: 'PRIVATE_REQUEST_ID',
      response: { status },
    });
  return { observer, cdp, signal, request, response };
};
afterEach(() => vi.useRealTimers());
it('preserves original returned action and deadline sample, but explains the first pending failure without raw identity', async () => {
  vi.useFakeTimers();
  const f = await fixture();
  const result = f.observer.run('teacher_dashboard', 'cold', () => {
    f.request();
    f.response();
    return Promise.resolve('ACTION_RETURNED');
  });
  await vi.advanceTimersByTimeAsync(15000);
  expect(await result).toBe('ACTION_RETURNED');
  expect(f.observer.snapshot()).toMatchObject({ available: false, pending: 1 });
  expect(f.observer.samples()[0]).toMatchObject({
    status: 'error',
    attempts: [{ startedAtMs: 1000, finishedAtMs: null }],
  });
  const port = f.observer as typeof f.observer & {
    operationLifecycle?: () => unknown;
  };
  expect(port.operationLifecycle).toBeTypeOf('function');
  expect(port.operationLifecycle()).toMatchObject({
    collection: 'OBSERVED',
    firstInvalid: { reason: 'SETTLE_DEADLINE' },
    firstSettleDeadline: { reason: 'SETTLE_DEADLINE' },
    pendingAtFirstInvalid: [{ ordinal: 1, status: 200, endCdpMs: null }],
  });
  expect(JSON.stringify(port.operationLifecycle())).not.toMatch(
    /PRIVATE_REQUEST_ID|\/rest\/|http:/,
  );
  await f.observer.dispose();
  expect(vi.getTimerCount()).toBe(0);
});

it.each([
  ['Network.requestWillBeSent', { timestamp: -1 }, 'REQUEST_SCHEMA'],
  [
    'Network.responseReceived',
    { response: { status: 600 } },
    'RESPONSE_SCHEMA',
  ],
  ['Network.loadingFinished', { timestamp: -1 }, 'FINISH_SCHEMA'],
  ['Network.loadingFailed', { requestId: 7 }, 'FAILED_SCHEMA'],
] as const)(
  'captures first invalid %s without changing original availability or overwriting after abort',
  async (event, bad, reason) => {
    const f = await fixture();
    f.cdp.emit(event, bad);
    f.signal.abort();
    await f.observer.dispose();
    expect(f.observer.snapshot().available).toBe(false);
    expect(f.observer.operationLifecycle()).toMatchObject({
      collection: 'OBSERVED',
      firstInvalid: { reason, pending: 0, nodeAtMs: 123 },
    });
    expect(f.cdp.eventNames()).toHaveLength(0);
  },
);
it.each([
  'duplicate',
  'service worker',
  'backwards',
  'abort',
  'failed',
  'action error',
] as const)(
  'keeps original outcome and captures %s lifecycle',
  async (mode) => {
    const f = await fixture();
    const sentinel = Error('PRIVATE_ERROR_TEXT');
    const result = f.observer.run('teacher_dashboard', 'warm', () => {
      f.request();
      if (mode === 'duplicate') f.request();
      if (mode === 'service worker')
        f.cdp.emit('Network.responseReceived', {
          requestId: 'PRIVATE_REQUEST_ID',
          response: { status: 200, fromServiceWorker: true },
        });
      else f.response();
      if (mode === 'abort') f.signal.abort();
      if (mode === 'failed')
        f.cdp.emit('Network.loadingFailed', {
          requestId: 'PRIVATE_REQUEST_ID',
          timestamp: 2,
          errorText: 'net::ERR_ABORTED',
        });
      else
        f.cdp.emit('Network.loadingFinished', {
          requestId: 'PRIVATE_REQUEST_ID',
          timestamp: mode === 'backwards' ? 0.5 : 2,
        });
      return mode === 'action error'
        ? Promise.reject(sentinel)
        : Promise.resolve('RETURNED');
    });
    if (mode === 'action error')
      await expect(result).rejects.toThrow('CAPACITY_EVIDENCE_INVALID');
    else expect(await result).toBe('RETURNED');
    const row = f.observer.samples()[0];
    expect(row?.status).toBe(mode === 'abort' ? 'timeout' : 'error');
    const diag = f.observer.operationLifecycle();
    expect(diag.firstInvalid?.reason ?? null).toBe(
      {
        duplicate: 'REQUEST_DUPLICATE',
        'service worker': 'SERVICE_WORKER',
        backwards: 'FINISH_BEFORE_START',
        abort: 'ABORT',
        failed: null,
        'action error': null,
      }[mode],
    );
    if (mode === 'failed')
      expect(diag.events.find((e) => e.kind === 'FAILED')?.failureCode).toBe(
        'ERR_ABORTED',
      );
    if (mode === 'action error')
      expect(diag.events.some((e) => e.kind === 'ACTION_FAILED')).toBe(true);
    expect(JSON.stringify(diag)).not.toMatch(/PRIVATE_|requestId|http:/);
    expect(Object.isFrozen(diag.events)).toBe(true);
    await f.observer.dispose();
    expect(f.observer.operationLifecycle()).toEqual(diag);
  },
);
it.each([0, 1, 2])(
  'normal cold/warm %i-request windows keep sample bytes and become sealed after normal dispose',
  async (count) => {
    const f = await fixture();
    await f.observer.run('teacher_dashboard', 'cold', () => {
      for (let i = 0; i < count; i++) {
        f.request();
        f.response();
        f.cdp.emit('Network.loadingFinished', {
          requestId: 'PRIVATE_REQUEST_ID',
          timestamp: 2,
        });
      }
      return Promise.resolve();
    });
    expect(f.observer.samples()[0]).toMatchObject({
      status: 'success',
      attempts: Array.from({ length: count }, () => ({
        startedAtMs: 1000,
        finishedAtMs: 2000,
      })),
      duringStudentBusinessLoad: true,
      cache: count ? 'cold' : 'hit',
    });
    await f.observer.dispose();
    const diag = f.observer.operationLifecycle();
    expect(diag).toMatchObject({
      collection: 'OBSERVED',
      firstInvalid: null,
      firstSettleDeadline: null,
      pendingTotal: 0,
    });
    expect(diag.events.at(-1)?.kind).toBe('DISPOSE');
    expect(f.cdp.detach).toHaveBeenCalledTimes(1);
  },
);
it('late finish cannot erase captured deadline or mutate a sealed snapshot; original pending still settles as before', async () => {
  vi.useFakeTimers();
  const f = await fixture();
  const run = f.observer.run('teacher_dashboard', 'cold', () => {
    f.request();
    return Promise.resolve();
  });
  await vi.advanceTimersByTimeAsync(15000);
  await run;
  const diag = f.observer.operationLifecycle();
  f.cdp.emit('Network.loadingFinished', {
    requestId: 'PRIVATE_REQUEST_ID',
    timestamp: 3,
  });
  expect(f.observer.snapshot().pending).toBe(0);
  expect(f.observer.operationLifecycle()).toEqual(diag);
  expect(diag.pendingAtFirstInvalid[0]).toMatchObject({
    endCdpMs: null,
    status: null,
  });
  await f.observer.dispose();
  expect(vi.getTimerCount()).toBe(0);
});
it('overlapping run stays rejected and preserves the original active window', async () => {
  const f = await fixture();
  let release: (() => void) | undefined;
  const run = f.observer.run(
    'teacher_dashboard',
    'warm',
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  await expect(
    f.observer.run('leaderboard', 'cold', () => Promise.resolve()),
  ).rejects.toThrow('CAPACITY_EVIDENCE_INVALID');
  release?.();
  await run;
  expect(f.observer.samples()).toHaveLength(1);
  expect(
    f.observer
      .operationLifecycle()
      .events.some((e) => e.kind === 'RUN_REFUSED'),
  ).toBe(true);
  await f.observer.dispose();
});
it('bounds first/tail events and pending capture without losing first failure or changing the original 4096 guard', async () => {
  const f = await fixture();
  await expect(
    f.observer.run('teacher_dashboard', 'cold', () => {
      for (let i = 0; i < 4097; i++) f.request(`PRIVATE_${String(i)}`);
      return Promise.resolve();
    }),
  ).rejects.toMatchObject({ name: 'ZodError' });
  expect(f.observer.snapshot()).toMatchObject({
    pending: 4096,
    physicalRequests: 4097,
    available: false,
  });
  const diag = f.observer.operationLifecycle();
  expect(diag).toMatchObject({
    collection: 'UNAVAILABLE',
    overflow: true,
    firstInvalid: { reason: 'ATTEMPT_CAP', pending: 65 },
    pendingTotal: 65,
    pendingCaptured: 64,
  });
  expect(diag.events.length).toBeLessThanOrEqual(32);
  expect(Buffer.byteLength(JSON.stringify(diag))).toBeLessThanOrEqual(16384);
  await f.observer.dispose();
});
it('Network.enable failure remains authoritative unavailable, without losing its first reason at dispose', async () => {
  const f = await fixture({ enableFailed: true });
  await expect(
    f.observer.run('teacher_dashboard', 'cold', () => Promise.resolve()),
  ).rejects.toThrow('CAPACITY_EVIDENCE_INVALID');
  await f.observer.dispose();
  expect(f.observer.operationLifecycle()).toMatchObject({
    firstInvalid: { reason: 'NETWORK_ENABLE', pending: 0 },
    collection: 'OBSERVED',
  });
  expect(f.cdp.send).toHaveBeenCalledExactlyOnceWith('Network.enable', {
    maxPostDataSize: 0,
  });
});
it('passive clock error changes only the new diagnostic, not original returned value/sample or cleanup', async () => {
  const f = await fixture({
    now: () => {
      throw Error('PRIVATE_CLOCK');
    },
  });
  expect(
    await f.observer.run('teacher_dashboard', 'warm', () =>
      Promise.resolve(42),
    ),
  ).toBe(42);
  expect(f.observer.snapshot().available).toBe(true);
  expect(f.observer.samples()[0]).toMatchObject({
    status: 'success',
    cache: 'hit',
  });
  await f.observer.dispose();
  expect(f.observer.operationLifecycle()).toMatchObject({
    collection: 'UNAVAILABLE',
    firstInvalid: null,
  });
  expect(JSON.stringify(f.observer.operationLifecycle())).not.toContain(
    'PRIVATE_CLOCK',
  );
});
it('student window ending during action keeps original during predicate; duplicate terminal callbacks stay harmless', async () => {
  let active = true;
  const f = await fixture({ business: () => active });
  await f.observer.run('teacher_dashboard', 'cold', () => {
    f.request();
    f.response();
    f.response();
    active = false;
    f.cdp.emit('Network.loadingFinished', {
      requestId: 'PRIVATE_REQUEST_ID',
      timestamp: 2,
    });
    f.cdp.emit('Network.loadingFinished', {
      requestId: 'PRIVATE_REQUEST_ID',
      timestamp: 3,
    });
    f.cdp.emit('Network.loadingFailed', {
      requestId: 'PRIVATE_REQUEST_ID',
      timestamp: 4,
    });
    return Promise.resolve();
  });
  expect(f.observer.samples()[0]).toMatchObject({
    status: 'success',
    finishedAtMs: 2000,
    duringStudentBusinessLoad: false,
  });
  expect(f.observer.operationLifecycle().firstInvalid).toBeNull();
  await f.observer.dispose();
});
it('dispose resolves an original pending settle without inventing a diagnostic first invalidation', async () => {
  vi.useFakeTimers();
  const f = await fixture();
  const run = f.observer.run('teacher_dashboard', 'cold', () => {
    f.request();
    return Promise.resolve();
  });
  await Promise.resolve();
  await f.observer.dispose();
  await run;
  expect(vi.getTimerCount()).toBe(0);
  expect(f.observer.samples()[0]?.status).toBe('error');
  expect(f.observer.operationLifecycle().firstInvalid).toBeNull();
});
it.each(['constructor', 'PRIVATE_RAW_FAILURE', 'getter'] as const)(
  'keeps %s failure detail closed without invoking getters',
  async (text) => {
    const f = await fixture(),
      getter = vi.fn(() => 'PRIVATE_GETTER_SECRET');
    await f.observer.run('teacher_dashboard', 'cold', () => {
      f.request();
      const raw = { requestId: 'PRIVATE_REQUEST_ID', timestamp: 2 };
      Object.defineProperty(
        raw,
        'errorText',
        text === 'getter' ? { get: getter } : { value: text },
      );
      f.cdp.emit('Network.loadingFailed', raw);
      return Promise.resolve();
    });
    expect(getter).not.toHaveBeenCalled();
    expect(
      f.observer.operationLifecycle().events.find((e) => e.kind === 'FAILED')
        ?.failureCode,
    ).toBe('OTHER');
    expect(JSON.stringify(f.observer.operationLifecycle())).not.toMatch(
      /PRIVATE_|constructor/,
    );
    await f.observer.dispose();
  },
);
