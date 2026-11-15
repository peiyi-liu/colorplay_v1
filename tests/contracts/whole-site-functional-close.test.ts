import type { Browser, BrowserContext } from '@playwright/test';
import { describe, expect, it, vi } from 'vitest';
import { createFunctionalBrowserCloser } from '../../scripts/concurrency/functional-close';
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
};
describe('owned context/browser shutdown order and late startup', () => {
  it('waits for context before browser and memoizes each resource once', async () => {
    const order: string[] = [];
    const pending = deferred<undefined>();
    const context = {
      close: vi.fn(() => {
        order.push('context');
        return pending.promise;
      }),
    };
    const browser = {
      close: vi.fn(() => {
        order.push('browser');
        return Promise.resolve();
      }),
    };
    const closer = createFunctionalBrowserCloser(
      () => browser as unknown as Browser,
      () => context as unknown as BrowserContext,
    );
    const stopped = closer.close(Promise.resolve());
    await Promise.resolve();
    await Promise.resolve();
    expect(order).toEqual(['context']);
    pending.resolve(undefined);
    await stopped;
    await closer.close(undefined);
    expect(order).toEqual(['context', 'browser']);
    expect(closer.hasFailures()).toBe(false);
  });
  it('attempts browser even when context rejects and reports only fixed component kinds', async () => {
    const browser = { close: vi.fn(() => Promise.resolve()) };
    const closer = createFunctionalBrowserCloser(
      () => browser as unknown as Browser,
      () =>
        ({
          close: () => Promise.reject(Error('SYNTHETIC_SECRET')),
        }) as unknown as BrowserContext,
    );
    await closer.close(undefined);
    expect(browser.close).toHaveBeenCalledTimes(1);
    expect(closer.hasFailures()).toBe(true);
    expect(JSON.stringify(closer.diagnostics())).not.toContain(
      'SYNTHETIC_SECRET',
    );
  });
  it('settles a late browser and a late context without missing either owned resource', async () => {
    let browser: Browser | null = null,
      context: BrowserContext | null = null;
    const pending = deferred<undefined>();
    const lateBrowser = { close: vi.fn(() => Promise.resolve()) };
    const lateContext = { close: vi.fn(() => Promise.resolve()) };
    const closer = createFunctionalBrowserCloser(
      () => browser,
      () => context,
    );
    const stopped = closer.close(pending.promise);
    browser = lateBrowser as unknown as Browser;
    context = lateContext as unknown as BrowserContext;
    pending.resolve(undefined);
    await stopped;
    expect(lateBrowser.close).toHaveBeenCalledTimes(1);
    expect(lateContext.close).toHaveBeenCalledTimes(1);
  });
});
