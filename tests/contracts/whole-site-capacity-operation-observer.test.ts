import { EventEmitter } from 'node:events';
import type { BrowserContext, Page } from '@playwright/test';
import { describe, expect, it, vi } from 'vitest';
import { createCapacityOperationObserver } from '../../scripts/concurrency/capacity-operation-observer';
import { capacityFixture } from './helpers/whole-site-capacity';
import { parseCapacityScope } from '../../scripts/concurrency/capacity-scope';
const fixture = async (
  timing?: Parameters<typeof createCapacityOperationObserver>[8],
) => {
  const f = await capacityFixture(),
    scope = parseCapacityScope(f.input, f.proof),
    cdp = Object.assign(new EventEmitter(), {
      send: vi.fn(async () => {
        await Promise.resolve();
        return undefined;
      }),
      detach: vi.fn(async () => {
        await Promise.resolve();
        return undefined;
      }),
    }),
    context = {
      newCDPSession: async () => {
        await Promise.resolve();
        return cdp;
      },
    },
    page = { isClosed: () => false },
    signal = new AbortController();
  let id = 0;
  const observer = await createCapacityOperationObserver(
    scope,
    context as unknown as BrowserContext,
    page as Page,
    1,
    signal.signal,
    () => `op-${String(++id).padStart(6, '0')}`,
    () => true,
    undefined,
    timing,
  );
  return { scope, cdp, observer, signal };
};
describe('native five-operation physical measurement', () => {
  it('measures exact browser HTTP attempts including intervening retry gap, without reading postData', async () => {
    const f = await fixture();
    await f.observer.run('published_content', 'cold', async () => {
      await Promise.resolve();
      for (const [i, status] of [503, 200].entries()) {
        f.cdp.emit('Network.requestWillBeSent', {
          requestId: `secret${String(i)}`,
          timestamp: 100 + i * 2,
          request: {
            url: f.scope.supabaseUrl + '/rest/v1/rpc/get_student_chapter_map',
            method: 'POST',
            get postData() {
              throw Error('SECRET_MARKER');
            },
          },
        });
        f.cdp.emit('Network.responseReceived', {
          requestId: `secret${String(i)}`,
          response: { status },
        });
        f.cdp.emit('Network.loadingFinished', {
          requestId: `secret${String(i)}`,
          timestamp: 100.1 + i * 2,
        });
      }
    });
    const [sample] = f.observer.samples();
    expect(sample?.finishedAtMs).toBe(102100);
    expect(sample?.startedAtMs).toBe(100000);
    expect(sample?.attempts).toHaveLength(2);
    expect(sample?.status).toBe('success');
    expect(JSON.stringify(sample)).not.toMatch(/secret|SECRET_MARKER/);
    await f.observer.dispose();
    expect(f.cdp.listenerCount('Network.requestWillBeSent')).toBe(0);
  });
  it('keeps errors for an unsuccessful replay and refuses foreign origins/unknown methods', async () => {
    const f = await fixture();
    await expect(
      f.observer.run(
        'submit_answer',
        'warm',
        async () => {
          await Promise.resolve();
          f.cdp.emit('Network.requestWillBeSent', {
            requestId: 'bad',
            timestamp: 1,
            request: {
              url: 'https://example.invalid/rest/v1/rpc/submit_quiz_answer',
              method: 'POST',
            },
          });
          f.cdp.emit('Network.requestWillBeSent', {
            requestId: 'own',
            timestamp: 2,
            request: {
              url: f.scope.supabaseUrl + '/rest/v1/rpc/submit_quiz_answer',
              method: 'POST',
            },
          });
          f.cdp.emit('Network.responseReceived', {
            requestId: 'own',
            response: { status: 429 },
          });
          f.cdp.emit('Network.loadingFinished', {
            requestId: 'own',
            timestamp: 2.1,
          });
          throw Error('SECRET_MARKER');
        },
        'op-000001',
      ),
    ).rejects.toThrow('CAPACITY_EVIDENCE_INVALID');
    expect(f.observer.samples()[0]).toMatchObject({
      status: 'error',
      reason: 'rate_limited',
      replayOf: 'op-000001',
    });
    expect(f.observer.snapshot().physicalRequests).toBe(1);
    await f.observer.dispose();
  });
});
it.each([
  [
    'Network.requestWillBeSent',
    {
      requestId: 'unknown',
      timestamp: -1,
      request: { url: 'https://synthetic.invalid/', method: 'GET' },
    },
  ],
  [
    'Network.responseReceived',
    { requestId: 'unknown', response: { status: 600 } },
  ],
  ['Network.loadingFinished', { requestId: 'unknown', timestamp: -1 }],
  ['Network.loadingFailed', { requestId: 7, timestamp: 1 }],
] as const)(
  'keeps malformed non-target %s failclosed before record selection',
  async (event, raw) => {
    const f = await fixture();
    f.cdp.emit(event, raw);
    expect(f.observer.snapshot().available).toBe(false);
    expect(f.observer.snapshot().physicalRequests).toBe(0);
    await f.observer.dispose();
    expect(f.cdp.eventNames()).toHaveLength(0);
  },
);
it('shared static rules do not share mutable windows or records across independently approved scopes', async () => {
  const a = await fixture(),
    b = await fixture();
  expect(a.scope).not.toBe(b.scope);
  await a.observer.run('published_content', 'cold', () => {
    a.cdp.emit('Network.requestWillBeSent', {
      requestId: 'same',
      timestamp: 1,
      request: {
        url: a.scope.supabaseUrl + '/rest/v1/rpc/get_student_chapter_map',
        method: 'POST',
      },
    });
    b.cdp.emit('Network.responseReceived', {
      requestId: 'same',
      response: { status: 'INVALID' },
    });
    a.cdp.emit('Network.responseReceived', {
      requestId: 'same',
      response: { status: 200 },
    });
    a.cdp.emit('Network.loadingFinished', { requestId: 'same', timestamp: 2 });
    return Promise.resolve();
  });
  expect(a.observer.samples()[0]?.status).toBe('success');
  expect(a.observer.snapshot()).toMatchObject({
    available: true,
    physicalRequests: 1,
    pending: 0,
  });
  expect(b.observer.snapshot()).toMatchObject({
    available: false,
    physicalRequests: 0,
    pending: 0,
  });
  expect(b.observer.samples()).toHaveLength(0);
  await Promise.all([a.observer.dispose(), b.observer.dispose()]);
  expect(a.cdp.eventNames()).toHaveLength(0);
  expect(b.cdp.eventNames()).toHaveLength(0);
});
it.each(['sw', 'cache', 'duplicate', 'http', 'abort'] as const)(
  'reused operation schemas retain %s guards and samples',
  async (scenario) => {
    const f = await fixture();
    await f.observer.run('published_content', 'cold', () => {
      const request = () => {
        f.cdp.emit('Network.requestWillBeSent', {
          requestId: 'same',
          timestamp: 1,
          request: {
            url: f.scope.supabaseUrl + '/rest/v1/rpc/get_student_chapter_map',
            method: 'POST',
          },
        });
      };
      request();
      if (scenario === 'duplicate') request();
      f.cdp.emit('Network.responseReceived', {
        requestId: 'same',
        response: {
          status: scenario === 'http' ? 503 : 200,
          fromServiceWorker: scenario === 'sw',
          fromDiskCache: scenario === 'cache',
        },
      });
      if (scenario === 'abort') f.signal.abort();
      f.cdp.emit('Network.loadingFinished', {
        requestId: 'same',
        timestamp: 2,
      });
      return Promise.resolve();
    });
    expect(f.observer.samples()[0]?.status).toBe(
      scenario === 'cache'
        ? 'success'
        : scenario === 'abort'
          ? 'timeout'
          : 'error',
    );
    expect(f.observer.snapshot().available).toBe(
      scenario === 'cache' || scenario === 'http',
    );
    await f.observer.dispose();
    expect(f.cdp.eventNames()).toHaveLength(0);
  },
);

