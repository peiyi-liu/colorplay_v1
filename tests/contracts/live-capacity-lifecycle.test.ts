import { afterEach, describe, expect, it, vi } from 'vitest';

import { runCapacityLifecycle } from '../../scripts/live/capacity-lifecycle';
import { updateGeneratorHealth } from '../../scripts/live/capacity-generator-health';

const initialHealth = () => ({
  rssBytes: 'unavailable' as const,
  eventLoopLagP95Ms: 'unavailable' as const,
  cpuPercent: 'unavailable' as const,
  limited: false,
  limitReason: null,
  lagExceededSince: null,
});
afterEach(() => vi.useRealTimers());

describe('capacity abort and cleanup ownership lifecycle', () => {
  it('aborts, closes transports and waits for pending setup before independent cleanup', async () => {
    vi.useFakeTimers();
    const order: string[] = [];
    let finish: (() => void) | undefined;
    let runSignal: AbortSignal | undefined;
    const operation = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const cleanup = vi.fn((signal: AbortSignal) => {
      expect(signal.aborted).toBe(false);
      expect(runSignal?.aborted).toBe(true);
      order.push('cleanup');
      return Promise.resolve();
    });
    const running = runCapacityLifecycle({
      operate: (signal) => {
        runSignal = signal;
        return operation;
      },
      close: () => {
        order.push('close');
        return Promise.resolve();
      },
      cleanup,
      runTimeoutMs: 100,
      settleTimeoutMs: 1000,
      cleanupTimeoutMs: 1000,
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(order).toEqual(['close']);
    expect(cleanup).not.toHaveBeenCalled();
    finish?.();
    const result = await running;
    expect(order).toEqual(['close', 'cleanup']);
    expect(result).toMatchObject({ result: 'FAIL', cleanup: 'verified' });
  });

  it('does not race deletion against a setup operation that never settles', async () => {
    vi.useFakeTimers();
    const cleanup = vi.fn(() => Promise.resolve());
    const running = runCapacityLifecycle({
      operate: () => new Promise<void>(() => undefined),
      close: () => Promise.resolve(),
      cleanup,
      runTimeoutMs: 100,
      settleTimeoutMs: 100,
      cleanupTimeoutMs: 100,
    });
    await vi.advanceTimersByTimeAsync(200);
    expect(await running).toMatchObject({ result: 'FAIL', cleanup: 'blocked' });
    expect(cleanup).not.toHaveBeenCalled();
  });

  it('fails on cleanup error even when the operation succeeded', async () => {
    const result = await runCapacityLifecycle({
      operate: () => Promise.resolve(),
      close: () => Promise.resolve(),
      cleanup: () => Promise.reject(new Error('secret-token-marker')),
    });
    expect(result).toMatchObject({ result: 'FAIL', cleanup: 'failed' });
    expect(JSON.stringify(result)).not.toContain('secret-token-marker');
  });

  it('marks generator-limited work INCONCLUSIVE only after verified cleanup', async () => {
    const result = await runCapacityLifecycle({
      operate: () => Promise.resolve(),
      close: () => Promise.resolve(),
      cleanup: () => Promise.resolve(),
      generatorLimited: () => true,
    });
    expect(result).toMatchObject({
      result: 'INCONCLUSIVE',
      cleanup: 'verified',
    });
  });
});

describe('generator measurement limits', () => {
  it('limits RSS above 2 GiB and keeps unsupported counters unavailable', () => {
    expect(
      updateGeneratorHealth(
        initialHealth(),
        { rssBytes: 2 * 1024 ** 3 + 1 },
        0,
      ),
    ).toMatchObject({
      limited: true,
      limitReason: 'rss',
      cpuPercent: 'unavailable',
    });
  });
  it('requires ten continuous seconds above p95 200ms lag', () => {
    let health = updateGeneratorHealth(
      initialHealth(),
      { eventLoopLagP95Ms: 201 },
      0,
    );
    health = updateGeneratorHealth(health, { eventLoopLagP95Ms: 201 }, 9999);
    expect(health.limited).toBe(false);
    health = updateGeneratorHealth(health, { eventLoopLagP95Ms: 201 }, 10000);
    expect(health).toMatchObject({ limited: true, limitReason: 'event_loop' });
  });
  it('resets the continuous lag window after recovery or unavailable measurement', () => {
    let health = updateGeneratorHealth(
      initialHealth(),
      { eventLoopLagP95Ms: 201 },
      0,
    );
    health = updateGeneratorHealth(health, { eventLoopLagP95Ms: 50 }, 9999);
    health = updateGeneratorHealth(health, { eventLoopLagP95Ms: 201 }, 10000);
    expect(health.limited).toBe(false);
    health = updateGeneratorHealth(
      health,
      { eventLoopLagP95Ms: 'unavailable' },
      15000,
    );
    health = updateGeneratorHealth(health, { eventLoopLagP95Ms: 201 }, 20000);
    expect(health.limited).toBe(false);
  });
});

it('settles every actor after one fails, without exposing the rejection payload', async () => {
  const { settleCapacityOperations } =
    await import('../../scripts/live/capacity-lifecycle');
  let finish: (() => void) | undefined;
  let settled = false;
  const running = settleCapacityOperations([
    () => Promise.reject(new Error('SECRET_ACTOR_TOKEN')),
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  ]);
  const rejection = expect(running).rejects.toThrow(
    'LIVE_CAPACITY_ACTOR_OPERATION_FAILED',
  );
  void running.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  await Promise.resolve();
  await Promise.resolve();
  expect(settled).toBe(false);
  finish?.();
  await rejection;
  expect(settled).toBe(true);
});
