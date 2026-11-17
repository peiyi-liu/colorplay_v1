import type { CapacityRunDiagnostics } from './capacity-run-diagnostics';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { createCapacityHealth } from './capacity-health';
import { createLinuxCapacityHealth } from './capacity-linux-health';
import type { ExecutionProfileAuthority } from './execution-profile';
import { capacityFailure, type CapacityMode } from './capacity-scope';
interface CommonCollectorPorts {
  diagnostics?: CapacityRunDiagnostics;
  host(signal: AbortSignal): Promise<unknown>;
  now?: () => number;
  loop?: () => number | null;
  onInvalid?: (reason: 'UNKNOWN' | 'GENERATOR_LIMITED') => void;
}
export type CapacityCollectorPorts = CommonCollectorPorts &
  (
    | {
        vm(signal: AbortSignal): Promise<unknown>;
        executionProfileAuthority?: never;
        backend?: never;
      }
    | {
        executionProfileAuthority: ExecutionProfileAuthority;
        backend(signal: AbortSignal): Promise<unknown>;
        vm?: never;
      }
  );
export const createCapacityCollector = (
  mode: CapacityMode,
  signal: AbortSignal,
  ports: CapacityCollectorPorts,
) => {
  const health = ports.executionProfileAuthority
      ? createLinuxCapacityHealth(mode, ports.executionProfileAuthority)
      : createCapacityHealth(mode),
    now = ports.now ?? (() => performance.now());
  const histogram = ports.loop
    ? null
    : monitorEventLoopDelay({ resolution: 20 });
  let stopping = false,
    started = false,
    baselineReady = false;
  let releaseFirstLoop: (() => void) | null = null;
  const pending = new Set<Promise<void>>(),
    timers = new Set<ReturnType<typeof setTimeout>>();
  const isStopping = () => stopping;
  const controller = new AbortController(),
    combined = AbortSignal.any([signal, controller.signal]);
  const notify = () => {
    if (!baselineReady || stopping || combined.aborted) return;
    const snapshot = health.snapshot(now()),
      status = snapshot.validity;
    if (status !== 'VALID') {
      ports.diagnostics?.collectorInvalid(snapshot);
      ports.onInvalid?.(status);
    }
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
  const collect = (kind: 'host' | 'resource'): Promise<void> => {
    if (stopping || combined.aborted)
      return Promise.reject(new Error('CAPACITY_EVIDENCE_INVALID'));
    const startedAtNodeMs = now();
    const task = (async () => {
      let sample: unknown;
      try {
        sample = await (kind === 'host'
          ? ports.host(combined)
          : ports.executionProfileAuthority
            ? ports.backend(combined)
            : ports.vm(combined));
      } catch {
        sample = null;
      }
      const input = { startedAtNodeMs, completedAtNodeMs: now(), sample };
      if (kind === 'host') health.host(input);
      else if ('backend' in health) health.backend(input);
      else health.vm(input);
    })();
    pending.add(task);
    void task.finally(() => pending.delete(task)).catch(() => undefined);
    return task;
  };
  const recurring = (kind: 'host' | 'resource', ms: number) => {
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
        await Promise.all([
          collect('host').then(() => {
            recurring('host', 1000);
          }),
          collect('resource').then(() => {
            recurring('resource', 5000);
          }),
          firstLoop,
        ]);
        if (
          isStopping() ||
          combined.aborted ||
          health.snapshot(now()).validity !== 'VALID'
        )
          return capacityFailure();
        baselineReady = true;
        const tick = () => {
          if (stopping || combined.aborted) return;
          loop();
          notify();
          schedule(tick, 1000);
        };
        schedule(tick, 1000);
      } catch (error) {
        stopping = true;
        controller.abort();
        abort();
        histogram?.disable();
        signal.removeEventListener('abort', abort);
        throw error;
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
