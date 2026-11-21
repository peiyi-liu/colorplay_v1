import { performance } from 'node:perf_hooks';
import { types } from 'node:util';
import type { Frame, Page, Request, Response } from '@playwright/test';
import {
  reviewReadinessViewSchema,
  reviewTransportCounts as counts,
  capacityReviewReadinessSchema,
  readReviewReadinessView,
} from '../../src/features/learning/lib/review-readiness-diagnostics';
export { readReviewReadinessView } from '../../src/features/learning/lib/review-readiness-diagnostics';
import { REVIEW_MANIFEST } from '../../tests/fixtures/review-manifest.generated';
import type { ReviewObservation } from './capacity-student-review-diagnostics';
import type { CapacityScope } from './capacity-scope';
import type { PrivateJournal } from './private-journal';

const dataOnly = (value: unknown, depth = 0): unknown => {
  if (depth > 12) throw Error('DATA_BOUND');
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string' && value.length <= 2048) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (!value || typeof value !== 'object' || types.isProxy(value))
    throw Error('DATA_ONLY');
  const array = Array.isArray(value);
  const proto: unknown = Object.getPrototypeOf(value);
  if (
    array
      ? proto !== Array.prototype
      : proto !== Object.prototype && proto !== null
  )
    throw Error('DATA_PROTOTYPE');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length > 32) throw Error('DATA_BOUND');
  const result: Record<string, unknown> = Object.create(null) as Record<
    string,
    unknown
  >;
  for (const key of keys) {
    if (typeof key !== 'string') throw Error('DATA_KEY');
    const d = descriptors[key];
    if (!d || !('value' in d)) throw Error('DATA_ACCESSOR');
    result[key] = dataOnly(d.value, depth + 1);
  }
  if (!array) return result;
  if (
    !Number.isSafeInteger(result.length) ||
    (result.length as number) > 8 ||
    keys.length !== (result.length as number) + 1
  )
    throw Error('DATA_ARRAY');
  return Array.from({ length: result.length as number }, (_, i) => {
    if (!Object.hasOwn(result, String(i))) throw Error('DATA_ARRAY');
    return result[String(i)];
  });
};
export const parseReviewReadinessView = (
  value: unknown,
  renderEpoch?: number,
) => {
  try {
    const parsed = reviewReadinessViewSchema.safeParse(dataOnly(value));
    if (
      !parsed.success ||
      Buffer.byteLength(JSON.stringify(parsed.data)) > 4096
    )
      return null;
    const { slot } = parsed.data;
    if (
      slot &&
      (slot.route !== parsed.data.route ||
        (slot.chapter && slot.chapter.epoch !== slot.epoch) ||
        (renderEpoch !== undefined && slot.epoch !== renderEpoch))
    )
      return {
        ...parsed.data,
        slot: null,
        slotCollection: 'UNAVAILABLE' as const,
      };
    return {
      ...parsed.data,
      slotCollection:
        slot && (slot.shell || slot.chapter)
          ? ('OBSERVED' as const)
          : ('UNOBSERVED' as const),
    };
  } catch {
    return null;
  }
};
const families = [
  'MAP',
  'REVIEW',
  'PROGRESS',
  'COMPLETIONS',
  'AUTH',
  'PROFILE',
  'APP',
] as const;
type Family = (typeof families)[number];
export const createCapacityReviewReadinessObservation = (
  scope: Pick<CapacityScope, 'appUrl' | 'supabaseUrl'>,
  signal: AbortSignal,
) => {
  const actors = new Map<
    number,
    {
      page: Page;
      generation: number;
      renderEpoch: number;
      detach(): void;
      http: Record<Family, ReturnType<typeof counts>>;
      jsErrors: number;
      reviewStartedAtNodeMs: number | null;
    }
  >();
  const requests = new WeakMap<
    Request,
    { family: Family; state: ReturnType<typeof counts>; terminal: boolean }
  >();
  const tasks = new Set<Promise<void>>();
  let accepting = true,
    sealed = false,
    fault = false,
    overflow = false,
    written = false;
  let sequence = 0,
    requestsSeen = 0;
  const head: {
    sequence: number;
    actorIndex: number;
    family: Family;
    kind: 'REQUEST' | 'RESPONSE' | 'FAILED';
    atNodeMs: number;
  }[] = [];
  const tail: typeof head = [];
  let failure: {
    actorIndex: number;
    sequence: number;
    atNodeMs: number;
    sectionOrdinal: number | null;
    matcher: { collection: 'UNOBSERVED'; actual: null; expected: null };
    httpAtFailure: Record<Family, ReturnType<typeof counts>>;
    reviewStartedAtNodeMs: number | null;
  } | null = null;
  let ui: {
    collection: 'UNOBSERVED' | 'OBSERVED' | 'UNAVAILABLE';
    beforeNodeMs: number | null;
    afterNodeMs: number | null;
    view: ReturnType<typeof parseReviewReadinessView>;
  } = {
    collection: 'UNOBSERVED',
    beforeNodeMs: null,
    afterNodeMs: null,
    view: null,
  };
  let deadline = 0;
  let snapshot: ReturnType<typeof project> | undefined;
  const safe = (action: () => void) => {
    if (sealed) return;
    try {
      action();
    } catch {
      fault = true;
    }
  };
  const bump = (value: number) => {
    if (value >= 65535) overflow = true;
    return Math.min(65535, value + 1);
  };
  const emit = (
    actorIndex: number,
    family: Family,
    kind: (typeof head)[number]['kind'],
  ) => {
    const row = {
      sequence: ++sequence,
      actorIndex,
      family,
      kind,
      atNodeMs: performance.now(),
    };
    if (head.length < 4) head.push(row);
    tail.push(row);
    if (tail.length > 4) tail.shift();
  };
  const classify = (raw: string): Family | undefined => {
    if (raw.length > 8192) {
      overflow = true;
      return;
    }
    const url = new URL(raw);
    if (url.origin === scope.appUrl) return 'APP';
    if (url.origin !== scope.supabaseUrl) return;
    const fixed: Record<string, Family> = {
      '/rest/v1/rpc/get_student_chapter_map': 'MAP',
      '/rest/v1/rpc/get_accessible_chapter_review': 'REVIEW',
      '/rest/v1/rpc/get_learning_progress': 'PROGRESS',
      '/rest/v1/review_progress': 'COMPLETIONS',
      '/rest/v1/profiles': 'PROFILE',
    };
    return (
      fixed[url.pathname] ??
      (url.pathname.startsWith('/auth/v1/') ? 'AUTH' : undefined)
    );
  };
  const register = (actor: { actorIndex: number; page: Page }) => {
    safe(() => {
      if (
        !accepting ||
        actors.has(actor.actorIndex) ||
        !Number.isInteger(actor.actorIndex) ||
        actor.actorIndex < 1 ||
        actor.actorIndex > 59
      )
        return;
      const { page, actorIndex } = actor;
      const state = {
        page,
        generation: 0,
        renderEpoch: 0,
        detach: () => {
          /* installed below */
        },
        http: Object.fromEntries(families.map((f) => [f, counts()])) as Record<
          Family,
          ReturnType<typeof counts>
        >,
        jsErrors: 0,
        reviewStartedAtNodeMs: null as number | null,
      };
      const request = (req: Request) => {
        safe(() => {
          if (!accepting || requests.has(req)) return;
          const family = classify(req.url());
          if (!family) return;
          if (requestsSeen++ >= 8192) {
            overflow = true;
            return;
          }
          if (
            family === 'APP' &&
            req.isNavigationRequest() &&
            req.frame() === page.mainFrame()
          )
            state.renderEpoch = 0;
          const count = state.http[family];
          count.started = bump(count.started);
          count.pending = bump(count.pending);
          requests.set(req, { family, state: count, terminal: false });
          emit(actorIndex, family, 'REQUEST');
        });
      };
      const response = (res: Response) => {
        safe(() => {
          const entry = requests.get(res.request());
          if (!entry || entry.terminal) return;
          const status = res.status();
          const key =
            status >= 200 && status < 300
              ? 'http2xx'
              : status >= 400 && status < 500
                ? 'http4xx'
                : status >= 500 && status < 600
                  ? 'http5xx'
                  : 'other';
          entry.state[key] = bump(entry.state[key]);
          emit(actorIndex, entry.family, 'RESPONSE');
        });
      };
      const terminal = (req: Request, failed: boolean) => {
        safe(() => {
          const entry = requests.get(req);
          if (!entry || entry.terminal) return;
          entry.terminal = true;
          entry.state.pending--;
          const key = failed ? 'failed' : 'finished';
          entry.state[key] = bump(entry.state[key]);
          if (failed) emit(actorIndex, entry.family, 'FAILED');
        });
      };
      const finished = (req: Request) => {
        terminal(req, false);
      };
      const failed = (req: Request) => {
        terminal(req, true);
      };
      const js = () => {
        safe(() => {
          state.jsErrors = bump(state.jsErrors);
        });
      };
      const navigated = (frame?: Frame) => {
        safe(() => {
          if (frame && frame !== page.mainFrame()) return;
          state.generation++;
          state.renderEpoch++;
        });
      };
      page.on('request', request);
      page.on('response', response);
      page.on('requestfinished', finished);
      page.on('requestfailed', failed);
      page.on('pageerror', js);
      page.on('framenavigated', navigated);
      state.detach = () => {
        page.off('request', request);
        page.off('response', response);
        page.off('requestfinished', finished);
        page.off('requestfailed', failed);
        page.off('pageerror', js);
        page.off('framenavigated', navigated);
      };
      actors.set(actorIndex, state);
    });
  };
  const observe = (actorIndex: number, event: ReviewObservation) => {
    safe(() => {
      const observed = dataOnly(event) as ReviewObservation;
      const actor = actors.get(actorIndex);
      if (
        accepting &&
        actor &&
        observed.phase === 'GOTO' &&
        observed.state === 'ENTERED'
      )
        actor.reviewStartedAtNodeMs = performance.now();
      if (
        !accepting ||
        failure ||
        observed.phase !== 'SECTION_COUNT' ||
        observed.state !== 'FAILED' ||
        signal.aborted
      )
        return;
      if (!actor) return;
      if (
        observed.sectionOrdinal !== undefined &&
        (!Number.isSafeInteger(observed.sectionOrdinal) ||
          observed.sectionOrdinal < 0 ||
          observed.sectionOrdinal > 65535)
      ) {
        fault = true;
        return;
      }
      failure = {
        actorIndex,
        sequence: ++sequence,
        atNodeMs: performance.now(),
        sectionOrdinal: observed.sectionOrdinal ?? null,
        httpAtFailure: structuredClone(actor.http),
        reviewStartedAtNodeMs: actor.reviewStartedAtNodeMs,
        matcher: { collection: 'UNOBSERVED', actual: null, expected: null },
      };
      deadline = performance.now() + 200;
      ui = {
        collection: 'UNAVAILABLE',
        beforeNodeMs: performance.now(),
        afterNodeMs: null,
        view: null,
      };
      const target = REVIEW_MANIFEST.filter(
        (row) => row.chapterCode === 'chapter-3',
      )[observed.sectionOrdinal ?? -1];
      if (
        !target ||
        actor.page.isClosed() ||
        new URL(actor.page.url()).origin !== scope.appUrl
      )
        return;
      const generation = actor.generation,
        renderEpoch = actor.renderEpoch;
      let read: Promise<unknown>;
      try {
        read = actor.page.evaluate(readReviewReadinessView, target.sectionKey);
      } catch {
        return;
      }
      const task = read.then(
        (value) => {
          if (sealed) return;
          ui.afterNodeMs = performance.now();
          if (generation !== actor.generation) return;
          const view = parseReviewReadinessView(value, renderEpoch);
          if (view) {
            ui.collection = 'OBSERVED';
            ui.view = view;
          }
        },
        () => {
          if (!sealed) ui.afterNodeMs = performance.now();
        },
      );
      tasks.add(task);
      void task.then(
        () => tasks.delete(task),
        () => tasks.delete(task),
      );
    });
  };
  const stopAccepting = () => {
    accepting = false;
  };
  const beforeClose = async () => {
    accepting = false;
    const remaining = Math.max(0, deadline - performance.now());
    if (!tasks.size || !remaining) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.allSettled([...tasks]),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, remaining);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
  const project = (closed = false) => ({
    schemaVersion: 1,
    authority: 'NON_AUTHORITY',
    clock: 'NODE_MONOTONIC',
    collection: fault
      ? 'UNAVAILABLE'
      : overflow || !closed
        ? 'PARTIAL'
        : failure
          ? 'OBSERVED'
          : 'UNOBSERVED',
    closed,
    drained: tasks.size === 0,
    pendingAtSeal: tasks.size,
    overflow,
    failure,
    ui,
    actors: [...actors].map(([actorIndex, state]) => ({
      actorIndex,
      http: state.http,
      jsErrors: state.jsErrors,
    })),
    head,
    tail,
  });
  const finish = async (journal: PrivateJournal, closed: boolean) => {
    if (written) return;
    written = true;
    accepting = false;
    if (closed) while (tasks.size) await Promise.allSettled([...tasks]);
    for (const actor of actors.values()) {
      try {
        actor.detach();
      } catch {
        fault = true;
      }
    }
    snapshot = structuredClone(project(closed));
    if (
      !capacityReviewReadinessSchema.safeParse(snapshot).success ||
      Buffer.byteLength(JSON.stringify(snapshot)) > 128 * 1024
    ) {
      snapshot = {
        ...snapshot,
        collection: 'UNAVAILABLE',
        failure: null,
        ui: {
          collection: 'UNAVAILABLE',
          beforeNodeMs: null,
          afterNodeMs: null,
          view: null,
        },
        actors: [],
        head: [],
        tail: [],
      };
    }
    sealed = true;
    actors.clear();
    try {
      await journal.write('student-review-readiness', snapshot);
    } catch {
      /* Original writer/error owns outcome. */
    }
  };
  return {
    register,
    observe,
    pending: () => tasks.size,
    stopAccepting,
    beforeClose,
    finish,
    snapshot: () => (snapshot ? structuredClone(snapshot) : null),
  };
};
export type CapacityReviewReadinessObservation = ReturnType<
  typeof createCapacityReviewReadinessObservation
>;
