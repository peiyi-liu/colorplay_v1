import { performance } from 'node:perf_hooks';
import { types } from 'node:util';

export const reviewPhases = [
  'PRELOOKUP',
  'INTENT_WRITE',
  'REVIEW',
  'LOOKUP',
  'SECTIONS',
  'CARDS',
  'GOTO',
  'MANIFEST',
  'WALK',
  'REVIEW_PROGRESS',
  'CARD_VERSIONS',
  'LEARNING_PROGRESS',
  'CHAPTER_PROGRESS',
  'CONFIRMED_WRITE',
  'BEFORE_RESELECT',
  'SECTION_KEY',
  'SECTION_COUNT',
  'SECTION_SELECT',
  'SECTION_SELECTED',
  'CHOICES_READY',
  'CHOICES_COUNT',
  'PAGE_READY',
  'PAGE_NEXT',
  'CHOICE_READY',
  'CHOICE_SELECT',
  'ENTER',
  'ARTICLE',
  'VISITOR',
  'COMPLETION_STATUS',
  'COMPLETION_CLICK',
  'COMPLETION_CONFIRMED',
  'BACK',
] as const;
export type ReviewPhase = (typeof reviewPhases)[number];
type ReviewState = 'ENTERED' | 'RETURNED' | 'FAILED';
type ReviewError =
  'NONE' | 'TYPE_ERROR' | 'RANGE_ERROR' | 'ERROR' | 'NON_ERROR' | 'UNKNOWN';
