import type { Frame, Page } from '@playwright/test';
import type {
  ColdEntryActor,
  ColdEntryMarker,
} from './capacity-cold-entry-diagnostics';
export const coldEntryNote = (
  actor: { observer?: { coldEntry?: Pick<ColdEntryActor, 'note'> } },
  kind: ColdEntryMarker,
) => {
  try {
    actor.observer?.coldEntry?.note(kind);
  } catch {
    /* Diagnostic only. */
  }
};
export const installColdEntryPageObserver = (
  page: Page,
  appUrl: string,
  port?: ColdEntryActor,
) => {
  if (!port) return undefined;
  const attempt = (action: () => void) => {
    try {
      action();
    } catch {
      /* Diagnostic only. */
    }
  };
  const target = () => {
    const value = new URL(page.url());
    return (
      value.origin === appUrl &&
      value.pathname === '/' &&
      !value.search &&
      !value.hash
    );
  };
  const frame = (value: Frame) => {
    attempt(() => {
      if (value === page.mainFrame() && target()) port.note('FRAME_COMMITTED');
    });
  };
  const dom = () => {
    attempt(() => {
      if (target()) port.note('DOM_CONTENT_LOADED');
    });
  };
  const load = () => {
    attempt(() => {
      if (target()) port.note('LOAD');
    });
  };
  const close = () => {
    attempt(() => {
      port.interrupt();
    });
  };
  const listeners = () => {
    for (const off of [
      () => page.off('framenavigated', frame),
      () => page.off('domcontentloaded', dom),
      () => page.off('load', load),
      () => page.off('close', close),
    ])
      attempt(off);
  };
  attempt(() => {
    page.on('framenavigated', frame);
    page.on('domcontentloaded', dom);
    page.on('load', load);
    page.on('close', close);
  });
  return {
    arm: (phase: string) => {
      attempt(() => {
        if (phase === 'entry') port.arm();
      });
    },
    request: (phase: string, at: number) => {
      attempt(() => {
        if (phase === 'entry') port.note('DOCUMENT_REQUEST', { cdpAtMs: at });
      });
    },
    response: (phase: string, status: number) => {
      attempt(() => {
        if (phase === 'entry') port.note('DOCUMENT_RESPONSE', { status });
      });
    },
    finished: (phase: string, at: number) => {
      attempt(() => {
        if (phase === 'entry') port.note('DOCUMENT_FINISHED', { cdpAtMs: at });
      });
    },
    cancel: (phase: string) => {
      attempt(() => {
        if (phase === 'entry') port.interrupt();
      });
    },
    dispose: () => {
      attempt(listeners);
      attempt(() => {
        port.seal();
      });
    },
  };
};
