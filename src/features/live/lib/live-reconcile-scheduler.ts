import { emitLiveTrace, type LiveTrace } from './live-reconcile-diagnostics';

type ReconcileKind = 'roster' | 'authoritative';

export const createLiveReconcileScheduler = ({
  reconcile,
  delayMs = 200,
  trace,
}: {
  reconcile: () => Promise<void>;
  delayMs?: number;
  trace?: LiveTrace | undefined;
}) => {
  if (!Number.isFinite(delayMs) || delayMs < 0)
    throw new RangeError('LIVE_RECONCILE_DELAY_INVALID');
  let disposed = false;
  let running = false;
  let ready = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clearWindow = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const canRun = () => !disposed && !running && ready;
  const drain = async (): Promise<void> => {
    if (!canRun()) return;
    ready = false;
    running = true;
    emitLiveTrace(trace, 'SCHED_START');
    try {
      await reconcile();
      emitLiveTrace(trace, 'SCHED_RETURN');
    } catch {
      emitLiveTrace(trace, 'SCHED_FAIL');
      // Query owns the visible error and read retry policy. Do not retry here.
    } finally {
      running = false;
      if (canRun()) void drain();
    }
  };
  return {
    request: (kind: ReconcileKind) => {
      if (disposed) return;
      emitLiveTrace(
        trace,
        kind === 'authoritative' ? 'SCHED_AUTH' : 'SCHED_ROSTER',
      );
      if (running || ready || timer !== undefined)
        emitLiveTrace(trace, 'SCHED_COALESCE');
      if (kind === 'authoritative') {
        clearWindow();
        ready = true;
        void drain();
      } else if (!ready && timer === undefined) {
        timer = setTimeout(() => {
          timer = undefined;
          if (disposed) return;
          ready = true;
          void drain();
        }, delayMs);
      }
    },
    dispose: () => {
      emitLiveTrace(trace, 'SCHED_DISPOSE');
      disposed = true;
      ready = false;
      clearWindow();
    },
  };
};