export interface ReviewContext {
  sectionOrdinal?: number;
  cardOrdinal?: number;
  pageOrdinal?: number;
  count?: number;
  matched?: boolean;
}
export interface ReviewObservation extends ReviewContext {
  phase: ReviewPhase;
  state: ReviewState;
  errorClass?: ReviewError;
  matcher?: { collection: 'UNOBSERVED'; actual: null; expected: null };
}
export type ReviewObserver = (event: ReviewObservation) => void;
const errorClass = (error: unknown): ReviewError => {
  try {
    if (types.isProxy(error)) return 'UNKNOWN';
    return error instanceof TypeError
      ? 'TYPE_ERROR'
      : error instanceof RangeError
        ? 'RANGE_ERROR'
        : error instanceof Error
          ? 'ERROR'
          : 'NON_ERROR';
  } catch {
    return 'UNKNOWN';
  }
};
export const createReviewTrace = (
  observe?: ReviewObserver,
  context: ReviewContext = {},
) => {
  let phase: ReviewPhase | undefined;
  let current = context;
  const emit = (
    state: ReviewState,
    detail: ReviewContext = {},
    error?: unknown,
  ) => {
    if (!phase) return;
    try {
      observe?.({
        ...current,
        ...detail,
        phase,
        state,
        errorClass: state === 'FAILED' ? errorClass(error) : 'NONE',
        ...(state === 'FAILED' && phase === 'SECTION_COUNT'
          ? {
              matcher: {
                collection: 'UNOBSERVED' as const,
                actual: null,
                expected: null,
              },
            }
          : {}),
      });
    } catch {
      /* Passive observer cannot change the original operation. */
    }
  };
  return {
    enter: (next: ReviewPhase, detail: ReviewContext = {}) => {
      phase = next;
      current = { ...context, ...detail };
      emit('ENTERED');
    },
    returned: (detail: ReviewContext = {}) => {
      emit('RETURNED', detail);
      phase = undefined;
    },
    failed: (error: unknown) => {
      emit('FAILED', {}, error);
      phase = undefined;
    },
  };
};
interface Row extends ReviewObservation {
  actorIndex: number;
  sequence: number;
  atNodeMs: number;
}
const object = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== 'object' || types.isProxy(value)) return;
  const proto: unknown = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return;
  if (Reflect.ownKeys(value).some((key) => typeof key !== 'string')) return;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.values(descriptors).some((d) => !('value' in d))) return;
  return Object.fromEntries(
    Object.entries(descriptors).map(([k, d]) => [k, d.value]),
  );
};
const states = ['ENTERED', 'RETURNED', 'FAILED'];
const errors = [
  'NONE',
  'TYPE_ERROR',
  'RANGE_ERROR',
  'ERROR',
  'NON_ERROR',
  'UNKNOWN',
];
const numericKeys = [
  'sectionOrdinal',
  'cardOrdinal',
  'pageOrdinal',
  'count',
] as const;
const safe = (value: unknown): ReviewObservation | undefined => {
  const data = object(value);
  if (
    !data ||
    Object.keys(data).some(
      (k) =>
        ![
          'phase',
          'state',
          'errorClass',
          'matched',
          'matcher',
          ...numericKeys,
        ].includes(k),
    )
  )
    return;
  if (
    !reviewPhases.includes(data.phase as ReviewPhase) ||
    !states.includes(data.state as string) ||
    !errors.includes((data.errorClass ?? 'NONE') as string)
  )
    return;
  if (
    numericKeys.some(
      (k) =>
        data[k] !== undefined &&
        (!Number.isSafeInteger(data[k]) ||
          (data[k] as number) < 0 ||
          (data[k] as number) > 65535),
    )
  )
    return;
  if (data.matched !== undefined && typeof data.matched !== 'boolean') return;
  if (data.matcher !== undefined) {
    const m = object(data.matcher);
    if (
      !m ||
      Object.keys(m).length !== 3 ||
      m.collection !== 'UNOBSERVED' ||
      m.actual !== null ||
      m.expected !== null
    )
      return;
    data.matcher = { collection: 'UNOBSERVED', actual: null, expected: null };
  }
  return data as unknown as ReviewObservation;
};
export const createStudentReviewDiagnostics = (actorIndex: number) => {
  if (!Number.isSafeInteger(actorIndex) || actorIndex < 1 || actorIndex > 59)
    throw Error('REVIEW_ACTOR_INVALID');
  let sealed: ReturnType<typeof snapshot> | undefined;
  let sequence = 0,
    dropped = 0,
    malformed = 0;
  let firstFailure: Row | null = null,
    lastProgress: Row | null = null;
  const head: Row[] = [],
    tail: Row[] = [];
  const counters = reviewPhases.map((phase) => ({
    phase,
    entered: 0,
    returned: 0,
    failed: 0,
  }));
  const observe: ReviewObserver = (input) => {
    if (sealed) return;
    try {
      const event = safe(input);
      if (!event) {
        malformed++;
        return;
      }
      const row = {
        ...event,
        errorClass: event.errorClass ?? 'NONE',
        actorIndex,
        sequence: ++sequence,
        atNodeMs: performance.now(),
      };
      firstFailure ??= event.state === 'FAILED' ? row : null;
      lastProgress = row;
      if (sequence > 8192) {
        dropped++;
        return;
      }
      const counter = counters.find((c) => c.phase === event.phase);
      if (counter)
        counter[
          event.state === 'ENTERED'
            ? 'entered'
            : event.state === 'RETURNED'
              ? 'returned'
              : 'failed'
        ]++;
      if (head.length < 4) head.push(row);
      else {
        tail.push(row);
        if (tail.length > 4) tail.shift();
      }
    } catch {
      malformed++;
    }
  };
  const snapshot = () => ({
    schemaVersion: 1,
    authority: 'NON_AUTHORITY' as const,
    collection: malformed
      ? ('UNAVAILABLE' as const)
      : dropped
        ? ('PARTIAL' as const)
        : sequence
          ? ('OBSERVED' as const)
          : ('UNOBSERVED' as const),
    clock: 'NODE_MONOTONIC' as const,
    actorIndex,
    sealed: true,
    ui: 'UNOBSERVED' as const,
    http: 'UNOBSERVED' as const,
    admitted: Math.min(sequence, 8192),
    dropped,
    malformed,
    firstFailure,
    lastProgress,
    counters,
    head,
    tail,
  });
  return {
    observe,
    seal: () => {
      sealed ??= structuredClone(snapshot());
      return structuredClone(sealed);
    },
  };
};
