import type { Page, Response } from '@playwright/test';
import { z } from 'zod';
import { fail, safely, type FunctionalScope } from './config';
import type { AdminReadName } from './admin-denials';
// A successful heading alone cannot prove its associated privileged read.
export const visitAdminRead = async (
  page: Page,
  scope: FunctionalScope,
  signal: AbortSignal,
  route: string,
  rpc: AdminReadName,
  navigate: () => Promise<unknown> = () => page.goto(route),
) =>
  safely(async () => {
    let settled = false;
    let resolve: (
      value: { status: number; rowCount: number | null } | null,
    ) => void = () => undefined;
    const read = new Promise<{
      status: number;
      rowCount: number | null;
    } | null>((done) => {
      resolve = done;
    });
    const finish = (
      value: { status: number; rowCount: number | null } | null,
    ) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    const listener = (response: Response) => {
      try {
        const url = new URL(response.url());
        if (
          settled ||
          url.origin !== new URL(scope.supabaseUrl).origin ||
          url.pathname !== `/rest/v1/rpc/${rpc}` ||
          response.request().method() !== 'POST'
        )
          return;
        void (async () => {
          if (
            (await response.finished()) !== null ||
            response.status() !== 200
          ) {
            finish(null);
            return;
          }
          const bytes = await response.body();
          if (bytes.length > 1_048_576) {
            finish(null);
            return;
          }
          const payload = z
            .object({
              outcome: z.literal('ok'),
              rows: z.array(z.unknown()).optional(),
            })
            .safeParse(JSON.parse(bytes.toString('utf8')) as unknown);
          finish(
            payload.success
              ? { status: 200, rowCount: payload.data.rows?.length ?? null }
              : null,
          );
        })().catch(() => {
          finish(null);
        });
      } catch {
        finish(null);
      }
    };
    const abort = () => {
      finish(null);
    };
    const timer = setTimeout(abort, 15_000);
    page.on('response', listener);
    page.on('close', abort);
    signal.addEventListener('abort', abort, { once: true });
    try {
      if (signal.aborted) return fail('FUNCTIONAL_ABORTED');
      const outcomes = await Promise.allSettled([navigate(), read]);
      if (
        outcomes[0].status !== 'fulfilled' ||
        outcomes[1].status !== 'fulfilled' ||
        !outcomes[1].value
      )
        return fail('FUNCTIONAL_OPERATION_FAILED');
      return outcomes[1].value;
    } finally {
      clearTimeout(timer);
      page.off('response', listener);
      page.off('close', abort);
      signal.removeEventListener('abort', abort);
    }
  });
