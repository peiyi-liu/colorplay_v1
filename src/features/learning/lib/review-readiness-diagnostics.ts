import { z } from 'zod';

export const REVIEW_READINESS_SLOT = '__colorplayReviewReadinessV1';
const queryError = z.enum([
  'NONE',
  'AUTH_REQUIRED',
  'PERMISSION_DENIED',
  'RATE_LIMITED',
  'INVALID_INPUT',
  'NOT_FOUND',
  'CHAPTER_LOCKED',
  'INVALID_RESPONSE',
  'UNAVAILABLE',
  'PROFILE_AUTHORIZATION',
  'PROFILE_RATE_LIMITED',
  'PROFILE_INVALID_RESPONSE',
  'PROFILE_UNAVAILABLE',
  'UNKNOWN',
]);
const querySchema = z.strictObject({
  status: z.enum(['pending', 'error', 'success', 'UNKNOWN']),
  fetchStatus: z.enum(['fetching', 'paused', 'idle', 'UNKNOWN']),
  pending: z.union([z.boolean(), z.literal('UNOBSERVED')]),
  error: queryError,
});
export const reviewReadinessSchema = z.strictObject({
  version: z.literal(1),
  epoch: z.number().int().min(0).max(1000000),
  route: z.enum(['CHAPTER', 'APP', 'LOGIN', 'REGISTER', 'OTHER']),
  shell: z
    .strictObject({
      auth: z.enum(['loading', 'authenticated', 'anonymous', 'UNKNOWN']),
      profile: querySchema,
      matched: z.boolean(),
      completed: z.boolean(),
      role: z.enum(['student', 'teacher', 'admin', 'public']),
    })
    .nullable(),
  chapter: z
    .strictObject({
      epoch: z.number().int().min(0).max(1000000),
      queries: z.tuple([querySchema, querySchema, querySchema, querySchema]),
      view: z.enum([
        'loading',
        'locked',
        'content-preparing',
        'content-readiness-error',
        'error',
        'in-progress',
        'completed',
      ]),
      reader: z.boolean(),
    })
    .nullable(),
});
type Snapshot = z.infer<typeof reviewReadinessSchema>;
const paths = new WeakMap<object, string>();
const descriptorValue = (value: object, key: string): unknown => {
  const d = Object.getOwnPropertyDescriptor(value, key);
  return d && 'value' in d ? d.value : undefined;
};
const slot = (): { json: string } | undefined => {
  try {
    const d = Object.getOwnPropertyDescriptor(
      globalThis,
      REVIEW_READINESS_SLOT,
    );
    if (!d || !('value' in d) || d.configurable || d.writable) return;
    const value: unknown = d.value;
    if (!value || typeof value !== 'object') return;
    if (descriptorValue(value, 'version') !== 1) return;
    if (typeof descriptorValue(value, 'json') !== 'string') return;
    return value as { json: string };
  } catch {
    return;
  }
};
export const reviewReadinessEnabled = () => slot() !== undefined;
// Serialized by Playwright before the first navigation; definitions/data only.
export function installReviewReadinessSlot() {
  if (
    Object.getOwnPropertyDescriptor(globalThis, '__colorplayReviewReadinessV1')
  )
    return;
  Object.defineProperty(globalThis, '__colorplayReviewReadinessV1', {
    configurable: false,
    writable: false,
    value: {
      version: 1,
      json: JSON.stringify({
        version: 1,
        epoch: 0,
        route: 'OTHER',
        shell: null,
        chapter: null,
      }),
    },
  });
}
const route = (pathname: string): Snapshot['route'] =>
  /^\/app\/chapters\/[0-9a-f-]{36}$/u.test(pathname)
    ? 'CHAPTER'
    : pathname === '/app'
      ? 'APP'
      : pathname === '/login'
        ? 'LOGIN'
        : pathname === '/register'
          ? 'REGISTER'
          : 'OTHER';
