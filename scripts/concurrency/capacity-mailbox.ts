import { performance } from 'node:perf_hooks';
import { setTimeout as pause } from 'node:timers/promises';
import { z } from 'zod';
import {
  requireCapacityScope,
  capacityFailure,
  type CapacityScope,
} from './capacity-scope';
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/u);
const listing = z.object({
  messages_count: z.number().int().min(0).max(240),
  start: z.number().int().min(0).max(240),
  messages: z.array(z.object({ ID: id })).max(100),
});
export interface CapacityMailboxPorts {
  transport?: (url: URL, init: RequestInit) => Promise<Response>;
  now?: () => number;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}
// Matched Mailpit v1.30.2 Swagger: search start/limit (default50), detail GET marks read.
export const createCapacityMailbox = (
  scope: CapacityScope,
  cohort: { prefix: string; recipients: readonly string[] },
  signal: AbortSignal,
  ports: CapacityMailboxPorts = {},
) => {
  requireCapacityScope(scope);
  if (
    ![40, 60].includes(cohort.recipients.length) ||
    new Set(cohort.recipients).size !== cohort.recipients.length ||
    !cohort.prefix.startsWith(scope.planId + '.') ||
    !cohort.prefix.endsWith('.') ||
    !/^[a-z0-9.-]+$/u.test(cohort.prefix) ||
    cohort.recipients.some(
      (address) =>
        address.length > 254 ||
        !address.startsWith(cohort.prefix) ||
        !/^[a-z0-9.-]+@colorplay\.test$/u.test(address),
    )
  )
    return capacityFailure();
  const now = ports.now ?? (() => performance.now()),
    transport = ports.transport ?? fetch;
  const sleep =
    ports.sleep ??
    ((ms: number, stop: AbortSignal) => pause(ms, undefined, { signal: stop }));
  const controller = new AbortController(),
    combined = AbortSignal.any([signal, controller.signal]);
  const pending = new Set<Promise<unknown>>();
  const isStopped = () => combined.aborted;
  const observedAt = new Map<string, number>();
  let before: Set<string> | null = null,
    waited = false,
    closed = false,
    requests = 0,
    polls = 0,
    delivered = 0;
  const observe = <T>(operation: () => Promise<T>) => {
    const work = Promise.resolve().then(operation);
    pending.add(work);
    void work.then(
      () => {
        pending.delete(work);
      },
      () => {
        pending.delete(work);
      },
    );
    return work;
  };
  const request = async (url: URL): Promise<unknown> => {
    combined.throwIfAborted();
    requests++;
    const response = await transport(url, {
      method: 'GET',
      redirect: 'error',
      signal: combined,
    });
    if (!response.ok) return capacityFailure();
    const reader = response.body?.getReader();
    if (!reader) return capacityFailure();
    let bytes = 0;
    const chunks: Uint8Array[] = [];
    const cancel = () => {
      void reader.cancel().catch(() => undefined);
    };
    combined.addEventListener('abort', cancel, { once: true });
    try {
      for (;;) {
        combined.throwIfAborted();
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.length;
        if (bytes > 131072) return capacityFailure();
        chunks.push(part.value);
      }
      return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    } finally {
      combined.removeEventListener('abort', cancel);
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  };
  const list = async () => {
    const ids: string[] = [];
    let start = 0,
      total: number | null = null;
    for (let page = 0; page < 4; page++) {
      const url = new URL('/api/v1/search', scope.mailpitUrl);
      url.searchParams.set('query', `to:"${cohort.prefix}"`);
      url.searchParams.set('start', String(start));
      url.searchParams.set('limit', '100');
      const result = listing.parse(await observe(() => request(url)));
      if (
        result.start !== start ||
        (total !== null && result.messages_count !== total)
      )
        return capacityFailure();
      total = result.messages_count;
      ids.push(...result.messages.map((row) => row.ID));
      if (new Set(ids).size !== ids.length || ids.length > total)
        return capacityFailure();
      if (ids.length === total) return ids;
      if (result.messages.length === 0) return capacityFailure();
      start = ids.length;
    }
    return capacityFailure();
  };
  return {
    baseline: async () => {
      try {
        if (before !== null || closed) return capacityFailure();
        before = new Set(await list());
        return new Set(before);
      } catch {
        return capacityFailure();
      }
    },
    wait: async (): Promise<ReadonlyMap<string, string>> => {
      if (before === null || waited || closed) return capacityFailure();
      waited = true;
      const baseline = before,
        seen = new Set<string>(),
        codes = new Map<string, string>();
      const began = now();
      let rejectAbort: () => void = () => undefined;
      const aborted = new Promise<never>((_resolve, reject) => {
        rejectAbort = () => {
          reject(new Error('CAPACITY_EVIDENCE_INVALID'));
        };
      });
      void aborted.catch(() => undefined);
      combined.addEventListener('abort', rejectAbort, { once: true });
      const timer = setTimeout(() => {
        controller.abort();
      }, 30000);
      try {
        if (isStopped()) return capacityFailure();
        for (;;) {
          if (now() - began >= 30000) return capacityFailure();
          combined.throwIfAborted();
          polls++;
          const ids = await Promise.race([observe(list), aborted]);
          for (const messageId of ids) {
            if (baseline.has(messageId) || seen.has(messageId)) continue;
            const detail = z
              .object({
                To: z.array(z.object({ Address: z.string() })).length(1),
                Text: z.string().max(100000),
              })
              .parse(
                await Promise.race([
                  observe(() =>
                    request(
                      new URL(`/api/v1/message/${messageId}`, scope.mailpitUrl),
                    ),
                  ),
                  aborted,
                ]),
              );
            const address = detail.To[0]?.Address,
              candidates = [...detail.Text.matchAll(/\b(\d{6})\b/gu)],
              code = candidates[0]?.[1];
            if (
              !address ||
              !cohort.recipients.includes(address) ||
              codes.has(address) ||
              candidates.length !== 1 ||
              !code
            )
              return capacityFailure();
            seen.add(messageId);
            codes.set(address, code);
            observedAt.set(address, now());
            delivered = codes.size;
          }
          if (codes.size === cohort.recipients.length) {
            if (isStopped() || now() - began >= 30000) return capacityFailure();
            return codes;
          }
          await Promise.race([observe(() => sleep(1000, combined)), aborted]);
        }
      } catch {
        return capacityFailure();
      } finally {
        clearTimeout(timer);
        combined.removeEventListener('abort', rejectAbort);
      }
    },
    arrivals: () => new Map(observedAt),
    snapshot: () => ({
      mailpitRequests: requests,
      polls,
      recipientsExpected: cohort.recipients.length,
      uniqueCodesObserved: delivered,
      detailReadsMarkMessagesRead: true,
      timeoutMs: 30000,
      pollIntervalMs: 1000,
    }),
    dispose: async () => {
      closed = true;
      controller.abort();
      await Promise.allSettled([...pending]);
    },
  };
};
