import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { createCapacityHealth } from './capacity-health';
import { capacityFailure, type CapacityMode } from './capacity-scope';
export interface CapacityCollectorPorts {
  host(signal: AbortSignal): Promise<unknown>;
  vm(signal: AbortSignal): Promise<unknown>;
  now?: () => number;
  loop?: () => number | null;
  onInvalid?: (reason: 'UNKNOWN' | 'GENERATOR_LIMITED') => void;
}
export const createCapacityCollector = (
  mode: CapacityMode,
  signal: AbortSignal,
  ports: CapacityCollectorPorts,
) => {
  const health = createCapacityHealth(mode),
    now = ports.now ?? (() => performance.now());
  const histogram = ports.loop
    ? null
    : monitorEventLoopDelay({ resolution: 20 });
  let stopping = false,
    started = false;
  let releaseFirstLoop: (() => void) | null = null;
  const pending = new Set<Promise<void>>(),
    timers = new Set<ReturnType<typeof setTimeout>>();
  const isStopping = () => stopping;
  const controller = new AbortController(),
    combined = AbortSignal.any([signal, controller.signal]);
  const notify = () => {
    const status = health.snapshot(now()).validity;
    if (status !== 'VALID') ports.onInvalid?.(status);
  };
  const loop = () => {
    const value = ports.loop
      ? ports.loop()
      : histogram && histogram.count > 0
        ? histogram.percentile(95) / 1e6
        : null;
    health.eventLoop({ atNodeMs: now(), p95Ms: value ?? Number.NaN });
    histogram?.reset();
  };
  const schedule = (callback: () => void, ms: number) => {
    if (stopping || combined.aborted) return;
    const timer = setTimeout(() => {
      timers.delete(timer);
      callback();
    }, ms);
    timers.add(timer);
  };
  const collect = (kind: 'host' | 'vm'): Promise<void> => {
    if (stopping || combined.aborted)
      return Promise.reject(new Error('CAPACITY_EVIDENCE_INVALID'));
    const startedAtNodeMs = now();
    const task = (async () => {
      let sample: unknown;
      try {
        sample = await ports[kind](combined);
      } catch {
        sample = null;
      }
      health[kind]({ startedAtNodeMs, completedAtNodeMs: now(), sample });
    })();
    pending.add(task);
    void task.finally(() => pending.delete(task)).catch(() => undefined);
    return task;
  };
  const recurring = (kind: 'host' | 'vm', ms: number) => {
    schedule(() => {
      const task = collect(kind);
      void task
        .then(
          () => {
            if (!stopping && !combined.aborted) {
              notify();
              recurring(kind, ms);
            }
          },
          () => undefined,
        )
        .catch(() => undefined);
    }, ms);
  };
  const abort = () => {
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    releaseFirstLoop?.();
  };
  signal.addEventListener('abort', abort, { once: true });
  return {
    start: async () => {
      if (started || stopping || signal.aborted) return capacityFailure();
      started = true;
      histogram?.enable();
      const firstLoop = new Promise<void>((resolve) => {
        releaseFirstLoop = resolve;
        const timer = setTimeout(() => {
          timers.delete(timer);
          loop();
          resolve();
        }, 1000);
        timers.add(timer);
      });
      const abortLoop = () => {
        loop();
      };
      combined.addEventListener('abort', abortLoop, { once: true });
      try {
        await Promise.all([collect('host'), collect('vm'), firstLoop]);
        if (
          isStopping() ||
          combined.aborted ||
          health.snapshot(now()).validity !== 'VALID'
        )
          return capacityFailure();
        recurring('host', 1000);
        recurring('vm', 5000);
        const tick = () => {
          if (stopping || combined.aborted) return;
          loop();
          notify();
          schedule(tick, 1000);
        };
        schedule(tick, 1000);
      } finally {
        combined.removeEventListener('abort', abortLoop);
      }
    },
    snapshot: () => health.snapshot(now()),
    stop: async () => {
      stopping = true;
      controller.abort();
      abort();
      histogram?.disable();
      signal.removeEventListener('abort', abort);
      await Promise.allSettled([...pending]);
      return health.snapshot(now());
    },
    pending: () => pending.size,
  };
};