it('keeps original physical sample while forwarding native timing at the actual CDP listener', async () => {
  const timing = {
    request: vi.fn(),
    response: vi.fn(),
    finished: vi.fn(),
    failed: vi.fn(),
    dispose: vi.fn(),
  };
  const f = await fixture(timing);
  const native = {
    requestTime: 100,
    sendStart: 0,
    sendEnd: 1,
    receiveHeadersStart: 20,
    receiveHeadersEnd: 21,
  };
  await f.observer.run('published_content', 'cold', async () => {
    await Promise.resolve();
    f.cdp.emit('Network.requestWillBeSent', {
      requestId: 'private-id',
      timestamp: 100,
      request: {
        url: f.scope.supabaseUrl + '/rest/v1/rpc/get_student_chapter_map',
        method: 'POST',
      },
    });
    f.cdp.emit('Network.responseReceived', {
      requestId: 'private-id',
      response: { status: 200, timing: native },
    });
    f.cdp.emit('Network.loadingFinished', {
      requestId: 'private-id',
      timestamp: 100.05,
    });
  });
  expect(f.observer.samples()[0]).toMatchObject({
    startedAtMs: 100000,
    finishedAtMs: 100050,
    status: 'success',
    attempts: [{ startedAtMs: 100000, finishedAtMs: 100050 }],
  });
  expect(timing.request).toHaveBeenCalledTimes(1);
  expect(timing.response).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ response: { status: 200, timing: native } }),
  );
  expect(timing.finished).toHaveBeenCalledTimes(1);
  expect(f.cdp.send.mock.calls).toHaveLength(1);
  await f.observer.dispose();
  expect(timing.dispose).toHaveBeenCalledOnce();
});

it('throwing passive hooks preserve original success, physical count and original operation failure', async () => {
  const passive = () => {
    throw Error('PRIVATE_PASSIVE');
  };
  const f = await fixture({
    request: passive,
    response: passive,
    finished: passive,
    failed: passive,
    dispose: passive,
  });
  const events = () => {
    f.cdp.emit('Network.requestWillBeSent', {
      requestId: 'private',
      timestamp: 1,
      request: {
        url: f.scope.supabaseUrl + '/rest/v1/rpc/get_student_chapter_map',
        method: 'POST',
      },
    });
    f.cdp.emit('Network.responseReceived', {
      requestId: 'private',
      response: { status: 200 },
    });
    f.cdp.emit('Network.loadingFinished', {
      requestId: 'private',
      timestamp: 1.1,
    });
  };
  const result = {};
  await expect(
    f.observer.run('published_content', 'cold', () => {
      events();
      return Promise.resolve(result);
    }),
  ).resolves.toBe(result);
  expect(f.observer.samples()[0]).toMatchObject({
    status: 'success',
    startedAtMs: 1000,
    finishedAtMs: 1100,
  });
  const original = Error('PRIVATE_ACTION');
  await expect(
    f.observer.run('published_content', 'cold', () => {
      events();
      return Promise.reject(original);
    }),
  ).rejects.toThrow('CAPACITY_EVIDENCE_INVALID');
  expect(f.observer.samples()[1]?.status).toBe('error');
  expect(f.observer.snapshot().physicalRequests).toBe(2);
  await expect(f.observer.dispose()).resolves.toBeUndefined();
  expect(f.cdp.send.mock.calls).toHaveLength(1);
});
