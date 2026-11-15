import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import { fail, safely, type FunctionalScope } from './config';
import { scopedFetch } from './local-runtime';

const summary = z.object({
  messages: z
    .array(z.object({ ID: z.string().regex(/^[a-zA-Z0-9-]{1,100}$/u) }))
    .max(100),
});
export const createOwnedMailbox = (
  scope: FunctionalScope,
  address: string,
  signal: AbortSignal,
  transport: typeof fetch = fetch,
) => {
  if (
    !address.startsWith(`${scope.runId}.`) ||
    !/^[a-z0-9.-]+@colorplay\.test$/u.test(address)
  )
    return fail('FUNCTIONAL_MAIL_FAILED');
  const request = scopedFetch(scope, signal, transport);
  const list = async () => {
    const response = await request(
      `${scope.mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`,
    );
    if (!response.ok) return fail('FUNCTIONAL_MAIL_FAILED');
    return summary.parse(await response.json()).messages;
  };
  return {
    baseline: () =>
      safely(
        async () => new Set((await list()).map((row) => row.ID)),
        'FUNCTIONAL_MAIL_FAILED',
      ),
    wait: async (
      before: ReadonlySet<string>,
      kind: 'otp' | 'recovery',
    ): Promise<string> =>
      safely(async () => {
        for (let attempt = 0; attempt < 30; attempt++) {
          signal.throwIfAborted();
          const matches = (await list()).filter((row) => !before.has(row.ID));
          if (matches.length > 1) return fail('FUNCTIONAL_MAIL_FAILED');
          if (matches[0]) {
            const response = await request(
              `${scope.mailpitUrl}/api/v1/message/${matches[0].ID}`,
            );
            const detail = z
              .object({
                Text: z.string().max(100_000),
                To: z
                  .array(z.object({ Address: z.literal(address) }))
                  .length(1),
              })
              .parse(await response.json());
            if (!response.ok) return fail('FUNCTIONAL_MAIL_FAILED');
            if (kind === 'otp') {
              const codes = [...detail.Text.matchAll(/\b(\d{6})\b/gu)];
              if (codes.length === 1 && codes[0]?.[1]) return codes[0][1];
            } else {
              const links = (
                detail.Text.match(/https?:\/\/[^\s"'\])<>]+/gu) ?? []
              ).filter((value) => {
                try {
                  const url = new URL(value);
                  return (
                    url.origin === new URL(scope.supabaseUrl).origin &&
                    url.pathname === '/auth/v1/verify'
                  );
                } catch {
                  return false;
                }
              });
              if (links.length === 1 && links[0]) return links[0];
            }
            return fail('FUNCTIONAL_MAIL_FAILED');
          }
          await delay(1000, undefined, { signal });
        }
        return fail('FUNCTIONAL_MAIL_FAILED');
      }, 'FUNCTIONAL_MAIL_FAILED'),
  };
};
