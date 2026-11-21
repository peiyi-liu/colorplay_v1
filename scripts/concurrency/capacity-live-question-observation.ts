import { performance } from 'node:perf_hooks';
import { types } from 'node:util';
import { z } from 'zod';
import type { Frame, Page, Request } from '@playwright/test';
import {
  captureLiveReconcileProjection as captureTrace,
  liveReconcileProjectionSchema,
} from '../../src/features/live/lib/live-reconcile-diagnostics';
import type { LiveSessionState } from '../../src/features/live/types';
import {
  getNativeCapacitySendBinding,
  type NativeCapacityActor,
} from './capacity-browser-runtime';
import type { CapacityScope } from './capacity-scope';
import type { PromptWaitObservation } from './capacity-live-student-question';
const count = z.number().int().min(0).max(1000000);
const collection = z.enum(['OBSERVED', 'UNOBSERVED', 'UNAVAILABLE']);
const stateView = z.strictObject({
  state: z.enum([
    'draft',
    'lobby',
    'question_open',
    'paused',
    'question_feedback',
    'completed',
    'cancelled',
  ]),
  stateVersion: count,
  currentPosition: z.number().int().min(0).max(20),
  questionCount: z.number().int().min(0).max(20),
  questionDisplay: z.enum(['device', 'screen_only']),
  isHost: z.boolean(),
  waitingForNext: z.boolean(),
});
const visible = z.enum(['VISIBLE', 'HIDDEN', 'UNOBSERVED', 'UNAVAILABLE']);
const uiView = z.strictObject({
  reconcile: liveReconcileProjectionSchema.optional(),
  counter: z.strictObject({
    collection,
    position: count.nullable(),
    total: count.nullable(),
  }),
  counterVisible: visible,
  screenHint: visible,
  sending: visible,
  answered: visible,
  feedback: visible,
  error: visible,
  waiting: visible,
  loading: visible,
  connection: z.enum([
    'connected',
    'connecting',
    'disconnected',
    'UNOBSERVED',
    'UNAVAILABLE',
  ]),
});
const received = z.strictObject({
  collection,
  ordinal: count,
  atNodeMs: z.number().nonnegative().nullable(),
  state: stateView.nullable(),
});
const rowSchema = z.strictObject({
  actorIndex: z.number().int().min(0).max(59),
  position: z.number().int().min(1).max(20),
  node: stateView.nullable(),
  failedWait: z.enum(['COUNTER', 'MODE_TEXT']).nullable(),
  counter: z.enum(['UNOBSERVED', 'ENTERED', 'RETURNED', 'FAILED']),
  modeText: z.enum(['UNOBSERVED', 'ENTERED', 'RETURNED', 'FAILED']),
  browser: received,
  ui: z.strictObject({
    collection,
    beforeNodeMs: z.number().nonnegative().nullable(),
    afterNodeMs: z.number().nonnegative().nullable(),
    view: uiView.nullable(),
  }),
});
export const capacityLiveQuestionObservationSchema = z.strictObject({
  schemaVersion: z.literal(1),
  authority: z.literal('NON_AUTHORITY'),
  collection,
  closed: z.boolean(),
  pending: count,
  overflow: z.boolean(),
  rows: z.array(rowSchema).max(60),
});
type Row = z.infer<typeof rowSchema>;
interface StateRead {
  track: (task: Promise<unknown>) => void;
  complete: (raw: unknown) => void;
}
const leases = new WeakMap<
  Page,
  {
    begin: (request: Request, generation: number) => StateRead | undefined;
  }