export const reviewQueryState = (query: {
  status?: string;
  fetchStatus?: string;
  isPending: boolean;
  error: unknown;
}): z.infer<typeof querySchema> => {
  try {
    const error =
      query.error && typeof query.error === 'object'
        ? descriptorValue(query.error, 'code')
        : undefined;
    const code = queryError.safeParse(error);
    return {
      status: ['pending', 'error', 'success'].includes(query.status ?? '')
        ? (query.status as 'pending' | 'error' | 'success')
        : 'UNKNOWN',
      fetchStatus: ['fetching', 'paused', 'idle'].includes(
        query.fetchStatus ?? '',
      )
        ? (query.fetchStatus as 'fetching' | 'paused' | 'idle')
        : 'UNKNOWN',
      pending: query.isPending,
      error:
        query.error === null
          ? 'NONE'
          : code.success && code.data !== 'NONE'
            ? code.data
            : 'UNKNOWN',
    };
  } catch {
    return {
      status: 'UNKNOWN',
      fetchStatus: 'UNKNOWN',
      pending: 'UNOBSERVED',
      error: 'UNKNOWN',
    };
  }
};
const update = (apply: (state: Snapshot) => void) => {
  const target = slot();
  if (!target) return;
  try {
    const state = reviewReadinessSchema.parse(JSON.parse(target.json));
    const pathname = window.location.pathname;
    if (paths.get(target) !== pathname) {
      state.epoch = Math.min(1000000, state.epoch + 1);
      state.route = route(pathname);
      state.chapter = null;
      paths.set(target, pathname);
    }
    apply(state);
    const json = JSON.stringify(reviewReadinessSchema.parse(state));
    if (new TextEncoder().encode(json).length <= 2048) target.json = json;
  } catch {
    /* Diagnostics never affect rendering. */
  }
};
export const tapReviewShell = (shell: NonNullable<Snapshot['shell']>) => {
  update((state) => {
    state.shell = shell;
  });
};
export const tapReviewChapter = (
  chapter: Omit<NonNullable<Snapshot['chapter']>, 'epoch' | 'reader'>,
) => {
  update((state) => {
    if (state.route !== 'CHAPTER') return;
    state.chapter = {
      ...chapter,
      epoch: state.epoch,
      reader: state.chapter?.reader ?? false,
    };
  });
};
export const tapReviewReader = (reader: boolean) => {
  update((state) => {
    if (state.chapter?.epoch === state.epoch) state.chapter.reader = reader;
  });
};

// Exactly one failure-only read. No API, body, arbitrary text, or page-clock values.
export function readReviewReadinessView(sectionKey: string) {
  const pathname = location.pathname;
  const currentRoute = /^\/app\/chapters\/[0-9a-f-]{36}$/u.test(pathname)
    ? 'CHAPTER'
    : pathname === '/app'
      ? 'APP'
      : pathname === '/login'
        ? 'LOGIN'
        : pathname === '/register'
          ? 'REGISTER'
          : 'OTHER';
  const dom = {
    visible(element: Element | null) {
      if (!element) return false;
      const style = getComputedStyle(element);
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        element.getClientRects().length > 0
      );
    },
  };
  const nav = document.querySelectorAll('nav[aria-label="第三章小節"]');
  const buttons = Array.from(nav).flatMap((n) =>
    Array.from(n.querySelectorAll('button')),
  );
  const targets = buttons.filter((button) =>
    new RegExp(`^${sectionKey}\\s`, 'u').test(
      button.getAttribute('aria-label') ?? button.textContent ?? '',
    ),
  );
  let data: unknown = null;
  try {
    const d = Object.getOwnPropertyDescriptor(
      globalThis,
      '__colorplayReviewReadinessV1',
    );
    if (d && 'value' in d && !d.writable && !d.configurable) {
      const json = Object.getOwnPropertyDescriptor(d.value, 'json');
      if (
        json &&
        'value' in json &&
        typeof json.value === 'string' &&
        new TextEncoder().encode(json.value).length <= 2048
      )
        data = JSON.parse(json.value);
    }
  } catch {
    /* Unavailable opt-in remains explicit. */
  }
  return {
    route: currentRoute,
    slot: data,
    navCount: Math.min(65535, nav.length),
    targetCount: Math.min(65535, targets.length),
    targetVisible: targets.some((element) => dom.visible(element)),
    loading:
      dom.visible(
        document.querySelector('[aria-label="頁面載入中"][role="status"]'),
      ) ||
      Array.from(
        document.querySelectorAll('p[role="status"][aria-live="polite"]'),
      ).some(
        (element) =>
          element.textContent === '章節資料載入中…' && dom.visible(element),
      ),
    error: dom.visible(
      document.querySelector('.chapter-detail-state--error, [role="alert"]'),
    ),
    locked: dom.visible(
      document.querySelector('.chapter-detail-state--locked'),
    ),
    preparing: dom.visible(
      document.querySelector(
        '.chapter-detail-state--preparing, .chapter-detail-state--readiness-error',
      ),
    ),
    reader: dom.visible(document.querySelector('.chapter-review-reader')),
  };
}

