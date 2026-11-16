import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import { fail, safely, type FunctionalScope } from './config';
import { scopedFetch } from './local-runtime';

const summary = z.object({
  messages: z
    .array(z.object({ ID: z.string().regex(/^[a-zA-Z0-9-]{1,100}$/u) }))
    .max(100),
});
const count = z.number().int().min(0).max(100).nullable();
export const mailboxDiagnosticSchema = z.strictObject({
  phase: z.enum([
    'IDLE',
    'LIST',
    'DETAIL',
    'OTP_PARSE',
    'RECOVERY_PARSE',
    'WAIT',
  ]),
  reason: z
    .enum([
      'LIST_HTTP',
      'LIST_SCHEMA',
      'MULTIPLE_NEW',
      'DETAIL_HTTP',
      'DETAIL_SCHEMA',
      'RECIPIENT_MISMATCH',
      'OTP_COUNT',
      'RECOVERY_LINK',
      'WAIT_EXHAUSTED',
      'ABORTED',
      'UNKNOWN',
    ])
    .nullable(),
  polls: z.number().int().min(0).max(30),
  baselineCount: count,
  newMatches: count,
  statusClass: z
    .enum(['OK', 'CLIENT_ERROR', 'SERVER_ERROR', 'OTHER'])
    .nullable(),
  recipientExact: z.boolean().nullable(),
  otpCount: count,
});
export type MailboxDiagnostic = z.infer<typeof mailboxDiagnosticSchema>;
export interface OwnedMailbox {
  baseline: () => Promise<Set<string>>;
  wait: (
    before: ReadonlySet<string>,
    kind: 'otp' | 'recovery',
  ) => Promise<string>;
  diagnostics?: () => MailboxDiagnostic;
}
export const createOwnedMailbox = (
  scope: FunctionalScope,
  address: string,
  signal: AbortSignal,
  transport: typeof fetch = fetch,
): OwnedMailbox => {
  if (
    !address.startsWith(`${scope.runId}.`) ||
    !/^[a-z0-9.-]+@colorplay\.test$/u.test(address)
  )
    return fail('FUNCTIONAL_MAIL_FAILED');
  const request = scopedFetch(scope, signal, transport);
  const observed: MailboxDiagnostic = {
    phase: 'IDLE',
    reason: null,
    polls: 0,
    baselineCount: null,
    newMatches: null,
    statusClass: null,
    recipientExact: null,
    otpCount: null,
  };
  const status = (response: Response) => {
    observed.statusClass = response.ok
      ? 'OK'
      : response.status >= 500
        ? 'SERVER_ERROR'
        : response.status >= 400
          ? 'CLIENT_ERROR'
          : 'OTHER';
  };
  const failed = (error: unknown): never => {
    observed.reason = signal.aborted
      ? 'ABORTED'
      : (observed.reason ?? 'UNKNOWN');
    throw error;
  };
  const list = async () => {
    observed.phase = 'LIST';
    observed.reason = null;
    observed.newMatches = null;
    observed.recipientExact = null;
    observed.otpCount = null;
    const response = await request(
      `${scope.mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`,
    );
    status(response);
    if (!response.ok) {
      observed.reason = 'LIST_HTTP';
      return fail('FUNCTIONAL_MAIL_FAILED');
    }
    observed.reason = 'LIST_SCHEMA';
    const messages = summary.parse(await response.json()).messages;
    observed.reason = null;
    return messages;
  };
  return {
    diagnostics: () => mailboxDiagnosticSchema.parse({ ...observed }),
    baseline: () =>
      safely(async () => {
        try {
          const before = new Set((await list()).map((row) => row.ID));
          observed.baselineCount = before.size;
          return before;
        } catch (error) {
          return failed(error);
        }
      }, 'FUNCTIONAL_MAIL_FAILED'),
    wait: async (
      before: ReadonlySet<string>,
      kind: 'otp' | 'recovery',
    ): Promise<string> =>
      safely(async () => {
        try {
          observed.baselineCount = before.size <= 100 ? before.size : null;
          for (let attempt = 0; attempt < 30; attempt++) {
            signal.throwIfAborted();
            observed.polls = attempt + 1;
            const matches = (await list()).filter((row) => !before.has(row.ID));
            observed.phase = 'WAIT';
            observed.newMatches = matches.length;
            if (matches.length > 1) {
              observed.reason = 'MULTIPLE_NEW';
              return fail('FUNCTIONAL_MAIL_FAILED');
            }
            if (matches[0]) {
              observed.phase = 'DETAIL';
              const response = await request(
                `${scope.mailpitUrl}/api/v1/message/${matches[0].ID}`,
              );
              status(response);
              observed.reason = response.ok ? 'DETAIL_SCHEMA' : 'DETAIL_HTTP';
              const body: unknown = await response.json();
              observed.recipientExact = z
                .object({
                  To: z
                    .array(z.object({ Address: z.literal(address) }))
                    .length(1),
                })
                .safeParse(body).success;
              if (response.ok && !observed.recipientExact)
                observed.reason = 'RECIPIENT_MISMATCH';
              const detail = z
                .object({
                  Text: z.string().max(100_000),
                  To: z
                    .array(z.object({ Address: z.literal(address) }))
                    .length(1),
                })
                .parse(body);
              if (!response.ok) return fail('FUNCTIONAL_MAIL_FAILED');
              observed.reason = null;
              if (kind === 'otp') {
                observed.phase = 'OTP_PARSE';
                const codes = [...detail.Text.matchAll(/\b(\d{6})\b/gu)];
                observed.otpCount = codes.length <= 100 ? codes.length : null;
                if (codes.length === 1 && codes[0]?.[1]) return codes[0][1];
                observed.reason = 'OTP_COUNT';
              } else {
                observed.phase = 'RECOVERY_PARSE';
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
                observed.reason = 'RECOVERY_LINK';
              }
              return fail('FUNCTIONAL_MAIL_FAILED');
            }
            await delay(1000, undefined, { signal });
          }
          observed.phase = 'WAIT';
          observed.reason = 'WAIT_EXHAUSTED';
          return fail('FUNCTIONAL_MAIL_FAILED');
        } catch (error) {
          return failed(error);
        }
      }, 'FUNCTIONAL_MAIL_FAILED'),
  };
};
