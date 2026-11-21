import { describe, expect, it, vi } from 'vitest';
import { createCapacityRootCallAdmission } from '../../scripts/concurrency/capacity-root-call-admission';

const signal = () => new AbortController().signal;
const four = (pool: ReturnType<typeof createCapacityRootCallAdmission>) =>
  Promise.all(Array.from({ length: 4 }, () => pool.acquire(signal())));

describe('fixed per-runtime Root call admission', () => {
  it('grants four, queues FIFO, and releases each permit only once', async () => {
    const pool = createCapacityRootCallAdmission();
    const releases = await four(pool);
    const entered: number[] = [];
    const fifth = pool.acquire(signal()).then((release) => {
      entered.push(5);
      return release;
    });
    const sixth = pool.acquire(signal()).then((release) => {
      entered.push(6);
      return release;
    });
    await Promise.resolve();
    expect(entered).toEqual([]);
    releases[0]?.();
    releases[0]?.();
    const releaseFive = await fifth;
    expect(entered).toEqual([5]);
    releases[1]?.();
    const releaseSix = await sixth;
    expect(entered).toEqual([5, 6]);
    [...releases, releaseFive, releaseSix].forEach((release) => {
      release();
    });
    (await four(pool)).forEach((release) => {
      release();
    });
  });

  it('bounds waiting calls at 128 without dropping any admitted work', async () => {
    const pool = createCapacityRootCallAdmission();
    const releases = await four(pool);
    let completed = 0;
    const queued = Array.from({ length: 128 }, () =>
      pool.acquire(signal()).then((release) => {
        completed++;
        release();
      }),
    );
    await expect(pool.acquire(signal())).rejects.toThrow(
      'CAPACITY_EVIDENCE_INVALID',
    );
    expect(completed).toBe(0);
    releases.forEach((release) => {
      release();
    });
    await Promise.all(queued);
    expect(completed).toBe(128);
    (await four(pool)).forEach((release) => {
      release();
    });
  });

  it('removes queued abort listeners and leaves other waiting calls intact', async () => {
    const pool = createCapacityRootCallAdmission();
    const releases = await four(pool);
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    const rejected = expect(pool.acquire(controller.signal)).rejects.toThrow(
      'CAPACITY_EVIDENCE_INVALID',
    );
    let nextEntered = false;
    const next = pool.acquire(signal()).then((release) => {
      nextEntered = true;
      return release;
    });
    controller.abort();
    await rejected;
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(nextEntered).toBe(false);
    releases[0]?.();
    (await next)();
    releases.forEach((release) => {
      release();
    });
    remove.mockRestore();
  });

  it('rejects already aborted calls without occupying a slot', async () => {
    const pool = createCapacityRootCallAdmission();
    const controller = new AbortController();
    controller.abort();
    await expect(pool.acquire(controller.signal)).rejects.toThrow();
    (await four(pool)).forEach((release) => {
      release();
    });
  });

  it('does not release inflight work on abort and detaches on grant', async () => {
    const pool = createCapacityRootCallAdmission();
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    const releaseFirst = await pool.acquire(controller.signal);
    const others = await Promise.all(
      Array.from({ length: 3 }, () => pool.acquire(signal())),
    );
    let entered = false;
    const waiting = pool.acquire(signal()).then((release) => {
      entered = true;
      return release;
    });
    controller.abort();
    await Promise.resolve();
    expect(entered).toBe(false);
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    releaseFirst();
    (await waiting)();
    others.forEach((release) => {
      release();
    });
    remove.mockRestore();
  });

  it('requires the caller to recheck abort after a synchronous grant race', async () => {
    const pool = createCapacityRootCallAdmission();
    const controller = new AbortController();
    let operations = 0;
    const pending = pool.acquire(controller.signal).then((release) => {
      try {
        controller.signal.throwIfAborted();
        operations++;
      } finally {
        release();
      }
    });
    const original = new Error('SYNTHETIC_ABORT');
    const rejected = expect(pending).rejects.toBe(original);
    controller.abort(original);
    await rejected;
    expect(operations).toBe(0);
    (await four(pool)).forEach((release) => {
      release();
    });
  });

  it('keeps separate runtime pools independent', async () => {
    const one = await four(createCapacityRootCallAdmission());
    const two = await four(createCapacityRootCallAdmission());
    [...one, ...two].forEach((release) => {
      release();
    });
  });
});
