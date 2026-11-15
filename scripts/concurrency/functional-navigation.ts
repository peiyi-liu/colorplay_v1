import { performance } from 'node:perf_hooks';
import type { BrowserContext, Page, Request } from '@playwright/test';
import { fail } from './config';

const sequences = new WeakMap<Page, number>();
export const functionalNavigationSequence = (page: Page) =>
  sequences.get(page) ?? null;

// Only the intercepted functional context installs this. Native capacity keeps
// original Page methods and its own physical request/barrier timing unchanged.
export const installFunctionalNavigation = (
  context: BrowserContext,
  signal?: AbortSignal,
) => {
  const owned = new Map<Page, () => void>();
  let disposed = false;
  const attach = (page: Page) => {
    if (disposed || owned.has(page)) return;
    const gotoDescriptor = Object.getOwnPropertyDescriptor(page, 'goto');
    const waitDescriptor = Object.getOwnPropertyDescriptor(page, 'waitForURL');
    const originalGoto = page.goto.bind(page),
      originalWait = page.waitForURL.bind(page);
    sequences.set(page, 0);
    let closed = false,
      busy = false,
      poisoned = false;
    let cancel: (() => void) | null = null;
    const active = new Set<Request>();
    const changed = new Set<() => void>(),
      quietStops = new Set<() => void>();
    let activity = 0;
    const notify = () => {
      activity++;
      for (const listener of changed) listener();
    };
    const started = (request: Request) => {
      if (active.size >= 2000 || active.has(request)) {
        poisoned = true;
        cancel?.();
        return;
      }
      active.add(request);
      notify();
    };
    const ended = (request: Request) => {
      active.delete(request);
      notify();
    };
    page.on('request', started);
    page.on('requestfinished', ended);
    page.on('requestfailed', ended);
    const check = () => {
      if (signal?.aborted) return fail('FUNCTIONAL_ABORTED');
      if (disposed || closed || poisoned || page.isClosed())
        return fail('FUNCTIONAL_BROWSER_FAILED');
    };
    const within = async <T>(
      budget: number,
      action: (remaining: () => number) => Promise<T>,
    ): Promise<T> => {
      check();
      if (busy || !Number.isFinite(budget) || budget <= 0)
        return fail('FUNCTIONAL_BROWSER_FAILED');
      busy = true;
      const deadline = performance.now() + budget;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const expired = new Promise<never>((_resolve, reject) => {
        cancel = () => {
          poisoned = true;
          reject(
            new Error(
              signal?.aborted
                ? 'FUNCTIONAL_ABORTED'
                : 'FUNCTIONAL_BROWSER_FAILED',
            ),
          );
        };
        timer = setTimeout(cancel, budget);
        signal?.addEventListener('abort', cancel, { once: true });
      });
      const remaining = () => {
        check();
        const left = deadline - performance.now();
        if (left <= 0) return fail('FUNCTIONAL_BROWSER_FAILED');
        return left;
      };
      try {
        return await Promise.race([
          Promise.resolve().then(() => action(remaining)),
          expired,
        ]);
      } catch {
        poisoned = true;
        return fail(
          signal?.aborted ? 'FUNCTIONAL_ABORTED' : 'FUNCTIONAL_BROWSER_FAILED',
        );
      } finally {
        clearTimeout(timer);
        for (const stop of [...quietStops]) stop();
        if (cancel) signal?.removeEventListener('abort', cancel);
        cancel = null;
        busy = false;
      }
    };
    const quiet = (remaining: () => number) =>
      new Promise<void>((resolve, reject) => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        let settled = false;
        const finish = (ok: boolean) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          changed.delete(update);
          quietStops.delete(stop);
          if (ok) resolve();
          else reject(new Error('FUNCTIONAL_BROWSER_FAILED'));
        };
        const stop = () => {
          finish(false);
        };
        const update = () => {
          clearTimeout(timer);
          try {
            remaining();
            if (!active.size)
              timer = setTimeout(() => {
                finish(true);
              }, 500);
          } catch {
            finish(false);
          }
        };
        changed.add(update);
        quietStops.add(stop);
        update();
      });
    const ready = async (remaining: () => number) => {
      for (;;) {
        await quiet(remaining);
        remaining();
        const observed = activity;
        await page.evaluate(async () => {
          await document.fonts.ready;
        });
        remaining();
        if (!active.size && activity === observed) return;
      }
    };
    page.goto = (url, options) =>
      within(options?.timeout ?? 15_000, async (remaining) => {
        await ready(remaining);
        sequences.set(page, (sequences.get(page) ?? 0) + 1);
        const response = await originalGoto(url, {
          ...options,
          timeout: remaining(),
        });
        await ready(remaining);
        return response;
      });
    page.waitForURL = (url, options) =>
      within(options?.timeout ?? 15_000, async (remaining) => {
        await originalWait(url, {
          ...options,
          timeout: remaining(),
        });
        await ready(remaining);
      });
    const close = () => {
      closed = true;
      cancel?.();
    };
    page.on('close', close);
    owned.set(page, () => {
      close();
      page.off('close', close);
      page.off('request', started);
      page.off('requestfinished', ended);
      page.off('requestfailed', ended);
      for (const stop of [...quietStops]) stop();
      active.clear();
      changed.clear();
      if (gotoDescriptor) Object.defineProperty(page, 'goto', gotoDescriptor);
      else Reflect.deleteProperty(page, 'goto');
      if (waitDescriptor)
        Object.defineProperty(page, 'waitForURL', waitDescriptor);
      else Reflect.deleteProperty(page, 'waitForURL');
      sequences.delete(page);
    });
  };
  const dispose = () => {
    disposed = true;
    context.off('page', attach);
    context.off('close', dispose);
    for (const stop of owned.values()) stop();
    owned.clear();
  };
  context.on('page', attach);
  context.once('close', dispose);
  return { dispose };
};
