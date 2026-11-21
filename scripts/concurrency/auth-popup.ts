import type { BrowserContext, Page } from '@playwright/test';
import { fail } from './config';

// Context page events and evaluate() are observed immediately. Completion needs
// both the trigger and its popup; every terminal path removes all observers.
export const openFunctionalPopup = async (
  context: Pick<BrowserContext, 'on' | 'off'>,
  signal: AbortSignal,
  trigger: () => Promise<unknown>,
): Promise<Page> => {
  let captured: Page | undefined;
  let triggerFinished = false;
  let settled = false;
  let complete: (page: Page | null) => void = () => undefined;
  const result = new Promise<Page | null>((resolve) => {
    complete = resolve;
  });
  const dispose = () => {
    clearTimeout(timer);
    context.off('page', page);
    context.off('close', closed);
    signal.removeEventListener('abort', aborted);
  };
  const finish = (value: Page | null) => {
    if (settled) return;
    settled = true;
    dispose();
    complete(value);
  };
  const check = () => {
    if (triggerFinished && captured) finish(captured);
  };
  const page = (value: Page) => {
    if (settled) return;
    captured = value;
    check();
  };
  const closed = () => {
    finish(null);
  };
  const aborted = () => {
    finish(null);
  };
  const timer = setTimeout(() => {
    finish(null);
  }, 15_000);
  context.on('page', page);
  context.on('close', closed);
  signal.addEventListener('abort', aborted, { once: true });
  if (signal.aborted) aborted();
  else {
    // Both handlers are installed in the creating turn, including after abort.
    void Promise.resolve()
      .then(() => {
        if (!settled) return trigger();
      })
      .then(
        () => {
          triggerFinished = true;
          check();
        },
        () => {
          finish(null);
        },
      );
  }
  try {
    const opened = await result;
    if (!opened) {
      if (captured) await captured.close().catch(() => undefined);
      return fail('FUNCTIONAL_BROWSER_FAILED');
    }
    return opened;
  } finally {
    dispose();
  }
};