const integer = z.number().int().min(0).max(65535);
const routeSchema = z.enum(['CHAPTER', 'APP', 'LOGIN', 'REGISTER', 'OTHER']);
export const reviewReadinessViewSchema = z.strictObject({
  route: routeSchema,
  slot: reviewReadinessSchema.nullable(),
  slotCollection: z
    .enum(['OBSERVED', 'UNOBSERVED', 'UNAVAILABLE'])
    .default('UNOBSERVED'),
  navCount: integer,
  targetCount: integer,
  targetVisible: z.boolean(),
  loading: z.boolean(),
  error: z.boolean(),
  locked: z.boolean(),
  preparing: z.boolean(),
  reader: z.boolean(),
});

const transportCount = z.strictObject({
  started: integer,
  http2xx: integer,
  http4xx: integer,
  http5xx: integer,
  other: integer,
  failed: integer,
  finished: integer,
  pending: integer,
});
const transport = z.strictObject({
  MAP: transportCount,
  REVIEW: transportCount,
  PROGRESS: transportCount,
  COMPLETIONS: transportCount,
  AUTH: transportCount,
  PROFILE: transportCount,
  APP: transportCount,
});
const stamp = z.number().nonnegative();
const event = z.strictObject({
  sequence: integer,
  actorIndex: z.number().int().min(1).max(59),
  family: z.enum([
    'MAP',
    'REVIEW',
    'PROGRESS',
    'COMPLETIONS',
    'AUTH',
    'PROFILE',
    'APP',
  ]),
  kind: z.enum(['REQUEST', 'RESPONSE', 'FAILED']),
  atNodeMs: stamp,
});
export const capacityReviewReadinessSchema = z.strictObject({
  schemaVersion: z.literal(1),
  authority: z.literal('NON_AUTHORITY'),
  clock: z.literal('NODE_MONOTONIC'),
  collection: z.enum(['OBSERVED', 'UNOBSERVED', 'UNAVAILABLE', 'PARTIAL']),
  closed: z.boolean(),
  drained: z.boolean(),
  pendingAtSeal: z.number().int().min(0).max(1),
  overflow: z.boolean(),
  failure: z
    .strictObject({
      actorIndex: z.number().int().min(1).max(59),
      sequence: integer,
      atNodeMs: stamp,
      sectionOrdinal: integer.nullable(),
      matcher: z.strictObject({
        collection: z.literal('UNOBSERVED'),
        actual: z.null(),
        expected: z.null(),
      }),
      httpAtFailure: transport,
      reviewStartedAtNodeMs: stamp.nullable(),
    })
    .nullable(),
  ui: z.strictObject({
    collection: z.enum(['UNOBSERVED', 'OBSERVED', 'UNAVAILABLE']),
    beforeNodeMs: stamp.nullable(),
    afterNodeMs: stamp.nullable(),
    view: reviewReadinessViewSchema.nullable(),
  }),
  actors: z
    .array(
      z.strictObject({
        actorIndex: z.number().int().min(1).max(59),
        http: transport,
        jsErrors: integer,
      }),
    )
    .max(59),
  head: z.array(event).max(4),
  tail: z.array(event).max(4),
});

export const reviewTransportCounts = () => ({
  started: 0,
  http2xx: 0,
  http4xx: 0,
  http5xx: 0,
  other: 0,
  failed: 0,
  finished: 0,
  pending: 0,
});
