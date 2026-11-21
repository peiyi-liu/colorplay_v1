import { performance } from 'node:perf_hooks';
import { z } from 'zod';
import type { APIResponse, Request } from '@playwright/test';
import {
  mediaRequestSchema,
  mediaResponseFraming,
} from './media-http-contract';
import { sha256 } from './local-runtime';
const count = z.number().int().nonnegative().max(2_097_152);
const stageSchema = z.enum(['FETCH', 'PARSE', 'HOOK', 'FULFILL', 'DISPOSE']);
export const mediaTransportSchema = z.strictObject({
  collection: z.enum(['UNOBSERVED', 'OBSERVED', 'UNKNOWN']),
  routeOrdinal: z.number().int().positive().max(2000).nullable(),
  stages: z
    .array(
      z.strictObject({
        stage: stageSchema,
        state: z.enum(['STARTED', 'COMPLETED', 'FAILED', 'UNKNOWN']),
        atNodeMs: z.number().nonnegative(),
        errorName: z
          .enum([
            'Error',
            'TypeError',
            'RangeError',
            'AbortError',
            'TimeoutError',
            'OTHER',
          ])
          .nullable(),
      }),
    )
    .max(16),
  status: z.number().int().min(100).max(599).nullable(),
  contentType: z.enum(['JSON', 'OTHER', 'NONE', 'UNKNOWN']),
  encoding: z.enum([
    'NONE',
    'IDENTITY',
    'GZIP',
    'BR',
    'DEFLATE',
    'OTHER',
    'UNKNOWN',
  ]),
  wireLength: count.nullable(),
  rootBodyBytes: count.nullable(),
  schemaOutcome: z.enum(['UNOBSERVED', 'KNOWN', 'UNKNOWN']),
  lengthComparison: z.enum([
    'UNOBSERVED',
    'EQUAL',
    'DIFFERENT',
    'ENCODED_NOT_COMPARABLE',
    'UNKNOWN',
  ]),
  routeClosed: z.boolean(),
});
export type MediaTransport = z.infer<typeof mediaTransportSchema>;
export const emptyMediaTransport = (): MediaTransport => ({
  collection: 'UNOBSERVED',
  routeOrdinal: null,
  stages: [],
  status: null,
  contentType: 'UNKNOWN',
  encoding: 'NONE',
  wireLength: null,
  rootBodyBytes: null,
  schemaOutcome: 'UNOBSERVED',
  lengthComparison: 'UNOBSERVED',
  routeClosed: false,
});
const importSchema = z.discriminatedUnion('action', [
  z.strictObject({
    action: z.literal('begin'),
    requestId: z.uuid(),
    sourceBytes: z.number().int().positive().max(20_971_520),
    sourceFilename: z.string().min(1).max(180),
    sourceMimeType: z.enum([
      'application/zip',
      'application/x-zip-compressed',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ]),
  }),
  z.strictObject({
    action: z.literal('preview'),
    requestId: z.uuid(),
    runId: z.uuid(),
    mediaManifestMap: z
      .record(z.string().min(1).max(180), z.uuid())
      .refine((v) => Object.keys(v).length <= 64),
  }),
  z.strictObject({
    action: z.literal('commit'),
    requestId: z.uuid(),
    runId: z.uuid(),
    confirmWarnings: z.boolean(),
  }),
]);
const resolveSchema = z.strictObject({
  action: z.literal('resolve'),
  assetIds: z.array(z.uuid()).min(1).max(6),
});
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return JSON.stringify(value.map(canonical));
  if (value && typeof value === 'object')
    return JSON.stringify(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return JSON.stringify(value);
};
const contexts = new WeakMap<object, string>();
interface Attempt {
  value: MediaTransport;
  copies: MediaTransport[];
  cdp: string | null;
  route: boolean;
  terminal: boolean;
  retired: boolean;
}
interface Owner {
  api: string;
  active(): boolean;
  open(): boolean;
  bad(): void;
  slots: Map<string, Attempt>;
  ids: Map<string, Attempt>;
  seen: Set<string>;
  ordinal: number;
  invalid: boolean;
}
const owners = new WeakMap<object, Owner>();
export const enableMediaTransport = (context: object, api: string) => {
  contexts.set(context, api);
};
const poison = (owner: Owner, attempt?: Attempt) => {
  owner.invalid = true;
  try {
    owner.bad();
  } catch {
    /* Observation cannot mask an operation. */
  }
  if (attempt) {
    attempt.value.collection = 'UNKNOWN';
    sync(attempt);
  }
};
const sync = (attempt: Attempt) => {
  for (const copy of attempt.copies) Object.assign(copy, attempt.value);
};
const check = (owner: Owner, attempt?: Attempt) => {
  let valid = false;
  try {
    valid = owner.open() && owner.active() && !attempt?.retired;
  } catch {
    /* Unknown lifecycle. */
  }
  if (!valid) {
    poison(owner, attempt);
    return false;
  }
  return true;
};
const identity = (owner: Owner, raw: unknown) => {
  const parsed = z
    .object({
      url: z.string().max(32768),
      method: z.string(),
    })
    .parse(raw);
  const url = new URL(parsed.url);
  if (
    url.origin !== owner.api ||
    !['/functions/v1/content-media', '/functions/v1/content-import'].includes(
      url.pathname,
    ) ||
    parsed.method !== 'POST'
  )
    return null;
  const metadata = z
    .object({
      postData: z.string().max(4096),
      headers: z.record(z.string(), z.unknown()).optional(),
    })
    .parse(raw);
  if (
    parsed.url !== owner.api + url.pathname ||
    !metadata.postData ||
    Buffer.byteLength(metadata.postData) > 4096
  )
    throw new Error('INVALID');
  const authorization = Object.entries(metadata.headers ?? {}).filter(
    ([k]) => k.toLowerCase() === 'authorization',
  );
  const token = z
    .string()
    .regex(/^Bearer \S{1,16377}$/u)
    .parse(authorization.length === 1 ? authorization[0]?.[1] : null);
  const body: unknown = JSON.parse(metadata.postData);
  const data = url.pathname.endsWith('content-import')
    ? importSchema.parse(body)
    : z.union([mediaRequestSchema, resolveSchema]).parse(body);
  return canonical([parsed.method, url.pathname, sha256(token.slice(7)), data]);
};
const acquire = (
  owner: Owner,
  key: string,
  side: 'route' | 'cdp',
  id?: string,
) => {
  let attempt = owner.slots.get(key);
  if (!attempt) {
    if (owner.slots.size >= 2000) {
      poison(owner);
      return null;
    }
    attempt = {
      value: emptyMediaTransport(),
      copies: [],
      cdp: null,
      route: false,
      terminal: false,
      retired: false,
    };
    owner.slots.set(key, attempt);
  }
  if (
    (side === 'route' && attempt.route) ||
    (side === 'cdp' && attempt.cdp !== null)
  ) {
    poison(owner, attempt);
    return null;
  }
  if (side === 'route') {
    if (owner.ordinal >= 2000) {
      poison(owner, attempt);
      return null;
    }
    attempt.route = true;
    attempt.value.routeOrdinal = ++owner.ordinal;
  } else {
    attempt.cdp = id ?? null;
    if (id) owner.ids.set(id, attempt);
  }
  if (attempt.route && attempt.cdp && attempt.value.collection !== 'UNKNOWN')
    attempt.value.collection = 'OBSERVED';
  sync(attempt);
  return attempt;
};
const retire = (owner: Owner, attempt: Attempt) => {
  if (
    !attempt.route ||
    !attempt.cdp ||
    !attempt.terminal ||
    !attempt.value.routeClosed
  )
    return;
  attempt.retired = true;
  for (const [key, row] of owner.slots)
    if (row === attempt) owner.slots.delete(key);
  owner.ids.delete(attempt.cdp);
};
export const registerMediaTransport = (
  context: object | undefined,
  page: object,
  active: () => boolean,
  open: () => boolean,
  bad: () => void,
) => {
  const api = context && contexts.get(context);
  if (!api) return;
  const previous = owners.get(page);
  if (previous) {
    poison(previous);
    return;
  }
  owners.set(page, {
    api,
    active,
    open,
    bad,
    slots: new Map(),
    ids: new Map(),
    seen: new Set(),
    ordinal: 0,
    invalid: false,
  });
};
export const mediaTransportAvailable = (page: object) => {
  const owner = owners.get(page);
  return (
    !owner ||
    (!owner.invalid &&
      [...owner.slots.values()].every((a) => a.value.collection === 'OBSERVED'))
  );
};
export const observeMediaCdp = (
  page: object,
  id: string,
  raw: unknown,
): MediaTransport => {
  const value = emptyMediaTransport(),
    owner = owners.get(page);
  if (!owner) return value;
  try {
    if (!owner.active()) return value;
    if (!check(owner)) return value;
    const key = identity(
      owner,
      z.object({ request: z.unknown() }).parse(raw).request,
    );
    if (key === null) return value;
    if (owner.seen.has(id) || owner.seen.size >= 2000) {
      poison(owner, owner.ids.get(id));
      value.collection = 'UNKNOWN';
      return value;
    }
    owner.seen.add(id);
    const attempt = acquire(owner, key, 'cdp', id);
    if (attempt) {
      attempt.copies.push(value);
      sync(attempt);
    } else value.collection = 'UNKNOWN';
  } catch {
    poison(owner);
    value.collection = 'UNKNOWN';
  }
  return value;
};
export const finishMediaCdp = (page: object, id: string) => {
  const owner = owners.get(page),
    attempt = owner?.ids.get(id);
  if (!owner || !attempt) return;
  if (!check(owner, attempt)) return;
  if (attempt.terminal) {
    poison(owner, attempt);
    return;
  }
  attempt.terminal = true;
  retire(owner, attempt);
};
export interface MediaRouteObservation {
  run<T>(
    stage: z.infer<typeof stageSchema>,
    operation: () => Promise<T>,
  ): Promise<T>;
  headers(response: APIResponse): void;
  body(bytes: number, known: boolean): void;
  unknown(): void;
  close(): void;
}
export const observeMediaRoute = (
  request: Request,
): MediaRouteObservation | undefined => {
  let owner: Owner | undefined;
  try {
    owner = owners.get(request.frame().page());
  } catch {
    return;
  }
  if (!owner) return;
  const owned = owner;
  let attempt: Attempt | null;
  try {
    if (!owned.active()) return;
    if (!check(owned)) return;
    const key = identity(owned, {
      url: request.url(),
      method: request.method(),
      postData: request.postData(),
      headers: request.headers(),
    });
    if (key === null) return;
    attempt = acquire(owned, key, 'route');
    if (!attempt) return;
  } catch {
    poison(owned);
    return;
  }
  const row = attempt;
  const event = (
    stage: z.infer<typeof stageSchema>,
    state: 'STARTED' | 'COMPLETED' | 'FAILED',
    error?: unknown,
  ) => {
    try {
      if (!check(owned, row)) return;
      if (row.value.stages.length >= 16) {
        poison(owned, row);
        return;
      }
      if (state === 'FAILED') poison(owned, row);
      const name = error instanceof Error ? error.name : 'OTHER';
      const errorName =
        error === undefined
          ? null
          : [
                'Error',
                'TypeError',
                'RangeError',
                'AbortError',
                'TimeoutError',
              ].includes(name)
            ? (name as 'Error')
            : 'OTHER';
      row.value.stages.push({
        stage,
        state,
        atNodeMs: performance.now(),
        errorName,
      });
      sync(row);
    } catch {
      poison(owned, row);
    }
  };
  return {
    async run(stage, operation) {
      event(stage, 'STARTED');
      try {
        const value = await operation();
        event(stage, 'COMPLETED');
        return value;
      } catch (error) {
        event(stage, 'FAILED', error);
        throw error;
      }
    },
    unknown: () => {
      poison(owned, row);
    },
    headers(response) {
      try {
        if (!check(owned, row)) return;
        Object.assign(row.value, mediaResponseFraming(response));
        sync(row);
      } catch {
        poison(owned, row);
      }
    },
    body(bytes, known) {
      try {
        if (!check(owned, row)) return;
        row.value.rootBodyBytes = count.parse(bytes);
        row.value.schemaOutcome = known ? 'KNOWN' : 'UNKNOWN';
        if (!known) poison(owned, row);
        row.value.lengthComparison =
          row.value.wireLength === null
            ? 'UNOBSERVED'
            : ['NONE', 'IDENTITY'].includes(row.value.encoding)
              ? row.value.wireLength === bytes
                ? 'EQUAL'
                : 'DIFFERENT'
              : 'ENCODED_NOT_COMPARABLE';
        sync(row);
      } catch {
        poison(owned, row);
      }
    },
    close() {
      if (!check(owned, row)) return;
      if (row.value.routeClosed) {
        poison(owned, row);
        return;
      }
      row.value.routeClosed = true;
      sync(row);
      retire(owned, row);
    },
  };
};
