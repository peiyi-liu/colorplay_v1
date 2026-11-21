import { performance } from 'node:perf_hooks';
import type { ElementHandle, Frame, Locator, Page } from '@playwright/test';
import { z } from 'zod';
import {
  getNativeCapacitySendBinding,
  type NativeCapacityActor,
} from './capacity-browser-runtime';
import type { SendClickObserver } from './capacity-send-diagnostics';
import { capacityFailure } from './capacity-scope';
import {
  capacityCohortButtonName,
  capacityCohortErrorClass as errorClass,
  capacityPreparedButtonReady,
  capacityLoginCohortContext,
  capacityLoginUrlMatches,
  capacityLoginFrameMatches,
  type CapacityCohortIntent,
  type CapacityLoginCohortInput,
} from './capacity-browser-entry-ui';
const phase = z.enum([
  'UNOBSERVED',
  'VISIBLE',
  'ENABLED',
  'FOCUS',
  'HANDLE',
  'PREPARE_DOM',
  'READY',
  'FRESH_DOM',
  'PRESS',
]);
const failure = z.enum(['ERROR', 'TYPE_ERROR', 'OTHER']).nullable();
export const capacitySendCohortSummarySchema = z.strictObject({
  schemaVersion: z.literal(1),
  authority: z.literal('NON_AUTHORITY'),
  executionAuthority: z.literal('NONE'),
  clock: z.literal('NODE_PERFORMANCE'),
  state: z.enum(['PREPARING', 'READY', 'RELEASED', 'FAILED', 'CLOSED']),
  allReady: z.boolean(),
  released: z.boolean(),
  closed: z.boolean(),
  pending: z.number().int().min(0).max(60),
  firstFailure: z
    .strictObject({
      actorIndex: z.number().int().min(0).max(59).nullable(),
      phase,
      errorClass: failure,
    })
    .nullable(),
  actors: z
    .array(
      z.strictObject({
        actorIndex: z.number().int().min(0).max(59),
        phase,
        startedAtMs: z.number().nonnegative().nullable(),
        lastAtMs: z.number().nonnegative().nullable(),
        consumed: z.boolean(),
        closed: z.boolean(),
      }),
    )
    .max(60),
});
type Phase = z.infer<typeof phase>;
interface Row {
  actor: NativeCapacityActor;
  intent: CapacityCohortIntent;
  owner: object;
  page: Page;
  observer: NativeCapacityActor['observer'];
  binding: ReturnType<typeof getNativeCapacitySendBinding>;
  locator?: Locator;
  handle?: ElementHandle<SVGElement | HTMLElement>;
  phase: Phase;
  started: number | null;
  last: number | null;
  ready: boolean;
  consumed: boolean;
  closed: boolean;
  invalid: boolean;
  work?: Promise<void>;
  track(delta: number): void;
  released(): boolean;
  check(): number;
  note(error: unknown): void;
  navigation: (frame: Frame) => void;
  closing: () => void;
}
const active = new WeakMap<object, Row>();
const usedActors = new WeakSet<object>(),
  usedPages = new WeakSet<object>(),
  usedObservers = new WeakSet<object>();
const requireTrue = (value: unknown) => {
  if (value !== true) return capacityFailure();
};
const hasHandle = (value: unknown) =>
  typeof value === 'object' && value !== null;
