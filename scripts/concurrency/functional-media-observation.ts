import { performance } from 'node:perf_hooks';
import { z } from 'zod';
import type { FunctionalScope } from './config';
import type { FunctionalStage } from './functional-receipt';
import { functionalRequestContext } from './functional-network-event';
import {
  emptyMediaTransport,
  mediaTransportSchema,
  registerMediaTransport,
  observeMediaCdp,
  finishMediaCdp,
  mediaTransportAvailable,
} from './functional-media-transport-observation';
const time = z.number().nonnegative();
export const mediaSteps = [
  'authorization',
  'content_lookup',
  'owned_plan',
  'editor',
  'single',
  'single_recovery',
  'single_cancel',
  'single_duplicate',
  'leave_editor',
  'zip_recovery',
  'zip_cancel',
  'readback',
] as const;
const intentKind = z.enum(['ROOT_GOTO_ADMIN_CONTENT', 'ROOT_EDITOR_TO_IMPORT']);
const intentSchema = z.strictObject({
  ordinal: z.number().int().positive().max(2000),
  kind: intentKind,
  issuedAtNodeMs: time,
  invocationAtNodeMs: time,
  settledAtNodeMs: time.nullable(),
  state: z.enum(['INVOKED', 'COMPLETED', 'FAILED']),
});
export const functionalMediaContextSchema = z.strictObject({
  transport: mediaTransportSchema,
  method: z.enum(['GET', 'POST', 'OPTIONS', 'OTHER', 'UNKNOWN']),
  actor: z.enum(['A1', 'S1', 'S2', 'T1', 'T2', 'R1', 'OTHER', 'UNKNOWN']),
  functionFamily: z.enum([
    'MEDIA',
    'CONTENT_IMPORT',
    'OTHER_FUNCTION',
    'UNKNOWN',
  ]),
  action: z.enum([
    'MEDIA_BEGIN',
    'MEDIA_PROCESS',
    'MEDIA_ABORT',
    'MEDIA_RESOLVE',
    'IMPORT_BEGIN',
    'IMPORT_PREVIEW',
    'IMPORT_COMMIT',
    'UNKNOWN',
  ]),
  mediaStep: z.enum(mediaSteps).nullable(),
  documentOrdinal: z.number().int().positive().max(2000).nullable(),
  requestIntent: intentSchema.nullable(),
  failureIntent: intentSchema.nullable(),
  requestAtNodeMs: time.nullable(),
  responseAtNodeMs: time.nullable(),
  terminalAtNodeMs: time.nullable(),
  lifecycle: z.enum([
    'UNOBSERVED',
    'REQUESTED',
    'RESPONDED',
    'FINISHED',
    'FAILED',
    'UNKNOWN',
  ]),
  canceled: z.boolean().nullable(),
  cancelSource: z.literal('UNOBSERVED'),
  appBodyEof: z.literal('UNOBSERVED'),
});
export type FunctionalMediaContext = z.infer<
  typeof functionalMediaContextSchema
>;
export interface FunctionalMediaPort {
  step(next: (typeof mediaSteps)[number]): void;
  view<T>(action: () => Promise<T>, signal?: AbortSignal): Promise<T>;
}
type Intent = z.infer<typeof intentSchema>;
const navigation = new WeakMap<
  object,
  {
    active(): boolean;
    run<T>(
      kind: Intent['kind'],
      action: () => Promise<T>,
      signal?: AbortSignal,
    ): Promise<T>;
  }
