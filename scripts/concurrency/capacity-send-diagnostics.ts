import { performance } from 'node:perf_hooks';
import { z } from 'zod';
import {
  actualUi,
  type CapacityRegistrationUi,
} from './capacity-registration-ui';
import {
  getNativeCapacitySendBinding,
  type NativeCapacityActor,
} from './capacity-browser-runtime';
import { installSendDom, type SendDomLease } from './capacity-send-dom';
const n = z.number().nonnegative(),
  ordinal = z.number().int().min(0).max(59),
  generation = z.number().int().min(1).max(16);
const token = z.custom<object>((v) => typeof v === 'object' && v !== null);
const base = {
  actorOrdinal: ordinal,
  generation,
  token,
  atNodeMs: n.nullable(),
};
const pulseSchema = z.discriminatedUnion('kind', [
  z.strictObject({ ...base, kind: z.literal('ARM') }),
  z.strictObject({
    ...base,
    kind: z.literal('REQUEST'),
    requestId: z.string().min(1).max(200),
    requestAtCdpMs: n,
  }),
  z.strictObject({ ...base, kind: z.literal('INVALID') }),
]);
export type SendPulse = z.infer<typeof pulseSchema>;
export interface SendClickObservation {
  state: 'ENTERED' | 'RETURNED' | 'FAILED';
}
export type SendClickObserver = (value: SendClickObservation) => void;
export const emitSendClick = (
  observer: SendClickObserver | undefined,
  state: SendClickObservation['state'],
) => {
  try {
    observer?.({ state });
  } catch {
    /* Passive only. */
  }
};
/** Pure pairing has no native provenance. Tokens and request IDs never leave memory. */
export const createSendPairing = (actorOrdinal: number) => {
  let arm: Extract<SendPulse, { kind: 'ARM' }> | undefined,
    request: Extract<SendPulse, { kind: 'REQUEST' }> | undefined,
    bad = false;
  return {
    observe(raw: unknown) {
      try {
        const v = pulseSchema.parse(raw);
        if (v.actorOrdinal !== actorOrdinal || v.atNodeMs === null)
          throw Error();
        if (v.kind === 'INVALID') throw Error();
        if (v.kind === 'ARM') {
          if (arm) throw Error();
          arm = v;
        } else {
          if (request) throw Error();
          request = v;
        }
        if (
          arm &&
          request &&
          (arm.token !== request.token ||
            arm.generation !== request.generation ||
            request.atNodeMs === null ||
            arm.atNodeMs === null ||
            request.atNodeMs < arm.atNodeMs)
        )
          throw Error();
      } catch {
        bad = true;
      }
    },
    snapshot: () => ({
      collection: bad
        ? ('UNAVAILABLE' as const)
        : arm && request
          ? ('OBSERVED' as const)
          : ('UNOBSERVED' as const),
      generation: arm?.generation ?? request?.generation ?? null,
      armAtNodeMs: arm?.atNodeMs ?? null,
      requestCallbackAtNodeMs: request?.atNodeMs ?? null,
      requestAtCdpMs: request?.requestAtCdpMs ?? null,
    }),
  };
};
const sourceSend = actualUi.send;
const bindingSchema = z.strictObject({
  sourceRevision: z.string().regex(/^[a-f0-9]{40}$/u),
  planId: z.string().regex(/^wsc-[a-z0-9]{6,16}-[a-z0-9]{6,16}$/u),
  legId: z.string().max(100),
  executionProfileSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  actorsExpected: z.number().int().min(1).max(60),
});
const eventSchema = z.strictObject({
  phase: z.enum(['BATCH', 'PERFORM', 'CLICK']),
  state: z.enum(['ENTERED', 'RETURNED', 'FAILED']),
  actorOrdinal: ordinal.nullable(),
  generation: generation.nullable(),
  atNodeMs: n,
});
export const createCapacitySendDiagnostics = (
  binding: z.infer<typeof bindingSchema>,
  now: () => number = () => performance.now(),
) => {
  const scope = bindingSchema.parse(binding),
    events: z.infer<typeof eventSchema>[] = [],
    rows = new Map<
      number,
      {
        actor: NativeCapacityActor;
        pair: ReturnType<typeof createSendPairing>;
        native: ReturnType<typeof getNativeCapacitySendBinding>;
        dom?: SendDomLease;
        unsubscribe?: () => void;
      }
    >();
  let bad = false,
    overflow = false,
    last = 0,
    bytes = 2,
    prepared = false,
    sealed = false,
    batchState: 'NOT_STARTED' | 'RUNNING' | 'SETTLED' = 'NOT_STARTED',
    writeState: 'NOT_ATTEMPTED' | 'WRITTEN' | 'UNAVAILABLE' = 'NOT_ATTEMPTED';
  let finishing: Promise<void> | undefined,
    activeBatch: Promise<unknown> | undefined;
  const pending = new Set<Promise<unknown>>();
  const tracked = <T>(task: Promise<T>) => {
    pending.add(task);
    void task.finally(() => pending.delete(task)).catch(() => undefined);
    return task;
  };
  const record = (
    phase: z.infer<typeof eventSchema>['phase'],
    state: z.infer<typeof eventSchema>['state'],
    actorOrdinal: number | null,
  ) => {
    try {
      if (sealed || events.length >= 2000) {
        overflow = true;
        throw Error();
      }
      const at = now();
      if (!Number.isFinite(at) || at < last) throw Error();
      last = at;
      const value = eventSchema.parse({
        phase,
        state,
        actorOrdinal,
        generation:
          actorOrdinal === null
            ? null
            : (rows.get(actorOrdinal)?.pair.snapshot().generation ?? null),
        atNodeMs: at,
      });
      const size =
        Buffer.byteLength(JSON.stringify(value)) + (events.length ? 1 : 0);
      if (bytes + size > 900000) {
        overflow = true;
        throw Error();
      }
      bytes += size;
      events.push(value);
    } catch {
      bad = true;
    }
  };
  const settle = async (read: boolean) => {
    await Promise.allSettled(
      [...rows.values()].map((row) =>
        tracked(
          (async () => {
            try {
              if (row.native && !row.native.current()) bad = true;
              if (read && row.dom) {
                await row.dom.read();
              }
            } catch {
              bad = true;
            } finally {
              try {
                row.unsubscribe?.();
              } catch {
                bad = true;
              }
              try {
                await row.dom?.close();
              } catch {
                bad = true;
              }
            }
          })(),
        ),
      ),
    );
  };
  const collection = () =>
    bad
      ? ('UNAVAILABLE' as const)
      : !prepared ||
          rows.size !== scope.actorsExpected ||
          [...rows.values()].some(
            (row) =>
              !row.native ||
              row.pair.snapshot().collection !== 'OBSERVED' ||
              row.dom?.snapshot().collection !== 'OBSERVED',
          )
        ? ('UNOBSERVED' as const)
        : ('OBSERVED' as const);
  const ownedRow = (actor: NativeCapacityActor) => {
    const row = rows.get(actor.actorIndex);
    if (row?.actor !== actor || (row.native && !row.native.current())) {
      bad = true;
      return;
    }
    return row;
  };
  return {
    async prepare(
      actors: readonly NativeCapacityActor[],
      ui: CapacityRegistrationUi,
    ) {
      if (prepared) {
        bad = true;
        return;
      }
      prepared = true;
      if (
        actors.length !== scope.actorsExpected ||
        new Set(actors.map((a) => a.actorIndex)).size !== actors.length ||
        actors.length > 60
      )
        bad = true;
      await Promise.allSettled(
        actors.slice(0, 60).map((actor) =>
          tracked(
            (async () => {
              try {
                const index = ordinal.parse(actor.actorIndex),
                  native =
                    ui === actualUi && ui.send === sourceSend
                      ? getNativeCapacitySendBinding(actor)
                      : undefined;
                const row = {
                  actor,
                  pair: createSendPairing(index),
                  native,
                } as {
                  actor: NativeCapacityActor;
                  pair: ReturnType<typeof createSendPairing>;
                  native: ReturnType<typeof getNativeCapacitySendBinding>;
                  dom?: SendDomLease;
                  unsubscribe?: () => void;
                };
                if (rows.has(index)) {
                  bad = true;
                  return;
                }
                rows.set(index, row);
                if (!native?.current()) return;
                row.unsubscribe = native.subscribe((pulse) => {
                  try {
                    if (!native.current()) {
                      bad = true;
                      return;
                    }
                    row.pair.observe(pulse);
                  } catch {
                    bad = true;
                  }
                });
                row.dom = await installSendDom(actor.page);
                if (!native.current()) await row.dom.close();
              } catch {
                bad = true;
              }
            })(),
          ),
        ),
      );
    },
    clickObserver(actor: NativeCapacityActor): SendClickObserver | undefined {
      const row = ownedRow(actor);
      return row?.native?.current()
        ? (v) => {
            if (ownedRow(actor) === row)
              record('CLICK', v.state, actor.actorIndex);
          }
        : undefined;
    },
    perform<T>(
      actor: NativeCapacityActor,
      operation: () => Promise<T>,
    ): Promise<T> {
      const row = ownedRow(actor);
      const emit = (state: 'ENTERED' | 'RETURNED' | 'FAILED') => {
        if (row && ownedRow(actor) === row)
          record('PERFORM', state, actor.actorIndex);
      };
      emit('ENTERED');
      try {
        return operation().then(
          (value) => {
            emit('RETURNED');
            return value;
          },
          (error: unknown) => {
            emit('FAILED');
            throw error;
          },
        );
      } catch (error) {
        emit('FAILED');
        throw error;
      }
    },
    batch<T>(operation: () => Promise<T>): Promise<T> {
      if (batchState !== 'NOT_STARTED') bad = true;
      batchState = 'RUNNING';
      const task = (async () => {
        record('BATCH', 'ENTERED', null);
        try {
          const result = await operation();
          record('BATCH', 'RETURNED', null);
          return result;
        } catch (error) {
          record('BATCH', 'FAILED', null);
          throw error;
        } finally {
          try {
            batchState = 'SETTLED';
            await settle(true);
          } catch {
            bad = true;
          }
        }
      })();
      activeBatch = task;
      return task;
    },
    finish(journal: { write(name: string, value: unknown): Promise<void> }) {
      return (finishing ??= (async () => {
        try {
          await activeBatch?.catch(() => undefined);
          if (batchState === 'NOT_STARTED') await settle(false);
          await Promise.allSettled([...pending]);
          sealed = true;
          const value = {
            schemaVersion: 1,
            authority: 'NON_AUTHORITY',
            ...scope,
            collection: collection(),
            sealed,
            overflow,
            batchState,
            batchSettled: batchState === 'SETTLED',
            pending: pending.size,
            writeState: 'WRITE_ATTEMPTED',
            clockDomains: [
              'NODE_MONOTONIC',
              'BROWSER_DOCUMENT_PERFORMANCE',
              'CHROMIUM_NETWORK_MONOTONIC',
            ],
            events,
            actors: [...rows].map(([actorOrdinal, row]) => ({
              actorOrdinal,
              nativeSource: row.native ? 'DEFAULT_NATIVE_TUPLE' : 'UNOBSERVED',
              pairing: row.pair.snapshot(),
              dom: row.dom?.snapshot() ?? null,
              nativeRuntimeClosed: row.native?.closed() ?? null,
            })),
          };
          if (Buffer.byteLength(JSON.stringify(value)) > 1048576) throw Error();
          await journal.write('capacity-send-diagnostics', value);
          writeState = 'WRITTEN';
        } catch {
          bad = true;
          writeState = 'UNAVAILABLE';
        }
      })());
    },
    snapshot: () => ({
      collection: collection(),
      authority: 'NON_AUTHORITY' as const,
      prepared,
      batchState,
      batchSettled: batchState === 'SETTLED',
      sealed,
      overflow,
      pending: pending.size,
      events: structuredClone(events),
      writeState,
      actors: [...rows].map(([actorOrdinal, row]) => ({
        actorOrdinal,
        nativeSource: row.native ? 'DEFAULT_NATIVE_TUPLE' : 'UNOBSERVED',
        pairing: row.pair.snapshot(),
        dom: row.dom?.snapshot() ?? null,
        nativeRuntimeClosed: row.native?.closed() ?? null,
      })),
    }),
  };
};
export type CapacitySendDiagnostics = ReturnType<
  typeof createCapacitySendDiagnostics
>;
export const observeSendBatch = <T>(
  diagnostics: CapacitySendDiagnostics | undefined,
  operation: () => Promise<T>,
) => (diagnostics ? diagnostics.batch(operation) : operation());
export const observeSendPerform = <T>(
  diagnostics: CapacitySendDiagnostics | undefined,
  actor: NativeCapacityActor,
  operation: () => Promise<T>,
) => (diagnostics ? diagnostics.perform(actor, operation) : operation());
