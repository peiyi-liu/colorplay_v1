import { performance as nodePerformance } from 'node:perf_hooks';
import type { Page, JSHandle } from '@playwright/test';
import { z } from 'zod';
const ms = z.number().nonnegative();
export const sendDomSnapshotSchema = z
  .strictObject({
    collection: z.enum(['OBSERVED', 'UNKNOWN', 'UNAVAILABLE']),
    authority: z.literal('NON_AUTHORITY'),
    clock: z.literal('BROWSER_DOCUMENT_PERFORMANCE'),
    clickAtMs: z.array(ms).max(4),
    anchor: z.strictObject({
      documentAtMs: ms.nullable(),
      nodeBeforeMs: ms.nullable(),
      nodeAfterMs: ms.nullable(),
      relation: z.literal('INSTALL_ROUND_TRIP_BOUNDS_ONLY'),
    }),
    overflow: z.boolean(),
    reason: z.enum([
      'ONE_TRUSTED_CLICK',
      'NO_CLICK',
      'DUPLICATE',
      'DOCUMENT_CHANGED',
      'CLOCK_INVALID',
      'OVERFLOW',
      'UNAVAILABLE',
    ]),
    documentCurrent: z.boolean().nullable(),
    listenerClosed: z.boolean(),
    handleDisposed: z.boolean(),
    pending: z.number().int().nonnegative(),
  })
  .superRefine((v, c) => {
    if (
      v.collection === 'OBSERVED' &&
      (v.clickAtMs.length !== 1 ||
        v.overflow ||
        v.documentCurrent !== true ||
        !v.listenerClosed ||
        !v.handleDisposed ||
        v.pending !== 0 ||
        v.anchor.documentAtMs === null ||
        v.anchor.nodeBeforeMs === null ||
        v.anchor.nodeAfterMs === null ||
        v.anchor.nodeAfterMs < v.anchor.nodeBeforeMs ||
        v.clickAtMs.some((t) => t < (v.anchor.documentAtMs ?? Infinity)))
    )
      c.addIssue({ code: 'custom', message: 'DOM_PROOF_INCOMPLETE' });
  });
