import { EventEmitter } from 'node:events';
import type { Browser, Page } from '@playwright/test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFunctionalContext } from '../../scripts/concurrency/browser-runtime';
import { syntheticScope } from './helpers/whole-site-functional';
const setup = async () => {
  const events: string[] = [];
  const signal = new AbortController();
  const page = Object.assign(new EventEmitter(), {
    isClosed: () => false,
    goto: vi.fn(() => {
      events.push('goto');
      return Promise.resolve(null);
    }),
    waitForURL: vi.fn(() => {
      events.push('url');
      return Promise.resolve();
    }),
    waitForLoadState: vi.fn((state: string) => {
      events.push(state);
      return Promise.resolve();
    }),
    evaluate: vi.fn(() => {
      events.push('fonts');
      return Promise.resolve();
    }),
  });
  const originalGoto = page.goto;
  const context = Object.assign(new EventEmitter(), {
    grantPermissions: () => Promise.resolve(),
    route: () => Promise.resolve(),
    routeWebSocket: () => Promise.resolve(),
    newPage: () => {
      context.emit('page', page);
      return Promise.resolve(page as unknown as Page);
    },
    close: () => {
      context.emit('close');
      return Promise.resolve();
    },
  });
  const actual = await createFunctionalContext(
    { newContext: () => Promise.resolve(context) } as unknown as Browser,
    syntheticScope(),
    { signal: signal.signal },
  );
  const owned = await actual.newPage();
  return { events, page, actual, owned, originalGoto, signal };
};
afterEach(() => {
  vi.useRealTimers();
});
describe('intercepted functional navigation readiness keeps real Page identity', () => {
  it('uses a fresh request quiet period despite already-resolved cached lifecycle', async () => {
    vi.useFakeTimers();
    const h = await setup();
    const pending = h.owned.goto('/teacher');
    await vi.advanceTimersByTimeAsync(100);
    const request = {};
    h.page.emit('request', request);
    await vi.advanceTimersByTimeAsync(600);
    expect(h.originalGoto).not.toHaveBeenCalled();
    h.page.emit('requestfinished', request);
    await vi.advanceTimersByTimeAsync(499);
    expect(h.originalGoto).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(h.originalGoto).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(500);
    await pending;
    expect(h.owned).toBe(h.page);
    await h.actual.close();
    expect(h.page.goto).toBe(h.originalGoto);
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each(['abort', 'close', 'timeout'] as const)(
    'does not navigate while old document is pending on %s',
    async (stop) => {
      vi.useFakeTimers();
      const h = await setup();
      const request = {};
      h.page.emit('request', request);
      const pending = h.owned.goto('/teacher');
      const rejected = pending.then(
        () => false,
        () => true,
      );
      if (stop === 'abort') h.signal.abort();
      if (stop === 'close') h.page.emit('close');
      if (stop === 'timeout') await vi.advanceTimersByTimeAsync(15_000);
      expect(await rejected).toBe(true);
      h.page.emit('requestfinished', request);
      await Promise.resolve();
      await Promise.resolve();
      expect(h.originalGoto).not.toHaveBeenCalled();
      await h.actual.close();
      expect(h.page.listenerCount('close')).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    },
  );
  it('activity during fonts requires another fresh quiet period', async () => {
    vi.useFakeTimers();
    const h = await setup();
    const request = {};
    h.page.evaluate.mockImplementationOnce(() => {
      h.page.emit('request', request);
      h.page.emit('requestfinished', request);
      return Promise.resolve();
    });
    const pending = h.owned.goto('/teacher');
    await vi.advanceTimersByTimeAsync(500);
    expect(h.originalGoto).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(499);
    expect(h.originalGoto).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(h.originalGoto).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(500);
    await pending;
    await h.actual.close();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('active-state overflow and context disposal fail closed', async () => {
    vi.useFakeTimers();
    const h = await setup();
    for (let i = 0; i < 2001; i++) h.page.emit('request', {});
    await expect(h.owned.goto('/teacher')).rejects.toThrow(
      'FUNCTIONAL_BROWSER_FAILED',
    );
    expect(h.originalGoto).not.toHaveBeenCalled();
    await h.actual.close();
    expect(h.page.listenerCount('request')).toBe(0);
    expect(h.page.listenerCount('requestfinished')).toBe(0);
    expect(h.page.listenerCount('requestfailed')).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('a failed fonts/readiness probe cannot become normal navigation or leak its exception', async () => {
    const h = await setup();
    h.page.evaluate.mockRejectedValue(new Error('SYNTHETIC_PRIVATE_MARKER'));
    await expect(h.owned.goto('/teacher')).rejects.toThrow(
      'FUNCTIONAL_BROWSER_FAILED',
    );
    expect(h.originalGoto).not.toHaveBeenCalled();
    await h.actual.close();
  });
});

import { createFunctionalMediaObservation } from '../../scripts/concurrency/functional-media-observation';
it('issues media goto intent only at original invocation after old pending/quiet/fonts', async () => {
  vi.useFakeTimers();
  const h = await setup();
  const observation = createFunctionalMediaObservation(
    syntheticScope(),
    () => 'media',
  );
  observation.register(h.owned, () => 'A1');
  observation.port(h.owned).step('editor');
  const raw = {
    request: {
      url: syntheticScope().supabaseUrl + '/functions/v1/content-media',
      method: 'POST',
      postData: '{"action":"resolve"}',
    },
  };
  const old = observation.request(h.owned, 'old', raw);
  const pendingRequest = {};
  h.page.emit('request', pendingRequest);
  let created: ReturnType<typeof observation.request> | undefined;
  h.originalGoto.mockImplementationOnce(() => {
    created = observation.request(h.owned, 'new', raw);
    return Promise.resolve(null);
  });
  const task = h.owned.goto('/admin/content');
  await vi.advanceTimersByTimeAsync(600);
  expect(h.originalGoto).not.toHaveBeenCalled();
  expect(old.requestIntent).toBeNull();
  h.page.emit('requestfinished', pendingRequest);
  await vi.advanceTimersByTimeAsync(500);
  expect(created?.requestIntent).toMatchObject({
    ordinal: 1,
    kind: 'ROOT_GOTO_ADMIN_CONTENT',
    state: 'INVOKED',
  });
  observation.failure(h.owned, 'old', {});
  expect(old.requestIntent).toBeNull();
  expect(old.failureIntent?.ordinal).toBe(1);
  await vi.advanceTimersByTimeAsync(500);
  await task;
  await h.actual.close();
  expect(vi.getTimerCount()).toBe(0);
});
