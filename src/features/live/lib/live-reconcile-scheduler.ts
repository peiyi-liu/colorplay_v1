type ReconcileKind = 'roster' | 'authoritative';

export const createLiveReconcileScheduler = ({
  reconcile,
  delayMs = 200,
}: {
  reconcile: () => Promise<void>;
  delayMs?: number;
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
    try {
      await reconcile();
    } catch {
      // Query owns the visible error and read retry policy. Do not retry here.
    } finally {
      running = false;
      if (canRun()) void drain();
    }
  };
  return {
    request: (kind: ReconcileKind) => {
      if (disposed) return;
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
      disposed = true;
      ready = false;
      clearWindow();
    },
  };
};
