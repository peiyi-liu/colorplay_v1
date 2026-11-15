import type {
  BrowserContext,
  CDPSession,
  ConsoleMessage,
  Page,
} from '@playwright/test';
import { z } from 'zod';
import { fail, type FunctionalScope } from './config';
import { sha256 } from './local-runtime';
import {
  mediaRequestSchema,
  type MediaHttpRequest,
} from './media-http-contract';
import type { FunctionalStage } from './functional-receipt';
const refreshCodes = new Set([
  'refresh_token_not_found',
  'refresh_token_already_used',
  'session_not_found',
]);
const mediaKey = (request: MediaHttpRequest) =>
  request.action === 'begin'
    ? null
    : `${request.actorTokenSha256}:${request.action}:${request.runId}:${request.requestId}`;
interface NetworkRecord {
  page: number;
  phase: FunctionalStage | null;
  endpoint: 'media' | 'refresh' | 'other';
  media: string | null;
  refresh: string | null;
  status: number | null;
  failed: boolean;
  finished: boolean;
}
// Kept separately from the PW duplicate log stream. A network console exemption
// needs CDP's exact requestId proof, not URL or temporal proximity alone.
export const createFunctionalHealth = (
  scope: FunctionalScope,
  phase: () => FunctionalStage | null,
) => {
  const api = new URL(scope.supabaseUrl).origin;
  const records = new Map<string, NetworkRecord>();
  const expectedDrops = new Map<string, number>();
  const observedDrops = new Set<string>();
  const observedRefresh = new Set<string>();
  const pwCandidates = new Map<string, number>();
  const networkLogs = new Map<string, string>();
  const approvedLogs = new Set<string>();
  const pages = new Map<
    Page,
    {
      index: number;
      actor: string | null;
      cdp: CDPSession | null;
      disposers: (() => void)[];
      ready: Promise<void>;
      enabled: boolean;
    }
  >();
  const work = new Set<Promise<void>>();
  let unavailable = false;
  let unexpected = 0;
  let pageErrors = 0;
  let refreshExpected: { page: number; hash: string } | null = null;
  const endpoint = (raw: string): NetworkRecord['endpoint'] => {
    try {
      const url = new URL(raw);
      if (url.origin !== api) return 'other';
      if (url.pathname === '/functions/v1/content-media' && url.search === '')
        return 'media';
      if (
        url.pathname === '/auth/v1/token' &&
        url.search === '?grant_type=refresh_token'
      )
        return 'refresh';
    } catch {
      /* Fixed unknown. */
    }
    return 'other';
  };
  const resourceCode = (text: string) =>
    text === 'Failed to load resource: net::ERR_FAILED'
      ? 'failed'
      : /^Failed to load resource: the server responded with a status of (400|401|403) \([A-Za-z ]+\)$/u.test(
            text,
          )
        ? 'denied'
        : null;
  const observe = (operation: () => Promise<void>) => {
    if (work.size >= 2000) {
      unavailable = true;
      return;
    }
    const task = Promise.resolve().then(operation);
    work.add(task);
    void task.then(
      () => {
        work.delete(task);
      },
      () => {
        unavailable = true;
        work.delete(task);
      },
    );
  };
  const bump = (map: Map<string, number>, key: string) => {
    map.set(key, (map.get(key) ?? 0) + 1);
  };
  const attach = (context: BrowserContext, page: Page): Promise<void> => {
    const existing = pages.get(page);
    if (existing) return existing.ready;
    const info = {
      index: pages.size + 1,
      actor: null as string | null,
      cdp: null as CDPSession | null,
      disposers: [] as (() => void)[],
      ready: Promise.resolve(),
      enabled: false,
    };
    pages.set(page, info);
    // Synchronous page listeners precede CDP setup and navigation, including popups.
    const consoleListener = (message: ConsoleMessage) => {
      if (message.type() !== 'error') return;
      try {
        const text = message.text();
        const code = text.length <= 4096 ? resourceCode(text) : null;
        const target = endpoint(message.location().url);
        if (!code || target === 'other') unexpected++;
        else bump(pwCandidates, `${String(info.index)}:${target}:${code}`);
      } catch {
        unexpected++;
      }
    };
    const error = () => {
      pageErrors++;
    };
    page.on('console', consoleListener);
    page.on('pageerror', error);
    info.disposers.push(() => {
      page.off('console', consoleListener);
      page.off('pageerror', error);
    });
    info.ready = (async () => {
      try {
        const cdp = await context.newCDPSession(page);
        info.cdp = cdp;
        const requestListener = (raw: unknown) => {
          try {
            const event = z
              .object({
                requestId: z.string().max(180),
                request: z.object({
                  url: z.string().max(32768),
                  method: z.string().max(12),
                }),
              })
              .parse(raw);
            if (records.size >= 2000) {
              unavailable = true;
              return;
            }
            const target = endpoint(event.request.url);
            let media: string | null = null;
            let refresh: string | null = null;
            if (target !== 'other' && event.request.method === 'POST') {
              const detail = z
                .object({
                  request: z.object({
                    postData: z.string().max(4096).optional(),
                    headers: z.record(z.string(), z.unknown()),
                  }),
                })
                .parse(raw).request;
              if (
                !detail.postData ||
                Buffer.byteLength(detail.postData) > 4096
              ) {
                unavailable = true;
                return;
              }
              const body: unknown = JSON.parse(detail.postData);
              if (target === 'media') {
                const parsed = mediaRequestSchema.safeParse(body);
                const header = Object.entries(detail.headers).find(
                  ([key]) => key.toLowerCase() === 'authorization',
                )?.[1];
                if (
                  parsed.success &&
                  typeof header === 'string' &&
                  header.startsWith('Bearer ') &&
                  header.length <= 16384
                )
                  media = mediaKey({
                    ...parsed.data,
                    actorTokenSha256: sha256(header.slice(7)),
                  });
              } else {
                const parsed = z
                  .object({ refresh_token: z.string().min(1).max(16384) })
                  .safeParse(body);
                if (parsed.success) refresh = sha256(parsed.data.refresh_token);
              }
            }
            records.set(`${String(info.index)}:${event.requestId}`, {
              page: info.index,
              phase: phase(),
              endpoint: target,
              media,
              refresh,
              status: null,
              failed: false,
              finished: false,
            });
          } catch {
            unavailable = true;
          }
        };
        const responseListener = (raw: unknown) => {
          try {
            const event = z
              .object({
                requestId: z.string(),
                response: z.object({ status: z.number() }),
              })
              .parse(raw);
            const record = records.get(
              `${String(info.index)}:${event.requestId}`,
            );
            if (!record) {
              unavailable = true;
              return;
            }
            record.status = event.response.status;
            if (record.status >= 500) unexpected++;
          } catch {
            unavailable = true;
          }
        };
        const failedListener = (raw: unknown) => {
          try {
            const event = z
              .object({ requestId: z.string(), errorText: z.string().max(512) })
              .parse(raw);
            const record = records.get(
              `${String(info.index)}:${event.requestId}`,
            );
            if (
              record?.phase === 'media' &&
              record.media &&
              expectedDrops.get(record.media) === info.index &&
              event.errorText === 'net::ERR_FAILED' &&
              !record.failed &&
              !observedDrops.has(record.media)
            ) {
              record.failed = true;
              observedDrops.add(record.media);
              approvedLogs.add(`${String(info.index)}:${event.requestId}`);
            } else unexpected++;
          } catch {
            unavailable = true;
          }
        };
        const finishedListener = (raw: unknown) => {
          observe(async () => {
            const event = z.object({ requestId: z.string() }).parse(raw);
            const record = records.get(
              `${String(info.index)}:${event.requestId}`,
            );
            if (record?.status === null || record === undefined) {
              unavailable = true;
              return;
            }
            record.finished = true;
            if (record.status < 400) {
              records.delete(`${String(info.index)}:${event.requestId}`);
              return;
            }
            if (record.status >= 500) return;
            if (
              record.phase !== 'controlled_refresh' ||
              record.endpoint !== 'refresh' ||
              !record.refresh ||
              refreshExpected?.page !== info.index ||
              refreshExpected.hash !== record.refresh ||
              ![400, 401, 403].includes(record.status)
            ) {
              unexpected++;
              return;
            }
            const response = z
              .object({ body: z.string(), base64Encoded: z.boolean() })
              .parse(
                await cdp.send('Network.getResponseBody', {
                  requestId: event.requestId,
                }),
              );
            if (Buffer.byteLength(response.body) > 24576) {
              unexpected++;
              return;
            }
            const body = response.base64Encoded
              ? Buffer.from(response.body, 'base64').toString('utf8')
              : response.body;
            if (Buffer.byteLength(body) > 16384) {
              unexpected++;
              return;
            }
            const code = z
              .object({ error_code: z.string().max(80) })
              .safeParse(JSON.parse(body));
            if (
              !code.success ||
              !refreshCodes.has(code.data.error_code) ||
              observedRefresh.size
            )
              unexpected++;
            else {
              observedRefresh.add(`${String(info.index)}:${record.refresh}`);
              approvedLogs.add(`${String(info.index)}:${event.requestId}`);
            }
          });
        };
        const logListener = (raw: unknown) => {
          try {
            const { entry } = z
              .object({
                entry: z.object({
                  level: z.string(),
                  source: z.string(),
                  text: z.string().max(4096),
                  url: z.string().optional(),
                  networkRequestId: z.string().optional(),
                }),
              })
              .parse(raw);
            if (entry.level !== 'error') return;
            const record = entry.networkRequestId
              ? records.get(`${String(info.index)}:${entry.networkRequestId}`)
              : null;
            const code = resourceCode(entry.text);
            if (
              !record ||
              entry.source !== 'network' ||
              !code ||
              !entry.url ||
              endpoint(entry.url) !== record.endpoint
            ) {
              unexpected++;
              return;
            }
            const drop =
              code === 'failed' &&
              record.phase === 'media' &&
              record.media &&
              expectedDrops.get(record.media) === info.index;
            const denied =
              code === 'denied' &&
              record.phase === 'controlled_refresh' &&
              record.refresh &&
              refreshExpected?.page === info.index &&
              refreshExpected.hash === record.refresh;
            const key = `${String(info.index)}:${entry.networkRequestId ?? ''}`;
            if ((drop || denied) && !networkLogs.has(key))
              networkLogs.set(
                key,
                `${String(info.index)}:${record.endpoint}:${code}`,
              );
            else unexpected++;
          } catch {
            unavailable = true;
          }
        };
        cdp.on('Network.requestWillBeSent', requestListener);
        cdp.on('Network.responseReceived', responseListener);
        cdp.on('Network.loadingFailed', failedListener);
        cdp.on('Network.loadingFinished', finishedListener);
        cdp.on('Log.entryAdded', logListener);
        info.disposers.push(() => {
          cdp.off('Network.requestWillBeSent', requestListener);
          cdp.off('Network.responseReceived', responseListener);
          cdp.off('Network.loadingFailed', failedListener);
          cdp.off('Network.loadingFinished', finishedListener);
          cdp.off('Log.entryAdded', logListener);
        });
        await cdp.send('Network.enable', { maxPostDataSize: 4096 });
        await cdp.send('Log.enable');
        info.enabled = true;
      } catch {
        unavailable = true;
      }
    })();
    void info.ready.catch(() => {
      unavailable = true;
    });
    return info.ready;
  };
  return {
    attach,
    identify: (page: Page, actor: string) => {
      const info = pages.get(page);
      if (!info) return fail('FUNCTIONAL_BROWSER_FAILED');
      info.actor = actor;
    },
    expectMediaDrop: (page: Page, request: MediaHttpRequest) => {
      const info = pages.get(page);
      const key = mediaKey(request);
      if (
        info?.actor !== 'A1' ||
        phase() !== 'media' ||
        !key ||
        expectedDrops.has(key) ||
        expectedDrops.size >= 4
      )
        return fail('FUNCTIONAL_BROWSER_FAILED');
      expectedDrops.set(key, info.index);
    },
    expectRefresh: (page: Page, refreshToken: string) => {
      const info = pages.get(page);
      if (
        info?.actor !== 'S2' ||
        phase() !== 'controlled_refresh' ||
        refreshExpected
      )
        return fail('FUNCTIONAL_BROWSER_FAILED');
      refreshExpected = { page: info.index, hash: sha256(refreshToken) };
    },
    settle: async () => {
      await Promise.all([...pages.values()].map((info) => info.ready));
      while (work.size) await Promise.allSettled([...work]);
    },
    snapshot: () => {
      const provenLogs = new Map<string, number>();
      let unproven = 0;
      for (const [key, fingerprint] of networkLogs) {
        if (approvedLogs.has(key)) bump(provenLogs, fingerprint);
        else unproven++;
      }
      const pendingErrors = [...records.values()].filter(
        (record) =>
          record.status !== null &&
          record.status >= 400 &&
          !record.finished &&
          !record.failed,
      ).length;
      const unmatched = [...pwCandidates].reduce(
        (sum, [key, count]) =>
          sum + Math.max(0, count - (provenLogs.get(key) ?? 0)),
        0,
      );
      return {
        available:
          !unavailable &&
          pages.size > 0 &&
          [...pages.values()].every((info) => info.enabled),
        expectedMediaDrops: observedDrops.size,
        expectedRefreshRejections: observedRefresh.size,
        unexpectedErrors:
          unexpected + pageErrors + unmatched + unproven + pendingErrors,
      };
    },
    dispose: async () => {
      for (const [page, info] of pages) {
        for (const dispose of info.disposers) dispose();
        if (info.cdp && !page.isClosed())
          await info.cdp.detach().catch(() => {
            unavailable = true;
          });
      }
    },
  };
};
