/** Per-runtime bounded admission; health helpers bypass this pool at the caller. */
export const createCapacityRootCallAdmission = () => {
  let active = 0;
  const queued: (() => void)[] = [];
  return {
    acquire(signal: AbortSignal): Promise<() => void> {
      if (signal.aborted)
        return Promise.reject(new Error('CAPACITY_EVIDENCE_INVALID'));
      return new Promise((resolve, reject) => {
        let waiting = false;
        const abort = () => {
          if (!waiting) return;
          waiting = false;
          const index = queued.indexOf(grant);
          if (index !== -1) queued.splice(index, 1);
          signal.removeEventListener('abort', abort);
          reject(new Error('CAPACITY_EVIDENCE_INVALID'));
        };
        const grant = () => {
          waiting = false;
          signal.removeEventListener('abort', abort);
          active++;
          let released = false;
          resolve(() => {
            if (released) return;
            released = true;
            active--;
            queued.shift()?.();
          });
        };
        if (active < 4) grant();
        else if (queued.length >= 128)
          reject(new Error('CAPACITY_EVIDENCE_INVALID'));
        else {
          waiting = true;
          queued.push(grant);
          signal.addEventListener('abort', abort, { once: true });
          if (signal.aborted) abort();
        }
      });
    },
  };
};
