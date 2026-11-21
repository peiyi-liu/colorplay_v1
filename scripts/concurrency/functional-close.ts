import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../src/types/database';
import { fail } from './config';
import type { Browser, BrowserContext } from '@playwright/test';
export const createFunctionalBrowserCloser = (
  getBrowser: () => Browser | null,
  getContext: () => BrowserContext | null,
) => {
  const work = new Map<Browser | BrowserContext, Promise<void>>();
  const rows: {
    kind: 'context' | 'browser';
    status: 'fulfilled' | 'rejected';
  }[] = [];
  const close = (
    kind: 'context' | 'browser',
    resource: Browser | BrowserContext | null,
  ) => {
    if (!resource) return Promise.resolve();
    const old = work.get(resource);
    if (old) return old;
    const promise = Promise.resolve().then(() => resource.close());
    work.set(resource, promise);
    void promise.then(
      () => {
        rows.push({ kind, status: 'fulfilled' });
      },
      () => {
        rows.push({ kind, status: 'rejected' });
      },
    );
    return promise;
  };
  return {
    diagnostics: () => rows.map((row) => ({ ...row })),
    summary: (clients: PromiseSettledResult<unknown>[]) => ({
      closeOperations: rows.length + clients.length,
      rejectedCloseOperations:
        rows.filter((row) => row.status === 'rejected').length +
        clients.filter((row) => row.status === 'rejected').length,
      browserCloseComponents: rows.map((row) => ({ ...row })),
      clientCloseComponents: clients.map((row) => ({
        kind: 'sdk_client' as const,
        status: row.status,
      })),
    }),
    hasFailures: () => rows.some((row) => row.status === 'rejected'),
    close: async (starting: Promise<void> | undefined) => {
      // Close known resources to release a pending newContext/CDP initialization.
      // Normal ready startup always closes its context before its browser.
      if (getContext())
        await close('context', getContext()).catch(() => undefined);
      else await close('browser', getBrowser()).catch(() => undefined);
      await starting?.catch(() => undefined);
      await close('context', getContext()).catch(() => undefined);
      await close('browser', getBrowser()).catch(() => undefined);
      return rows.map((row) => ({ ...row }));
    },
  };
};

export const closeFunctionalClient = async (
  value: SupabaseClient<Database>,
) => {
  let removed: Awaited<ReturnType<typeof value.removeAllChannels>>;
  let ended: PromiseSettledResult<unknown>[];
  try {
    removed = await value.removeAllChannels();
  } finally {
    ended = await Promise.allSettled([
      value.realtime.disconnect(),
      value.auth.stopAutoRefresh(),
    ]);
  }
  if (
    ended.some((row) => row.status === 'rejected') ||
    removed.some((status) => status !== 'ok')
  )
    return fail('FUNCTIONAL_BROWSER_FAILED');
};