>();
export const runFunctionalMediaNavigation = <T>(
  page: object,
  url: unknown,
  action: () => Promise<T>,
  signal?: AbortSignal,
) => {
  const port = navigation.get(page);
  return url === '/admin/content' && port?.active()
    ? port.run('ROOT_GOTO_ADMIN_CONTENT', action, signal)
    : action();
};
export const emptyFunctionalMediaContext = (): FunctionalMediaContext => ({
  transport: emptyMediaTransport(),
  method: 'UNKNOWN',
  actor: 'UNKNOWN',
  functionFamily: 'UNKNOWN',
  action: 'UNKNOWN',
  mediaStep: null,
  documentOrdinal: null,
  requestIntent: null,
  failureIntent: null,
  requestAtNodeMs: null,
  responseAtNodeMs: null,
  terminalAtNodeMs: null,
  lifecycle: 'UNOBSERVED',
  canceled: null,
  cancelSource: 'UNOBSERVED',
  appBodyEof: 'UNOBSERVED',
});
export const createFunctionalMediaObservation = (
  scope: FunctionalScope,
  phase: () => FunctionalStage | null,
) => {
  interface State {
    actor: () => string | null;
    step: FunctionalMediaContext['mediaStep'];
    intent: Intent | null;
    intentOrdinal: number;
    document: string | null;
    documentOrdinal: number;
    requests: Map<string, FunctionalMediaContext>;
  }
  const pages = new WeakMap<object, State>();
  const transportPages = new Set<object>();
  let bad = false,
    sealed = false,
    activeRequests = 0,
    registeredPages = 0;
  const touch = () => {
    if (sealed) bad = true;
    return !sealed;
  };
  const reject = (): never => {
    bad = true;
    throw new Error('FUNCTIONAL_BROWSER_FAILED');
  };
  const actor = (state: State): FunctionalMediaContext['actor'] => {
    const value = state.actor();
    return value === null
      ? 'UNKNOWN'
      : ['A1', 'S1', 'S2', 'T1', 'T2', 'R1'].includes(value)
        ? (value as FunctionalMediaContext['actor'])
        : 'OTHER';
  };
  const current = (state: State) =>
    phase() === 'media' && actor(state) === 'A1';
  const clock = () => time.parse(performance.now());
  const copy = (intent: Intent | null) => (intent ? { ...intent } : null);
  const entry = (page: object, id: string) => pages.get(page)?.requests.get(id);
  const run = async <T>(
    state: State,
    kind: Intent['kind'],
    action: () => Promise<T>,
    signal?: AbortSignal,
  ) => {
    if (
      !touch() ||
      !current(state) ||
      signal?.aborted ||
      state.intent?.state === 'INVOKED' ||
      state.intentOrdinal >= 2000
    )
      return reject();
    const intent: Intent = {
      ordinal: ++state.intentOrdinal,
      kind,
      issuedAtNodeMs: clock(),
      invocationAtNodeMs: clock(),
      settledAtNodeMs: null,
      state: 'INVOKED',
    };
    state.intent = intent;
    try {
      const value = await action();
      if (!touch() || !current(state) || signal?.aborted) return reject();
      intent.state = 'COMPLETED';
      intent.settledAtNodeMs = clock();
      return value;
    } catch (error) {
      if (touch()) {
        intent.state = 'FAILED';
        intent.settledAtNodeMs = clock();
      }
      throw error;
    }
  };
  return {
    available: () => !bad && [...transportPages].every(mediaTransportAvailable),
    seal: () => {
      sealed = true;
    },
    register: (
      page: object,
      actorGetter: () => string | null,
      context?: object,
    ) => {
      if (!touch() || pages.has(page) || registeredPages >= 2000) {
        bad = true;
        return;
      }
      const state: State = {
        actor: actorGetter,
        step: null,
        intent: null,
        intentOrdinal: 0,
        document: null,
        documentOrdinal: 0,
        requests: new Map(),
      };
      pages.set(page, state);
      transportPages.add(page);
      registerMediaTransport(
        context,
        page,
        () => current(state),
        () => !sealed,
        () => {
          bad = true;
        },
      );
      registeredPages++;
      navigation.set(page, {
        active: () => current(state),
        run: (kind, action, signal) => run(state, kind, action, signal),
      });
    },
    port: (page: object): FunctionalMediaPort => ({
      step: (next) => {
        const state = pages.get(page);
        if (!touch() || !state || !current(state)) return reject();
        const parsed = z.enum(mediaSteps).safeParse(next);
        if (!parsed.success) return reject();
        state.step = parsed.data;
      },
      view: (action, signal) => {
        const state = pages.get(page);
        if (!state) return reject();
        return run(state, 'ROOT_EDITOR_TO_IMPORT', action, signal);
      },
    }),
    document: (page: object, raw: unknown) => {
      if (!touch()) return;
      const state = pages.get(page);
      try {
        const { frame } = z
          .object({
            frame: z.object({
              parentId: z.string().optional(),
              url: z.string().max(32768),
            }),
          })
          .parse(raw);
        if (!state || frame.parentId !== undefined) return;
        if (state.documentOrdinal >= 2000) {
          bad = true;
          state.document = null;
          return;
        }
        const url = new URL(frame.url);
        state.document =
          url.origin === new URL(scope.appUrl).origin &&
          !url.search &&
          !url.hash
            ? frame.url
            : null;
        state.documentOrdinal++;
      } catch {
        bad = true;
      }
    },
    request: (
      page: object,
      id: string,
      raw: unknown,
    ): FunctionalMediaContext => {
      const empty = emptyFunctionalMediaContext();
      if (!touch()) return empty;
      const state = pages.get(page);
      try {
        if (
          !state ||
          !id ||
          id.length > 180 ||
          state.requests.has(id) ||
          activeRequests >= 2000
        ) {
          bad = true;
          return { ...empty, lifecycle: 'UNKNOWN' };
        }
        const event = z
          .object({
            request: z.unknown(),
            documentURL: z.string().optional(),
            type: z.string().optional(),
          })
          .parse(raw);
        const { valid, ...request } = functionalRequestContext(
          new URL(scope.supabaseUrl).origin,
          event.request,
        );
        if (!valid) bad = true;
        const context = functionalMediaContextSchema.parse({
          ...empty,
          ...request,
          actor: actor(state),
          mediaStep: state.step,
          documentOrdinal:
            event.type !== 'Document' &&
            state.document &&
            event.documentURL === state.document
              ? state.documentOrdinal
              : null,
          requestIntent: copy(state.intent),
          requestAtNodeMs: clock(),
          lifecycle: valid ? 'REQUESTED' : 'UNKNOWN',
        });
        context.transport = observeMediaCdp(page, id, raw);
        state.requests.set(id, context);
        activeRequests++;
        return context;
      } catch {
        bad = true;
        return { ...empty, lifecycle: 'UNKNOWN' };
      }
    },
    response: (page: object, id: string) => {
      if (!touch()) return;
      const row = entry(page, id);
      if (row?.lifecycle !== 'REQUESTED') {
        bad = true;
        if (row) row.lifecycle = 'UNKNOWN';
        return;
      }
      row.lifecycle = 'RESPONDED';
      row.responseAtNodeMs = clock();
    },
    failure: (page: object, id: string, raw: unknown) => {
      if (!touch()) return;
      const state = pages.get(page),
        row = entry(page, id);
      if (!row || !['REQUESTED', 'RESPONDED'].includes(row.lifecycle)) {
        bad = true;
        if (row) row.lifecycle = 'UNKNOWN';
        return;
      }
      finishMediaCdp(page, id);
      row.lifecycle = 'FAILED';
      row.terminalAtNodeMs = clock();
      row.failureIntent = copy(state?.intent ?? null);
      try {
        row.canceled =
          z.object({ canceled: z.boolean().optional() }).parse(raw).canceled ??
          null;
      } catch {
        bad = true;
      }
    },
    finished: (page: object, id: string) => {
      if (!touch()) return;
      const row = entry(page, id);
      if (row?.lifecycle !== 'RESPONDED') {
        bad = true;
        if (row) row.lifecycle = 'UNKNOWN';
        return;
      }
      finishMediaCdp(page, id);
      row.lifecycle = 'FINISHED';
      row.terminalAtNodeMs = clock();
    },
    forget: (page: object, id: string) => {
      if (!touch()) return;
      if (pages.get(page)?.requests.delete(id)) activeRequests--;
    },
  };
};
