import { EventEmitter } from 'node:events';
import type { BrowserContext, Page } from '@playwright/test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openFunctionalPopup } from '../../scripts/concurrency/auth-popup';
import { functionalFailureCode } from '../../scripts/concurrency/config';
afterEach(() => vi.useRealTimers());
const context = () =>
  new EventEmitter() as EventEmitter & Pick<BrowserContext, 'on' | 'off'>;
const observe = (promise: Promise<Page>) =>
  promise.then(
    () => 'opened',
    (error: unknown) => functionalFailureCode(error),
  );
describe('bounded owned popup lifecycle', () => {
  it('accepts event before trigger resolves, then removes every listener/timer', async () => {
    vi.useFakeTimers();
    const ctx = context();
    const abort = new AbortController();
    let release: () => void = () => undefined;
    const trigger = new Promise<void>((resolve) => {
      release = resolve;
    });
    const pending = observe(
      openFunctionalPopup(ctx, abort.signal, () => trigger),
    );
    ctx.emit('page', { close: () => Promise.resolve() });
    expect(ctx.listenerCount('page')).toBe(1);
    release();
    expect(await pending).toBe('opened');
    expect(ctx.listenerCount('page')).toBe(0);
    expect(ctx.listenerCount('close')).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each([
    'blocked',
    'evaluate_throw',
    'abort',
    'context_close',
    'pending_trigger_timeout',
  ] as const)(
    '%s settles safely and disposes without raw/unhandled rejection',
    async (mode) => {
      vi.useFakeTimers();
      const ctx = context();
      const abort = new AbortController();
      const close = vi.fn(() => Promise.resolve());
      const trigger = () =>
        mode === 'evaluate_throw'
          ? Promise.reject(new Error('SYNTHETIC_SECRET'))
          : mode === 'pending_trigger_timeout'
            ? new Promise<never>(() => undefined)
            : Promise.resolve();
      const pending = observe(openFunctionalPopup(ctx, abort.signal, trigger));
      await Promise.resolve();
      if (mode === 'abort') {
        ctx.emit('page', { close });
        abort.abort(new Error('SYNTHETIC_SECRET'));
      } else if (mode === 'context_close') ctx.emit('close');
      else if (mode !== 'evaluate_throw')
        await vi.advanceTimersByTimeAsync(15_000);
      expect(await pending).toBe('FUNCTIONAL_BROWSER_FAILED');
      expect(ctx.listenerCount('page')).toBe(0);
      expect(ctx.listenerCount('close')).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
      if (mode === 'abort') expect(close).toHaveBeenCalledTimes(1);
    },
  );
  it('an already aborted run never executes window.open', async () => {
    vi.useFakeTimers();
    const ctx = context();
    const abort = new AbortController();
    abort.abort();
    const trigger = vi.fn(() => Promise.resolve());
    expect(await observe(openFunctionalPopup(ctx, abort.signal, trigger))).toBe(
      'FUNCTIONAL_BROWSER_FAILED',
    );
    expect(trigger).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});

it('observes a late evaluate rejection after abort without polluting the next popup generation', async () => {
  vi.useFakeTimers();
  const ctx = context();
  const firstAbort = new AbortController();
  let rejectTrigger: (error: Error) => void = () => undefined;
  const trigger = new Promise<void>((_resolve, reject) => {
    rejectTrigger = reject;
  });
  const first = observe(
    openFunctionalPopup(ctx, firstAbort.signal, () => trigger),
  );
  await Promise.resolve();
  firstAbort.abort();
  expect(await first).toBe('FUNCTIONAL_BROWSER_FAILED');
  const second = observe(
    openFunctionalPopup(ctx, new AbortController().signal, () =>
      Promise.resolve(),
    ),
  );
  rejectTrigger(new Error('SYNTHETIC_SECRET'));
  await Promise.resolve();
  await Promise.resolve();
  expect(ctx.listenerCount('page')).toBe(1);
  ctx.emit('page', { close: () => Promise.resolve() });
  expect(await second).toBe('opened');
  expect(ctx.listenerCount('page')).toBe(0);
  expect(ctx.listenerCount('close')).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
});

it('abort between observer creation and evaluate microtask starts no new window', async () => {
  vi.useFakeTimers();
  const ctx = context();
  const abort = new AbortController();
  const trigger = vi.fn(() => Promise.resolve());
  const pending = observe(openFunctionalPopup(ctx, abort.signal, trigger));
  abort.abort();
  expect(await pending).toBe('FUNCTIONAL_BROWSER_FAILED');
  expect(trigger).not.toHaveBeenCalled();
  expect(ctx.listenerCount('page')).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
});
