import { performance } from 'node:perf_hooks';
import type { APIResponse, Request } from '@playwright/test';
import {
  emptyImageContext,
  imageAsset,
  imageBlockedReason,
  imageCorsReason,
  imageFailureCode,
  imageResponseHeaders,
  type ImageContext,
} from './functional-image-diagnostics';
const contexts = new WeakSet<object>();
interface Attempt {
  value: ImageContext;
  route: boolean;
  id: string | null;
  terminal: boolean;
  retired: boolean;
}
interface Owner {
  origin: string;
  approved: readonly string[];
  routed: boolean;
  open(): boolean;
  bad(): void;
  slots: Map<string, Attempt>;
  ids: Map<string, Attempt>;
  ordinal: number;
  invalid: boolean;
}
const owners = new WeakMap<object, Owner>();
export const enableImageTransport = (context: object) => {
  contexts.add(context);
};
export const registerImageTransport = (
  context: object,
  page: object,
  origin: string,
  approved: readonly string[],
  open: () => boolean,
  bad: () => void,
) => {
  owners.set(page, {
    origin,
    approved,
    routed: contexts.has(context),
    open,
    bad,
    slots: new Map(),
    ids: new Map(),
    ordinal: 0,
    invalid: false,
  });
};
const poison = (owner: Owner, attempt?: Attempt) => {
  owner.invalid = true;
  if (attempt) attempt.value.collection = 'UNKNOWN';
  try {
    owner.bad();
  } catch {
    /* Never mask the actual operation. */
  }
};
const check = (owner: Owner, row?: Attempt) => {
  try {
    if (owner.open() && !row?.retired) return true;
  } catch {
    /* Unknown lifecycle. */
  }
  poison(owner, row);
  return false;
};
const identity = (
  owner: Owner,
  url: unknown,
  method: unknown,
  type: unknown,
) => {
  if (type !== 'Image' && type !== 'image') return null;
  if (typeof url !== 'string' || url.length > 32768) throw Error();
  const u = new URL(url);
  if (u.origin !== owner.origin) return null;
  if (
    method !== 'GET' ||
    u.username ||
    u.password ||
    u.search ||
    u.hash ||
    url !== owner.origin + u.pathname
  )
    throw Error();
  return url;
};
const retire = (owner: Owner, row: Attempt) => {
  if (!row.terminal || (owner.routed && (!row.route || !row.value.routeClosed)))
    return;
  row.retired = true;
  for (const [key, value] of owner.slots)
    if (value === row) owner.slots.delete(key);
  if (row.id) owner.ids.delete(row.id);
};
const acquire = (
  owner: Owner,
  key: string,
  side: 'route' | 'cdp',
  id?: string,
) => {
  let row = owner.slots.get(key);
  if (!row) {
    if (owner.slots.size >= 2000) {
      poison(owner);
      return null;
    }
    row = {
      value: {
        ...emptyImageContext(),
        ...imageAsset(owner.origin, owner.approved, key),
        resourceType: 'Image',
        method: 'GET',
      },
      route: false,
      id: null,
      terminal: false,
      retired: false,
    };
    owner.slots.set(key, row);
  }
  if (
    (side === 'route' && row.route) ||
    (side === 'cdp' && (row.id !== null || owner.ids.has(id ?? '')))
  ) {
    poison(owner, row);
    return null;
  }
  if (side === 'route') {
    row.route = true;
    row.value.routeOrdinal = ++owner.ordinal;
  } else {
    row.id = id ?? null;
    if (id) owner.ids.set(id, row);
    row.value.requestAtNodeMs = performance.now();
  }
  if (row.route && row.id && row.value.collection !== 'UNKNOWN')
    row.value.collection = 'OBSERVED';
  return row;
};
export const observeImageCdp = (
  page: object,
  id: string,
  raw: unknown,
): ImageContext => {
  const owner = owners.get(page),
    empty = emptyImageContext();
  if (!owner) return empty;
  try {
    if (!check(owner)) return empty;
    const event = raw as {
      type?: unknown;
      request?: { url?: unknown; method?: unknown };
    };
    const key = identity(
      owner,
      event.request?.url,
      event.request?.method,
      event.type,
    );
    if (key === null) return empty;
    if (typeof id !== 'string' || !id || id.length > 180) throw Error();
    return (
      acquire(owner, key, 'cdp', id)?.value ?? {
        ...empty,
        collection: 'UNKNOWN',
      }
    );
  } catch {
    poison(owner);
    return { ...empty, collection: 'UNKNOWN' };
  }
};
export const imageCdpResponse = (page: object, id: string) => {
  const owner = owners.get(page),
    row = owner?.ids.get(id);
  if (owner && !check(owner, row)) return;
  if (owner && row) row.value.responseAtNodeMs = performance.now();
};
export const finishImageCdp = (page: object, id: string, raw?: unknown) => {
  const owner = owners.get(page),
    row = owner?.ids.get(id);
  if (!owner || !check(owner, row) || !row) return;
  if (!check(owner, row) || row.terminal) {
    poison(owner, row);
    return;
  }
  row.terminal = true;
  row.value.terminalAtNodeMs = performance.now();
  if (raw !== undefined) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      poison(owner, row);
      retire(owner, row);
      return;
    }
    const event = raw as {
      errorText?: unknown;
      canceled?: unknown;
      blockedReason?: unknown;
      corsErrorStatus?: unknown;
    };
    row.value.failureCode = imageFailureCode(event.errorText);
    row.value.blockedReason = imageBlockedReason(event.blockedReason);
    const cors = event.corsErrorStatus;
    row.value.corsReason =
      cors === undefined
        ? 'NONE'
        : imageCorsReason(
            cors !== null && typeof cors === 'object' && 'corsError' in cors
              ? cors.corsError
              : null,
          );
    row.value.canceled =
      typeof event.canceled === 'boolean' ? event.canceled : null;
  }
  retire(owner, row);
};
export const imageTransportAvailable = (page: object) => {
  const owner = owners.get(page);
  return (
    !owner ||
    (!owner.invalid &&
      (!owner.routed ||
        [...owner.slots.values()].every(
          (row) => row.value.collection === 'OBSERVED',
        )))
  );
};
export const observeImageRoute = (request: Request) => {
  let owner: Owner | undefined;
  try {
    owner = owners.get(request.frame().page());
  } catch {
    return;
  }
  if (!owner?.routed) return;
  const owned = owner;
  let row: Attempt | null;
  try {
    if (!check(owned)) return;
    const key = identity(
      owned,
      request.url(),
      request.method(),
      request.resourceType(),
    );
    if (key === null) return;
    row = acquire(owned, key, 'route');
    if (!row) return;
  } catch {
    poison(owned);
    return;
  }
  const attempt = row;
  const event = (
    stage: ImageContext['stages'][number]['stage'],
    state: ImageContext['stages'][number]['state'],
  ) => {
    if (!check(owned, attempt)) return;
    if (attempt.value.stages.length >= 20) {
      poison(owned, attempt);
      return;
    }
    attempt.value.stages.push({ stage, state, atNodeMs: performance.now() });
  };
  return {
    async run<T>(
      stage: 'FETCH' | 'PARSE' | 'HOOK' | 'FULFILL' | 'DISPOSE',
      operation: () => Promise<T>,
    ) {
      event(stage, 'STARTED');
      try {
        const value = await operation();
        event(stage, 'COMPLETED');
        return value;
      } catch (error) {
        event(stage, 'FAILED');
        throw error;
      }
    },
    branch(stage: 'ORIGIN_BLOCK' | 'REDIRECT_BLOCK' | 'CATCH_ABORT') {
      event(stage, 'COMPLETED');
    },
    headers(response: APIResponse) {
      try {
        if (check(owned, attempt))
          Object.assign(
            attempt.value,
            imageResponseHeaders(response.headers(), response.status()),
          );
      } catch {
        poison(owned, attempt);
      }
    },
    close() {
      if (!check(owned, attempt)) return;
      if (attempt.value.routeClosed) {
        poison(owned, attempt);
        return;
      }
      const stages = attempt.value.stages;
      if (
        !stages.some((e) => e.stage === 'FETCH') ||
        stages.at(-1)?.state === 'STARTED'
      )
        poison(owned, attempt);
      attempt.value.routeClosed = true;
      retire(owned, attempt);
    },
  };
};
