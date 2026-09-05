import { useEffect, useState } from 'react';

/** A client waiting threshold is never a server cancellation or failure. */
export function useAdminWait(pending: boolean) {
  const [longWait, setLongWait] = useState(false);
  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => {
      setLongWait(true);
    }, 10_000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [pending]);
  // Reset during render so a later request never inherits the prior wait state.
  const [wasPending, setWasPending] = useState(pending);
  if (wasPending !== pending) {
    setWasPending(pending);
    setLongWait(false);
  }
  return pending && longWait;
}
