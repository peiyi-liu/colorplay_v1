import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createLiveReconcileScheduler } from './live-reconcile-scheduler';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
const deferredReads = () => {
  const reads: { resolve: () => void; reject: (error: Error) => void }[] = [];
  let active = 0;
  let maxActive = 0;
  const reconcile = vi.fn(() => {
    active += 1;
    maxActive = Math.max(active, maxActive);
    return new Promise<void>((resolve, reject) => {
      reads.push({ resolve, reject });
    }).finally(() => {
      active -= 1;
    });
  });
  return { reconcile, reads, maxActive: () => maxActive };
};

it('uses one fixed 200ms window for 39 roster requests without extending it', async () => {
  const reconcile = vi.fn(() => Promise.resolve());
  const scheduler = createLiveReconcileScheduler({ reconcile });
  for (let index = 0; index < 39; index += 1) scheduler.request('roster');
  await vi.advanceTimersByTimeAsync(100);
  scheduler.request('roster');
  await vi.advanceTimersByTimeAsync(99);
  expect(reconcile).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(reconcile).toHaveBeenCalledOnce();
  scheduler.dispose();
});

it('promotes authoritative work immediately and folds concurrent requests into one trailing read', async () => {
  const probe = deferredReads();
  const scheduler = createLiveReconcileScheduler(probe);
  scheduler.request('roster');
  await vi.advanceTimersByTimeAsync(50);
  scheduler.request('authoritative');
  expect(probe.reconcile).toHaveBeenCalledOnce();
  for (let index = 0; index < 39; index += 1)
    scheduler.request('authoritative');
  await vi.advanceTimersByTimeAsync(500);
  expect(probe.reconcile).toHaveBeenCalledOnce();
  probe.reads[0]?.resolve();
  await vi.advanceTimersByTimeAsync(0);
  expect(probe.reconcile).toHaveBeenCalledTimes(2);
  expect(probe.maxActive()).toBe(1);
  probe.reads[1]?.resolve();
  await vi.advanceTimersByTimeAsync(0);
  expect(probe.reconcile).toHaveBeenCalledTimes(2);
  scheduler.dispose();
});

it('does not overlap reads or skip the roster window when a fetch settles early', async () => {
  const probe = deferredReads();
  const scheduler = createLiveReconcileScheduler(probe);
  scheduler.request('authoritative');
  scheduler.request('roster');
  await vi.advanceTimersByTimeAsync(50);
  probe.reads[0]?.resolve();
  await vi.advanceTimersByTimeAsync(149);
  expect(probe.reconcile).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(1);
  expect(probe.reconcile).toHaveBeenCalledTimes(2);
  for (let index = 0; index < 39; index += 1) scheduler.request('roster');
  await vi.advanceTimersByTimeAsync(200);
  expect(probe.reconcile).toHaveBeenCalledTimes(2);
  probe.reads[1]?.resolve();
  await vi.advanceTimersByTimeAsync(0);
  expect(probe.reconcile).toHaveBeenCalledTimes(3);
  expect(probe.maxActive()).toBe(1);
  probe.reads[2]?.resolve();
  scheduler.dispose();
});

it('does not add retries after failure and remains available for a new request', async () => {
  const probe = deferredReads();
  const scheduler = createLiveReconcileScheduler(probe);
  scheduler.request('authoritative');
  probe.reads[0]?.reject(new Error('SYNTHETIC_READ_FAILURE'));
  await vi.advanceTimersByTimeAsync(1000);
  expect(probe.reconcile).toHaveBeenCalledOnce();
  scheduler.request('authoritative');
  expect(probe.reconcile).toHaveBeenCalledTimes(2);
  probe.reads[1]?.resolve();
  scheduler.dispose();
});

it('retains trailing work across a failed read', async () => {
  const probe = deferredReads();
  const scheduler = createLiveReconcileScheduler(probe);
  scheduler.request('authoritative');
  scheduler.request('authoritative');
  probe.reads[0]?.reject(new Error('SYNTHETIC_READ_FAILURE'));
  await vi.advanceTimersByTimeAsync(0);
  expect(probe.reconcile).toHaveBeenCalledTimes(2);
  probe.reads[1]?.resolve();
  scheduler.dispose();
});

it('disposes pending timers and ignores requests or completions after disposal', async () => {
  const probe = deferredReads();
  const scheduler = createLiveReconcileScheduler(probe);
  scheduler.request('roster');
  scheduler.dispose();
  scheduler.request('authoritative');
  await vi.advanceTimersByTimeAsync(1000);
  expect(probe.reconcile).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
  const active = createLiveReconcileScheduler(probe);
  active.request('authoritative');
  active.request('authoritative');
  active.request('roster');
  active.dispose();
  probe.reads[0]?.resolve();
  await vi.advanceTimersByTimeAsync(1000);
  expect(probe.reconcile).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

it('supports an explicit merge delay without modifying authoritative timing', async () => {
  const reconcile = vi.fn(() => Promise.resolve());
  const scheduler = createLiveReconcileScheduler({ reconcile, delayMs: 25 });
  scheduler.request('roster');
  await vi.advanceTimersByTimeAsync(24);
  expect(reconcile).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(reconcile).toHaveBeenCalledOnce();
  scheduler.dispose();
});
