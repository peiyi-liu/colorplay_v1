import { EventEmitter } from 'node:events';
import type { Browser, Page } from '@playwright/test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFunctionalContext } from '../../scripts/concurrency/browser-runtime';
import { syntheticScope } from './helpers/whole-site-functional';
const deferred = () => {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
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
  it('awaits previous document quiet/fonts and new quiet/fonts without replacing Page', async () => {
    const h = await setup();
    expect(h.owned).toBe(h.page);
    await h.owned.goto('/teacher');
    expect(h.events).toEqual([
      'networkidle',
      'fonts',
      'networkidle',
      'goto',
      'networkidle',
      'fonts',
      'networkidle',
    ]);
    await h.owned.waitForURL(/teacher/u);
    expect(h.events.slice(-4)).toEqual([
      'url',
      'networkidle',
      'fonts',
      'networkidle',
    ]);
    await h.actual.close();
    expect(h.page.goto).toBe(h.originalGoto);
  });
  it.each(['abort', 'close', 'timeout'] as const)(
    'does not navigate while old document is pending on %s',
    async (stop) => {
      vi.useFakeTimers();
      const h = await setup(),
        gate = deferred();
      h.page.waitForLoadState.mockReturnValue(gate.promise);
      const pending = h.owned.goto('/teacher');
      const rejected = pending.then(
        () => false,
        () => true,
      );
      if (stop === 'abort') h.signal.abort();
      if (stop === 'close') h.page.emit('close');
      if (stop === 'timeout') await vi.advanceTimersByTimeAsync(15_000);
      expect(await rejected).toBe(true);
      gate.resolve();
      await Promise.resolve();
      await Promise.resolve();
      expect(h.originalGoto).not.toHaveBeenCalled();
      await h.actual.close();
      expect(h.page.listenerCount('close')).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    },
  );
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