export type SendDomSnapshot = z.infer<typeof sendDomSnapshotSchema>;
interface Memory {
  readAndClose(): {
    clickAtMs: number[];
    anchorMs: number | null;
    overflow: boolean;
    invalidClock: boolean;
    documentCurrent: boolean;
  };
  close(): void;
}
export const installSendDom = async (
  page: Page,
  now: () => number = () => nodePerformance.now(),
) => {
  let nodeBeforeMs: number | null = null,
    nodeAfterMs: number | null = null;
  const stamp = () => {
    try {
      const t = now();
      return Number.isFinite(t) && t >= 0 ? t : null;
    } catch {
      return null;
    }
  };
  let handle: JSHandle<Memory> | undefined,
    listenerClosed = false,
    handleDisposed = false,
    pending = 0,
    installFailed = false;
  let data: ReturnType<Memory['readAndClose']> | undefined,
    readTask: Promise<SendDomSnapshot> | undefined,
    cleanupTask: Promise<void> | undefined;
  const track = async <T>(operation: () => Promise<T>) => {
    pending++;
    try {
      return await operation();
    } finally {
      pending--;
    }
  };
  const snapshot = (): SendDomSnapshot => {
    const reason =
      installFailed || !data
        ? 'UNAVAILABLE'
        : !data.documentCurrent
          ? 'DOCUMENT_CHANGED'
          : data.invalidClock ||
              data.anchorMs === null ||
              nodeBeforeMs === null ||
              nodeAfterMs === null ||
              nodeAfterMs < nodeBeforeMs
            ? 'CLOCK_INVALID'
            : data.overflow
              ? 'OVERFLOW'
              : data.clickAtMs.length === 0
                ? 'NO_CLICK'
                : data.clickAtMs.length > 1
                  ? 'DUPLICATE'
                  : 'ONE_TRUSTED_CLICK';
    return sendDomSnapshotSchema.parse({
      collection:
        reason === 'ONE_TRUSTED_CLICK' &&
        listenerClosed &&
        handleDisposed &&
        pending === 0
          ? 'OBSERVED'
          : reason === 'NO_CLICK'
            ? 'UNKNOWN'
            : 'UNAVAILABLE',
      authority: 'NON_AUTHORITY',
      clock: 'BROWSER_DOCUMENT_PERFORMANCE',
      clickAtMs: data?.clickAtMs ?? [],
      anchor: {
        documentAtMs: data?.anchorMs ?? null,
        nodeBeforeMs,
        nodeAfterMs,
        relation: 'INSTALL_ROUND_TRIP_BOUNDS_ONLY',
      },
      overflow: data?.overflow ?? false,
      reason,
      documentCurrent: data?.documentCurrent ?? null,
      listenerClosed,
      handleDisposed,
      pending,
    });
  };
  const cleanup = () =>
    (cleanupTask ??= (async () => {
      if (handle) {
        const owned = handle;
        if (!listenerClosed)
          try {
            await track(() =>
              owned.evaluate((state) => {
                state.close();
              }),
            );
            listenerClosed = true;
          } catch {
            /* Unknown until original context closes. */
          }
        try {
          await track(() => owned.dispose());
          handleDisposed = true;
        } catch {
          /* No invented close. */
        }
      }
    })());
  let element:
    | Awaited<ReturnType<ReturnType<Page['getByRole']>['elementHandle']>>
    | undefined;
  try {
    element = await track(() =>
      page
        .getByRole('button', { name: '傳送驗證碼', exact: true })
        .elementHandle(),
    );
    const ownedElement = element;
    nodeBeforeMs = stamp();
    try {
      handle = await track(() =>
        ownedElement.evaluateHandle((node) => {
          if (!(node instanceof HTMLButtonElement))
            throw Error('SEND_DOM_TARGET_INVALID');
          const doc = node.ownerDocument,
            times: number[] = [],
            now = performance.now.bind(performance);
          let closed = false,
            overflow = false,
            invalidClock = false,
            last = 0;
          let anchorMs: number | null = null;
          try {
            const at = now();
            if (Number.isFinite(at) && at >= 0) {
              anchorMs = at;
              last = at;
            } else invalidClock = true;
          } catch {
            invalidClock = true;
          }
          const memory: Memory & { listener: (event: Event) => void } = {
            listener(event: Event) {
              if (
                closed ||
                !event.isTrusted ||
                !(event.target instanceof Node) ||
                !node.contains(event.target)
              )
                return;
              if (times.length >= 4) {
                overflow = true;
                return;
              }
              try {
                const at = now();
                if (!Number.isFinite(at) || at < 0 || at < last) {
                  invalidClock = true;
                  return;
                }
                last = at;
                times.push(at);
              } catch {
                invalidClock = true;
              }
            },
            close() {
              node.removeEventListener('click', memory.listener, true);
              closed = true;
            },
            readAndClose() {
              const documentCurrent =
                doc === document &&
                node.ownerDocument === doc &&
                node.isConnected;
              memory.close();
              return {
                clickAtMs: [...times],
                anchorMs,
                overflow,
                invalidClock,
                documentCurrent,
              };
            },
          };
          node.addEventListener('click', memory.listener, true);
          return memory;
        }),
      );
    } finally {
      nodeAfterMs = stamp();
    }
  } catch {
    installFailed = true;
  } finally {
    if (element) {
      const ownedElement = element;
      try {
        await track(() => ownedElement.dispose());
      } catch {
        installFailed = true;
      }
    }
  }
  return {
    read: () =>
      (readTask ??= (async () => {
        try {
          const owned = handle;
          if (!owned) throw Error();
          data = await track(() =>
            owned.evaluate((state) => state.readAndClose()),
          );
          listenerClosed = true;
          // Parse browser data before retaining it. No raw errors or arbitrary properties.
          data = z
            .strictObject({
              clickAtMs: z.array(ms).max(4),
              anchorMs: ms.nullable(),
              overflow: z.boolean(),
              invalidClock: z.boolean(),
              documentCurrent: z.boolean(),
            })
            .parse(data);
        } catch {
          installFailed = true;
          data = undefined;
        } finally {
          await cleanup();
        }
        return snapshot();
      })()),
    close: async () => {
      if (readTask) await readTask.catch(() => undefined);
      await cleanup();
    },
    snapshot,
  };
};
export type SendDomLease = Awaited<ReturnType<typeof installSendDom>>;