const consume = (
  actor: NativeCapacityActor,
  admit: () => void,
  observer: SendClickObserver | undefined,
  intent: CapacityCohortIntent,
  owner?: object,
): Promise<void> | undefined => {
  const row = active.get(actor);
  if (!row) {
    if (
      usedActors.has(actor) ||
      usedPages.has(actor.page) ||
      usedObservers.has(actor.observer)
    )
      return capacityFailure();
    return undefined;
  }
  if (row.consumed || row.intent !== intent || (owner && row.owner !== owner))
    return capacityFailure();
  const emit = (state: 'ENTERED' | 'RETURNED' | 'FAILED') => {
    try {
      observer?.({ state });
    } catch {
      /* Passive. */
    }
  };
  const work = (async () => {
    row.track(1);
    emit('ENTERED');
    try {
      if (
        row.actor !== actor ||
        row.page !== actor.page ||
        row.observer !== actor.observer ||
        !row.released() ||
        row.consumed
      )
        return capacityFailure();
      row.check();
      admit();
      row.consumed = true;
      const handle = row.handle,
        locator = row.locator;
      if (!handle || !locator) return capacityFailure();
      row.phase = 'FRESH_DOM';
      const valid = await locator.evaluate(
        capacityPreparedButtonReady,
        { expected: handle, intent },
        {
          timeout: row.check(),
        },
      );
      requireTrue(valid);
      admit();
      row.phase = 'PRESS';
      await handle.press('Enter', { timeout: row.check() });
      row.check();
      emit('RETURNED');
    } catch (error) {
      row.note(error);
      emit('FAILED');
      throw error;
    } finally {
      row.track(-1);
    }
  })();
  row.work = work;
  return work;
};
const createCohort = (
  actors: readonly NativeCapacityActor[],
  admit: () => void,
  signal: AbortSignal,
  now: () => number,
  intent: CapacityCohortIntent,
  owner: object,
  login?: ReturnType<typeof capacityLoginCohortContext>,
) => {
  let state: 'PREPARING' | 'READY' | 'RELEASED' | 'FAILED' | 'CLOSED' =
    'PREPARING';
  let allReady = false,
    released = false,
    closed = false,
    pending = 0;
  let firstFailure: z.infer<
    typeof capacitySendCohortSummarySchema
  >['firstFailure'] = null;
  const rows: Row[] = [];
  let closeTask: Promise<void> | undefined;
  let prepareTask: Promise<void> | undefined;
  const note = (row: Row | null, error: unknown) => {
    state = 'FAILED';
    firstFailure ??= {
      actorIndex: row?.actor.actorIndex ?? null,
      phase: row?.phase ?? 'UNOBSERVED',
      errorClass: errorClass(error),
    };
  };
  const abort = () => {
    for (const row of rows) row.invalid = true;
  };
  signal.addEventListener('abort', abort, { once: true });
  const controller = {
    prepare() {
      if (prepareTask || closeTask) return capacityFailure();
      prepareTask = (async () => {
        try {
          if (
            state !== 'PREPARING' ||
            rows.length ||
            actors.length < 1 ||
            actors.length > 60 ||
            new Set(actors).size !== actors.length ||
            new Set(actors.map((a) => a.page)).size !== actors.length ||
            new Set(actors.map((a) => a.observer)).size !== actors.length ||
            actors.some((a, i) => a.actorIndex !== i)
          )
            return capacityFailure();
          for (const actor of actors) {
            if (
              usedActors.has(actor) ||
              usedPages.has(actor.page) ||
              usedObservers.has(actor.observer)
            )
              return capacityFailure();
            const page = actor.page;
            let navigated = false;
            const row: Row = {
              actor,
              intent,
              owner,
              page,
              observer: actor.observer,
              binding: getNativeCapacitySendBinding(actor),
              phase: 'UNOBSERVED',
              started: null,
              last: null,
              ready: false,
              consumed: false,
              closed: false,
              invalid: false,
              track(delta) {
                pending += delta;
              },
              released: () => released && !closed,
              check() {
                admit();
                signal.throwIfAborted();
                if (
                  row.invalid ||
                  row.closed ||
                  actor.page !== page ||
                  actor.observer !== row.observer ||
                  !row.binding ||
                  getNativeCapacitySendBinding(actor) !== row.binding ||
                  !row.binding.current() ||
                  page.isClosed() ||
                  (login &&
                    !capacityLoginUrlMatches(
                      page.url(),
                      login.origin,
                      navigated
                        ? (login.destinations[actor.actorIndex] ?? '')
                        : '/login',
                    ))
                )
                  return capacityFailure();
                const at = now();
                if (
                  !Number.isFinite(at) ||
                  at < 0 ||
                  (row.last !== null && at < row.last)
                )
                  return capacityFailure();
                row.started ??= at;
                row.last = at;
                if (at - row.started >= 15000) return capacityFailure();
                return 15000 - (at - row.started);
              },
              note(error) {
                note(row, error);
              },
              navigation(frame) {
                if (frame !== page.mainFrame()) return;
                if (
                  login &&
                  row.consumed &&
                  row.phase === 'PRESS' &&
                  capacityLoginFrameMatches(
                    frame,
                    login.origin,
                    login.destinations[actor.actorIndex] ?? '',
                  )
                )
                  navigated = true;
                else row.invalid = true;
              },
              closing() {
                row.invalid = true;
              },
            };
            rows.push(row);
            active.set(actor, row);
            usedActors.add(actor);
            usedPages.add(page);
            usedObservers.add(actor.observer);
          }
          const outcomes = await Promise.allSettled(
            rows.map(async (row) => {
              pending++;
              try {
                row.check();
                row.page.on('framenavigated', row.navigation);
                row.page.on('close', row.closing);
                const button = row.page.getByRole('button', {
                  name: capacityCohortButtonName(intent),
                  exact: true,
                });
                row.locator = button;
                row.phase = 'VISIBLE';
                await button.waitFor({
                  state: 'visible',
                  timeout: row.check(),
                });
                row.phase = 'ENABLED';
                requireTrue(await button.isEnabled({ timeout: row.check() }));
                row.phase = 'FOCUS';
                await button.focus({ timeout: row.check() });
                row.phase = 'HANDLE';
                const handle = await button.elementHandle({
                  timeout: row.check(),
                });
                if (!hasHandle(handle)) return capacityFailure();
                row.handle = handle;
                row.phase = 'PREPARE_DOM';
                requireTrue(
                  await button.evaluate(
                    capacityPreparedButtonReady,
                    { expected: handle, intent },
                    {
                      timeout: row.check(),
                    },
                  ),
                );
                row.check();
                row.ready = true;
                row.phase = 'READY';
              } catch (error) {
                row.note(error);
                throw error;
              } finally {
                pending--;
              }
            }),
          );
          const failed = outcomes.find((r) => r.status === 'rejected');
          if (failed?.status === 'rejected') throw failed.reason;
          allReady = true;
          state = 'READY';
        } catch (error) {
          note(null, error);
          throw error;
        }
      })();
      return prepareTask;
    },
    release() {
      try {
        if (!allReady || state !== 'READY' || closed || released || pending)
          return capacityFailure();
        for (const row of rows) {
          try {
            if (!row.ready || row.consumed) return capacityFailure();
            row.check();
          } catch (error) {
            row.note(error);
            throw error;
          }
        }
        released = true;
        state = 'RELEASED';
      } catch (error) {
        released = false;
        for (const row of rows) row.invalid = true;
        note(null, error);
        throw error;
      }
    },
    close() {
      return (closeTask ??= (async () => {
        let failed = false,
          first: unknown;
        for (const row of rows) row.invalid = true;
        if (prepareTask) await prepareTask.catch(() => undefined);
        await Promise.allSettled(
          rows.flatMap((row) => (row.work ? [row.work] : [])),
        );
        signal.removeEventListener('abort', abort);
        const results = await Promise.allSettled(
          rows.map(async (row) => {
            active.delete(row.actor);
            row.invalid = true;
            let removed = true;
            for (const remove of [
              () => row.page.off('framenavigated', row.navigation),
              () => row.page.off('close', row.closing),
            ])
              try {
                remove();
              } catch (error) {
                if (!failed) first = error;
                failed = true;
                removed = false;
                note(row, error);
              }
            const handle = row.handle;
            delete row.handle;
            delete row.locator;
            try {
              await handle?.dispose();
              row.closed = removed;
            } catch (error) {
              if (!failed) first = error;
              failed = true;
              note(row, error);
            }
          }),
        );
        for (const result of results)
          if (result.status === 'rejected') {
            if (!failed) first = result.reason;
            failed = true;
          }
        closed = rows.every((r) => r.closed) && !failed;
        state = failed ? 'FAILED' : 'CLOSED';
        if (failed) throw first;
      })());
    },
    snapshot() {
      const data = capacitySendCohortSummarySchema.parse({
        schemaVersion: 1,
        authority: 'NON_AUTHORITY',
        executionAuthority: 'NONE',
        clock: 'NODE_PERFORMANCE',
        state,
        allReady,
        released,
        closed,
        pending,
        firstFailure,
        actors: rows.map((r) => ({
          actorIndex: r.actor.actorIndex,
          phase: r.phase,
          startedAtMs: r.started,
          lastAtMs: r.last,
          consumed: r.consumed,
          closed: r.closed,
        })),
      });
      if (Buffer.byteLength(JSON.stringify(data)) > 16384)
        return capacityFailure();
      return data;
    },
  };
  return controller;
};

export const createCapacitySendCohort = (
  actors: readonly NativeCapacityActor[],
  admit: () => void,
  signal: AbortSignal,
  now: () => number = () => performance.now(),
) => createCohort(actors, admit, signal, now, 'OTP_SEND', {});
export const consumeCapacitySendPreparation = (
  actor: NativeCapacityActor,
  admit: () => void,
  observer?: SendClickObserver,
) => consume(actor, admit, observer, 'OTP_SEND');
export const createCapacityLoginCohort = (
  input: CapacityLoginCohortInput,
  now: () => number = () => performance.now(),
) => {
  const owner = {},
    login = capacityLoginCohortContext(input);
  const cohort = createCohort(
    input.actors,
    input.admit,
    input.signal,
    now,
    'EXISTING_LOGIN',
    owner,
    login,
  );
  return {
    ...cohort,
    perform: (actor: NativeCapacityActor) =>
      consume(actor, input.admit, undefined, 'EXISTING_LOGIN', owner) ??
      capacityFailure(),
  };
};