>();
export const beginCapacityLiveStateRead = (
  page: Page,
  request: Request,
  generation: number,
) => {
  try {
    return leases.get(page)?.begin(request, generation);
  } catch {
    return undefined;
  }
};
const data = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || types.isProxy(value))
    throw Error();
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw Error();
  const plain = Object.create(null) as Record<string, unknown>;
  for (const [key, descriptor] of Object.entries(
    Object.getOwnPropertyDescriptors(value),
  )) {
    if (!('value' in descriptor)) throw Error();
    plain[key] = descriptor.value;
  }
  return plain;
};
const project = (raw: unknown, wire = false) => {
  const r = data(raw);
  const pick = (camel: string, snake: string) => r[wire ? snake : camel];
  return stateView.parse({
    state: r.state,
    stateVersion: pick('stateVersion', 'state_version'),
    currentPosition: pick('currentPosition', 'current_position'),
    questionCount: pick('questionCount', 'question_count'),
    questionDisplay: pick('questionDisplay', 'question_display'),
    isHost: pick('isHost', 'is_host'),
    waitingForNext: pick('waitingForNext', 'waiting_for_next') ?? false,
  });
};
// One fixed readonly callback. It returns no arbitrary text, question/options, URL, IDs, inputs or browser storage.
export const readCapacityLiveQuestionUi = () => {
  const read = {
    trace(): number[] | string {
      try {
        const root: unknown = Object.getOwnPropertyDescriptor(
          window,
          '__colorplayCapacityRealtime',
        )?.value;
        const slot: unknown = Object.getOwnPropertyDescriptor(
          root ?? {},
          'liveTrace',
        )?.value;
        const value: unknown = Object.getOwnPropertyDescriptor(
          slot ?? {},
          'q',
        )?.value;
        if (value === undefined) return [1, 0];
        return typeof value === 'string' && value.length <= 768
          ? value
          : [1, 3];
      } catch {
        return [1, 3];
      }
    },
    visible(selector: string) {
      const element = document.querySelector<HTMLElement>(selector);
      return element?.checkVisibility({
        checkOpacity: true,
        checkVisibilityCSS: true,
      })
        ? ('VISIBLE' as const)
        : ('HIDDEN' as const);
    },
    known(selector: string, text: string) {
      return Array.from(document.querySelectorAll<HTMLElement>(selector)).some(
        (element) =>
          element.textContent === text &&
          element.checkVisibility({
            checkOpacity: true,
            checkVisibilityCSS: true,
          }),
      )
        ? ('VISIBLE' as const)
        : ('HIDDEN' as const);
    },
  };
  const counter = document.querySelector('.live-student-status-bar__question');
  const match = counter?.textContent?.match(
    /第\s+(\d{1,2})\s*\/\s*(\d{1,2})\s*題/u,
  );
  const connection = document
    .querySelector(
      '.live-student-status-bar__connection[data-state], [aria-label="連線恢復"] [data-state]',
    )
    ?.getAttribute('data-state');
  return {
    reconcile: read.trace(),
    counter: {
      collection: match ? 'OBSERVED' : 'UNOBSERVED',
      position: match ? Number(match[1]) : null,
      total: match ? Number(match[2]) : null,
    },
    counterVisible: read.visible('.live-student-status-bar__question'),
    screenHint: read.known(
      '.live-student-question-card legend span',
      '請看投影幕作答',
    ),
    sending: read.known(
      '.live-student-question-card legend [role="status"]',
      '答案送出中…',
    ),
    answered: read.known(
      '.live-student-question-card legend [role="status"]',
      '答案已送出，等待揭曉…',
    ),
    feedback: read.visible('.live-result-screen, .live-distribution'),
    error: read.visible(
      '.route-panel [role="alert"], .live-student-submit-error',
    ),
    waiting: read.visible('.live-waiting, .live-student-lobby'),
    loading: read.visible('[role="status"][aria-label="頁面載入中"]'),
    connection:
      connection === 'connected' ||
      connection === 'connecting' ||
      connection === 'disconnected'
        ? connection
        : 'UNOBSERVED',
  };
};
export const createCapacityLiveQuestionObservation = (
  scope: CapacityScope,
  signal: AbortSignal,
  now: () => number = () => performance.now(),
) => {
  const rows = new Map<number, Row>();
  const owned = new Map<
    Page,
    {
      actor: NativeCapacityActor;
      current: () => boolean;
      session: string | null;
      generation: number | null;
      navigation: number;
      ordinal: number;
      latest: Row['browser'];
      detach: () => void;
    }
  >();
  const pending = new Set<Promise<unknown>>();
  let accepting = true,
    overflow = false,
    unavailable = false,
    closed = false;
  let writer: (() => Promise<void>) | undefined,
    finishing: Promise<void> | undefined;
  const safe = (action: () => void) => {
    try {
      action();
    } catch {
      unavailable = true;
    }
  };
  const passive =
    <A extends unknown[]>(action: (...args: A) => void) =>
    (...args: A) => {
      safe(() => {
        action(...args);
      });
    };
  const track = (task: Promise<unknown>) => {
    pending.add(task);
    void task.then(
      () => pending.delete(task),
      () => pending.delete(task),
    );
  };
  const valid = (page: Page) => {
    const lease = owned.get(page);
    if (
      !lease ||
      !accepting ||
      signal.aborted ||
      lease.generation === -1 ||
      !lease.current()
    )
      return false;
    const url = new URL(page.url());
    return (
      lease.session !== null &&
      url.origin === scope.appUrl &&
      url.pathname === `/app/live/${lease.session}` &&
      !url.search &&
      !url.hash
    );
  };
  return Object.freeze({
    register: passive((actor: NativeCapacityActor) => {
      const binding = getNativeCapacitySendBinding(actor);
      if (!accepting || !binding || owned.size >= 60 || leases.has(actor.page))
        return;
      const page = actor.page;
      const lease = {
        actor,
        current: () =>
          getNativeCapacitySendBinding(actor) === binding &&
          binding.current() &&
          actor.page === page,
        session: null as string | null,
        generation: null as number | null,
        navigation: 0,
        ordinal: 0,
        latest: {
          collection: 'UNOBSERVED' as const,
          ordinal: 0,
          atNodeMs: null,
          state: null,
        } as Row['browser'],
        detach: (): void => undefined,
      };
      const navigate = (frame: Frame) => {
        if (frame === page.mainFrame()) lease.navigation++;
      };
      const close = () => {
        lease.navigation++;
      };
      page.on('framenavigated', navigate);
      page.on('close', close);
      lease.detach = () => {
        page.off('framenavigated', navigate);
        page.off('close', close);
      };
      owned.set(page, lease);
      leases.set(page, {
        begin: (request, generation) => {
          if (
            !valid(page) ||
            new URL(request.url()).origin !== scope.supabaseUrl ||
            request.method() !== 'POST' ||
            new URL(request.url()).pathname !==
              '/rest/v1/rpc/get_live_session_state'
          )
            return;
          lease.generation ??= generation;
          if (lease.generation !== generation) {
            lease.generation = -1;
            return;
          }
          const navigation = lease.navigation,
            session = lease.session,
            ordinal = ++lease.ordinal;
          return {
            track: (task) => {
              if (!closed) track(task);
            },
            complete: passive((raw: unknown) => {
              const value = data(raw);
              if (
                !valid(page) ||
                lease.navigation !== navigation ||
                lease.generation !== generation ||
                value.session_id !== session ||
                ordinal <= lease.latest.ordinal
              )
                return;
              lease.latest = {
                collection: 'OBSERVED',
                ordinal,
                atNodeMs: now(),
                state: project(value, true),
              };
            }),
          };
        },
      });
    }),
    bind: passive((page: Page, actorIndex: number, session: string) => {
      const lease = owned.get(page);
      if (
        lease?.actor.actorIndex === actorIndex &&
        lease.session === null &&
        /^[a-f0-9-]{36}$/u.test(session)
      )
        lease.session = session;
    }),
    watch: (
      page: Page,
      actorIndex: number,
      position: number,
      node: LiveSessionState,
    ) => {
      let row: Row | undefined;
      safe(() => {
        if (!accepting || rows.get(actorIndex)?.failedWait) return;
        if (!rows.has(actorIndex) && rows.size >= 60) {
          overflow = true;
          return;
        }
        row = rowSchema.parse({
          actorIndex,
          position,
          node: project(node),
          failedWait: null,
          counter: 'UNOBSERVED',
          modeText: 'UNOBSERVED',
          browser: owned.get(page)?.latest ?? {
            collection: 'UNOBSERVED',
            ordinal: 0,
            atNodeMs: null,
            state: null,
          },
          ui: {
            collection: 'UNOBSERVED',
            beforeNodeMs: null,
            afterNodeMs: null,
            view: null,
          },
        });
        rows.set(actorIndex, row);
      });
      return passive((event: PromptWaitObservation) => {
        if (!accepting || row?.failedWait !== null) return;
        if (
          !['COUNTER', 'MODE_TEXT'].includes(event.wait) ||
          !['ENTERED', 'RETURNED', 'FAILED'].includes(event.state)
        )
          throw Error();
        row[event.wait === 'COUNTER' ? 'counter' : 'modeText'] = event.state;
        if (event.state !== 'FAILED') return;
        row.browser = owned.get(page)?.latest ?? row.browser;
        row.failedWait = event.wait;
        row.ui.collection = 'UNAVAILABLE';
        const lease = owned.get(page);
        if (!valid(page) || lease?.actor.actorIndex !== actorIndex) return;
        const navigation = lease.navigation,
          before = now(),
          target = row;
        target.ui.beforeNodeMs = before;
        const task = page.evaluate(readCapacityLiveQuestionUi).then(
          passive((value) => {
            const after = now();
            if (
              !valid(page) ||
              lease.navigation !== navigation ||
              !Number.isFinite(before) ||
              after < before
            )
              return;
            const view = data(value);
            view.counter = data(view.counter);
            if (view.reconcile !== undefined)
              view.reconcile = captureTrace(view.reconcile, types.isProxy);
            target.ui = {
              collection: 'OBSERVED',
              beforeNodeMs: before,
              afterNodeMs: after,
              view: uiView.parse(view),
            };
          }),
        );
        track(task);
      });
    },
    handoff: passive((write: () => Promise<void>) => {
      if (writer) throw Error();
      writer = write;
    }),
    stopAccepting: () => {
      accepting = false;
      for (const [page, lease] of owned) {
        safe(lease.detach);
        leases.delete(page);
      }
      owned.clear();
    },
    pending: () => pending.size,
    finish: () =>
      (finishing ??= (async () => {
        while (pending.size) await Promise.allSettled([...pending]);
        closed = !accepting && pending.size === 0;
        try {
          await writer?.();
        } catch {
          unavailable = true;
        }
        writer = undefined;
      })()),
    snapshot: () => {
      try {
        const value = capacityLiveQuestionObservationSchema.parse({
          schemaVersion: 1,
          authority: 'NON_AUTHORITY',
          collection:
            unavailable ||
            overflow ||
            [...rows.values()].some((r) => r.ui.collection === 'UNAVAILABLE')
              ? 'UNAVAILABLE'
              : rows.size
                ? 'OBSERVED'
                : 'UNOBSERVED',
          closed,
          pending: pending.size,
          overflow,
          rows: [...rows.values()],
        });
        if (
          value.rows.some((r) => Buffer.byteLength(JSON.stringify(r)) > 2048) ||
          Buffer.byteLength(JSON.stringify(value)) > 128 * 1024
        )
          throw Error();
        return value;
      } catch {
        return {
          schemaVersion: 1 as const,
          authority: 'NON_AUTHORITY' as const,
          collection: 'UNAVAILABLE' as const,
          closed,
          pending: pending.size,
          overflow: true,
          rows: [],
        };
      }
    },
  });
};
export type CapacityLiveQuestionObservation = ReturnType<
  typeof createCapacityLiveQuestionObservation
>;
